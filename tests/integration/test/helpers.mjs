import http from 'node:http';

export async function fakeCore({ initAdmin, failure, gatewayToken, bindingMutation } = {}) {
  const requests = [];
  const keys = Object.fromEntries(['admin', 'agent-a', 'agent-b', 'agent-c'].map((name, index) => [name, `sk-mem-${String.fromCharCode(65 + index).repeat(32)}`]));
  const users = Object.fromEntries(['agent-a', 'agent-b', 'agent-c'].map((name) => [name, `usr-${name}`]));
  const bindings = Object.fromEntries(['agent-a', 'agent-b', 'agent-c'].map((name) => [name, [{
    id: `binding-${name}`,
    agent_id: `agt-${users[name]}`,
    asset_id: `chat_memory-team-runtime-agt-${users[name]}`,
    asset_type: 'chat_memory',
    injection_mode: 'summary',
    priority: 0,
    created_by: users[name],
    created_at: '2026-08-09T00:00:00.000Z',
  }]]));
  const assets = Object.fromEntries(Object.entries(bindings).map(([name, rows]) => [rows[0].asset_id, {
    asset_id: rows[0].asset_id,
    team_id: 'team-runtime',
    asset_type: 'chat_memory',
    name: `Chat Memory: ${name}`,
    owner_user_id: users[name],
    source_type: 'auto',
    version: 1,
    visibility: 'private',
    status: 'active',
    usage_count: 0,
    created_at: '2026-08-09T00:00:00.000Z',
    updated_at: '2026-08-09T00:00:00.000Z',
    metadata_json: '{}',
  }]));
  const server = http.createServer(async (request, response) => {
    const body = JSON.parse(await new Promise((resolve) => { let text = ''; request.on('data', (chunk) => { text += chunk; }); request.on('end', () => resolve(text)); }));
    const seen = { path: request.url, body, userKey: request.headers['x-tdai-user-key'], authorization: request.headers.authorization, serviceId: request.headers['x-tdai-service-id'] };
    requests.push(seen);
    const ok = (data) => { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ code: 0, message: 'ok', request_id: 'req', data })); };
    const reject = (status = 401) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify({ code: status, message: 'rejected', data: null })); };
    if (gatewayToken && (seen.authorization !== `Bearer ${gatewayToken}` || seen.serviceId !== 'default')) return reject();
    if (failure && request.url.endsWith(failure.path)) {
      if (failure.delayMs) await new Promise((resolve) => setTimeout(resolve, failure.delayMs));
      if (failure.status) { response.writeHead(failure.status, { 'content-type': 'application/json' }); response.end(JSON.stringify({ code: 1, data: null })); return; }
      if ('envelope' in failure) { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(failure.envelope)); return; }
    }
    if (request.url.endsWith('/init-admin')) return ok(initAdmin ?? { user_id: 'usr-admin', user_key: keys.admin });
    if (request.url.endsWith('/user/create')) { const name = body.username.match(/agent-[abc]/)?.[0]; return ok({ user_id: users[name], default_user_key: keys[name] }); }
    if (request.url.endsWith('/team/create')) return ok({ team_id: 'team-runtime' });
    if (request.url.endsWith('/team-member/add')) return ok({ member_id: 'member-runtime' });
    if (request.url.endsWith('/agent/create')) return ok({ agent_id: `agt-${body.owner_user_id}` });
    if (request.url.endsWith('/task/create')) return ok({ task_id: 'task-runtime' });
    if (request.url.endsWith('/agent-fixed-asset/list')) {
      const name = Object.keys(users).find((candidate) => `agt-${users[candidate]}` === body.agent_id);
      return ok({ items: structuredClone(bindings[name] ?? []), total: bindings[name]?.length ?? 0, limit: body.limit ?? 20, offset: body.offset ?? 0 });
    }
    if (request.url.endsWith('/asset/get')) return assets[body.asset_id] ? ok(structuredClone(assets[body.asset_id])) : reject(404);
    if (request.url.endsWith('/asset/update')) {
      if (!assets[body.asset_id]) return reject(404);
      assets[body.asset_id] = { ...assets[body.asset_id], ...body };
      return ok(structuredClone(assets[body.asset_id]));
    }
    if (request.url.endsWith('/agent-fixed-asset/set')) {
      const name = Object.keys(users).find((candidate) => `agt-${users[candidate]}` === body.agent_id);
      bindings[name] = body.bindings.map((binding, index) => ({ id: `binding-${name}-${index}`, agent_id: body.agent_id, injection_mode: 'summary', priority: 0, created_at: '2026-08-09T00:00:00.000Z', ...binding }));
      if (name === 'agent-b' && bindingMutation) {
        const own = bindings[name].find((binding) => binding.asset_id === `chat_memory-team-runtime-agt-${users[name]}`);
        if (bindingMutation.remove) delete own[bindingMutation.field];
        else own[bindingMutation.field] = bindingMutation.value;
      }
      return ok({ ok: true });
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, requests, keys, bindings, assets, close: () => new Promise((resolve) => server.close(resolve)) };
}
