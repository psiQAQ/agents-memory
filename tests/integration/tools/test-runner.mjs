import { chmod, lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { isMain } from './runtime-lib.mjs';

const runIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const userKeyPattern = /^sk-mem-[A-Za-z0-9_-]{32}$/;
const cliArguments = new Set(['--manifest', '--scenario', '--gateway-token-file', '--output-dir']);

function parseArgs(argv) {
  if (argv.length === 0 || argv.length % 2 !== 0) throw new Error('invalid arguments');
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!cliArguments.has(name) || Object.hasOwn(values, name) || !value) throw new Error('invalid arguments');
    values[name] = value;
  }
  return values;
}

function invalid() { throw new Error('invalid manifest'); }

export async function writeEvidence(outputDir, filename, value) {
  if (!isAbsolute(outputDir ?? '') || !['mock-contract.json', 'standalone-memory.json'].includes(filename)) throw new Error('unsafe evidence');
  const destination = join(outputDir, filename);
  const temporary = join(outputDir, `.${filename}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await mkdir(outputDir, { recursive: true, mode: 0o700 });
    const directoryMetadata = await lstat(outputDir);
    if (directoryMetadata.isSymbolicLink() || !directoryMetadata.isDirectory()) throw new Error();
    try {
      await lstat(destination);
      throw new Error();
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    const temporaryMetadata = await lstat(temporary);
    if (temporaryMetadata.isSymbolicLink() || !temporaryMetadata.isFile() || temporaryMetadata.nlink !== 1) throw new Error();
    await chmod(temporary, 0o600);
    await rename(temporary, destination);
    const destinationMetadata = await lstat(destination);
    if (destinationMetadata.isSymbolicLink() || !destinationMetadata.isFile() || destinationMetadata.nlink !== 1) throw new Error();
    await chmod(destination, 0o600);
  } catch {
    await unlink(temporary).catch(() => {});
    throw new Error('unsafe evidence');
  }
}

function inspect(value, name = '') {
  if (/(?:key|token|secret)/i.test(name) && name !== 'credential_file') invalid();
  if (typeof value === 'string' && /(sk-mem-|deepseek|api[_-]?key)/i.test(value)) invalid();
  if (value && typeof value === 'object') for (const [childName, child] of Object.entries(value)) inspect(child, childName);
}

function validCredentialPath(value, manifestDirectory) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes(':') || isAbsolute(value)) return false;
  const parts = value.split('/');
  if (parts[0] !== 'credentials' || parts.length < 2 || parts.some((part) => !part || part === '.' || part === '..')) return false;
  const credentialsDirectory = resolve(manifestDirectory, 'credentials');
  const destination = resolve(manifestDirectory, ...parts);
  const fromCredentials = relative(credentialsDirectory, destination);
  return Boolean(fromCredentials) && !fromCredentials.startsWith('..') && !isAbsolute(fromCredentials);
}

export function validateManifest(manifest, manifestDirectory = process.cwd()) {
  inspect(manifest);
  if (!manifest || typeof manifest !== 'object' || !runIdPattern.test(manifest.run_id) || !['service_id', 'team_id', 'task_id'].every((name) => identityPattern.test(manifest[name]))) invalid();
  if (!manifest.clients || typeof manifest.clients !== 'object' || Array.isArray(manifest.clients) || Object.keys(manifest.clients).length === 0) invalid();
  for (const client of Object.values(manifest.clients)) {
    if (!client || typeof client !== 'object' || !['user_id', 'agent_id', 'session_id'].every((name) => identityPattern.test(client[name])) || !['credential_file', 'display_name'].every((name) => typeof client[name] === 'string' && client[name])) invalid();
    if (!validCredentialPath(client.credential_file, manifestDirectory)) invalid();
  }
  return manifest;
}

function validateSharedMemory(manifest) {
  const shared = manifest.shared_memory;
  if (!shared || typeof shared !== 'object' || !Array.isArray(shared.asset_ids) || shared.asset_ids.length === 0 || !shared.asset_ids.every((value) => identityPattern.test(value))) invalid();
  if (typeof shared.source !== 'string' || !manifest.clients[shared.source]) invalid();
  for (const name of ['consumers', 'excluded']) if (!Array.isArray(shared[name]) || shared[name].some((client) => typeof client !== 'string' || !manifest.clients[client]) || new Set(shared[name]).size !== shared[name].length) invalid();
  const assignments = [shared.source, ...shared.consumers, ...shared.excluded];
  if (new Set(assignments).size !== assignments.length || shared.consumers.length === 0 || shared.excluded.length === 0) invalid();
  return shared;
}

async function readPrivateLine(path, pattern, message) {
  try {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1) throw new Error();
    const value = (await readFile(path, 'utf8')).replace(/\r?\n$/, '');
    if (!pattern.test(value)) throw new Error();
    return value;
  } catch { throw new Error(message); }
}

async function jsonRequest(url, { method = 'POST', headers = {}, body, timeoutMs = 10000 } = {}) {
  let response;
  try {
    response = await fetch(url, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(timeoutMs) });
  } catch { throw new Error('standalone memory contract failed'); }
  let data;
  try { data = await response.json(); } catch { throw new Error('standalone memory contract failed'); }
  return { response, data };
}

async function record(assertions, name, action) {
  const started = performance.now();
  const assertion = typeof name === 'string' && /^[a-z0-9-]{1,64}$/.test(name) ? name : 'unknown';
  try {
    const result = await action();
    assertions.push({ name: assertion, status: result.status, count: result.count, latency_ms: Math.round(performance.now() - started) });
  } catch {
    throw new Error(`standalone memory contract failed assertion=${assertion}`);
  }
}

function ownerFields(manifest, client) {
  return {
    team_id: manifest.team_id,
    user_id: manifest.clients[client].user_id,
    agent_id: manifest.clients[client].agent_id,
    task_id: manifest.task_id,
  };
}

function containsOwnedNonce(items, nonce, owner) {
  return items.filter((item) => item && typeof item === 'object' && typeof item.content === 'string' && item.content.includes(nonce)
    && item.team_id === owner.team_id && item.user_id === owner.user_id && item.agent_id === owner.agent_id && item.task_id === owner.task_id);
}

export async function runStandaloneMemory({ manifestPath, proxyUrl, coreUrl, mockUrl, gatewayTokenFile, outputDir, pollAttempts = 30, pollIntervalMs = 1000 }) {
  if (![manifestPath, gatewayTokenFile, outputDir].every((path) => isAbsolute(path ?? '')) || ![proxyUrl, coreUrl, mockUrl].every((value) => /^https?:\/\//.test(value ?? '')) || !Number.isInteger(pollAttempts) || pollAttempts < 1 || pollAttempts > 120 || !Number.isInteger(pollIntervalMs) || pollIntervalMs < 0 || pollIntervalMs > 10000) throw new Error('invalid standalone arguments');
  let manifest;
  try { manifest = validateManifest(JSON.parse(await readFile(manifestPath, 'utf8')), dirname(resolve(manifestPath))); } catch { throw new Error('invalid manifest'); }
  const shared = validateSharedMemory(manifest);
  const manifestDirectory = dirname(resolve(manifestPath));
  const keys = {};
  for (const client of [shared.source, ...shared.consumers, ...shared.excluded]) {
    keys[client] = await readPrivateLine(resolve(manifestDirectory, manifest.clients[client].credential_file), userKeyPattern, 'invalid credential');
  }
  const gatewayToken = await readPrivateLine(gatewayTokenFile, /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/, 'invalid gateway token');
  const source = shared.source;
  const consumer = shared.consumers[0];
  const excluded = shared.excluded[0];
  const sourceOwner = ownerFields(manifest, source);
  const hash = createHash('sha256').update(`${manifest.run_id}:${shared.asset_ids.join(',')}`).digest('hex');
  const nonce = `MEMORY_NONCE_${hash.slice(0, 20).toUpperCase()}`;
  const leakSentinel = `MEMORY_LEAK_SENTINEL_${hash.slice(20, 40).toUpperCase()}`;
  const gatewayLeakSentinel = `MEMORY_GATEWAY_LEAK_SENTINEL_${hash.slice(40, 60).toUpperCase()}`;
  const identityLeakSentinel = `MEMORY_IDENTITY_LEAK_SENTINEL_${hash.slice(0, 20).toUpperCase()}`;
  const assertions = [];
  const forbiddenModelHeaders = new Set(['cookie', 'cf-access-jwt-assertion', 'x-agent-id', 'x-claude-code-session-id', 'x-conversation-id', 'x-forwarded-for', 'x-forwarded-host', 'x-task-id', 'x-tdai-agent-source', 'x-tdai-service-id', 'x-tdai-service-token', 'x-tdai-user-key', 'x-team-id', 'x-vertex-ai-session-id', 'x-wechat-work-id', 'x-wecom-id']);
  const unsafeObservation = (request) =>
    !['sensitive_value_seen', 'unexpected_credential_seen', 'memory_user_credential_seen'].every((name) => typeof request?.[name] === 'boolean') ||
    request.sensitive_value_seen || request.unexpected_credential_seen || request.memory_user_credential_seen ||
    !Array.isArray(request?.header_names) || request.header_names.some((name) => forbiddenModelHeaders.has(String(name).toLowerCase()));
  const proxyEndpoint = new URL(`/claude-code/${manifest.service_id}/v1/messages`, proxyUrl);
  const proxyHeaders = (client, overrides = {}) => ({
    authorization: `Bearer ${keys[client]}`,
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01',
    'x-team-id': manifest.team_id,
    'x-agent-id': manifest.clients[client].agent_id,
    'x-task-id': manifest.task_id,
    'x-conversation-id': manifest.clients[client].session_id,
    'x-claude-code-session-id': identityLeakSentinel,
    'x-vertex-ai-session-id': identityLeakSentinel,
    'x-wecom-id': leakSentinel,
    'x-tdai-service-token': gatewayLeakSentinel,
    ...overrides,
  });
  const anthropicBody = { model: 'mock-model', max_tokens: 128, stream: false, messages: [{ role: 'user', content: `请长期记住 ${nonce}` }] };
  const mockRequests = async () => {
    const result = await jsonRequest(new URL('/__mock/requests', mockUrl), { method: 'GET' });
    const requests = result.data?.requests;
    if (!result.response.ok || !Array.isArray(requests)) throw new Error('standalone memory contract failed');
    return {
      status: result.response.status,
      requests,
      modelFetchCount: requests.filter((request) => request?.path === '/anthropic/v1/messages').length,
      allModelFetchCount: requests.filter((request) => ['/anthropic/v1/messages', '/anthropic/v1/messages/count_tokens', '/openai/v1/chat/completions'].includes(request?.path)).length,
    };
  };

  await jsonRequest(new URL('/__mock/reset', mockUrl), { headers: { 'content-type': 'application/json' }, body: {} });
  await record(assertions, 'proxy-auth-negative', async () => {
    const before = await mockRequests();
    const invalidKey = `sk-mem-${'Z'.repeat(32)}`;
    const { response } = await jsonRequest(proxyEndpoint, { headers: { ...proxyHeaders(source), authorization: `Bearer ${invalidKey}` }, body: anthropicBody });
    const after = await mockRequests();
    const modelFetches = after.allModelFetchCount - before.allModelFetchCount;
    if (response.status !== 401 || modelFetches !== 0) throw new Error('standalone memory contract failed');
    return { status: response.status, count: modelFetches };
  });
  await record(assertions, 'proxy-write-positive', async () => {
    const before = await mockRequests();
    const { response, data } = await jsonRequest(proxyEndpoint, { headers: proxyHeaders(source), body: anthropicBody });
    const after = await mockRequests();
    const modelFetches = after.modelFetchCount - before.modelFetchCount;
    const newAnthropic = after.requests.filter((request) => request?.path === '/anthropic/v1/messages').slice(before.modelFetchCount);
    if (!response.ok || data?.type !== 'message' || modelFetches !== 1 || newAnthropic.length !== 1 || newAnthropic.some(unsafeObservation)) throw new Error('standalone memory contract failed');
    return { status: response.status, count: modelFetches };
  });

  const coreHeaders = { authorization: `Bearer ${gatewayToken}`, 'x-tdai-service-id': manifest.service_id, 'x-tdai-user-key': keys[source], 'content-type': 'application/json' };
  await record(assertions, 'core-l0-owner-oracle', async () => {
    const { response, data } = await jsonRequest(new URL('/v3/conversation/query', coreUrl), { headers: coreHeaders, body: { ...sourceOwner, session_id: manifest.clients[source].session_id, limit: 100, offset: 0 } });
    const items = data?.data?.messages;
    const matched = Array.isArray(items) ? containsOwnedNonce(items, nonce, sourceOwner) : [];
    if (!response.ok || data?.code !== 0 || matched.length === 0) throw new Error('standalone memory contract failed');
    return { status: response.status, count: matched.length };
  });
  await record(assertions, 'core-l1-owner-oracle', async () => {
    let response;
    let businessCode;
    let matched = [];
    for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
      const result = await jsonRequest(new URL('/v3/atomic/query', coreUrl), { headers: coreHeaders, body: { ...sourceOwner, limit: 100, offset: 0 } });
      response = result.response;
      businessCode = result.data?.code;
      const items = result.data?.data?.items;
      matched = Array.isArray(items) ? containsOwnedNonce(items, nonce, sourceOwner) : [];
      if (response.ok && businessCode === 0 && matched.length > 0) break;
      if (attempt + 1 < pollAttempts && pollIntervalMs > 0) await new Promise((resolveDelay) => setTimeout(resolveDelay, pollIntervalMs));
    }
    if (!response?.ok || businessCode !== 0 || matched.length === 0) throw new Error('standalone memory contract failed');
    return { status: response.status, count: matched.length };
  });

  const initializeSession = async (client, name) => record(assertions, name, async () => {
    const before = await mockRequests();
    const body = { ...anthropicBody, messages: [{ role: 'user', content: 'Initialize this standalone test session.' }] };
    const { response, data } = await jsonRequest(proxyEndpoint, { headers: proxyHeaders(client), body });
    const after = await mockRequests();
    const modelFetches = after.modelFetchCount - before.modelFetchCount;
    const newAnthropic = after.requests.filter((request) => request?.path === '/anthropic/v1/messages').slice(before.modelFetchCount);
    if (!response.ok || data?.type !== 'message' || modelFetches !== 1 || newAnthropic.length !== 1 || newAnthropic.some(unsafeObservation)) throw new Error('standalone memory contract failed');
    return { status: response.status, count: modelFetches };
  });

  const bridge = async (client, { agentSource = 'claude-code' } = {}) => jsonRequest(new URL('/memory-bridge/v3/atomic/query', proxyUrl), {
    headers: { authorization: `Bearer ${keys[client]}`, 'content-type': 'application/json', 'x-tdai-service-id': manifest.service_id, 'x-conversation-id': manifest.clients[client].session_id, ...(agentSource === null ? {} : { 'x-tdai-agent-source': agentSource }) },
    body: { agent_id: manifest.clients[source].agent_id, limit: 100, offset: 0 },
  });
  await record(assertions, 'identity-conflict', async () => {
    const before = await mockRequests();
    const { response } = await jsonRequest(proxyEndpoint, { headers: proxyHeaders(source, { 'x-agent-id': manifest.clients[consumer].agent_id }), body: anthropicBody });
    const after = await mockRequests();
    const modelFetches = after.allModelFetchCount - before.allModelFetchCount;
    if (response.status !== 409 || modelFetches !== 0) throw new Error('standalone memory contract failed');
    return { status: response.status, count: modelFetches };
  });
  await record(assertions, 'bridge-agent-source-missing', async () => {
    const before = await mockRequests();
    const { response } = await bridge(consumer, { agentSource: null });
    const after = await mockRequests();
    const modelFetches = after.allModelFetchCount - before.allModelFetchCount;
    if (response.status !== 400 || modelFetches !== 0) throw new Error('standalone memory contract failed');
    return { status: response.status, count: modelFetches };
  });
  await record(assertions, 'bridge-agent-source-forged', async () => {
    const before = await mockRequests();
    const { response } = await bridge(consumer, { agentSource: 'forged-client' });
    const after = await mockRequests();
    const modelFetches = after.allModelFetchCount - before.allModelFetchCount;
    if (response.status !== 401 || modelFetches !== 0) throw new Error('standalone memory contract failed');
    return { status: response.status, count: modelFetches };
  });
  await initializeSession(consumer, 'consumer-session-init');
  await record(assertions, 'consumer-shared-bridge', async () => {
    const { response, data } = await bridge(consumer);
    const items = Array.isArray(data?.data?.items) ? data.data.items : [];
    const matched = containsOwnedNonce(items, nonce, sourceOwner);
    if (!response.ok || data?.code !== 0 || matched.length === 0) throw new Error('standalone memory contract failed');
    return { status: response.status, count: matched.length };
  });
  await initializeSession(excluded, 'excluded-session-init');
  await record(assertions, 'excluded-client-isolation', async () => {
    const { response, data } = await bridge(excluded);
    const items = Array.isArray(data?.data?.items) ? data.data.items : [];
    const matched = items.filter((item) => typeof item?.content === 'string' && item.content.includes(nonce));
    if (!response.ok || data?.code !== 0 || matched.length !== 0) throw new Error('standalone memory contract failed');
    return { status: response.status, count: matched.length };
  });
  await record(assertions, 'mock-upstream-header-hygiene', async () => {
    const { status, requests } = await mockRequests();
    if (requests.length === 0 || requests.length >= 100 || requests.some(unsafeObservation)) throw new Error('standalone memory contract failed');
    return { status, count: requests.length };
  });

  const result = { status: 'ok', hash, assertions };
  await writeEvidence(outputDir, 'standalone-memory.json', result);
  return result;
}

async function request(baseUrl, path, body, fixture = 'text', timeout = 1000) {
  return fetch(new URL(path, baseUrl), { method: 'POST', headers: { 'content-type': 'application/json', 'x-mock-fixture': fixture }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
}

async function check(assertions, name, action) {
  const started = performance.now();
  const value = await action();
  assertions.push({ name, status: value.status, elapsed_ms: Math.round(performance.now() - started), ...(value.usage ? { usage: value.usage } : {}) });
}

export async function runMockContract({ manifestPath, baseUrl, outputDir }) {
  let manifest;
  try { manifest = validateManifest(JSON.parse(await readFile(manifestPath, 'utf8')), dirname(resolve(manifestPath))); } catch { throw new Error('invalid manifest'); }
  const assertions = [];
  await check(assertions, 'openai-text', async () => { const response = await request(baseUrl, '/openai/v1/chat/completions', { model: 'mock', messages: [] }); const body = await response.json(); if (!response.ok || body.choices?.[0]?.message?.content !== 'mock text') throw new Error('mock contract failed'); return { status: response.status, usage: body.usage }; });
  await check(assertions, 'openai-stream', async () => { const response = await request(baseUrl, '/openai/v1/chat/completions', { model: 'mock', messages: [], stream: true }); if (!response.ok || !(await response.text()).includes('data: [DONE]')) throw new Error('mock contract failed'); return { status: response.status }; });
  await check(assertions, 'openai-tool', async () => { const response = await request(baseUrl, '/openai/v1/chat/completions', { model: 'mock', messages: [], tools: [{ type: 'function', function: { name: 'echo' } }] }, 'tool'); const body = await response.json(); if (!response.ok || body.choices?.[0]?.finish_reason !== 'tool_calls') throw new Error('mock contract failed'); return { status: response.status }; });
  await check(assertions, 'anthropic-text', async () => { const response = await request(baseUrl, '/anthropic/v1/messages', { model: 'mock', messages: [] }); const body = await response.json(); if (!response.ok || body.type !== 'message') throw new Error('mock contract failed'); return { status: response.status, usage: body.usage }; });
  await check(assertions, 'anthropic-thinking-stream', async () => { const response = await request(baseUrl, '/anthropic/v1/messages', { model: 'mock', messages: [], stream: true }, 'thinking'); if (!response.ok || !(await response.text()).includes('thinking_delta')) throw new Error('mock contract failed'); return { status: response.status }; });
  await check(assertions, 'anthropic-tool', async () => { const response = await request(baseUrl, '/anthropic/v1/messages', { model: 'mock', messages: [], tools: [{ name: 'echo' }], stream: true }, 'tool'); if (!response.ok || !(await response.text()).includes('tool_use')) throw new Error('mock contract failed'); return { status: response.status }; });
  await check(assertions, 'count-tokens', async () => { const response = await request(baseUrl, '/anthropic/v1/messages/count_tokens', { model: 'mock', messages: [] }); const body = await response.json(); if (!response.ok || typeof body.input_tokens !== 'number') throw new Error('mock contract failed'); return { status: response.status, usage: { input_tokens: body.input_tokens } }; });
  for (const [fixture, status] of [['http-400', 400], ['http-429', 429], ['http-500', 500]]) await check(assertions, fixture, async () => { const response = await request(baseUrl, '/openai/v1/chat/completions', { model: 'mock', messages: [] }, fixture); if (response.status !== status) throw new Error('mock contract failed'); return { status: response.status }; });
  await check(assertions, 'timeout', async () => {
    const started = performance.now();
    try { await request(baseUrl, '/openai/v1/chat/completions', { model: 'mock', messages: [] }, 'timeout', 20); }
    catch (error) {
      if (!['TimeoutError', 'AbortError'].includes(error?.name) || performance.now() - started < 15) throw new Error('mock contract failed');
      return { status: 0 };
    }
    throw new Error('mock contract failed');
  });
  const result = { status: 'ok', run_id: manifest.run_id, assertions };
  const resultsDir = outputDir ?? join(dirname(manifestPath), 'results');
  if (!isAbsolute(resultsDir)) throw new Error('invalid output directory');
  await writeEvidence(resultsDir, 'mock-contract.json', result);
  return result;
}

if (isMain(import.meta)) {
  try {
    const values = parseArgs(process.argv.slice(2));
    if (!values['--manifest'] || !['mock-contract', 'standalone-memory'].includes(values['--scenario'])) throw new Error('invalid arguments');
    if (values['--scenario'] === 'mock-contract') await runMockContract({ manifestPath: values['--manifest'], baseUrl: process.env.MOCK_BASE_URL ?? 'http://127.0.0.1:18080', outputDir: values['--output-dir'] });
    else await runStandaloneMemory({
      manifestPath: values['--manifest'],
      proxyUrl: process.env.PROXY_BASE_URL ?? 'http://127.0.0.1:8096',
      coreUrl: process.env.CORE_BASE_URL ?? 'http://127.0.0.1:8420',
      mockUrl: process.env.MOCK_BASE_URL ?? 'http://127.0.0.1:18080',
      gatewayTokenFile: values['--gateway-token-file'],
      outputDir: values['--output-dir'],
    });
    process.stdout.write('{"status":"ok"}\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
