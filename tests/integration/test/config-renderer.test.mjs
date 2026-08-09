import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { renderConfig } from '../config/render-config.mjs';

const gatewayKey = 'static-lab-gateway-key';
const tool = fileURLToPath(new URL('../config/render-config.mjs', import.meta.url));

test('mock renderer writes only deterministic Mock endpoints and disabled Proxy integrations', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'memory-config-mock-'));
  try {
    await renderConfig({ outDir, gatewayKey, mode: 'mock' });
    const core = await readFile(join(outDir, 'core', 'tdai-gateway.yaml'), 'utf8');
    const proxy = await readFile(join(outDir, 'proxy', 'config.yaml'), 'utf8');
    const redis = await readFile(join(outDir, 'proxy', 'config.redis.yaml'), 'utf8');
    assert.match(core, /baseUrl: "http:\/\/mock-llm:8080\/openai\/v1"/);
    assert.match(core, /model: "mock-model"/);
    assert.match(proxy, /url: "http:\/\/mock-llm:8080\/anthropic\/v1"/);
    for (const block of ['auth', 'sessionInit', 'injection', 'extraction', 'tdai', 'knowledge']) {
      assert.match(proxy, new RegExp(`${block}:\\n  enabled: false`));
    }
    assert.match(proxy, /redis:\n  enabled: false/);
    assert.match(redis, /redis:\n  enabled: true\n  host: "redis"\n  port: 6379/);
    assert.doesNotMatch(`${core}${proxy}${redis}`, /deepseek|api\.deepseek\.com/i);
    assert.equal((await readFile(join(outDir, 'gateway.token'), 'utf8')).trim(), gatewayKey);
    assert.deepEqual((await readdir(outDir)).filter((name) => name.includes('.tmp')), []);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test('real renderer writes exact server endpoints and a runtime placeholder, never the model key', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'memory-config-real-'));
  const marker = 'dummy-model-key-must-not-appear';
  try {
    await renderConfig({ outDir, gatewayKey, mode: 'real' });
    const core = await readFile(join(outDir, 'core', 'tdai-gateway.yaml'), 'utf8');
    const proxy = await readFile(join(outDir, 'proxy', 'config.yaml'), 'utf8');
    assert.match(core, /baseUrl: "https:\/\/api\.deepseek\.com"/);
    assert.match(core, /model: "deepseek-v4-flash"/);
    assert.match(proxy, /url: "https:\/\/api\.deepseek\.com\/anthropic\/v1"/);
    assert.match(proxy, /apiKey: "\$\{DEEPSEEK_RUNTIME_API_KEY\}"/);
    assert.doesNotMatch(`${core}${proxy}`, new RegExp(marker));
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
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
