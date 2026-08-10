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
  const code = await launch({ client, homeDir, bundleFile, template, spaceId, args: invocation.args });
  if (code !== 0) throw new Error('Stage 1 client failed');
  let aggregate;
  try {
    const response = await fetch(new URL('/__mock/aggregate', mockUrl), { signal: AbortSignal.timeout(5000) });
    aggregate = await response.json();
    if (!response.ok) throw new Error();
  } catch { throw new Error('Stage 1 observation failed'); }
  const operation = aggregate?.operations?.[stage1OperationHash(runId, scenario, client, owner)];
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
  if (!clients.has(values['--client']) || !['write', 'read'].includes(values['--scenario']) || !values['--run-id'] || !values['--home-dir'] || !values['--bundle-file'] || !values['--space-id'] || !values['--template'] || !/^https?:\/\//.test(environment.MOCK_BASE_URL ?? '')) throw new Error('invalid Stage 1 headless CLI arguments');
  const owner = values['--owner'] || undefined;
  const run = dependencies.run ?? runHeadlessClient;
  return run({
    client: values['--client'], scenario: values['--scenario'], runId: values['--run-id'], owner,
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
