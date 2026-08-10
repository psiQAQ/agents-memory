import { createHash, randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { validateManifest } from './test-runner.mjs';
import { isMain } from './runtime-lib.mjs';
import { stage1OperationDigest, stage1OperationHash, stage1Sources as sources } from './task5-contract.mjs';

const fixtures = ['text', 'stream', 'tool', 'count', 'http-400', 'http-429', 'http-500', 'timeout'];
const forbiddenHeaders = new Set([
  'authorization', 'cookie', 'cf-access-jwt-assertion', 'x-agent-id', 'x-claude-code-session-id',
  'x-conversation-id', 'x-forwarded-for', 'x-forwarded-host', 'x-task-id', 'x-tdai-agent-source',
  'x-tdai-service-id', 'x-tdai-service-token', 'x-tdai-user-key', 'x-team-id',
  'x-vertex-ai-session-id', 'x-wechat-work-id', 'x-wecom-id',
]);

export function buildLeakCases() {
  return Object.entries(sources).flatMap(([client, source]) => fixtures.map((fixture) => ({ client, source, fixture })));
}

export function isUnsafeObservation(observation) {
  return !['sensitive_value_seen', 'unexpected_credential_seen', 'memory_user_credential_seen'].every((name) => typeof observation?.[name] === 'boolean')
    || observation.sensitive_value_seen
    || observation.unexpected_credential_seen
    || observation.memory_user_credential_seen
    || !Array.isArray(observation.header_names)
    || observation.header_names.some((name) => forbiddenHeaders.has(String(name).toLowerCase()));
}

export { stage1OperationDigest, stage1OperationHash };

async function readKey(path) {
  try {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1 || metadata.size > 256) throw new Error();
    const key = (await readFile(path, 'utf8')).replace(/\r?\n$/, '');
    if (!/^sk-mem-[A-Za-z0-9_-]{32}$/.test(key)) throw new Error();
    return key;
  } catch { throw new Error('invalid Stage 1 credential'); }
}

async function json(url, options = {}) {
  let response;
  try { response = await fetch(url, { ...options, signal: options.signal ?? AbortSignal.timeout(5000) }); }
  catch (error) { throw error; }
  let data;
  try { data = await response.json(); } catch { throw new Error('invalid Stage 1 response'); }
  return { response, data };
}

async function writeStage1Evidence(outputDir, value) {
  if (!isAbsolute(outputDir ?? '')) throw new Error('unsafe Stage 1 evidence');
  const destination = join(outputDir, 'stage1-mock.json');
  const temporary = join(outputDir, `.stage1-mock.${process.pid}.${randomUUID()}.tmp`);
  try {
    await mkdir(outputDir, { recursive: true, mode: 0o700 });
    const directory = await lstat(outputDir);
    if (directory.isSymbolicLink() || !directory.isDirectory()) throw new Error();
    try { await lstat(destination); throw new Error(); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    const metadata = await lstat(temporary);
    if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1) throw new Error();
    await chmod(temporary, 0o600);
    await rename(temporary, destination);
  } catch {
    await unlink(temporary).catch(() => {});
    throw new Error('unsafe Stage 1 evidence');
  }
}

function proxyHeaders(manifest, client, key, sentinel) {
  return {
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01',
    'x-team-id': manifest.team_id,
    'x-agent-id': manifest.clients[client].agent_id,
    'x-task-id': manifest.task_id,
    'x-conversation-id': manifest.clients[client].session_id,
    'x-claude-code-session-id': sentinel,
    'x-vertex-ai-session-id': sentinel,
    'x-wecom-id': sentinel,
    'x-tdai-service-token': sentinel,
    cookie: `stage1=${sentinel}`,
  };
}

function expectedStatus(fixture) {
  if (fixture === 'timeout') return 0;
  if (fixture.startsWith('http-')) return Number(fixture.slice(5));
  return 200;
}

export async function runProtocolLeakGate({ manifestPath, proxyUrl, mockUrl, outputDir, timeoutMs = 100 }) {
  if (![manifestPath, outputDir].every((path) => isAbsolute(path ?? '')) || ![proxyUrl, mockUrl].every((url) => /^https?:\/\//.test(url ?? '')) || !Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 5000) throw new Error('invalid Stage 1 arguments');
  let manifest;
  try { manifest = validateManifest(JSON.parse(await readFile(manifestPath, 'utf8')), dirname(resolve(manifestPath))); } catch { throw new Error('invalid Stage 1 manifest'); }
  if (Object.keys(manifest.clients).sort().join(',') !== 'claude,opencode,pi') throw new Error('invalid Stage 1 manifest');
  const manifestDirectory = dirname(resolve(manifestPath));
  const keys = Object.fromEntries(await Promise.all(Object.entries(manifest.clients).map(async ([client, value]) => [client, await readKey(resolve(manifestDirectory, value.credential_file))])));
  const assertions = [];
  for (const entry of buildLeakCases()) {
    const name = `leak-${entry.client}-${entry.fixture}`;
    try {
      const reset = await fetch(new URL('/__mock/reset', mockUrl), { method: 'POST', signal: AbortSignal.timeout(2000) });
      if (!reset.ok) throw new Error();
      const sentinel = `MEMORY_LEAK_SENTINEL_${createHash('sha256').update(`${manifest.run_id}:${name}`).digest('hex').slice(0, 24).toUpperCase()}`;
      const count = entry.fixture === 'count';
      const path = `/${entry.source}/${manifest.service_id}/v1/messages${count ? '/count_tokens' : ''}`;
      const body = {
        model: 'mock-model',
        max_tokens: 32,
        ...(entry.fixture === 'stream' ? { stream: true } : {}),
        ...(entry.fixture === 'tool' ? { tools: [{ name: 'stage1_echo', description: 'deterministic fixture', input_schema: { type: 'object', properties: {} } }] } : {}),
        messages: [{ role: 'user', content: 'Run the deterministic Stage 1 protocol check.' }],
      };
      const fixtureHeader = ['tool', 'http-400', 'http-429', 'http-500', 'timeout'].includes(entry.fixture) ? entry.fixture : 'text';
      let status;
      try {
        const response = await fetch(new URL(path, proxyUrl), {
          method: 'POST',
          headers: { ...proxyHeaders(manifest, entry.client, keys[entry.client], sentinel), 'x-mock-fixture': fixtureHeader },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(entry.fixture === 'timeout' ? timeoutMs : 5000),
        });
        status = response.status;
        await response.arrayBuffer();
      } catch (error) {
        if (entry.fixture !== 'timeout' || !['AbortError', 'TimeoutError'].includes(error?.name)) throw error;
        status = 0;
      }
      const observed = await json(new URL('/__mock/requests', mockUrl));
      const targetPath = `/anthropic/v1/messages${count ? '/count_tokens' : ''}`;
      const requests = Array.isArray(observed.data?.requests) ? observed.data.requests.filter((request) => request?.path === targetPath) : [];
      if (status !== expectedStatus(entry.fixture) || requests.length !== 1 || requests.some(isUnsafeObservation)) throw new Error();
      assertions.push({ name, status, model_requests: requests.length });
    } catch {
      const failed = { status: 'failed', assertion: name, passed: assertions.length };
      await writeStage1Evidence(outputDir, failed);
      throw new Error(`Stage 1 protocol leak gate failed assertion=${name}`);
    }
  }
  const result = { status: 'ok', assertions };
  await writeStage1Evidence(outputDir, result);
  return result;
}

function parse(argv, allowed) {
  if (argv.length === 0 || argv.length % 2 !== 0) throw new Error('invalid Stage 1 CLI arguments');
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(name) || Object.hasOwn(values, name) || !value) throw new Error('invalid Stage 1 CLI arguments');
    values[name] = value;
  }
  return values;
}

export async function runTask5Cli(argv, environment = process.env, dependencies = {}) {
  const values = parse(argv, new Set(['--manifest', '--scenario', '--gateway-token-file', '--output-dir']));
  if (!values['--manifest'] || values['--scenario'] !== 'protocol-leak' || !values['--gateway-token-file'] || !values['--output-dir'] || !/^https?:\/\//.test(environment.PROXY_BASE_URL ?? '') || !/^https?:\/\//.test(environment.MOCK_BASE_URL ?? '')) throw new Error('invalid Stage 1 CLI arguments');
  const protocol = dependencies.protocol ?? runProtocolLeakGate;
  return protocol({ manifestPath: values['--manifest'], proxyUrl: environment.PROXY_BASE_URL, mockUrl: environment.MOCK_BASE_URL, outputDir: values['--output-dir'] });
}

if (isMain(import.meta)) {
  try {
    const result = await runTask5Cli(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify({ status: result.status })}\n`);
  } catch (error) {
    process.stderr.write(`${error.message.startsWith('Stage 1 protocol leak gate failed assertion=') ? error.message : 'Stage 1 gate failed'}\n`);
    process.exitCode = 1;
  }
}
