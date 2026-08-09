import assert from 'node:assert/strict';
import test from 'node:test';

async function withMock(run) {
  const { createMockServer } = await import('../tools/mock-llm.mjs');
  const server = createMockServer({ timeoutMs: 80 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function readEvents(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(decoder.decode(value, { stream: true }));
  }
  const events = chunks.join('').trim().split('\n\n').map((event) => Object.fromEntries(event.split('\n').map((line) => line.startsWith('event: ') ? ['event', line.slice(7)] : ['data', line.slice(6)])));
  return { chunks, events };
}

function request(baseUrl, path, body, fixture = 'text') {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mock-fixture': fixture, authorization: `Bearer sk-mem-${'A'.repeat(32)}` },
    body: JSON.stringify(body),
  });
}

test('mock only exposes whitelisted routes and sanitized observations', async () => {
  await withMock(async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/healthz`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/v1/messages`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/openai/v1/chat/completions`)).status, 405);
    assert.equal((await fetch(`${baseUrl}/openai/v1/chat/completions`, { method: 'POST', body: '{' })).status, 400);
    assert.equal((await request(baseUrl, '/openai/v1/chat/completions', { model: 'mock', messages: [] }, 'unknown')).status, 400);
    await request(baseUrl, '/openai/v1/chat/completions', { model: 'mock', messages: [] }, 'sk-mem-UNTRUSTED');
    assert.equal((await request(baseUrl, '/openai/v1/chat/completions', { model: 'mock', messages: [], payload: 'x'.repeat(1024 * 1024) })).status, 413);
    await request(baseUrl, '/openai/v1/chat/completions', { model: 'mock', messages: [{ role: 'user', content: 'never store this' }] });
    const observation = await (await fetch(`${baseUrl}/__mock/requests`)).json();
    assert.equal(observation.requests.at(-1).path, '/openai/v1/chat/completions');
    assert.deepEqual(observation.requests.at(-1).body_shape, ['messages', 'model']);
    assert.ok(observation.requests.at(-1).header_names.includes('authorization'));
    assert.doesNotMatch(JSON.stringify(observation), /sk-mem-|never store this/);
    assert.equal((await fetch(`${baseUrl}/__mock/reset`, { method: 'POST' })).status, 200);
    assert.deepEqual((await (await fetch(`${baseUrl}/__mock/requests`)).json()).requests, []);
  });
});

test('mock provides deterministic OpenAI text, stream, tool, errors, and timeout', async () => {
  await withMock(async (baseUrl) => {
    const text = await (await request(baseUrl, '/openai/v1/chat/completions', { model: 'mock', messages: [] })).json();
    assert.deepEqual(text.usage, { prompt_tokens: 11, completion_tokens: 3, total_tokens: 14 });
    assert.equal(text.choices[0].message.content, 'mock text');
    const stream = await request(baseUrl, '/openai/v1/chat/completions', { model: 'mock', messages: [], stream: true });
    assert.match(stream.headers.get('content-type'), /text\/event-stream/);
    const openAiEvents = await readEvents(stream);
    assert.ok(openAiEvents.chunks.length > 1);
    assert.deepEqual(openAiEvents.events.map((event) => event.data === '[DONE]' ? 'done' : JSON.parse(event.data).choices[0].finish_reason ?? 'delta'), ['delta', 'delta', 'stop', 'done']);
    const tool = await (await request(baseUrl, '/openai/v1/chat/completions', { model: 'mock', messages: [], tools: [{ type: 'function', function: { name: 'echo' } }] }, 'tool')).json();
    assert.equal(tool.choices[0].finish_reason, 'tool_calls');
    assert.equal(tool.choices[0].message.tool_calls[0].function.name, 'echo');
    const afterTool = await (await request(baseUrl, '/openai/v1/chat/completions', { model: 'mock', messages: [{ role: 'tool', content: '{}' }] }, 'tool')).json();
    assert.equal(afterTool.choices[0].message.content, 'mock text');
    for (const [fixture, status] of [['http-400', 400], ['http-429', 429], ['http-500', 500]]) {
      const response = await request(baseUrl, '/openai/v1/chat/completions', { model: 'mock', messages: [] }, fixture);
      assert.equal(response.status, status);
      assert.equal((await response.json()).error.type, 'mock_error');
    }
    await assert.rejects(fetch(`${baseUrl}/openai/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-mock-fixture': 'timeout' }, body: JSON.stringify({ model: 'mock', messages: [] }), signal: AbortSignal.timeout(20) }), /Abort|aborted|timeout/i);
  });
});

test('mock provides Anthropic text, streaming tool/thinking fixtures, and deterministic count tokens', async () => {
  await withMock(async (baseUrl) => {
    const text = await (await request(baseUrl, '/anthropic/v1/messages', { model: 'mock', messages: [] })).json();
    assert.equal(text.type, 'message');
    assert.equal(text.content[0].text, 'mock text');
    const thinking = await (await request(baseUrl, '/anthropic/v1/messages', { model: 'mock', messages: [] }, 'thinking')).json();
    assert.equal(thinking.content[0].type, 'thinking');
    const stream = await request(baseUrl, '/anthropic/v1/messages', { model: 'mock', messages: [], stream: true }, 'thinking');
    const anthEvents = await readEvents(stream);
    assert.ok(anthEvents.chunks.length > 1);
    assert.deepEqual(anthEvents.events.map((event) => event.event), ['message_start', 'content_block_start', 'content_block_delta', 'content_block_stop', 'content_block_start', 'content_block_delta', 'content_block_stop', 'message_delta', 'message_stop']);
    const tool = await request(baseUrl, '/anthropic/v1/messages', { model: 'mock', messages: [], tools: [{ name: 'echo' }], stream: true }, 'tool');
    assert.match(await tool.text(), /tool_use/);
    const streamedAfterTool = await request(baseUrl, '/anthropic/v1/messages', { model: 'mock', messages: [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_mock', content: '{}' }] }], tools: [{ name: 'echo' }], stream: true }, 'tool');
    const afterToolEvents = await readEvents(streamedAfterTool);
    assert.match(afterToolEvents.chunks.join(''), /text_delta/);
    assert.doesNotMatch(afterToolEvents.chunks.join(''), /tool_use/);
    const afterTool = await (await request(baseUrl, '/anthropic/v1/messages', { model: 'mock', messages: [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_mock', content: '{}' }] }] }, 'tool')).json();
    assert.equal(afterTool.content[0].type, 'text');
    const missing = await (await request(baseUrl, '/anthropic/v1/messages', { model: 'mock', messages: [] }, 'thinking-missing')).json();
    assert.equal(missing.content[0].type, 'thinking');
    assert.equal('thinking' in missing.content[0], false);
    const missingStream = await request(baseUrl, '/anthropic/v1/messages', { model: 'mock', messages: [], stream: true }, 'thinking-missing');
    assert.match(await missingStream.text(), /"type":"thinking"/);
    const tokenBody = { model: 'mock', messages: [{ role: 'user', content: 'hello' }] };
    const tokens = await (await request(baseUrl, '/anthropic/v1/messages/count_tokens', tokenBody)).json();
    assert.equal(tokens.input_tokens, Math.max(1, Math.ceil(Buffer.byteLength(JSON.stringify(tokenBody)) / 4)));
    for (const [fixture, status] of [['http-400', 400], ['http-429', 429], ['http-500', 500]]) {
      const response = await request(baseUrl, '/anthropic/v1/messages', { model: 'mock', messages: [] }, fixture);
      assert.equal(response.status, status);
      assert.equal((await response.json()).type, 'error');
    }
  });
});

test('mock OpenAI stream supplies a tool call then resolves after a tool result', async () => {
  await withMock(async (baseUrl) => {
    const tool = await request(baseUrl, '/openai/v1/chat/completions', { model: 'mock', messages: [], tools: [{ type: 'function', function: { name: 'echo' } }], stream: true }, 'tool');
    assert.match(await tool.text(), /tool_calls/);
    const afterTool = await request(baseUrl, '/openai/v1/chat/completions', { model: 'mock', messages: [{ role: 'tool', content: '{}' }], stream: true }, 'tool');
    assert.match(await afterTool.text(), /mock text/);
  });
});

test('mock CLI listener can bind the container interface and configured port', async () => {
  const { listenMockServer } = await import('../tools/mock-llm.mjs');
  const server = await listenMockServer({ host: '0.0.0.0', port: 0, timeoutMs: 80 });
  try {
    assert.equal(server.address().address, '0.0.0.0');
    assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/healthz`)).status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
