import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const runId = 'task5-host-fixture';

function environment(evidenceDir) {
  return {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    RUN_ID: runId,
    COMPOSE_PROJECT_NAME: 'task5-host-fixture',
    EVIDENCE_DIR: evidenceDir,
    MEMORY_CORE_GATEWAY_API_KEY: 'task5-disposable-gateway',
    PROXY_UPSTREAM_API_KEY: 'must-not-forward',
  };
}

test('Task 5 host launcher fixes one no-build fail-stop sequence and forwards only allowlisted environment', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'task5-host-launcher-'));
  const evidenceDir = join(directory, runId);
  const calls = [];
  try {
    const module = await import('../tools/run-task5-mock.mjs');
    assert.equal(typeof module.runTask5Mock, 'function');
    const result = await module.runTask5Mock({
      environment: environment(evidenceDir), integrationRoot: join(directory, 'integration'),
      spawnCompose: async (args, options) => { calls.push({ args, options }); return { status: 0, stdout: '', stderr: '' }; },
    });
    assert.deepEqual(result, { status: 'ok', steps: 17 });
    assert.equal(calls.length, 17);
    assert.deepEqual(calls[0].args.slice(-9), ['up', '-d', '--wait', '--wait-timeout', '180', '--no-build', 'mock-llm', 'memory-core', 'memory-proxy', 'memory-hub'].slice(-9));
    const runServices = calls.slice(1).map(({ args }) => args.at(-1));
    assert.deepEqual(runServices, [
      'bootstrap', 'claude-config', 'opencode-config', 'pi-config',
      'stage1-gate', 'stage1-gate',
      'claude-headless', 'opencode-headless', 'pi-headless',
      'claude-headless', 'claude-headless', 'opencode-headless', 'opencode-headless', 'pi-headless', 'pi-headless',
      'stage1-gate',
    ]);
    for (const { args, options } of calls) {
      assert.ok(args.includes('--no-build'));
      assert.doesNotMatch(args.join(' '), /(?:^| )build(?: |$)|\bdown\b|\bprune\b/);
      assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe']);
      assert.equal(options.env.RUN_ID, runId);
      assert.equal(options.env.COMPOSE_PROJECT_NAME, 'task5-host-fixture');
      assert.equal(options.env.EVIDENCE_DIR, evidenceDir);
      assert.equal(options.env.MEMORY_CORE_GATEWAY_API_KEY, 'task5-disposable-gateway');
      assert.equal(options.env.PROXY_UPSTREAM_API_KEY, undefined);
    }
    assert.deepEqual(calls.filter(({ options }) => options.env.STAGE1_SCENARIO).map(({ options }) => options.env.STAGE1_SCENARIO), ['protocol-leak', 'management', 'finalize']);
    const headless = calls.filter(({ options }) => options.env.STAGE1_CLIENT_SCENARIO);
    assert.deepEqual(headless.map(({ options }) => `${options.env.STAGE1_CLIENT_SCENARIO}:${options.env.STAGE1_OWNER ?? ''}`), [
      'write:', 'write:', 'write:',
      'read:opencode', 'read:pi', 'read:claude', 'read:pi', 'read:claude', 'read:opencode',
    ]);
    assert.equal(await readFile(evidenceDir).catch((error) => error.code), 'EISDIR');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Task 5 host launcher stops at the first failure without cleanup or leaking child output', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'task5-host-fail-'));
  const evidenceDir = join(directory, runId);
  let calls = 0;
  try {
    const { runTask5Mock } = await import('../tools/run-task5-mock.mjs');
    const error = await runTask5Mock({
      environment: environment(evidenceDir), integrationRoot: join(directory, 'integration'),
      spawnCompose: async () => {
        calls += 1;
        return calls === 5 ? { status: 23, stdout: 'must-not-forward', stderr: 'raw child log' } : { status: 0, stdout: '', stderr: '' };
      },
    }).then(() => undefined, (failure) => failure);
    assert.equal(calls, 5);
    assert.match(error.message, /Task 5 Mock launcher failed step=5/);
    assert.doesNotMatch(error.message, /must-not-forward|raw child log|gateway/i);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Task 5 host launcher rejects missing, ambiguous, or reusable run boundaries before Docker', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'task5-host-invalid-'));
  const { runTask5Mock } = await import('../tools/run-task5-mock.mjs');
  try {
    const cases = [
      { ...environment(join(directory, runId)), RUN_ID: '' },
      { ...environment(join(directory, runId)), COMPOSE_PROJECT_NAME: 'UPPER CASE' },
      { ...environment(join(directory, 'wrong-basename')) },
    ];
    const existingParent = join(directory, 'existing-parent');
    const existingEvidence = join(existingParent, runId);
    await mkdir(existingEvidence, { recursive: true });
    cases.push(environment(existingEvidence));
    for (const entry of cases) {
      let calls = 0;
      await assert.rejects(runTask5Mock({
        environment: entry, integrationRoot: join(directory, 'integration'),
        spawnCompose: async () => { calls += 1; return { status: 0 }; },
      }), /invalid Task 5 Mock launcher environment/);
      assert.equal(calls, 0);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
