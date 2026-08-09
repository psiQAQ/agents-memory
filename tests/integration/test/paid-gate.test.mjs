import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
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
  const attestationFile = join(evidence, 'paid-gate-attestation.json');
  await mkdir(evidence, { recursive: true });
  await writeFile(secretFile, `${secret}\n`);
  return { root, outside, runId, evidence, secretFile, attestationFile };
}

function controls(f) {
  return {
    RUN_PAID_LLM: '1',
    DEEPSEEK_SECRET_FILE: f.secretFile,
    REAL_LLM_MAX_BUDGET_USD: '1.5',
    REAL_LLM_MAX_TURNS: '2',
    RUN_ID: f.runId,
    EVIDENCE_DIR: f.evidence,
    PROJECT_ROOT: f.root,
  };
}

function run(args, env) {
  return spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
}

async function writeAttestation(f) {
  const result = run(['--write-attestation', f.attestationFile], controls(f));
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(secret));
  return result;
}

async function runtimeControls(f) {
  return {
    ...controls(f),
    HOST_PROJECT_ROOT: await realpath(f.root),
    HOST_DEEPSEEK_SECRET_FILE: await realpath(f.secretFile),
    HOST_EVIDENCE_DIR: await realpath(f.evidence),
  };
}

test('host preflight validates canonical external paths and atomically writes a protected attestation in the evidence directory', async () => {
  const f = await fixture();
  try {
    const result = await writeAttestation(f);
    assert.equal(result.stdout.trim(), '{"status":"attested"}');
    const attestation = JSON.parse(await readFile(f.attestationFile, 'utf8'));
    assert.equal(attestation.run_id, f.runId);
    assert.equal(attestation.project_root, await realpath(f.root));
    assert.equal(attestation.secret_file, await realpath(f.secretFile));
    assert.equal(attestation.evidence_dir, await realpath(f.evidence));
    assert.equal(attestation.budget_usd, '1.5');
    assert.equal(attestation.max_turns, '2');
    assert.match(attestation.issued_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.doesNotMatch(JSON.stringify(attestation), new RegExp(secret));
    if (process.platform !== 'win32') assert.equal((await stat(f.attestationFile)).mode & 0o777, 0o600);
  } finally { await rm(f.root, { recursive: true, force: true }); await rm(f.outside, { recursive: true, force: true }); }
});

test('host preflight rejects workspace secrets, mismatched evidence, bad controls, and multiline keys without leakage', async () => {
  const f = await fixture();
  try {
    const insideSecret = join(f.root, 'inside-secret');
    await writeFile(insideSecret, `${secret}\n`);
    const good = controls(f);
    const cases = [
      { DEEPSEEK_SECRET_FILE: insideSecret },
      { EVIDENCE_DIR: resolve(f.root, 'evidence', 'other') },
      { RUN_PAID_LLM: 'true' },
      { REAL_LLM_MAX_BUDGET_USD: '0' },
      { REAL_LLM_MAX_TURNS: '1.5' },
      { RUN_ID: 'bad/id' },
    ];
    for (const changed of cases) {
      const result = run(['--write-attestation', f.attestationFile], { ...good, ...changed });
      assert.notEqual(result.status, 0);
      assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(secret));
    }
    await writeFile(f.secretFile, `${secret}\nsecond-line\n`);
    const multiline = run(['--write-attestation', f.attestationFile], good);
    assert.notEqual(multiline.status, 0);
    assert.doesNotMatch(`${multiline.stdout}${multiline.stderr}`, new RegExp(secret));
  } finally { await rm(f.root, { recursive: true, force: true }); await rm(f.outside, { recursive: true, force: true }); }
});

test('runtime gate verifies host-path attestation fields and the actual mounted secret', async () => {
  const f = await fixture();
  try {
    await writeAttestation(f);
    const good = await runtimeControls(f);
    const ready = run(['--verify-attestation', f.attestationFile], good);
    assert.equal(ready.status, 0, ready.stderr);
    assert.equal(ready.stdout.trim(), '{"status":"ready"}');
    for (const changed of [
      { HOST_PROJECT_ROOT: `${good.HOST_PROJECT_ROOT}-other` },
      { HOST_DEEPSEEK_SECRET_FILE: `${good.HOST_DEEPSEEK_SECRET_FILE}-other` },
      { HOST_EVIDENCE_DIR: `${good.HOST_EVIDENCE_DIR}-other` },
      { REAL_LLM_MAX_BUDGET_USD: '2' },
      { REAL_LLM_MAX_TURNS: '3' },
      { RUN_ID: 'paid-gate-2' },
    ]) {
      const result = run(['--verify-attestation', f.attestationFile], { ...good, ...changed });
      assert.notEqual(result.status, 0);
      assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(secret));
    }
    await writeFile(f.secretFile, `${secret}\nsecond-line\n`);
    assert.notEqual(run(['--verify-attestation', f.attestationFile], good).status, 0);
  } finally { await rm(f.root, { recursive: true, force: true }); await rm(f.outside, { recursive: true, force: true }); }
});

test('runtime gate rejects tampered and stale attestations without key echo', async () => {
  const f = await fixture();
  try {
    await writeAttestation(f);
    const good = await runtimeControls(f);
    const attestation = JSON.parse(await readFile(f.attestationFile, 'utf8'));
    attestation.run_id = 'tampered';
    await writeFile(f.attestationFile, JSON.stringify(attestation));
    let result = run(['--verify-attestation', f.attestationFile], good);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(secret));
    attestation.run_id = f.runId;
    attestation.issued_at = '2000-01-01T00:00:00.000Z';
    await writeFile(f.attestationFile, JSON.stringify(attestation));
    result = run(['--verify-attestation', f.attestationFile], good);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(secret));
  } finally { await rm(f.root, { recursive: true, force: true }); await rm(f.outside, { recursive: true, force: true }); }
});
