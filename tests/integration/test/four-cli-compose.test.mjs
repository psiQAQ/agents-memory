import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const integrationRoot = join(import.meta.dirname, '..');
const files = [
  'compose.four-cli.yaml',
  'compose.four-cli.mock.yaml',
  'compose.four-cli.real.yaml',
  'compose.four-cli.claude.yaml',
  'compose.four-cli.opencode.yaml',
  'compose.four-cli.pi.yaml',
  'compose.four-cli.management.yaml',
];

const staticEnvironment = {
  COMPOSE_PROJECT_NAME: 'task5-static', RUN_ID: 'task5-static',
  EVIDENCE_DIR: join(integrationRoot, '.static-evidence', 'task5-static'),
  ACTIVE_CLIENTS: 'claude,opencode,pi', MEMORY_CORE_GATEWAY_API_KEY: 'task4-static-gateway-key',
};

function composeConfig(selectedFiles = files, profiles = ['*']) {
  const args = ['compose', '--project-directory', integrationRoot];
  for (const profile of profiles) args.push('--profile', profile);
  for (const file of selectedFiles) args.push('-f', join(integrationRoot, file));
  args.push('config', '--format', 'json');
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    env: { ...process.env, ...staticEnvironment },
  });
  assert.equal(result.status, 0, result.stderr);
  return { parsed: JSON.parse(result.stdout), text: result.stdout };
}

test('active four-CLI Compose fixes product images, profiles, private network, and loopback-only Panel management', () => {
  const { parsed, text } = composeConfig();
  assert.equal(parsed.name, staticEnvironment.COMPOSE_PROJECT_NAME);
  assert.equal(parsed.networks.default.internal, true);
  assert.equal(parsed.services['memory-core'].image, 'local/refine-memory-core:49c4536-fix1@sha256:fded9d48d76bf71d0652023be0e9aa5553d46c039cc04ace0ec7c1e370f95d44');
  assert.equal(parsed.services['memory-proxy'].image, 'local/refine-memory-proxy:9e456a5-auth-fix@sha256:55fedae3f6a3a0a45ac8be45461d8cab23c52f11cc089c1c1e54c7d236de764b');
  assert.equal(parsed.services['memory-hub'].image, 'local/refine-memory-hub:0a568c3-task2@sha256:a60377245cb4cfff6f5769910ff3a7f4b2fa7b0b64a756a69bf2c552408c44e4');
  const claudeImage = 'refine-memory-claude-code:2.1.226@sha256:058eccaf56507941c27fd1ce57e69cb6ae5cff20680e7a36ed80bddb22ec946b';
  assert.equal(parsed.services['claude-client'].image, claudeImage);
  assert.equal(parsed.services['claude-headless'].image, claudeImage);
  assert.deepEqual(parsed.services['mock-llm'].profiles, ['mock']);
  for (const client of ['claude', 'opencode', 'pi']) {
    assert.deepEqual(parsed.services[`${client}-config`].profiles, [client]);
    assert.deepEqual(parsed.services[`${client}-client`].profiles, [client]);
  }
  const published = Object.entries(parsed.services).filter(([, service]) => service.ports);
  assert.deepEqual(published.map(([name]) => name), ['memory-hub']);
  assert.deepEqual(parsed.services['memory-hub'].ports.map(({ host_ip, target }) => ({ host_ip, target })), [{ host_ip: '127.0.0.1', target: 8125 }]);
  assert.equal(parsed.services['memory-hub'].ports.some(({ target }) => target === 8424), false);
  assert.equal(parsed.secrets, undefined);
  assert.doesNotMatch(text, /api\.deepseek\.com|PROXY_UPSTREAM_API_KEY|MEMORY_LLM_API_KEY|sk-mem-|docker\.sock/i);
});

test('root gitlink fixes the reviewed auth service-token product commit', () => {
  const result = spawnSync('git', ['ls-files', '--stage', '--', 'submodules/TencentDB-Agent-Memory'], {
    cwd: join(integrationRoot, '..', '..'),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '160000 9e456a5b7bb47ae40596237d0f0b87c1edfc098f 0\tsubmodules/TencentDB-Agent-Memory');
});

test('active Compose fails fast unless project, run, and evidence values are all explicit', async () => {
  const text = await Promise.all(files.map((file) => readFile(join(integrationRoot, file), 'utf8'))).then((values) => values.join('\n'));
  assert.doesNotMatch(text, /RUN_ID:-|EVIDENCE_DIR:-|task4-static|task5-static/);
  for (const missing of ['COMPOSE_PROJECT_NAME', 'RUN_ID', 'EVIDENCE_DIR']) {
    const environment = { ...process.env, ...staticEnvironment };
    delete environment[missing];
    const args = ['compose', '--project-directory', integrationRoot, '--profile', '*'];
    for (const file of files) args.push('-f', join(integrationRoot, file));
    args.push('config', '--format', 'json');
    const result = spawnSync('docker', args, { encoding: 'utf8', env: environment });
    assert.notEqual(result.status, 0, `${missing} unexpectedly accepted`);
    assert.match(result.stderr, new RegExp(missing));
  }
  const { parsed } = composeConfig();
  assert.ok(parsed.services.bootstrap.command.includes(staticEnvironment.RUN_ID));
  for (const client of ['claude', 'opencode', 'pi']) assert.ok(parsed.services[`${client}-headless`].command.includes(staticEnvironment.RUN_ID));
  assert.equal(parsed.services['stage1-gate'].volumes.find((volume) => volume.target === '/evidence').source.replaceAll('\\', '/'), staticEnvironment.EVIDENCE_DIR.replaceAll('\\', '/'));
});

test('active runtime Compose cannot implicitly build an image', () => {
  const { parsed } = composeConfig();
  const buildServices = Object.entries(parsed.services)
    .filter(([, service]) => service.build)
    .map(([name]) => name)
    .sort();
  assert.deepEqual(buildServices, []);
});

test('explicit build-only overlay defines exactly the tools and three client builds', () => {
  const { parsed } = composeConfig([...files, 'compose.four-cli.build.yaml']);
  const builds = Object.fromEntries(Object.entries(parsed.services)
    .filter(([, service]) => service.build)
    .map(([name, service]) => [name, service.build]));
  assert.deepEqual(builds, {
    bootstrap: { context: integrationRoot, dockerfile: 'images/tools/Dockerfile' },
    'claude-client': { context: join(integrationRoot, 'images', 'clients', 'claude'), dockerfile: 'Dockerfile', additional_contexts: { integration: integrationRoot } },
    'opencode-client': { context: join(integrationRoot, 'images', 'clients', 'opencode'), dockerfile: 'Dockerfile', additional_contexts: { integration: integrationRoot } },
    'pi-client': { context: join(integrationRoot, 'images', 'clients', 'pi'), dockerfile: 'Dockerfile', additional_contexts: { integration: integrationRoot } },
  });
  assert.equal(parsed.services['claude-client'].image, 'refine-memory-claude-code:2.1.226');
});

test('active client containers are non-root and receive only their private home and workspace', () => {
  const { parsed } = composeConfig();
  const clientVolumes = new Set();
  for (const client of ['claude', 'opencode', 'pi']) {
    const service = parsed.services[`${client}-client`];
    assert.equal(service.user, '10001:10001');
    assert.equal(service.read_only, true);
    assert.deepEqual(service.cap_drop, ['ALL']);
    assert.ok(service.security_opt.includes('no-new-privileges:true'));
    assert.equal(service.secrets, undefined);
    assert.equal(service.environment.MEMORY_SPACE_ID, 'default');
    assert.doesNotMatch(JSON.stringify(service.environment), /KEY|TOKEN|DEEPSEEK/i);
    const volumes = Object.fromEntries(service.volumes.map((volume) => [volume.target, volume]));
    assert.deepEqual(Object.keys(volumes).sort(), ['/home/agent', '/workspace']);
    for (const target of ['/home/agent', '/workspace']) {
      assert.equal(volumes[target].type, 'volume');
      clientVolumes.add(volumes[target].source);
    }
    assert.doesNotMatch(JSON.stringify(service), /bootstrap-state|\/state|docker\.sock/i);
    assert.equal(service.depends_on['memory-proxy'].condition, 'service_healthy');

    const prepare = parsed.services[`${client}-config`];
    assert.equal(prepare.user, '0:0');
    assert.ok(prepare.volumes.some((volume) => volume.source === 'bootstrap-state' && volume.target === '/state' && volume.read_only));
    assert.ok(prepare.volumes.some((volume) => volume.source === `${client}-home` && volume.target === '/agent-home'));
    assert.match(JSON.stringify(prepare.command), new RegExp(`prepare-agent\\.mjs.*--agent.*${client}`));

    const headless = parsed.services[`${client}-headless`];
    assert.equal(headless.user, '10001:10001');
    assert.equal(headless.read_only, true);
    assert.deepEqual(headless.entrypoint, ['node', '/opt/memory-client/task5-headless-client.mjs']);
    assert.deepEqual(headless.volumes.map(({ source, target }) => ({ source, target })), [
      { source: `${client}-home`, target: '/home/agent' },
      { source: `${client}-workspace`, target: '/workspace' },
      { source: `${client}-evidence`, target: '/client-evidence' },
    ]);
    assert.notEqual(headless.volumes.find((volume) => volume.target === '/client-evidence').read_only, true);
    assert.ok(headless.command.includes('--evidence-dir'));
    assert.ok(headless.command.includes('/client-evidence'));
    assert.equal(headless.environment.STAGE1_CLIENT_SCENARIO, 'write');
    assert.equal(headless.environment.STAGE1_OWNER, '');
    assert.equal(headless.command.includes('--scenario'), false);
    assert.equal(headless.command.includes('--owner'), false);
    assert.doesNotMatch(JSON.stringify(headless), /bootstrap-state|\/state|docker\.sock|DEEPSEEK/i);
  }
  assert.equal(clientVolumes.size, 6);
});

test('active base and every explicit profile overlay parse without a secret-bearing launcher', () => {
  const { parsed } = composeConfig(['compose.four-cli.yaml'], []);
  assert.equal(parsed.services.bootstrap.depends_on['memory-core'].condition, 'service_healthy');
  for (const profile of ['mock', 'real', 'claude', 'opencode', 'pi', 'management']) {
    composeConfig(['compose.four-cli.yaml', `compose.four-cli.${profile}.yaml`], [profile]);
  }
});

test('active mock overlay renders runtime config and waits for healthy services', () => {
  const { parsed } = composeConfig(['compose.four-cli.yaml', 'compose.four-cli.mock.yaml'], ['mock']);
  const configInit = parsed.services['config-init'];
  assert.deepEqual(configInit.profiles, ['mock']);
  assert.ok(configInit.command.includes('config/render-config.mjs'));
  assert.ok(configInit.volumes.some((volume) => volume.source === 'runtime-config' && volume.target === '/out'));

  const core = parsed.services['memory-core'];
  assert.equal(core.depends_on['config-init'].condition, 'service_completed_successfully');
  assert.equal(core.depends_on['mock-llm'].condition, 'service_healthy');
  assert.equal(core.environment.TDAI_GATEWAY_CONFIG, '/runtime-config/core/tdai-gateway.yaml');
  assert.ok(core.volumes.some((volume) => volume.source === 'runtime-config' && volume.target === '/runtime-config' && volume.read_only));

  const proxy = parsed.services['memory-proxy'];
  assert.equal(proxy.depends_on['config-init'].condition, 'service_completed_successfully');
  assert.equal(proxy.depends_on['memory-core'].condition, 'service_healthy');
  assert.equal(proxy.depends_on['mock-llm'].condition, 'service_healthy');
  assert.deepEqual(proxy.entrypoint, ['/bin/sh', '/opt/memory-lab/run-proxy.sh']);
  assert.ok(proxy.volumes.some((volume) => volume.source === 'runtime-config' && volume.target === '/runtime-config' && volume.read_only));

  const hub = parsed.services['memory-hub'];
  assert.equal(hub.environment.REMOTE_INSTANCE_URL, 'http://memory-core:8420');
  assert.equal(hub.environment.REMOTE_INSTANCE_KEY, 'task4-static-gateway-key');
  assert.equal(hub.depends_on['memory-core'].condition, 'service_healthy');

  const bootstrap = parsed.services.bootstrap;
  assert.equal(bootstrap.depends_on['memory-core'].condition, 'service_healthy');
  assert.equal(bootstrap.environment.MEMORY_CORE_SERVICE_TOKEN_FILE, '/runtime-config/gateway.token');
  assert.ok(bootstrap.volumes.some((volume) => volume.source === 'runtime-config' && volume.target === '/runtime-config' && volume.read_only));

  const mock = parsed.services['mock-llm'];
  assert.deepEqual(mock.healthcheck.test, ['CMD', 'node', 'tools/healthcheck.mjs', 'http://127.0.0.1:8080/healthz']);

  const gate = parsed.services['stage1-gate'];
  assert.deepEqual(gate.profiles, ['mock']);
  assert.equal(gate.user, '0:0');
  assert.equal(gate.read_only, true);
  assert.deepEqual(gate.cap_drop, ['ALL']);
  assert.ok(gate.security_opt.includes('no-new-privileges:true'));
  assert.equal(gate.depends_on['memory-hub'].condition, 'service_healthy');
  assert.equal(gate.environment.PANEL_BASE_URL, 'http://memory-hub:8125');
  assert.ok(gate.volumes.some((volume) => volume.source === 'bootstrap-state' && volume.target === '/state' && volume.read_only));
  assert.ok(gate.volumes.some((volume) => volume.target === '/evidence' && volume.type === 'bind'));
  for (const client of ['claude', 'opencode', 'pi']) {
    assert.ok(gate.volumes.some((volume) => volume.source === `${client}-evidence` && volume.target === `/client-evidence/${client}` && volume.read_only));
  }
  assert.ok(gate.command.includes('--client-evidence-root'));
  assert.ok(gate.command.includes('/client-evidence'));
  assert.doesNotMatch(JSON.stringify(gate), /docker\.sock|DEEPSEEK|PROXY_UPSTREAM_API_KEY|MEMORY_LLM_API_KEY/i);
});

test('active SOP matrix supplies and clears only a disposable non-LLM gateway value', async () => {
  const readme = await readFile(join(integrationRoot, 'README.md'), 'utf8');
  const block = readme.match(/active Compose 静态入口[\s\S]*?```powershell\n([\s\S]*?)\n```/)?.[1] ?? '';
  const assignment = "$env:MEMORY_CORE_GATEWAY_API_KEY = 'task4-static-gateway-key'";
  assert.ok(block.indexOf(assignment) >= 0);
  assert.ok(block.indexOf(assignment) < block.indexOf("foreach ($profile"));
  assert.match(block, /finally \{[\s\S]*Remove-Item Env:MEMORY_CORE_GATEWAY_API_KEY -ErrorAction SilentlyContinue[\s\S]*\}/);
  for (const name of ['RUN_ID', 'COMPOSE_PROJECT_NAME', 'EVIDENCE_DIR']) {
    assert.match(block, new RegExp(`\\$env:${name}\\s*=`));
    assert.match(block, new RegExp(`Remove-Item Env:${name} -ErrorAction SilentlyContinue`));
  }
  assert.match(readme, /disposable non-LLM gateway 值/);
  assert.match(readme, /不得在 Paid Gate 中复用/);
  assert.match(readme, /node tests\/integration\/tools\/run-task5-mock\.mjs/);
  assert.match(readme, /失败[\s\S]{0,120}project、volumes[\s\S]{0,80}保留/i);
});
