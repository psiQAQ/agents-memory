import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createMockServer } from '../tools/mock-llm.mjs';
import { ensureFetchSafeServer } from './helpers.mjs';
import { buildLeakCases, isUnsafeObservation, runProtocolLeakGate, runTask5Cli, stage1OperationDigest, stage1OperationHash } from '../tools/task5-stage1-runner.mjs';
import { headlessInvocation, runHeadlessCli, runHeadlessClient, stage1Marker } from '../tools/task5-headless-client.mjs';

const clients = ['claude', 'opencode', 'pi'];

test('Task 5 fixes 24 ordered Anthropic protocol and leak cases across the three native sources', () => {
  const cases = buildLeakCases();
  assert.equal(cases.length, 24);
  assert.deepEqual(cases.map(({ client, fixture }) => `${client}:${fixture}`), clients.flatMap((client) => [
    'text', 'stream', 'tool', 'count', 'http-400', 'http-429', 'http-500', 'timeout',
  ].map((fixture) => `${client}:${fixture}`)));
  assert.deepEqual(cases.map(({ source }) => source), [
    ...Array(8).fill('claude-code'),
    ...Array(8).fill('opencode'),
    ...Array(8).fill('pi'),
  ]);
});

test('Task 5 treats caller credentials and identity headers as unsafe upstream observations', () => {
  const safe = {
    header_names: ['anthropic-version', 'content-type', 'x-api-key'],
    sensitive_value_seen: false,
    unexpected_credential_seen: false,
    memory_user_credential_seen: false,
  };
  assert.equal(isUnsafeObservation(safe), false);
  for (const header of ['authorization', 'cookie', 'x-team-id', 'x-agent-id', 'x-task-id', 'x-conversation-id', 'x-tdai-service-token']) {
    assert.equal(isUnsafeObservation({ ...safe, header_names: [...safe.header_names, header] }), true, header);
  }
  for (const field of ['sensitive_value_seen', 'unexpected_credential_seen', 'memory_user_credential_seen']) {
    assert.equal(isUnsafeObservation({ ...safe, [field]: true }), true, field);
  }
  assert.equal(isUnsafeObservation({}), true);
});

test('Task 5 derives distinct noncredential markers and opaque operation digests without persisting raw values', () => {
  const runId = 'task5-20260811-a1b2c3';
  const markers = clients.map((client) => stage1Marker(runId, client));
  assert.equal(new Set(markers).size, 3);
  for (const marker of markers) assert.match(marker, /^MEMORY_NONCE_[A-F0-9]{32}$/);
  const digest = stage1OperationDigest(runId, 'read', 'claude', 'opencode');
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(digest, /task5|claude|opencode/i);
});

test('Task 5 headless driver locks official noninteractive argv and excludes owner markers from read prompts', () => {
  const runId = 'task5-20260811-a1b2c3';
  assert.deepEqual(headlessInvocation('claude', 'write', runId), {
    args: ['-p', `STAGE1_OP_${stage1OperationDigest(runId, 'write', 'claude').toUpperCase()} Remember this team fact for later: ${stage1Marker(runId, 'claude')}`],
    operation_digest: stage1OperationDigest(runId, 'write', 'claude'),
  });
  assert.deepEqual(headlessInvocation('opencode', 'write', runId).args.slice(0, 5), ['run', '--model', 'memory-anthropic/deepseek-v4-pro', '--format', 'json']);
  assert.deepEqual(headlessInvocation('pi', 'write', runId).args.slice(0, 3), ['--model', 'memory-anthropic/deepseek-v4-pro', '-p']);
  for (const reader of clients) {
    for (const owner of clients.filter((client) => client !== reader)) {
      const invocation = headlessInvocation(reader, 'read', runId, owner);
      const prompt = invocation.args.at(-1);
      assert.match(prompt, new RegExp(`STAGE1_OP_${invocation.operation_digest.toUpperCase()}`));
      assert.doesNotMatch(prompt, /MEMORY_NONCE_/);
      assert.doesNotMatch(prompt, new RegExp(stage1Marker(runId, owner)));
    }
  }
});

test('Task 5 headless driver rejects unknown clients, scenarios, runs, and self reads', () => {
  for (const call of [
    () => stage1Marker('../bad', 'claude'),
    () => headlessInvocation('codex', 'write', 'valid-run'),
    () => headlessInvocation('claude', 'unknown', 'valid-run'),
    () => headlessInvocation('claude', 'read', 'valid-run'),
    () => headlessInvocation('claude', 'read', 'valid-run', 'claude'),
  ]) assert.throws(call, /invalid/);
});

async function fixture({ unsafe = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'task5-runner-'));
  const mock = createMockServer({ timeoutMs: 40 });
  await ensureFetchSafeServer(mock);
  const mockUrl = `http://127.0.0.1:${mock.address().port}`;
  const ids = Object.fromEntries(clients.map((client) => [client, {
    user_id: `user-${client}`,
    agent_id: `agent-${client}`,
    session_id: `session-${client}`,
  }]));
  const keys = Object.fromEntries(clients.map((client, index) => [client, `sk-mem-${String.fromCharCode(65 + index).repeat(32)}`]));
  await mkdir(join(directory, 'credentials'));
  for (const client of clients) await writeFile(join(directory, 'credentials', `${client}.user-key`), `${keys[client]}\n`);
  const manifestPath = join(directory, 'run-manifest.json');
  await writeFile(manifestPath, JSON.stringify({
    run_id: 'task5-fixture', service_id: 'default', team_id: 'team-shared', task_id: 'task-shared',
    clients: Object.fromEntries(clients.map((client) => [client, { ...ids[client], credential_file: `credentials/${client}.user-key`, display_name: client }])),
  }));
  const proxy = http.createServer(async (request, response) => {
    const path = new URL(request.url, 'http://proxy').pathname;
    const source = path.split('/')[1];
    const client = Object.entries({ claude: 'claude-code', opencode: 'opencode', pi: 'pi' }).find(([, value]) => value === source)?.[0];
    const body = await new Promise((resolve) => { let text = ''; request.on('data', (chunk) => { text += chunk; }); request.on('end', () => resolve(text)); });
    if (!client || request.headers.authorization !== `Bearer ${keys[client]}` || request.headers['x-team-id'] !== 'team-shared' || request.headers['x-agent-id'] !== ids[client].agent_id || request.headers['x-task-id'] !== 'task-shared' || request.headers['x-conversation-id'] !== ids[client].session_id) {
      response.writeHead(401, { 'content-type': 'application/json' }).end('{}');
      return;
    }
    const fixture = request.headers['x-mock-fixture'];
    const count = path.endsWith('/count_tokens');
    const upstream = await fetch(`${mockUrl}/anthropic/v1/messages${count ? '/count_tokens' : ''}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'mock-key',
        'x-mock-fixture': fixture,
        ...(unsafe ? { 'x-team-id': request.headers['x-team-id'] } : {}),
      },
      body,
    });
    response.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json' });
    response.end(Buffer.from(await upstream.arrayBuffer()));
  });
  await ensureFetchSafeServer(proxy);
  return {
    directory,
    manifestPath,
    mockUrl,
    proxyUrl: `http://127.0.0.1:${proxy.address().port}`,
    close: async () => {
      await Promise.all([new Promise((resolve) => mock.close(resolve)), new Promise((resolve) => proxy.close(resolve))]);
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test('Task 5 protocol runner executes all 24 Proxy cases and writes only atomic redacted evidence', async () => {
  const value = await fixture();
  try {
    const outputDir = join(value.directory, 'evidence');
    const result = await runProtocolLeakGate({ manifestPath: value.manifestPath, proxyUrl: value.proxyUrl, mockUrl: value.mockUrl, outputDir, timeoutMs: 20 });
    assert.equal(result.status, 'ok');
    assert.equal(result.assertions.length, 24);
    assert.equal(result.assertions.filter((entry) => entry.status === 0).length, 3);
    const evidence = await readFile(join(outputDir, 'stage1-mock.json'), 'utf8');
    assert.doesNotMatch(evidence, /sk-mem-|MEMORY_NONCE_|STAGE1_OP_|team-shared|agent-|session-|prompt|messages|authorization/i);
    assert.deepEqual(JSON.parse(evidence), result);
  } finally { await value.close(); }
});

test('Task 5 protocol runner fails closed and records only the failing assertion when upstream sees identity', async () => {
  const value = await fixture({ unsafe: true });
  try {
    const outputDir = join(value.directory, 'evidence');
    await assert.rejects(runProtocolLeakGate({ manifestPath: value.manifestPath, proxyUrl: value.proxyUrl, mockUrl: value.mockUrl, outputDir, timeoutMs: 20 }), /assertion=leak-claude-text/);
    const evidence = await readFile(join(outputDir, 'stage1-mock.json'), 'utf8');
    assert.deepEqual(JSON.parse(evidence), { status: 'failed', assertion: 'leak-claude-text', passed: 0 });
    assert.doesNotMatch(evidence, /team-shared|x-team-id|sk-mem-|MEMORY_/i);
  } finally { await value.close(); }
});

test('Task 5 headless runtime verifies the real CLI exit and redacted Mock operation aggregate', async () => {
  const runId = 'task5-fixture';
  const invocation = headlessInvocation('claude', 'read', runId, 'opencode');
  const markerHash = (await import('node:crypto')).createHash('sha256').update(stage1Marker(runId, 'opencode')).digest('hex');
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ total_requests: 1, paths: {}, fixtures: {}, operations: { [stage1OperationHash(runId, 'read', 'claude', 'opencode')]: { requests: 1, marker_hashes: [markerHash] } } }));
  });
  await ensureFetchSafeServer(server);
  const calls = [];
  try {
    const result = await runHeadlessClient({
      client: 'claude', scenario: 'read', runId, owner: 'opencode', homeDir: '/home/agent', bundleFile: '/home/agent/.memory/agent-bundle.json', template: '/opt/memory-client/settings.template.json', spaceId: 'default', mockUrl: `http://127.0.0.1:${server.address().port}`,
      launch: async (options) => { calls.push(options); return 0; },
    });
    assert.deepEqual(result, { status: 'ok', scenario: 'read', observed_marker_count: 1 });
    assert.deepEqual(calls[0].args, invocation.args);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('Task 5 CLI accepts only the fixed protocol-leak contract and forwards no ambient options', async () => {
  const calls = [];
  const result = await runTask5Cli([
    '--manifest', '/state/run/run-manifest.json',
    '--scenario', 'protocol-leak',
    '--gateway-token-file', '/runtime-config/gateway.token',
    '--output-dir', '/evidence',
  ], { PROXY_BASE_URL: 'http://memory-proxy:8096', MOCK_BASE_URL: 'http://mock-llm:8080' }, {
    protocol: async (options) => { calls.push(options); return { status: 'ok' }; },
  });
  assert.deepEqual(result, { status: 'ok' });
  assert.deepEqual(calls, [{
    manifestPath: '/state/run/run-manifest.json',
    proxyUrl: 'http://memory-proxy:8096',
    mockUrl: 'http://mock-llm:8080',
    outputDir: '/evidence',
  }]);
  for (const argv of [[], ['--scenario', 'unknown'], ['--manifest', '/m', '--manifest', '/m']]) {
    await assert.rejects(runTask5Cli(argv, {}, { protocol: async () => ({}) }), /invalid/);
  }
});

test('Task 5 headless CLI forwards the fixed private paths and never accepts arbitrary commands', async () => {
  const calls = [];
  const result = await runHeadlessCli([
    '--client', 'pi', '--scenario', 'read', '--run-id', 'task5-fixture', '--owner', 'claude',
    '--home-dir', '/home/agent', '--bundle-file', '/home/agent/.memory/agent-bundle.json',
    '--space-id', 'default', '--template', '/opt/memory-client/settings.template.json',
  ], { MOCK_BASE_URL: 'http://mock-llm:8080' }, { run: async (options) => { calls.push(options); return { status: 'ok' }; } });
  assert.deepEqual(result, { status: 'ok' });
  assert.equal(calls[0].mockUrl, 'http://mock-llm:8080');
  assert.equal(calls[0].client, 'pi');
  assert.equal(calls[0].owner, 'claude');
  for (const argv of [[], ['--client', 'pi'], ['--command', 'sh']]) await assert.rejects(runHeadlessCli(argv, {}, { run: async () => ({}) }), /invalid/);
});
