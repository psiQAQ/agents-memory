import assert from 'node:assert/strict';
import { link, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { prepareAgent } from '../tools/prepare-agent.mjs';

const keys = {
  'agent-a': `sk-mem-${'A'.repeat(32)}`,
  'agent-b': `sk-mem-${'B'.repeat(32)}`,
  'agent-c': `sk-mem-${'C'.repeat(32)}`,
};
const owner = { uid: process.getuid?.() ?? 10001, gid: process.getgid?.() ?? 10001 };
const tool = fileURLToPath(new URL('../tools/prepare-agent.mjs', import.meta.url));

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'memory-agent-config-'));
  const stateDir = join(root, 'state', 'run');
  await mkdir(join(stateDir, 'credentials'), { recursive: true });
  await Promise.all(Object.entries(keys).map(([agent, key]) => writeFile(join(stateDir, 'credentials', `${agent}.user-key`), `${key}\n`)));
  await writeFile(join(stateDir, 'bootstrap.private.json'), JSON.stringify({ secret: keys['agent-a'] }));
  await writeFile(join(stateDir, 'run-manifest.json'), JSON.stringify({
    run_id: 'run-1',
    service_id: 'default',
    team_id: 'team-1',
    task_id: 'task-1',
    clients: Object.fromEntries(Object.keys(keys).map((agent) => [agent, {
      user_id: `user-${agent}`,
      agent_id: `id-${agent}`,
      session_id: `session-${agent}`,
      credential_file: `credentials/${agent}.user-key`,
      display_name: agent,
    }])),
  }));
  return { root, stateDir };
}

test('prepare-agent copies only the selected credential into an isolated private home', async () => {
  const f = await fixture();
  try {
    const homeA = join(f.root, 'home-a');
    const homeB = join(f.root, 'home-b');
    await Promise.all([mkdir(homeA), mkdir(homeB)]);
    await prepareAgent({ agent: 'agent-a', stateDir: f.stateDir, homeDir: homeA, spaceId: 'default', ...owner });
    await prepareAgent({ agent: 'agent-b', stateDir: f.stateDir, homeDir: homeB, spaceId: 'default', ...owner });
    const bundleA = JSON.parse(await readFile(join(homeA, '.memory', 'agent-bundle.json'), 'utf8'));
    const bundleB = JSON.parse(await readFile(join(homeB, '.memory', 'agent-bundle.json'), 'utf8'));
    assert.equal(bundleA.memory_user_key, keys['agent-a']);
    assert.equal(bundleB.memory_user_key, keys['agent-b']);
    assert.deepEqual(bundleA.identity, {
      service_id: 'default', team_id: 'team-1', user_id: 'user-agent-a', agent_id: 'id-agent-a', task_id: 'task-1', session_id: 'session-agent-a', display_name: 'agent-a',
    });
    assert.deepEqual(bundleB.identity, {
      service_id: 'default', team_id: 'team-1', user_id: 'user-agent-b', agent_id: 'id-agent-b', task_id: 'task-1', session_id: 'session-agent-b', display_name: 'agent-b',
    });
    assert.doesNotMatch(JSON.stringify(bundleA), /agent-b/);
    assert.doesNotMatch(JSON.stringify(bundleA), new RegExp(keys['agent-b']));
    assert.deepEqual(await readdir(join(homeA, '.memory')), ['agent-bundle.json']);
    if (process.platform !== 'win32') {
      const homeMetadata = await stat(homeA);
      const bundleMetadata = await stat(join(homeA, '.memory', 'agent-bundle.json'));
      assert.equal(homeMetadata.mode & 0o777, 0o700);
      assert.equal(bundleMetadata.mode & 0o777, 0o600);
      assert.equal(bundleMetadata.uid, owner.uid);
      assert.equal(bundleMetadata.gid, owner.gid);
    }
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('prepare-agent rejects invalid agent, key, and path inputs without leaving temporary credentials', async () => {
  const f = await fixture();
  try {
    const home = join(f.root, 'home');
    await mkdir(home);
    await assert.rejects(prepareAgent({ agent: '../agent-a', stateDir: f.stateDir, homeDir: home, spaceId: 'default', ...owner }), /invalid agent/);
    await assert.rejects(prepareAgent({ agent: 'agent-a', stateDir: 'relative', homeDir: home, spaceId: 'default', ...owner }), /invalid path/);
    await writeFile(join(f.stateDir, 'credentials', 'agent-a.user-key'), `${keys['agent-a']}\nsecond-line\n`);
    await assert.rejects(prepareAgent({ agent: 'agent-a', stateDir: f.stateDir, homeDir: home, spaceId: 'default', ...owner }), /invalid credential/);
    const entries = await readdir(f.root, { recursive: true });
    assert.equal(entries.some((entry) => entry.endsWith('.tmp')), false);
    assert.equal(entries.some((entry) => entry.endsWith('agent-bundle.json') && entry.includes('home')), false);
    const cli = spawnSync(process.execPath, [tool, '--agent', 'agent-a', '--state-dir', f.stateDir, '--home-dir', home, '--space-id', 'default'], { encoding: 'utf8' });
    assert.notEqual(cli.status, 0);
    assert.doesNotMatch(`${cli.stdout}${cli.stderr}`, new RegExp(keys['agent-a']));
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('prepare-agent rejects a persistent-home junction escape and never writes the key outside the private volume', async () => {
  const f = await fixture();
  const outside = await mkdtemp(join(tmpdir(), 'memory-agent-escape-'));
  try {
    const home = join(f.root, 'home');
    await mkdir(home);
    await symlink(outside, join(home, '.memory'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(prepareAgent({ agent: 'agent-a', stateDir: f.stateDir, homeDir: home, spaceId: 'default', ...owner }), /unsafe path/);
    await assert.rejects(readFile(join(outside, 'agent-bundle.json'), 'utf8'), { code: 'ENOENT' });

    await unlink(join(home, '.memory'));
    const source = join(f.stateDir, 'credentials', 'agent-a.user-key');
    const linkedSource = join(f.root, 'linked-source');
    await writeFile(linkedSource, `${keys['agent-a']}\n`);
    await unlink(source);
    await link(linkedSource, source);
    await assert.rejects(prepareAgent({ agent: 'agent-a', stateDir: f.stateDir, homeDir: home, spaceId: 'default', ...owner }), /unsafe credential/);
    await assert.rejects(readFile(join(home, '.memory', 'agent-bundle.json'), 'utf8'), { code: 'ENOENT' });
  } finally {
    await rm(f.root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('prepare-agent rejects untrusted manifest identity and service mismatches before writing private files', async () => {
  const f = await fixture();
  try {
    const home = join(f.root, 'home');
    await mkdir(home);
    await assert.rejects(prepareAgent({ agent: 'agent-a', stateDir: f.stateDir, homeDir: home, spaceId: 'other', ...owner }), /invalid identity/);
    for (const [field, invalid] of [['session_id', ''], ['user_id', 'bad:value'], ['display_name', 'bad\r\nvalue'], ['display_name', 'x'.repeat(129)]]) {
      const manifest = JSON.parse(await readFile(join(f.stateDir, 'run-manifest.json'), 'utf8'));
      manifest.clients['agent-a'][field] = invalid;
      await writeFile(join(f.stateDir, 'run-manifest.json'), JSON.stringify(manifest));
      await assert.rejects(prepareAgent({ agent: 'agent-a', stateDir: f.stateDir, homeDir: home, spaceId: 'default', ...owner }), /invalid identity|invalid manifest/);
    }
    assert.deepEqual(await readdir(home), []);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('prepare-agent rejects manifest and bundle-file link attacks', async () => {
  const f = await fixture();
  const outside = await mkdtemp(join(tmpdir(), 'memory-identity-escape-'));
  try {
    const home = join(f.root, 'home');
    await mkdir(join(home, '.memory'), { recursive: true });
    await writeFile(join(outside, 'agent-bundle.json'), 'outside-sentinel');
    await link(join(outside, 'agent-bundle.json'), join(home, '.memory', 'agent-bundle.json'));
    await assert.rejects(prepareAgent({ agent: 'agent-a', stateDir: f.stateDir, homeDir: home, spaceId: 'default', ...owner }), /unsafe path/);
    assert.equal(await readFile(join(outside, 'agent-bundle.json'), 'utf8'), 'outside-sentinel');

    await unlink(join(home, '.memory', 'agent-bundle.json'));
    const manifest = join(f.stateDir, 'run-manifest.json');
    const linked = join(f.root, 'linked-manifest');
    await writeFile(linked, await readFile(manifest, 'utf8'));
    await unlink(manifest);
    await link(linked, manifest);
    await assert.rejects(prepareAgent({ agent: 'agent-a', stateDir: f.stateDir, homeDir: home, spaceId: 'default', ...owner }), /unsafe manifest/);
  } finally {
    await rm(f.root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('prepare-agent keeps the old bundle until the single rename commit and preserves it on rename failure', async () => {
  const f = await fixture();
  try {
    const home = join(f.root, 'home');
    await mkdir(home);
    await prepareAgent({ agent: 'agent-a', stateDir: f.stateDir, homeDir: home, spaceId: 'default', ...owner });
    const destination = join(home, '.memory', 'agent-bundle.json');
    const oldBundle = await readFile(destination, 'utf8');
    const newKey = `sk-mem-${'D'.repeat(32)}`;
    await writeFile(join(f.stateDir, 'credentials', 'agent-a.user-key'), `${newKey}\n`);
    const manifest = JSON.parse(await readFile(join(f.stateDir, 'run-manifest.json'), 'utf8'));
    manifest.clients['agent-a'].session_id = 'session-agent-a-new';
    await writeFile(join(f.stateDir, 'run-manifest.json'), JSON.stringify(manifest));
    let beforeCommit;
    const inspectingRename = async (source, target) => {
      beforeCommit = await readFile(target, 'utf8');
      await rename(source, target);
    };
    await prepareAgent({ agent: 'agent-a', stateDir: f.stateDir, homeDir: home, spaceId: 'default', renameFile: inspectingRename, ...owner });
    assert.equal(beforeCommit, oldBundle);
    const committedBundle = await readFile(destination, 'utf8');
    assert.equal(JSON.parse(committedBundle).memory_user_key, newKey);
    assert.equal(JSON.parse(committedBundle).identity.session_id, 'session-agent-a-new');

    await writeFile(join(f.stateDir, 'credentials', 'agent-a.user-key'), `sk-mem-${'E'.repeat(32)}\n`);
    await assert.rejects(prepareAgent({ agent: 'agent-a', stateDir: f.stateDir, homeDir: home, spaceId: 'default', renameFile: async () => { throw new Error('injected rename failure'); }, ...owner }), /cannot prepare agent bundle/);
    assert.equal(await readFile(destination, 'utf8'), committedBundle);
    assert.deepEqual(await readdir(join(home, '.memory')), ['agent-bundle.json']);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
