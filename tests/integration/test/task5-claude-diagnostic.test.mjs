import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { stage1OperationHash } from '../tools/task5-contract.mjs';
import { runClaudeDiagnostic } from '../tools/task5-claude-diagnostic.mjs';

const integrationRoot = join(import.meta.dirname, '..');
const diagnosticTool = join(integrationRoot, 'tools', 'task5-claude-diagnostic.mjs');
const runId = 'task5-diagnostic';
const operationHash = stage1OperationHash(runId, 'write', 'claude');
const epoch = '00000000-0000-4000-8000-000000000001';
const args = [
  '--client', 'claude', '--run-id', runId,
  '--home-dir', '/home/agent', '--bundle-file', '/home/agent/.memory/agent-bundle.json',
  '--space-id', 'default', '--template', '/opt/memory-client/settings.template.json',
  '--evidence-dir', '/client-evidence',
];
const environment = { MOCK_BASE_URL: 'http://mock-llm:8080', STAGE1_CLIENT_SCENARIO: 'write' };

function aggregate({ sequence = 40, total = 0, paths = {}, operations = {}, dropped = 0, truncated = false, sticky = {} } = {}) {
  return {
    epoch, sequence, total_requests: total, dropped_requests: dropped, truncated,
    paths, fixtures: {}, operations,
    sticky_leaks: { credential: false, identity: false, sentinel: false, ...sticky },
  };
}

function operation(sequence = 41, requests = 1, paths = { '/anthropic/v1/messages': { requests: 1, sequences: [sequence], marker_hashes: [] } }) {
  return { requests, paths };
}

function harness(before, after, launchOutcome) {
  let reads = 0;
  const launches = [];
  return {
    launches,
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
    },
  };
}

const fixedKeys = [
  'status', 'launch', 'continuity', 'sequence_delta', 'total_delta',
  'expected_operation_present', 'expected_operation_valid', 'expected_main_count',
  'unexpected_operation_count', 'unexpected_path_count', 'unsafe', 'dropped', 'truncated',
].sort();

test('Claude diagnostic classifies code0, nonzero, and throw with at most one launch', async (context) => {
  const before = aggregate();
  const validAfter = aggregate({
    sequence: 41, total: 1,
    paths: { '/anthropic/v1/messages': { requests: 1, sequences: [41] } },
    operations: { [operationHash]: operation() },
  });
  for (const [name, outcome, expectedLaunch, after] of [
    ['code0', 0, 'code0', validAfter],
    ['nonzero', 7, 'nonzero', before],
    ['throw', new Error('MEMORY_LEAK_SENTINEL_MUST_NOT_APPEAR'), 'throw', before],
  ]) await context.test(name, async () => {
    const value = harness(before, after, outcome);
    const result = await runClaudeDiagnostic(args, environment, value.dependencies);
    assert.deepEqual(Object.keys(result).sort(), fixedKeys);
    assert.equal(result.status, 'classified');
    assert.equal(result.launch, expectedLaunch);
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
    assert.equal(value.launches[0].client, 'claude');
    assert.equal(value.launches[0].capture.maxBytes, 256 * 1024);
    assert.equal(value.launches[0].capture.sensitiveValues.length, 3);
    assert.doesNotMatch(JSON.stringify(result), /MEMORY_|STAGE1_|sentinel|prompt|identity|key|epoch|hash|path\//i);
  });
});

test('Claude diagnostic classifies invalid expected operations and unexpected requests without details', async () => {
  const before = aggregate();
  const extraHash = stage1OperationHash(runId, 'write', 'pi');
  const invalidExpected = aggregate({
    sequence: 42, total: 2,
    paths: { '/anthropic/v1/messages': { requests: 2, sequences: [41, 42] } },
    operations: { [operationHash]: operation(41, 2, { '/anthropic/v1/messages': { requests: 2, sequences: [41, 42], marker_hashes: [] } }) },
  });
  const invalidHarness = harness(before, invalidExpected, 0);
  const invalid = await runClaudeDiagnostic(args, environment, invalidHarness.dependencies);
  assert.equal(invalid.expected_operation_present, true);
  assert.equal(invalid.expected_operation_valid, false);
  assert.equal(invalid.expected_main_count, 2);
  assert.equal(invalid.unexpected_operation_count, 0);
  assert.equal(invalid.unexpected_path_count, 0);
  assert.equal(invalid.unsafe, false);

  const unexpectedAfter = aggregate({
    sequence: 42, total: 2,
    paths: {
      '/anthropic/v1/messages': { requests: 1, sequences: [41] },
      '/unexpected': { requests: 1, sequences: [42] },
    },
    operations: {
      [operationHash]: operation(),
      [extraHash]: operation(42, 1, { '/unexpected': { requests: 1, sequences: [42], marker_hashes: [] } }),
    },
  });
  const unexpectedHarness = harness(before, unexpectedAfter, 0);
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
    sequence: 41, total: 1, dropped: 1, truncated: true,
    sticky: { credential: true },
    paths: { '/anthropic/v1/messages': { requests: 1, sequences: [41] } },
    operations: { [operationHash]: operation() },
  });
  const unsafeHarness = harness(before, unsafeAfter, 0);
  const unsafe = await runClaudeDiagnostic(args, environment, unsafeHarness.dependencies);
  assert.equal(unsafe.continuity, 'ok');
  assert.equal(unsafe.unsafe, true);
  assert.equal(unsafe.dropped, 1);
  assert.equal(unsafe.truncated, true);
  assert.equal(unsafeHarness.launches.length, 1);

  const beforeFailure = harness(new Error('before raw error'), aggregate(), 0);
  const notRun = await runClaudeDiagnostic(args, environment, beforeFailure.dependencies);
  assert.equal(notRun.launch, 'not_run');
  assert.equal(notRun.continuity, 'failed');
  assert.equal(notRun.sequence_delta, -1);
  assert.equal(notRun.total_delta, -1);
  assert.equal(notRun.expected_operation_valid, false);
  assert.equal(notRun.unsafe, false);
  assert.equal(beforeFailure.launches.length, 0);

  const afterFailure = harness(before, new Error('after raw error'), 0);
  const failed = await runClaudeDiagnostic(args, environment, afterFailure.dependencies);
  assert.equal(failed.launch, 'code0');
  assert.equal(failed.continuity, 'failed');
  assert.equal(failed.sequence_delta, -1);
  assert.equal(failed.total_delta, -1);
  assert.equal(failed.expected_operation_valid, false);
  assert.equal(failed.unsafe, false);
  assert.equal(afterFailure.launches.length, 1);
  assert.doesNotMatch(JSON.stringify([notRun, failed]), /raw error/);

  const baselineHash = stage1OperationHash(runId, 'write', 'pi');
  const baseline = aggregate({
    sequence: 40, total: 1,
    paths: { '/anthropic/v1/messages': { requests: 1, sequences: [40] } },
    operations: { [baselineHash]: operation(40) },
  });
  const changedBaseline = structuredClone(baseline);
  changedBaseline.operations[baselineHash].requests = 2;
  const baselineHarness = harness(baseline, changedBaseline, 7);
  const continuity = await runClaudeDiagnostic(args, environment, baselineHarness.dependencies);
  assert.equal(continuity.launch, 'nonzero');
  assert.equal(continuity.continuity, 'failed');
  assert.equal(continuity.sequence_delta, -1);
  assert.equal(continuity.total_delta, -1);
  assert.equal(continuity.unsafe, false);
  assert.equal(baselineHarness.launches.length, 1);
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
