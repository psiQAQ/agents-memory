import { chmod, mkdir, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, dirname, isAbsolute, relative, sep } from 'node:path';
import { isMain } from './runtime-lib.mjs';

const maxAttestationAgeMs = 15 * 60 * 1000;

function invalid(name) { throw new Error(`invalid ${name}`); }

function controls(environment) {
  const { RUN_PAID_LLM, REAL_LLM_MAX_BUDGET_USD, REAL_LLM_MAX_TURNS, RUN_ID } = environment;
  if (RUN_PAID_LLM !== '1') invalid('RUN_PAID_LLM');
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(REAL_LLM_MAX_BUDGET_USD ?? '') || !Number.isFinite(Number(REAL_LLM_MAX_BUDGET_USD)) || Number(REAL_LLM_MAX_BUDGET_USD) <= 0) invalid('REAL_LLM_MAX_BUDGET_USD');
  if (!/^[1-9]\d*$/.test(REAL_LLM_MAX_TURNS ?? '')) invalid('REAL_LLM_MAX_TURNS');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(RUN_ID ?? '')) invalid('RUN_ID');
  return { runId: RUN_ID, budgetUsd: REAL_LLM_MAX_BUDGET_USD, maxTurns: REAL_LLM_MAX_TURNS };
}

async function regularFile(path, name) {
  let canonical;
  let metadata;
  try { canonical = await realpath(path); metadata = await stat(canonical); } catch { invalid(name); }
  if (!metadata.isFile()) invalid(name);
  return canonical;
}

async function directory(path, name) {
  let canonical;
  let metadata;
  try { canonical = await realpath(path); metadata = await stat(canonical); } catch { invalid(name); }
  if (!metadata.isDirectory()) invalid(name);
  return canonical;
}

async function validateSecret(path) {
  const canonical = await regularFile(path, 'DEEPSEEK_SECRET_FILE');
  let key;
  try { key = (await readFile(canonical, 'utf8')).replace(/\r?\n$/, ''); } catch { invalid('DEEPSEEK_SECRET_FILE'); }
  if (!key || key.trim() !== key || /[\r\n]/.test(key)) invalid('DEEPSEEK_SECRET_FILE');
  return canonical;
}

async function atomicWrite(path, content) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600 });
    await chmod(temporary, 0o600);
    await rename(temporary, path);
    await chmod(path, 0o600);
  } catch {
    await unlink(temporary).catch(() => {});
    throw new Error('cannot write attestation');
  }
}

export async function writePaidGateAttestation(environment, attestationFile, now = new Date()) {
  const approved = controls(environment);
  const { PROJECT_ROOT, DEEPSEEK_SECRET_FILE, EVIDENCE_DIR } = environment;
  if (![PROJECT_ROOT, DEEPSEEK_SECRET_FILE, EVIDENCE_DIR, attestationFile].every((path) => isAbsolute(path ?? ''))) invalid('path');
  const [projectRoot, secretFile, evidenceDir] = await Promise.all([
    directory(PROJECT_ROOT, 'PROJECT_ROOT'),
    validateSecret(DEEPSEEK_SECRET_FILE),
    directory(EVIDENCE_DIR, 'EVIDENCE_DIR'),
  ]);
  if (basename(evidenceDir) !== approved.runId) invalid('EVIDENCE_DIR');
  const fromRoot = relative(projectRoot, secretFile);
  if (!fromRoot || (!fromRoot.startsWith(`..${sep}`) && fromRoot !== '..' && !isAbsolute(fromRoot))) invalid('DEEPSEEK_SECRET_FILE');
  const attestationDir = await directory(dirname(attestationFile), 'attestation path');
  if (attestationDir !== evidenceDir) invalid('attestation path');
  const issuedAt = now.toISOString();
  if (Number.isNaN(Date.parse(issuedAt))) invalid('timestamp');
  const attestation = {
    version: 1,
    run_id: approved.runId,
    budget_usd: approved.budgetUsd,
    max_turns: approved.maxTurns,
    project_root: projectRoot,
    secret_file: secretFile,
    evidence_dir: evidenceDir,
    issued_at: issuedAt,
  };
  await atomicWrite(attestationFile, `${JSON.stringify(attestation, null, 2)}\n`);
  return attestation;
}

export async function verifyPaidGateAttestation(environment, attestationFile, nowMs = Date.now()) {
  const approved = controls(environment);
  const { PROJECT_ROOT, DEEPSEEK_SECRET_FILE, EVIDENCE_DIR, HOST_PROJECT_ROOT, HOST_DEEPSEEK_SECRET_FILE, HOST_EVIDENCE_DIR } = environment;
  if (![PROJECT_ROOT, DEEPSEEK_SECRET_FILE, EVIDENCE_DIR, attestationFile].every((path) => isAbsolute(path ?? ''))) invalid('path');
  if (![HOST_PROJECT_ROOT, HOST_DEEPSEEK_SECRET_FILE, HOST_EVIDENCE_DIR].every((path) => typeof path === 'string' && path && !/[\r\n]/.test(path))) invalid('host path');
  const [, , evidenceDir] = await Promise.all([
    directory(PROJECT_ROOT, 'PROJECT_ROOT'),
    validateSecret(DEEPSEEK_SECRET_FILE),
    directory(EVIDENCE_DIR, 'EVIDENCE_DIR'),
  ]);
  if (basename(evidenceDir) !== approved.runId) invalid('EVIDENCE_DIR');
  const canonicalAttestation = await regularFile(attestationFile, 'attestation');
  let attestation;
  try { attestation = JSON.parse(await readFile(canonicalAttestation, 'utf8')); } catch { invalid('attestation'); }
  if (!attestation || attestation.version !== 1 || attestation.run_id !== approved.runId || attestation.budget_usd !== approved.budgetUsd || attestation.max_turns !== approved.maxTurns || attestation.project_root !== HOST_PROJECT_ROOT || attestation.secret_file !== HOST_DEEPSEEK_SECRET_FILE || attestation.evidence_dir !== HOST_EVIDENCE_DIR) invalid('attestation');
  const issuedAt = Date.parse(attestation.issued_at);
  const age = nowMs - issuedAt;
  if (!Number.isFinite(issuedAt) || age < -60_000 || age > maxAttestationAgeMs) invalid('attestation timestamp');
  return attestation;
}

if (isMain(import.meta)) {
  try {
    const [operation, path, ...extra] = process.argv.slice(2);
    if (!path || extra.length) throw new Error('invalid arguments');
    if (operation === '--write-attestation') {
      await writePaidGateAttestation(process.env, path);
      process.stdout.write('{"status":"attested"}\n');
    } else if (operation === '--verify-attestation') {
      await verifyPaidGateAttestation(process.env, path);
      process.stdout.write('{"status":"ready"}\n');
    } else {
      throw new Error('invalid arguments');
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
