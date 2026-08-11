import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runTask5ClaudeDiagnostic, runTask5ClaudeReadDiagnostic, runTask5OpenCodeDiagnostic, runTask5OpenCodeHeadlessDiagnostic } from '../tools/run-task5-claude-diagnostic.mjs';

const runId = 'task5-diagnostic-host';
const project = `refine-memory-${runId}`;
const fixedFailure = 'Task 5 Claude diagnostic coordinator failed';
const opencodeFixedFailure = 'Task 5 OpenCode diagnostic coordinator failed';
const headlessFixedFailure = 'Task 5 OpenCode headless diagnostic coordinator failed';
const claudeReadFixedFailure = 'Task 5 Claude read diagnostic coordinator failed';
const result = {
  status: 'classified',
  launch: 'code0',
  launch_phase: 'cli-zero',
  launch_category: 'none',
  output_present: false,
  proxy_dns_ok: true,
  proxy_tcp_ok: true,
  continuity: 'ok',
  sequence_delta: 1,
  total_delta: 1,
  expected_operation_present: true,
  expected_operation_valid: true,
  expected_main_count: 1,
  unexpected_operation_count: 0,
  unexpected_path_count: 0,
  unsafe: false,
  dropped: 0,
  truncated: false,
};
const canonical = JSON.stringify(result);
const headlessCanonical = '{"status":"classified","phase":"success"}';

function environment(evidenceDir) {
  return {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    RUN_ID: runId,
    COMPOSE_PROJECT_NAME: project,
    EVIDENCE_DIR: evidenceDir,
    MEMORY_CORE_GATEWAY_API_KEY: 'task5-disposable-gateway',
    PROXY_UPSTREAM_API_KEY: 'must-not-forward',
  };
}

function probeArgs() {
  const label = `label=com.docker.compose.project=${project}`;
  return [
    ['container', 'ls', '--all', '--quiet', '--filter', label],
    ['network', 'ls', '--quiet', '--filter', label],
    ['volume', 'ls', '--quiet', '--filter', label],
  ];
}

function composePrefix(integrationRoot) {
  return [
    'compose', '--project-directory', integrationRoot,
    '--profile', 'mock', '--profile', 'claude',
    '-f', join(integrationRoot, 'compose.four-cli.yaml'),
    '-f', join(integrationRoot, 'compose.four-cli.mock.yaml'),
    '-f', join(integrationRoot, 'compose.four-cli.claude.yaml'),
    '-f', join(integrationRoot, 'compose.four-cli.diagnostic.yaml'),
  ];
}

function businessArgs(integrationRoot) {
  const prefix = composePrefix(integrationRoot);
  return [
    [...prefix, 'up', '-d', '--wait', '--wait-timeout', '180', '--no-build', 'mock-llm', 'memory-core', 'memory-proxy', 'memory-hub'],
    [...prefix, 'run', '--rm', '--no-deps', 'bootstrap'],
    [...prefix, 'run', '--rm', '--no-deps', 'claude-config'],
    [...prefix, 'run', '--rm', '--no-deps', 'claude-headless'],
  ];
}

function opencodeBusinessArgs(integrationRoot) {
  const prefix = [
    'compose', '--project-directory', integrationRoot,
    '--profile', 'mock', '--profile', 'opencode',
    '-f', join(integrationRoot, 'compose.four-cli.yaml'),
    '-f', join(integrationRoot, 'compose.four-cli.mock.yaml'),
    '-f', join(integrationRoot, 'compose.four-cli.opencode.yaml'),
    '-f', join(integrationRoot, 'compose.four-cli.opencode-diagnostic.yaml'),
  ];
  return [
    [...prefix, 'up', '-d', '--wait', '--wait-timeout', '180', '--no-build', 'mock-llm', 'memory-core', 'memory-proxy', 'memory-hub'],
    [...prefix, 'run', '--rm', '--no-deps', 'bootstrap'],
    [...prefix, 'run', '--rm', '--no-deps', 'opencode-config'],
    [...prefix, 'run', '--rm', '--no-deps', 'opencode-headless'],
  ];
}

function opencodeHeadlessBusinessArgs(integrationRoot) {
  const prefix = [
    'compose', '--project-directory', integrationRoot,
    '--profile', 'mock', '--profile', 'claude', '--profile', 'opencode',
    '-f', join(integrationRoot, 'compose.four-cli.yaml'),
    '-f', join(integrationRoot, 'compose.four-cli.mock.yaml'),
    '-f', join(integrationRoot, 'compose.four-cli.claude.yaml'),
    '-f', join(integrationRoot, 'compose.four-cli.opencode.yaml'),
    '-f', join(integrationRoot, 'compose.four-cli.opencode-headless-diagnostic.yaml'),
  ];
  return [
    [...prefix, 'up', '-d', '--wait', '--wait-timeout', '180', '--no-build', 'mock-llm', 'memory-core', 'memory-proxy', 'memory-hub'],
    [...prefix, 'run', '--rm', '--no-deps', 'bootstrap'],
    [...prefix, 'run', '--rm', '--no-deps', 'claude-config'],
    [...prefix, 'run', '--rm', '--no-deps', 'claude-headless'],
    [...prefix, 'run', '--rm', '--no-deps', 'opencode-config'],
    [...prefix, 'run', '--rm', '--no-deps', 'opencode-headless'],
  ];
}

function claudeReadBusinessArgs(integrationRoot) {
  const prefix = [
    'compose', '--project-directory', integrationRoot,
    '--profile', 'mock', '--profile', 'management', '--profile', 'claude', '--profile', 'opencode', '--profile', 'pi',
    '-f', join(integrationRoot, 'compose.four-cli.yaml'),
    '-f', join(integrationRoot, 'compose.four-cli.mock.yaml'),
    '-f', join(integrationRoot, 'compose.four-cli.claude.yaml'),
    '-f', join(integrationRoot, 'compose.four-cli.opencode.yaml'),
    '-f', join(integrationRoot, 'compose.four-cli.pi.yaml'),
    '-f', join(integrationRoot, 'compose.four-cli.management.yaml'),
  ];
  const run = (service) => [...prefix, 'run', '--rm', '--no-deps', service];
  const diagnosticRun = (service) => [
    ...prefix, '-f', join(integrationRoot, 'compose.four-cli.claude-read-diagnostic.yaml'),
    'run', '--rm', '--no-deps', service,
  ];
  return [
    [...prefix, 'up', '-d', '--wait', '--wait-timeout', '180', '--no-build', 'mock-llm', 'memory-core', 'memory-proxy', 'memory-hub'],
    run('bootstrap'), run('claude-config'), run('opencode-config'), run('pi-config'),
    run('stage1-gate'), run('stage1-gate'),
    run('claude-headless'), run('opencode-headless'), run('pi-headless'), diagnosticRun('claude-headless'),
  ];
}

async function fixture(prefix) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  return {
    directory,
    evidenceDir: join(directory, runId),
    integrationRoot: join(directory, 'integration'),
  };
}

test('Claude diagnostic coordinator fixes four bounded steps and forwards only allowlisted environment', async () => {
  const value = await fixture('task5-claude-coordinator-');
  const calls = [];
  try {
    const output = await runTask5ClaudeDiagnostic({
      environment: environment(value.evidenceDir),
      integrationRoot: value.integrationRoot,
      spawnCompose: async (args, options) => {
        calls.push({ args, options });
        if (args[0] !== 'compose') return { status: 0, stdout: '', stderr: '' };
        return { status: 0, stdout: args[0] === 'compose' && args.at(-1) === 'claude-headless' ? `${canonical}\n` : 'ignored child output', stderr: 'ignored child error' };
      },
    });
    assert.equal(output, canonical);
    assert.deepEqual(calls.slice(0, 3).map(({ args }) => args), probeArgs());
    assert.deepEqual(calls.slice(3).map(({ args }) => args), businessArgs(value.integrationRoot));
    assert.equal(calls.length, 7);
    for (const { args, options } of calls) {
      assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe']);
      assert.equal(options.encoding, 'utf8');
      assert.equal(options.maxBuffer, 256 * 1024);
      assert.doesNotMatch(args.join(' '), /(?:^| )build(?: |$)|\bdown\b|\bprune\b|\bcleanup\b/);
    }
    for (const { options } of calls.slice(0, 3)) {
      for (const name of ['RUN_ID', 'COMPOSE_PROJECT_NAME', 'EVIDENCE_DIR', 'MEMORY_CORE_GATEWAY_API_KEY', 'STAGE1_CLIENT_SCENARIO']) {
        assert.equal(options.env[name], undefined);
      }
    }
    for (const { options } of calls.slice(3)) {
      assert.equal(options.env.RUN_ID, runId);
      assert.equal(options.env.COMPOSE_PROJECT_NAME, project);
      assert.equal(options.env.EVIDENCE_DIR, value.evidenceDir);
      assert.equal(options.env.MEMORY_CORE_GATEWAY_API_KEY, 'task5-disposable-gateway');
      assert.equal(options.env.COMPOSE_DISABLE_ENV_FILE, '1');
      assert.equal(options.env.PROXY_UPSTREAM_API_KEY, undefined);
    }
    assert.equal(calls.slice(3, 6).every(({ options }) => options.env.STAGE1_CLIENT_SCENARIO === undefined), true);
    assert.equal(calls[6].options.env.STAGE1_CLIENT_SCENARIO, 'write');
    assert.equal(await readFile(value.evidenceDir).catch((error) => error.code), 'EISDIR');
  } finally { await rm(value.directory, { recursive: true, force: true }); }
});

test('OpenCode diagnostic coordinator fixes the corresponding four bounded steps', async () => {
  const value = await fixture('task5-opencode-coordinator-');
  const calls = [];
  try {
    const output = await runTask5OpenCodeDiagnostic({
      environment: environment(value.evidenceDir),
      integrationRoot: value.integrationRoot,
      spawnCompose: async (args, options) => {
        calls.push({ args, options });
        if (args[0] !== 'compose') return { status: 0, stdout: '', stderr: '' };
        return { status: 0, stdout: args.at(-1) === 'opencode-headless' ? `${canonical}\n` : 'ignored child output', stderr: 'ignored child error' };
      },
    });
    assert.equal(output, canonical);
    assert.deepEqual(calls.slice(0, 3).map(({ args }) => args), probeArgs());
    assert.deepEqual(calls.slice(3).map(({ args }) => args), opencodeBusinessArgs(value.integrationRoot));
    assert.equal(calls.length, 7);
    assert.equal(calls.slice(3, 6).every(({ options }) => options.env.STAGE1_CLIENT_SCENARIO === undefined), true);
    assert.equal(calls[6].options.env.STAGE1_CLIENT_SCENARIO, 'write');
    assert.equal(calls.every(({ args }) => !/(?:^| )build(?: |$)|\bdown\b|\bprune\b|\bcleanup\b/.test(args.join(' '))), true);
    for (const { options } of calls) assert.equal(options.env.PROXY_UPSTREAM_API_KEY, undefined);
  } finally { await rm(value.directory, { recursive: true, force: true }); }
});

test('OpenCode diagnostic coordinator fail-stops with its fixed error', async () => {
  const value = await fixture('task5-opencode-failstop-');
  let businessCalls = 0;
  try {
    const error = await runTask5OpenCodeDiagnostic({
      environment: environment(value.evidenceDir), integrationRoot: value.integrationRoot,
      spawnCompose: async (args) => {
        if (args[0] !== 'compose') return { status: 0, stdout: '', stderr: '' };
        const index = businessCalls++;
        return index === 2
          ? { status: 23, stdout: 'raw stdout', stderr: 'raw stderr' }
          : { status: 0, stdout: '', stderr: '' };
      },
    }).then(() => undefined, (failure) => failure);
    assert.equal(error.message, opencodeFixedFailure);
    assert.equal(businessCalls, 3);
    assert.doesNotMatch(error.message, /raw|stdout|stderr/i);
  } finally { await rm(value.directory, { recursive: true, force: true }); }
});

test('OpenCode headless diagnostic coordinator fixes a prior Claude write and one classified OpenCode headless step', async () => {
  const value = await fixture('task5-opencode-headless-coordinator-');
  const calls = [];
  try {
    const output = await runTask5OpenCodeHeadlessDiagnostic({
      environment: environment(value.evidenceDir), integrationRoot: value.integrationRoot,
      spawnCompose: async (args, options) => {
        calls.push({ args, options });
        if (args[0] !== 'compose') return { status: 0, stdout: '', stderr: '' };
        return { status: 0, stdout: args.at(-1) === 'opencode-headless' ? `${headlessCanonical}\n` : '', stderr: '' };
      },
    });
    assert.equal(output, headlessCanonical);
    assert.deepEqual(calls.slice(0, 3).map(({ args }) => args), probeArgs());
    assert.deepEqual(calls.slice(3).map(({ args }) => args), opencodeHeadlessBusinessArgs(value.integrationRoot));
    assert.equal(calls.length, 9);
    assert.equal(calls.slice(3, 8).every(({ options }) => options.env.STAGE1_CLIENT_SCENARIO === undefined), true);
    assert.equal(calls[8].options.env.STAGE1_CLIENT_SCENARIO, 'write');
    assert.equal(calls.every(({ args }) => !/(?:^| )build(?: |$)|\bdown\b|\bprune\b|\bcleanup\b/.test(args.join(' '))), true);
  } finally { await rm(value.directory, { recursive: true, force: true }); }
});

test('OpenCode headless diagnostic coordinator rejects noncanonical phases with one fixed failure', async (context) => {
  for (const stdout of [
    '{"status":"classified","phase":"other"}',
    '{"phase":"success","status":"classified"}',
    '{"status":"classified","phase":"success","extra":false}',
    `${headlessCanonical}\n${headlessCanonical}\n`,
  ]) await context.test(stdout.slice(0, 24), async () => {
    const value = await fixture('task5-opencode-headless-output-');
    try {
      const error = await runTask5OpenCodeHeadlessDiagnostic({
        environment: environment(value.evidenceDir), integrationRoot: value.integrationRoot,
        spawnCompose: async (args) => ({ status: 0, stdout: args.at(-1) === 'opencode-headless' ? stdout : '', stderr: 'RAW_CHILD_SECRET' }),
      }).then(() => undefined, (failure) => failure);
      assert.equal(error.message, headlessFixedFailure);
      assert.doesNotMatch(error.message, /RAW_|secret|json|phase/i);
    } finally { await rm(value.directory, { recursive: true, force: true }); }
  });
});

test('Claude read diagnostic coordinator replays steps 1 through 10 before one classified read', async () => {
  const value = await fixture('task5-claude-read-coordinator-');
  const calls = [];
  try {
    const output = await runTask5ClaudeReadDiagnostic({
      environment: environment(value.evidenceDir), integrationRoot: value.integrationRoot,
      spawnCompose: async (args, options) => {
        calls.push({ args, options });
        if (args[0] !== 'compose') return { status: 0, stdout: '', stderr: '' };
        return { status: 0, stdout: args.at(-1) === 'claude-headless' && options.env.STAGE1_CLIENT_SCENARIO === 'read' ? `${headlessCanonical}\n` : '', stderr: '' };
      },
    });
    assert.equal(output, headlessCanonical);
    assert.deepEqual(calls.slice(0, 3).map(({ args }) => args), probeArgs());
    assert.deepEqual(calls.slice(3).map(({ args }) => args), claudeReadBusinessArgs(value.integrationRoot));
    assert.equal(calls.length, 14);
    assert.equal(calls[8].options.env.STAGE1_SCENARIO, 'protocol-leak');
    assert.equal(calls[9].options.env.STAGE1_SCENARIO, 'management');
    assert.deepEqual(calls.slice(10, 13).map(({ options }) => options.env.STAGE1_CLIENT_SCENARIO), ['write', 'write', 'write']);
    assert.equal(calls[13].options.env.STAGE1_CLIENT_SCENARIO, 'read');
    assert.equal(calls[13].options.env.STAGE1_OWNER, 'opencode');
    assert.equal(calls.slice(3, 13).every(({ args }) => !args.some((arg) => arg.endsWith('compose.four-cli.claude-read-diagnostic.yaml'))), true);
    assert.equal(calls[13].args.some((arg) => arg.endsWith('compose.four-cli.claude-read-diagnostic.yaml')), true);
    assert.equal(calls.every(({ args }) => !/(?:^| )build(?: |$)|\bdown\b|\bprune\b|\bcleanup\b/.test(args.join(' '))), true);
  } finally { await rm(value.directory, { recursive: true, force: true }); }
});

test('Claude diagnostic coordinator fail-stops on nonzero and thrown child results without raw output', async (context) => {
  for (const [name, businessIndex, outcome] of [
    ['up-nonzero', 0, { status: 23, stdout: 'raw stdout', stderr: 'raw stderr' }],
    ['bootstrap-nonzero', 1, { status: 23, stdout: 'raw stdout', stderr: 'raw stderr' }],
    ['config-nonzero', 2, { status: 23, stdout: 'raw stdout', stderr: 'raw stderr' }],
    ['diagnostic-nonzero', 3, { status: 23, stdout: 'raw stdout', stderr: 'raw stderr' }],
    ['spawn-throw', 1, new Error('raw thrown secret')],
  ]) await context.test(name, async () => {
    const value = await fixture('task5-claude-failstop-');
    let businessCalls = 0;
    try {
      const error = await runTask5ClaudeDiagnostic({
        environment: environment(value.evidenceDir), integrationRoot: value.integrationRoot,
        spawnCompose: async (args) => {
          if (args[0] !== 'compose') return { status: 0, stdout: '', stderr: '' };
          const index = businessCalls++;
          if (index === businessIndex) {
            if (outcome instanceof Error) throw outcome;
            return outcome;
          }
          return { status: 0, stdout: index === 3 ? canonical : '', stderr: '' };
        },
      }).then(() => undefined, (failure) => failure);
      assert.equal(error.message, fixedFailure);
      assert.equal(businessCalls, businessIndex + 1);
      assert.doesNotMatch(error.message, /raw|secret|stdout|stderr/i);
    } finally { await rm(value.directory, { recursive: true, force: true }); }
  });
});

test('Claude diagnostic coordinator rejects noncanonical or malformed diagnostic stdout', async (context) => {
  const cases = [
    ['multiple-lines', `${canonical}\n${canonical}\n`],
    ['extra-key', JSON.stringify({ ...result, extra: false })],
    ['string-number', JSON.stringify({ ...result, sequence_delta: '1' })],
    ['duplicate-key', canonical.replace('"launch":"code0"', '"launch":"code0","launch":"code0"')],
    ['whitespace', canonical.replace('{"status"', '{ "status"')],
    ['failed-positive-delta', JSON.stringify({ ...result, continuity: 'failed' })],
    ['mismatched-deltas', JSON.stringify({ ...result, total_delta: 2 })],
    ['valid-without-present', JSON.stringify({ ...result, expected_operation_present: false })],
    ['main-without-present', JSON.stringify({ ...result, expected_operation_present: false, expected_operation_valid: false })],
    ['not-run-continuous', JSON.stringify({ ...result, launch: 'not_run', launch_phase: 'not-run', proxy_dns_ok: false, proxy_tcp_ok: false })],
    ['launch-phase-mismatch', JSON.stringify({ ...result, launch_phase: 'cli-nonzero', launch_category: 'unknown' })],
    ['category-with-code0', JSON.stringify({ ...result, launch_category: 'filesystem' })],
    ['recognized-without-output', JSON.stringify({ ...result, launch: 'nonzero', launch_phase: 'cli-nonzero', launch_category: 'filesystem' })],
    ['tcp-without-dns', JSON.stringify({ ...result, proxy_dns_ok: false })],
    ['setup-output', JSON.stringify({ ...result, launch: 'throw', launch_phase: 'setup-error', output_present: true })],
    ['unknown-phase', JSON.stringify({ ...result, launch: 'throw', launch_phase: 'other' })],
    ['unknown-category', JSON.stringify({ ...result, launch: 'nonzero', launch_phase: 'cli-nonzero', launch_category: 'raw-error' })],
    ['unsafe-integer', JSON.stringify({ ...result, dropped: Number.MAX_SAFE_INTEGER + 1 })],
    ['exponent-integer', JSON.stringify({ ...result, dropped: 1e100 })],
  ];
  for (const [name, stdout] of cases) await context.test(name, async () => {
    const value = await fixture('task5-claude-output-');
    try {
      const error = await runTask5ClaudeDiagnostic({
        environment: environment(value.evidenceDir), integrationRoot: value.integrationRoot,
        spawnCompose: async (args) => ({ status: 0, stdout: args.at(-1) === 'claude-headless' ? stdout : '', stderr: 'raw child error' }),
      }).then(() => undefined, (failure) => failure);
      assert.equal(error?.message, fixedFailure);
      assert.doesNotMatch(error?.message ?? '', /raw|child|json/i);
    } finally { await rm(value.directory, { recursive: true, force: true }); }
  });
});

test('Claude diagnostic coordinator rejects invalid boundaries and label collisions before Compose', async () => {
  const value = await fixture('task5-claude-boundary-');
  try {
    for (const invalid of [
      { ...environment(value.evidenceDir), RUN_ID: '' },
      { ...environment(value.evidenceDir), COMPOSE_PROJECT_NAME: 'other-project' },
      { ...environment(join(value.directory, 'wrong-basename')) },
      { ...environment(value.evidenceDir), MEMORY_CORE_GATEWAY_API_KEY: '' },
    ]) {
      let calls = 0;
      await assert.rejects(runTask5ClaudeDiagnostic({
        environment: invalid, integrationRoot: value.integrationRoot,
        spawnCompose: async () => { calls += 1; return { status: 0, stdout: '', stderr: '' }; },
      }), (error) => error.message === fixedFailure);
      assert.equal(calls, 0);
    }

    const existing = join(value.directory, 'existing', runId);
    await mkdir(existing, { recursive: true });
    let existingCalls = 0;
    await assert.rejects(runTask5ClaudeDiagnostic({
      environment: environment(existing), integrationRoot: value.integrationRoot,
      spawnCompose: async () => { existingCalls += 1; return { status: 0, stdout: '', stderr: '' }; },
    }), (error) => error.message === fixedFailure);
    assert.equal(existingCalls, 0);

    let collisionCalls = 0;
    await assert.rejects(runTask5ClaudeDiagnostic({
      environment: environment(value.evidenceDir), integrationRoot: value.integrationRoot,
      spawnCompose: async (args) => {
        collisionCalls += 1;
        return { status: 0, stdout: args[0] === 'network' ? 'existing-resource\n' : '', stderr: '' };
      },
    }), (error) => error.message === fixedFailure);
    assert.equal(collisionCalls, 2);
    assert.equal(await readFile(value.evidenceDir).catch((error) => error.code), 'ENOENT');
  } finally { await rm(value.directory, { recursive: true, force: true }); }
});

test('Claude diagnostic coordinator CLI emits only the fixed failure', () => {
  const tool = join(import.meta.dirname, '..', 'tools', 'run-task5-claude-diagnostic.mjs');
  const child = spawnSync(process.execPath, [tool], { encoding: 'utf8', env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot } });
  assert.notEqual(child.status, 0);
  assert.equal(child.stdout, '');
  assert.equal(child.stderr, `${fixedFailure}\n`);
});

test('OpenCode diagnostic coordinator uses its fixed CLI failure without raw output', () => {
  const tool = join(import.meta.dirname, '..', 'tools', 'run-task5-opencode-diagnostic.mjs');
  const child = spawnSync(process.execPath, [tool], { encoding: 'utf8', env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot } });
  assert.notEqual(child.status, 0);
  assert.equal(child.stdout, '');
  assert.equal(child.stderr, `${opencodeFixedFailure}\n`);
});

test('OpenCode headless diagnostic coordinator uses its fixed CLI failure without raw output', () => {
  const tool = join(import.meta.dirname, '..', 'tools', 'run-task5-opencode-headless-diagnostic.mjs');
  const child = spawnSync(process.execPath, [tool], { encoding: 'utf8', env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot } });
  assert.notEqual(child.status, 0);
  assert.equal(child.stdout, '');
  assert.equal(child.stderr, `${headlessFixedFailure}\n`);
});

test('Claude read diagnostic coordinator uses its fixed CLI failure without raw output', () => {
  const tool = join(import.meta.dirname, '..', 'tools', 'run-task5-claude-read-diagnostic.mjs');
  const child = spawnSync(process.execPath, [tool], { encoding: 'utf8', env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot } });
  assert.notEqual(child.status, 0);
  assert.equal(child.stdout, '');
  assert.equal(child.stderr, `${claudeReadFixedFailure}\n`);
});
