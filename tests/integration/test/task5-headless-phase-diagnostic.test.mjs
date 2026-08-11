import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import http from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { stage1Marker } from '../tools/task5-headless-client.mjs';
import { stage1OperationHash } from '../tools/task5-contract.mjs';
import { runHeadlessPhaseDiagnostic } from '../tools/task5-headless-phase-diagnostic.mjs';
import { ensureFetchSafeServer } from './helpers.mjs';

const runId = 'task5-headless-phase';
const integrationRoot = join(import.meta.dirname, '..');
const diagnosticTool = join(integrationRoot, 'tools', 'task5-headless-phase-diagnostic.mjs');
const epoch = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const previousHash = stage1OperationHash(runId, 'write', 'claude');
const currentHash = stage1OperationHash(runId, 'write', 'opencode');
const previousMarker = createHash('sha256').update(stage1Marker(runId, 'claude')).digest('hex');
const currentMarker = createHash('sha256').update(stage1Marker(runId, 'opencode')).digest('hex');

function operation(sequence, markerHash) {
  return {
    requests: 1,
    paths: { '/anthropic/v1/messages': { requests: 1, sequences: [sequence], marker_hashes: [markerHash] } },
  };
}

function aggregate(sequence, operations) {
  const sequences = Array.from({ length: sequence - 39 }, (_, index) => index + 40);
  return {
    epoch, sequence, total_requests: sequences.length, dropped_requests: 0, truncated: false,
    paths: { '/anthropic/v1/messages': { requests: sequences.length, sequences } },
    fixtures: {}, operations,
    sticky_leaks: { credential: false, identity: false, sentinel: false },
  };
}

function argv(evidenceDir) {
  return [
    '--client', 'opencode', '--run-id', runId,
    '--home-dir', '/home/agent', '--bundle-file', '/home/agent/.memory/agent-bundle.json',
    '--space-id', 'default', '--template', '/opt/memory-client/settings.template.json',
    '--evidence-dir', evidenceDir,
  ];
}

async function fixture(prefix) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  const before = aggregate(40, { [previousHash]: operation(40, previousMarker) });
  const after = aggregate(41, {
    [previousHash]: operation(40, previousMarker),
    [currentHash]: operation(41, currentMarker),
  });
  let reads = 0;
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(reads++ === 0 ? before : after));
  });
  await ensureFetchSafeServer(server);
  return {
    directory,
    evidenceDir: join(directory, 'evidence'),
    environment: { MOCK_BASE_URL: `http://127.0.0.1:${server.address().port}`, STAGE1_CLIENT_SCENARIO: 'write' },
    close: async () => { await new Promise((resolve) => server.close(resolve)); await rm(directory, { recursive: true, force: true }); },
  };
}

test('headless phase diagnostic traverses the exact verifier and atomic evidence publication', async () => {
  const value = await fixture('task5-headless-phase-success-');
  try {
    const result = await runHeadlessPhaseDiagnostic(argv(value.evidenceDir), value.environment, { launch: async () => 0 });
    assert.deepEqual(result, { status: 'classified', phase: 'success' });
    assert.equal(await readFile(join(value.evidenceDir, 'write.json'), 'utf8'), '{"status":"ok","scenario":"write","owner":null}\n');
  } finally { await value.close(); }
});

test('headless phase diagnostic maps client, observation, evidence, and setup failures without details', async (context) => {
  for (const [name, prepare, launch, expected] of [
    ['client-nonzero', async () => {}, async () => 7, 'client'],
    ['client-throw', async () => {}, async () => { throw new Error('RAW_CLIENT_SECRET'); }, 'client'],
    ['observation', async (value) => { value.environment.MOCK_BASE_URL = 'http://127.0.0.1:1'; }, async () => 0, 'observation'],
    ['evidence', async (value) => { await writeFile(join(value.directory, 'write.json'), 'existing'); value.evidenceDir = value.directory; }, async () => 0, 'evidence'],
  ]) await context.test(name, async () => {
    const value = await fixture(`task5-headless-phase-${name}-`);
    try {
      await prepare(value);
      const result = await runHeadlessPhaseDiagnostic(argv(value.evidenceDir), value.environment, { launch });
      assert.deepEqual(result, { status: 'classified', phase: expected });
      assert.doesNotMatch(JSON.stringify(result), /RAW_|secret|error|path|marker|identity|key/i);
    } finally { await value.close(); }
  });

  const setup = await runHeadlessPhaseDiagnostic(['--command', 'RAW_SETUP_SECRET'], {}, { launch: async () => 0 });
  assert.deepEqual(setup, { status: 'classified', phase: 'setup' });
  assert.doesNotMatch(JSON.stringify(setup), /RAW_|secret|command|error/i);
});

test('headless phase diagnostic CLI emits one fixed setup classification for invalid input', () => {
  const child = spawnSync(process.execPath, [diagnosticTool, '--command', 'RAW_CLI_SECRET'], { encoding: 'utf8' });
  assert.equal(child.status, 0);
  assert.equal(child.stderr, '');
  assert.equal(child.stdout, '{"status":"classified","phase":"setup"}\n');
});

test('headless phase diagnostic overlay changes only the OpenCode entrypoint and one read-only bind', () => {
  const environment = {
    ...process.env,
    COMPOSE_PROJECT_NAME: 'task5-headless-phase-static', RUN_ID: runId,
    EVIDENCE_DIR: join(integrationRoot, '.static-evidence', runId),
    ACTIVE_CLIENTS: 'claude,opencode,pi', MEMORY_CORE_GATEWAY_API_KEY: 'task5-diagnostic-not-llm',
  };
  const render = (files) => {
    const args = ['compose', '--project-directory', integrationRoot, '--profile', 'mock', '--profile', 'claude', '--profile', 'opencode'];
    for (const file of files) args.push('-f', join(integrationRoot, file));
    args.push('config', '--format', 'json');
    const child = spawnSync('docker', args, { encoding: 'utf8', env: environment });
    assert.equal(child.status, 0, child.stderr);
    return JSON.parse(child.stdout);
  };
  const activeFiles = [
    'compose.four-cli.yaml', 'compose.four-cli.mock.yaml',
    'compose.four-cli.claude.yaml', 'compose.four-cli.opencode.yaml',
  ];
  const base = structuredClone(render(activeFiles).services['opencode-headless']);
  const service = structuredClone(render([...activeFiles, 'compose.four-cli.opencode-headless-diagnostic.yaml']).services['opencode-headless']);
  assert.deepEqual(service.entrypoint, ['node', '/opt/memory-client/task5-headless-phase-diagnostic.mjs']);
  const script = service.volumes.find((volume) => volume.target === '/opt/memory-client/task5-headless-phase-diagnostic.mjs');
  assert.equal(script.type, 'bind');
  assert.equal(script.source.replaceAll('\\', '/'), diagnosticTool.replaceAll('\\', '/'));
  assert.equal(script.read_only, true);
  delete base.entrypoint;
  delete service.entrypoint;
  service.volumes = service.volumes.filter((volume) => volume.target !== '/opt/memory-client/task5-headless-phase-diagnostic.mjs');
  assert.deepEqual(service, base);
});
