import assert from 'node:assert/strict';
import { link, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { renderSettings } from '../tools/render-settings.mjs';

const key = `sk-mem-${'A'.repeat(32)}`;
const tool = new URL('../tools/render-settings.mjs', import.meta.url);
const baseIdentity = { service_id: 'default', team_id: 'team-a', user_id: 'user-a', agent_id: 'agent-a', task_id: 'task-a', session_id: 'session-a', display_name: 'Agent A' };

function bundle(memoryUserKey = key, identity = baseIdentity) {
  return { memory_user_key: memoryUserKey, identity };
}

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'memory-render-'));
  const template = join(directory, 'settings.template.json');
  const config = join(directory, 'config');
  const bundleFile = join(directory, 'agent-bundle.json');
  await writeFile(template, JSON.stringify({ env: { ANTHROPIC_BASE_URL: '__MEMORY_PROXY_BASE_URL__' } }));
  await writeFile(bundleFile, `${JSON.stringify(bundle())}\r\n`);
  return { directory, template, config, bundleFile };
}

function run(args) {
  return spawnSync(process.execPath, [fileURLToPath(tool), ...args], { encoding: 'utf8' });
}

test('renderer writes fixed Docker and Windows proxy URLs without changing template', async () => {
  const f = await fixture();
  try {
    for (const [target, url, toolUrl] of [['docker', 'http://memory-proxy:8096/claude-code/default', 'http://memory-proxy:8096'], ['windows', 'http://127.0.0.1:8096/claude-code/space-a', 'http://127.0.0.1:8096']]) {
      if (target === 'windows') await writeFile(f.bundleFile, JSON.stringify(bundle(key, { ...baseIdentity, service_id: 'space-a' })));
      const result = run(['--target', target, '--template', f.template, '--config-dir', f.config, '--agent-bundle-file', f.bundleFile, ...(target === 'windows' ? ['--space-id', 'space-a'] : [])]);
      assert.equal(result.status, 0);
      assert.equal(result.stdout.trim(), JSON.stringify({ status: 'ok', target }));
      assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(key));
      const output = JSON.parse(await readFile(join(f.config, 'settings.json'), 'utf8'));
      assert.equal(output.env.ANTHROPIC_BASE_URL, url);
      assert.equal(output.env.TDAI_MEMORY_PROXY_BASE_URL, toolUrl);
      assert.equal(output.env.ANTHROPIC_AUTH_TOKEN, key);
      assert.equal(output.env.ANTHROPIC_CUSTOM_HEADERS, 'x-team-id: team-a\nx-agent-id: agent-a\nx-task-id: task-a\nx-conversation-id: session-a');
      assert.doesNotMatch(output.env.ANTHROPIC_CUSTOM_HEADERS, /x-claude-code-session-id|sk-mem-/i);
    }
    assert.match(await readFile(f.template, 'utf8'), /__MEMORY_PROXY_BASE_URL__/);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test('renderer writes native OpenCode and Pi Anthropic configs with only the selected private identity environment', async () => {
  const f = await fixture();
  const otherKey = `sk-mem-${'Z'.repeat(32)}`;
  try {
    for (const [target, expectedFile] of [['opencode', 'opencode.json'], ['pi', 'models.json']]) {
      const clientKey = target === 'opencode' ? key : otherKey;
      const identity = { ...baseIdentity, agent_id: `agent-${target}`, session_id: `session-${target}`, display_name: target };
      await writeFile(f.bundleFile, JSON.stringify(bundle(clientKey, identity)));
      const configDir = join(f.directory, target);
      const rendered = await renderSettings({ target, configDir, bundleFile: f.bundleFile, spaceId: 'default' });
      assert.deepEqual(rendered.environment, {
        MEMORY_USER_KEY: clientKey,
        MEMORY_TEAM_ID: 'team-a',
        MEMORY_AGENT_ID: `agent-${target}`,
        MEMORY_TASK_ID: 'task-a',
        MEMORY_SESSION_ID: `session-${target}`,
      });
      assert.doesNotMatch(JSON.stringify(rendered.environment), new RegExp(target === 'opencode' ? otherKey : key));
      const config = JSON.parse(await readFile(join(configDir, expectedFile), 'utf8'));
      const text = JSON.stringify(config);
      assert.doesNotMatch(text, /sk-mem-|Authorization|claude-code|api\.deepseek\.com/i);
      if (target === 'opencode') {
        const provider = config.provider['memory-anthropic'];
        assert.equal(provider.npm, '@ai-sdk/anthropic');
        assert.equal(provider.options.baseURL, 'http://memory-proxy:8096/opencode/default/v1');
        assert.equal(provider.options.authToken, '{env:MEMORY_USER_KEY}');
        assert.deepEqual(provider.options.headers, {
          'x-team-id': '{env:MEMORY_TEAM_ID}', 'x-agent-id': '{env:MEMORY_AGENT_ID}', 'x-task-id': '{env:MEMORY_TASK_ID}', 'x-conversation-id': '{env:MEMORY_SESSION_ID}',
        });
        assert.equal(config.model, 'memory-anthropic/deepseek-v4-pro');
      } else {
        const provider = config.providers['memory-anthropic'];
        assert.equal(provider.baseUrl, 'http://memory-proxy:8096/pi/default');
        assert.equal(provider.api, 'anthropic-messages');
        assert.equal(provider.apiKey, '$MEMORY_USER_KEY');
        assert.equal(provider.authHeader, true);
        assert.deepEqual(provider.headers, {
          'x-team-id': '$MEMORY_TEAM_ID', 'x-agent-id': '$MEMORY_AGENT_ID', 'x-task-id': '$MEMORY_TASK_ID', 'x-conversation-id': '$MEMORY_SESSION_ID',
        });
        assert.equal(provider.models[0].id, 'deepseek-v4-pro');
      }
    }
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test('renderer CLI creates a fresh config directory and accepts one terminal CRLF after the bundle JSON', async () => {
  const f = await fixture();
  try {
    const result = run(['--target', 'docker', '--template', f.template, '--config-dir', f.config, '--agent-bundle-file', f.bundleFile]);
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
      const result = run([...extra, '--template', f.template, '--config-dir', f.config, '--agent-bundle-file', f.bundleFile]);
      assert.notEqual(result.status, 0);
      assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(key));
    }
    await writeFile(f.template, JSON.stringify({ env: { ANTHROPIC_AUTH_TOKEN: 'forbidden', ANTHROPIC_BASE_URL: '__MEMORY_PROXY_BASE_URL__' } }));
    let result = run(['--target', 'docker', '--template', f.template, '--config-dir', f.config, '--agent-bundle-file', f.bundleFile]);
    assert.notEqual(result.status, 0);
    await writeFile(f.template, '{}');
    result = run(['--target', 'docker', '--template', f.template, '--config-dir', f.config, '--agent-bundle-file', f.bundleFile]);
    assert.notEqual(result.status, 0);
    await writeFile(f.template, JSON.stringify({ env: { ANTHROPIC_BASE_URL: 'https://example.invalid', HIDDEN: '__MEMORY_PROXY_BASE_URL__' } }));
    result = run(['--target', 'docker', '--template', f.template, '--config-dir', f.config, '--agent-bundle-file', f.bundleFile]);
    assert.notEqual(result.status, 0);
    await writeFile(f.template, JSON.stringify({ env: { ANTHROPIC_BASE_URL: '__MEMORY_PROXY_BASE_URL__', TDAI_MEMORY_PROXY_BASE_URL: 'https://example.invalid' } }));
    result = run(['--target', 'docker', '--template', f.template, '--config-dir', f.config, '--agent-bundle-file', f.bundleFile]);
    assert.notEqual(result.status, 0);
    await writeFile(f.template, JSON.stringify({ env: { ANTHROPIC_BASE_URL: '__MEMORY_PROXY_BASE_URL__' } }));
    await writeFile(f.bundleFile, JSON.stringify(bundle('invalid')));
    result = run(['--target', 'docker', '--template', f.template, '--config-dir', f.config, '--agent-bundle-file', f.bundleFile]);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /sk-mem-/);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test('renderer removes a written temporary file when destination rename fails', async () => {
  const f = await fixture();
  try {
    await mkdir(f.config);
    await mkdir(join(f.config, 'settings.json'));
    const result = run(['--target', 'docker', '--template', f.template, '--config-dir', f.config, '--agent-bundle-file', f.bundleFile]);
    assert.notEqual(result.status, 0);
    assert.deepEqual((await readdir(f.config)).filter((name) => name.startsWith('.settings.') && name.endsWith('.tmp')), []);
    assert.doesNotMatch(JSON.stringify(await readdir(join(f.config, 'settings.json'))), new RegExp(key));
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test('renderer concurrent calls use distinct same-directory temporary files', async () => {
  const f = await fixture();
  const otherKey = `sk-mem-${'B'.repeat(32)}`;
  const otherBundleFile = join(f.directory, 'other-agent-bundle.json');
  try {
    await writeFile(otherBundleFile, JSON.stringify(bundle(otherKey)));
    await Promise.all([
      renderSettings({ target: 'docker', template: f.template, configDir: f.config, bundleFile: f.bundleFile }),
      renderSettings({ target: 'windows', template: f.template, configDir: f.config, bundleFile: otherBundleFile }),
    ]);
    const output = JSON.parse(await readFile(join(f.config, 'settings.json'), 'utf8'));
    assert.ok([key, otherKey].includes(output.env.ANTHROPIC_AUTH_TOKEN));
    assert.deepEqual((await readdir(f.config)).filter((name) => name.startsWith('.settings.') && name.endsWith('.tmp')), []);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test('renderer fail-closes template and bundle-file matrix without leaking dummy keys', async () => {
  const f = await fixture();
  try {
    const command = () => run(['--target', 'docker', '--template', f.template, '--config-dir', f.config, '--agent-bundle-file', f.bundleFile]);
    for (const template of ['{', '{}', JSON.stringify({ env: { ANTHROPIC_BASE_URL: '__MEMORY_PROXY_BASE_URL____MEMORY_PROXY_BASE_URL__' } }), JSON.stringify({ env: { ANTHROPIC_BASE_URL: '__MEMORY_PROXY_BASE_URL__', DEEPSEEK_API_KEY: 'forbidden' } })]) {
      await writeFile(f.template, template);
      assert.notEqual(command().status, 0);
    }
    await writeFile(f.template, JSON.stringify({ env: { ANTHROPIC_BASE_URL: '__MEMORY_PROXY_BASE_URL__' } }));
    for (const content of ['', '{', JSON.stringify(bundle('sk-other')), JSON.stringify(bundle('sk-mem-short')), JSON.stringify({ ...bundle(), other_client: {} })]) {
      await writeFile(f.bundleFile, content);
      const result = command();
      assert.notEqual(result.status, 0);
      assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(key));
    }
    await rm(f.bundleFile);
    assert.notEqual(command().status, 0);
    await mkdir(f.bundleFile);
    assert.notEqual(command().status, 0);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test('renderer fail-closes invalid, cross-space, and linked identities without leaking values', async () => {
  const f = await fixture();
  try {
    const command = () => run(['--target', 'docker', '--template', f.template, '--config-dir', f.config, '--agent-bundle-file', f.bundleFile]);
    await writeFile(f.bundleFile, JSON.stringify(bundle(key, { ...baseIdentity, service_id: 'other' })));
    assert.notEqual(command().status, 0);
    for (const [field, value] of [['team_id', ''], ['agent_id', 'bad:value'], ['task_id', 'bad\r\nvalue'], ['session_id', 'x'.repeat(129)], ['user_id', 'bad:value'], ['display_name', 'bad\r\nvalue'], ['display_name', 'x'.repeat(129)]]) {
      const identity = { ...baseIdentity, [field]: value };
      await writeFile(f.bundleFile, JSON.stringify(bundle(key, identity)));
      const result = command();
      assert.notEqual(result.status, 0);
      assert.doesNotMatch(`${result.stdout}${result.stderr}`, /bad:value|bad\r|sk-mem-/);
    }
    const linked = join(f.directory, 'linked-bundle');
    await writeFile(linked, JSON.stringify(bundle()));
    await rm(f.bundleFile);
    await link(linked, f.bundleFile);
    assert.notEqual(command().status, 0);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});
