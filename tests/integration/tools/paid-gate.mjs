import { realpath, stat, readFile } from 'node:fs/promises';
import { basename, isAbsolute, relative, sep } from 'node:path';
import { isMain } from './runtime-lib.mjs';

function invalid(name) { throw new Error(`invalid ${name}`); }

export async function validatePaidGate(environment = process.env) {
  const { RUN_PAID_LLM, DEEPSEEK_SECRET_FILE, REAL_LLM_MAX_BUDGET_USD, REAL_LLM_MAX_TURNS, RUN_ID, EVIDENCE_DIR, PROJECT_ROOT } = environment;
  if (RUN_PAID_LLM !== '1') invalid('RUN_PAID_LLM');
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(REAL_LLM_MAX_BUDGET_USD ?? '') || !Number.isFinite(Number(REAL_LLM_MAX_BUDGET_USD)) || Number(REAL_LLM_MAX_BUDGET_USD) <= 0) invalid('REAL_LLM_MAX_BUDGET_USD');
  if (!/^[1-9]\d*$/.test(REAL_LLM_MAX_TURNS ?? '')) invalid('REAL_LLM_MAX_TURNS');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(RUN_ID ?? '')) invalid('RUN_ID');
  if (![DEEPSEEK_SECRET_FILE, EVIDENCE_DIR, PROJECT_ROOT].every(isAbsolute)) invalid('path');
  let root;
  let secretFile;
  let evidence;
  try { [root, secretFile, evidence] = await Promise.all([realpath(PROJECT_ROOT), realpath(DEEPSEEK_SECRET_FILE), realpath(EVIDENCE_DIR)]); } catch { invalid('path'); }
  let secretStat;
  let evidenceStat;
  let rootStat;
  try { [rootStat, secretStat, evidenceStat] = await Promise.all([stat(root), stat(secretFile), stat(evidence)]); } catch { invalid('path'); }
  if (!rootStat.isDirectory()) invalid('PROJECT_ROOT');
  if (!secretStat.isFile()) invalid('DEEPSEEK_SECRET_FILE');
  if (!evidenceStat.isDirectory() || basename(evidence) !== RUN_ID) invalid('EVIDENCE_DIR');
  const fromRoot = relative(root, secretFile);
  if (!fromRoot || (!fromRoot.startsWith(`..${sep}`) && fromRoot !== '..' && !isAbsolute(fromRoot))) invalid('DEEPSEEK_SECRET_FILE');
  let secret;
  try { secret = (await readFile(secretFile, 'utf8')).trim(); } catch { invalid('DEEPSEEK_SECRET_FILE'); }
  if (!secret || /[\r\n]/.test(secret)) invalid('DEEPSEEK_SECRET_FILE');
}

if (isMain(import.meta)) {
  try {
    await validatePaidGate();
    process.stdout.write('{"status":"ready"}\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
