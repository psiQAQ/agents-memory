import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { renderSettings } from '../tools/render-settings.mjs';

const key = `sk-mem-${'A'.repeat(32)}`;
const tool = new URL('../tools/render-settings.mjs', import.meta.url);

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'memory-render-'));
  const template = join(directory, 'settings.template.json');
  const config = join(directory, 'config');
  const keyFile = join(directory, 'user-key');
  await writeFile(template, JSON.stringify({ env: { ANTHROPIC_BASE_URL: '__MEMORY_PROXY_BASE_URL__' } }));
  await writeFile(keyFile, `${key}\r\n`);
  return { directory, template, config, keyFile };
}

function run(args) {
  return spawnSync(process.execPath, [fileURLToPath(tool), ...args], { encoding: 'utf8' });
}

test('renderer writes fixed Docker and Windows proxy URLs without changing template', async () => {
  const f = await fixture();
  try {
    for (const [target, url] of [['docker', 'http://memory-proxy:8096/claude-code/default'], ['windows', 'http://127.0.0.1:8096/claude-code/space-a']]) {
      const result = run(['--target', target, '--template', f.template, '--config-dir', f.config, '--memory-user-key-file', f.keyFile, ...(target === 'windows' ? ['--space-id', 'space-a'] : [])]);
      assert.equal(result.status, 0);
      assert.equal(result.stdout.trim(), JSON.stringify({ status: 'ok', target }));
      assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(key));
      const output = JSON.parse(await readFile(join(f.config, 'settings.json'), 'utf8'));
      assert.equal(output.env.ANTHROPIC_BASE_URL, url);
      assert.equal(output.env.ANTHROPIC_AUTH_TOKEN, key);
    }
    assert.match(await readFile(f.template, 'utf8'), /__MEMORY_PROXY_BASE_URL__/);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test('renderer CLI creates a fresh config directory and accepts one terminal CRLF', async () => {
  const f = await fixture();
  try {
    const result = run(['--target', 'docker', '--template', f.template, '--config-dir', f.config, '--memory-user-key-file', f.keyFile]);
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(await readFile(join(f.config, 'settings.json'), 'utf8')).env.ANTHROPIC_AUTH_TOKEN, key);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test('renderer fail closes invalid target, space, template, and key without leakage', async () => {
  const f = await fixture();
  try {
    const cases = [
      ['--target', 'other'],
      ['--target', 'docker', '--space-id', '../bad'],
      ['--target', 'docker', '--space-id', 'a/b'],
      ['--target', 'docker', '--space-id', 'a..b'],
    ];
    for (const extra of cases) {
      const result = run([...extra, '--template', f.template, '--config-dir', f.config, '--memory-user-key-file', f.keyFile]);
      assert.notEqual(result.status, 0);
      assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(key));
    }
    await writeFile(f.template, JSON.stringify({ env: { ANTHROPIC_AUTH_TOKEN: 'forbidden', ANTHROPIC_BASE_URL: '__MEMORY_PROXY_BASE_URL__' } }));
    let result = run(['--target', 'docker', '--template', f.template, '--config-dir', f.config, '--memory-user-key-file', f.keyFile]);
    assert.notEqual(result.status, 0);
    await writeFile(f.template, '{}');
    result = run(['--target', 'docker', '--template', f.template, '--config-dir', f.config, '--memory-user-key-file', f.keyFile]);
    assert.notEqual(result.status, 0);
    await writeFile(f.template, JSON.stringify({ env: { ANTHROPIC_BASE_URL: '__MEMORY_PROXY_BASE_URL__' } }));
    await writeFile(f.keyFile, 'invalid\n');
    result = run(['--target', 'docker', '--template', f.template, '--config-dir', f.config, '--memory-user-key-file', f.keyFile]);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /sk-mem-/);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test('renderer removes a written temporary file when destination rename fails', async () => {
  const f = await fixture();
  try {
    await mkdir(f.config);
    await mkdir(join(f.config, 'settings.json'));
    const result = run(['--target', 'docker', '--template', f.template, '--config-dir', f.config, '--memory-user-key-file', f.keyFile]);
    assert.notEqual(result.status, 0);
    assert.deepEqual((await readdir(f.config)).filter((name) => name.startsWith('.settings.') && name.endsWith('.tmp')), []);
    assert.doesNotMatch(JSON.stringify(await readdir(join(f.config, 'settings.json'))), new RegExp(key));
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test('renderer concurrent calls use distinct same-directory temporary files', async () => {
  const f = await fixture();
  const otherKey = `sk-mem-${'B'.repeat(32)}`;
  const otherKeyFile = join(f.directory, 'other-user-key');
  try {
    await writeFile(otherKeyFile, `${otherKey}\n`);
    await Promise.all([
      renderSettings({ target: 'docker', template: f.template, configDir: f.config, keyFile: f.keyFile }),
      renderSettings({ target: 'windows', template: f.template, configDir: f.config, keyFile: otherKeyFile }),
    ]);
    const output = JSON.parse(await readFile(join(f.config, 'settings.json'), 'utf8'));
    assert.ok([key, otherKey].includes(output.env.ANTHROPIC_AUTH_TOKEN));
    assert.deepEqual((await readdir(f.config)).filter((name) => name.startsWith('.settings.') && name.endsWith('.tmp')), []);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test('renderer fail-closes template and key-file matrix without leaking dummy keys', async () => {
  const f = await fixture();
  try {
    const command = () => run(['--target', 'docker', '--template', f.template, '--config-dir', f.config, '--memory-user-key-file', f.keyFile]);
    for (const template of ['{', '{}', JSON.stringify({ env: { ANTHROPIC_BASE_URL: '__MEMORY_PROXY_BASE_URL____MEMORY_PROXY_BASE_URL__' } }), JSON.stringify({ env: { ANTHROPIC_BASE_URL: '__MEMORY_PROXY_BASE_URL__', DEEPSEEK_API_KEY: 'forbidden' } })]) {
      await writeFile(f.template, template);
      assert.notEqual(command().status, 0);
    }
    await writeFile(f.template, JSON.stringify({ env: { ANTHROPIC_BASE_URL: '__MEMORY_PROXY_BASE_URL__' } }));
    for (const content of ['', `${key}\nsecond\n`, 'sk-other', 'sk-mem-short']) {
      await writeFile(f.keyFile, content);
      const result = command();
      assert.notEqual(result.status, 0);
      assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(key));
    }
    await rm(f.keyFile);
    assert.notEqual(command().status, 0);
    await mkdir(f.keyFile);
    assert.notEqual(command().status, 0);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});
