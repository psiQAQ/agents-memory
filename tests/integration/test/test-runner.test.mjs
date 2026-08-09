import assert from 'node:assert/strict';
import { link, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import test from 'node:test';
import { createMockServer } from '../tools/mock-llm.mjs';
import { ensureFetchSafeServer } from './helpers.mjs';

async function mock() {
  const server = createMockServer({ timeoutMs: 80 });
  await ensureFetchSafeServer(server);
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

async function standaloneTopology(keys, gatewayToken, { leakSentinel = false, positiveLeakOnly = false, truncatedObservations = false, unexpectedCredential = false, memoryCredential = false, omitObservationFlags = false, wrongSharedOwner = false, vertexSessionHeader = false, claudeSessionHeader = false, l1BusinessErrorWithItems = false, proxySkipsAnthropicForward = false, authNegativeCoreSideEffect = false, authNegativeCountTokensSideEffect = false, identityConflictCoreSideEffect = false, bridgeMissingCoreSideEffect = false, bridgeForgedCoreSideEffect = false, sessionInitDelayedCoreSideEffect = false } = {}) {
  const requests = [];
  let nonce;
  let atomicCalls = 0;
  let modelFetchCount = 0;
  let coreModelFetchCount = 0;
  let countTokensFetchCount = 0;
  let delayedCoreObservation = 0;
  const initializedSessions = [];
  const byKey = Object.fromEntries(Object.entries(keys).map(([client, key]) => [key, client]));
  const ids = Object.fromEntries(Object.keys(keys).map((client) => [client, {
    user_id: `user-${client}`, agent_id: `id-${client}`, session_id: `session-${client}`,
  }]));
  const json = (response, status, body) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(body)); };
  const server = http.createServer(async (request, response) => {
    const path = new URL(request.url, 'http://standalone').pathname;
    const text = await new Promise((resolve) => { let value = ''; request.on('data', (chunk) => { value += chunk; }); request.on('end', () => resolve(value)); });
    const body = text ? JSON.parse(text) : {};
    const authorization = request.headers.authorization;
    const userKey = request.headers['x-tdai-user-key'];
    requests.push({ path, body, authorization, userKey, headers: request.headers });

    if (path === '/__mock/reset') return json(response, 200, { status: 'ok' });
    if (path === '/__mock/requests') {
      const cleanOpenAi = () => ({ path: '/openai/v1/chat/completions', header_names: ['accept', 'authorization', 'content-type'], ...(omitObservationFlags ? {} : { sensitive_value_seen: false, unexpected_credential_seen: false, memory_user_credential_seen: false }) });
      const requests = truncatedObservations && atomicCalls > 0 ? Array.from({ length: 100 }, cleanOpenAi) : [
        ...Array.from({ length: modelFetchCount }, () => ({ path: '/anthropic/v1/messages', header_names: ['accept', 'anthropic-version', 'content-type', 'user-agent', 'x-api-key', ...(vertexSessionHeader ? ['x-vertex-ai-session-id'] : []), ...(claudeSessionHeader ? ['x-claude-code-session-id'] : [])], ...(omitObservationFlags ? {} : { sensitive_value_seen: leakSentinel || (positiveLeakOnly && atomicCalls === 0), unexpected_credential_seen: unexpectedCredential, memory_user_credential_seen: memoryCredential }) })),
        ...Array.from({ length: coreModelFetchCount }, cleanOpenAi),
        ...Array.from({ length: countTokensFetchCount }, () => ({ path: '/anthropic/v1/messages/count_tokens', header_names: ['content-type', 'x-api-key'], ...(omitObservationFlags ? {} : { sensitive_value_seen: false, unexpected_credential_seen: false, memory_user_credential_seen: false }) })),
      ];
      json(response, 200, { requests });
      if (delayedCoreObservation === 1) {
        coreModelFetchCount += 1;
        delayedCoreObservation = 0;
      } else if (delayedCoreObservation > 1) delayedCoreObservation -= 1;
      return;
    }

    if (path === '/claude-code/default/v1/messages') {
      const key = authorization?.replace(/^Bearer /, '');
      const client = byKey[key];
      if (!client) {
        if (authNegativeCoreSideEffect) coreModelFetchCount += 1;
        if (authNegativeCountTokensSideEffect) countTokensFetchCount += 1;
        return json(response, 401, { type: 'error', error: { type: 'authentication_error' } });
      }
      const expected = ids[client];
      if (request.headers['x-conversation-id'] === expected.session_id && request.headers['x-agent-id'] !== expected.agent_id) {
        if (identityConflictCoreSideEffect) coreModelFetchCount += 1;
        return json(response, 409, { type: 'error', error: { type: 'identity_conflict' } });
      }
      if (request.headers['x-team-id'] !== 'team-1' || request.headers['x-agent-id'] !== expected.agent_id || request.headers['x-task-id'] !== 'task-1' || request.headers['x-conversation-id'] !== expected.session_id) return json(response, 400, { type: 'error' });
      const memoryNonce = JSON.stringify(body).match(/MEMORY_NONCE_[A-Z0-9_-]+/)?.[0];
      if (memoryNonce) nonce = memoryNonce;
      if (proxySkipsAnthropicForward) coreModelFetchCount = 1;
      else modelFetchCount += 1;
      if (sessionInitDelayedCoreSideEffect && !memoryNonce) delayedCoreObservation = 2;
      initializedSessions.push({ client, user_id: expected.user_id, agent_id: expected.agent_id, source: 'claude-code', session_id: expected.session_id });
      return json(response, 200, { id: 'msg-mock', type: 'message', role: 'assistant', model: 'mock-model', content: [{ type: 'text', text: 'stored' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } });
    }

    if (path === '/memory-bridge/v3/atomic/query') {
      const key = authorization?.replace(/^Bearer /, '');
      const client = byKey[key];
      if (!client || request.headers['x-conversation-id'] !== ids[client].session_id) return json(response, 401, { code: 401, data: null });
      const agentSource = request.headers['x-tdai-agent-source'];
      if (agentSource === undefined || !/^[a-z0-9-]+$/.test(agentSource)) {
        if (agentSource === undefined && bridgeMissingCoreSideEffect) coreModelFetchCount += 1;
        return json(response, 400, { code: 400, data: null });
      }
      if (agentSource !== 'claude-code') {
        if (bridgeForgedCoreSideEffect) coreModelFetchCount += 1;
        return json(response, 401, { code: 401, data: null });
      }
      if (!initializedSessions.some((session) => session.client === client && session.user_id === ids[client].user_id && session.source === agentSource && session.session_id === ids[client].session_id)) return json(response, 401, { code: 401, data: null });
      const shared = client === 'agent-b' && body.agent_id === ids['agent-a'].agent_id;
      const content = shared ? `shared ${nonce}` : `isolated-${client}`;
      const owner = shared ? ids['agent-a'] : ids[client];
      return json(response, 200, { code: 0, message: 'ok', request_id: 'bridge', data: { items: [{ id: `memory-${client}`, type: 'instruction', content, team_id: 'team-1', user_id: shared && wrongSharedOwner ? ids['agent-b'].user_id : owner.user_id, agent_id: owner.agent_id, task_id: 'task-1' }] } });
    }

    if (path === '/v3/conversation/query' || path === '/v3/atomic/query') {
      if (authorization !== `Bearer ${gatewayToken}` || request.headers['x-tdai-service-id'] !== 'default' || userKey !== keys['agent-a']) return json(response, 401, { code: 401, data: null });
      if (body.team_id !== 'team-1' || body.user_id !== ids['agent-a'].user_id || body.agent_id !== ids['agent-a'].agent_id || body.task_id !== 'task-1') return json(response, 403, { code: 403, data: null });
      if (path.endsWith('/conversation/query')) return json(response, 200, { code: 0, message: 'ok', request_id: 'l0', data: { messages: [{ id: 'message-a', role: 'user', content: nonce, team_id: 'team-1', user_id: ids['agent-a'].user_id, agent_id: ids['agent-a'].agent_id, task_id: 'task-1' }], total: 1 } });
      atomicCalls += 1;
      return json(response, 200, { code: l1BusinessErrorWithItems && atomicCalls >= 2 ? 503 : 0, message: 'ok', request_id: 'l1', data: { items: atomicCalls < 2 ? [] : [{ id: 'memory-a', type: 'instruction', content: `memory ${nonce}`, team_id: 'team-1', user_id: ids['agent-a'].user_id, agent_id: ids['agent-a'].agent_id, task_id: 'task-1' }], total: atomicCalls < 2 ? 0 : 1 } });
    }
    return json(response, 404, { code: 404 });
  });
  await ensureFetchSafeServer(server);
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, requests, ids, initializedSessions, get atomicCalls() { return atomicCalls; }, close: () => new Promise((resolve) => server.close(resolve)) };
}

test('runner writes both evidence files through a protected no-follow atomic writer', async () => {
  const { writeEvidence } = await import('../tools/test-runner.mjs');
  const root = await mkdtemp(join(tmpdir(), 'memory-runner-evidence-'));
  const outside = await mkdtemp(join(tmpdir(), 'memory-runner-evidence-outside-'));
  try {
    const outputDir = join(root, 'evidence');
    await mkdir(outputDir);
    for (const filename of ['mock-contract.json', 'standalone-memory.json']) {
      const outsideFile = join(outside, filename);
      const destination = join(outputDir, filename);
      await writeFile(outsideFile, 'outside-sentinel');
      await link(outsideFile, destination);
      await assert.rejects(async () => writeEvidence(outputDir, filename, { status: 'ok' }), /unsafe evidence/);
      assert.equal(await readFile(outsideFile, 'utf8'), 'outside-sentinel');
      await rm(destination);
      await writeEvidence(outputDir, filename, { status: 'ok' });
      assert.deepEqual(JSON.parse(await readFile(destination, 'utf8')), { status: 'ok' });
      if (process.platform !== 'win32') assert.equal((await stat(destination)).mode & 0o777, 0o600);
    }
    const linkedDir = join(root, 'linked-evidence');
    await symlink(outside, linkedDir, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(async () => writeEvidence(linkedDir, 'standalone-memory.json', { status: 'ok' }), /unsafe evidence/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('runner validates sanitized manifest and writes only mock contract evidence', async () => {
  const { runMockContract } = await import('../tools/test-runner.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'memory-runner-'));
  const m = await mock();
  try {
    const manifest = join(directory, 'run-manifest.json');
    const outputDir = join(directory, 'evidence');
    await writeFile(manifest, JSON.stringify({ run_id: 'run-1', service_id: 'default', team_id: 'team-1', task_id: 'task-1', clients: { 'agent-a': { user_id: 'usr-1', agent_id: 'agt-1', session_id: 'session-1', credential_file: 'credentials/agent-a.user-key', display_name: 'agent-a' } } }));
    await mkdir(join(directory, 'credentials'));
    await writeFile(join(directory, 'credentials', 'agent-a.user-key'), `sk-mem-${'A'.repeat(32)}\n`);
    await runMockContract({ manifestPath: manifest, baseUrl: m.baseUrl, outputDir });
    const result = JSON.parse(await readFile(join(outputDir, 'mock-contract.json'), 'utf8'));
    assert.equal(result.status, 'ok');
    assert.ok(result.assertions.some((entry) => entry.name === 'anthropic-thinking-stream'));
    assert.doesNotMatch(JSON.stringify(result), /sk-mem-|authorization|messages/);
  } finally { await m.close(); await rm(directory, { recursive: true, force: true }); }
});

test('runner rejects manifests that contain credential fields or key-shaped values', async () => {
  const { validateManifest } = await import('../tools/test-runner.mjs');
  assert.throws(() => validateManifest({ run_id: 'run-1', api_key: 'not-allowed' }), /invalid manifest/);
  assert.throws(() => validateManifest({ run_id: 'run-1', token: `sk-mem-${'A'.repeat(32)}` }), /invalid manifest/);
});

test('runner requires a portable credentials-relative credential_file path', async () => {
  const { validateManifest } = await import('../tools/test-runner.mjs');
  const base = { run_id: 'run-1', service_id: 'default', team_id: 'team-1', task_id: 'task-1', clients: { a: { user_id: 'usr-1', agent_id: 'agt-1', session_id: 'session-1', credential_file: 'credentials/a.user-key', display_name: 'a' } } };
  validateManifest(base, process.cwd());
  for (const credentialFile of ['C:outside.user-key', 'C:\\outside.user-key', '/outside.user-key', '\\outside.user-key', 'credentials\\a.user-key', 'credentials/./a.user-key', 'credentials/../a.user-key', 'credentials//a.user-key', 'other/a.user-key', 'credentials/']) {
    const manifest = structuredClone(base);
    manifest.clients.a.credential_file = credentialFile;
    assert.throws(() => validateManifest(manifest, process.cwd()), /invalid manifest/);
  }
});

test('runner fails closed on malformed manifest input without echoing it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'memory-runner-malformed-'));
  const marker = `sk-mem-${'Z'.repeat(32)}`;
  try {
    const manifest = join(directory, 'run-manifest.json');
    await writeFile(manifest, `{"marker":"${marker}`);
    const tool = fileURLToPath(new URL('../tools/test-runner.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [tool, '--manifest', manifest, '--scenario', 'mock-contract'], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /invalid manifest/);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(marker));
    for (const malformedArgs of [
      ['--manifest', manifest, '--scenario', 'mock-contract', '--output-dir'],
      ['--manifest', manifest, '--scenario', 'mock-contract', '--scenario', 'standalone-memory'],
      ['--manifest', manifest, '--scenario', 'mock-contract', '--unknown', 'value'],
    ]) {
      const malformed = spawnSync(process.execPath, [tool, ...malformedArgs], { encoding: 'utf8' });
      assert.notEqual(malformed.status, 0);
      assert.match(`${malformed.stdout}${malformed.stderr}`, /invalid arguments/);
      assert.doesNotMatch(`${malformed.stdout}${malformed.stderr}`, new RegExp(marker));
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('standalone runner proves auth, owner oracles, B sharing, C isolation, conflicts, and upstream header hygiene with sanitized evidence', async () => {
  const { runStandaloneMemory } = await import('../tools/test-runner.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'memory-runner-standalone-'));
  const keys = Object.fromEntries(['agent-a', 'agent-b', 'agent-c'].map((client, index) => [client, `sk-mem-${String.fromCharCode(65 + index).repeat(32)}`]));
  const gatewayToken = 'runner-gateway-token';
  const topology = await standaloneTopology(keys, gatewayToken, { sessionInitDelayedCoreSideEffect: true });
  try {
    const credentials = join(directory, 'credentials');
    await mkdir(credentials);
    for (const [client, key] of Object.entries(keys)) await writeFile(join(credentials, `${client}.user-key`), `${key}\n`);
    const manifestPath = join(directory, 'run-manifest.json');
    await writeFile(manifestPath, JSON.stringify({
      run_id: 'run-standalone-1', service_id: 'default', team_id: 'team-1', task_id: 'task-1',
      clients: Object.fromEntries(Object.keys(keys).map((client) => [client, { ...topology.ids[client], credential_file: `credentials/${client}.user-key`, display_name: client }])),
      shared_memory: { asset_ids: ['chat_memory-team-1-id-agent-a'], source: 'agent-a', consumers: ['agent-b'], excluded: ['agent-c'] },
    }));
    const gatewayTokenFile = join(directory, 'gateway.token');
    await writeFile(gatewayTokenFile, `${gatewayToken}\n`);
    const outputDir = join(directory, 'evidence');
    const result = await runStandaloneMemory({
      manifestPath, proxyUrl: topology.baseUrl, coreUrl: topology.baseUrl, mockUrl: topology.baseUrl,
      gatewayTokenFile, outputDir, pollAttempts: 3, pollIntervalMs: 1,
    });
    assert.equal(result.status, 'ok');
    assert.match(result.hash, /^[a-f0-9]{64}$/);
    assert.ok(result.assertions.length >= 8);
    assert.ok(result.assertions.every((entry) => Object.keys(entry).sort().join() === 'count,latency_ms,name,status'));
    assert.ok(result.assertions.every((entry) => Number.isInteger(entry.status) && Number.isInteger(entry.count) && Number.isInteger(entry.latency_ms)));
    assert.ok(topology.atomicCalls >= 2);
    assert.equal(result.assertions.find((entry) => entry.name === 'proxy-auth-negative').count, 0);
    assert.equal(result.assertions.find((entry) => entry.name === 'identity-conflict').count, 0);
    assert.deepEqual(result.assertions.filter((entry) => ['consumer-session-init', 'excluded-session-init'].includes(entry.name)).map(({ name, status, count }) => ({ name, status, count })), [
      { name: 'consumer-session-init', status: 200, count: 1 },
      { name: 'excluded-session-init', status: 200, count: 1 },
    ]);
    assert.equal(result.assertions.find((entry) => entry.name === 'bridge-agent-source-missing').status, 400);
    assert.equal(result.assertions.find((entry) => entry.name === 'bridge-agent-source-missing').count, 0);
    assert.equal(result.assertions.find((entry) => entry.name === 'bridge-agent-source-forged').status, 401);
    assert.equal(result.assertions.find((entry) => entry.name === 'bridge-agent-source-forged').count, 0);
    assert.ok(topology.requests.some((request) => request.path === '/claude-code/default/v1/messages' && request.authorization === `Bearer sk-mem-${'Z'.repeat(32)}`));
    const validProxyRequest = topology.requests.find((request) => request.path === '/claude-code/default/v1/messages' && request.authorization === `Bearer ${keys['agent-a']}` && request.headers['x-agent-id'] === topology.ids['agent-a'].agent_id);
    assert.match(validProxyRequest?.headers['x-claude-code-session-id'] ?? '', /^MEMORY_IDENTITY_LEAK_SENTINEL_/);
    assert.match(validProxyRequest?.headers['x-vertex-ai-session-id'] ?? '', /^MEMORY_IDENTITY_LEAK_SENTINEL_/);
    for (const client of ['agent-b', 'agent-c']) {
      const initRequest = topology.requests.find((request) => request.path === '/claude-code/default/v1/messages' && request.authorization === `Bearer ${keys[client]}`);
      assert.ok(initRequest);
      assert.equal(initRequest.headers['anthropic-version'], '2023-06-01');
      assert.equal(initRequest.headers['x-team-id'], 'team-1');
      assert.equal(initRequest.headers['x-agent-id'], topology.ids[client].agent_id);
      assert.equal(initRequest.headers['x-task-id'], 'task-1');
      assert.equal(initRequest.headers['x-conversation-id'], topology.ids[client].session_id);
      assert.match(initRequest.headers['x-claude-code-session-id'] ?? '', /^MEMORY_IDENTITY_LEAK_SENTINEL_/);
      assert.match(initRequest.headers['x-vertex-ai-session-id'] ?? '', /^MEMORY_IDENTITY_LEAK_SENTINEL_/);
      assert.match(initRequest.headers['x-wecom-id'] ?? '', /^MEMORY_LEAK_SENTINEL_/);
      assert.match(initRequest.headers['x-tdai-service-token'] ?? '', /^MEMORY_GATEWAY_LEAK_SENTINEL_/);
      assert.doesNotMatch(JSON.stringify(initRequest.body), /MEMORY_/);
    }
    assert.deepEqual(topology.initializedSessions, [
      { client: 'agent-a', user_id: 'user-agent-a', agent_id: 'id-agent-a', source: 'claude-code', session_id: 'session-agent-a' },
      { client: 'agent-b', user_id: 'user-agent-b', agent_id: 'id-agent-b', source: 'claude-code', session_id: 'session-agent-b' },
      { client: 'agent-c', user_id: 'user-agent-c', agent_id: 'id-agent-c', source: 'claude-code', session_id: 'session-agent-c' },
    ]);
    const requestIndex = (predicate) => topology.requests.findIndex(predicate);
    const lastRequestIndex = (predicate) => topology.requests.reduce((found, request, index) => predicate(request) ? index : found, -1);
    const orderedRequests = [
      lastRequestIndex((request) => request.path === '/v3/atomic/query'),
      requestIndex((request) => request.path === '/claude-code/default/v1/messages' && request.authorization === `Bearer ${keys['agent-a']}` && request.headers['x-agent-id'] === topology.ids['agent-b'].agent_id),
      requestIndex((request) => request.path === '/memory-bridge/v3/atomic/query' && request.headers['x-tdai-agent-source'] === undefined),
      requestIndex((request) => request.path === '/memory-bridge/v3/atomic/query' && request.headers['x-tdai-agent-source'] === 'forged-client'),
      requestIndex((request) => request.path === '/claude-code/default/v1/messages' && request.authorization === `Bearer ${keys['agent-b']}`),
      requestIndex((request) => request.path === '/memory-bridge/v3/atomic/query' && request.authorization === `Bearer ${keys['agent-b']}` && request.headers['x-tdai-agent-source'] === 'claude-code'),
      requestIndex((request) => request.path === '/claude-code/default/v1/messages' && request.authorization === `Bearer ${keys['agent-c']}`),
      requestIndex((request) => request.path === '/memory-bridge/v3/atomic/query' && request.authorization === `Bearer ${keys['agent-c']}` && request.headers['x-tdai-agent-source'] === 'claude-code'),
      lastRequestIndex((request) => request.path === '/__mock/requests'),
    ];
    assert.ok(orderedRequests.every((index, position) => index >= 0 && (position === 0 || index > orderedRequests[position - 1])));
    assert.ok(topology.requests.some((request) => request.path === '/memory-bridge/v3/atomic/query' && request.authorization === `Bearer ${keys['agent-b']}`));
    const bridgeRequests = topology.requests.filter((request) => request.path === '/memory-bridge/v3/atomic/query');
    assert.ok(bridgeRequests.some((request) => request.headers['x-tdai-agent-source'] === undefined));
    assert.ok(bridgeRequests.some((request) => request.headers['x-tdai-agent-source'] === 'forged-client'));
    assert.ok(bridgeRequests.filter((request) => [keys['agent-b'], keys['agent-c']].includes(request.authorization?.replace('Bearer ', ''))).some((request) => request.headers['x-tdai-agent-source'] === 'claude-code'));
    const serialized = JSON.stringify(result);
    for (const forbidden of [...Object.values(keys), gatewayToken, 'MEMORY_NONCE_', 'MEMORY_LEAK_SENTINEL_', 'MEMORY_GATEWAY_LEAK_SENTINEL_', 'team-1', 'id-agent-a', 'session-agent-a', 'authorization', 'messages', 'content']) assert.doesNotMatch(serialized, new RegExp(forbidden, 'i'));
    assert.deepEqual(JSON.parse(await readFile(join(outputDir, 'standalone-memory.json'), 'utf8')), result);
  } finally { await topology.close(); await rm(directory, { recursive: true, force: true }); }
});

test('standalone runner rejects a sensitive value, internal header, or invalid observation at Mock upstream', async () => {
  const { runStandaloneMemory } = await import('../tools/test-runner.mjs');
  const keys = Object.fromEntries(['agent-a', 'agent-b', 'agent-c'].map((client, index) => [client, `sk-mem-${String.fromCharCode(65 + index).repeat(32)}`]));
  const gatewayToken = 'runner-gateway-token';
  for (const [index, options] of [{ leakSentinel: true }, { positiveLeakOnly: true }, { truncatedObservations: true }, { unexpectedCredential: true }, { memoryCredential: true }, { omitObservationFlags: true }, { wrongSharedOwner: true }, { vertexSessionHeader: true }, { claudeSessionHeader: true }, { l1BusinessErrorWithItems: true }, { proxySkipsAnthropicForward: true }, { authNegativeCoreSideEffect: true }, { authNegativeCountTokensSideEffect: true }, { identityConflictCoreSideEffect: true }, { bridgeMissingCoreSideEffect: true }, { bridgeForgedCoreSideEffect: true }].entries()) {
    const directory = await mkdtemp(join(tmpdir(), `memory-runner-leak-${index}-`));
    const topology = await standaloneTopology(keys, gatewayToken, options);
    try {
      await mkdir(join(directory, 'credentials'));
      for (const [client, key] of Object.entries(keys)) await writeFile(join(directory, 'credentials', `${client}.user-key`), `${key}\n`);
      const manifestPath = join(directory, 'run-manifest.json');
      await writeFile(manifestPath, JSON.stringify({
        run_id: `run-leak-${index}`, service_id: 'default', team_id: 'team-1', task_id: 'task-1',
        clients: Object.fromEntries(Object.keys(keys).map((client) => [client, { ...topology.ids[client], credential_file: `credentials/${client}.user-key`, display_name: client }])),
        shared_memory: { asset_ids: ['chat_memory-team-1-id-agent-a'], source: 'agent-a', consumers: ['agent-b'], excluded: ['agent-c'] },
      }));
      const gatewayTokenFile = join(directory, 'gateway.token');
      await writeFile(gatewayTokenFile, `${gatewayToken}\n`);
      const outputDir = join(directory, 'evidence');
      let failure;
      try {
        await runStandaloneMemory({ manifestPath, proxyUrl: topology.baseUrl, coreUrl: topology.baseUrl, mockUrl: topology.baseUrl, gatewayTokenFile, outputDir, pollAttempts: 3, pollIntervalMs: 1 });
      } catch (error) { failure = error; }
      assert.ok(failure instanceof Error);
      if (options.wrongSharedOwner) {
        assert.equal(failure.message, 'standalone memory contract failed assertion=consumer-shared-bridge');
        assert.doesNotMatch(failure.message, /sk-mem-|runner-gateway-token|MEMORY_|team-1|task-1|(?:user|id|session)-agent-|authorization|\/(?:memory-bridge|claude-code|v3)\//i);
      } else assert.match(failure.message, /standalone memory contract failed/);
      await assert.rejects(readFile(join(outputDir, 'standalone-memory.json'), 'utf8'), { code: 'ENOENT' });
    } finally { await topology.close(); await rm(directory, { recursive: true, force: true }); }
  }
});
