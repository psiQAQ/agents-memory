import { spawn } from 'node:child_process';
import { isAbsolute, join } from 'node:path';
import { isMain } from './runtime-lib.mjs';
import { renderSettings } from './render-settings.mjs';

const clients = {
  claude: { command: 'claude', target: 'docker', config: ['.claude'] },
  opencode: { command: 'opencode', target: 'opencode', config: ['.config', 'opencode'] },
  pi: { command: 'pi', target: 'pi', config: ['.pi', 'agent'] },
};
const privateEnvironment = ['MEMORY_USER_KEY', 'MEMORY_TEAM_ID', 'MEMORY_AGENT_ID', 'MEMORY_TASK_ID', 'MEMORY_SESSION_ID'];

export async function launchClient({ client, homeDir, bundleFile, spaceId, args = [], template, capture, spawnProcess = spawn, parentEnvironment = process.env }) {
  const definition = clients[client];
  if (!definition) throw new Error('invalid client');
  if (![homeDir, bundleFile].every((path) => isAbsolute(path ?? '')) || bundleFile !== join(homeDir, '.memory', 'agent-bundle.json') || !Array.isArray(args) || args.some((argument) => typeof argument !== 'string') || (client === 'claude' && !isAbsolute(template ?? ''))) throw new Error('invalid launcher arguments');
  if (capture && (!Number.isInteger(capture.maxBytes) || capture.maxBytes < 1 || capture.maxBytes > 1024 * 1024
    || !Array.isArray(capture.sensitiveValues) || capture.sensitiveValues.some((value) => typeof value !== 'string' || value.length === 0))) throw new Error('invalid launcher arguments');
  const rendered = await renderSettings({ target: definition.target, template, configDir: join(homeDir, ...definition.config), bundleFile, bundleHomeDir: homeDir, homeDir, spaceId });
  const environment = { ...parentEnvironment };
  for (const name of privateEnvironment) delete environment[name];
  Object.assign(environment, rendered.environment);
  const child = spawnProcess(definition.command, args, { env: environment, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
  if (capture) {
    const chunks = [];
    let size = 0;
    let overflow = false;
    const collect = (chunk) => {
      const value = Buffer.from(chunk);
      size += value.length;
      if (size <= capture.maxBytes) chunks.push(value);
      else overflow = true;
    };
    if (!child.stdout?.on || !child.stderr?.on) throw new Error('client process failed');
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const sensitiveValues = [...new Set([...Object.values(rendered.environment), ...capture.sensitiveValues])];
    return await new Promise((resolve, reject) => {
      child.once('error', () => reject(new Error('client process failed')));
      child.once('close', (code, signal) => {
        const output = overflow ? '' : Buffer.concat(chunks).toString('utf8');
        if (signal || overflow || sensitiveValues.some((value) => output.includes(value))) reject(new Error('client process failed'));
        else resolve(code ?? 1);
      });
    });
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
