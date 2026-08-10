import { chmod, chown, lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { isMain } from './runtime-lib.mjs';
import { validateManifest } from './test-runner.mjs';

const agents = new Set(['agent-a', 'agent-b', 'agent-c', 'claude', 'opencode', 'pi']);
const keyPattern = /^sk-mem-[A-Za-z0-9_-]{32}$/;
const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function validDisplayName(value) {
  return typeof value === 'string' && value.length <= 128 && value === value.trim() && value.length > 0 && !/[:\r\n\x00-\x1f\x7f]/.test(value);
}

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

async function safeDirectory(path, allowMissing = false) {
  let metadata;
  try { metadata = await lstat(path); }
  catch (error) {
    if (allowMissing && error?.code === 'ENOENT') return false;
    throw new Error('unsafe path');
  }
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error('unsafe path');
  return true;
}

async function safeRegularFile(path, errorMessage, allowMissing = false) {
  let metadata;
  try { metadata = await lstat(path); }
  catch (error) {
    if (allowMissing && error?.code === 'ENOENT') return false;
    throw new Error(errorMessage);
  }
  if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1) throw new Error(errorMessage);
  return true;
}

export async function prepareAgent({ agent, stateDir, homeDir, spaceId, uid = 10001, gid = 10001, renameFile = rename }) {
  if (!agents.has(agent)) throw new Error('invalid agent');
  if (![stateDir, homeDir].every((path) => isAbsolute(path ?? '') && dirname(path) !== path) || isInside(stateDir, homeDir) || isInside(homeDir, stateDir)) throw new Error('invalid path');
  if (![uid, gid].every((value) => Number.isSafeInteger(value) && value >= 0)) throw new Error('invalid owner');

  const credentialsDir = join(stateDir, 'credentials');
  const credentialFile = join(credentialsDir, `${agent}.user-key`);
  const manifestFile = join(stateDir, 'run-manifest.json');
  await safeDirectory(stateDir);
  await safeDirectory(credentialsDir);
  await safeRegularFile(credentialFile, 'unsafe credential');
  await safeRegularFile(manifestFile, 'unsafe manifest');

  let key;
  try { key = (await readFile(credentialFile, 'utf8')).replace(/\r?\n$/, ''); }
  catch { throw new Error('invalid credential'); }
  if (!keyPattern.test(key)) throw new Error('invalid credential');

  let manifest;
  try { manifest = validateManifest(JSON.parse(await readFile(manifestFile, 'utf8')), stateDir); }
  catch { throw new Error('invalid manifest'); }
  const client = manifest.clients[agent];
  const identity = {
    service_id: manifest.service_id,
    team_id: manifest.team_id,
    user_id: client?.user_id,
    agent_id: client?.agent_id,
    task_id: manifest.task_id,
    session_id: client?.session_id,
    display_name: client?.display_name,
  };
  const idFields = ['service_id', 'team_id', 'user_id', 'agent_id', 'task_id', 'session_id'];
  if (!identityPattern.test(spaceId ?? '') || identity.service_id !== spaceId || client?.credential_file !== `credentials/${agent}.user-key` || !idFields.every((name) => identityPattern.test(identity[name])) || !validDisplayName(identity.display_name)) throw new Error('invalid identity');

  const memoryDir = join(homeDir, '.memory');
  const destination = join(memoryDir, 'agent-bundle.json');
  const temporary = join(memoryDir, `.agent-bundle.${process.pid}.${randomUUID()}.tmp`);
  await safeDirectory(homeDir);
  if (!(await safeDirectory(memoryDir, true))) {
    try { await mkdir(memoryDir, { mode: 0o700 }); } catch { throw new Error('unsafe path'); }
    await safeDirectory(memoryDir);
  }
  await safeRegularFile(destination, 'unsafe path', true);
  try {
    await setOwnership(homeDir, uid, gid, 0o700);
    await setOwnership(memoryDir, uid, gid, 0o700);
    await writeFile(temporary, `${JSON.stringify({ memory_user_key: key, identity }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await safeRegularFile(temporary, 'unsafe path');
    await setOwnership(temporary, uid, gid, 0o600);
    await renameFile(temporary, destination);
  } catch {
    await unlink(temporary).catch(() => {});
    throw new Error('cannot prepare agent bundle');
  }
}

if (isMain(import.meta)) {
  try {
    const values = parseArgs(process.argv.slice(2));
    await prepareAgent({ agent: values['--agent'], stateDir: values['--state-dir'], homeDir: values['--home-dir'], spaceId: values['--space-id'] });
    process.stdout.write('{"status":"ok"}\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
