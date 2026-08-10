import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const tool = fileURLToPath(new URL('../tools/windows-config-gate.mjs', import.meta.url));

async function fixture() {
  const root = await realpath(fileURLToPath(new URL('../../../', import.meta.url)));
  const outside = await mkdtemp(join(tmpdir(), 'memory-windows-gate-'));
  const configDir = join(outside, 'config');
  const gateDir = join(outside, 'gate');
  const attestationFile = join(gateDir, 'windows-config-attestation.json');
  await Promise.all([mkdir(configDir), mkdir(gateDir)]);
  return { root, outside, configDir: await realpath(configDir), attestationFile };
}

function run(args, environment) {
  const env = { ...process.env, ...environment };
  for (const [name, value] of Object.entries(env)) if (value === undefined) delete env[name];
  return spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8', env });
}

function hostEnvironment(f) {
  return { PROJECT_ROOT: f.root, WINDOWS_CLAUDE_CONFIG_DIR: f.configDir };
}

async function writeAttestation(f) {
  const result = run(['--write-attestation', f.attestationFile], hostEnvironment(f));
  assert.equal(result.status, 0, result.stderr);
  return result;
}

test('Windows host gate accepts only a canonical absolute config directory outside the real repository root', async () => {
  const f = await fixture();
  try {
    const result = await writeAttestation(f);
    assert.equal(result.stdout.trim(), '{"status":"attested"}');
    const attestation = JSON.parse(await readFile(f.attestationFile, 'utf8'));
    assert.equal(attestation.project_root, f.root);
    assert.equal(attestation.config_dir, f.configDir);
    assert.match(attestation.issued_at, /^\d{4}-\d{2}-\d{2}T/);
    if (process.platform !== 'win32') assert.equal((await stat(f.attestationFile)).mode & 0o777, 0o600);

    const linkedConfig = join(f.outside, 'linked-config');
    await symlink(f.configDir, linkedConfig, process.platform === 'win32' ? 'junction' : 'dir');
    for (const changed of [
      { WINDOWS_CLAUDE_CONFIG_DIR: undefined },
      { WINDOWS_CLAUDE_CONFIG_DIR: 'relative-config' },
      { WINDOWS_CLAUDE_CONFIG_DIR: join(f.root, 'tests', 'integration') },
      { WINDOWS_CLAUDE_CONFIG_DIR: linkedConfig },
      { PROJECT_ROOT: join(f.root, 'tests', 'integration') },
      { PROJECT_ROOT: dirname(f.root) },
    ]) {
      const rejected = run(['--write-attestation', f.attestationFile], { ...hostEnvironment(f), ...changed });
      assert.notEqual(rejected.status, 0);
    }
  } finally { await rm(f.outside, { recursive: true, force: true }); }
});

test('Windows runtime gate rejects missing, tampered, stale, or host-path-mismatched attestations', async () => {
  const f = await fixture();
  try {
    await writeAttestation(f);
    const environment = {
      HOST_PROJECT_ROOT: f.root,
      HOST_WINDOWS_CLAUDE_CONFIG_DIR: f.configDir,
      WINDOWS_CLAUDE_CONFIG_DIR: f.configDir,
    };
    const ready = run(['--verify-attestation', f.attestationFile], environment);
    assert.equal(ready.status, 0, ready.stderr);
    assert.equal(ready.stdout.trim(), '{"status":"ready"}');

    for (const changed of [
      { HOST_PROJECT_ROOT: `${f.root}-tampered` },
      { HOST_WINDOWS_CLAUDE_CONFIG_DIR: `${f.configDir}-tampered` },
      { WINDOWS_CLAUDE_CONFIG_DIR: 'relative-config' },
    ]) assert.notEqual(run(['--verify-attestation', f.attestationFile], { ...environment, ...changed }).status, 0);

    const attestation = JSON.parse(await readFile(f.attestationFile, 'utf8'));
    attestation.config_dir = `${f.configDir}-tampered`;
    await writeFile(f.attestationFile, JSON.stringify(attestation));
    assert.notEqual(run(['--verify-attestation', f.attestationFile], environment).status, 0);
    attestation.config_dir = f.configDir;
    attestation.issued_at = '2000-01-01T00:00:00.000Z';
    await writeFile(f.attestationFile, JSON.stringify(attestation));
    assert.notEqual(run(['--verify-attestation', f.attestationFile], environment).status, 0);
  } finally { await rm(f.outside, { recursive: true, force: true }); }
});
