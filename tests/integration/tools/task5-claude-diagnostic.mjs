import { createHash } from 'node:crypto';
import { isAbsolute, posix } from 'node:path';
import { launchClient } from './launch-client.mjs';
import { isMain } from './runtime-lib.mjs';
import { headlessInvocation, stage1Marker } from './task5-headless-client.mjs';
import { stage1OperationHash } from './task5-contract.mjs';

const mainPath = '/anthropic/v1/messages';
const allowedPaths = new Set([mainPath, '/openai/v1/chat/completions']);
const optionNames = new Set([
  '--client', '--run-id', '--home-dir', '--bundle-file', '--space-id', '--template', '--evidence-dir',
]);

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fixedResult(overrides = {}) {
  return {
    status: 'classified',
    launch: 'not_run',
    continuity: 'failed',
    sequence_delta: -1,
    total_delta: -1,
    expected_operation_present: false,
    expected_operation_valid: false,
    expected_main_count: 0,
    unexpected_operation_count: 0,
    unexpected_path_count: 0,
    unsafe: false,
    dropped: 0,
    truncated: false,
    ...overrides,
  };
}

function validPathEntry(entry) {
  return record(entry)
    && Number.isInteger(entry.requests) && entry.requests >= 0
    && Array.isArray(entry.sequences) && entry.sequences.length === entry.requests
    && entry.sequences.every((sequence) => Number.isInteger(sequence) && sequence > 0)
    && (entry.marker_hashes === undefined || Array.isArray(entry.marker_hashes));
}

function validPaths(paths) {
  return record(paths) && Object.values(paths).every(validPathEntry);
}

function validAggregate(value) {
  return record(value)
    && typeof value.epoch === 'string' && value.epoch.length > 0
    && Number.isInteger(value.sequence) && value.sequence >= 0
    && Number.isInteger(value.total_requests) && value.total_requests >= 0
    && Number.isInteger(value.dropped_requests) && value.dropped_requests >= 0
    && typeof value.truncated === 'boolean'
    && validPaths(value.paths) && record(value.fixtures) && record(value.operations)
    && Object.values(value.operations).every((operation) => record(operation)
      && Number.isInteger(operation.requests) && operation.requests >= 0
      && validPaths(operation.paths))
    && record(value.sticky_leaks)
    && ['credential', 'identity', 'sentinel'].every((name) => typeof value.sticky_leaks[name] === 'boolean');
}

function cleanBefore(value, expectedHash) {
  return validAggregate(value)
    && value.dropped_requests === 0 && value.truncated === false
    && value.sticky_leaks.credential === false
    && value.sticky_leaks.identity === false
    && value.sticky_leaks.sentinel === false
    && !Object.hasOwn(value.operations, expectedHash);
}

function preservedBaseline(before, after) {
  for (const [name, operation] of Object.entries(before.operations)) {
    if (!Object.hasOwn(after.operations, name)
      || JSON.stringify(after.operations[name]) !== JSON.stringify(operation)) return false;
  }
  for (const [path, entry] of Object.entries(before.paths)) {
    const next = after.paths[path];
    if (!validPathEntry(next) || next.requests < entry.requests
      || entry.sequences.some((sequence, index) => next.sequences[index] !== sequence)) return false;
  }
  return true;
}

function expectedOperationValid(operation, totalDelta, expectedMarkerHash) {
  if (!record(operation) || !Number.isInteger(operation.requests) || operation.requests < 1 || !validPaths(operation.paths)) return false;
  const paths = Object.keys(operation.paths);
  const main = operation.paths[mainPath];
  const requestTotal = paths.reduce((total, path) => total + operation.paths[path].requests, 0);
  return paths.includes(mainPath)
    && paths.every((path) => allowedPaths.has(path))
    && requestTotal === operation.requests
    && main.requests === 1
    && Array.isArray(main.marker_hashes) && main.marker_hashes.includes(expectedMarkerHash)
    && operation.requests === totalDelta;
}

function stickyLeak(value) {
  return value.sticky_leaks.credential || value.sticky_leaks.identity || value.sticky_leaks.sentinel;
}

function classify(before, after, launch, expectedHash, expectedMarkerHash) {
  if (!validAggregate(after)) return fixedResult({ launch });
  const sequenceDelta = after.sequence - before.sequence;
  const totalDelta = after.total_requests - before.total_requests;
  const continuous = after.epoch === before.epoch && sequenceDelta >= 0 && sequenceDelta === totalDelta
    && preservedBaseline(before, after);
  if (!continuous) return fixedResult({
    launch, unsafe: stickyLeak(after), dropped: after.dropped_requests, truncated: after.truncated,
  });

  const expectedPresent = Object.hasOwn(after.operations, expectedHash);
  const expected = expectedPresent ? after.operations[expectedHash] : undefined;
  const expectedMainCount = validPathEntry(expected?.paths?.[mainPath]) ? expected.paths[mainPath].requests : 0;
  const addedOperations = Object.keys(after.operations).filter((name) => !Object.hasOwn(before.operations, name));
  const unexpectedOperationCount = addedOperations.filter((name) => name !== expectedHash).length;
  const unexpectedPathCount = Object.keys(after.paths).filter((path) => !allowedPaths.has(path)).length;
  const sticky = stickyLeak(after);
  const expectedValid = expectedPresent && expectedOperationValid(expected, totalDelta, expectedMarkerHash);
  const globalRequestDelta = Object.entries(after.paths).reduce((total, [path, entry]) => {
    const previous = before.paths[path]?.requests ?? 0;
    return total + entry.requests - previous;
  }, 0);

  return fixedResult({
    launch,
    continuity: 'ok',
    sequence_delta: sequenceDelta,
    total_delta: totalDelta,
    expected_operation_present: expectedPresent,
    expected_operation_valid: expectedValid && globalRequestDelta === totalDelta,
    expected_main_count: expectedMainCount,
    unexpected_operation_count: unexpectedOperationCount,
    unexpected_path_count: unexpectedPathCount,
    unsafe: sticky,
    dropped: after.dropped_requests,
    truncated: after.truncated,
  });
}

function parse(argv, environment) {
  if (!Array.isArray(argv) || argv.length !== optionNames.size * 2) throw new Error('invalid diagnostic arguments');
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!optionNames.has(name) || Object.hasOwn(values, name) || typeof value !== 'string' || value.length === 0) {
      throw new Error('invalid diagnostic arguments');
    }
    values[name] = value;
  }
  const homeDir = values['--home-dir'];
  if (values['--client'] !== 'claude' || environment.STAGE1_CLIENT_SCENARIO !== 'write'
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(values['--run-id'])
    || homeDir !== '/home/agent' || values['--bundle-file'] !== posix.join(homeDir, '.memory', 'agent-bundle.json')
    || values['--template'] !== '/opt/memory-client/settings.template.json'
    || values['--evidence-dir'] !== '/client-evidence'
    || !isAbsolute(homeDir) || !isAbsolute(values['--template']) || !isAbsolute(values['--evidence-dir'])
    || !/^https?:\/\//.test(environment.MOCK_BASE_URL ?? '')) throw new Error('invalid diagnostic arguments');
  return values;
}

async function fetchAggregate(mockUrl) {
  try {
    const response = await fetch(new URL('/__mock/aggregate', mockUrl), { signal: AbortSignal.timeout(5000) });
    const value = await response.json();
    if (!response.ok) throw new Error();
    return value;
  } catch {
    throw new Error('diagnostic observation failed');
  }
}

export async function runClaudeDiagnostic(argv, environment = process.env, dependencies = {}) {
  const values = parse(argv, environment);
  const runId = values['--run-id'];
  const expectedHash = stage1OperationHash(runId, 'write', 'claude');
  const aggregate = dependencies.aggregate ?? (() => fetchAggregate(environment.MOCK_BASE_URL));
  const launch = dependencies.launch ?? launchClient;
  let before;
  try {
    before = await aggregate();
  } catch {
    return fixedResult();
  }
  if (!cleanBefore(before, expectedHash)) return validAggregate(before)
    ? fixedResult({ unsafe: stickyLeak(before), dropped: before.dropped_requests, truncated: before.truncated })
    : fixedResult();

  const invocation = headlessInvocation('claude', 'write', runId);
  const marker = stage1Marker(runId, 'claude');
  const expectedMarkerHash = createHash('sha256').update(marker).digest('hex');
  const operation = `STAGE1_OP_${invocation.operation_digest.toUpperCase()}`;
  let launchStatus;
  try {
    const code = await launch({
      client: 'claude',
      homeDir: values['--home-dir'],
      bundleFile: values['--bundle-file'],
      spaceId: values['--space-id'],
      template: values['--template'],
      args: invocation.args,
      capture: { maxBytes: 256 * 1024, sensitiveValues: [invocation.args.at(-1), marker, operation] },
    });
    launchStatus = code === 0 ? 'code0' : 'nonzero';
  } catch {
    launchStatus = 'throw';
  }

  try {
    return classify(before, await aggregate(), launchStatus, expectedHash, expectedMarkerHash);
  } catch {
    return fixedResult({ launch: launchStatus });
  }
}

if (isMain(import.meta)) {
  try {
    process.stdout.write(`${JSON.stringify(await runClaudeDiagnostic(process.argv.slice(2)))}\n`);
  } catch {
    process.stdout.write(`${JSON.stringify(fixedResult())}\n`);
    process.exitCode = 1;
  }
}
