import { chmod, chown, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { isMain } from '../tools/runtime-lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const gatewayPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/;

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    if (!name?.startsWith('--') || result[name] || argv[index + 1] === undefined) throw new Error('invalid arguments');
    result[name] = argv[index + 1];
  }
  return result;
}

async function protect(path, mode, owner) {
  await chmod(path, mode);
  if (owner && process.platform !== 'win32') await chown(path, owner.uid, owner.gid);
}

async function atomicWrite(path, content, mode, owner) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { encoding: 'utf8', mode });
    await protect(temporary, mode, owner);
    await rename(temporary, path);
    await protect(path, mode, owner);
  } catch {
    await unlink(temporary).catch(() => {});
    throw new Error('cannot write config');
  }
}

function inside(parent, child) {
  const path = relative(resolve(parent), resolve(child));
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

export async function renderConfig({ outDir, proxyOutDir, gatewayKey, spaceId = 'default', mode = 'mock', secretFile, proxyUid = 10001, proxyGid = 10001 }) {
  if (!isAbsolute(outDir ?? '') || !gatewayPattern.test(gatewayKey ?? '') || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(spaceId) || spaceId.includes('..') || !['mock', 'real'].includes(mode)) throw new Error('invalid config inputs');
  const proxyRoot = mode === 'mock' ? outDir : proxyOutDir;
  if (!isAbsolute(proxyRoot ?? '') || (mode === 'real' && (inside(outDir, proxyRoot) || inside(proxyRoot, outDir)))) throw new Error('invalid config inputs');
  const [core, proxy] = await Promise.all([
    readFile(join(here, `core.${mode}.yaml.template`), 'utf8'),
    readFile(join(here, `proxy.${mode}.yaml.template`), 'utf8'),
  ]);
  const placeholder = '__MEMORY_CORE_GATEWAY_API_KEY__';
  if ((proxy.match(new RegExp(placeholder, 'g')) ?? []).length !== 4) throw new Error('invalid config template');
  const spacePlaceholder = '__MEMORY_SPACE_ID__';
  if ((proxy.match(new RegExp(spacePlaceholder, 'g')) ?? []).length !== 3) throw new Error('invalid config template');
  let renderedProxy = proxy.replaceAll(placeholder, gatewayKey).replaceAll(spacePlaceholder, spaceId);
  let proxyOwner;
  let proxyMode = 0o644;
  const modelPlaceholder = '__DEEPSEEK_PROXY_API_KEY_JSON__';
  if (mode === 'real') {
    if (!isAbsolute(secretFile ?? '') || ![proxyUid, proxyGid].every((value) => Number.isSafeInteger(value) && value >= 0)) throw new Error('invalid config inputs');
    let modelKey;
    try { modelKey = (await readFile(secretFile, 'utf8')).replace(/\r?\n$/, ''); } catch { throw new Error('invalid model secret'); }
    if (!modelKey || modelKey.trim() !== modelKey || /[\r\n]/.test(modelKey) || (renderedProxy.match(new RegExp(modelPlaceholder, 'g')) ?? []).length !== 1) throw new Error('invalid model secret');
    renderedProxy = renderedProxy.replace(modelPlaceholder, JSON.stringify(modelKey));
    proxyMode = 0o600;
    proxyOwner = { uid: proxyUid, gid: proxyGid };
  } else if (renderedProxy.includes(modelPlaceholder)) {
    throw new Error('invalid config template');
  }
  if (/__[A-Z0-9_]+__/.test(`${core}${renderedProxy}`)) throw new Error('invalid config template');
  const writes = [
    atomicWrite(join(outDir, 'core', 'tdai-gateway.yaml'), core, 0o644),
    atomicWrite(join(proxyRoot, 'proxy', 'config.yaml'), renderedProxy, proxyMode, proxyOwner),
    atomicWrite(join(outDir, 'gateway.token'), `${gatewayKey}\n`, 0o600),
  ];
  if (mode === 'mock') {
    const redisProxy = renderedProxy.replace('redis:\n  enabled: false', 'redis:\n  enabled: true\n  host: "redis"\n  port: 6379');
    writes.push(atomicWrite(join(proxyRoot, 'proxy', 'config.redis.yaml'), redisProxy, 0o644));
  }
  await Promise.all(writes);
}

if (isMain(import.meta)) {
  try {
    const values = parseArgs(process.argv.slice(2));
    await renderConfig({
      outDir: values['--out'],
      proxyOutDir: values['--proxy-out'],
      mode: values['--mode'] ?? 'mock',
      gatewayKey: process.env.MEMORY_CORE_GATEWAY_API_KEY,
      spaceId: process.env.MEMORY_SPACE_ID ?? 'default',
      secretFile: values['--secret-file'],
    });
    process.stdout.write(JSON.stringify({ status: 'ok', mode: values['--mode'] ?? 'mock' }) + '\n');
  } catch {
    process.stderr.write('config render failed\n');
    process.exitCode = 1;
  }
}
