import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

function composeConfig(selectedFiles = files, profiles = ['*']) {
  const args = ['compose', '--project-directory', integrationRoot];
  for (const profile of profiles) args.push('--profile', profile);
  for (const file of selectedFiles) args.push('-f', join(integrationRoot, file));
  args.push('config', '--format', 'json');
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    env: { ...process.env, COMPOSE_PROJECT_NAME: 'task4-static', ACTIVE_CLIENTS: 'claude,opencode,pi' },
  });
  assert.equal(result.status, 0, result.stderr);
  return { parsed: JSON.parse(result.stdout), text: result.stdout };
}

test('active four-CLI Compose fixes product images, profiles, private network, and loopback-only Panel management', () => {
  const { parsed, text } = composeConfig();
  assert.equal(parsed.networks.default.internal, true);
  assert.equal(parsed.services['memory-core'].image, 'local/refine-memory-core:49c4536-fix1@sha256:fded9d48d76bf71d0652023be0e9aa5553d46c039cc04ace0ec7c1e370f95d44');
  assert.equal(parsed.services['memory-proxy'].image, 'local/refine-memory-proxy:0bba4d7-task3-fix1@sha256:88a350e44c0e04bec0632034a4dfb437904dc4da6471fa9957ebb9dbaa86f66c');
  assert.equal(parsed.services['memory-hub'].image, 'local/refine-memory-hub:0a568c3-task2@sha256:a60377245cb4cfff6f5769910ff3a7f4b2fa7b0b64a756a69bf2c552408c44e4');
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

    const prepare = parsed.services[`${client}-config`];
    assert.equal(prepare.user, '0:0');
    assert.ok(prepare.volumes.some((volume) => volume.source === 'bootstrap-state' && volume.target === '/state' && volume.read_only));
    assert.ok(prepare.volumes.some((volume) => volume.source === `${client}-home` && volume.target === '/agent-home'));
    assert.match(JSON.stringify(prepare.command), new RegExp(`prepare-agent\\.mjs.*--agent.*${client}`));
  }
  assert.equal(clientVolumes.size, 6);
});

test('active base and every explicit profile overlay parse without a secret-bearing launcher', () => {
  composeConfig(['compose.four-cli.yaml'], []);
  for (const profile of ['mock', 'real', 'claude', 'opencode', 'pi', 'management']) {
    composeConfig(['compose.four-cli.yaml', `compose.four-cli.${profile}.yaml`], [profile]);
  }
});
