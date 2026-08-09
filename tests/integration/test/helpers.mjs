import http from 'node:http';

export async function fakeCore({ initAdmin, failure } = {}) {
  const requests = [];
  const keys = Object.fromEntries(['admin', 'agent-a', 'agent-b', 'agent-c'].map((name, index) => [name, `sk-mem-${String.fromCharCode(65 + index).repeat(32)}`]));
  const users = Object.fromEntries(['agent-a', 'agent-b', 'agent-c'].map((name) => [name, `usr-${name}`]));
  const server = http.createServer(async (request, response) => {
    const body = JSON.parse(await new Promise((resolve) => { let text = ''; request.on('data', (chunk) => { text += chunk; }); request.on('end', () => resolve(text)); }));
    requests.push({ path: request.url, body, userKey: request.headers['x-tdai-user-key'] });
    const ok = (data) => { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ code: 0, message: 'ok', request_id: 'req', data })); };
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
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, requests, keys, close: () => new Promise((resolve) => server.close(resolve)) };
}
