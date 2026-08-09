import { chmod, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isMain } from './runtime-lib.mjs';

const keyPattern = /^sk-mem-[A-Za-z0-9_-]{32}$/;
const urls = {
  docker: 'http://memory-proxy:8096/claude-code',
  windows: 'http://127.0.0.1:8096/claude-code',
};
const writes = new Map();

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
  const { target, template, configDir, keyFile, spaceId = 'default' } = options;
  if (!urls[target]) throw new Error('invalid target');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(spaceId) || spaceId.includes('..')) throw new Error('invalid space-id');
  if (![template, configDir, keyFile].every(isAbsolute)) throw new Error('invalid path');
  let source;
  let parsed;
  try { source = await readFile(template, 'utf8'); parsed = JSON.parse(source); } catch { throw new Error('invalid template'); }
  if ((source.match(/__MEMORY_PROXY_BASE_URL__/g) ?? []).length !== 1 || hasCredential(parsed)) throw new Error('invalid template');
  let key;
  try { key = await readFile(keyFile, 'utf8'); } catch { throw new Error('invalid memory-user-key-file'); }
  key = key.replace(/\r?\n$/, '');
  if (!keyPattern.test(key)) throw new Error('invalid memory-user-key-file');
  const rendered = source.replace('__MEMORY_PROXY_BASE_URL__', `${urls[target]}/${spaceId}`);
  if (/__[A-Z0-9_]+__/.test(rendered)) throw new Error('invalid template');
  let output;
  try { output = JSON.parse(rendered); } catch { throw new Error('invalid template'); }
  if (!output.env || typeof output.env !== 'object' || Array.isArray(output.env)) throw new Error('invalid template');
  output.env.ANTHROPIC_AUTH_TOKEN = key;
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
    await renderSettings({ target: value['--target'], template: value['--template'], configDir: value['--config-dir'], keyFile: value['--memory-user-key-file'], spaceId: value['--space-id'] });
    process.stdout.write(JSON.stringify({ status: 'ok', target: value['--target'] }) + '\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
