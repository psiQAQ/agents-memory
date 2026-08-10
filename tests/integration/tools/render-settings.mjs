import { chmod, lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isMain } from './runtime-lib.mjs';

const keyPattern = /^sk-mem-[A-Za-z0-9_-]{32}$/;
const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const urls = {
  docker: 'http://memory-proxy:8096/claude-code',
  windows: 'http://127.0.0.1:8096/claude-code',
};
const toolUrls = {
  docker: 'http://memory-proxy:8096',
  windows: 'http://127.0.0.1:8096',
};
const writes = new Map();

function validDisplayName(value) {
  return typeof value === 'string' && value.length <= 128 && value === value.trim() && value.length > 0 && !/[:\r\n\x00-\x1f\x7f]/.test(value);
}

function args(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    if (!name?.startsWith('--') || result[name] || !argv[index + 1]) throw new Error('invalid arguments');
    result[name] = argv[index + 1];
  }
  return result;
}

function hasCredential(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([name, child]) => /(?:auth.*token|api.*key|deepseek|credential|secret|(?:^|_)key$)/i.test(name) || hasCredential(child));
}

async function ensureNoFollowDirectory(path) {
  const directories = [];
  for (let current = resolve(path), parent = dirname(current); current !== parent; current = parent, parent = dirname(current)) directories.push(current);
  for (const directory of directories.reverse()) {
    let metadata;
    try {
      metadata = await lstat(directory);
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('unsafe config directory');
      try { await mkdir(directory, { mode: 0o700 }); } catch (mkdirError) { if (mkdirError.code !== 'EEXIST') throw new Error('unsafe config directory'); }
      try { metadata = await lstat(directory); } catch { throw new Error('unsafe config directory'); }
    }
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error('unsafe config directory');
  }
}

export async function renderSettings(options) {
  const { target, template, configDir, bundleFile, homeDir, spaceId = 'default' } = options;
  const claudeTarget = Boolean(urls[target]);
  if (!claudeTarget && !['opencode', 'pi'].includes(target)) throw new Error('invalid target');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(spaceId) || spaceId.includes('..')) throw new Error('invalid space-id');
  if (![configDir, bundleFile, ...(claudeTarget ? [template] : [])].every((path) => isAbsolute(path ?? ''))) throw new Error('invalid path');
  if (homeDir !== undefined) {
    if (!isAbsolute(homeDir) || relative(resolve(homeDir), resolve(configDir)).startsWith('..') || isAbsolute(relative(resolve(homeDir), resolve(configDir)))) throw new Error('invalid path');
    await ensureNoFollowDirectory(homeDir);
  }
  let source;
  let parsed;
  if (claudeTarget) {
    try { source = await readFile(template, 'utf8'); parsed = JSON.parse(source); } catch { throw new Error('invalid template'); }
    if ((source.match(/__MEMORY_PROXY_BASE_URL__/g) ?? []).length !== 1 || !parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !parsed.env || typeof parsed.env !== 'object' || Array.isArray(parsed.env) || parsed.env.ANTHROPIC_BASE_URL !== '__MEMORY_PROXY_BASE_URL__' || parsed.env.TDAI_MEMORY_PROXY_BASE_URL !== undefined || hasCredential(parsed)) throw new Error('invalid template');
  }
  let bundle;
  try {
    const metadata = await lstat(bundleFile);
    if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1 || metadata.size > 16384) throw new Error();
    bundle = JSON.parse(await readFile(bundleFile, 'utf8'));
  } catch { throw new Error('invalid agent-bundle-file'); }
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle) || Object.keys(bundle).sort().join() !== 'identity,memory_user_key' || !keyPattern.test(bundle.memory_user_key)) throw new Error('invalid agent-bundle-file');
  const key = bundle.memory_user_key;
  const identity = bundle.identity;
  const identityFields = ['service_id', 'team_id', 'user_id', 'agent_id', 'task_id', 'session_id', 'display_name'];
  const idFields = identityFields.filter((name) => name !== 'display_name');
  if (!identity || typeof identity !== 'object' || Array.isArray(identity) || Object.keys(identity).sort().join() !== [...identityFields].sort().join() || identity.service_id !== spaceId || !idFields.every((name) => identityPattern.test(identity[name])) || !validDisplayName(identity.display_name)) throw new Error('invalid agent-bundle-file');
  let output;
  let filename;
  if (claudeTarget) {
    const expectedBaseUrl = `${urls[target]}/${spaceId}`;
    const rendered = source.replace('__MEMORY_PROXY_BASE_URL__', expectedBaseUrl);
    if (/__[A-Z0-9_]+__/.test(rendered)) throw new Error('invalid template');
    try { output = JSON.parse(rendered); } catch { throw new Error('invalid template'); }
    if (!output.env || typeof output.env !== 'object' || Array.isArray(output.env) || output.env.ANTHROPIC_BASE_URL !== expectedBaseUrl) throw new Error('invalid template');
    output.env.ANTHROPIC_AUTH_TOKEN = key;
    output.env.TDAI_MEMORY_PROXY_BASE_URL = toolUrls[target];
    output.env.ANTHROPIC_CUSTOM_HEADERS = [
      `x-team-id: ${identity.team_id}`,
      `x-agent-id: ${identity.agent_id}`,
      `x-task-id: ${identity.task_id}`,
      `x-conversation-id: ${identity.session_id}`,
    ].join('\n');
    filename = 'settings.json';
  } else if (target === 'opencode') {
    output = {
      $schema: 'https://opencode.ai/config.json',
      provider: {
        'memory-anthropic': {
          npm: '@ai-sdk/anthropic',
          name: 'MemoryProxy OpenCode',
          options: {
            baseURL: `http://memory-proxy:8096/opencode/${spaceId}/v1`,
            authToken: '{env:MEMORY_USER_KEY}',
            headers: {
              'x-team-id': '{env:MEMORY_TEAM_ID}',
              'x-agent-id': '{env:MEMORY_AGENT_ID}',
              'x-task-id': '{env:MEMORY_TASK_ID}',
              'x-conversation-id': '{env:MEMORY_SESSION_ID}',
            },
          },
          models: { 'deepseek-v4-pro': { name: 'MemoryProxy DeepSeek Pro', limit: { context: 128000, output: 8192 } } },
        },
      },
      model: 'memory-anthropic/deepseek-v4-pro',
    };
    filename = 'opencode.json';
  } else {
    output = {
      providers: {
        'memory-anthropic': {
          baseUrl: `http://memory-proxy:8096/pi/${spaceId}`,
          api: 'anthropic-messages',
          apiKey: '$MEMORY_USER_KEY',
          authHeader: true,
          headers: {
            'x-team-id': '$MEMORY_TEAM_ID',
            'x-agent-id': '$MEMORY_AGENT_ID',
            'x-task-id': '$MEMORY_TASK_ID',
            'x-conversation-id': '$MEMORY_SESSION_ID',
          },
          models: [{ id: 'deepseek-v4-pro', name: 'MemoryProxy DeepSeek Pro', reasoning: true, input: ['text'], contextWindow: 128000, maxTokens: 8192 }],
        },
      },
    };
    filename = 'models.json';
  }
  const destination = join(configDir, filename);
  const temporary = join(configDir, `.${filename}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await ensureNoFollowDirectory(configDir);
    const previous = writes.get(destination) ?? Promise.resolve();
    const write = previous.catch(() => {}).then(async () => {
      await writeFile(temporary, JSON.stringify(output, null, 2), { encoding: 'utf8', mode: 0o600 });
      await chmod(temporary, 0o600).catch(() => {});
      await rename(temporary, destination);
      await chmod(destination, 0o600).catch(() => {});
    });
    writes.set(destination, write);
    try { await write; } finally { if (writes.get(destination) === write) writes.delete(destination); }
  } catch {
    await unlink(temporary).catch(() => {});
    throw new Error('cannot write settings');
  }
  return {
    environment: {
      MEMORY_USER_KEY: key,
      MEMORY_TEAM_ID: identity.team_id,
      MEMORY_AGENT_ID: identity.agent_id,
      MEMORY_TASK_ID: identity.task_id,
      MEMORY_SESSION_ID: identity.session_id,
    },
  };
}

if (isMain(import.meta)) {
  try {
    const value = args(process.argv.slice(2));
    await renderSettings({ target: value['--target'], template: value['--template'], configDir: value['--config-dir'], bundleFile: value['--agent-bundle-file'], spaceId: value['--space-id'] });
    process.stdout.write(JSON.stringify({ status: 'ok', target: value['--target'] }) + '\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
