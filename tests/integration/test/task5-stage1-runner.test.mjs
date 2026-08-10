import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createMockServer } from '../tools/mock-llm.mjs';
import { ensureFetchSafeServer } from './helpers.mjs';
import { buildLeakCases, isUnsafeObservation, runFinalizeGate, runManagementGate, runOwnerOracle, runProtocolLeakGate, runTask5Cli, stage1OperationDigest, stage1OperationHash } from '../tools/task5-stage1-runner.mjs';
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

async function fixture({ unsafe = false, corruptTool = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'task5-runner-'));
  const mock = createMockServer({ timeoutMs: 40 });
  await ensureFetchSafeServer(mock);
  const mockUrl = `http://127.0.0.1:${mock.address().port}`;
  const allActors = [...clients, 'outsider'];
  const ids = Object.fromEntries(allActors.map((client) => [client, {
    user_id: `user-${client}`,
    agent_id: `agent-${client}`,
    session_id: `session-${client}`,
  }]));
  const keys = Object.fromEntries(allActors.map((client, index) => [client, `sk-mem-${String.fromCharCode(65 + index).repeat(32)}`]));
  const assetIds = Object.fromEntries(clients.map((client) => [client, `asset-${client}`]));
  await mkdir(join(directory, 'credentials'));
  for (const client of allActors) await writeFile(join(directory, 'credentials', `${client}.user-key`), `${keys[client]}\n`);
  const gatewayTokenFile = join(directory, 'gateway.token');
  await writeFile(gatewayTokenFile, 'task5-gateway-token\n');
  const manifestPath = join(directory, 'run-manifest.json');
  const manifest = {
    run_id: 'task5-fixture', service_id: 'default', team_id: 'team-shared', task_id: 'task-shared',
    clients: Object.fromEntries(clients.map((client) => [client, { ...ids[client], credential_file: `credentials/${client}.user-key`, display_name: client }])),
    outsider: { ...ids.outsider, team_id: 'team-outsider', task_id: 'task-outsider', credential_file: 'credentials/outsider.user-key', display_name: 'Synthetic Outsider' },
    shared_memory: { owner_asset_ids: assetIds, cross_owner_binding_count: 6 },
  };
  await writeFile(manifestPath, JSON.stringify(manifest));
  const proxy = http.createServer(async (request, response) => {
    const path = new URL(request.url, 'http://proxy').pathname;
    const source = path.split('/')[1];
    const client = Object.entries({ claude: 'claude-code', opencode: 'opencode', pi: 'pi' }).find(([, value]) => value === source)?.[0];
    const body = await new Promise((resolve) => { let text = ''; request.on('data', (chunk) => { text += chunk; }); request.on('end', () => resolve(text)); });
    if (!client || request.headers['x-mock-fixture'] !== undefined || request.headers.authorization !== `Bearer ${keys[client]}` || request.headers['x-team-id'] !== 'team-shared' || request.headers['x-agent-id'] !== ids[client].agent_id || request.headers['x-task-id'] !== 'task-shared' || request.headers['x-conversation-id'] !== ids[client].session_id) {
      response.writeHead(401, { 'content-type': 'application/json' }).end('{}');
      return;
    }
    const count = path.endsWith('/count_tokens');
    const upstream = await fetch(`${mockUrl}/anthropic/v1/messages${count ? '/count_tokens' : ''}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'mock-key',
        ...(unsafe ? { 'x-team-id': request.headers['x-team-id'] } : {}),
      },
      body,
    });
    response.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json' });
    const upstreamBody = Buffer.from(await upstream.arrayBuffer());
    response.end(corruptTool && body.includes('STAGE1_FIXTURE_tool')
      ? JSON.stringify({ id: 'msg_corrupt', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'not a tool response' }] })
      : upstreamBody);
  });
  await ensureFetchSafeServer(proxy);
  return {
    directory,
    assetIds,
    gatewayTokenFile,
    ids,
    keys,
    manifest,
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

test('Task 5 owner oracle requires exact Core L0 and L1 ownership and polls only until the owned marker exists', async () => {
  const value = await fixture();
  const calls = [];
  let atomicCalls = 0;
  try {
    const result = await runOwnerOracle({ manifestPath: value.manifestPath, gatewayTokenFile: value.gatewayTokenFile, coreUrl: 'http://memory-core:8420', client: 'claude', pollAttempts: 3, pollIntervalMs: 0 }, {
      core: async (path, context) => {
        calls.push({ path, context });
        const owner = { team_id: 'team-shared', user_id: 'user-claude', agent_id: 'agent-claude', task_id: 'task-shared' };
        const item = { ...owner, content: `owned ${stage1Marker('task5-fixture', 'claude')}` };
        if (path === '/v3/conversation/query') return { status: 200, code: 0, data: { messages: [item] } };
        atomicCalls += 1;
        return { status: 200, code: 0, data: { items: atomicCalls === 1 ? [] : [item] } };
      },
    });
    assert.deepEqual(result, { status: 'ok', l0_matches: 1, l1_matches: 1 });
    assert.equal(calls.length, 3);
    assert.equal(calls[0].context.key, value.keys.claude);
    assert.deepEqual(calls[0].context.body, { team_id: 'team-shared', user_id: 'user-claude', agent_id: 'agent-claude', task_id: 'task-shared', session_id: 'session-claude', limit: 100, offset: 0 });

    await assert.rejects(runOwnerOracle({ manifestPath: value.manifestPath, gatewayTokenFile: value.gatewayTokenFile, coreUrl: 'http://memory-core:8420', client: 'claude', pollAttempts: 1, pollIntervalMs: 0 }, {
      core: async () => ({ status: 200, code: 0, data: { messages: [{ content: stage1Marker('task5-fixture', 'claude'), team_id: 'team-shared', user_id: 'user-opencode', agent_id: 'agent-claude', task_id: 'task-shared' }] } }),
    }), /owner oracle failed/);
  } finally { await value.close(); }
});

test('Task 5 final gate proves three writes and six ordered foreign reads without storing hashes or markers', async () => {
  const value = await fixture();
  try {
    const operations = {};
    for (const client of clients) {
      operations[stage1OperationHash(value.manifest.run_id, 'write', client)] = { requests: 1, marker_hashes: [(await import('node:crypto')).createHash('sha256').update(stage1Marker(value.manifest.run_id, client)).digest('hex')] };
      for (const owner of clients.filter((candidate) => candidate !== client)) {
        operations[stage1OperationHash(value.manifest.run_id, 'read', client, owner)] = { requests: 1, marker_hashes: [(await import('node:crypto')).createHash('sha256').update(stage1Marker(value.manifest.run_id, owner)).digest('hex')] };
      }
    }
    const outputDir = join(value.directory, 'final-evidence');
    const result = await runFinalizeGate({ manifestPath: value.manifestPath, gatewayTokenFile: value.gatewayTokenFile, coreUrl: 'http://memory-core:8420', mockUrl: value.mockUrl, outputDir }, {
      ownerOracle: async ({ client }) => ({ status: 'ok', client }),
      aggregate: async () => ({ total_requests: 9, paths: {}, fixtures: {}, operations }),
    });
    assert.deepEqual(result, { status: 'ok', owner_oracles: 3, write_operations: 3, cross_owner_reads: 6 });
    const evidence = await readFile(join(outputDir, 'stage1-shared-memory.json'), 'utf8');
    assert.deepEqual(JSON.parse(evidence), result);
    assert.doesNotMatch(evidence, /MEMORY_|[a-f0-9]{32}|user-|agent-|team-|task-|session-|credential|prompt|body/i);
  } finally { await value.close(); }
});

test('Task 5 management gate validates topology and outsider isolation with mutation rollback and zero model side effects', async () => {
  const value = await fixture();
  const ownBindings = Object.fromEntries(clients.map((client) => [client, clients.map((owner) => ({
    asset_id: value.assetIds[owner], asset_type: 'chat_memory', injection_mode: 'summary', priority: owner === client ? 50 : 0, created_by: value.ids[client].user_id,
  }))]));
  const outsiderBinding = [{ asset_id: 'asset-outsider', asset_type: 'chat_memory', injection_mode: 'summary', priority: 50, created_by: value.ids.outsider.user_id }];
  try {
    const result = await runManagementGate({ manifestPath: value.manifestPath, gatewayTokenFile: value.gatewayTokenFile, coreUrl: 'http://memory-core:8420', proxyUrl: value.proxyUrl, mockUrl: value.mockUrl, panelUrl: 'http://memory-hub:8125', outputDir: join(value.directory, 'management-evidence') }, {
      core: async (path, { body }) => {
        if (path === '/v3/meta/user/get') return { status: 200, code: 0, data: { user_id: body.user_id } };
        if (path === '/v3/meta/team/get') return { status: 200, code: 0, data: { team_id: body.team_id } };
        if (path === '/v3/meta/team-member/list') {
          const actors = body.team_id === 'team-shared' ? clients : ['outsider'];
          return { status: 200, code: 0, data: { items: actors.map((actor) => ({ user_id: value.ids[actor].user_id })) } };
        }
        if (path === '/v3/meta/agent/list') {
          const actors = body.team_id === 'team-shared' ? clients : ['outsider'];
          return { status: 200, code: 0, data: { items: actors.map((actor) => ({ agent_id: value.ids[actor].agent_id, team_id: body.team_id, owner_user_id: value.ids[actor].user_id })) } };
        }
        if (path === '/v3/meta/task/get') return { status: 200, code: 0, data: { task_id: body.task_id, team_id: body.task_id === 'task-shared' ? 'team-shared' : 'team-outsider' } };
        if (path === '/v3/meta/asset/get') {
          const owner = Object.entries(value.assetIds).find(([, assetId]) => assetId === body.asset_id)?.[0] ?? 'outsider';
          return { status: 200, code: 0, data: { asset_id: body.asset_id, asset_type: 'chat_memory', team_id: owner === 'outsider' ? 'team-outsider' : 'team-shared', owner_user_id: value.ids[owner].user_id, visibility: owner === 'outsider' ? 'private' : 'team' } };
        }
        if (path === '/v3/meta/agent-fixed-asset/list') {
          const actor = [...clients, 'outsider'].find((name) => value.ids[name].agent_id === body.agent_id);
          const items = actor === 'outsider' ? outsiderBinding : ownBindings[actor];
          return { status: 200, code: 0, data: { items: structuredClone(items) } };
        }
        if (path === '/v3/meta/asset/list-accessible') return { status: 200, code: 0, data: { items: [] } };
        if (path === '/v3/meta/acl/check') return { status: 200, code: 0, data: { allowed: body.user_id !== value.ids.outsider.user_id } };
        if (path === '/v3/meta/agent-fixed-asset/set') return { status: 403, code: 403, data: null };
        throw new Error(`unexpected ${path}`);
      },
      proxy: async (kind) => kind === 'unknown' ? { status: 404 } : kind === 'forged' ? { status: 409 } : { status: 200 },
      model: async (kind) => kind === 'legal' ? { count: 1, all_count: 2, owner_marker_count: 0, safe: true } : { count: 0, all_count: 0, owner_marker_count: 0, safe: true },
      panel: async (path) => ({ status: 200, contentType: path === '/' ? 'text/html; charset=utf-8' : 'application/json' }),
    });
    assert.deepEqual(result, { status: 'ok', users: 4, teams: 2, members: 4, agents: 4, tasks: 2, assets: 4, bindings: 10, acl_checks: 7, outsider_negative_checks: 6, panel_checks: 2 });
    const evidence = await readFile(join(value.directory, 'management-evidence', 'stage1-management.json'), 'utf8');
    assert.deepEqual(JSON.parse(evidence), result);
    assert.doesNotMatch(evidence, /user-|agent-|team-|task-|asset-|sk-mem-|MEMORY_|authorization/i);
  } finally { await value.close(); }
});

test('Task 5 management gate rejects duplicate actor credentials before any Core request', async () => {
  const value = await fixture();
  let coreCalls = 0;
  try {
    await writeFile(join(value.directory, value.manifest.outsider.credential_file), `${value.keys.claude}\n`);
    const outputDir = join(value.directory, 'duplicate-credential-evidence');
    await assert.rejects(runManagementGate({
      manifestPath: value.manifestPath, gatewayTokenFile: value.gatewayTokenFile, coreUrl: 'http://memory-core:8420', proxyUrl: value.proxyUrl,
      mockUrl: value.mockUrl, panelUrl: 'http://memory-hub:8125', outputDir,
    }, { core: async () => { coreCalls += 1; return {}; } }), /assertion=credentials/);
    assert.equal(coreCalls, 0);
    assert.deepEqual(JSON.parse(await readFile(join(outputDir, 'stage1-management.json'), 'utf8')), { status: 'failed', assertion: 'credentials' });
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

test('Task 5 protocol runner rejects a 200 response with the wrong Anthropic tool shape', async () => {
  const value = await fixture({ corruptTool: true });
  try {
    const outputDir = join(value.directory, 'corrupt-tool-evidence');
    await assert.rejects(runProtocolLeakGate({ manifestPath: value.manifestPath, proxyUrl: value.proxyUrl, mockUrl: value.mockUrl, outputDir, timeoutMs: 20 }), /assertion=leak-claude-tool/);
    assert.deepEqual(JSON.parse(await readFile(join(outputDir, 'stage1-mock.json'), 'utf8')), { status: 'failed', assertion: 'leak-claude-tool', passed: 2 });
  } finally { await value.close(); }
});

test('Task 5 headless runtime verifies the real CLI exit and redacted Mock operation aggregate', async () => {
  const runId = 'task5-fixture';
  const invocation = headlessInvocation('claude', 'read', runId, 'opencode');
  const markerHash = (await import('node:crypto')).createHash('sha256').update(stage1Marker(runId, 'opencode')).digest('hex');
  let reads = 0;
  const server = http.createServer((request, response) => {
    reads += 1;
    const operations = reads === 1 ? {} : { [stage1OperationHash(runId, 'read', 'claude', 'opencode')]: { requests: 1, marker_hashes: [markerHash] } };
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ total_requests: reads - 1, paths: {}, fixtures: {}, operations }));
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
    assert.equal(reads, 2);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('Task 5 headless runtime rejects a replayed operation before launching the CLI', async () => {
  const runId = 'task5-fixture';
  const operation = stage1OperationHash(runId, 'write', 'pi');
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ total_requests: 1, paths: {}, fixtures: {}, operations: { [operation]: { requests: 1, marker_hashes: [] } } }));
  });
  await ensureFetchSafeServer(server);
  let launches = 0;
  try {
    await assert.rejects(runHeadlessClient({
      client: 'pi', scenario: 'write', runId, homeDir: '/home/agent', bundleFile: '/home/agent/.memory/agent-bundle.json', template: '/opt/memory-client/settings.template.json', spaceId: 'default', mockUrl: `http://127.0.0.1:${server.address().port}`,
      launch: async () => { launches += 1; return 0; },
    }), /observation failed/);
    assert.equal(launches, 0);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('Task 5 CLI dispatches only fixed protocol, owner, management, and finalize contracts without ambient options', async () => {
  const common = ['--manifest', '/state/run/run-manifest.json', '--gateway-token-file', '/runtime-config/gateway.token', '--output-dir', '/evidence'];
  const environment = {
    PROXY_BASE_URL: 'http://memory-proxy:8096', MOCK_BASE_URL: 'http://mock-llm:8080', CORE_BASE_URL: 'http://memory-core:8420', PANEL_BASE_URL: 'http://memory-hub:8125',
  };
  const cases = [
    { scenario: 'protocol-leak', dependency: 'protocol', expected: { manifestPath: '/state/run/run-manifest.json', proxyUrl: environment.PROXY_BASE_URL, mockUrl: environment.MOCK_BASE_URL, outputDir: '/evidence' } },
    { scenario: 'owner-oracle', dependency: 'owner', extra: ['--client', 'claude'], expected: { manifestPath: '/state/run/run-manifest.json', gatewayTokenFile: '/runtime-config/gateway.token', coreUrl: environment.CORE_BASE_URL, client: 'claude' } },
    { scenario: 'management', dependency: 'management', expected: { manifestPath: '/state/run/run-manifest.json', gatewayTokenFile: '/runtime-config/gateway.token', coreUrl: environment.CORE_BASE_URL, proxyUrl: environment.PROXY_BASE_URL, mockUrl: environment.MOCK_BASE_URL, panelUrl: environment.PANEL_BASE_URL, outputDir: '/evidence' } },
    { scenario: 'finalize', dependency: 'finalize', expected: { manifestPath: '/state/run/run-manifest.json', gatewayTokenFile: '/runtime-config/gateway.token', coreUrl: environment.CORE_BASE_URL, mockUrl: environment.MOCK_BASE_URL, outputDir: '/evidence' } },
  ];
  for (const entry of cases) {
    const calls = [];
    const dependencies = { [entry.dependency]: async (options) => { calls.push(options); return { status: 'ok' }; } };
    const result = await runTask5Cli([...common, '--scenario', entry.scenario, ...(entry.extra ?? [])], environment, dependencies);
    assert.deepEqual(result, { status: 'ok' });
    assert.deepEqual(calls, [entry.expected]);
  }
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
  const fromEnvironment = [];
  await runHeadlessCli([
    '--client', 'opencode', '--run-id', 'task5-fixture',
    '--home-dir', '/home/agent', '--bundle-file', '/home/agent/.memory/agent-bundle.json',
    '--space-id', 'default', '--template', '/opt/memory-client/settings.template.json',
  ], { MOCK_BASE_URL: 'http://mock-llm:8080', STAGE1_CLIENT_SCENARIO: 'read', STAGE1_OWNER: 'pi' }, { run: async (options) => { fromEnvironment.push(options); return { status: 'ok' }; } });
  assert.equal(fromEnvironment[0].scenario, 'read');
  assert.equal(fromEnvironment[0].owner, 'pi');
  for (const argv of [[], ['--client', 'pi'], ['--command', 'sh']]) await assert.rejects(runHeadlessCli(argv, {}, { run: async () => ({}) }), /invalid/);
});
