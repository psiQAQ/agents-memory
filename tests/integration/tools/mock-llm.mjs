import http from 'node:http';
import { isMain } from './runtime-lib.mjs';

const fixtures = new Set(['text', 'tool', 'thinking', 'thinking-missing', 'http-400', 'http-429', 'http-500', 'timeout']);
const errorStatus = { 'http-400': 400, 'http-429': 429, 'http-500': 500 };
const maxBodyBytes = 1024 * 1024;

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

function observe(observations, request, body, fixture) {
  observations.push({
    method: request.method,
    path: new URL(request.url, 'http://mock').pathname,
    fixture,
    header_names: Object.keys(request.headers).sort(),
    body_shape: body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body).sort() : [],
  });
  if (observations.length > 100) observations.shift();
}

function openAi(body, fixture) {
  const toolResult = body.messages?.some((message) => message.role === 'tool');
  const tool = fixture === 'tool' && body.tools?.length && !toolResult;
  return {
    id: 'chatcmpl_mock', object: 'chat.completion', created: 0, model: body.model,
    choices: [{ index: 0, message: tool ? { role: 'assistant', tool_calls: [{ id: 'call_mock', type: 'function', function: { name: body.tools[0].function?.name ?? 'mock_tool', arguments: '{}' } }] } : { role: 'assistant', content: 'mock text' }, finish_reason: tool ? 'tool_calls' : 'stop' }],
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
  return http.createServer(async (request, response) => {
    const path = new URL(request.url, 'http://mock').pathname;
    if (request.method === 'GET' && path === '/healthz') return sendJson(response, 200, { status: 'ok' });
    if (request.method === 'GET' && path === '/__mock/requests') return sendJson(response, 200, { requests: observations });
    if (request.method === 'POST' && path === '/__mock/reset') { observations.length = 0; return sendJson(response, 200, { status: 'ok' }); }
    const isProtocol = ['/openai/v1/chat/completions', '/anthropic/v1/messages', '/anthropic/v1/messages/count_tokens'].includes(path);
    if (!isProtocol) return sendJson(response, 404, { error: { type: 'not_found' } });
    if (request.method !== 'POST') return sendJson(response, 405, { error: { type: 'method_not_allowed' } });
    let body;
    try { body = await readJson(request); } catch (error) { return sendJson(response, error.message === 'body-too-large' ? 413 : 400, { error: { type: error.message } }); }
    const fixture = request.headers['x-mock-fixture'] ?? 'text';
    observe(observations, request, body, fixtures.has(fixture) ? fixture : 'invalid');
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

if (isMain(import.meta)) {
  const port = Number(process.env.MOCK_PORT ?? 18080);
  createMockServer().listen(port, '127.0.0.1', () => process.stdout.write(JSON.stringify({ status: 'ready', port }) + '\n'));
}
