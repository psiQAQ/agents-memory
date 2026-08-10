import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const key = `sk-mem-${'L'.repeat(32)}`;
const otherKey = `sk-mem-${'M'.repeat(32)}`;
const identity = { service_id: 'default', team_id: 'team-launch', user_id: 'user-launch', agent_id: 'agent-launch', task_id: 'task-launch', session_id: 'session-launch', display_name: 'Launch Client' };

test('launcher renders the selected native config and replaces inherited Memory identity before invoking the fixed CLI', async () => {
  let launchClient;
  try { ({ launchClient } = await import('../tools/launch-client.mjs')); } catch {}
  assert.equal(typeof launchClient, 'function', 'Task 4 client launcher must exist');
  const homeDir = await mkdtemp(join(tmpdir(), 'memory-client-launch-'));
  const bundleFile = join(homeDir, 'agent-bundle.json');
  await writeFile(bundleFile, JSON.stringify({ memory_user_key: key, identity }));
  let invocation;
  const spawnProcess = (command, args, options) => {
    invocation = { command, args, options };
    const child = new EventEmitter();
    process.nextTick(() => child.emit('exit', 0, null));
    return child;
  };
  try {
    const status = await launchClient({ client: 'opencode', homeDir, bundleFile, spaceId: 'default', args: ['--version'], spawnProcess, parentEnvironment: { PATH: process.env.PATH, MEMORY_USER_KEY: otherKey, MEMORY_TEAM_ID: 'other-team' } });
    assert.equal(status, 0);
    assert.equal(invocation.command, 'opencode');
    assert.deepEqual(invocation.args, ['--version']);
    assert.equal(invocation.options.stdio, 'inherit');
    assert.equal(invocation.options.env.MEMORY_USER_KEY, key);
    assert.equal(invocation.options.env.MEMORY_TEAM_ID, 'team-launch');
    assert.doesNotMatch(JSON.stringify(invocation.options.env), new RegExp(otherKey));
    assert.equal(JSON.parse(await readFile(join(homeDir, '.config', 'opencode', 'opencode.json'), 'utf8')).provider['memory-anthropic'].options.baseURL, 'http://memory-proxy:8096/opencode/default/v1');
  } finally { await rm(homeDir, { recursive: true, force: true }); }
});

test('launcher rejects arbitrary clients before reading or writing private state', async () => {
  let launchClient;
  try { ({ launchClient } = await import('../tools/launch-client.mjs')); } catch {}
  assert.equal(typeof launchClient, 'function', 'Task 4 client launcher must exist');
  const homeDir = await mkdtemp(join(tmpdir(), 'memory-client-launch-reject-'));
  try {
    await assert.rejects(launchClient({ client: 'codex', homeDir, bundleFile: join(homeDir, 'missing'), spaceId: 'default', args: [], spawnProcess: () => { throw new Error('must not spawn'); } }), /invalid client/);
    assert.deepEqual(await readFile(join(homeDir, 'missing'), 'utf8').catch((error) => error.code), 'ENOENT');
  } finally { await rm(homeDir, { recursive: true, force: true }); }
});
