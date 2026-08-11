import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { isMain } from './runtime-lib.mjs';

const fixtures = new Set(['text', 'tool', 'thinking', 'thinking-missing', 'http-400', 'http-429', 'http-500', 'timeout']);
const errorStatus = { 'http-400': 400, 'http-429': 429, 'http-500': 500 };
const maxBodyBytes = 1024 * 1024;
const leakPattern = /MEMORY_(?:(?:GATEWAY|IDENTITY)_)?LEAK_SENTINEL_[A-Z0-9_-]+/i;
const memoryCredentialPattern = /sk-mem-[A-Za-z0-9_-]{32}/i;
const stage1OperationPattern = /STAGE1_OP_[A-Z0-9_-]{6,128}/g;
const stage1MarkerPattern = /MEMORY_NONCE_[A-Za-z0-9_-]{1,128}/g;
const stage1FixturePattern = /\bSTAGE1_FIXTURE_(text|stream|tool|count|http-400|http-429|http-500|timeout)\b/;
const identityHeaders = new Set([
  'cookie', 'cf-access-jwt-assertion', 'x-agent-id', 'x-claude-code-session-id',
  'x-conversation-id', 'x-forwarded-for', 'x-forwarded-host', 'x-task-id', 'x-tdai-agent-source',
  'x-tdai-service-id', 'x-tdai-service-token', 'x-tdai-user-key', 'x-team-id',
  'x-vertex-ai-session-id', 'x-wechat-work-id', 'x-wecom-id',
]);
const aggregateLimit = 100;

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function increment(record, key) {
  record[key] = (record[key] ?? 0) + 1;
}

function emptyAggregate(epoch, sequence) {
  return {
    epoch, sequence, total_requests: 0, dropped_requests: 0, truncated: false,
    paths: {}, fixtures: {}, operations: {},
    sticky_leaks: { credential: false, identity: false, sentinel: false },
  };
}

function observePath(record, path, sequence) {
  const entry = record[path] ??= { requests: 0, sequences: [] };
  entry.requests += 1;
  if (entry.sequences.length >= aggregateLimit) return true;
  entry.sequences.push(sequence);
  return false;
}

function sanitizeObservedNames(names) {
  return names.map((name) => leakPattern.test(name) || memoryCredentialPattern.test(name) ? '[redacted-sensitive-name]' : name).sort();
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size <= maxBodyBytes) chunks.push(chunk);
    });
    request.on('end', () => {
      if (size > maxBodyBytes) return reject(new Error('body-too-large'));
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Error('invalid-json')); }
    });
    request.on('error', reject);
  });
}

function selectedFixture(request, body) {
  const header = request.headers['x-mock-fixture'];
  if (typeof header === 'string') return header;
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const text = messages.flatMap((message) => typeof message?.content === 'string' ? [message.content]
    : Array.isArray(message?.content) ? message.content.filter((block) => block?.type === 'text' && typeof block.text === 'string').map((block) => block.text) : []).join('\n');
  const fixture = text.match(stage1FixturePattern)?.[1];
  return ['stream', 'count'].includes(fixture) ? 'text' : fixture ?? 'text';
}

function observe(observations, aggregate, request, body, fixture, sequence) {
  const path = new URL(request.url, 'http://mock').pathname;
  const authorization = request.headers.authorization;
  const apiKey = request.headers['x-api-key'];
  const unexpectedCredentialSeen = path.startsWith('/openai/')
    ? apiKey !== undefined || authorization !== 'Bearer mock-key'
    : authorization !== undefined || apiKey !== 'mock-key';
  const observedValues = [
    ...Object.keys(request.headers),
    ...Object.values(request.headers).flatMap((value) => Array.isArray(value) ? value : [value]),
    JSON.stringify(body),
  ];
  const sensitiveValueSeen = observedValues.some((entry) => typeof entry === 'string' && leakPattern.test(entry));
  const memoryUserCredentialSeen = observedValues.some((entry) => typeof entry === 'string' && memoryCredentialPattern.test(entry));
  observations.push({
    epoch: aggregate.epoch,
    sequence,
    method: request.method,
    path,
    fixture,
    header_names: sanitizeObservedNames(Object.keys(request.headers)),
    body_shape: body && typeof body === 'object' && !Array.isArray(body) ? sanitizeObservedNames(Object.keys(body)) : [],
    sensitive_value_seen: sensitiveValueSeen,
    unexpected_credential_seen: unexpectedCredentialSeen,
    memory_user_credential_seen: memoryUserCredentialSeen,
  });
  let dropped = false;
  if (observations.length > aggregateLimit) {
    observations.shift();
    dropped = true;
  }
  aggregate.sequence = sequence;
  aggregate.total_requests += 1;
  dropped = observePath(aggregate.paths, path, sequence) || dropped;
  increment(aggregate.fixtures, fixture);
  aggregate.sticky_leaks.credential ||= unexpectedCredentialSeen || memoryUserCredentialSeen;
  aggregate.sticky_leaks.identity ||= Object.keys(request.headers).some((name) => identityHeaders.has(name.toLowerCase()));
  aggregate.sticky_leaks.sentinel ||= sensitiveValueSeen;
  const bodyText = JSON.stringify(body);
  const operation = bodyText.match(stage1OperationPattern)?.[0];
  if (operation) {
    const operationHash = digest(operation);
    if (!aggregate.operations[operationHash] && Object.keys(aggregate.operations).length < 64) {
      aggregate.operations[operationHash] = { requests: 0, paths: {} };
    }
    const entry = aggregate.operations[operationHash];
    if (entry) {
      entry.requests += 1;
      dropped = observePath(entry.paths, path, sequence) || dropped;
      const markerHashes = entry.paths[path].marker_hashes ??= [];
      for (const marker of bodyText.match(stage1MarkerPattern) ?? []) {
        const markerHash = digest(marker);
        if (!markerHashes.includes(markerHash)) {
          if (markerHashes.length < 16) markerHashes.push(markerHash);
          else dropped = true;
        }
      }
      markerHashes.sort();
    } else dropped = true;
  }
  if (dropped) aggregate.dropped_requests += 1;
  aggregate.truncated ||= dropped;
}

function coreExtraction(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const text = messages.map((message) => typeof message?.content === 'string' ? message.content : '').join('\n');
  if (!/(?:情境切分与记忆提取专家|工作情境切分与团队共享记忆提取专家)/.test(text)) return undefined;
  const entries = [...text.matchAll(/\[([^\]\r\n]{1,128})\]\s+\[(user|assistant)\]\s+\[[^\]]+\]:\s*([^\r\n]+)/g)];
  const ids = entries.map((entry) => entry[1]);
  const source = entries.find((entry) => entry[2] === 'user' && /MEMORY_NONCE_[A-Za-z0-9_-]{1,128}/.test(entry[3]));
  const nonce = source?.[3].match(/MEMORY_NONCE_[A-Za-z0-9_-]{1,128}/)?.[0];
  return JSON.stringify([{
    scene_name: 'Mock deterministic memory extraction',
    message_ids: ids,
    memories: nonce ? [{ content: `用户要求 AI 长期记住 ${nonce}`, type: 'instruction', priority: 90, source_message_ids: [source[1]], metadata: {} }] : [],
  }]);
}

function openAi(body, fixture) {
  const toolResult = body.messages?.some((message) => message.role === 'tool');
  const tool = fixture === 'tool' && body.tools?.length && !toolResult;
  return {
    id: 'chatcmpl_mock', object: 'chat.completion', created: 0, model: body.model,
    choices: [{ index: 0, message: tool ? { role: 'assistant', tool_calls: [{ id: 'call_mock', type: 'function', function: { name: body.tools[0].function?.name ?? 'mock_tool', arguments: '{}' } }] } : { role: 'assistant', content: coreExtraction(body) ?? 'mock text' }, finish_reason: tool ? 'tool_calls' : 'stop' }],
    usage: { prompt_tokens: 11, completion_tokens: 3, total_tokens: 14 },
  };
}

function anthropic(body, fixture) {
  const toolResult = body.messages?.some((message) => Array.isArray(message.content) && message.content.some((block) => block.type === 'tool_result'));
  const tool = fixture === 'tool' && body.tools?.length && !toolResult;
  const content = fixture === 'thinking' ? [{ type: 'thinking', thinking: 'mock thinking' }, { type: 'text', text: 'mock text' }] : fixture === 'thinking-missing' ? [{ type: 'thinking' }, { type: 'text', text: 'mock text' }] : tool ? [{ type: 'tool_use', id: 'toolu_mock', name: body.tools[0].name ?? 'mock_tool', input: {} }] : [{ type: 'text', text: 'mock text' }];
  return { id: 'msg_mock', type: 'message', role: 'assistant', model: body.model, content, stop_reason: tool ? 'tool_use' : 'end_turn', stop_sequence: null, usage: { input_tokens: 11, output_tokens: 3 } };
}

async function sendSse(response, events) {
  response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' });
  for (const [event, data] of events) {
    response.write(`event: ${event}\ndata: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`);
    await new Promise((resolve) => setImmediate(resolve));
  }
  response.end();
}

function openAiEvents(body, fixture) {
  const tool = fixture === 'tool' && body.tools?.length && !body.messages?.some((message) => message.role === 'tool');
  if (tool) return [
    ['message', { id: 'chatcmpl_mock', object: 'chat.completion.chunk', created: 0, model: body.model, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'call_mock', type: 'function', function: { name: body.tools[0].function?.name ?? 'mock_tool', arguments: '{}' } }] }, finish_reason: null }] }],
    ['message', { id: 'chatcmpl_mock', object: 'chat.completion.chunk', created: 0, model: body.model, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 11, completion_tokens: 3, total_tokens: 14 } }],
    ['', '[DONE]'],
  ];
  return [
    ['message', { id: 'chatcmpl_mock', object: 'chat.completion.chunk', created: 0, model: body.model, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] }],
    ['message', { id: 'chatcmpl_mock', object: 'chat.completion.chunk', created: 0, model: body.model, choices: [{ index: 0, delta: { content: 'mock text' }, finish_reason: null }] }],
    ['message', { id: 'chatcmpl_mock', object: 'chat.completion.chunk', created: 0, model: body.model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 11, completion_tokens: 3, total_tokens: 14 } }],
    ['', '[DONE]'],
  ];
}

function anthropicEvents(body, fixture) {
  const toolResult = body.messages?.some((message) => Array.isArray(message.content) && message.content.some((block) => block.type === 'tool_result'));
  const tool = fixture === 'tool' && body.tools?.length && !toolResult;
  const thinking = fixture === 'thinking';
  const missing = fixture === 'thinking-missing';
  const events = [
    ['message_start', { type: 'message_start', message: { id: 'msg_mock', type: 'message', role: 'assistant', model: body.model, content: [], usage: { input_tokens: 11, output_tokens: 0 } } }],
  ];
  if (tool) events.push(['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_mock', name: body.tools[0].name ?? 'mock_tool', input: {} } }], ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{}' } }], ['content_block_stop', { type: 'content_block_stop', index: 0 }]);
  else {
    if (thinking || missing) events.push(['content_block_start', { type: 'content_block_start', index: 0, content_block: missing ? { type: 'thinking' } : { type: 'thinking', thinking: 'mock thinking' } }], ['content_block_delta', { type: 'content_block_delta', index: 0, delta: missing ? { type: 'thinking_delta' } : { type: 'thinking_delta', thinking: 'mock thinking' } }], ['content_block_stop', { type: 'content_block_stop', index: 0 }]);
    const index = thinking || missing ? 1 : 0;
    events.push(['content_block_start', { type: 'content_block_start', index, content_block: { type: 'text', text: '' } }], ['content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text: 'mock text' } }], ['content_block_stop', { type: 'content_block_stop', index }]);
  }
  events.push(
    ['message_delta', { type: 'message_delta', delta: { stop_reason: tool ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 3 } }],
    ['message_stop', { type: 'message_stop' }],
  );
  return events;
}

export function createMockServer({ timeoutMs = Number(process.env.MOCK_TIMEOUT_MS) || 1000 } = {}) {
  const delay = Math.min(Math.max(Number(timeoutMs) || 1000, 1), 30000);
  const observations = [];
  let epoch = randomUUID();
  let sequence = 0;
  let aggregate = emptyAggregate(epoch, sequence);
  return http.createServer(async (request, response) => {
    const path = new URL(request.url, 'http://mock').pathname;
    if (request.method === 'GET' && path === '/healthz') return sendJson(response, 200, { status: 'ok' });
    if (request.method === 'GET' && path === '/__mock/requests') return sendJson(response, 200, { requests: observations });
    if (request.method === 'GET' && path === '/__mock/aggregate') return sendJson(response, 200, aggregate);
    if (request.method === 'POST' && path === '/__mock/reset') {
      observations.length = 0;
      epoch = randomUUID();
      aggregate = emptyAggregate(epoch, sequence);
      return sendJson(response, 200, { status: 'ok', epoch, sequence });
    }
    const isProtocol = ['/openai/v1/chat/completions', '/anthropic/v1/messages', '/anthropic/v1/messages/count_tokens'].includes(path);
    if (!isProtocol) return sendJson(response, 404, { error: { type: 'not_found' } });
    if (request.method !== 'POST') return sendJson(response, 405, { error: { type: 'method_not_allowed' } });
    let body;
    try { body = await readJson(request); } catch (error) { return sendJson(response, error.message === 'body-too-large' ? 413 : 400, { error: { type: error.message } }); }
    const fixture = selectedFixture(request, body);
    sequence += 1;
    observe(observations, aggregate, request, body, fixtures.has(fixture) ? fixture : 'invalid', sequence);
    if (!fixtures.has(fixture)) return sendJson(response, 400, { error: { type: 'unknown_fixture' } });
    if (fixture in errorStatus) {
      const error = { type: 'mock_error', message: 'mock fixture error' };
      return sendJson(response, errorStatus[fixture], path.startsWith('/openai/') ? { error } : { type: 'error', error });
    }
    if (fixture === 'timeout') await new Promise((resolve) => setTimeout(resolve, delay));
    if (path === '/anthropic/v1/messages/count_tokens') return sendJson(response, 200, { input_tokens: Math.max(1, Math.ceil(Buffer.byteLength(JSON.stringify(body)) / 4)) });
    if (path === '/openai/v1/chat/completions') return body.stream ? sendSse(response, openAiEvents(body, fixture)) : sendJson(response, 200, openAi(body, fixture));
    return body.stream ? sendSse(response, anthropicEvents(body, fixture)) : sendJson(response, 200, anthropic(body, fixture));
  });
}

export async function listenMockServer({
  host = process.env.MOCK_HOST ?? '127.0.0.1',
  port = Number(process.env.MOCK_PORT ?? 18080),
  timeoutMs,
} = {}) {
  if (!['127.0.0.1', '0.0.0.0'].includes(host) || !Number.isInteger(port) || port < 0 || port > 65535) throw new Error('invalid listener');
  const server = createMockServer({ timeoutMs });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  return server;
}

if (isMain(import.meta)) {
  try {
    const server = await listenMockServer();
    process.stdout.write(JSON.stringify({ status: 'ready', port: server.address().port }) + '\n');
  } catch {
    process.stderr.write('mock listener failed\n');
    process.exitCode = 1;
  }
}
