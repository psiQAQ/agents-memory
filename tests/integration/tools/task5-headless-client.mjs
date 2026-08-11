import { createHash, randomUUID } from 'node:crypto';
import { chmod, link, lstat, mkdir, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { launchClient } from './launch-client.mjs';
import { isMain } from './runtime-lib.mjs';
import { stage1Marker, stage1OperationDigest, stage1OperationHash } from './task5-contract.mjs';

const clients = new Set(['claude', 'opencode', 'pi']);
const mainPath = '/anthropic/v1/messages';
const allowedOperationPaths = new Set([mainPath, '/openai/v1/chat/completions']);

export { stage1Marker };

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function cleanAggregate(value) {
  const sticky = value?.sticky_leaks;
  if (!record(value) || typeof value.epoch !== 'string' || value.epoch.length === 0
    || !Number.isInteger(value.sequence) || value.sequence < 0
    || !Number.isInteger(value.total_requests) || value.total_requests < 0
    || value.dropped_requests !== 0 || value.truncated !== false
    || !record(value.paths) || !record(value.operations) || !record(value.fixtures)
    || !record(sticky) || sticky.credential !== false || sticky.identity !== false || sticky.sentinel !== false) {
    throw new Error('Stage 1 observation failed');
  }
  return value;
}

function pathEntry(value, path) {
  const entry = value.paths[path];
  if (entry === undefined) return { requests: 0, sequences: [] };
  if (!record(entry) || !Number.isInteger(entry.requests) || entry.requests < 0
    || !Array.isArray(entry.sequences) || entry.sequences.length !== entry.requests
    || entry.sequences.some((sequence) => !Number.isInteger(sequence) || sequence < 1)) {
    throw new Error('Stage 1 observation failed');
  }
  return entry;
}

function verifyAggregateDelta(beforeValue, afterValue, operationHash, markerHash) {
  const before = cleanAggregate(beforeValue);
  const after = cleanAggregate(afterValue);
  if (after.epoch !== before.epoch || after.sequence <= before.sequence
    || after.total_requests - before.total_requests !== after.sequence - before.sequence) {
    throw new Error('Stage 1 observation failed');
  }
  const beforeMain = pathEntry(before, mainPath);
  const afterMain = pathEntry(after, mainPath);
  const newMainSequences = afterMain.sequences.slice(beforeMain.sequences.length);
  if (afterMain.requests !== beforeMain.requests + 1
    || beforeMain.sequences.some((sequence, index) => afterMain.sequences[index] !== sequence)
    || newMainSequences.length !== 1 || newMainSequences[0] <= before.sequence || newMainSequences[0] > after.sequence) {
    throw new Error('Stage 1 observation failed');
  }
  const beforeOperations = Object.keys(before.operations);
  const afterOperations = Object.keys(after.operations);
  const added = afterOperations.filter((key) => !Object.hasOwn(before.operations, key));
  if (Object.hasOwn(before.operations, operationHash) || added.length !== 1 || added[0] !== operationHash
    || beforeOperations.some((key) => JSON.stringify(before.operations[key]) !== JSON.stringify(after.operations[key]))) {
    throw new Error('Stage 1 observation failed');
  }
  const operation = after.operations[operationHash];
  if (!record(operation) || !Number.isInteger(operation.requests) || operation.requests < 1 || !record(operation.paths)) {
    throw new Error('Stage 1 observation failed');
  }
  const operationPaths = Object.keys(operation.paths);
  if (!operationPaths.includes(mainPath) || operationPaths.some((path) => !allowedOperationPaths.has(path))) {
    throw new Error('Stage 1 observation failed');
  }
  let requestTotal = 0;
  for (const path of operationPaths) {
    const entry = pathEntry({ paths: operation.paths }, path);
    requestTotal += entry.requests;
  }
  const main = operation.paths[mainPath];
  if (requestTotal !== operation.requests || main.requests !== 1
    || main.sequences.length !== 1 || main.sequences[0] !== newMainSequences[0]
    || !Array.isArray(main.marker_hashes) || !main.marker_hashes.includes(markerHash)) {
    throw new Error('Stage 1 observation failed');
  }
  return main.marker_hashes.length;
}

async function writeClientEvidence(evidenceDir, scenario, owner) {
  const filename = scenario === 'write' ? 'write.json' : `read-${owner}.json`;
  const result = { status: 'ok', scenario, owner: owner ?? null };
  const destination = join(evidenceDir, filename);
  const temporary = join(evidenceDir, `.${filename}.${randomUUID()}.tmp`);
  try {
    await mkdir(evidenceDir, { recursive: true, mode: 0o700 });
    const directory = await lstat(evidenceDir);
    if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error();
    await writeFile(temporary, `${JSON.stringify(result)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await chmod(temporary, 0o600);
    await link(temporary, destination);
    await unlink(temporary);
    await chmod(destination, 0o600);
    return { status: 'ok', scenario };
  } catch {
    await unlink(temporary).catch(() => {});
    throw new Error('Stage 1 client evidence failed');
  }
}

export function headlessInvocation(client, scenario, runId, owner) {
  const operation_digest = stage1OperationDigest(runId, scenario, client, owner);
  const operation = `STAGE1_OP_${operation_digest.toUpperCase()}`;
  const prompt = scenario === 'write'
    ? `${operation} Remember this team fact for later: ${stage1Marker(runId, client)}`
    : `${operation} Recall the shared team fact owned by ${owner}.`;
  const args = client === 'claude'
    ? ['-p', prompt]
    : client === 'opencode'
      ? ['run', '--model', 'memory-anthropic/deepseek-v4-pro', '--format', 'json', '--title', 'Task 5 Stage 1', prompt]
      : ['--model', 'memory-anthropic/deepseek-v4-pro', '-p', prompt];
  return { args, operation_digest };
}

export async function runHeadlessClient({ client, scenario, runId, owner, homeDir, bundleFile, template, spaceId, mockUrl, evidenceDir, launch = launchClient }) {
  const invocation = headlessInvocation(client, scenario, runId, owner);
  if (!/^https?:\/\//.test(mockUrl ?? '') || !isAbsolute(evidenceDir ?? '')) throw new Error('invalid Stage 1 headless arguments');
  const operationHash = stage1OperationHash(runId, scenario, client, owner);
  const aggregate = async () => {
    try {
      const response = await fetch(new URL('/__mock/aggregate', mockUrl), { signal: AbortSignal.timeout(5000) });
      const value = await response.json();
      if (!response.ok || !value || typeof value !== 'object') throw new Error();
      return value;
    } catch { throw new Error('Stage 1 observation failed'); }
  };
  const before = await aggregate();
  cleanAggregate(before);
  if (before.operations[operationHash]) throw new Error('Stage 1 observation failed');
  const marker = stage1Marker(runId, scenario === 'write' ? client : owner);
  const operation = `STAGE1_OP_${invocation.operation_digest.toUpperCase()}`;
  const code = await launch({
    client, homeDir, bundleFile, template, spaceId, args: invocation.args,
    capture: { maxBytes: 256 * 1024, sensitiveValues: [invocation.args.at(-1), marker, operation] },
  });
  if (code !== 0) throw new Error('Stage 1 client failed');
  const after = await aggregate();
  const expectedMarker = createHash('sha256').update(marker).digest('hex');
  verifyAggregateDelta(before, after, operationHash, expectedMarker);
  return writeClientEvidence(evidenceDir, scenario, owner);
}

function parse(argv) {
  if (argv.length === 0 || argv.length % 2 !== 0) throw new Error('invalid Stage 1 headless CLI arguments');
  const allowed = new Set(['--client', '--scenario', '--run-id', '--owner', '--home-dir', '--bundle-file', '--space-id', '--template', '--evidence-dir']);
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(name) || Object.hasOwn(values, name) || (name !== '--owner' && !value)) throw new Error('invalid Stage 1 headless CLI arguments');
    values[name] = value;
  }
  return values;
}

export async function runHeadlessCli(argv, environment = process.env, dependencies = {}) {
  const values = parse(argv);
  const scenario = values['--scenario'] ?? environment.STAGE1_CLIENT_SCENARIO;
  const owner = (values['--owner'] ?? environment.STAGE1_OWNER) || undefined;
  if (!clients.has(values['--client']) || !['write', 'read'].includes(scenario) || !values['--run-id'] || !values['--home-dir'] || !values['--bundle-file'] || !values['--space-id'] || !values['--template'] || !values['--evidence-dir'] || !/^https?:\/\//.test(environment.MOCK_BASE_URL ?? '')) throw new Error('invalid Stage 1 headless CLI arguments');
  const run = dependencies.run ?? runHeadlessClient;
  return run({
    client: values['--client'], scenario, runId: values['--run-id'], owner,
    homeDir: values['--home-dir'], bundleFile: values['--bundle-file'], spaceId: values['--space-id'], template: values['--template'], mockUrl: environment.MOCK_BASE_URL, evidenceDir: values['--evidence-dir'],
  });
}

if (isMain(import.meta)) {
  try {
    const result = await runHeadlessCli(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch {
    process.stderr.write('Stage 1 headless client failed\n');
    process.exitCode = 1;
  }
}
