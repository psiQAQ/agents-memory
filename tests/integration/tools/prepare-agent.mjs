import { chmod, chown, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { isMain } from './runtime-lib.mjs';

const agents = new Set(['agent-a', 'agent-b', 'agent-c']);
const keyPattern = /^sk-mem-[A-Za-z0-9_-]{32}$/;

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    if (!name?.startsWith('--') || result[name] || !argv[index + 1]) throw new Error('invalid arguments');
    result[name] = argv[index + 1];
  }
  return result;
}

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

async function setOwnership(path, uid, gid, mode) {
  await chmod(path, mode);
  if (process.platform !== 'win32') await chown(path, uid, gid);
}

export async function prepareAgent({ agent, stateDir, homeDir, uid = 10001, gid = 10001 }) {
  if (!agents.has(agent)) throw new Error('invalid agent');
  if (![stateDir, homeDir].every((path) => isAbsolute(path ?? '') && dirname(path) !== path) || isInside(stateDir, homeDir) || isInside(homeDir, stateDir)) throw new Error('invalid path');
  if (![uid, gid].every((value) => Number.isSafeInteger(value) && value >= 0)) throw new Error('invalid owner');

  let key;
  try { key = (await readFile(join(stateDir, 'credentials', `${agent}.user-key`), 'utf8')).replace(/\r?\n$/, ''); }
  catch { throw new Error('invalid credential'); }
  if (!keyPattern.test(key)) throw new Error('invalid credential');

  const memoryDir = join(homeDir, '.memory');
  const destination = join(memoryDir, 'user-key');
  const temporary = join(memoryDir, `.user-key.${process.pid}.${randomUUID()}.tmp`);
  try {
    await mkdir(memoryDir, { recursive: true, mode: 0o700 });
    await setOwnership(homeDir, uid, gid, 0o700);
    await setOwnership(memoryDir, uid, gid, 0o700);
    await writeFile(temporary, `${key}\n`, { encoding: 'utf8', mode: 0o600 });
    await setOwnership(temporary, uid, gid, 0o600);
    await rename(temporary, destination);
    await setOwnership(destination, uid, gid, 0o600);
  } catch {
    await unlink(temporary).catch(() => {});
    throw new Error('cannot prepare agent credential');
  }
}

if (isMain(import.meta)) {
  try {
    const values = parseArgs(process.argv.slice(2));
    await prepareAgent({ agent: values['--agent'], stateDir: values['--state-dir'], homeDir: values['--home-dir'] });
    process.stdout.write('{"status":"ok"}\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
