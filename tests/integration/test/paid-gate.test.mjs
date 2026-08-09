import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const tool = fileURLToPath(new URL('../tools/paid-gate.mjs', import.meta.url));
const secret = 'deepseek-test-secret-not-real';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'memory-project-'));
  const outside = await mkdtemp(join(tmpdir(), 'memory-secret-'));
  const runId = 'paid-gate-1';
  const evidence = join(root, 'evidence', runId);
  const secretFile = join(outside, 'secret');
  await mkdir(evidence, { recursive: true });
  await writeFile(secretFile, `${secret}\n`);
  return { root, outside, runId, evidence, secretFile };
}

function run(env) {
  return spawnSync(process.execPath, [tool], { encoding: 'utf8', env: { ...process.env, ...env } });
}

test('paid gate only reports ready for validated external real-profile inputs', async () => {
  const f = await fixture();
  try {
    const result = run({ RUN_PAID_LLM: '1', DEEPSEEK_SECRET_FILE: f.secretFile, REAL_LLM_MAX_BUDGET_USD: '1.5', REAL_LLM_MAX_TURNS: '2', RUN_ID: f.runId, EVIDENCE_DIR: f.evidence, PROJECT_ROOT: f.root });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), '{"status":"ready"}');
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(secret));
  } finally { await rm(f.root, { recursive: true, force: true }); await rm(f.outside, { recursive: true, force: true }); }
});

test('paid gate fails closed without exposing secret for each invalid control', async () => {
  const f = await fixture();
  try {
    const good = { RUN_PAID_LLM: '1', DEEPSEEK_SECRET_FILE: f.secretFile, REAL_LLM_MAX_BUDGET_USD: '1', REAL_LLM_MAX_TURNS: '1', RUN_ID: f.runId, EVIDENCE_DIR: f.evidence, PROJECT_ROOT: f.root };
    const cases = [
      { RUN_PAID_LLM: 'true' }, { RUN_PAID_LLM: '01' }, { REAL_LLM_MAX_BUDGET_USD: '0' }, { REAL_LLM_MAX_BUDGET_USD: 'NaN' },
      { REAL_LLM_MAX_TURNS: '1.5' }, { RUN_ID: 'bad/id' }, { EVIDENCE_DIR: resolve(f.root, 'evidence', 'other') }, { DEEPSEEK_SECRET_FILE: resolve(f.root, 'inside-secret') },
    ];
    for (const changed of cases) {
      const result = run({ ...good, ...changed });
      assert.notEqual(result.status, 0);
      assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(secret));
    }
    await writeFile(f.secretFile, `${secret}\nsecond-line\n`);
    const result = run(good);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(secret));
  } finally { await rm(f.root, { recursive: true, force: true }); await rm(f.outside, { recursive: true, force: true }); }
});

test('paid gate covers missing, path, budget, turn, run, and evidence fail-closed matrix', async () => {
  const f = await fixture();
  try {
    const good = { RUN_PAID_LLM: '1', DEEPSEEK_SECRET_FILE: f.secretFile, REAL_LLM_MAX_BUDGET_USD: '1', REAL_LLM_MAX_TURNS: '1', RUN_ID: f.runId, EVIDENCE_DIR: f.evidence, PROJECT_ROOT: f.root };
    const secretDirectory = join(f.outside, 'directory-secret');
    const nonDirectoryEvidence = join(f.root, 'evidence-file');
    await mkdir(secretDirectory);
    await writeFile(nonDirectoryEvidence, 'file');
    const cases = [
      { RUN_PAID_LLM: undefined }, { DEEPSEEK_SECRET_FILE: 'relative' }, { DEEPSEEK_SECRET_FILE: join(f.outside, 'missing') }, { DEEPSEEK_SECRET_FILE: secretDirectory },
      { REAL_LLM_MAX_BUDGET_USD: '-1' }, { REAL_LLM_MAX_TURNS: '0' }, { REAL_LLM_MAX_TURNS: '01' }, { RUN_ID: '' },
      { EVIDENCE_DIR: nonDirectoryEvidence }, { EVIDENCE_DIR: join(f.root, 'evidence', 'wrong') }, { PROJECT_ROOT: 'relative' },
    ];
    for (const changed of cases) {
      const result = run({ ...good, ...changed });
      assert.notEqual(result.status, 0);
      assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(secret));
    }
    await writeFile(f.secretFile, '\n');
    assert.notEqual(run(good).status, 0);
  } finally { await rm(f.root, { recursive: true, force: true }); await rm(f.outside, { recursive: true, force: true }); }
});
