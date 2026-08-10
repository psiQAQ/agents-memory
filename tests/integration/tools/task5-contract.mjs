import { createHash } from 'node:crypto';

export const stage1Sources = Object.freeze({ claude: 'claude-code', opencode: 'opencode', pi: 'pi' });

function validRunId(runId) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(runId ?? '');
}

export function stage1Marker(runId, client) {
  if (!validRunId(runId) || !Object.hasOwn(stage1Sources, client)) throw new Error('invalid Stage 1 marker');
  return `MEMORY_NONCE_${createHash('sha256').update(`${runId}:marker:${client}`).digest('hex').slice(0, 32).toUpperCase()}`;
}

export function stage1OperationDigest(runId, scenario, client, owner = '') {
  if (!validRunId(runId) || !['write', 'read'].includes(scenario) || !Object.hasOwn(stage1Sources, client) || (scenario === 'write' && owner) || (scenario === 'read' && (!Object.hasOwn(stage1Sources, owner) || owner === client))) throw new Error('invalid Stage 1 operation');
  return createHash('sha256').update(`${runId}:${scenario}:${client}:${owner}`).digest('hex');
}

export function stage1OperationHash(runId, scenario, client, owner = '') {
  const operation = `STAGE1_OP_${stage1OperationDigest(runId, scenario, client, owner).toUpperCase()}`;
  return createHash('sha256').update(operation).digest('hex');
}
