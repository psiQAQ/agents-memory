import { launchClient } from './launch-client.mjs';
import { isMain } from './runtime-lib.mjs';
import { runHeadlessCli, runHeadlessClient } from './task5-headless-client.mjs';

const clientFailure = Symbol('client-failure');

function result(phase) {
  return { status: 'classified', phase };
}

export async function runHeadlessPhaseDiagnostic(argv, environment = process.env, dependencies = {}) {
  const run = dependencies.run ?? runHeadlessClient;
  const launch = dependencies.launch ?? launchClient;
  let requestedScenario;
  try {
    const value = await runHeadlessCli(argv, environment, {
      run: (options) => {
        requestedScenario = options.scenario;
        return run({
          ...options,
          launch: async (launchOptions) => {
            try { return await launch(launchOptions); }
            catch { throw clientFailure; }
          },
        });
      },
    });
    return value?.status === 'ok' && value?.scenario === requestedScenario ? result('success') : result('setup');
  } catch (error) {
    if (error === clientFailure || error?.message === 'Stage 1 client failed') return result('client');
    if (error?.message === 'Stage 1 observation failed') return result('observation');
    if (error?.message === 'Stage 1 client evidence failed') return result('evidence');
    return result('setup');
  }
}

if (isMain(import.meta)) {
  process.stdout.write(`${JSON.stringify(await runHeadlessPhaseDiagnostic(process.argv.slice(2)))}\n`);
}
