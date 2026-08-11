import { isMain } from './runtime-lib.mjs';
import { runTask5ClaudeReadDiagnostic } from './run-task5-claude-diagnostic.mjs';

const failureMessage = 'Task 5 Claude read diagnostic coordinator failed';

if (isMain(import.meta)) {
  try {
    if (process.argv.length !== 2) throw new Error();
    process.stdout.write(`${await runTask5ClaudeReadDiagnostic()}\n`);
  } catch {
    process.stderr.write(`${failureMessage}\n`);
    process.exitCode = 1;
  }
}
