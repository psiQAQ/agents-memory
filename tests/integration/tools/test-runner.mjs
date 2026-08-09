import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { isMain } from './runtime-lib.mjs';

const runIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function invalid() { throw new Error('invalid manifest'); }

function inspect(value, name = '') {
  if (/(?:key|token|secret)/i.test(name) && name !== 'credential_file') invalid();
  if (typeof value === 'string' && /(sk-mem-|deepseek|api[_-]?key)/i.test(value)) invalid();
  if (value && typeof value === 'object') for (const [childName, child] of Object.entries(value)) inspect(child, childName);
}

function validCredentialPath(value, manifestDirectory) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes(':') || isAbsolute(value)) return false;
  const parts = value.split('/');
  if (parts[0] !== 'credentials' || parts.length < 2 || parts.some((part) => !part || part === '.' || part === '..')) return false;
  const credentialsDirectory = resolve(manifestDirectory, 'credentials');
  const destination = resolve(manifestDirectory, ...parts);
  const fromCredentials = relative(credentialsDirectory, destination);
  return Boolean(fromCredentials) && !fromCredentials.startsWith('..') && !isAbsolute(fromCredentials);
}

export function validateManifest(manifest, manifestDirectory = process.cwd()) {
  inspect(manifest);
  if (!manifest || typeof manifest !== 'object' || !runIdPattern.test(manifest.run_id) || !['service_id', 'team_id', 'task_id'].every((name) => typeof manifest[name] === 'string' && manifest[name])) invalid();
  if (!manifest.clients || typeof manifest.clients !== 'object' || Array.isArray(manifest.clients) || Object.keys(manifest.clients).length === 0) invalid();
  for (const client of Object.values(manifest.clients)) {
    if (!client || typeof client !== 'object' || !['user_id', 'agent_id', 'session_id', 'credential_file', 'display_name'].every((name) => typeof client[name] === 'string' && client[name])) invalid();
    if (!validCredentialPath(client.credential_file, manifestDirectory)) invalid();
  }
  return manifest;
}

async function request(baseUrl, path, body, fixture = 'text', timeout = 1000) {
  return fetch(new URL(path, baseUrl), { method: 'POST', headers: { 'content-type': 'application/json', 'x-mock-fixture': fixture }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
}

async function check(assertions, name, action) {
  const started = performance.now();
  const value = await action();
  assertions.push({ name, status: value.status, elapsed_ms: Math.round(performance.now() - started), ...(value.usage ? { usage: value.usage } : {}) });
}

export async function runMockContract({ manifestPath, baseUrl }) {
  let manifest;
  try { manifest = validateManifest(JSON.parse(await readFile(manifestPath, 'utf8')), dirname(resolve(manifestPath))); } catch { throw new Error('invalid manifest'); }
  const assertions = [];
  await check(assertions, 'openai-text', async () => { const response = await request(baseUrl, '/openai/v1/chat/completions', { model: 'mock', messages: [] }); const body = await response.json(); if (!response.ok || body.choices?.[0]?.message?.content !== 'mock text') throw new Error('mock contract failed'); return { status: response.status, usage: body.usage }; });
  await check(assertions, 'openai-stream', async () => { const response = await request(baseUrl, '/openai/v1/chat/completions', { model: 'mock', messages: [], stream: true }); if (!response.ok || !(await response.text()).includes('data: [DONE]')) throw new Error('mock contract failed'); return { status: response.status }; });
  await check(assertions, 'openai-tool', async () => { const response = await request(baseUrl, '/openai/v1/chat/completions', { model: 'mock', messages: [], tools: [{ type: 'function', function: { name: 'echo' } }] }, 'tool'); const body = await response.json(); if (!response.ok || body.choices?.[0]?.finish_reason !== 'tool_calls') throw new Error('mock contract failed'); return { status: response.status }; });
  await check(assertions, 'anthropic-text', async () => { const response = await request(baseUrl, '/anthropic/v1/messages', { model: 'mock', messages: [] }); const body = await response.json(); if (!response.ok || body.type !== 'message') throw new Error('mock contract failed'); return { status: response.status, usage: body.usage }; });
  await check(assertions, 'anthropic-thinking-stream', async () => { const response = await request(baseUrl, '/anthropic/v1/messages', { model: 'mock', messages: [], stream: true }, 'thinking'); if (!response.ok || !(await response.text()).includes('thinking_delta')) throw new Error('mock contract failed'); return { status: response.status }; });
  await check(assertions, 'anthropic-tool', async () => { const response = await request(baseUrl, '/anthropic/v1/messages', { model: 'mock', messages: [], tools: [{ name: 'echo' }], stream: true }, 'tool'); if (!response.ok || !(await response.text()).includes('tool_use')) throw new Error('mock contract failed'); return { status: response.status }; });
  await check(assertions, 'count-tokens', async () => { const response = await request(baseUrl, '/anthropic/v1/messages/count_tokens', { model: 'mock', messages: [] }); const body = await response.json(); if (!response.ok || typeof body.input_tokens !== 'number') throw new Error('mock contract failed'); return { status: response.status, usage: { input_tokens: body.input_tokens } }; });
  for (const [fixture, status] of [['http-400', 400], ['http-429', 429], ['http-500', 500]]) await check(assertions, fixture, async () => { const response = await request(baseUrl, '/openai/v1/chat/completions', { model: 'mock', messages: [] }, fixture); if (response.status !== status) throw new Error('mock contract failed'); return { status: response.status }; });
  await check(assertions, 'timeout', async () => {
    const started = performance.now();
    try { await request(baseUrl, '/openai/v1/chat/completions', { model: 'mock', messages: [] }, 'timeout', 20); }
    catch (error) {
      if (!['TimeoutError', 'AbortError'].includes(error?.name) || performance.now() - started < 15) throw new Error('mock contract failed');
      return { status: 0 };
    }
    throw new Error('mock contract failed');
  });
  const result = { status: 'ok', run_id: manifest.run_id, assertions };
  const resultsDir = join(dirname(manifestPath), 'results');
  await mkdir(resultsDir, { recursive: true });
  await writeFile(join(resultsDir, 'mock-contract.json'), JSON.stringify(result, null, 2), 'utf8');
  return result;
}

if (isMain(import.meta)) {
  const [manifestFlag, manifestPath, scenarioFlag, scenario] = process.argv.slice(2);
  try {
    if (manifestFlag !== '--manifest' || scenarioFlag !== '--scenario' || scenario !== 'mock-contract') throw new Error('invalid arguments');
    await runMockContract({ manifestPath, baseUrl: process.env.MOCK_BASE_URL ?? 'http://127.0.0.1:18080' });
    process.stdout.write('{"status":"ok"}\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
