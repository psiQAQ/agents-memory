import { spawnSync } from 'node:child_process';
import { chmod, lstat, mkdir } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { isMain } from './runtime-lib.mjs';

const composeFiles = [
  'compose.four-cli.yaml',
  'compose.four-cli.mock.yaml',
  'compose.four-cli.claude.yaml',
  'compose.four-cli.opencode.yaml',
  'compose.four-cli.pi.yaml',
  'compose.four-cli.management.yaml',
];
const profiles = ['mock', 'management', 'claude', 'opencode', 'pi'];
const inheritedEnvironment = [
  'PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP',
  'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH',
];

function defaultSpawnCompose(args, options) {
  return spawnSync('docker', args, { ...options, encoding: 'utf8', maxBuffer: 256 * 1024 });
}

function childEnvironment(environment) {
  const result = {};
  for (const name of inheritedEnvironment) if (typeof environment[name] === 'string') result[name] = environment[name];
  for (const name of ['RUN_ID', 'COMPOSE_PROJECT_NAME', 'EVIDENCE_DIR', 'MEMORY_CORE_GATEWAY_API_KEY']) result[name] = environment[name];
  return result;
}

async function prepare(environment, integrationRoot) {
  const runId = environment.RUN_ID;
  const project = environment.COMPOSE_PROJECT_NAME;
  const evidenceDir = environment.EVIDENCE_DIR;
  const gateway = environment.MEMORY_CORE_GATEWAY_API_KEY;
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(runId ?? '') || !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(project ?? '')
    || !isAbsolute(evidenceDir ?? '') || basename(resolve(evidenceDir)) !== runId
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/.test(gateway ?? '') || !isAbsolute(integrationRoot ?? '')) {
    throw new Error('invalid Task 5 Mock launcher environment');
  }
  try {
    await lstat(evidenceDir);
    throw new Error();
  } catch (error) {
    if (error?.code !== 'ENOENT') throw new Error('invalid Task 5 Mock launcher environment');
  }
  try {
    const parent = await lstat(dirname(evidenceDir));
    if (!parent.isDirectory() || parent.isSymbolicLink()) throw new Error();
    await mkdir(evidenceDir, { mode: 0o700 });
    await chmod(evidenceDir, 0o700);
  } catch { throw new Error('invalid Task 5 Mock launcher environment'); }
}

function actions() {
  const run = (service, environment = {}) => ({ args: ['run', '--rm', '--no-deps', '--no-build', service], environment });
  return [
    { args: ['up', '-d', '--wait', '--wait-timeout', '180', '--no-build', 'mock-llm', 'memory-core', 'memory-proxy', 'memory-hub'], environment: {} },
    run('bootstrap'),
    run('claude-config'),
    run('opencode-config'),
    run('pi-config'),
    run('stage1-gate', { STAGE1_SCENARIO: 'protocol-leak' }),
    run('stage1-gate', { STAGE1_SCENARIO: 'management' }),
    run('claude-headless', { STAGE1_CLIENT_SCENARIO: 'write' }),
    run('opencode-headless', { STAGE1_CLIENT_SCENARIO: 'write' }),
    run('pi-headless', { STAGE1_CLIENT_SCENARIO: 'write' }),
    run('claude-headless', { STAGE1_CLIENT_SCENARIO: 'read', STAGE1_OWNER: 'opencode' }),
    run('claude-headless', { STAGE1_CLIENT_SCENARIO: 'read', STAGE1_OWNER: 'pi' }),
    run('opencode-headless', { STAGE1_CLIENT_SCENARIO: 'read', STAGE1_OWNER: 'claude' }),
    run('opencode-headless', { STAGE1_CLIENT_SCENARIO: 'read', STAGE1_OWNER: 'pi' }),
    run('pi-headless', { STAGE1_CLIENT_SCENARIO: 'read', STAGE1_OWNER: 'claude' }),
    run('pi-headless', { STAGE1_CLIENT_SCENARIO: 'read', STAGE1_OWNER: 'opencode' }),
    run('stage1-gate', { STAGE1_SCENARIO: 'finalize' }),
  ];
}

export async function runTask5Mock({ environment = process.env, integrationRoot = resolve(import.meta.dirname, '..'), spawnCompose = defaultSpawnCompose } = {}) {
  await prepare(environment, integrationRoot);
  const prefix = ['compose', '--project-directory', integrationRoot];
  for (const profile of profiles) prefix.push('--profile', profile);
  for (const file of composeFiles) prefix.push('-f', join(integrationRoot, file));
  const baseEnvironment = childEnvironment(environment);
  const steps = actions();
  for (const [index, step] of steps.entries()) {
    let result;
    try {
      result = await spawnCompose([...prefix, ...step.args], {
        env: { ...baseEnvironment, ...step.environment },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch { throw new Error(`Task 5 Mock launcher failed step=${index + 1}`); }
    if (result?.status !== 0) throw new Error(`Task 5 Mock launcher failed step=${index + 1}`);
  }
  return { status: 'ok', steps: steps.length };
}

if (isMain(import.meta)) {
  try {
    if (process.argv.length !== 2) throw new Error();
    const result = await runTask5Mock();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch {
    process.stderr.write('Task 5 Mock launcher failed\n');
    process.exitCode = 1;
  }
}
