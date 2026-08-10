import { createHash } from 'node:crypto';
import { launchClient } from './launch-client.mjs';
import { isMain } from './runtime-lib.mjs';
import { stage1Marker, stage1OperationDigest, stage1OperationHash } from './task5-contract.mjs';

const clients = new Set(['claude', 'opencode', 'pi']);

export { stage1Marker };

export function headlessInvocation(client, scenario, runId, owner) {
  const operation_digest = stage1OperationDigest(runId, scenario, client, owner);
  const operation = `STAGE1_OP_${operation_digest.toUpperCase()}`;
  const prompt = scenario === 'write'
    ? `${operation} Remember this team fact for later: ${stage1Marker(runId, client)}`
    : `${operation} Recall the shared team fact owned by ${owner}.`;
  const args = client === 'claude'
    ? ['-p', prompt]
    : client === 'opencode'
      ? ['run', '--model', 'memory-anthropic/deepseek-v4-pro', '--format', 'json', prompt]
      : ['--model', 'memory-anthropic/deepseek-v4-pro', '-p', prompt];
  return { args, operation_digest };
}

export async function runHeadlessClient({ client, scenario, runId, owner, homeDir, bundleFile, template, spaceId, mockUrl, launch = launchClient }) {
  const invocation = headlessInvocation(client, scenario, runId, owner);
  if (!/^https?:\/\//.test(mockUrl ?? '')) throw new Error('invalid Stage 1 headless arguments');
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
  if (before?.operations?.[operationHash]) throw new Error('Stage 1 observation failed');
  const code = await launch({ client, homeDir, bundleFile, template, spaceId, args: invocation.args });
  if (code !== 0) throw new Error('Stage 1 client failed');
  const after = await aggregate();
  const operation = after?.operations?.[operationHash];
  const expectedMarker = createHash('sha256').update(stage1Marker(runId, scenario === 'write' ? client : owner)).digest('hex');
  if (!operation || !Number.isInteger(operation.requests) || operation.requests < 1 || !Array.isArray(operation.marker_hashes) || !operation.marker_hashes.includes(expectedMarker)) throw new Error('Stage 1 observation failed');
  return { status: 'ok', scenario, observed_marker_count: operation.marker_hashes.length };
}

function parse(argv) {
  if (argv.length === 0 || argv.length % 2 !== 0) throw new Error('invalid Stage 1 headless CLI arguments');
  const allowed = new Set(['--client', '--scenario', '--run-id', '--owner', '--home-dir', '--bundle-file', '--space-id', '--template']);
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
  if (!clients.has(values['--client']) || !['write', 'read'].includes(scenario) || !values['--run-id'] || !values['--home-dir'] || !values['--bundle-file'] || !values['--space-id'] || !values['--template'] || !/^https?:\/\//.test(environment.MOCK_BASE_URL ?? '')) throw new Error('invalid Stage 1 headless CLI arguments');
  const run = dependencies.run ?? runHeadlessClient;
  return run({
    client: values['--client'], scenario, runId: values['--run-id'], owner,
    homeDir: values['--home-dir'], bundleFile: values['--bundle-file'], spaceId: values['--space-id'], template: values['--template'], mockUrl: environment.MOCK_BASE_URL,
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
