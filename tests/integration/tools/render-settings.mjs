import { chmod, lstat, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isMain } from './runtime-lib.mjs';

const keyPattern = /^sk-mem-[A-Za-z0-9_-]{32}$/;
const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const urls = {
  docker: 'http://memory-proxy:8096/claude-code',
  windows: 'http://127.0.0.1:8096/claude-code',
};
const toolUrls = {
  docker: 'http://memory-proxy:8096',
  windows: 'http://127.0.0.1:8096',
};
const writes = new Map();

function validDisplayName(value) {
  return typeof value === 'string' && value.length <= 128 && value === value.trim() && value.length > 0 && !/[:\r\n\x00-\x1f\x7f]/.test(value);
}

function args(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    if (!name?.startsWith('--') || result[name] || !argv[index + 1]) throw new Error('invalid arguments');
    result[name] = argv[index + 1];
  }
  return result;
}

function hasCredential(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([name, child]) => /(?:auth.*token|api.*key|deepseek|credential|secret|(?:^|_)key$)/i.test(name) || hasCredential(child));
}

export async function renderSettings(options) {
  const { target, template, configDir, bundleFile, spaceId = 'default' } = options;
  if (!urls[target]) throw new Error('invalid target');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(spaceId) || spaceId.includes('..')) throw new Error('invalid space-id');
  if (![template, configDir, bundleFile].every((path) => isAbsolute(path ?? ''))) throw new Error('invalid path');
  let source;
  let parsed;
  try { source = await readFile(template, 'utf8'); parsed = JSON.parse(source); } catch { throw new Error('invalid template'); }
  if ((source.match(/__MEMORY_PROXY_BASE_URL__/g) ?? []).length !== 1 || !parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !parsed.env || typeof parsed.env !== 'object' || Array.isArray(parsed.env) || parsed.env.ANTHROPIC_BASE_URL !== '__MEMORY_PROXY_BASE_URL__' || parsed.env.TDAI_MEMORY_PROXY_BASE_URL !== undefined || hasCredential(parsed)) throw new Error('invalid template');
  let bundle;
  try {
    const metadata = await lstat(bundleFile);
    if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1 || metadata.size > 16384) throw new Error();
    bundle = JSON.parse(await readFile(bundleFile, 'utf8'));
  } catch { throw new Error('invalid agent-bundle-file'); }
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle) || Object.keys(bundle).sort().join() !== 'identity,memory_user_key' || !keyPattern.test(bundle.memory_user_key)) throw new Error('invalid agent-bundle-file');
  const key = bundle.memory_user_key;
  const identity = bundle.identity;
  const identityFields = ['service_id', 'team_id', 'user_id', 'agent_id', 'task_id', 'session_id', 'display_name'];
  const idFields = identityFields.filter((name) => name !== 'display_name');
  if (!identity || typeof identity !== 'object' || Array.isArray(identity) || Object.keys(identity).sort().join() !== [...identityFields].sort().join() || identity.service_id !== spaceId || !idFields.every((name) => identityPattern.test(identity[name])) || !validDisplayName(identity.display_name)) throw new Error('invalid agent-bundle-file');
  const expectedBaseUrl = `${urls[target]}/${spaceId}`;
  const rendered = source.replace('__MEMORY_PROXY_BASE_URL__', expectedBaseUrl);
  if (/__[A-Z0-9_]+__/.test(rendered)) throw new Error('invalid template');
  let output;
  try { output = JSON.parse(rendered); } catch { throw new Error('invalid template'); }
  if (!output.env || typeof output.env !== 'object' || Array.isArray(output.env) || output.env.ANTHROPIC_BASE_URL !== expectedBaseUrl) throw new Error('invalid template');
  output.env.ANTHROPIC_AUTH_TOKEN = key;
  output.env.TDAI_MEMORY_PROXY_BASE_URL = toolUrls[target];
  output.env.ANTHROPIC_CUSTOM_HEADERS = [
    `x-team-id: ${identity.team_id}`,
    `x-agent-id: ${identity.agent_id}`,
    `x-task-id: ${identity.task_id}`,
    `x-conversation-id: ${identity.session_id}`,
  ].join('\n');
  const destination = join(configDir, 'settings.json');
  const temporary = join(configDir, `.settings.${process.pid}.${randomUUID()}.tmp`);
  try {
    await mkdir(configDir, { recursive: true, mode: 0o700 }).catch(async () => {
      if (!(await stat(configDir)).isDirectory()) throw new Error('not a directory');
    });
    const previous = writes.get(destination) ?? Promise.resolve();
    const write = previous.catch(() => {}).then(async () => {
      await writeFile(temporary, JSON.stringify(output, null, 2), { encoding: 'utf8', mode: 0o600 });
      await chmod(temporary, 0o600).catch(() => {});
      await rename(temporary, destination);
      await chmod(destination, 0o600).catch(() => {});
    });
    writes.set(destination, write);
    try { await write; } finally { if (writes.get(destination) === write) writes.delete(destination); }
  } catch {
    await unlink(temporary).catch(() => {});
    throw new Error('cannot write settings');
  }
}

if (isMain(import.meta)) {
  try {
    const value = args(process.argv.slice(2));
    await renderSettings({ target: value['--target'], template: value['--template'], configDir: value['--config-dir'], bundleFile: value['--agent-bundle-file'], spaceId: value['--space-id'] });
    process.stdout.write(JSON.stringify({ status: 'ok', target: value['--target'] }) + '\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
