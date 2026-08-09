import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createMockServer } from '../tools/mock-llm.mjs';

async function mock() {
  const server = createMockServer({ timeoutMs: 80 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

test('runner validates sanitized manifest and writes only mock contract evidence', async () => {
  const { runMockContract } = await import('../tools/test-runner.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'memory-runner-'));
  const m = await mock();
  try {
    const manifest = join(directory, 'run-manifest.json');
    await writeFile(manifest, JSON.stringify({ run_id: 'run-1', service_id: 'default', team_id: 'team-1', task_id: 'task-1', clients: { 'agent-a': { user_id: 'usr-1', agent_id: 'agt-1', session_id: 'session-1', credential_file: 'credentials/agent-a.user-key', display_name: 'agent-a' } } }));
    await mkdir(join(directory, 'credentials'));
    await writeFile(join(directory, 'credentials', 'agent-a.user-key'), `sk-mem-${'A'.repeat(32)}\n`);
    await runMockContract({ manifestPath: manifest, baseUrl: m.baseUrl });
    const result = JSON.parse(await readFile(join(directory, 'results', 'mock-contract.json'), 'utf8'));
    assert.equal(result.status, 'ok');
    assert.ok(result.assertions.some((entry) => entry.name === 'anthropic-thinking-stream'));
    assert.doesNotMatch(JSON.stringify(result), /sk-mem-|authorization|messages/);
  } finally { await m.close(); await rm(directory, { recursive: true, force: true }); }
});

test('runner rejects manifests that contain credential fields or key-shaped values', async () => {
  const { validateManifest } = await import('../tools/test-runner.mjs');
  assert.throws(() => validateManifest({ run_id: 'run-1', api_key: 'not-allowed' }), /invalid manifest/);
  assert.throws(() => validateManifest({ run_id: 'run-1', token: `sk-mem-${'A'.repeat(32)}` }), /invalid manifest/);
});

test('runner requires a portable credentials-relative credential_file path', async () => {
  const { validateManifest } = await import('../tools/test-runner.mjs');
  const base = { run_id: 'run-1', service_id: 'default', team_id: 'team-1', task_id: 'task-1', clients: { a: { user_id: 'usr-1', agent_id: 'agt-1', session_id: 'session-1', credential_file: 'credentials/a.user-key', display_name: 'a' } } };
  validateManifest(base, process.cwd());
  for (const credentialFile of ['C:outside.user-key', 'C:\\outside.user-key', '/outside.user-key', '\\outside.user-key', 'credentials\\a.user-key', 'credentials/./a.user-key', 'credentials/../a.user-key', 'credentials//a.user-key', 'other/a.user-key', 'credentials/']) {
    const manifest = structuredClone(base);
    manifest.clients.a.credential_file = credentialFile;
    assert.throws(() => validateManifest(manifest, process.cwd()), /invalid manifest/);
  }
});

test('runner fails closed on malformed manifest input without echoing it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'memory-runner-malformed-'));
  const marker = `sk-mem-${'Z'.repeat(32)}`;
  try {
    const manifest = join(directory, 'run-manifest.json');
    await writeFile(manifest, `{"marker":"${marker}`);
    const tool = fileURLToPath(new URL('../tools/test-runner.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [tool, '--manifest', manifest, '--scenario', 'mock-contract'], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /invalid manifest/);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(marker));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
