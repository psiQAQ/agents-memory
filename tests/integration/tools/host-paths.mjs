import { realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const repositoryPath = fileURLToPath(new URL('../../../', import.meta.url));

export async function requireHostRepositoryRoot(value) {
  let expected;
  try { expected = await realpath(repositoryPath); } catch { throw new Error('invalid PROJECT_ROOT'); }
  if (value !== expected) throw new Error('invalid PROJECT_ROOT');
  return expected;
}
