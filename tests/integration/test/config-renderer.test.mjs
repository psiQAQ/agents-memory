import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { renderConfig } from '../config/render-config.mjs';
import { renderRealConfig } from '../config/render-real-config.mjs';

const gatewayKey = 'static-lab-gateway-key';
const tool = fileURLToPath(new URL('../config/render-config.mjs', import.meta.url));

test('mock renderer writes deterministic Mock endpoints and the standalone Proxy memory integrations', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'memory-config-mock-'));
  try {
    await renderConfig({ outDir, gatewayKey, mode: 'mock', spaceId: 'space-a' });
    const core = await readFile(join(outDir, 'core', 'tdai-gateway.yaml'), 'utf8');
    const proxy = await readFile(join(outDir, 'proxy', 'config.yaml'), 'utf8');
    const redis = await readFile(join(outDir, 'proxy', 'config.redis.yaml'), 'utf8');
    assert.match(core, /baseUrl: "http:\/\/mock-llm:8080\/openai\/v1"/);
    assert.match(core, /model: "mock-model"/);
    assert.match(core, /enableDedup: false/);
    assert.match(core, /enableWarmup: true/);
    assert.match(proxy, /url: "http:\/\/mock-llm:8080\/anthropic\/v1"/);
    for (const block of ['auth', 'sessionInit', 'injection', 'extraction', 'tdai']) assert.match(proxy, new RegExp(`${block}:\\n  enabled: true`));
    assert.match(proxy, /knowledge:\n  enabled: false/);
    assert.match(proxy, /injectors: \["tdai-memory"\]/);
    assert.match(proxy, /extractors: \["tdai-memory"\]/);
    assert.match(proxy, /externalGatewayUrl: "http:\/\/memory-proxy:8096"/);
    assert.match(proxy, /headerAutoSelect:[\s\S]*teamHeader: "x-team-id"[\s\S]*agentHeader: "x-agent-id"[\s\S]*taskHeader: "x-task-id"/);
    assert.equal((proxy.match(/serviceId: "space-a"/g) ?? []).length, 3);
    assert.doesNotMatch(proxy, /serviceId: "context-proxy"/);
    assert.match(proxy, /writeL0: true/);
    assert.match(proxy, /recallL1: true/);
    assert.match(proxy, /injectL2L3: false/);
    assert.equal((proxy.match(new RegExp(gatewayKey, 'g')) ?? []).length, 4);
    assert.match(proxy, /redis:\n  enabled: false/);
    assert.match(redis, /redis:\n  enabled: true\n  host: "redis"\n  port: 6379/);
    assert.doesNotMatch(`${core}${proxy}${redis}`, /deepseek|api\.deepseek\.com/i);
    assert.equal((await readFile(join(outDir, 'gateway.token'), 'utf8')).trim(), gatewayKey);
    assert.deepEqual((await readdir(outDir)).filter((name) => name.includes('.tmp')), []);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test('real renderer JSON-escapes the model key into a protected Proxy config', async () => {
  const root = await mkdtemp(join(tmpdir(), 'memory-config-real-'));
  const outDir = join(root, 'shared');
  const proxyOutDir = join(root, 'proxy-private');
  const secretFile = join(root, 'source-key');
  const marker = 'dummy-model-"quote\\slash';
  try {
    await writeFile(secretFile, `${marker}\n`);
    await renderRealConfig({ outDir, proxyOutDir, gatewayKey, secretFile, spaceId: 'space-real', uid: process.getuid?.() ?? 10001, gid: process.getgid?.() ?? 10001 });
    const core = await readFile(join(outDir, 'core', 'tdai-gateway.yaml'), 'utf8');
    const proxyFile = join(proxyOutDir, 'proxy', 'config.yaml');
    const proxy = await readFile(proxyFile, 'utf8');
    assert.match(core, /baseUrl: "https:\/\/api\.deepseek\.com"/);
    assert.match(core, /model: "deepseek-v4-flash"/);
    assert.match(core, /enableDedup: true/);
    assert.match(proxy, /url: "https:\/\/api\.deepseek\.com\/anthropic\/v1"/);
    assert.equal((proxy.match(/serviceId: "space-real"/g) ?? []).length, 3);
    for (const block of ['auth', 'sessionInit', 'injection', 'extraction', 'tdai']) assert.match(proxy, new RegExp(`${block}:\\n  enabled: true`));
    assert.match(proxy, new RegExp(`apiKey: ${JSON.stringify(marker).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.doesNotMatch(proxy, /DEEPSEEK_RUNTIME_API_KEY|__DEEPSEEK_/);
    assert.doesNotMatch(`${core}${await readFile(join(outDir, 'gateway.token'), 'utf8')}`, new RegExp(marker));
    await assert.rejects(readFile(join(outDir, 'proxy', 'config.yaml'), 'utf8'), { code: 'ENOENT' });
    await assert.rejects(readFile(join(proxyOutDir, 'gateway.token'), 'utf8'), { code: 'ENOENT' });
    if (process.platform !== 'win32') {
      const metadata = await stat(proxyFile);
      assert.equal(metadata.mode & 0o777, 0o600);
      assert.equal(metadata.uid, process.getuid());
      assert.equal(metadata.gid, process.getgid());
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('real renderer CLI rejects empty and multiline secrets and never echoes a valid key', async () => {
  const root = await mkdtemp(join(tmpdir(), 'memory-config-real-cli-'));
  const realTool = fileURLToPath(new URL('../config/render-real-config.mjs', import.meta.url));
  try {
    const secretFile = join(root, 'secret');
    const marker = 'dummy-cli-model-key';
    await writeFile(secretFile, `${marker}\n`);
    const result = spawnSync(process.execPath, [realTool, '--out', join(root, 'shared'), '--proxy-out', join(root, 'proxy-private'), '--secret-file', secretFile], {
      encoding: 'utf8', env: { ...process.env, MEMORY_CORE_GATEWAY_API_KEY: gatewayKey },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(marker));
    for (const invalid of ['', ` ${marker}`, `${marker} `, `${marker}\nsecond-line\n`]) {
      await writeFile(secretFile, invalid);
      const rejected = spawnSync(process.execPath, [realTool, '--out', join(root, `bad-shared-${invalid.length}`), '--proxy-out', join(root, `bad-proxy-${invalid.length}`), '--secret-file', secretFile], {
        encoding: 'utf8', env: { ...process.env, MEMORY_CORE_GATEWAY_API_KEY: gatewayKey },
      });
      assert.notEqual(rejected.status, 0);
      assert.doesNotMatch(`${rejected.stdout}${rejected.stderr}`, new RegExp(marker));
    }
    const sharedOutputRejected = spawnSync(process.execPath, [realTool, '--out', join(root, 'same'), '--proxy-out', join(root, 'same'), '--secret-file', secretFile], {
      encoding: 'utf8', env: { ...process.env, MEMORY_CORE_GATEWAY_API_KEY: gatewayKey },
    });
    assert.notEqual(sharedOutputRejected.status, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('renderer CLI rejects YAML-injecting gateway values without echoing them', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'memory-config-invalid-'));
  const bad = 'bad\nvalue: exposed';
  try {
    const result = spawnSync(process.execPath, [tool, '--out', outDir, '--mode', 'mock'], {
      encoding: 'utf8',
      env: { ...process.env, MEMORY_CORE_GATEWAY_API_KEY: bad },
    });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /value: exposed/);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
