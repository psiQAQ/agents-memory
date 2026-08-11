import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

const key = `sk-mem-${'L'.repeat(32)}`;
const otherKey = `sk-mem-${'M'.repeat(32)}`;
const identity = { service_id: 'default', team_id: 'team-launch', user_id: 'user-launch', agent_id: 'agent-launch', task_id: 'task-launch', session_id: 'session-launch', display_name: 'Launch Client' };

test('launcher renders the selected native config and replaces inherited Memory identity before invoking the fixed CLI', async () => {
  let launchClient;
  try { ({ launchClient } = await import('../tools/launch-client.mjs')); } catch {}
  assert.equal(typeof launchClient, 'function', 'Task 4 client launcher must exist');
  const homeDir = await mkdtemp(join(tmpdir(), 'memory-client-launch-'));
  await mkdir(join(homeDir, '.memory'));
  const bundleFile = join(homeDir, '.memory', 'agent-bundle.json');
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

test('launcher rejects a linked or out-of-home bundle before rendering or spawning', async () => {
  const { launchClient } = await import('../tools/launch-client.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'memory-client-bundle-boundary-'));
  const outside = join(directory, 'outside');
  await mkdir(outside);
  const outsideBundle = join(outside, 'agent-bundle.json');
  await writeFile(outsideBundle, JSON.stringify({ memory_user_key: key, identity }));
  let accepted = 0;
  let spawnCount = 0;
  const errors = [];
  try {
    const linkedHome = join(directory, 'linked-home');
    await mkdir(linkedHome);
    await symlink(outside, join(linkedHome, '.memory'), process.platform === 'win32' ? 'junction' : 'dir');
    for (const [homeDir, bundleFile] of [
      [linkedHome, join(linkedHome, '.memory', 'agent-bundle.json')],
      [join(directory, 'plain-home'), outsideBundle],
    ]) {
      await mkdir(homeDir, { recursive: true });
      const error = await launchClient({
        client: 'opencode', homeDir, bundleFile, spaceId: 'default', args: ['--version'],
        spawnProcess: () => { spawnCount += 1; const child = new EventEmitter(); process.nextTick(() => child.emit('exit', 0, null)); return child; },
      }).then(() => { accepted += 1; return undefined; }, (failure) => failure);
      if (error) errors.push(error.message);
    }
    assert.equal(accepted, 0);
    assert.equal(spawnCount, 0);
    assert.doesNotMatch(errors.join('\n'), new RegExp(key));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('launcher headless capture is bounded, scans prompt and private identity in memory, and never inherits stdio', async (context) => {
  const { launchClient } = await import('../tools/launch-client.mjs');
  const cases = [
    { name: 'safe', chunks: [['fixed output'], []], status: 0 },
    { name: 'split-prompt', chunks: [['RAW_', 'PROMPT'], []], error: /client process failed/ },
    { name: 'identity', chunks: [[], [identity.agent_id]], error: /client process failed/ },
    { name: 'overflow', chunks: [['x'.repeat(65)], []], error: /client process failed/ },
  ];
  for (const entry of cases) await context.test(entry.name, async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'memory-client-capture-'));
    await mkdir(join(homeDir, '.memory'));
    const bundleFile = join(homeDir, '.memory', 'agent-bundle.json');
    await writeFile(bundleFile, JSON.stringify({ memory_user_key: key, identity }));
    let invocation;
    try {
      const spawnProcess = (command, args, options) => {
        const child = new EventEmitter();
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        invocation = { command, args, options };
        process.nextTick(() => {
          for (const chunk of entry.chunks[0]) child.stdout.write(chunk);
          for (const chunk of entry.chunks[1]) child.stderr.write(chunk);
          child.stdout.end();
          child.stderr.end();
          child.emit('close', 0, null);
        });
        return child;
      };
      const promise = launchClient({
        client: 'opencode', homeDir, bundleFile, spaceId: 'default', args: ['run', 'RAW_PROMPT'], spawnProcess,
        capture: { maxBytes: 64, sensitiveValues: ['RAW_PROMPT'] },
      });
      if (entry.error) await assert.rejects(promise, entry.error);
      else assert.equal(await promise, entry.status);
      assert.deepEqual(invocation.options.stdio, ['ignore', 'pipe', 'pipe']);
    } finally { await rm(homeDir, { recursive: true, force: true }); }
  });
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
