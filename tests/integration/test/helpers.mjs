import http from 'node:http';

const FETCH_BLOCKED_PORTS = new Set([
  0, 1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77,
  79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135,
  137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723,
  2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669,
  6679, 6697, 10080,
]);

export function isFetchBlockedPort(port) {
  return FETCH_BLOCKED_PORTS.has(port);
}

function listenOnDynamicPort(server, host) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('error', onError);
      reject(error);
    };
    server.once('error', onError);
    try {
      server.listen(0, host, () => {
        server.off('error', onError);
        resolve();
      });
    } catch (error) {
      server.off('error', onError);
      reject(error);
    }
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    try {
      server.close((error) => error ? reject(error) : resolve());
    } catch (error) {
      reject(error);
    }
  });
}

export async function ensureFetchSafeServer(server, host = '127.0.0.1', maxAttempts = 100) {
  if (!server || typeof server.address !== 'function' || typeof server.close !== 'function'
    || typeof server.listen !== 'function' || typeof server.once !== 'function' || typeof server.off !== 'function'
    || typeof server.listening !== 'boolean' || typeof host !== 'string' || host.length === 0
    || !Number.isInteger(maxAttempts) || maxAttempts < 1) throw new Error('invalid fetch-safe listener');
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!server.listening) await listenOnDynamicPort(server, host);
    const address = server.address();
    if (!address || typeof address === 'string' || !Number.isInteger(address.port) || address.port < 0 || address.port > 65535) {
      if (server.listening) await closeServer(server);
      throw new Error('invalid listener address');
    }
    if (!isFetchBlockedPort(address.port)) return server;
    await closeServer(server);
  }
  throw new Error('unable to allocate fetch-safe listener');
}

export async function fakeCore({ initAdmin, failure, gatewayToken, bindingMutation, addedBindingMutation, duplicateOwnerField, outsiderOverlapField, sameOutsiderScope = false, clientNames = ['agent-a', 'agent-b', 'agent-c'], outsiderName } = {}) {
  const requests = [];
  const names = [...clientNames, ...(outsiderName ? [outsiderName] : [])];
  const keys = Object.fromEntries(['admin', ...names].map((name, index) => [name, `sk-mem-${String.fromCharCode(65 + index).repeat(32)}`]));
  const users = Object.fromEntries(names.map((name) => [name, `usr-${name}`]));
  const agents = Object.fromEntries(names.map((name) => [name, `agt-usr-${name}`]));
  const assetIds = Object.fromEntries(names.map((name) => [name, `chat_memory-${name === outsiderName ? 'team-outsider-runtime' : 'team-runtime'}-${agents[name]}`]));
  if (duplicateOwnerField === 'user_id') users[clientNames[1]] = users[clientNames[0]];
  if (duplicateOwnerField === 'user_key') keys[clientNames[1]] = keys[clientNames[0]];
  if (duplicateOwnerField === 'agent_id') agents[clientNames[1]] = agents[clientNames[0]];
  if (duplicateOwnerField === 'asset_id') assetIds[clientNames[1]] = assetIds[clientNames[0]];
  if (outsiderName && outsiderOverlapField === 'user_id') users[outsiderName] = users[clientNames[0]];
  if (outsiderName && outsiderOverlapField === 'user_key') keys[outsiderName] = keys[clientNames[0]];
  if (outsiderName && outsiderOverlapField === 'agent_id') agents[outsiderName] = agents[clientNames[0]];
  const teamFor = (name) => name === outsiderName && !sameOutsiderScope && outsiderOverlapField !== 'team_id' ? 'team-outsider-runtime' : 'team-runtime';
  const taskFor = (name) => name === outsiderName && !sameOutsiderScope && outsiderOverlapField !== 'task_id' ? 'task-outsider-runtime' : 'task-runtime';
  const bindings = Object.fromEntries(names.map((name) => [name, [{
    id: `binding-${name}`,
    agent_id: agents[name],
    asset_id: assetIds[name],
    asset_type: 'chat_memory',
    injection_mode: 'summary',
    priority: 0,
    created_by: users[name],
    created_at: '2026-08-09T00:00:00.000Z',
  }]]));
  const assetsByName = Object.fromEntries(Object.entries(bindings).map(([name, rows]) => [name, {
    asset_id: rows[0].asset_id,
    team_id: teamFor(name),
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
  const assets = Object.fromEntries(Object.values(assetsByName).map((asset) => [asset.asset_id, asset]));
  const server = http.createServer(async (request, response) => {
    const body = JSON.parse(await new Promise((resolve) => { let text = ''; request.on('data', (chunk) => { text += chunk; }); request.on('end', () => resolve(text)); }));
    const seen = { path: request.url, body, userKey: request.headers['x-tdai-user-key'], authorization: request.headers.authorization, serviceId: request.headers['x-tdai-service-id'] };
    requests.push(seen);
    const ok = (data) => { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ code: 0, message: 'ok', request_id: 'req', data })); };
    const reject = (status = 401) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify({ code: status, message: 'rejected', data: null })); };
    const callerNames = names.filter((name) => keys[name] === seen.userKey);
    const callerOwnsUser = (userId) => callerNames.some((name) => users[name] === userId);
    const callerOwnsAgent = (agentId) => callerNames.some((name) => agents[name] === agentId);
    if (gatewayToken && (seen.authorization !== `Bearer ${gatewayToken}` || seen.serviceId !== 'default')) return reject();
    if (failure && request.url.endsWith(failure.path)) {
      if (failure.delayMs) await new Promise((resolve) => setTimeout(resolve, failure.delayMs));
      if (failure.status) { response.writeHead(failure.status, { 'content-type': 'application/json' }); response.end(JSON.stringify({ code: 1, data: null })); return; }
      if ('envelope' in failure) { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(failure.envelope)); return; }
    }
    if (request.url.endsWith('/init-admin')) return seen.userKey === undefined ? ok(initAdmin ?? { user_id: 'usr-admin', user_key: keys.admin }) : reject();
    if (request.url.endsWith('/user/create')) {
      if (seen.userKey !== keys.admin) return reject();
      const name = names.find((candidate) => body.username.endsWith(`-${candidate}`));
      return name ? ok({ user_id: users[name], default_user_key: keys[name] }) : reject(400);
    }
    if (request.url.endsWith('/team/create')) {
      const name = callerNames.find((candidate) => users[candidate] === body.owner_user_id);
      return name ? ok({ team_id: teamFor(name) }) : reject();
    }
    if (request.url.endsWith('/team-member/add')) {
      if (seen.userKey !== keys[clientNames[0]] || body.team_id !== teamFor(clientNames[0]) || body.role !== 'member' || !clientNames.some((name) => users[name] === body.user_id)) return reject();
      return ok({ member_id: 'member-runtime' });
    }
    if (request.url.endsWith('/agent/create')) {
      const name = callerNames.find((candidate) => users[candidate] === body.owner_user_id && teamFor(candidate) === body.team_id);
      return name ? ok({ agent_id: agents[name] }) : reject();
    }
    if (request.url.endsWith('/task/create')) {
      const name = callerNames.find((candidate) => users[candidate] === body.creator_user_id && teamFor(candidate) === body.team_id);
      const linked = Array.isArray(body.linked_agents) && body.linked_agents.every(({ agent_id: agentId }) => names.some((candidate) => teamFor(candidate) === body.team_id && agents[candidate] === agentId));
      return name && linked ? ok({ task_id: taskFor(name) }) : reject();
    }
    if (request.url.endsWith('/agent-fixed-asset/list')) {
      const name = callerNames.find((candidate) => agents[candidate] === body.agent_id);
      if (!name) return reject();
      return ok({ items: structuredClone(bindings[name] ?? []), total: bindings[name]?.length ?? 0, limit: body.limit ?? 20, offset: body.offset ?? 0 });
    }
    if (request.url.endsWith('/asset/get')) {
      const name = callerNames.find((candidate) => assetIds[candidate] === body.asset_id && users[candidate] === assetsByName[candidate].owner_user_id);
      return name ? ok(structuredClone(assetsByName[name])) : reject();
    }
    if (request.url.endsWith('/asset/update')) {
      const name = callerNames.find((candidate) => assetIds[candidate] === body.asset_id && callerOwnsUser(assetsByName[candidate].owner_user_id));
      if (!name) return reject();
      assetsByName[name] = { ...assetsByName[name], ...body };
      assets[body.asset_id] = assetsByName[name];
      return ok(structuredClone(assetsByName[name]));
    }
    if (request.url.endsWith('/agent-fixed-asset/set')) {
      const name = callerNames.find((candidate) => agents[candidate] === body.agent_id);
      if (!name || !callerOwnsAgent(body.agent_id) || !Array.isArray(body.bindings)) return reject();
      bindings[name] = body.bindings.map((binding, index) => ({ id: `binding-${name}-${index}`, agent_id: body.agent_id, injection_mode: 'summary', priority: 0, created_at: '2026-08-09T00:00:00.000Z', ...binding }));
      const ownAssetId = assetIds[name];
      if (name === clientNames[1] && bindingMutation) {
        const own = bindings[name].find((binding) => binding.asset_id === ownAssetId);
        if (bindingMutation.remove) delete own[bindingMutation.field];
        else own[bindingMutation.field] = bindingMutation.value;
      }
      if (name === clientNames[1] && addedBindingMutation) {
        const added = bindings[name].find((binding) => binding.asset_id !== ownAssetId);
        if (addedBindingMutation.remove) delete added[addedBindingMutation.field];
        else added[addedBindingMutation.field] = addedBindingMutation.value;
      }
      return ok({ ok: true });
    }
    response.writeHead(404).end();
  });
  await ensureFetchSafeServer(server);
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, requests, keys, users, agents, assetIds, bindings, assets, close: () => new Promise((resolve) => server.close(resolve)) };
}
