import assert from 'node:assert/strict';
import { link, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { prepareAgent } from '../tools/prepare-agent.mjs';

const keys = {
  'agent-a': `sk-mem-${'A'.repeat(32)}`,
  'agent-b': `sk-mem-${'B'.repeat(32)}`,
};
const owner = { uid: process.getuid?.() ?? 10001, gid: process.getgid?.() ?? 10001 };
const tool = fileURLToPath(new URL('../tools/prepare-agent.mjs', import.meta.url));

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'memory-agent-config-'));
  const stateDir = join(root, 'state', 'run');
  await mkdir(join(stateDir, 'credentials'), { recursive: true });
  await Promise.all(Object.entries(keys).map(([agent, key]) => writeFile(join(stateDir, 'credentials', `${agent}.user-key`), `${key}\n`)));
  await writeFile(join(stateDir, 'bootstrap.private.json'), JSON.stringify({ secret: keys['agent-a'] }));
  return { root, stateDir };
}

test('prepare-agent copies only the selected credential into an isolated private home', async () => {
  const f = await fixture();
  try {
    const homeA = join(f.root, 'home-a');
    const homeB = join(f.root, 'home-b');
    await Promise.all([mkdir(homeA), mkdir(homeB)]);
    await prepareAgent({ agent: 'agent-a', stateDir: f.stateDir, homeDir: homeA, ...owner });
    await prepareAgent({ agent: 'agent-b', stateDir: f.stateDir, homeDir: homeB, ...owner });
    assert.equal((await readFile(join(homeA, '.memory', 'user-key'), 'utf8')).trim(), keys['agent-a']);
    assert.equal((await readFile(join(homeB, '.memory', 'user-key'), 'utf8')).trim(), keys['agent-b']);
    assert.doesNotMatch((await readFile(join(homeA, '.memory', 'user-key'), 'utf8')), new RegExp(keys['agent-b']));
    assert.deepEqual((await readdir(join(homeA, '.memory'))).sort(), ['user-key']);
    if (process.platform !== 'win32') {
      const homeMetadata = await stat(homeA);
      const keyMetadata = await stat(join(homeA, '.memory', 'user-key'));
      assert.equal(homeMetadata.mode & 0o777, 0o700);
      assert.equal(keyMetadata.mode & 0o777, 0o600);
      assert.equal(keyMetadata.uid, owner.uid);
      assert.equal(keyMetadata.gid, owner.gid);
    }
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('prepare-agent rejects invalid agent, key, and path inputs without leaving temporary credentials', async () => {
  const f = await fixture();
  try {
    const home = join(f.root, 'home');
    await mkdir(home);
    await assert.rejects(prepareAgent({ agent: '../agent-a', stateDir: f.stateDir, homeDir: home, ...owner }), /invalid agent/);
    await assert.rejects(prepareAgent({ agent: 'agent-a', stateDir: 'relative', homeDir: home, ...owner }), /invalid path/);
    await writeFile(join(f.stateDir, 'credentials', 'agent-a.user-key'), `${keys['agent-a']}\nsecond-line\n`);
    await assert.rejects(prepareAgent({ agent: 'agent-a', stateDir: f.stateDir, homeDir: home, ...owner }), /invalid credential/);
    const entries = await readdir(f.root, { recursive: true });
    assert.equal(entries.some((entry) => entry.endsWith('.tmp')), false);
    assert.equal(entries.some((entry) => entry.endsWith('user-key') && entry.includes('home')), false);
    const cli = spawnSync(process.execPath, [tool, '--agent', 'agent-a', '--state-dir', f.stateDir, '--home-dir', home], { encoding: 'utf8' });
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
    await assert.rejects(prepareAgent({ agent: 'agent-a', stateDir: f.stateDir, homeDir: home, ...owner }), /unsafe path/);
    await assert.rejects(readFile(join(outside, 'user-key'), 'utf8'), { code: 'ENOENT' });

    await unlink(join(home, '.memory'));
    const source = join(f.stateDir, 'credentials', 'agent-a.user-key');
    const linkedSource = join(f.root, 'linked-source');
    await writeFile(linkedSource, `${keys['agent-a']}\n`);
    await unlink(source);
    await link(linkedSource, source);
    await assert.rejects(prepareAgent({ agent: 'agent-a', stateDir: f.stateDir, homeDir: home, ...owner }), /unsafe credential/);
    await assert.rejects(readFile(join(home, '.memory', 'user-key'), 'utf8'), { code: 'ENOENT' });
  } finally {
    await rm(f.root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
