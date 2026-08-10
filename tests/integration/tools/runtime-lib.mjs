import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function isMain(meta, entry = process.argv[1]) {
  return Boolean(entry) && fileURLToPath(meta.url) === resolve(entry);
}
