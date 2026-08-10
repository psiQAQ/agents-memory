import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('README one-shot commands avoid replaying prepared dependencies', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  const count = (pattern) => [...readme.matchAll(pattern)].length;
  const sectionStart = readme.search(/^## 2\./m);
  const sectionEnd = readme.search(/^## 3\./m);

  assert.notEqual(sectionStart, -1);
  assert.notEqual(sectionEnd, -1);
  const section = readme.slice(sectionStart, sectionEnd);
  const stackUp = section.indexOf('up -d --build mock-llm config-init memory-core memory-proxy bootstrap');
  const readinessStart = section.indexOf('$deadline = (Get-Date).AddMinutes(2)');
  const readinessComplete = section.indexOf("if (-not $ready) { throw 'Compose readiness timed out' }");
  const runner1 = section.indexOf("$env:TEST_SCENARIO = 'mock-contract'");
  const runner2 = section.indexOf("$env:TEST_SCENARIO = 'standalone-memory'");
  const agentPreparation = section.indexOf('up --no-deps agent-config-a');
  const oneShotLoopStart = section.indexOf("foreach ($service in @('config-init', 'bootstrap'))");
  const longServiceLoopStart = section.indexOf("foreach ($service in @('mock-llm', 'memory-core', 'memory-proxy'))");

  for (const [name, anchor] of Object.entries({ stackUp, readinessStart, readinessComplete, runner1, runner2, agentPreparation, oneShotLoopStart, longServiceLoopStart })) {
    assert.notEqual(anchor, -1, `${name} anchor is required`);
  }
  assert.ok(stackUp < readinessStart);
  assert.ok(readinessStart < readinessComplete);
  assert.ok(readinessComplete < runner1);
  assert.ok(runner1 < runner2);
  assert.ok(runner2 < agentPreparation);

  assert.equal(count(/run --rm --no-deps test-runner/g), 2);
  assert.equal(count(/up --no-deps agent-config-a/g), 1);
  assert.match(readme, /run --rm --no-deps windows-config-init/);
  assert.equal(count(/run --rm --no-deps claude-agent-a --(?:version|interactive)/g), 2);
  assert.match(section, /ps --all --format json/);
  assert.match(section, /\$containerName = "\$env:COMPOSE_PROJECT_NAME-\$service-1"/);
  assert.match(section, /\$byContainer\[\$entry\.Name\] = \$entry/);
  assert.match(section, /foreach \(\$service in @\('config-init', 'bootstrap'\)\)/);
  assert.match(section.slice(oneShotLoopStart, longServiceLoopStart), /\$entry\.State -eq 'exited' -and \[int\]\$entry\.ExitCode -ne 0/);
  assert.match(section, /foreach \(\$service in @\('mock-llm', 'memory-core', 'memory-proxy'\)\)/);
  assert.match(section, /\$entry\.State -eq 'running' -and \$entry\.Health -eq 'healthy'/);
  assert.match(section, /if \(\$LASTEXITCODE -ne 0\) \{ throw /);
  assert.match(section, /if \(-not \$ready\) \{ throw /);
});
