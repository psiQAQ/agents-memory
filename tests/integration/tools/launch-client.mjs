import { spawn } from 'node:child_process';
import { isAbsolute, join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { isMain } from './runtime-lib.mjs';
import { renderSettings } from './render-settings.mjs';

const clients = {
  claude: { command: 'claude', target: 'docker', config: ['.claude'] },
  opencode: { command: 'opencode', target: 'opencode', config: ['.config', 'opencode'] },
  pi: { command: 'pi', target: 'pi', config: ['.pi', 'agent'] },
};
const privateEnvironment = ['MEMORY_USER_KEY', 'TDAI_MEMORY_USER_KEY', 'MEMORY_TEAM_ID', 'MEMORY_AGENT_ID', 'MEMORY_TASK_ID', 'MEMORY_SESSION_ID'];
const categoryPatterns = [
  ['filesystem', [/^(?:error:\s*)?(?:EACCES|EPERM|ENOENT|EROFS)\b(?::.*)?$/im, /^(?:error:\s*)?(?:permission denied|read-only file system)(?::.*)?$/im]],
  ['settings', [/^(?:error:\s*)?(?:invalid (?:settings|configuration)|failed to (?:parse|load) (?:settings|configuration))(?:[.:].*)?$/im]],
  ['auth-onboarding', [/^(?:error:\s*)?(?:not logged in|please (?:run )?\/login|authentication required|api key (?:is )?(?:missing|required))(?:[.:].*)?$/im]],
  ['transport', [/^(?:error:\s*)?(?:connect\s+)?(?:ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT)\b(?::.*)?$/im, /^(?:error:\s*)?(?:fetch failed|connection refused)(?::.*)?$/im]],
  ['http4xx', [/^API Error:\s*(?:4\d\d|Request rejected \(4\d\d\))\s*$/im]],
  ['http5xx', [/^API Error:\s*(?:5\d\d|Request rejected \(5\d\d\))\s*$/im]],
];

async function prepareClient({ client, homeDir, bundleFile, spaceId, args, template, capture, parentEnvironment }) {
  const definition = clients[client];
  if (!definition) throw new Error('invalid client');
  if (![homeDir, bundleFile].every((path) => isAbsolute(path ?? '')) || bundleFile !== join(homeDir, '.memory', 'agent-bundle.json') || !Array.isArray(args) || args.some((argument) => typeof argument !== 'string') || (client === 'claude' && !isAbsolute(template ?? ''))) throw new Error('invalid launcher arguments');
  if (capture && (!Number.isInteger(capture.maxBytes) || capture.maxBytes < 1 || capture.maxBytes > 1024 * 1024
    || !Array.isArray(capture.sensitiveValues) || capture.sensitiveValues.some((value) => typeof value !== 'string' || value.length === 0))) throw new Error('invalid launcher arguments');
  const rendered = await renderSettings({ target: definition.target, template, configDir: join(homeDir, ...definition.config), bundleFile, bundleHomeDir: homeDir, homeDir, spaceId });
  const environment = { ...parentEnvironment };
  for (const name of privateEnvironment) delete environment[name];
  Object.assign(environment, rendered.environment, { TDAI_MEMORY_USER_KEY: rendered.environment.MEMORY_USER_KEY });
  return { definition, environment, rendered };
}

function classifyOutput(output) {
  const text = stripVTControlCharacters(output);
  const matches = categoryPatterns.filter(([, patterns]) => patterns.some((pattern) => pattern.test(text)));
  return matches.length === 1 ? matches[0][0] : 'unknown';
}

function captureChild(child, rendered, capture, timeoutMs, killGraceMs) {
  const chunks = [];
  let size = 0;
  let overflow = false;
  const collect = (chunk) => {
    const value = Buffer.from(chunk);
    size += value.length;
    if (size <= capture.maxBytes) chunks.push(value);
    else overflow = true;
  };
  if (!child.stdout?.on || !child.stderr?.on) return Promise.resolve({ phase: 'spawn-failure', category: 'none', outputPresent: false, code: null });
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  const sensitiveValues = [...new Set([...Object.values(rendered.environment), ...capture.sensitiveValues])];
  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    let timeoutTimer;
    let graceTimer;
    const finish = (basePhase, code = null) => {
      if (settled) return;
      settled = true;
      if (timeoutTimer !== undefined) clearTimeout(timeoutTimer);
      if (graceTimer !== undefined) clearTimeout(graceTimer);
      const outputPresent = size > 0;
      if (overflow) return resolve({ phase: 'overflow', category: 'none', outputPresent, code: null });
      const output = Buffer.concat(chunks).toString('utf8');
      if (sensitiveValues.some((value) => output.includes(value))) return resolve({ phase: 'sensitive-output', category: 'none', outputPresent, code: null });
      if (timedOut) return resolve({ phase: 'timeout', category: 'none', outputPresent, code: null });
      if (basePhase !== 'exit') return resolve({ phase: basePhase, category: 'none', outputPresent, code: null });
      if (code === 0) return resolve({ phase: 'cli-zero', category: 'none', outputPresent, code });
      return resolve({ phase: 'cli-nonzero', category: classifyOutput(output), outputPresent, code: code ?? 1 });
    };
    child.once('error', () => { if (!timedOut) finish('spawn-failure'); });
    child.once('close', (code, signal) => finish(signal ? 'signal' : 'exit', code));
    if (timeoutMs !== undefined) timeoutTimer = setTimeout(() => {
      timedOut = true;
      try { child.kill?.('SIGTERM'); } catch {}
      graceTimer = setTimeout(() => { try { child.kill?.('SIGKILL'); } catch {} }, killGraceMs);
    }, timeoutMs);
  });
}

export async function diagnoseClientLaunch({ client, homeDir, bundleFile, spaceId, args = [], template, capture, timeoutMs = 180000, killGraceMs = 5000, spawnProcess = spawn, parentEnvironment = process.env }) {
  if (!capture || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600000
    || !Number.isInteger(killGraceMs) || killGraceMs < 1 || killGraceMs > 60000) throw new Error('invalid launcher arguments');
  const prepared = await prepareClient({ client, homeDir, bundleFile, spaceId, args, template, capture, parentEnvironment });
  let child;
  try {
    child = spawnProcess(prepared.definition.command, args, { env: prepared.environment, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return { phase: 'spawn-failure', category: 'none', outputPresent: false };
  }
  const { phase, category, outputPresent } = await captureChild(child, prepared.rendered, capture, timeoutMs, killGraceMs);
  return { phase, category, outputPresent };
}

export async function launchClient({ client, homeDir, bundleFile, spaceId, args = [], template, capture, spawnProcess = spawn, parentEnvironment = process.env }) {
  const prepared = await prepareClient({ client, homeDir, bundleFile, spaceId, args, template, capture, parentEnvironment });
  const child = spawnProcess(prepared.definition.command, args, { env: prepared.environment, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
  if (capture) {
    const result = await captureChild(child, prepared.rendered, capture);
    if (result.phase === 'cli-zero' || result.phase === 'cli-nonzero') return result.code;
    throw new Error('client process failed');
  }
  return await new Promise((resolve, reject) => {
    child.once('error', () => reject(new Error('client process failed')));
    child.once('exit', (code, signal) => signal ? reject(new Error('client process failed')) : resolve(code ?? 1));
  });
}

function parse(argv) {
  const separator = argv.indexOf('--');
  const optionArguments = separator === -1 ? argv : argv.slice(0, separator);
  if (optionArguments.length % 2 !== 0) throw new Error('invalid arguments');
  const values = {};
  for (let index = 0; index < optionArguments.length; index += 2) {
    const name = optionArguments[index];
    if (!['--client', '--home-dir', '--bundle-file', '--space-id', '--template'].includes(name) || Object.hasOwn(values, name) || !optionArguments[index + 1]) throw new Error('invalid arguments');
    values[name] = optionArguments[index + 1];
  }
  return { values, clientArguments: separator === -1 ? [] : argv.slice(separator + 1) };
}

if (isMain(import.meta)) {
  try {
    const { values, clientArguments } = parse(process.argv.slice(2));
    process.exitCode = await launchClient({
      client: values['--client'],
      homeDir: values['--home-dir'],
      bundleFile: values['--bundle-file'],
      spaceId: values['--space-id'] ?? process.env.MEMORY_SPACE_ID,
      template: values['--template'],
      args: clientArguments,
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
