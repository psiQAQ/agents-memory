import { isMain } from '../tools/runtime-lib.mjs';
import { renderConfig } from './render-config.mjs';

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    if (!name?.startsWith('--') || values[name] || !argv[index + 1]) throw new Error('invalid arguments');
    values[name] = argv[index + 1];
  }
  return values;
}

export async function renderRealConfig({ outDir, proxyOutDir, gatewayKey, spaceId = 'default', secretFile, uid = 10001, gid = 10001 }) {
  await renderConfig({ outDir, proxyOutDir, gatewayKey, spaceId, mode: 'real', secretFile, proxyUid: uid, proxyGid: gid });
}

if (isMain(import.meta)) {
  try {
    const values = parseArgs(process.argv.slice(2));
    await renderRealConfig({
      outDir: values['--out'],
      proxyOutDir: values['--proxy-out'],
      gatewayKey: process.env.MEMORY_CORE_GATEWAY_API_KEY,
      spaceId: process.env.MEMORY_SPACE_ID ?? 'default',
      secretFile: values['--secret-file'] ?? process.env.DEEPSEEK_SECRET_FILE ?? '/run/secrets/deepseek_key',
    });
    process.stdout.write('{"status":"ok","mode":"real"}\n');
  } catch {
    process.stderr.write('config render failed\n');
    process.exitCode = 1;
  }
}
