import { isMain } from '../tools/runtime-lib.mjs';
import { renderConfig } from './render-config.mjs';

if (isMain(import.meta)) {
  const [flag, outDir] = process.argv.slice(2);
  try {
    if (flag !== '--out' || !outDir) throw new Error('invalid arguments');
    await renderConfig({ outDir, gatewayKey: process.env.MEMORY_CORE_GATEWAY_API_KEY, mode: 'real' });
    process.stdout.write('{"status":"ok","mode":"real"}\n');
  } catch {
    process.stderr.write('config render failed\n');
    process.exitCode = 1;
  }
}
