import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fakeCore } from './helpers.mjs';

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
    assert.equal(core.requests.find((request) => request.path.endsWith('/team/create')).body.owner_user_id, 'usr-agent-a');
    assert.equal(core.requests.find((request) => request.path.endsWith('/agent/create') && request.body.owner_user_id === 'usr-agent-b').userKey, core.keys['agent-b']);
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'run-1', 'bootstrap.private.json'), 'utf8')).user_keys['agent-c'], core.keys['agent-c']);
  } finally { await core.close(); await rm(directory, { recursive: true, force: true }); }
});

test('bootstrap fails closed for missing init-admin ID, invalid admin key, duplicate clients, and partial output', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'memory-bootstrap-fail-'));
  try {
    for (const initAdmin of [{ user_key: `sk-mem-${'A'.repeat(32)}` }, { user_id: 'usr-admin', user_key: 'invalid' }]) {
      const { bootstrap } = await import('../tools/bootstrap.mjs');
      const core = await fakeCore({ initAdmin });
      try { await assert.rejects(bootstrap({ coreUrl: core.baseUrl, serviceId: 'default', runId: 'run-1', outputDir: join(directory, `case-${Math.random()}`), clients: ['agent-a'] })); }
      finally { await core.close(); }
    }
    const { bootstrap } = await import('../tools/bootstrap.mjs');
    const core = await fakeCore();
    const output = join(directory, 'partial');
    await mkdir(output);
    await assert.rejects(bootstrap({ coreUrl: core.baseUrl, serviceId: 'default', runId: 'run-1', outputDir: output, clients: ['agent-a'] }));
    await assert.rejects(bootstrap({ coreUrl: core.baseUrl, serviceId: 'default', runId: 'run-1', outputDir: join(directory, 'duplicate'), clients: ['agent-a', 'agent-a'] }));
    await core.close();
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
        await assert.rejects(bootstrap({ coreUrl: core.baseUrl, serviceId: 'default', runId: 'run-1', outputDir: output, clients: ['agent-a'], timeoutMs: failure.timeoutMs ?? 100 }));
        assert.doesNotMatch(JSON.stringify(await readdir(output)), /sk-mem-/);
      } finally { await core.close(); }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
