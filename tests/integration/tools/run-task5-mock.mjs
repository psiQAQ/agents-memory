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

function inheritedChildEnvironment(environment) {
  const result = {};
  for (const name of inheritedEnvironment) if (typeof environment[name] === 'string') result[name] = environment[name];
  return result;
}

function childEnvironment(environment) {
  const result = inheritedChildEnvironment(environment);
  for (const name of ['RUN_ID', 'COMPOSE_PROJECT_NAME', 'EVIDENCE_DIR', 'MEMORY_CORE_GATEWAY_API_KEY']) result[name] = environment[name];
  return result;
}

async function assertProjectFresh(project, environment, spawnDocker) {
  const label = `label=com.docker.compose.project=${project}`;
  const probes = [
    ['container', 'ls', '--all', '--quiet', '--filter', label],
    ['network', 'ls', '--quiet', '--filter', label],
    ['volume', 'ls', '--quiet', '--filter', label],
  ];
  for (const args of probes) {
    let result;
    try {
      result = await spawnDocker(args, { env: inheritedChildEnvironment(environment), stdio: ['ignore', 'pipe', 'pipe'] });
    } catch { throw new Error('Task 5 Mock launcher project freshness check failed'); }
    if (result?.status !== 0 || typeof result.stdout !== 'string') throw new Error('Task 5 Mock launcher project freshness check failed');
    if (result.stdout.trim() !== '') throw new Error('Task 5 Mock launcher project is not fresh');
  }
}

async function prepare(environment, integrationRoot, spawnDocker) {
  const runId = environment.RUN_ID;
  const project = environment.COMPOSE_PROJECT_NAME;
  const evidenceDir = environment.EVIDENCE_DIR;
  const gateway = environment.MEMORY_CORE_GATEWAY_API_KEY;
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(runId ?? '') || !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(project ?? '')
    || project !== `refine-memory-${runId}`
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
  } catch { throw new Error('invalid Task 5 Mock launcher environment'); }
  await assertProjectFresh(project, environment, spawnDocker);
  try {
    await mkdir(evidenceDir, { mode: 0o700 });
    await chmod(evidenceDir, 0o700);
  } catch { throw new Error('invalid Task 5 Mock launcher environment'); }
}

function actions() {
  const run = (service, environment = {}) => ({ args: ['run', '--rm', '--no-deps', service], environment });
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
  await prepare(environment, integrationRoot, spawnCompose);
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

export function formatTask5MockFailure(error) {
  const message = error instanceof Error ? error.message : '';
  return /^Task 5 Mock launcher failed step=(?:[1-9]|1[0-7])$/.test(message)
    ? `${message}\n`
    : 'Task 5 Mock launcher failed\n';
}

if (isMain(import.meta)) {
  try {
    if (process.argv.length !== 2) throw new Error();
    const result = await runTask5Mock();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(formatTask5MockFailure(error));
    process.exitCode = 1;
  }
}
