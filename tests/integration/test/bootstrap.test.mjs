import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { fakeCore } from './helpers.mjs';

const bootstrapTool = fileURLToPath(new URL('../tools/bootstrap.mjs', import.meta.url));
const clientManifestFile = fileURLToPath(new URL('../clients/manifest.json', import.meta.url));

const task4Clients = [
  { id: 'claude', source: 'claude-code', display_name: 'Claude Code' },
  { id: 'opencode', source: 'opencode', display_name: 'OpenCode' },
  { id: 'pi', source: 'pi', display_name: 'Pi' },
];

test('bootstrap selects the three allowlisted clients and creates three-owner sharing plus an isolated outsider', async () => {
  const { bootstrap } = await import('../tools/bootstrap.mjs');
  const core = await fakeCore({ clientNames: task4Clients.map(({ id }) => id), outsiderName: 'outsider' });
  const directory = await mkdtemp(join(tmpdir(), 'memory-bootstrap-task4-'));
  try {
    const manifest = await bootstrap({
      coreUrl: core.baseUrl,
      serviceId: 'default',
      runId: 'run-task4',
      outputDir: join(directory, 'run'),
      clientManifest: task4Clients,
      activeClients: 'claude,opencode,pi',
    });
    assert.deepEqual(Object.keys(manifest.clients), ['claude', 'opencode', 'pi']);
    assert.equal(manifest.outsider.team_id, 'team-outsider-runtime');
    assert.equal(manifest.outsider.task_id, 'task-outsider-runtime');
    assert.notEqual(manifest.outsider.team_id, manifest.team_id);
    assert.notEqual(manifest.outsider.task_id, manifest.task_id);
    assert.doesNotMatch(JSON.stringify(manifest), /sk-mem-|_key/);

    const ownerAssets = Object.fromEntries(task4Clients.map(({ id }) => [id, `chat_memory-team-runtime-agt-usr-${id}`]));
    assert.deepEqual(manifest.shared_memory.owner_asset_ids, ownerAssets);
    assert.equal(manifest.shared_memory.cross_owner_binding_count, 6);
    for (const { id } of task4Clients) {
      assert.equal(core.assets[ownerAssets[id]].visibility, 'team');
      assert.deepEqual(core.bindings[id].map(({ asset_id }) => asset_id).sort(), Object.values(ownerAssets).sort());
    }
    assert.deepEqual(core.bindings.outsider.map(({ asset_id }) => asset_id), ['chat_memory-team-outsider-runtime-agt-usr-outsider']);
    assert.equal(core.requests.filter(({ path }) => path.endsWith('/agent-fixed-asset/set')).length, 3);
    assert.equal(core.requests.filter(({ path }) => path.endsWith('/asset/update')).length, 3);

    await assert.rejects(bootstrap({ coreUrl: core.baseUrl, serviceId: 'default', runId: 'dup', outputDir: join(directory, 'dup'), clientManifest: task4Clients, activeClients: 'claude,claude,pi' }), /invalid active clients/);
    await assert.rejects(bootstrap({ coreUrl: core.baseUrl, serviceId: 'default', runId: 'unknown', outputDir: join(directory, 'unknown'), clientManifest: task4Clients, activeClients: 'claude,opencode,codex' }), /invalid active clients/);
    await assert.rejects(bootstrap({ coreUrl: core.baseUrl, serviceId: 'default', runId: 'partial', outputDir: join(directory, 'partial'), clientManifest: task4Clients, activeClients: 'claude,opencode' }), /invalid active clients/);
  } finally { await core.close(); await rm(directory, { recursive: true, force: true }); }
});

test('bootstrap CLI reads the tracked manifest and ACTIVE_CLIENTS without accepting an arbitrary client list', async () => {
  const core = await fakeCore({ clientNames: task4Clients.map(({ id }) => id), outsiderName: 'outsider' });
  const directory = await mkdtemp(join(tmpdir(), 'memory-bootstrap-task4-cli-'));
  const outputDir = join(directory, 'run');
  try {
    const child = spawn(process.execPath, [bootstrapTool, '--core-url', core.baseUrl, '--service-id', 'default', '--run-id', 'run-task4-cli', '--output-dir', outputDir, '--client-manifest', clientManifestFile, '--active-clients', 'claude,opencode,pi'], { env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    const status = await new Promise((resolve) => child.on('close', resolve));
    assert.equal(status, 0, stderr);
    assert.equal(stdout.trim(), '{"status":"ok"}');
    assert.deepEqual(Object.keys(JSON.parse(await readFile(join(outputDir, 'run-manifest.json'), 'utf8')).clients), ['claude', 'opencode', 'pi']);
  } finally { await core.close(); await rm(directory, { recursive: true, force: true }); }
});

test('bootstrap captures Core IDs, uses owner keys, and writes only sanitized manifest data', async () => {
  const { bootstrap } = await import('../tools/bootstrap.mjs');
  const core = await fakeCore();
  const directory = await mkdtemp(join(tmpdir(), 'memory-bootstrap-'));
  try {
    await bootstrap({ coreUrl: core.baseUrl, serviceId: 'default', runId: 'run-1', outputDir: join(directory, 'run-1'), clients: ['agent-a', 'agent-b', 'agent-c'] });
    const manifest = JSON.parse(await readFile(join(directory, 'run-1', 'run-manifest.json'), 'utf8'));
    assert.equal(manifest.team_id, 'team-runtime');
    assert.equal(manifest.task_id, 'task-runtime');
    assert.equal(manifest.clients['agent-a'].agent_id, 'agt-usr-agent-a');
    assert.match(manifest.clients['agent-a'].session_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.notEqual(manifest.clients['agent-a'].session_id, manifest.clients['agent-b'].session_id);
    assert.doesNotMatch(JSON.stringify(manifest), /sk-mem-|_key/);
    assert.deepEqual(manifest.shared_memory, {
      asset_ids: ['chat_memory-team-runtime-agt-usr-agent-a'],
      source: 'agent-a',
      consumers: ['agent-b'],
      excluded: ['agent-c'],
    });
    assert.equal(core.requests.find((request) => request.path.endsWith('/team/create')).body.owner_user_id, 'usr-agent-a');
    assert.equal(core.requests.find((request) => request.path.endsWith('/agent/create') && request.body.owner_user_id === 'usr-agent-b').userKey, core.keys['agent-b']);
    const assetUpdate = core.requests.find((request) => request.path.endsWith('/asset/update'));
    assert.deepEqual(assetUpdate.body, { asset_id: 'chat_memory-team-runtime-agt-usr-agent-a', visibility: 'team' });
    assert.equal(assetUpdate.userKey, core.keys['agent-a']);
    const bindB = core.requests.find((request) => request.path.endsWith('/agent-fixed-asset/set'));
    assert.equal(bindB.userKey, core.keys['agent-b']);
    assert.deepEqual(bindB.body.bindings.map((binding) => binding.asset_id).sort(), [
      'chat_memory-team-runtime-agt-usr-agent-a',
      'chat_memory-team-runtime-agt-usr-agent-b',
    ]);
    assert.deepEqual(core.bindings['agent-b'].map((binding) => binding.asset_id).sort(), bindB.body.bindings.map((binding) => binding.asset_id).sort());
    assert.deepEqual(core.bindings['agent-c'].map((binding) => binding.asset_id), ['chat_memory-team-runtime-agt-usr-agent-c']);
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'run-1', 'bootstrap.private.json'), 'utf8')).user_keys['agent-c'], core.keys['agent-c']);
  } finally { await core.close(); await rm(directory, { recursive: true, force: true }); }
});

test('bootstrap sends the gateway bearer and correct caller key for every asset operation', async () => {
  const { bootstrap } = await import('../tools/bootstrap.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'memory-bootstrap-auth-'));
  const gatewayToken = 'bootstrap-gateway-token';
  const tokenFile = join(directory, 'gateway.token');
  await writeFile(tokenFile, `${gatewayToken}\n`);
  const previous = process.env.MEMORY_CORE_SERVICE_TOKEN_FILE;
  process.env.MEMORY_CORE_SERVICE_TOKEN_FILE = tokenFile;
  const core = await fakeCore({ gatewayToken });
  try {
    await bootstrap({ coreUrl: core.baseUrl, serviceId: 'default', runId: 'run-auth', outputDir: join(directory, 'run'), clients: ['agent-a', 'agent-b', 'agent-c'] });
    assert.ok(core.requests.length > 10);
    assert.ok(core.requests.every((request) => request.authorization === `Bearer ${gatewayToken}` && request.serviceId === 'default'));
    for (const suffix of ['/asset/get', '/asset/update', '/agent-fixed-asset/set']) assert.ok(core.requests.some((request) => request.path.endsWith(suffix)), `missing ${suffix}`);
    const expectedByAgent = new Map([
      ['agt-usr-agent-a', core.keys['agent-a']],
      ['agt-usr-agent-b', core.keys['agent-b']],
      ['agt-usr-agent-c', core.keys['agent-c']],
    ]);
    const bindingRequests = core.requests.filter((entry) => entry.path.endsWith('/agent-fixed-asset/list') || entry.path.endsWith('/agent-fixed-asset/set'));
    assert.ok(bindingRequests.length >= 5);
    for (const request of bindingRequests) {
      assert.equal(request.userKey, expectedByAgent.get(request.body.agent_id));
    }
  } finally {
    if (previous === undefined) delete process.env.MEMORY_CORE_SERVICE_TOKEN_FILE;
    else process.env.MEMORY_CORE_SERVICE_TOKEN_FILE = previous;
    await core.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('bootstrap asset failure does not publish a run manifest', async () => {
  const { bootstrap } = await import('../tools/bootstrap.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'memory-bootstrap-asset-fail-'));
  const output = join(directory, 'run');
  const core = await fakeCore({ failure: { path: '/asset/update', status: 500 } });
  try {
    await assert.rejects(bootstrap({ coreUrl: core.baseUrl, serviceId: 'default', runId: 'run-asset-fail', outputDir: output, clients: ['agent-a', 'agent-b', 'agent-c'] }), /invalid core response/);
    await assert.rejects(readFile(join(output, 'run-manifest.json'), 'utf8'), { code: 'ENOENT' });
  } finally { await core.close(); await rm(directory, { recursive: true, force: true }); }
});

test('bootstrap fails closed when Core changes or drops an existing B binding field', async () => {
  const { bootstrap } = await import('../tools/bootstrap.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'memory-bootstrap-binding-mutation-'));
  try {
    for (const [index, bindingMutation] of [{ field: 'priority', value: 99 }, { field: 'created_by', remove: true }].entries()) {
      const core = await fakeCore({ bindingMutation });
      const output = join(directory, `case-${index}`);
      try {
        await assert.rejects(bootstrap({ coreUrl: core.baseUrl, serviceId: 'default', runId: `run-binding-${index}`, outputDir: output, clients: ['agent-a', 'agent-b', 'agent-c'] }), /invalid core response/);
        await assert.rejects(readFile(join(output, 'run-manifest.json'), 'utf8'), { code: 'ENOENT' });
      } finally { await core.close(); }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('bootstrap publishes the run manifest atomically and removes a failed temporary publish', async () => {
  const { bootstrap } = await import('../tools/bootstrap.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'memory-bootstrap-publish-fail-'));
  try {
    for (const [name, failure] of [
      ['write', { manifestWriteFile: async () => { throw new Error('injected write failure'); } }],
      ['rename', { manifestRenameFile: async () => { throw new Error('injected rename failure'); } }],
    ]) {
      const core = await fakeCore();
      const output = join(directory, name);
      try {
        await assert.rejects(bootstrap({ coreUrl: core.baseUrl, serviceId: 'default', runId: `run-${name}-fail`, outputDir: output, clients: ['agent-a', 'agent-b', 'agent-c'], ...failure }), /cannot publish run manifest/);
        await assert.rejects(readFile(join(output, 'run-manifest.json'), 'utf8'), { code: 'ENOENT' });
        assert.equal((await readdir(output)).some((entry) => entry.startsWith('.run-manifest.json.')), false);
      } finally { await core.close(); }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('bootstrap fails closed for missing init-admin ID, invalid admin key, duplicate clients, and partial output', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'memory-bootstrap-fail-'));
  try {
    for (const initAdmin of [{ user_key: `sk-mem-${'A'.repeat(32)}` }, { user_id: 'usr-admin', user_key: 'invalid' }]) {
      const { bootstrap } = await import('../tools/bootstrap.mjs');
      const core = await fakeCore({ initAdmin });
      try { await assert.rejects(bootstrap({ coreUrl: core.baseUrl, serviceId: 'default', runId: 'run-1', outputDir: join(directory, `case-${Math.random()}`), clients: ['agent-a', 'agent-b', 'agent-c'] })); }
      finally { await core.close(); }
    }
    const { bootstrap } = await import('../tools/bootstrap.mjs');
    const core = await fakeCore();
    try {
      const output = join(directory, 'partial');
      await mkdir(output);
      await assert.rejects(bootstrap({ coreUrl: core.baseUrl, serviceId: 'default', runId: 'run-1', outputDir: output, clients: ['agent-a', 'agent-b', 'agent-c'] }));
      await assert.rejects(bootstrap({ coreUrl: core.baseUrl, serviceId: 'default', runId: 'run-1', outputDir: join(directory, 'duplicate'), clients: ['agent-a', 'agent-a'] }));
      await assert.rejects(bootstrap({ coreUrl: core.baseUrl, serviceId: 'default', runId: 'run-1', outputDir: join(directory, 'missing-isolation-fixture'), clients: ['agent-a', 'agent-b'] }));
    } finally { await core.close(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('bootstrap rejects deterministic Core HTTP, envelope, data, ID, and timeout failures without key leakage', async () => {
  const { bootstrap } = await import('../tools/bootstrap.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'memory-bootstrap-matrix-'));
  try {
    const cases = [
      { path: '/init-admin', status: 400 }, { path: '/init-admin', status: 500 },
      { path: '/init-admin', envelope: { code: 1, data: {} } }, { path: '/init-admin', envelope: { code: 0, data: null } },
      { path: '/init-admin', envelope: { code: 0, data: { user_id: 'usr-admin' } } }, { path: '/init-admin', delayMs: 50, timeoutMs: 10 },
    ];
    for (const [index, failure] of cases.entries()) {
      const core = await fakeCore({ failure });
      const output = join(directory, `case-${index}`);
      try {
        await assert.rejects(bootstrap({ coreUrl: core.baseUrl, serviceId: 'default', runId: 'run-1', outputDir: output, clients: ['agent-a', 'agent-b', 'agent-c'], timeoutMs: failure.timeoutMs ?? 100 }));
        assert.doesNotMatch(JSON.stringify(await readdir(output)), /sk-mem-/);
      } finally { await core.close(); }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
