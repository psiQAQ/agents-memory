import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { ensureFetchSafeServer, isFetchBlockedPort } from './helpers.mjs';

async function withMock(run) {
  const { createMockServer } = await import('../tools/mock-llm.mjs');
  const server = createMockServer({ timeoutMs: 80 });
  await ensureFetchSafeServer(server);
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
    assert.equal(observation.requests.at(-1).sensitive_value_seen, false);
    assert.equal(observation.requests.at(-1).unexpected_credential_seen, true);
    assert.equal(observation.requests.at(-1).memory_user_credential_seen, true);
    assert.doesNotMatch(JSON.stringify(observation), /sk-mem-|never store this/);

    await fetch(`${baseUrl}/openai/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer mock-key', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'mock', messages: [] }),
    });
    const allowedCredential = await (await fetch(`${baseUrl}/__mock/requests`)).json();
    assert.equal(allowedCredential.requests.at(-1).unexpected_credential_seen, false);
    assert.equal(allowedCredential.requests.at(-1).memory_user_credential_seen, false);

    for (const path of ['/openai/v1/chat/completions', '/anthropic/v1/messages']) {
      await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'mock', messages: [] }),
      });
      const missingCredential = await (await fetch(`${baseUrl}/__mock/requests`)).json();
      assert.equal(missingCredential.requests.at(-1).unexpected_credential_seen, true);
    }
    await fetch(`${baseUrl}/anthropic/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': 'mock-key' },
      body: JSON.stringify({ model: 'mock', messages: [] }),
    });
    const allowedAnthropicCredential = await (await fetch(`${baseUrl}/__mock/requests`)).json();
    assert.equal(allowedAnthropicCredential.requests.at(-1).unexpected_credential_seen, false);

    const credentialName = `sk-mem-${'C'.repeat(32)}`;
    await fetch(`${baseUrl}/openai/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer mock-key', 'content-type': 'application/json', [credentialName]: 'present' },
      body: JSON.stringify({ model: 'mock', messages: [] }),
    });
    const credentialNameObservation = await (await fetch(`${baseUrl}/__mock/requests`)).json();
    assert.equal(credentialNameObservation.requests.at(-1).memory_user_credential_seen, true);
    assert.doesNotMatch(JSON.stringify(credentialNameObservation), new RegExp(credentialName, 'i'));

    const sentinelName = 'MEMORY_IDENTITY_LEAK_SENTINEL_PROPERTY789';
    await fetch(`${baseUrl}/openai/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer mock-key', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'mock', messages: [], [sentinelName]: true }),
    });
    const sentinelNameObservation = await (await fetch(`${baseUrl}/__mock/requests`)).json();
    assert.equal(sentinelNameObservation.requests.at(-1).sensitive_value_seen, true);
    assert.doesNotMatch(JSON.stringify(sentinelNameObservation), new RegExp(sentinelName, 'i'));

    const sentinel = 'MEMORY_LEAK_SENTINEL_TEST123';
    await fetch(`${baseUrl}/openai/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-wecom-id': sentinel },
      body: JSON.stringify({ model: 'mock', messages: [] }),
    });
    const leakedObservation = await (await fetch(`${baseUrl}/__mock/requests`)).json();
    assert.equal(leakedObservation.requests.at(-1).sensitive_value_seen, true);
    assert.doesNotMatch(JSON.stringify(leakedObservation), new RegExp(sentinel));

    const gatewaySentinel = 'MEMORY_GATEWAY_LEAK_SENTINEL_TEST456';
    await fetch(`${baseUrl}/openai/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-tdai-service-token': gatewaySentinel },
      body: JSON.stringify({ model: 'mock', messages: [] }),
    });
    const gatewayObservation = await (await fetch(`${baseUrl}/__mock/requests`)).json();
    assert.equal(gatewayObservation.requests.at(-1).sensitive_value_seen, true);
    assert.doesNotMatch(JSON.stringify(gatewayObservation), new RegExp(gatewaySentinel));

    const identitySentinel = 'MEMORY_IDENTITY_LEAK_SENTINEL_TEST789';
    await fetch(`${baseUrl}/openai/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer mock-key', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'mock', system: identitySentinel, messages: [{ role: 'user', content: `sk-mem-${'B'.repeat(32)}` }] }),
    });
    const bodyLeakObservation = await (await fetch(`${baseUrl}/__mock/requests`)).json();
    assert.equal(bodyLeakObservation.requests.at(-1).sensitive_value_seen, true);
    assert.equal(bodyLeakObservation.requests.at(-1).memory_user_credential_seen, true);
    assert.equal(bodyLeakObservation.requests.at(-1).unexpected_credential_seen, false);
    assert.doesNotMatch(JSON.stringify(bodyLeakObservation), /MEMORY_IDENTITY_LEAK_SENTINEL|sk-mem-/);
    assert.equal((await fetch(`${baseUrl}/__mock/reset`, { method: 'POST' })).status, 200);
    assert.deepEqual((await (await fetch(`${baseUrl}/__mock/requests`)).json()).requests, []);
  });
});

test('mock keeps a bounded redacted Stage 1 aggregate without raw prompts or markers', async () => {
  await withMock(async (baseUrl) => {
    const operation = 'STAGE1_OP_WRITE_CLAUDE_ABC123';
    const marker = 'MEMORY_NONCE_ABC123XYZ';
    await fetch(`${baseUrl}/anthropic/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': 'mock-key' },
      body: JSON.stringify({ model: 'mock', messages: [{ role: 'user', content: `${operation} remember ${marker}` }] }),
    });
    await fetch(`${baseUrl}/openai/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer mock-key', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'mock', messages: [{ role: 'user', content: operation }] }),
    });
    const aggregate = await (await fetch(`${baseUrl}/__mock/aggregate`)).json();
    assert.match(aggregate.epoch, /^[a-f0-9-]{36}$/);
    assert.equal(aggregate.sequence, 2);
    assert.equal(aggregate.total_requests, 2);
    assert.equal(aggregate.dropped_requests, 0);
    assert.equal(aggregate.truncated, false);
    assert.deepEqual(aggregate.paths['/anthropic/v1/messages'], { requests: 1, sequences: [1] });
    assert.deepEqual(aggregate.paths['/openai/v1/chat/completions'], { requests: 1, sequences: [2] });
    assert.deepEqual(aggregate.sticky_leaks, { credential: false, identity: false, sentinel: false });
    assert.equal(Object.keys(aggregate.operations).length, 1);
    const observed = Object.values(aggregate.operations)[0];
    assert.equal(observed.requests, 2);
    assert.deepEqual(observed.paths, {
      '/anthropic/v1/messages': { requests: 1, sequences: [1], marker_hashes: [createHash('sha256').update(marker).digest('hex')] },
      '/openai/v1/chat/completions': { requests: 1, sequences: [2], marker_hashes: [] },
    });
    assert.equal(observed.paths['/anthropic/v1/messages'].marker_hashes.length, 1);
    assert.match(observed.paths['/anthropic/v1/messages'].marker_hashes[0], /^[a-f0-9]{64}$/);
    assert.equal(observed.marker_hashes, undefined);
    assert.doesNotMatch(JSON.stringify(aggregate), /STAGE1_OP_|MEMORY_NONCE_|remember/i);

    const reset = await (await fetch(`${baseUrl}/__mock/reset`, { method: 'POST' })).json();
    assert.equal(reset.status, 'ok');
    assert.match(reset.epoch, /^[a-f0-9-]{36}$/);
    assert.notEqual(reset.epoch, aggregate.epoch);
    assert.equal(reset.sequence, 2);
    assert.deepEqual(await (await fetch(`${baseUrl}/__mock/aggregate`)).json(), {
      epoch: reset.epoch,
      sequence: 2,
      total_requests: 0,
      dropped_requests: 0,
      truncated: false,
      paths: {},
      fixtures: {},
      operations: {},
      sticky_leaks: { credential: false, identity: false, sentinel: false },
    });
  });
});

test('mock keeps sticky leak flags and reports truncation after bounded observations drop the leaking request', async () => {
  await withMock(async (baseUrl) => {
    const sentinel = 'MEMORY_IDENTITY_LEAK_SENTINEL_STICKY123';
    await fetch(`${baseUrl}/anthropic/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-team-id': 'unsafe-team', 'x-api-key': `sk-mem-${'Z'.repeat(32)}` },
      body: JSON.stringify({ model: 'mock', messages: [{ role: 'user', content: sentinel }] }),
    });
    for (let index = 0; index < 100; index += 1) {
      await fetch(`${baseUrl}/anthropic/v1/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': 'mock-key' },
        body: JSON.stringify({ model: 'mock', messages: [] }),
      });
    }
    const aggregate = await (await fetch(`${baseUrl}/__mock/aggregate`)).json();
    assert.match(aggregate.epoch, /^[a-f0-9-]{36}$/);
    assert.equal(aggregate.sequence, 101);
    assert.equal(aggregate.total_requests, 101);
    assert.equal(aggregate.dropped_requests, 1);
    assert.equal(aggregate.truncated, true);
    assert.equal(aggregate.paths['/anthropic/v1/messages'].requests, 101);
    assert.equal(aggregate.paths['/anthropic/v1/messages'].sequences.length, 100);
    assert.deepEqual(aggregate.sticky_leaks, { credential: true, identity: true, sentinel: true });
    assert.doesNotMatch(JSON.stringify(aggregate), /sk-mem-|unsafe-team|MEMORY_IDENTITY_LEAK_SENTINEL/i);
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

test('mock returns deterministic Core L1 extraction JSON with the real message id and nonce', async () => {
  await withMock(async (baseUrl) => {
    const response = await request(baseUrl, '/openai/v1/chat/completions', {
      model: 'mock-model',
      messages: [
        { role: 'system', content: '你是专业的“情境切分与记忆提取专家”。返回且仅返回一个合法的 JSON 数组。' },
        { role: 'user', content: '【待提取的新消息】：\n[msg-nonce-1] [user] [2026-08-09T00:00:00.000Z]: 请长期记住 MEMORY_NONCE_ABC123。' },
      ],
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    const extracted = JSON.parse(body.choices[0].message.content);
    assert.deepEqual(extracted[0].message_ids, ['msg-nonce-1']);
    assert.deepEqual(extracted[0].memories[0].source_message_ids, ['msg-nonce-1']);
    assert.match(extracted[0].memories[0].content, /MEMORY_NONCE_ABC123/);
    assert.equal(extracted[0].memories[0].type, 'instruction');

    const ordinary = await (await request(baseUrl, '/openai/v1/chat/completions', { model: 'mock-model', messages: [{ role: 'user', content: 'MEMORY_NONCE_ABC123' }] })).json();
    assert.equal(ordinary.choices[0].message.content, 'mock text');
  });
});

test('fetch-safe listeners retry blocked dynamic ports and mock CLI binds the container interface', async () => {
  const blockedPorts = [
    0, 1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77,
    79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135,
    137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
    540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723,
    2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669,
    6679, 6697, 10080,
  ];
  assert.deepEqual(Array.from({ length: 65536 }, (_, port) => port).filter(isFetchBlockedPort), blockedPorts);
  assert.equal(isFetchBlockedPort(4190), true);
  assert.equal(isFetchBlockedPort(6679), true);
  assert.equal(isFetchBlockedPort(10080), true);
  assert.equal(isFetchBlockedPort(15001), false);

  const fakeListener = (ports, initialPort) => {
    const server = new EventEmitter();
    const calls = { close: 0, listen: 0 };
    let currentPort = initialPort;
    server.listening = initialPort !== undefined;
    server.address = () => server.listening ? { address: '127.0.0.1', family: 'IPv4', port: currentPort } : null;
    server.close = (callback) => {
      calls.close += 1;
      server.listening = false;
      queueMicrotask(callback);
      return server;
    };
    server.listen = (port, host, callback) => {
      assert.equal(port, 0);
      assert.equal(host, '127.0.0.1');
      currentPort = ports[calls.listen];
      calls.listen += 1;
      server.listening = true;
      queueMicrotask(callback);
      return server;
    };
    return { calls, server };
  };

  const retried = fakeListener([6000, 15001]);
  assert.equal(await ensureFetchSafeServer(retried.server), retried.server);
  assert.deepEqual(retried.calls, { close: 1, listen: 2 });
  assert.equal(retried.server.address().port, 15001);

  const alreadyListening = fakeListener([15001], 6000);
  assert.equal(await ensureFetchSafeServer(alreadyListening.server), alreadyListening.server);
  assert.deepEqual(alreadyListening.calls, { close: 1, listen: 1 });
  assert.equal(alreadyListening.server.address().port, 15001);

  const exhausted = fakeListener([6000]);
  await assert.rejects(ensureFetchSafeServer(exhausted.server, '127.0.0.1', 1), /fetch-safe listener/);
  assert.deepEqual(exhausted.calls, { close: 1, listen: 1 });
  assert.equal(exhausted.server.listening, false);

  const invalid = fakeListener([15001]);
  invalid.server.address = () => null;
  await assert.rejects(ensureFetchSafeServer(invalid.server), /invalid listener address/);
  assert.deepEqual(invalid.calls, { close: 1, listen: 1 });
  assert.equal(invalid.server.listening, false);

  const { listenMockServer } = await import('../tools/mock-llm.mjs');
  const server = await ensureFetchSafeServer(
    await listenMockServer({ host: '0.0.0.0', port: 0, timeoutMs: 80 }),
    '0.0.0.0',
  );
  try {
    assert.equal(server.address().address, '0.0.0.0');
    assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/healthz`)).status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
