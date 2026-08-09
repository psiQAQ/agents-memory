import { isMain } from './runtime-lib.mjs';
import { renderSettings } from './render-settings.mjs';
import { verifyWindowsConfigAttestation } from './windows-config-gate.mjs';

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    if (!name?.startsWith('--') || result[name] || !argv[index + 1]) throw new Error('invalid arguments');
    result[name] = argv[index + 1];
  }
  return result;
}

export async function prepareWindowsConfig(options, environment = process.env) {
  await verifyWindowsConfigAttestation(environment, options.attestation, options.configDir);
  await renderSettings({ target: 'windows', template: options.template, configDir: options.configDir, keyFile: options.keyFile, spaceId: options.spaceId });
}

if (isMain(import.meta)) {
  try {
    const values = parseArgs(process.argv.slice(2));
    await prepareWindowsConfig({
      attestation: values['--attestation'],
      template: values['--template'],
      configDir: values['--config-dir'],
      keyFile: values['--memory-user-key-file'],
      spaceId: values['--space-id'],
    });
    process.stdout.write('{"status":"ok"}\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
