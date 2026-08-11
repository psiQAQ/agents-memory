import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { stage1Marker } from '../tools/task5-headless-client.mjs';
import { stage1OperationHash } from '../tools/task5-contract.mjs';
import { runClaudeDiagnostic } from '../tools/task5-claude-diagnostic.mjs';

const integrationRoot = join(import.meta.dirname, '..');
const diagnosticTool = join(integrationRoot, 'tools', 'task5-claude-diagnostic.mjs');
const runId = 'task5-diagnostic';
const operationHash = stage1OperationHash(runId, 'write', 'claude');
const markerHash = createHash('sha256').update(stage1Marker(runId, 'claude')).digest('hex');
const epoch = '00000000-0000-4000-8000-000000000001';
const args = [
  '--client', 'claude', '--run-id', runId,
  '--home-dir', '/home/agent', '--bundle-file', '/home/agent/.memory/agent-bundle.json',
  '--space-id', 'default', '--template', '/opt/memory-client/settings.template.json',
  '--evidence-dir', '/client-evidence',
];
const environment = { MOCK_BASE_URL: 'http://mock-llm:8080', STAGE1_CLIENT_SCENARIO: 'write' };

function aggregate({ sequence = 0, total = 0, paths = {}, fixtures = {}, operations = {}, dropped = 0, truncated = false, sticky = {} } = {}) {
  return {
    epoch, sequence, total_requests: total, dropped_requests: dropped, truncated,
    paths, fixtures, operations,
    sticky_leaks: { credential: false, identity: false, sentinel: false, ...sticky },
  };
}

function operation(sequence = 1, requests = 1, paths = { '/anthropic/v1/messages': { requests: 1, sequences: [sequence], marker_hashes: [markerHash] } }) {
  return { requests, paths };
}

function launchResult(phase, category = 'none', outputPresent = false) {
  return { phase, category, outputPresent };
}

function harness(before, after, launchOutcome, probeOutcome = { dnsOk: true, tcpOk: true }) {
  let reads = 0;
  const launches = [];
  let probes = 0;
  return {
    launches,
    get probes() { return probes; },
    dependencies: {
      aggregate: async () => {
        const value = reads++ === 0 ? before : after;
        if (value instanceof Error) throw value;
        return value;
      },
      launch: async (options) => {
        launches.push(options);
        if (launchOutcome instanceof Error) throw launchOutcome;
        return launchOutcome;
      },
      probe: async () => {
        probes += 1;
        if (probeOutcome instanceof Error) throw probeOutcome;
        return probeOutcome;
      },
    },
  };
}

const fixedKeys = [
  'status', 'launch', 'launch_phase', 'launch_category', 'output_present',
  'proxy_dns_ok', 'proxy_tcp_ok', 'continuity', 'sequence_delta', 'total_delta',
  'expected_operation_present', 'expected_operation_valid', 'expected_main_count',
  'unexpected_operation_count', 'unexpected_path_count', 'unsafe', 'dropped', 'truncated',
].sort();

test('Claude diagnostic classifies structured launch outcomes with one connectivity probe and at most one launch', async (context) => {
  const before = aggregate();
  const validAfter = aggregate({
    sequence: 1, total: 1,
    paths: { '/anthropic/v1/messages': { requests: 1, sequences: [1] } },
    operations: { [operationHash]: operation() },
  });
  for (const [name, outcome, expectedLaunch, expectedPhase, expectedCategory, outputPresent, after] of [
    ['code0', launchResult('cli-zero'), 'code0', 'cli-zero', 'none', false, validAfter],
    ['nonzero', launchResult('cli-nonzero', 'filesystem', true), 'nonzero', 'cli-nonzero', 'filesystem', true, before],
    ['spawn-failure', launchResult('spawn-failure'), 'throw', 'spawn-failure', 'none', false, before],
    ['setup-error', new Error('MEMORY_LEAK_SENTINEL_MUST_NOT_APPEAR'), 'throw', 'setup-error', 'none', false, before],
  ]) await context.test(name, async () => {
    const value = harness(before, after, outcome);
    const result = await runClaudeDiagnostic(args, environment, value.dependencies);
    assert.deepEqual(Object.keys(result).sort(), fixedKeys);
    assert.equal(result.status, 'classified');
    assert.equal(result.launch, expectedLaunch);
    assert.equal(result.launch_phase, expectedPhase);
    assert.equal(result.launch_category, expectedCategory);
    assert.equal(result.output_present, outputPresent);
    assert.equal(result.proxy_dns_ok, true);
    assert.equal(result.proxy_tcp_ok, true);
    assert.equal(result.continuity, 'ok');
    assert.equal(result.sequence_delta, expectedLaunch === 'code0' ? 1 : 0);
    assert.equal(result.total_delta, expectedLaunch === 'code0' ? 1 : 0);
    assert.equal(result.expected_operation_present, expectedLaunch === 'code0');
    assert.equal(result.expected_operation_valid, expectedLaunch === 'code0');
    assert.equal(result.expected_main_count, expectedLaunch === 'code0' ? 1 : 0);
    assert.equal(result.unexpected_operation_count, 0);
    assert.equal(result.unexpected_path_count, 0);
    assert.equal(result.unsafe, false);
    assert.equal(result.dropped, 0);
    assert.equal(result.truncated, false);
    assert.equal(value.launches.length, 1);
    assert.equal(value.probes, 1);
    assert.equal(value.launches[0].client, 'claude');
    assert.equal(value.launches[0].capture.maxBytes, 256 * 1024);
    assert.equal(value.launches[0].capture.sensitiveValues.length, 3);
    assert.doesNotMatch(JSON.stringify(result), /MEMORY_|STAGE1_|sentinel|prompt|identity|key|epoch|hash|path\//i);
  });
});

test('Claude diagnostic probes memory-proxy DNS and TCP once with fixed bounds and only returns booleans', async () => {
  const before = aggregate();
  const socket = new EventEmitter();
  let lookupCalls = 0;
  let connectCalls = 0;
  let destroys = 0;
  const delays = [];
  const order = [];
  socket.destroy = () => { destroys += 1; };
  const dependencies = {
    aggregate: async () => before,
    launch: async () => { order.push('launch'); return launchResult('cli-nonzero', 'unknown'); },
    lookup: async (hostname) => {
      order.push('dns');
      lookupCalls += 1;
      assert.equal(hostname, 'memory-proxy');
      return { address: '127.0.0.1', family: 4 };
    },
    connect: (options) => {
      order.push('tcp');
      connectCalls += 1;
      assert.deepEqual(options, { host: '127.0.0.1', family: 4, port: 8096 });
      process.nextTick(() => socket.emit('connect'));
      return socket;
    },
    setTimer: (callback, delay) => { delays.push(delay); return callback; },
    clearTimer: () => {},
  };
  const result = await runClaudeDiagnostic(args, environment, dependencies);
  assert.equal(lookupCalls, 1);
  assert.equal(connectCalls, 1);
  assert.deepEqual(order, ['dns', 'tcp', 'launch']);
  assert.deepEqual(delays, [5000, 5000]);
  assert.equal(destroys, 1);
  assert.equal(result.proxy_dns_ok, true);
  assert.equal(result.proxy_tcp_ok, true);
  assert.doesNotMatch(JSON.stringify(result), /127\.0\.0\.1|memory-proxy|8096|error|key/i);

  let failedConnectCalls = 0;
  const failed = await runClaudeDiagnostic(args, environment, {
    aggregate: async () => before,
    launch: async () => launchResult('cli-nonzero', 'unknown'),
    lookup: async () => { throw new Error('RAW_DNS_ERROR'); },
    connect: () => { failedConnectCalls += 1; throw new Error('must not connect'); },
    setTimer: (callback) => callback,
    clearTimer: () => {},
  });
  assert.equal(failedConnectCalls, 0);
  assert.equal(failed.proxy_dns_ok, false);
  assert.equal(failed.proxy_tcp_ok, false);
  assert.doesNotMatch(JSON.stringify(failed), /RAW_DNS_ERROR|must not connect/i);
});

test('Claude diagnostic bounds pending DNS and classifies TCP error, timeout, and connect throws without details', async (context) => {
  const before = aggregate();
  const base = {
    aggregate: async () => before,
    launch: async () => launchResult('cli-nonzero', 'unknown'),
  };
  await context.test('dns-timeout', async () => {
    const timers = [];
    let lookups = 0;
    let connects = 0;
    const promise = runClaudeDiagnostic(args, environment, {
      ...base,
      lookup: async () => { lookups += 1; return await new Promise(() => {}); },
      connect: () => { connects += 1; throw new Error('must not connect'); },
      setTimer: (callback, delay) => { const token = { callback, delay, cleared: false }; timers.push(token); return token; },
      clearTimer: (token) => { token.cleared = true; },
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(timers.length, 1);
    assert.equal(timers[0].delay, 5000);
    timers[0].callback();
    const result = await promise;
    assert.equal(lookups, 1);
    assert.equal(connects, 0);
    assert.equal(timers[0].cleared, true);
    assert.equal(result.proxy_dns_ok, false);
    assert.equal(result.proxy_tcp_ok, false);
  });

  for (const mode of ['error', 'timeout', 'throw']) await context.test(`tcp-${mode}`, async () => {
    const timers = [];
    const socket = new EventEmitter();
    let lookups = 0;
    let connects = 0;
    let destroys = 0;
    socket.destroy = () => { destroys += 1; };
    const dependencies = {
      ...base,
      lookup: async () => { lookups += 1; return { address: '127.0.0.1', family: 4 }; },
      connect: () => {
        connects += 1;
        if (mode === 'throw') throw new Error('RAW_CONNECT_THROW');
        if (mode === 'error') process.nextTick(() => socket.emit('error', new Error('RAW_TCP_ERROR')));
        return socket;
      },
      setTimer: (callback, delay) => { const token = { callback, delay, cleared: false }; timers.push(token); return token; },
      clearTimer: (token) => { token.cleared = true; },
    };
    const promise = runClaudeDiagnostic(args, environment, dependencies);
    if (mode === 'timeout') {
      for (let attempt = 0; timers.length < 2 && attempt < 10; attempt += 1) await new Promise((resolve) => setImmediate(resolve));
      assert.equal(timers.length, 2);
      timers[1].callback();
    }
    const result = await promise;
    assert.equal(lookups, 1);
    assert.equal(connects, 1);
    assert.equal(destroys, mode === 'throw' ? 0 : 1);
    assert.equal(result.proxy_dns_ok, true);
    assert.equal(result.proxy_tcp_ok, false);
    assert.equal(timers.every(({ delay }) => delay === 5000), true);
    socket.emit('connect');
    assert.equal(destroys, mode === 'throw' ? 0 : 1);
    assert.doesNotMatch(JSON.stringify(result), /127\.0\.0\.1|RAW_|connect throw|tcp error/i);
  });
});

test('Claude diagnostic classifies invalid expected operations and unexpected requests without details', async () => {
  const before = aggregate();
  const extraHash = stage1OperationHash(runId, 'write', 'pi');
  const missingMarkerAfter = aggregate({
    sequence: 1, total: 1,
    paths: { '/anthropic/v1/messages': { requests: 1, sequences: [1] } },
    operations: { [operationHash]: operation(1, 1, { '/anthropic/v1/messages': { requests: 1, sequences: [1], marker_hashes: [] } }) },
  });
  const missingMarkerHarness = harness(before, missingMarkerAfter, launchResult('cli-zero'));
  const missingMarker = await runClaudeDiagnostic(args, environment, missingMarkerHarness.dependencies);
  assert.equal(missingMarker.expected_operation_present, true);
  assert.equal(missingMarker.expected_operation_valid, false);

  const invalidExpected = aggregate({
    sequence: 2, total: 2,
    paths: { '/anthropic/v1/messages': { requests: 2, sequences: [1, 2] } },
    operations: { [operationHash]: operation(1, 2, { '/anthropic/v1/messages': { requests: 2, sequences: [1, 2], marker_hashes: [] } }) },
  });
  const invalidHarness = harness(before, invalidExpected, launchResult('cli-zero'));
  const invalid = await runClaudeDiagnostic(args, environment, invalidHarness.dependencies);
  assert.equal(invalid.expected_operation_present, true);
  assert.equal(invalid.expected_operation_valid, false);
  assert.equal(invalid.expected_main_count, 2);
  assert.equal(invalid.unexpected_operation_count, 0);
  assert.equal(invalid.unexpected_path_count, 0);
  assert.equal(invalid.unsafe, false);

  const unexpectedAfter = aggregate({
    sequence: 2, total: 2,
    paths: {
      '/anthropic/v1/messages': { requests: 1, sequences: [1] },
      '/unexpected': { requests: 1, sequences: [2] },
    },
    operations: {
      [operationHash]: operation(),
      [extraHash]: operation(2, 1, { '/unexpected': { requests: 1, sequences: [2], marker_hashes: [] } }),
    },
  });
  const unexpectedHarness = harness(before, unexpectedAfter, launchResult('cli-zero'));
  const unexpected = await runClaudeDiagnostic(args, environment, unexpectedHarness.dependencies);
  assert.equal(unexpected.expected_operation_present, true);
  assert.equal(unexpected.expected_operation_valid, false);
  assert.equal(unexpected.expected_main_count, 1);
  assert.equal(unexpected.unexpected_operation_count, 1);
  assert.equal(unexpected.unexpected_path_count, 1);
  assert.equal(unexpected.unsafe, false);
  assert.equal(unexpectedHarness.launches.length, 1);
});

test('Claude diagnostic reports sticky, dropped, truncated, and aggregate failures without launching twice', async () => {
  const before = aggregate();
  const unsafeAfter = aggregate({
    sequence: 1, total: 1, dropped: 1, truncated: true,
    sticky: { credential: true },
    paths: { '/anthropic/v1/messages': { requests: 1, sequences: [1] } },
    operations: { [operationHash]: operation() },
  });
  const unsafeHarness = harness(before, unsafeAfter, launchResult('cli-zero'));
  const unsafe = await runClaudeDiagnostic(args, environment, unsafeHarness.dependencies);
  assert.equal(unsafe.continuity, 'ok');
  assert.equal(unsafe.unsafe, true);
  assert.equal(unsafe.dropped, 1);
  assert.equal(unsafe.truncated, true);
  assert.equal(unsafeHarness.launches.length, 1);

  const beforeFailure = harness(new Error('before raw error'), aggregate(), launchResult('cli-zero'));
  const notRun = await runClaudeDiagnostic(args, environment, beforeFailure.dependencies);
  assert.equal(notRun.launch, 'not_run');
  assert.equal(notRun.continuity, 'failed');
  assert.equal(notRun.sequence_delta, -1);
  assert.equal(notRun.total_delta, -1);
  assert.equal(notRun.expected_operation_valid, false);
  assert.equal(notRun.unsafe, false);
  assert.equal(beforeFailure.launches.length, 0);

  const afterFailure = harness(before, new Error('after raw error'), launchResult('cli-zero'));
  const failed = await runClaudeDiagnostic(args, environment, afterFailure.dependencies);
  assert.equal(failed.launch, 'code0');
  assert.equal(failed.continuity, 'failed');
  assert.equal(failed.sequence_delta, -1);
  assert.equal(failed.total_delta, -1);
  assert.equal(failed.expected_operation_valid, false);
  assert.equal(failed.unsafe, false);
  assert.equal(afterFailure.launches.length, 1);
  assert.doesNotMatch(JSON.stringify([notRun, failed]), /raw error/);
});

test('Claude diagnostic does not launch from any preexisting aggregate state', async (context) => {
  const baselineHash = stage1OperationHash(runId, 'write', 'pi');
  for (const [name, baseline, expectedUnsafe = false, expectedDropped = 0, expectedTruncated = false] of [
    ['sequence', aggregate({ sequence: 1 })],
    ['total', aggregate({ total: 1 })],
    ['paths', aggregate({ paths: { '/anthropic/v1/messages': { requests: 1, sequences: [1] } } })],
    ['fixtures', aggregate({ fixtures: { text: 1 } })],
    ['operations', aggregate({ operations: { [baselineHash]: operation(1) } })],
    ['dropped', aggregate({ dropped: 1 }), false, 1],
    ['truncated', aggregate({ truncated: true }), false, 0, true],
    ['sticky', aggregate({ sticky: { credential: true } }), true],
  ]) await context.test(name, async () => {
    const baselineHarness = harness(baseline, aggregate(), launchResult('cli-zero'));
    const result = await runClaudeDiagnostic(args, environment, baselineHarness.dependencies);
    assert.equal(result.launch, 'not_run');
    assert.equal(result.continuity, 'failed');
    assert.equal(result.sequence_delta, -1);
    assert.equal(result.total_delta, -1);
    assert.equal(result.expected_operation_present, false);
    assert.equal(result.expected_operation_valid, false);
    assert.equal(result.unsafe, expectedUnsafe);
    assert.equal(result.dropped, expectedDropped);
    assert.equal(result.truncated, expectedTruncated);
    assert.equal(baselineHarness.launches.length, 0);
  });
});

test('Claude diagnostic rejects ambient command arguments and CLI emits one fixed JSON line', async () => {
  await assert.rejects(runClaudeDiagnostic(['--command', 'sh'], environment, {}), /invalid diagnostic arguments/);
  const changedHome = [...args];
  changedHome[changedHome.indexOf('--home-dir') + 1] = '/tmp/agent';
  await assert.rejects(runClaudeDiagnostic(changedHome, environment, {}), /invalid diagnostic arguments/);
  const result = spawnSync(process.execPath, [diagnosticTool, '--command', 'MEMORY_LEAK_SENTINEL_OUTPUT'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.split('\n').filter(Boolean).length, 1);
  const value = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(value).sort(), fixedKeys);
  assert.equal(value.status, 'classified');
  assert.equal(value.launch, 'not_run');
  assert.equal(value.continuity, 'failed');
  assert.doesNotMatch(result.stdout, /MEMORY_|sentinel|command|error/i);
});

test('Claude diagnostic rejects invalid space identifiers before observation or launch', async () => {
  const invalidSpace = 'team..MEMORY_LEAK_SENTINEL_SPACE';
  for (const value of [invalidSpace, '-leading', '.leading', 'team/path', 'team value']) {
    const functionArgs = [...args];
    functionArgs[functionArgs.indexOf('--space-id') + 1] = value;
    const functionHarness = harness(aggregate(), aggregate(), launchResult('cli-zero'));
    await assert.rejects(runClaudeDiagnostic(functionArgs, environment, functionHarness.dependencies), /invalid diagnostic arguments/);
    assert.equal(functionHarness.launches.length, 0);
  }

  const invalidArgs = [...args];
  invalidArgs[invalidArgs.indexOf('--space-id') + 1] = invalidSpace;
  const result = spawnSync(process.execPath, [diagnosticTool, ...invalidArgs], {
    encoding: 'utf8',
    env: { ...process.env, MOCK_BASE_URL: 'http://127.0.0.1:1', STAGE1_CLIENT_SCENARIO: 'write' },
  });
  assert.notEqual(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.split('\n').filter(Boolean).length, 1);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(output).sort(), fixedKeys);
  assert.equal(output.launch, 'not_run');
  assert.equal(output.continuity, 'failed');
  assert.doesNotMatch(result.stdout, /MEMORY_|sentinel|space|error/i);
});

test('diagnostic overlay changes only the Claude headless entrypoint and adds one read-only script bind', async () => {
  const staticEnvironment = {
    ...process.env,
    COMPOSE_PROJECT_NAME: 'task5-diagnostic-static', RUN_ID: runId,
    EVIDENCE_DIR: join(integrationRoot, '.static-evidence', runId),
    ACTIVE_CLIENTS: 'claude,opencode,pi', MEMORY_CORE_GATEWAY_API_KEY: 'task5-diagnostic-not-llm',
  };
  const render = (selected) => {
    const command = ['compose', '--project-directory', integrationRoot, '--profile', 'mock', '--profile', 'claude'];
    for (const file of selected) command.push('-f', join(integrationRoot, file));
    command.push('config', '--format', 'json');
    const result = spawnSync('docker', command, { encoding: 'utf8', env: staticEnvironment });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  const activeFiles = ['compose.four-cli.yaml', 'compose.four-cli.mock.yaml', 'compose.four-cli.claude.yaml'];
  const active = render(activeFiles);
  const diagnostic = render([...activeFiles, 'compose.four-cli.diagnostic.yaml']);
  const base = active.services['claude-headless'];
  const service = diagnostic.services['claude-headless'];
  for (const name of ['image', 'user', 'init', 'read_only', 'cap_drop', 'security_opt', 'depends_on', 'environment', 'command', 'networks']) {
    assert.deepEqual(service[name], base[name]);
  }
  assert.deepEqual(service.entrypoint, ['node', '/opt/memory-client/task5-claude-diagnostic.mjs']);
  const originalVolumes = service.volumes.filter((volume) => volume.target !== '/opt/memory-client/task5-claude-diagnostic.mjs');
  assert.deepEqual(originalVolumes, base.volumes);
  const script = service.volumes.find((volume) => volume.target === '/opt/memory-client/task5-claude-diagnostic.mjs');
  assert.equal(script.type, 'bind');
  assert.equal(script.source.replaceAll('\\', '/'), diagnosticTool.replaceAll('\\', '/'));
  assert.equal(script.read_only, true);
  const activeRuntime = await Promise.all([
    readFile(join(integrationRoot, 'tools', 'run-task5-mock.mjs'), 'utf8'),
    ...activeFiles.map((file) => readFile(join(integrationRoot, file), 'utf8')),
  ]).then((values) => values.join('\n'));
  assert.doesNotMatch(activeRuntime, /task5-claude-diagnostic|compose\.four-cli\.diagnostic/);
});
