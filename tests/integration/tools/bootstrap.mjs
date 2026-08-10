import { lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isMain } from './runtime-lib.mjs';

const keyPattern = /^sk-mem-[A-Za-z0-9_-]{32}$/;
const task4Sources = { claude: 'claude-code', opencode: 'opencode', pi: 'pi' };

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) values[argv[index]] = argv[index + 1];
  return values;
}

function validRunId(value) { return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value); }

function task4Selection(clientManifest, activeClients) {
  if (!Array.isArray(clientManifest) || clientManifest.length !== 3 || typeof activeClients !== 'string') throw new Error('invalid active clients');
  const byId = new Map();
  for (const client of clientManifest) {
    if (!client || typeof client !== 'object' || !Object.hasOwn(task4Sources, client.id) || client.source !== task4Sources[client.id] || typeof client.display_name !== 'string' || !client.display_name || byId.has(client.id)) throw new Error('invalid active clients');
    byId.set(client.id, client);
  }
  if (byId.size !== Object.keys(task4Sources).length) throw new Error('invalid active clients');
  const selected = activeClients.split(',');
  if (selected.length !== byId.size || new Set(selected).size !== selected.length || selected.some((id) => !byId.has(id))) throw new Error('invalid active clients');
  return selected.map((id) => byId.get(id));
}

async function readClientManifest(file) {
  if (!isAbsolute(file ?? '')) throw new Error('invalid client manifest');
  try {
    const metadata = await lstat(file);
    if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1 || metadata.size > 65536) throw new Error();
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    if (!manifest || manifest.schema_version !== 1 || !Array.isArray(manifest.clients)) throw new Error();
    return manifest.clients;
  } catch { throw new Error('invalid client manifest'); }
}

async function post(coreUrl, serviceId, path, body, userKey, serviceToken, timeoutMs = 10000) {
  const headers = { 'content-type': 'application/json', 'x-tdai-service-id': serviceId };
  if (userKey) headers['x-tdai-user-key'] = userKey;
  if (serviceToken) headers.authorization = `Bearer ${serviceToken}`;
  let response;
  try { response = await fetch(new URL(path, coreUrl), { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) }); } catch { throw new Error('core request failed'); }
  let envelope;
  try { envelope = await response.json(); } catch { throw new Error('invalid core response'); }
  if (!response.ok || envelope?.code !== 0 || !envelope.data) throw new Error('invalid core response');
  return envelope.data;
}

function requireId(data, name) {
  if (typeof data[name] !== 'string' || !data[name]) throw new Error(`missing ${name}`);
  return data[name];
}

function requireItems(data) {
  if (!Array.isArray(data?.items)) throw new Error('invalid core response');
  return data.items;
}

function bindingInput(binding) {
  const result = {
    asset_id: requireId(binding, 'asset_id'),
    asset_type: requireId(binding, 'asset_type'),
    created_by: requireId(binding, 'created_by'),
  };
  if (typeof binding.injection_mode === 'string' && binding.injection_mode) result.injection_mode = binding.injection_mode;
  if (Number.isInteger(binding.priority)) result.priority = binding.priority;
  return result;
}

async function secureWrite(file, value) {
  await writeFile(file, value, { encoding: 'utf8', mode: 0o600 });
}

async function publishManifest(file, value, writeFileImpl, renameFileImpl) {
  const temporary = join(dirname(file), `.${basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await writeFileImpl(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    const metadata = await lstat(temporary);
    if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1) throw new Error();
    await renameFileImpl(temporary, file);
  } catch {
    await unlink(temporary).catch(() => {});
    await unlink(file).catch(() => {});
    throw new Error('cannot publish run manifest');
  }
}

export async function bootstrap({ coreUrl, serviceId, runId, outputDir, clients, clientManifest, activeClients, timeoutMs = 10000, manifestWriteFile = writeFile, manifestRenameFile = rename }) {
  const task4Clients = clientManifest === undefined ? undefined : task4Selection(clientManifest, activeClients);
  if (task4Clients) clients = task4Clients.map(({ id }) => id);
  if (!/^https?:\/\//.test(coreUrl ?? '') || !serviceId || !validRunId(runId) || !isAbsolute(outputDir) || !Array.isArray(clients) || clients.length < 3 || new Set(clients).size !== clients.length || clients.some((client) => !/^[a-z][a-z0-9-]*$/.test(client)) || !Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error('invalid bootstrap arguments');
  let serviceToken;
  if (process.env.MEMORY_CORE_SERVICE_TOKEN_FILE) {
    try { serviceToken = (await readFile(process.env.MEMORY_CORE_SERVICE_TOKEN_FILE, 'utf8')).trim(); } catch { throw new Error('invalid MEMORY_CORE_SERVICE_TOKEN_FILE'); }
    if (!serviceToken || /[\r\n]/.test(serviceToken)) throw new Error('invalid MEMORY_CORE_SERVICE_TOKEN_FILE');
  }
  try { await mkdir(outputDir); } catch { throw new Error('output directory already initialized; destroy scenario volume'); }
  await mkdir(join(outputDir, 'credentials'));
  const call = (...arguments_) => post(...arguments_, timeoutMs);
  const admin = await call(coreUrl, serviceId, '/v3/internal/meta/user/init-admin', { username: `${runId}-admin` }, undefined, serviceToken);
  requireId(admin, 'user_id');
  const adminKey = requireId(admin, 'user_key');
  if (!keyPattern.test(adminKey)) throw new Error('invalid user_key');
  const users = {};
  const createUser = async (client) => {
    const data = await call(coreUrl, serviceId, '/v3/meta/user/create', { username: `${runId}-${client}` }, adminKey, serviceToken);
    const userId = requireId(data, 'user_id');
    const userKey = requireId(data, 'default_user_key');
    if (!keyPattern.test(userKey)) throw new Error('invalid default_user_key');
    users[client] = { user_id: userId, user_key: userKey };
  };
  await createUser(clients[0]);
  const owner = users[clients[0]];
  const team = await call(coreUrl, serviceId, '/v3/meta/team/create', { name: `team-${runId}`, owner_user_id: owner.user_id }, owner.user_key, serviceToken);
  const teamId = requireId(team, 'team_id');
  for (const client of clients.slice(1)) await createUser(client);
  for (const client of clients.slice(1)) await call(coreUrl, serviceId, '/v3/meta/team-member/add', { team_id: teamId, user_id: users[client].user_id, role: 'member' }, owner.user_key, serviceToken);
  for (const client of clients) {
    const agent = await call(coreUrl, serviceId, '/v3/meta/agent/create', { team_id: teamId, owner_user_id: users[client].user_id, name: client }, users[client].user_key, serviceToken);
    users[client].agent_id = requireId(agent, 'agent_id');
  }
  const task = await call(coreUrl, serviceId, '/v3/meta/task/create', { team_id: teamId, creator_user_id: owner.user_id, title: `task-${runId}`, linked_agents: clients.map((client) => ({ agent_id: users[client].agent_id })) }, owner.user_key, serviceToken);
  const taskId = requireId(task, 'task_id');

  let outsider;
  if (task4Clients) {
    await createUser('outsider');
    const outsiderUser = users.outsider;
    const outsiderTeam = await call(coreUrl, serviceId, '/v3/meta/team/create', { name: `team-${runId}-outsider`, owner_user_id: outsiderUser.user_id }, outsiderUser.user_key, serviceToken);
    const outsiderTeamId = requireId(outsiderTeam, 'team_id');
    const outsiderAgent = await call(coreUrl, serviceId, '/v3/meta/agent/create', { team_id: outsiderTeamId, owner_user_id: outsiderUser.user_id, name: 'outsider' }, outsiderUser.user_key, serviceToken);
    outsiderUser.agent_id = requireId(outsiderAgent, 'agent_id');
    const outsiderTask = await call(coreUrl, serviceId, '/v3/meta/task/create', { team_id: outsiderTeamId, creator_user_id: outsiderUser.user_id, title: `task-${runId}-outsider`, linked_agents: [{ agent_id: outsiderUser.agent_id }] }, outsiderUser.user_key, serviceToken);
    outsider = { team_id: outsiderTeamId, task_id: requireId(outsiderTask, 'task_id') };
  }

  const listBindings = async (client) => requireItems(await call(coreUrl, serviceId, '/v3/meta/agent-fixed-asset/list', { agent_id: users[client].agent_id, limit: 100, offset: 0 }, users[client].user_key, serviceToken));
  let sharedMemory;
  if (task4Clients) {
    const ownerAssetIds = {};
    for (const client of clients) {
      const memoryBindings = (await listBindings(client)).filter((binding) => binding?.asset_type === 'chat_memory');
      if (memoryBindings.length !== 1) throw new Error('invalid core response');
      const assetId = requireId(memoryBindings[0], 'asset_id');
      const asset = await call(coreUrl, serviceId, '/v3/meta/asset/get', { asset_id: assetId }, users[client].user_key, serviceToken);
      if (asset.asset_id !== assetId || asset.asset_type !== 'chat_memory' || asset.team_id !== teamId || asset.owner_user_id !== users[client].user_id) throw new Error('invalid core response');
      const shared = await call(coreUrl, serviceId, '/v3/meta/asset/update', { asset_id: assetId, visibility: 'team' }, users[client].user_key, serviceToken);
      if (shared.asset_id !== assetId || shared.visibility !== 'team') throw new Error('invalid core response');
      ownerAssetIds[client] = assetId;
    }
    for (const client of clients) {
      const existingInputs = (await listBindings(client)).map(bindingInput);
      const existingById = new Map(existingInputs.map((binding) => [binding.asset_id, binding]));
      const additions = Object.entries(ownerAssetIds)
        .filter(([ownerName, assetId]) => ownerName !== client && !existingById.has(assetId))
        .map(([, assetId]) => ({ asset_id: assetId, asset_type: 'chat_memory', injection_mode: 'summary', priority: 0, created_by: users[client].user_id }));
      await call(coreUrl, serviceId, '/v3/meta/agent-fixed-asset/set', { agent_id: users[client].agent_id, bindings: [...existingInputs, ...additions] }, users[client].user_key, serviceToken);
      const verifiedById = new Map((await listBindings(client)).map(bindingInput).map((binding) => [binding.asset_id, binding]));
      if (Object.values(ownerAssetIds).some((assetId) => !verifiedById.has(assetId)) || existingInputs.some((binding) => JSON.stringify(verifiedById.get(binding.asset_id)) !== JSON.stringify(binding))) throw new Error('invalid core response');
    }
    if ((await listBindings('outsider')).some((binding) => Object.values(ownerAssetIds).includes(binding?.asset_id))) throw new Error('invalid core response');
    sharedMemory = { owner_asset_ids: ownerAssetIds, cross_owner_binding_count: clients.length * (clients.length - 1) };
  } else {
    const source = clients[0];
    const consumers = clients.slice(1, 2);
    const excluded = clients.slice(2);
    const sourceBindings = await listBindings(source);
    const sourceMemoryBindings = sourceBindings.filter((binding) => binding?.asset_type === 'chat_memory');
    if (sourceMemoryBindings.length !== 1) throw new Error('invalid core response');
    const sourceAssetId = requireId(sourceMemoryBindings[0], 'asset_id');
    const sourceAsset = await call(coreUrl, serviceId, '/v3/meta/asset/get', { asset_id: sourceAssetId }, users[source].user_key, serviceToken);
    if (sourceAsset.asset_id !== sourceAssetId || sourceAsset.asset_type !== 'chat_memory' || sourceAsset.team_id !== teamId || sourceAsset.owner_user_id !== users[source].user_id) throw new Error('invalid core response');
    const sharedAsset = await call(coreUrl, serviceId, '/v3/meta/asset/update', { asset_id: sourceAssetId, visibility: 'team' }, users[source].user_key, serviceToken);
    if (sharedAsset.asset_id !== sourceAssetId || sharedAsset.visibility !== 'team') throw new Error('invalid core response');
    for (const consumer of consumers) {
      const existingInputs = (await listBindings(consumer)).map(bindingInput);
      const bindings = existingInputs.some((binding) => binding.asset_id === sourceAssetId) ? existingInputs : [...existingInputs, { asset_id: sourceAssetId, asset_type: 'chat_memory', injection_mode: 'summary', priority: 0, created_by: users[consumer].user_id }];
      await call(coreUrl, serviceId, '/v3/meta/agent-fixed-asset/set', { agent_id: users[consumer].agent_id, bindings }, users[consumer].user_key, serviceToken);
      let verifiedInputs;
      try { verifiedInputs = (await listBindings(consumer)).map(bindingInput); } catch { throw new Error('invalid core response'); }
      const verifiedById = new Map(verifiedInputs.map((binding) => [binding.asset_id, binding]));
      if (!verifiedById.has(sourceAssetId) || existingInputs.some((binding) => JSON.stringify(verifiedById.get(binding.asset_id)) !== JSON.stringify(binding))) throw new Error('invalid core response');
    }
    for (const client of excluded) if ((await listBindings(client)).some((binding) => binding?.asset_id === sourceAssetId)) throw new Error('invalid core response');
    sharedMemory = { asset_ids: [sourceAssetId], source, consumers, excluded };
  }

  const manifestClients = {};
  for (const client of clients) {
    const credentialFile = `credentials/${client}.user-key`;
    await secureWrite(join(outputDir, credentialFile), `${users[client].user_key}\n`);
    manifestClients[client] = { user_id: users[client].user_id, agent_id: users[client].agent_id, session_id: randomUUID(), credential_file: credentialFile, display_name: client };
  }
  let manifestOutsider;
  if (outsider) {
    const credentialFile = 'credentials/outsider.user-key';
    await secureWrite(join(outputDir, credentialFile), `${users.outsider.user_key}\n`);
    manifestOutsider = { ...outsider, user_id: users.outsider.user_id, agent_id: users.outsider.agent_id, session_id: randomUUID(), credential_file: credentialFile, display_name: 'Synthetic Outsider' };
  }
  await secureWrite(join(outputDir, 'bootstrap.private.json'), JSON.stringify({ admin_user_key: adminKey, user_keys: Object.fromEntries([...clients, ...(outsider ? ['outsider'] : [])].map((client) => [client, users[client].user_key])) }, null, 2));
  const manifest = {
    run_id: runId,
    service_id: serviceId,
    team_id: teamId,
    task_id: taskId,
    clients: manifestClients,
    ...(manifestOutsider ? { outsider: manifestOutsider } : {}),
    shared_memory: sharedMemory,
  };
  await publishManifest(join(outputDir, 'run-manifest.json'), manifest, manifestWriteFile, manifestRenameFile);
  return manifest;
}

if (isMain(import.meta)) {
  try {
    const values = parseArgs(process.argv.slice(2));
    const clientManifest = values['--client-manifest'] ? await readClientManifest(values['--client-manifest']) : undefined;
    await bootstrap({
      coreUrl: values['--core-url'],
      serviceId: values['--service-id'],
      runId: values['--run-id'],
      outputDir: values['--output-dir'],
      clients: values['--clients']?.split(','),
      clientManifest,
      activeClients: values['--active-clients'] ?? process.env.ACTIVE_CLIENTS,
    });
    process.stdout.write('{"status":"ok"}\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
