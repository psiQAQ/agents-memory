import { createHash, randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { validateManifest } from './test-runner.mjs';
import { isMain } from './runtime-lib.mjs';
import { stage1Marker, stage1OperationDigest, stage1OperationHash, stage1Sources as sources } from './task5-contract.mjs';

const fixtures = ['text', 'stream', 'tool', 'count', 'http-400', 'http-429', 'http-500', 'timeout'];
const clients = Object.keys(sources);
const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const evidenceFiles = new Set(['stage1-mock.json', 'stage1-shared-memory.json', 'stage1-management.json']);
const forbiddenHeaders = new Set([
  'authorization', 'cookie', 'cf-access-jwt-assertion', 'x-agent-id', 'x-claude-code-session-id',
  'x-conversation-id', 'x-forwarded-for', 'x-forwarded-host', 'x-task-id', 'x-tdai-agent-source',
  'x-tdai-service-id', 'x-tdai-service-token', 'x-tdai-user-key', 'x-team-id',
  'x-vertex-ai-session-id', 'x-wechat-work-id', 'x-wecom-id',
]);

export function buildLeakCases() {
  return Object.entries(sources).flatMap(([client, source]) => fixtures.map((fixture) => ({ client, source, fixture })));
}

export function isUnsafeObservation(observation) {
  return !['sensitive_value_seen', 'unexpected_credential_seen', 'memory_user_credential_seen'].every((name) => typeof observation?.[name] === 'boolean')
    || observation.sensitive_value_seen
    || observation.unexpected_credential_seen
    || observation.memory_user_credential_seen
    || !Array.isArray(observation.header_names)
    || observation.header_names.some((name) => forbiddenHeaders.has(String(name).toLowerCase()));
}

export { stage1OperationDigest, stage1OperationHash };

async function readKey(path) {
  try {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1 || metadata.size > 256) throw new Error();
    const key = (await readFile(path, 'utf8')).replace(/\r?\n$/, '');
    if (!/^sk-mem-[A-Za-z0-9_-]{32}$/.test(key)) throw new Error();
    return key;
  } catch { throw new Error('invalid Stage 1 credential'); }
}

async function readGatewayToken(path) {
  try {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1 || metadata.size > 256) throw new Error();
    const token = (await readFile(path, 'utf8')).replace(/\r?\n$/, '');
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/.test(token)) throw new Error();
    return token;
  } catch { throw new Error('invalid Stage 1 gateway token'); }
}

function exactSet(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length
    && [...actual].sort().every((value, index) => value === [...expected].sort()[index]);
}

async function loadStage1Manifest(manifestPath) {
  if (!isAbsolute(manifestPath ?? '')) throw new Error('invalid Stage 1 manifest');
  let manifest;
  const manifestDirectory = dirname(resolve(manifestPath));
  try {
    manifest = validateManifest(JSON.parse(await readFile(manifestPath, 'utf8')), manifestDirectory);
    if (!exactSet(Object.keys(manifest.clients), clients)) throw new Error();
    const outsider = manifest.outsider;
    validateManifest({
      run_id: manifest.run_id,
      service_id: manifest.service_id,
      team_id: outsider?.team_id,
      task_id: outsider?.task_id,
      clients: { outsider },
    }, manifestDirectory);
    const owners = manifest.shared_memory?.owner_asset_ids;
    if (!owners || !exactSet(Object.keys(owners), clients) || !Object.values(owners).every((value) => identityPattern.test(value))
      || new Set(Object.values(owners)).size !== clients.length || manifest.shared_memory.cross_owner_binding_count !== 6) throw new Error();
    const actors = [...Object.values(manifest.clients), outsider];
    for (const field of ['user_id', 'agent_id', 'session_id', 'credential_file']) {
      if (new Set(actors.map((actor) => actor[field])).size !== actors.length) throw new Error();
    }
    if (outsider.team_id === manifest.team_id || outsider.task_id === manifest.task_id) throw new Error();
  } catch { throw new Error('invalid Stage 1 manifest'); }
  return { manifest, manifestDirectory };
}

async function loadStage1Secrets(manifest, manifestDirectory, gatewayTokenFile) {
  const actors = { ...manifest.clients, outsider: manifest.outsider };
  const keys = Object.fromEntries(await Promise.all(Object.entries(actors).map(async ([actor, value]) => [actor, await readKey(resolve(manifestDirectory, value.credential_file))])));
  if (new Set(Object.values(keys)).size !== Object.keys(actors).length) throw new Error('invalid Stage 1 credential');
  return { keys, gatewayToken: await readGatewayToken(gatewayTokenFile) };
}

async function json(url, options = {}) {
  let response;
  try { response = await fetch(url, { ...options, signal: options.signal ?? AbortSignal.timeout(5000) }); }
  catch (error) { throw error; }
  let data;
  try { data = await response.json(); } catch { throw new Error('invalid Stage 1 response'); }
  return { response, data };
}

async function writeStage1Evidence(outputDir, filename, value) {
  if (!isAbsolute(outputDir ?? '') || !evidenceFiles.has(filename)) throw new Error('unsafe Stage 1 evidence');
  const destination = join(outputDir, filename);
  const temporary = join(outputDir, `.${filename}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await mkdir(outputDir, { recursive: true, mode: 0o700 });
    const directory = await lstat(outputDir);
    if (directory.isSymbolicLink() || !directory.isDirectory()) throw new Error();
    try { await lstat(destination); throw new Error(); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    const metadata = await lstat(temporary);
    if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1) throw new Error();
    await chmod(temporary, 0o600);
    await rename(temporary, destination);
    const published = await lstat(destination);
    if (published.isSymbolicLink() || !published.isFile() || published.nlink !== 1) throw new Error();
    await chmod(destination, 0o600);
  } catch {
    await unlink(temporary).catch(() => {});
    throw new Error('unsafe Stage 1 evidence');
  }
}

function proxyHeaders(manifest, client, key, sentinel) {
  return {
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01',
    'x-team-id': manifest.team_id,
    'x-agent-id': manifest.clients[client].agent_id,
    'x-task-id': manifest.task_id,
    'x-conversation-id': manifest.clients[client].session_id,
    'x-claude-code-session-id': sentinel,
    'x-vertex-ai-session-id': sentinel,
    'x-wecom-id': sentinel,
    'x-tdai-service-token': sentinel,
    cookie: `stage1=${sentinel}`,
  };
}

function expectedStatus(fixture) {
  if (fixture === 'timeout') return 0;
  if (fixture.startsWith('http-')) return Number(fixture.slice(5));
  return 200;
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function integer(value, minimum = 0) {
  return Number.isInteger(value) && value >= minimum;
}

function messageEnvelope(data, stopReason) {
  return record(data) && typeof data.id === 'string' && data.id.length > 0 && data.type === 'message' && data.role === 'assistant'
    && typeof data.model === 'string' && data.model.length > 0 && data.stop_reason === stopReason && data.stop_sequence === null
    && record(data.usage) && integer(data.usage.input_tokens, 1) && integer(data.usage.output_tokens, 1);
}

function parseAnthropicSse(text) {
  if (!text.endsWith('\n\n')) return undefined;
  try {
    return text.slice(0, -2).split('\n\n').map((frame) => {
      const lines = frame.split('\n');
      if (lines.length !== 2 || !lines[0].startsWith('event: ') || !lines[1].startsWith('data: ')) throw new Error();
      return { event: lines[0].slice(7), data: JSON.parse(lines[1].slice(6)) };
    });
  } catch { return undefined; }
}

function validAnthropicStream(text) {
  const events = parseAnthropicSse(text);
  const names = ['message_start', 'content_block_start', 'content_block_delta', 'content_block_stop', 'message_delta', 'message_stop'];
  if (!events || events.length !== names.length || events.some((entry, index) => entry.event !== names[index] || entry.data?.type !== names[index])) return false;
  const start = events[0].data.message;
  const blockStart = events[1].data;
  const blockDelta = events[2].data;
  const blockStop = events[3].data;
  const messageDelta = events[4].data;
  return record(start) && typeof start.id === 'string' && start.id.length > 0 && start.type === 'message' && start.role === 'assistant'
    && typeof start.model === 'string' && start.model.length > 0 && Array.isArray(start.content) && start.content.length === 0
    && record(start.usage) && integer(start.usage.input_tokens, 1) && start.usage.output_tokens === 0
    && blockStart.index === 0 && blockStart.content_block?.type === 'text' && blockStart.content_block.text === ''
    && blockDelta.index === 0 && blockDelta.delta?.type === 'text_delta' && typeof blockDelta.delta.text === 'string' && blockDelta.delta.text.length > 0
    && blockStop.index === 0 && messageDelta.delta?.stop_reason === 'end_turn'
    && record(messageDelta.usage) && integer(messageDelta.usage.output_tokens, 1);
}

function validProtocolResponse(fixture, status, contentType, bytes, sensitiveValues) {
  if (fixture === 'timeout') return status === 0 && bytes === undefined;
  if (!(bytes instanceof ArrayBuffer)) return false;
  const text = Buffer.from(bytes).toString('utf8');
  if (sensitiveValues.some((value) => typeof value === 'string' && value.length > 0 && text.includes(value))) return false;
  if (fixture === 'stream') return /^text\/event-stream(?:;|$)/i.test(contentType) && validAnthropicStream(text.replace(/\r\n/g, '\n'));
  if (!/^application\/json(?:;|$)/i.test(contentType)) return false;
  let data;
  try { data = JSON.parse(text); } catch { return false; }
  if (fixture.startsWith('http-')) return data?.type === 'error' && data?.error?.type === 'mock_error' && data.error.message === 'mock fixture error';
  if (fixture === 'count') return record(data) && Object.keys(data).length === 1 && integer(data.input_tokens, 1);
  if (!Array.isArray(data?.content) || data.content.length !== 1) return false;
  if (fixture === 'tool') {
    const block = data.content[0];
    return messageEnvelope(data, 'tool_use') && block?.type === 'tool_use' && typeof block.id === 'string' && block.id.length > 0
      && block.name === 'stage1_echo' && record(block.input);
  }
  const block = data.content[0];
  return messageEnvelope(data, 'end_turn') && block?.type === 'text' && typeof block.text === 'string' && block.text.length > 0;
}

export async function runProtocolLeakGate({ manifestPath, proxyUrl, mockUrl, outputDir, timeoutMs = 100 }) {
  if (![manifestPath, outputDir].every((path) => isAbsolute(path ?? '')) || ![proxyUrl, mockUrl].every((url) => /^https?:\/\//.test(url ?? '')) || !Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 5000) throw new Error('invalid Stage 1 arguments');
  let manifest;
  try { manifest = validateManifest(JSON.parse(await readFile(manifestPath, 'utf8')), dirname(resolve(manifestPath))); } catch { throw new Error('invalid Stage 1 manifest'); }
  if (Object.keys(manifest.clients).sort().join(',') !== 'claude,opencode,pi') throw new Error('invalid Stage 1 manifest');
  const manifestDirectory = dirname(resolve(manifestPath));
  const keys = Object.fromEntries(await Promise.all(Object.entries(manifest.clients).map(async ([client, value]) => [client, await readKey(resolve(manifestDirectory, value.credential_file))])));
  const assertions = [];
  for (const entry of buildLeakCases()) {
    const name = `leak-${entry.client}-${entry.fixture}`;
    try {
      const reset = await fetch(new URL('/__mock/reset', mockUrl), { method: 'POST', signal: AbortSignal.timeout(2000) });
      if (!reset.ok) throw new Error();
      const sentinel = `MEMORY_LEAK_SENTINEL_${createHash('sha256').update(`${manifest.run_id}:${name}`).digest('hex').slice(0, 24).toUpperCase()}`;
      const count = entry.fixture === 'count';
      const path = `/${entry.source}/${manifest.service_id}/v1/messages${count ? '/count_tokens' : ''}`;
      const body = {
        model: 'mock-model',
        max_tokens: 32,
        ...(entry.fixture === 'stream' ? { stream: true } : {}),
        ...(entry.fixture === 'tool' ? { tools: [{ name: 'stage1_echo', description: 'deterministic fixture', input_schema: { type: 'object', properties: {} } }] } : {}),
        messages: [{ role: 'user', content: `STAGE1_FIXTURE_${entry.fixture} Run the deterministic Stage 1 protocol check.` }],
      };
      const responseSensitiveValues = [
        ...Object.values(keys), sentinel, body.messages[0].content,
        ...clients.flatMap((client) => {
          const identity = manifest.clients[client];
          return [identity.user_id, identity.agent_id, identity.session_id, stage1Marker(manifest.run_id, client)];
        }),
        manifest.team_id, manifest.task_id,
      ];
      let status;
      let contentType = '';
      let responseBytes;
      try {
        const response = await fetch(new URL(path, proxyUrl), {
          method: 'POST',
          headers: proxyHeaders(manifest, entry.client, keys[entry.client], sentinel),
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(entry.fixture === 'timeout' ? timeoutMs : 5000),
        });
        status = response.status;
        contentType = response.headers.get('content-type') ?? '';
        responseBytes = await response.arrayBuffer();
      } catch (error) {
        if (entry.fixture !== 'timeout' || !['AbortError', 'TimeoutError'].includes(error?.name)) throw error;
        status = 0;
      }
      const observed = await json(new URL('/__mock/requests', mockUrl));
      const targetPath = `/anthropic/v1/messages${count ? '/count_tokens' : ''}`;
      const requests = Array.isArray(observed.data?.requests) ? observed.data.requests.filter((request) => request?.path === targetPath) : [];
      if (status !== expectedStatus(entry.fixture) || !validProtocolResponse(entry.fixture, status, contentType, responseBytes, responseSensitiveValues) || requests.length !== 1 || requests.some(isUnsafeObservation)) throw new Error();
      assertions.push({ name, status, model_requests: requests.length });
    } catch {
      const failed = { status: 'failed', assertion: name, passed: assertions.length };
      await writeStage1Evidence(outputDir, 'stage1-mock.json', failed);
      throw new Error(`Stage 1 protocol leak gate failed assertion=${name}`);
    }
  }
  const result = { status: 'ok', assertions };
  await writeStage1Evidence(outputDir, 'stage1-mock.json', result);
  return result;
}

async function coreRequest(path, { body, key, gatewayToken, serviceId, coreUrl }) {
  const { response, data } = await json(new URL(path, coreUrl), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${gatewayToken}`,
      'content-type': 'application/json',
      'x-tdai-service-id': serviceId,
      'x-tdai-user-key': key,
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, code: data?.code, data: data?.data };
}

function ownerFor(manifest, client) {
  return {
    team_id: manifest.team_id,
    user_id: manifest.clients[client].user_id,
    agent_id: manifest.clients[client].agent_id,
    task_id: manifest.task_id,
  };
}

function ownedMarkerMatches(items, marker, owner) {
  return Array.isArray(items) ? items.filter((item) => item && typeof item.content === 'string' && item.content.includes(marker)
    && item.team_id === owner.team_id && item.user_id === owner.user_id && item.agent_id === owner.agent_id && item.task_id === owner.task_id) : [];
}

export async function runOwnerOracle({ manifestPath, gatewayTokenFile, coreUrl, client, pollAttempts = 30, pollIntervalMs = 1000 }, dependencies = {}) {
  if (![manifestPath, gatewayTokenFile].every((path) => isAbsolute(path ?? '')) || !/^https?:\/\//.test(coreUrl ?? '') || !clients.includes(client)
    || !Number.isInteger(pollAttempts) || pollAttempts < 1 || pollAttempts > 120 || !Number.isInteger(pollIntervalMs) || pollIntervalMs < 0 || pollIntervalMs > 10000) throw new Error('invalid Stage 1 owner oracle arguments');
  try {
    const { manifest, manifestDirectory } = await loadStage1Manifest(manifestPath);
    const key = await readKey(resolve(manifestDirectory, manifest.clients[client].credential_file));
    const gatewayToken = await readGatewayToken(gatewayTokenFile);
    const core = dependencies.core ?? coreRequest;
    const owner = ownerFor(manifest, client);
    const marker = stage1Marker(manifest.run_id, client);
    const context = { key, gatewayToken, serviceId: manifest.service_id, coreUrl };
    const l0 = await core('/v3/conversation/query', { ...context, body: { ...owner, session_id: manifest.clients[client].session_id, limit: 100, offset: 0 } });
    const l0Matches = l0.status >= 200 && l0.status < 300 && l0.code === 0 ? ownedMarkerMatches(l0.data?.messages, marker, owner) : [];
    if (l0Matches.length === 0) throw new Error();
    let l1Matches = [];
    for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
      const l1 = await core('/v3/atomic/query', { ...context, body: { ...owner, limit: 100, offset: 0 } });
      l1Matches = l1.status >= 200 && l1.status < 300 && l1.code === 0 ? ownedMarkerMatches(l1.data?.items, marker, owner) : [];
      if (l1Matches.length > 0) break;
      if (attempt + 1 < pollAttempts && pollIntervalMs > 0) await new Promise((resolveDelay) => setTimeout(resolveDelay, pollIntervalMs));
    }
    if (l1Matches.length === 0) throw new Error();
    return { status: 'ok', l0_matches: l0Matches.length, l1_matches: l1Matches.length };
  } catch { throw new Error('Stage 1 owner oracle failed'); }
}

async function mockAggregate(mockUrl) {
  const { response, data } = await json(new URL('/__mock/aggregate', mockUrl), { method: 'GET' });
  if (!response.ok || !data || typeof data !== 'object') throw new Error('invalid Stage 1 aggregate');
  return data;
}

export async function runFinalizeGate({ manifestPath, gatewayTokenFile, coreUrl, mockUrl, outputDir }, dependencies = {}) {
  if (![manifestPath, gatewayTokenFile, outputDir].every((path) => isAbsolute(path ?? '')) || ![coreUrl, mockUrl].every((url) => /^https?:\/\//.test(url ?? ''))) throw new Error('invalid Stage 1 final gate arguments');
  let assertion = 'manifest';
  try {
    const { manifest } = await loadStage1Manifest(manifestPath);
    const ownerOracle = dependencies.ownerOracle ?? runOwnerOracle;
    assertion = 'owner-oracle';
    for (const client of clients) {
      const result = await ownerOracle({ manifestPath, gatewayTokenFile, coreUrl, client });
      if (result?.status !== 'ok') throw new Error();
    }
    assertion = 'operation-aggregate';
    const aggregate = await (dependencies.aggregate ?? (() => mockAggregate(mockUrl)))();
    const operations = aggregate?.operations;
    if (!operations || typeof operations !== 'object') throw new Error();
    let writes = 0;
    let reads = 0;
    const hasMarker = (scenario, client, owner) => {
      const operation = operations[stage1OperationHash(manifest.run_id, scenario, client, owner)];
      const marker = stage1Marker(manifest.run_id, scenario === 'write' ? client : owner);
      const markerHash = createHash('sha256').update(marker).digest('hex');
      return Number.isInteger(operation?.requests) && operation.requests >= 1 && Array.isArray(operation.marker_hashes) && operation.marker_hashes.includes(markerHash);
    };
    for (const client of clients) {
      if (!hasMarker('write', client)) throw new Error();
      writes += 1;
      for (const owner of clients.filter((candidate) => candidate !== client)) {
        if (!hasMarker('read', client, owner)) throw new Error();
        reads += 1;
      }
    }
    const result = { status: 'ok', owner_oracles: clients.length, write_operations: writes, cross_owner_reads: reads };
    await writeStage1Evidence(outputDir, 'stage1-shared-memory.json', result);
    return result;
  } catch (error) {
    await writeStage1Evidence(outputDir, 'stage1-shared-memory.json', { status: 'failed', assertion }).catch(() => {});
    if (error?.message === 'unsafe Stage 1 evidence') throw error;
    throw new Error(`Stage 1 final gate failed assertion=${assertion}`);
  }
}

function requireCore(result) {
  if (!result || result.status < 200 || result.status >= 300 || result.code !== 0 || !result.data || typeof result.data !== 'object') throw new Error();
  return result.data;
}

function bindingInput(binding) {
  return {
    asset_id: binding?.asset_id,
    asset_type: binding?.asset_type,
    injection_mode: binding?.injection_mode,
    priority: binding?.priority,
    created_by: binding?.created_by,
  };
}

function outsiderOperation(runId, kind) {
  return `STAGE1_OP_${createHash('sha256').update(`${runId}:outsider:${kind}`).digest('hex').toUpperCase()}`;
}

async function proxyIsolationRequest(kind, { manifest, keys, proxyUrl, mockUrl }) {
  const reset = await fetch(new URL('/__mock/reset', mockUrl), { method: 'POST', signal: AbortSignal.timeout(2000) });
  if (!reset.ok) throw new Error();
  const forged = kind === 'forged';
  const source = kind === 'unknown' ? 'unregistered-source' : 'claude-code';
  const actor = forged ? manifest.clients.claude : manifest.outsider;
  const response = await fetch(new URL(`/${source}/${manifest.service_id}/v1/messages`, proxyUrl), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${keys.outsider}`,
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-team-id': forged ? manifest.team_id : manifest.outsider.team_id,
      'x-agent-id': actor.agent_id,
      'x-task-id': forged ? manifest.task_id : manifest.outsider.task_id,
      'x-conversation-id': manifest.outsider.session_id,
    },
    body: JSON.stringify({
      model: 'mock-model',
      max_tokens: 32,
      messages: [{ role: 'user', content: `${outsiderOperation(manifest.run_id, kind)} Run the deterministic outsider isolation check.` }],
    }),
    signal: AbortSignal.timeout(5000),
  });
  await response.arrayBuffer();
  return { status: response.status };
}

async function modelIsolationObservation(kind, { manifest, mockUrl }) {
  const [{ response: requestsResponse, data: requestsData }, aggregate] = await Promise.all([
    json(new URL('/__mock/requests', mockUrl), { method: 'GET' }),
    mockAggregate(mockUrl),
  ]);
  if (!requestsResponse.ok || !Array.isArray(requestsData?.requests)) throw new Error();
  const modelPaths = new Set(['/anthropic/v1/messages', '/anthropic/v1/messages/count_tokens', '/openai/v1/chat/completions']);
  const requests = requestsData.requests.filter((request) => modelPaths.has(request?.path));
  const primaryRequests = requests.filter((request) => request.path === '/anthropic/v1/messages');
  const operationHash = createHash('sha256').update(outsiderOperation(manifest.run_id, kind)).digest('hex');
  const observedMarkerHashes = aggregate?.operations?.[operationHash]?.marker_hashes ?? [];
  const ownerMarkerHashes = new Set(clients.map((client) => createHash('sha256').update(stage1Marker(manifest.run_id, client)).digest('hex')));
  return {
    count: primaryRequests.length,
    all_count: requests.length,
    owner_marker_count: Array.isArray(observedMarkerHashes) ? observedMarkerHashes.filter((value) => ownerMarkerHashes.has(value)).length : -1,
    safe: requests.every((request) => !isUnsafeObservation(request)),
  };
}

async function panelRequest(path, { panelUrl }) {
  const response = await fetch(new URL(path, panelUrl), { signal: AbortSignal.timeout(5000) });
  await response.arrayBuffer();
  return { status: response.status, contentType: response.headers.get('content-type') ?? '' };
}

export async function runManagementGate({ manifestPath, gatewayTokenFile, coreUrl, proxyUrl, mockUrl, panelUrl, outputDir }, dependencies = {}) {
  if (![manifestPath, gatewayTokenFile, outputDir].every((path) => isAbsolute(path ?? '')) || ![coreUrl, proxyUrl, mockUrl, panelUrl].every((url) => /^https?:\/\//.test(url ?? ''))) throw new Error('invalid Stage 1 management arguments');
  let assertion = 'manifest';
  try {
    const { manifest, manifestDirectory } = await loadStage1Manifest(manifestPath);
    assertion = 'credentials';
    const { keys, gatewayToken } = await loadStage1Secrets(manifest, manifestDirectory, gatewayTokenFile);
    const actors = { ...manifest.clients, outsider: manifest.outsider };
    const core = dependencies.core ?? coreRequest;
    const call = (path, actor, body) => core(path, { body, key: keys[actor], gatewayToken, serviceId: manifest.service_id, coreUrl });
    const items = (result) => {
      const data = requireCore(result);
      if (!Array.isArray(data.items)) throw new Error();
      return data.items;
    };

    assertion = 'users';
    for (const [actor, identity] of Object.entries(actors)) {
      const user = requireCore(await call('/v3/meta/user/get', actor, { user_id: identity.user_id }));
      if (user.user_id !== identity.user_id) throw new Error();
    }

    const scopes = [
      { actor: 'claude', team: manifest.team_id, task: manifest.task_id, members: clients },
      { actor: 'outsider', team: manifest.outsider.team_id, task: manifest.outsider.task_id, members: ['outsider'] },
    ];
    assertion = 'teams';
    for (const scope of scopes) {
      const team = requireCore(await call('/v3/meta/team/get', scope.actor, { team_id: scope.team }));
      if (team.team_id !== scope.team) throw new Error();
    }

    assertion = 'members';
    for (const scope of scopes) {
      const members = items(await call('/v3/meta/team-member/list', scope.actor, { team_id: scope.team, limit: 100, offset: 0 }));
      if (!exactSet(members.map((member) => member?.user_id), scope.members.map((actor) => actors[actor].user_id))) throw new Error();
    }

    assertion = 'agents';
    for (const scope of scopes) {
      const agents = items(await call('/v3/meta/agent/list', scope.actor, { team_id: scope.team, limit: 100, offset: 0 }));
      if (!exactSet(agents.map((agent) => agent?.agent_id), scope.members.map((actor) => actors[actor].agent_id))) throw new Error();
      for (const actor of scope.members) {
        const agent = agents.find((candidate) => candidate?.agent_id === actors[actor].agent_id);
        if (agent?.team_id !== scope.team || agent?.owner_user_id !== actors[actor].user_id) throw new Error();
      }
    }

    assertion = 'tasks';
    for (const scope of scopes) {
      const task = requireCore(await call('/v3/meta/task/get', scope.actor, { task_id: scope.task }));
      if (task.task_id !== scope.task || task.team_id !== scope.team) throw new Error();
    }

    assertion = 'bindings';
    const bindingLists = {};
    for (const actor of [...clients, 'outsider']) {
      bindingLists[actor] = items(await call('/v3/meta/agent-fixed-asset/list', actor, { agent_id: actors[actor].agent_id, limit: 100, offset: 0 })).map(bindingInput);
    }
    const ownerAssetIds = Object.values(manifest.shared_memory.owner_asset_ids);
    for (const actor of clients) {
      const bindings = bindingLists[actor];
      if (!exactSet(bindings.map((binding) => binding.asset_id), ownerAssetIds) || bindings.some((binding) => binding.asset_type !== 'chat_memory'
        || binding.injection_mode !== 'summary' || binding.priority !== (binding.asset_id === manifest.shared_memory.owner_asset_ids[actor] ? 50 : 0)
        || binding.created_by !== actors[actor].user_id)) throw new Error();
    }
    const outsiderBindings = bindingLists.outsider;
    if (outsiderBindings.length !== 1 || outsiderBindings[0].asset_type !== 'chat_memory' || ownerAssetIds.includes(outsiderBindings[0].asset_id)
      || outsiderBindings[0].injection_mode !== 'summary' || outsiderBindings[0].priority !== 50 || outsiderBindings[0].created_by !== manifest.outsider.user_id) throw new Error();
    const outsiderAssetId = outsiderBindings[0].asset_id;

    assertion = 'assets';
    const assetOwners = [...clients.map((client) => ({ actor: client, asset: manifest.shared_memory.owner_asset_ids[client], team: manifest.team_id, visibility: 'team' })),
      { actor: 'outsider', asset: outsiderAssetId, team: manifest.outsider.team_id, visibility: 'private' }];
    for (const expected of assetOwners) {
      const asset = requireCore(await call('/v3/meta/asset/get', expected.actor, { asset_id: expected.asset }));
      if (asset.asset_id !== expected.asset || asset.asset_type !== 'chat_memory' || asset.team_id !== expected.team
        || asset.owner_user_id !== actors[expected.actor].user_id || asset.visibility !== expected.visibility) throw new Error();
    }

    assertion = 'acl';
    let aclChecks = 0;
    for (const reader of clients) {
      for (const owner of clients.filter((candidate) => candidate !== reader)) {
        const acl = requireCore(await call('/v3/meta/acl/check', reader, { user_id: actors[reader].user_id, asset_id: manifest.shared_memory.owner_asset_ids[owner], action: 'read' }));
        if (acl.allowed !== true) throw new Error();
        aclChecks += 1;
      }
    }
    const outsiderAcl = requireCore(await call('/v3/meta/acl/check', 'outsider', { user_id: manifest.outsider.user_id, asset_id: ownerAssetIds[0], action: 'read' }));
    if (outsiderAcl.allowed !== false) throw new Error();
    aclChecks += 1;

    assertion = 'outsider-accessible';
    const accessible = items(await call('/v3/meta/asset/list-accessible', 'outsider', {
      user_id: manifest.outsider.user_id, team_id: manifest.team_id, asset_type: 'chat_memory', action: 'read', limit: 100, offset: 0,
    }));
    if (accessible.length !== 0) throw new Error();

    assertion = 'outsider-binding-mutation';
    const attemptedBindings = [...outsiderBindings, { asset_id: ownerAssetIds[0], asset_type: 'chat_memory', injection_mode: 'summary', priority: 0, created_by: manifest.outsider.user_id }];
    const mutation = await call('/v3/meta/agent-fixed-asset/set', 'outsider', { agent_id: manifest.outsider.agent_id, bindings: attemptedBindings });
    if (mutation.status >= 200 && mutation.status < 300 && mutation.code === 0) throw new Error();
    const bindingsAfter = items(await call('/v3/meta/agent-fixed-asset/list', 'outsider', { agent_id: manifest.outsider.agent_id, limit: 100, offset: 0 })).map(bindingInput);
    if (JSON.stringify(bindingsAfter) !== JSON.stringify(outsiderBindings)) throw new Error();

    const proxy = dependencies.proxy ?? proxyIsolationRequest;
    const model = dependencies.model ?? modelIsolationObservation;
    assertion = 'outsider-unknown-source';
    const unknown = await proxy('unknown', { manifest, keys, proxyUrl, mockUrl });
    const unknownModel = await model('unknown', { manifest, mockUrl });
    if (unknown.status !== 404 || unknownModel.count !== 0 || unknownModel.all_count !== 0 || unknownModel.safe !== true) throw new Error();
    assertion = 'outsider-forged-identity';
    const forged = await proxy('forged', { manifest, keys, proxyUrl, mockUrl });
    const forgedModel = await model('forged', { manifest, mockUrl });
    if (![401, 403, 409].includes(forged.status) || forgedModel.count !== 0 || forgedModel.all_count !== 0 || forgedModel.safe !== true) throw new Error();
    assertion = 'outsider-legal-own';
    const legal = await proxy('legal', { manifest, keys, proxyUrl, mockUrl });
    const legalModel = await model('legal', { manifest, mockUrl });
    if (legal.status < 200 || legal.status >= 300 || legalModel.count !== 1 || legalModel.owner_marker_count !== 0 || legalModel.safe !== true) throw new Error();

    assertion = 'panel';
    const panel = dependencies.panel ?? ((path) => panelRequest(path, { panelUrl }));
    const health = await panel('/health');
    const root = await panel('/');
    if (health.status !== 200 || !/^application\/json(?:;|$)/i.test(health.contentType) || root.status !== 200 || !/^text\/html(?:;|$)/i.test(root.contentType)) throw new Error();

    const result = {
      status: 'ok', users: 4, teams: 2, members: 4, agents: 4, tasks: 2, assets: 4,
      bindings: [...clients, 'outsider'].reduce((count, actor) => count + bindingLists[actor].length, 0),
      acl_checks: aclChecks, outsider_negative_checks: 6, panel_checks: 2,
    };
    await writeStage1Evidence(outputDir, 'stage1-management.json', result);
    return result;
  } catch (error) {
    await writeStage1Evidence(outputDir, 'stage1-management.json', { status: 'failed', assertion }).catch(() => {});
    if (error?.message === 'unsafe Stage 1 evidence') throw error;
    throw new Error(`Stage 1 management gate failed assertion=${assertion}`);
  }
}

function parse(argv, allowed) {
  if (argv.length === 0 || argv.length % 2 !== 0) throw new Error('invalid Stage 1 CLI arguments');
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(name) || Object.hasOwn(values, name) || !value) throw new Error('invalid Stage 1 CLI arguments');
    values[name] = value;
  }
  return values;
}

export async function runTask5Cli(argv, environment = process.env, dependencies = {}) {
  const values = parse(argv, new Set(['--manifest', '--scenario', '--gateway-token-file', '--output-dir', '--client']));
  const scenario = values['--scenario'];
  if (!values['--manifest'] || !values['--gateway-token-file'] || !values['--output-dir'] || !['protocol-leak', 'owner-oracle', 'management', 'finalize'].includes(scenario)
    || (scenario === 'owner-oracle') !== Boolean(values['--client']) || (values['--client'] && !clients.includes(values['--client']))) throw new Error('invalid Stage 1 CLI arguments');
  const http = (name) => {
    const value = environment[name];
    if (!/^https?:\/\//.test(value ?? '')) throw new Error('invalid Stage 1 CLI arguments');
    return value;
  };
  const common = { manifestPath: values['--manifest'] };
  if (scenario === 'protocol-leak') {
    const protocol = dependencies.protocol ?? runProtocolLeakGate;
    return protocol({ ...common, proxyUrl: http('PROXY_BASE_URL'), mockUrl: http('MOCK_BASE_URL'), outputDir: values['--output-dir'] });
  }
  const secured = { ...common, gatewayTokenFile: values['--gateway-token-file'], coreUrl: http('CORE_BASE_URL') };
  if (scenario === 'owner-oracle') {
    const owner = dependencies.owner ?? runOwnerOracle;
    return owner({ ...secured, client: values['--client'] });
  }
  if (scenario === 'management') {
    const management = dependencies.management ?? runManagementGate;
    return management({ ...secured, proxyUrl: http('PROXY_BASE_URL'), mockUrl: http('MOCK_BASE_URL'), panelUrl: http('PANEL_BASE_URL'), outputDir: values['--output-dir'] });
  }
  const finalize = dependencies.finalize ?? runFinalizeGate;
  return finalize({ ...secured, mockUrl: http('MOCK_BASE_URL'), outputDir: values['--output-dir'] });
}

if (isMain(import.meta)) {
  try {
    const result = await runTask5Cli(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify({ status: result.status })}\n`);
  } catch (error) {
    process.stderr.write(`${error.message.startsWith('Stage 1 protocol leak gate failed assertion=') ? error.message : 'Stage 1 gate failed'}\n`);
    process.exitCode = 1;
  }
}
