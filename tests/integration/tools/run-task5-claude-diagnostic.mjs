import { spawnSync } from 'node:child_process';
import { chmod, lstat, mkdir } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { isMain } from './runtime-lib.mjs';

const failureMessage = 'Task 5 Claude diagnostic coordinator failed';
const composeFiles = [
  'compose.four-cli.yaml',
  'compose.four-cli.mock.yaml',
  'compose.four-cli.claude.yaml',
  'compose.four-cli.diagnostic.yaml',
];
const resultKeys = [
  'status', 'launch', 'launch_phase', 'launch_category', 'output_present',
  'proxy_dns_ok', 'proxy_tcp_ok', 'continuity', 'sequence_delta', 'total_delta',
  'expected_operation_present', 'expected_operation_valid', 'expected_main_count',
  'unexpected_operation_count', 'unexpected_path_count', 'unsafe', 'dropped', 'truncated',
];
const inheritedEnvironment = [
  'PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP',
  'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH',
];

function defaultSpawnCompose(args, options) {
  return spawnSync('docker', args, options);
}

function inheritedChildEnvironment(environment) {
  const result = {};
  for (const name of inheritedEnvironment) if (typeof environment[name] === 'string') result[name] = environment[name];
  return result;
}

function spawnOptions(environment) {
  return { env: environment, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 256 * 1024 };
}

async function prepare(environment, integrationRoot, spawnCompose) {
  const runId = environment.RUN_ID;
  const project = environment.COMPOSE_PROJECT_NAME;
  const evidenceDir = environment.EVIDENCE_DIR;
  const gateway = environment.MEMORY_CORE_GATEWAY_API_KEY;
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(runId ?? '')
    || project !== `refine-memory-${runId}` || !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(project ?? '')
    || !isAbsolute(evidenceDir ?? '') || basename(resolve(evidenceDir)) !== runId
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/.test(gateway ?? '') || !isAbsolute(integrationRoot ?? '')) throw new Error();
  try {
    await lstat(evidenceDir);
    throw new Error();
  } catch (error) {
    if (error?.code !== 'ENOENT') throw new Error();
  }
  const parent = await lstat(dirname(evidenceDir));
  if (!parent.isDirectory() || parent.isSymbolicLink()) throw new Error();

  const label = `label=com.docker.compose.project=${project}`;
  for (const args of [
    ['container', 'ls', '--all', '--quiet', '--filter', label],
    ['network', 'ls', '--quiet', '--filter', label],
    ['volume', 'ls', '--quiet', '--filter', label],
  ]) {
    const result = await spawnCompose(args, spawnOptions(inheritedChildEnvironment(environment)));
    if (result?.status !== 0 || typeof result.stdout !== 'string' || result.stdout.trim() !== '') throw new Error();
  }
  await mkdir(evidenceDir, { mode: 0o700 });
  await chmod(evidenceDir, 0o700);
}

function childEnvironment(environment) {
  const result = inheritedChildEnvironment(environment);
  for (const name of ['RUN_ID', 'COMPOSE_PROJECT_NAME', 'EVIDENCE_DIR', 'MEMORY_CORE_GATEWAY_API_KEY']) result[name] = environment[name];
  result.COMPOSE_DISABLE_ENV_FILE = '1';
  return result;
}

function fixedActions() {
  return [
    { args: ['up', '-d', '--wait', '--wait-timeout', '180', '--no-build', 'mock-llm', 'memory-core', 'memory-proxy', 'memory-hub'], environment: {} },
    { args: ['run', '--rm', '--no-deps', 'bootstrap'], environment: {} },
    { args: ['run', '--rm', '--no-deps', 'claude-config'], environment: {} },
    { args: ['run', '--rm', '--no-deps', 'claude-headless'], environment: { STAGE1_CLIENT_SCENARIO: 'write' } },
  ];
}

function canonicalResult(stdout) {
  if (typeof stdout !== 'string' || stdout.length === 0 || stdout.includes('\r')) throw new Error();
  const text = stdout.endsWith('\n') ? stdout.slice(0, -1) : stdout;
  if (text.length === 0 || text.includes('\n')) throw new Error();
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...resultKeys].sort())) throw new Error();

  if (value.status !== 'classified' || !['not_run', 'code0', 'nonzero', 'throw'].includes(value.launch)
    || !['not-run', 'cli-zero', 'cli-nonzero', 'spawn-failure', 'signal', 'timeout', 'overflow', 'sensitive-output', 'setup-error'].includes(value.launch_phase)
    || !['none', 'filesystem', 'settings', 'auth-onboarding', 'transport', 'http4xx', 'http5xx', 'unknown'].includes(value.launch_category)
    || !['ok', 'failed'].includes(value.continuity)) throw new Error();
  for (const name of ['sequence_delta', 'total_delta', 'expected_main_count', 'unexpected_operation_count', 'unexpected_path_count', 'dropped']) {
    if (!Number.isSafeInteger(value[name])) throw new Error();
  }
  for (const name of ['output_present', 'proxy_dns_ok', 'proxy_tcp_ok', 'expected_operation_present', 'expected_operation_valid', 'unsafe', 'truncated']) {
    if (typeof value[name] !== 'boolean') throw new Error();
  }
  const launchValid = (value.launch === 'not_run' && value.launch_phase === 'not-run' && value.launch_category === 'none' && !value.output_present && !value.proxy_dns_ok && !value.proxy_tcp_ok)
    || (value.launch === 'code0' && value.launch_phase === 'cli-zero' && value.launch_category === 'none')
    || (value.launch === 'nonzero' && value.launch_phase === 'cli-nonzero' && value.launch_category !== 'none')
    || (value.launch === 'throw' && ['spawn-failure', 'signal', 'timeout', 'overflow', 'sensitive-output', 'setup-error'].includes(value.launch_phase) && value.launch_category === 'none');
  if (!launchValid || (value.proxy_tcp_ok && !value.proxy_dns_ok)
    || (!['none', 'unknown'].includes(value.launch_category) && !value.output_present)
    || (['overflow', 'sensitive-output'].includes(value.launch_phase) && !value.output_present)
    || (value.launch_phase === 'setup-error' && value.output_present)
    || value.expected_main_count < 0 || value.unexpected_operation_count < 0 || value.unexpected_path_count < 0 || value.dropped < 0
    || (value.continuity === 'failed' && (value.sequence_delta !== -1 || value.total_delta !== -1
      || value.expected_operation_present || value.expected_operation_valid || value.expected_main_count !== 0
      || value.unexpected_operation_count !== 0 || value.unexpected_path_count !== 0))
    || (value.continuity === 'ok' && (value.sequence_delta < 0 || value.sequence_delta !== value.total_delta || value.launch === 'not_run'))
    || (value.expected_operation_valid && (!value.expected_operation_present || value.expected_main_count !== 1))
    || (!value.expected_operation_present && (value.expected_operation_valid || value.expected_main_count !== 0))
    || (value.expected_operation_present && value.total_delta < 1)
    || value.expected_main_count > Math.max(value.total_delta, 0)) throw new Error();

  const canonical = JSON.stringify(Object.fromEntries(resultKeys.map((name) => [name, value[name]])));
  if (text !== canonical) throw new Error();
  return canonical;
}

async function run({ environment, integrationRoot, spawnCompose }) {
  await prepare(environment, integrationRoot, spawnCompose);
  const prefix = ['compose', '--project-directory', integrationRoot, '--profile', 'mock', '--profile', 'claude'];
  for (const file of composeFiles) prefix.push('-f', join(integrationRoot, file));
  const baseEnvironment = childEnvironment(environment);
  let finalResult;
  for (const [index, action] of fixedActions().entries()) {
    const result = await spawnCompose([...prefix, ...action.args], spawnOptions({ ...baseEnvironment, ...action.environment }));
    if (result?.status !== 0) throw new Error();
    if (index === 3) finalResult = canonicalResult(result.stdout);
  }
  return finalResult;
}

export async function runTask5ClaudeDiagnostic({
  environment = process.env,
  integrationRoot = resolve(import.meta.dirname, '..'),
  spawnCompose = defaultSpawnCompose,
} = {}) {
  try { return await run({ environment, integrationRoot, spawnCompose }); }
  catch { throw new Error(failureMessage); }
}

if (isMain(import.meta)) {
  try {
    if (process.argv.length !== 2) throw new Error();
    process.stdout.write(`${await runTask5ClaudeDiagnostic()}\n`);
  } catch {
    process.stderr.write(`${failureMessage}\n`);
    process.exitCode = 1;
  }
}
