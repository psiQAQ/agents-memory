import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (client) => readFile(new URL(`../images/clients/${client}/Dockerfile`, import.meta.url), 'utf8').catch(() => '');

test('Task 4 client images pin official artifacts, verify installs, and end as uid 10001', async () => {
  const [claude, opencode, pi] = await Promise.all(['claude', 'opencode', 'pi'].map(read));
  assert.match(claude, /@anthropic-ai\/claude-code@2\.1\.226/);
  assert.match(claude, /claude --version/);
  assert.match(opencode, /opencode-ai@1\.18\.16/);
  assert.match(opencode, /opencode --version/);
  assert.match(pi, /pi-linux-x64\.tar\.gz/);
  assert.match(pi, /5634d7ebd18274b63af3371e942f342d74bea012389575c1d1ff15ce6ca80c2f/);
  assert.match(pi, /sha256sum -c/);
  assert.match(pi, /tar -xzf \/tmp\/pi-linux-x64\.tar\.gz -C \/opt/);
  assert.match(pi, /ln -s \/opt\/pi\/pi \/usr\/local\/bin\/pi/);
  assert.match(pi, /pi --version/);
  for (const dockerfile of [claude, opencode, pi]) {
    assert.match(dockerfile, /^FROM node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436$/m);
    assert.match(dockerfile, /useradd[^\n]*--uid 10001/);
    assert.match(dockerfile, /^USER agent$/m);
    assert.match(dockerfile, /COPY --from=integration tools\/task5-headless-client\.mjs/);
    assert.match(dockerfile, /COPY --from=integration tools\/task5-contract\.mjs/);
    assert.match(dockerfile, /launch-client\.mjs/);
    assert.doesNotMatch(dockerfile, /latest|docker\.sock|PROXY_UPSTREAM_API_KEY|MEMORY_LLM_API_KEY|api\.deepseek\.com/i);
    assert.doesNotMatch(dockerfile, /^ARG (?:NPM_REGISTRY|CLAUDE_|OPENCODE_|PI_)/m);
  }
});

test('Task 4 tools context includes only the tracked manifest needed by bootstrap', async () => {
  const tools = await readFile(new URL('../images/tools/Dockerfile', import.meta.url), 'utf8');
  const ignore = await readFile(new URL('../.dockerignore', import.meta.url), 'utf8');
  assert.match(tools, /^COPY clients \/lab\/clients$/m);
  assert.match(ignore, /^!clients\/\*\*$/m);
});
