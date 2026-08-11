import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { createConnection } from 'node:net';
import { isAbsolute, posix } from 'node:path';
import { diagnoseClientLaunch } from './launch-client.mjs';
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
    launch_phase: 'not-run',
    launch_category: 'none',
    output_present: false,
    proxy_dns_ok: false,
    proxy_tcp_ok: false,
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

function cleanBefore(value) {
  return validAggregate(value)
    && value.sequence === 0 && value.total_requests === 0
    && value.dropped_requests === 0 && value.truncated === false
    && Object.keys(value.paths).length === 0
    && Object.keys(value.fixtures).length === 0
    && Object.keys(value.operations).length === 0
    && value.sticky_leaks.credential === false
    && value.sticky_leaks.identity === false
    && value.sticky_leaks.sentinel === false;
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
  if (!validAggregate(after)) return fixedResult(launch);
  const sequenceDelta = after.sequence - before.sequence;
  const totalDelta = after.total_requests - before.total_requests;
  const continuous = after.epoch === before.epoch && sequenceDelta >= 0 && sequenceDelta === totalDelta;
  if (!continuous) return fixedResult({
    ...launch, unsafe: stickyLeak(after), dropped: after.dropped_requests, truncated: after.truncated,
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
    ...launch,
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

function launchFields(value) {
  const categories = new Set(['filesystem', 'settings', 'auth-onboarding', 'transport', 'http4xx', 'http5xx', 'unknown']);
  if (!record(value) || typeof value.outputPresent !== 'boolean') throw new Error();
  if (value.phase === 'cli-zero' && value.category === 'none') return {
    launch: 'code0', launch_phase: value.phase, launch_category: value.category, output_present: value.outputPresent,
  };
  if (value.phase === 'cli-nonzero' && categories.has(value.category)) return {
    launch: 'nonzero', launch_phase: value.phase, launch_category: value.category, output_present: value.outputPresent,
  };
  if (['spawn-failure', 'signal', 'timeout', 'overflow', 'sensitive-output'].includes(value.phase) && value.category === 'none') return {
    launch: 'throw', launch_phase: value.phase, launch_category: value.category, output_present: value.outputPresent,
  };
  throw new Error();
}

function setupErrorFields() {
  return { launch: 'throw', launch_phase: 'setup-error', launch_category: 'none', output_present: false };
}

async function withTimeout(promise, dependencies) {
  const setTimer = dependencies.setTimer ?? setTimeout;
  const clearTimer = dependencies.clearTimer ?? clearTimeout;
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve, reject) => { timer = setTimer(() => reject(new Error()), 5000); }),
    ]);
  } finally {
    if (timer !== undefined) clearTimer(timer);
  }
}

async function probeMemoryProxy(dependencies) {
  const lookupHost = dependencies.lookup ?? lookup;
  const connect = dependencies.connect ?? createConnection;
  let address;
  try {
    address = await withTimeout(Promise.resolve().then(() => lookupHost('memory-proxy')), dependencies);
  } catch {
    return { dnsOk: false, tcpOk: false };
  }
  const tcpOk = await new Promise((resolve) => {
    const setTimer = dependencies.setTimer ?? setTimeout;
    const clearTimer = dependencies.clearTimer ?? clearTimeout;
    let socket;
    let timer;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimer(timer);
      try { socket?.destroy(); } catch {}
      resolve(value);
    };
    try {
      socket = connect({ host: address.address, family: address.family, port: 8096 });
      socket.once('connect', () => finish(true));
      socket.once('error', () => finish(false));
      timer = setTimer(() => finish(false), 5000);
    } catch {
      finish(false);
    }
  });
  return { dnsOk: true, tcpOk };
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
  const spaceId = values['--space-id'];
  if (values['--client'] !== 'claude' || environment.STAGE1_CLIENT_SCENARIO !== 'write'
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(values['--run-id'])
    || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(spaceId) || spaceId.includes('..')
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
  const launch = dependencies.launch ?? diagnoseClientLaunch;
  let before;
  try {
    before = await aggregate();
  } catch {
    return fixedResult();
  }
  if (!cleanBefore(before)) return validAggregate(before)
    ? fixedResult({ unsafe: stickyLeak(before), dropped: before.dropped_requests, truncated: before.truncated })
    : fixedResult();

  let proxyDnsOk = false;
  let proxyTcpOk = false;
  try {
    const probe = dependencies.probe ? await dependencies.probe() : await probeMemoryProxy(dependencies);
    proxyDnsOk = probe?.dnsOk === true;
    proxyTcpOk = proxyDnsOk && probe?.tcpOk === true;
  } catch {}
  const proxy = { proxy_dns_ok: proxyDnsOk, proxy_tcp_ok: proxyTcpOk };

  const invocation = headlessInvocation('claude', 'write', runId);
  const marker = stage1Marker(runId, 'claude');
  const expectedMarkerHash = createHash('sha256').update(marker).digest('hex');
  const operation = `STAGE1_OP_${invocation.operation_digest.toUpperCase()}`;
  let launchStatus;
  try {
    launchStatus = launchFields(await launch({
      client: 'claude',
      homeDir: values['--home-dir'],
      bundleFile: values['--bundle-file'],
      spaceId: values['--space-id'],
      template: values['--template'],
      args: invocation.args,
      capture: { maxBytes: 256 * 1024, sensitiveValues: [invocation.args.at(-1), marker, operation] },
    }));
  } catch {
    launchStatus = setupErrorFields();
  }

  try {
    return classify(before, await aggregate(), { ...launchStatus, ...proxy }, expectedHash, expectedMarkerHash);
  } catch {
    return fixedResult({ ...launchStatus, ...proxy });
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
