import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
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

async function atomicWrite(path, content, mode) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { encoding: 'utf8', mode });
    await chmod(temporary, mode).catch(() => {});
    await rename(temporary, path);
    await chmod(path, mode).catch(() => {});
  } catch {
    await unlink(temporary).catch(() => {});
    throw new Error('cannot write config');
  }
}

export async function renderConfig({ outDir, gatewayKey, mode = 'mock' }) {
  if (!isAbsolute(outDir ?? '') || !gatewayPattern.test(gatewayKey ?? '') || !['mock', 'real'].includes(mode)) throw new Error('invalid config inputs');
  const [core, proxy] = await Promise.all([
    readFile(join(here, `core.${mode}.yaml.template`), 'utf8'),
    readFile(join(here, `proxy.${mode}.yaml.template`), 'utf8'),
  ]);
  const placeholder = '__MEMORY_CORE_GATEWAY_API_KEY__';
  if ((proxy.match(new RegExp(placeholder, 'g')) ?? []).length !== 3) throw new Error('invalid config template');
  const renderedProxy = proxy.replaceAll(placeholder, gatewayKey);
  if (/__[A-Z0-9_]+__/.test(`${core}${renderedProxy}`)) throw new Error('invalid config template');
  const writes = [
    atomicWrite(join(outDir, 'core', 'tdai-gateway.yaml'), core, 0o644),
    atomicWrite(join(outDir, 'proxy', 'config.yaml'), renderedProxy, 0o644),
    atomicWrite(join(outDir, 'gateway.token'), `${gatewayKey}\n`, 0o600),
  ];
  if (mode === 'mock') {
    const redisProxy = renderedProxy.replace('redis:\n  enabled: false', 'redis:\n  enabled: true\n  host: "redis"\n  port: 6379');
    writes.push(atomicWrite(join(outDir, 'proxy', 'config.redis.yaml'), redisProxy, 0o644));
  }
  await Promise.all(writes);
}

if (isMain(import.meta)) {
  try {
    const values = parseArgs(process.argv.slice(2));
    await renderConfig({
      outDir: values['--out'],
      mode: values['--mode'] ?? 'mock',
      gatewayKey: process.env.MEMORY_CORE_GATEWAY_API_KEY,
    });
    process.stdout.write(JSON.stringify({ status: 'ok', mode: values['--mode'] ?? 'mock' }) + '\n');
  } catch {
    process.stderr.write('config render failed\n');
    process.exitCode = 1;
  }
}
