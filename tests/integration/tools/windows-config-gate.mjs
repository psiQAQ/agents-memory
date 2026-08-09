import { chmod, lstat, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, isAbsolute, relative, sep } from 'node:path';
import { isMain } from './runtime-lib.mjs';
import { requireHostRepositoryRoot } from './host-paths.mjs';

const maxAttestationAgeMs = 15 * 60 * 1000;

function invalid(name) { throw new Error(`invalid ${name}`); }

function isOutside(root, path) {
  const fromRoot = relative(root, path);
  return Boolean(fromRoot) && (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot));
}

async function canonicalDirectory(path, name, requireExact = true) {
  if (!isAbsolute(path ?? '')) invalid(name);
  let canonical;
  let metadata;
  try { canonical = await realpath(path); metadata = await lstat(path); } catch { invalid(name); }
  if (metadata.isSymbolicLink() || !metadata.isDirectory() || (requireExact && canonical !== path)) invalid(name);
  return canonical;
}

async function safeAttestationFile(path) {
  if (!isAbsolute(path ?? '')) invalid('attestation');
  let metadata;
  try { metadata = await lstat(path); } catch { invalid('attestation'); }
  if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1) invalid('attestation');
  return path;
}

async function atomicWrite(path, content) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await chmod(temporary, 0o600);
    await rename(temporary, path);
    await chmod(path, 0o600);
  } catch {
    await unlink(temporary).catch(() => {});
    throw new Error('cannot write attestation');
  }
}

export async function writeWindowsConfigAttestation(environment, attestationFile, now = new Date()) {
  const projectRoot = await requireHostRepositoryRoot(environment.PROJECT_ROOT);
  const configDir = await canonicalDirectory(environment.WINDOWS_CLAUDE_CONFIG_DIR, 'WINDOWS_CLAUDE_CONFIG_DIR');
  const attestationDir = await canonicalDirectory(dirname(attestationFile ?? ''), 'attestation path');
  if (!isOutside(projectRoot, configDir) || !isOutside(projectRoot, attestationDir)) invalid('path boundary');
  const issuedAt = now.toISOString();
  if (Number.isNaN(Date.parse(issuedAt))) invalid('timestamp');
  const attestation = { version: 1, project_root: projectRoot, config_dir: configDir, issued_at: issuedAt };
  await atomicWrite(attestationFile, `${JSON.stringify(attestation, null, 2)}\n`);
  return attestation;
}

export async function verifyWindowsConfigAttestation(environment, attestationFile, actualConfigDir, nowMs = Date.now()) {
  const { HOST_PROJECT_ROOT, HOST_WINDOWS_CLAUDE_CONFIG_DIR } = environment;
  if (![HOST_PROJECT_ROOT, HOST_WINDOWS_CLAUDE_CONFIG_DIR].every((value) => typeof value === 'string' && value && !/[\r\n]/.test(value))) invalid('host path');
  await canonicalDirectory(actualConfigDir, 'WINDOWS_CLAUDE_CONFIG_DIR');
  const file = await safeAttestationFile(attestationFile);
  let attestation;
  try { attestation = JSON.parse(await readFile(file, 'utf8')); } catch { invalid('attestation'); }
  if (!attestation || attestation.version !== 1 || attestation.project_root !== HOST_PROJECT_ROOT || attestation.config_dir !== HOST_WINDOWS_CLAUDE_CONFIG_DIR) invalid('attestation');
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
      await writeWindowsConfigAttestation(process.env, path);
      process.stdout.write('{"status":"attested"}\n');
    } else if (operation === '--verify-attestation') {
      await verifyWindowsConfigAttestation(process.env, path, process.env.WINDOWS_CLAUDE_CONFIG_DIR);
      process.stdout.write('{"status":"ready"}\n');
    } else {
      throw new Error('invalid arguments');
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
