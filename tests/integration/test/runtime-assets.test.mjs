import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), 'utf8');

test('Claude image pins the requested runtime and executes as uid 10001', async () => {
  const dockerfile = await read('images/claude/Dockerfile');
  assert.match(dockerfile, /^FROM node:22-bookworm-slim/m);
  assert.match(dockerfile, /ARG NPM_REGISTRY=https:\/\/registry\.npmmirror\.com/);
  assert.match(dockerfile, /@anthropic-ai\/claude-code@2\.1\.207/);
  assert.match(dockerfile, /useradd[^\n]*--uid 10001/);
  assert.match(dockerfile, /^USER claude$/m);
  assert.match(dockerfile, /COPY --from=integration tools\/render-settings\.mjs/);
  assert.match(dockerfile, /COPY --from=integration claude\/settings\.template\.json/);
  assert.doesNotMatch(dockerfile, /--from=settings/);
  assert.doesNotMatch(dockerfile, /latest|docker\.sock/);
});

test('Claude entrypoint rebuilds isolated settings before every CLI invocation', async () => {
  const entrypoint = await read('images/claude/entrypoint.sh');
  assert.match(entrypoint, /render-settings\.mjs/);
  assert.match(entrypoint, /--target docker/);
  assert.match(entrypoint, /--memory-user-key-file/);
  assert.match(entrypoint, /\/home\/claude\/\.memory\/user-key/);
  assert.doesNotMatch(entrypoint, /\/state|credentials\/|bootstrap\.private/);
  assert.match(entrypoint, /--interactive/);
  assert.match(entrypoint, /exec claude "\$@"/);
  assert.doesNotMatch(entrypoint, /ANTHROPIC_AUTH_TOKEN=/);
});

test('integration tools image is pinned and contains only the local harness inputs', async () => {
  const dockerfile = await read('images/tools/Dockerfile');
  assert.match(dockerfile, /^FROM node:22-bookworm-slim$/m);
  assert.match(dockerfile, /^COPY tools \/lab\/tools$/m);
  assert.match(dockerfile, /^COPY config \/lab\/config$/m);
  assert.match(dockerfile, /^COPY claude\/settings\.template\.json \/lab\/claude\/settings\.template\.json$/m);
  assert.doesNotMatch(dockerfile, /npm install|curl|latest/);
});

test('integration Docker context is deny-by-default and admits only build inputs', async () => {
  const dockerignore = await read('.dockerignore');
  assert.match(dockerignore, /^\*$/m);
  for (const path of ['!package.json', '!tools/**', '!config/**', '!claude/settings.template.json', '!images/tools/Dockerfile']) {
    assert.match(dockerignore, new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  }
  assert.doesNotMatch(dockerignore, /!compose|!test\/|!README/);
});

test('Hub image copies Panel and Knowledge from named live-submodule contexts', async () => {
  const dockerfile = await read('images/hub/Dockerfile');
  assert.match(dockerfile, /COPY --from=panel web\/package\*\.json/);
  assert.match(dockerfile, /COPY --from=knowledge package\*\.json/);
  assert.match(dockerfile, /COPY --from=hub_runtime start-combined\.sh/);
  assert.doesNotMatch(dockerfile, /MemoryKnowledge\/Dockerfile|images\/hub\/(?:panel|knowledge)/);
});

test('runtime secret wrapper never prints the key and has explicit service commands', async () => {
  const wrapper = await read('runtime/run-with-deepseek.sh');
  assert.match(wrapper, /TDAI_LLM_API_KEY/);
  assert.doesNotMatch(wrapper, /DEEPSEEK_RUNTIME_API_KEY/);
  assert.match(wrapper, /LLM_API_KEY/);
  assert.match(wrapper, /exec \/usr\/bin\/tini/);
  assert.match(wrapper, /exec \/usr\/local\/bin\/start-combined\.sh/);
  assert.doesNotMatch(wrapper, /echo.*(?:\$model_key|\$secret_file)|set -x/i);
  assert.ok(wrapper.indexOf('proxy)') < wrapper.indexOf('secret_file='));
});

test('Proxy config selector accepts only the base and Redis generated filenames', async () => {
  const wrapper = await read('runtime/run-proxy.sh');
  assert.match(wrapper, /config\.yaml\|config\.redis\.yaml/);
  assert.match(wrapper, /\/runtime-config\/proxy\/\$proxy_config/);
  assert.doesNotMatch(wrapper, /eval|set -x/);
});

test('Windows config wrapper verifies host attestation before rendering settings', async () => {
  const wrapper = await read('tools/prepare-windows-config.mjs');
  assert.match(wrapper, /verifyWindowsConfigAttestation/);
  assert.match(wrapper, /renderSettings/);
  assert.ok(wrapper.indexOf('await verifyWindowsConfigAttestation') < wrapper.indexOf('await renderSettings'));
  assert.doesNotMatch(wrapper, /console\.log|set -x/);
});

test('Claude settings keep the exact DeepSeek primary and fast model contract', async () => {
  const rootSettings = JSON.parse(await readFile(new URL('../../../.claude/settings.template.json', import.meta.url), 'utf8'));
  const settings = JSON.parse(await read('claude/settings.template.json'));
  assert.deepEqual(settings, rootSettings);
  assert.equal(settings.env.ANTHROPIC_MODEL, 'deepseek-v4-pro[1m]');
  assert.equal(settings.env.CLAUDE_CODE_SUBAGENT_MODEL, 'deepseek-v4-flash');
  assert.equal(settings.env.ANTHROPIC_AUTH_TOKEN, undefined);
});
