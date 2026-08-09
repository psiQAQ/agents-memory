import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, normalize } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const integrationRoot = join(import.meta.dirname, '..');
const baseEnvironment = {
  MEMORY_CORE_GATEWAY_API_KEY: 'static-lab-gateway-key',
  COMPOSE_PROJECT_NAME: 'memory-static-contract',
};

function dockerCli() {
  const candidates = [
    process.env.DOCKER_CLI,
    'docker',
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['compose', 'version'], { encoding: 'utf8' });
    if (result.status === 0) return candidate;
  }
  throw new Error('Docker Compose CLI not found; set DOCKER_CLI');
}

function composeConfig(files, environment = {}, profiles = ['*']) {
  const args = ['compose', '--project-directory', integrationRoot];
  for (const profile of profiles) args.push('--profile', profile);
  for (const file of files) args.push('-f', join(integrationRoot, file));
  args.push('config', '--format', 'json');
  const result = spawnSync(dockerCli(), args, {
    encoding: 'utf8',
    env: { ...process.env, ...baseEnvironment, ...environment },
  });
  assert.equal(result.status, 0, result.stderr);
  return { parsed: JSON.parse(result.stdout), text: result.stdout };
}

function composeResult(files, environment = {}, profiles = ['*']) {
  const args = ['compose', '--project-directory', integrationRoot];
  for (const profile of profiles) args.push('--profile', profile);
  for (const file of files) args.push('-f', join(integrationRoot, file));
  args.push('config', '--format', 'json');
  return spawnSync(dockerCli(), args, {
    encoding: 'utf8',
    env: { ...process.env, ...baseEnvironment, ...environment },
  });
}

function serviceNames(config) {
  return Object.keys(config.services).sort();
}

test('base Compose parses as a Mock-only private topology with isolated Claude agents', () => {
  const { parsed, text } = composeConfig(['compose.yaml']);
  assert.deepEqual(serviceNames(parsed), [
    'agent-config-a', 'agent-config-b', 'agent-config-c', 'bootstrap',
    'claude-agent-a', 'claude-agent-b', 'claude-agent-c', 'config-init',
    'memory-core', 'memory-hub', 'memory-proxy', 'mock-llm', 'redis', 'test-runner',
  ]);
  assert.doesNotMatch(text, /api\.deepseek\.com|deepseek_key|RUN_PAID_LLM|DEEPSEEK_SECRET_FILE/i);
  for (const service of Object.values(parsed.services)) assert.equal(service.ports, undefined);

  assert.match(normalize(parsed.services['memory-core'].build.context), /submodules\\TencentDB-Agent-Memory\\MemoryCore$/i);
  assert.match(normalize(parsed.services['memory-proxy'].build.context), /submodules\\TencentDB-Agent-Memory\\MemoryProxy$/i);
  const hubContexts = JSON.stringify(parsed.services['memory-hub'].build.additional_contexts);
  assert.match(hubContexts, /MemoryPanel/);
  assert.match(hubContexts, /MemoryKnowledge/);
  assert.match(hubContexts, /panel-knowledge-combined/);
  assert.doesNotMatch(JSON.stringify(parsed.services['claude-agent-a'].build.additional_contexts), /[\\\/]\.claude/i);

  assert.equal(parsed.services['memory-hub'].environment.LLM_BASE_URL, 'http://mock-llm:8080/openai/v1');
  assert.equal(parsed.services['memory-hub'].environment.KNOWLEDGE_PUBLIC_BASE_URL, 'http://memory-hub:8424/v3');
  assert.equal(parsed.services['memory-proxy'].depends_on['memory-hub'], undefined);
  assert.equal(parsed.services['memory-proxy'].volumes.some((volume) => volume.target === '/data/tdai-memory-proxy'), false);
  assert.deepEqual(parsed.services.redis.profiles, ['redis']);
  assert.equal(parsed.services.redis.ports, undefined);

  const agentState = new Set();
  for (const id of ['a', 'b', 'c']) {
    const agent = parsed.services[`claude-agent-${id}`];
    const agentConfig = parsed.services[`agent-config-${id}`];
    assert.equal(agent.init, true);
    assert.equal(agent.stdin_open, true);
    assert.equal(agent.tty, true);
    assert.deepEqual(agent.profiles, ['claude']);
    assert.equal(agent.environment.CLAUDE_CONFIG_DIR, '/home/claude/.claude');
    const volumes = Object.fromEntries(agent.volumes.map((volume) => [volume.target, volume]));
    for (const target of ['/home/claude', '/workspace']) {
      assert.equal(volumes[target].type, 'volume');
      agentState.add(volumes[target].source);
    }
    assert.equal(volumes['/state'], undefined);
    assert.equal(agent.depends_on[`agent-config-${id}`].condition, 'service_completed_successfully');
    assert.equal(agentConfig.user, '0:0');
    assert.ok(agentConfig.volumes.some((volume) => volume.source === 'bootstrap-state' && volume.target === '/state' && volume.read_only));
    assert.ok(agentConfig.volumes.some((volume) => volume.source === `claude-home-${id}` && volume.target === '/agent-home'));
    assert.deepEqual(agentConfig.profiles, id === 'a' ? ['claude', 'windows'] : ['claude']);
    assert.match(JSON.stringify(agentConfig.command), new RegExp(`prepare-agent\\.mjs.*agent-${id}`));
    assert.doesNotMatch(JSON.stringify(agent), /bootstrap\.private|credentials\/|\/state/);
    assert.doesNotMatch(JSON.stringify(agent), /docker\.sock|\\Users\\/);
  }
  assert.equal(agentState.size, 6);
  assert.ok(parsed.services.bootstrap.command.includes('/state/run'));
  assert.ok(parsed.services['test-runner'].command.includes('/state/run/run-manifest.json'));
});

test('Windows override is opt-in, requires a canonical host config bind, and exposes only agent-a private home', async () => {
  const withoutWindows = composeConfig(['compose.yaml', 'compose.hardened.yaml']);
  assert.equal(withoutWindows.parsed.services['windows-config-init'], undefined);

  const missing = composeResult(['compose.yaml', 'compose.hardened.yaml', 'compose.windows.yaml'], {}, ['windows']);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /WINDOWS_CLAUDE_CONFIG_DIR/);

  const configDir = await mkdtemp(join(tmpdir(), 'memory-windows-claude-'));
  try {
    const { parsed } = composeConfig(['compose.yaml', 'compose.hardened.yaml', 'compose.windows.yaml'], {
      WINDOWS_CLAUDE_CONFIG_DIR: configDir,
    }, ['windows']);
    const service = parsed.services['windows-config-init'];
    assert.deepEqual(service.profiles, ['windows']);
    assert.equal(service.user, '0:0');
    assert.equal(service.depends_on['agent-config-a'].condition, 'service_completed_successfully');
    assert.equal(service.depends_on['memory-proxy'].condition, 'service_healthy');
    assert.equal(service.ports, undefined);
    assert.equal(service.secrets, undefined);
    const volumes = Object.fromEntries(service.volumes.map((volume) => [volume.target, volume]));
    assert.equal(normalize(volumes['/windows-config'].source), normalize(configDir));
    assert.equal(volumes['/agent-home'].source, 'claude-home-a');
    assert.equal(volumes['/agent-home'].read_only, true);
    assert.equal(volumes['/state'], undefined);
    assert.match(JSON.stringify(service.command), /render-settings\.mjs.*--target.*windows.*\/agent-home\/\.memory\/user-key/);
  } finally { await rm(configDir, { recursive: true, force: true }); }
});

test('hardened override publishes only Proxy on host loopback and adds durable logs', () => {
  const { parsed } = composeConfig(['compose.yaml', 'compose.hardened.yaml']);
  const published = Object.entries(parsed.services).filter(([, service]) => service.ports);
  assert.deepEqual(published.map(([name]) => name), ['memory-proxy']);
  assert.equal(parsed.services['memory-proxy'].ports[0].host_ip, '127.0.0.1');
  assert.equal(parsed.services['memory-proxy'].ports[0].published, '8096');
  assert.ok(parsed.services['memory-proxy'].volumes.some((volume) => volume.source === 'proxy-data' && volume.target === '/data/tdai-memory-proxy'));
  assert.ok(parsed.services['memory-proxy'].volumes.some((volume) => volume.source === 'proxy-logs' && volume.target === '/app/logs'));
});

test('Redis profile uses the generated Redis Proxy config only after an explicit allowlisted switch', () => {
  const { parsed } = composeConfig(['compose.yaml'], { MEMORY_PROXY_CONFIG: 'config.redis.yaml' });
  assert.deepEqual(parsed.services.redis.profiles, ['redis']);
  assert.equal(parsed.services['memory-proxy'].environment.MEMORY_PROXY_CONFIG, 'config.redis.yaml');
  assert.deepEqual(parsed.services['memory-proxy'].entrypoint, ['/bin/sh', '/opt/memory-lab/run-proxy.sh']);
});

test('real override requires the explicit profile and keeps the dummy secret out of rendered config', async () => {
  const outside = await mkdtemp(join(tmpdir(), 'memory-compose-secret-'));
  const runId = 'compose-static-1';
  const evidence = join(outside, runId);
  const secretFile = join(outside, 'deepseek-key');
  const marker = 'dummy-static-model-key-never-render';
  try {
    await mkdir(evidence);
    await writeFile(secretFile, `${marker}\n`);
    const { parsed, text } = composeConfig(['compose.yaml', 'compose.real.yaml'], {
      DEEPSEEK_SECRET_FILE: secretFile,
      RUN_PAID_LLM: '1',
      REAL_LLM_MAX_BUDGET_USD: '0.01',
      REAL_LLM_MAX_TURNS: '1',
      RUN_ID: runId,
      EVIDENCE_DIR: evidence,
      PROJECT_ROOT: integrationRoot,
      PAID_GATE_ATTESTATION_FILE: join(evidence, 'paid-gate-attestation.json'),
    });
    assert.doesNotMatch(text, new RegExp(marker));
    assert.equal(normalize(parsed.secrets.deepseek_key.file), normalize(secretFile));
    for (const name of ['paid-gate', 'real-config-init', 'memory-core', 'memory-hub', 'memory-proxy', 'bootstrap', 'claude-agent-a', 'claude-agent-b', 'claude-agent-c']) {
      assert.deepEqual(parsed.services[name].profiles, ['real-claude']);
    }
    assert.equal(parsed.services['paid-gate'].environment.HOST_PROJECT_ROOT, integrationRoot);
    assert.equal(parsed.services['paid-gate'].environment.DEEPSEEK_SECRET_FILE, '/run/secrets/deepseek_key');
    assert.equal(parsed.services['paid-gate'].environment.EVIDENCE_DIR, `/evidence/${runId}`);
    assert.equal(parsed.services['real-config-init'].depends_on['paid-gate'].condition, 'service_completed_successfully');
    for (const name of ['memory-core', 'memory-hub']) {
      assert.equal(parsed.services[name].depends_on['paid-gate'].condition, 'service_completed_successfully');
      assert.ok(parsed.services[name].secrets.some((secret) => secret.source === 'deepseek_key'));
    }
    assert.equal(parsed.services['memory-proxy'].secrets, undefined);
    assert.ok(parsed.services['real-config-init'].secrets.some((secret) => secret.source === 'deepseek_key'));
    for (const name of ['memory-core', 'memory-hub', 'memory-proxy']) {
      assert.equal(parsed.services[name].depends_on['config-init'], undefined);
      assert.equal(parsed.services[name].depends_on['mock-llm'], undefined);
    }
    for (const name of ['claude-agent-a', 'claude-agent-b', 'claude-agent-c']) {
      assert.equal(parsed.services[name].secrets, undefined);
      assert.doesNotMatch(JSON.stringify(parsed.services[name].environment), /DEEPSEEK|api\.deepseek\.com/i);
    }
    assert.equal(parsed.services['memory-hub'].environment.LLM_BASE_URL, 'https://api.deepseek.com');
    assert.equal(parsed.services['memory-hub'].environment.LLM_MODEL, 'deepseek-v4-flash');

    const active = composeConfig(['compose.yaml', 'compose.real.yaml'], {
      DEEPSEEK_SECRET_FILE: secretFile, RUN_PAID_LLM: '1', REAL_LLM_MAX_BUDGET_USD: '0.01', REAL_LLM_MAX_TURNS: '1',
      RUN_ID: runId, EVIDENCE_DIR: evidence, PROJECT_ROOT: integrationRoot,
      PAID_GATE_ATTESTATION_FILE: join(evidence, 'paid-gate-attestation.json'),
    }, ['real-claude']).parsed.services;
    assert.equal(active['mock-llm'], undefined);
    assert.equal(active['config-init'], undefined);
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
});
