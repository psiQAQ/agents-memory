import { isMain } from './runtime-lib.mjs';
import { runTask5OpenCodeDiagnostic } from './run-task5-claude-diagnostic.mjs';

const failureMessage = 'Task 5 OpenCode diagnostic coordinator failed';

if (isMain(import.meta)) {
  try {
    if (process.argv.length !== 2) throw new Error();
    process.stdout.write(`${await runTask5OpenCodeDiagnostic()}\n`);
  } catch {
    process.stderr.write(`${failureMessage}\n`);
    process.exitCode = 1;
  }
}
