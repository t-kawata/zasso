import { existsSync, readFileSync } from 'node:fs';

const PREFIX = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$/;

export function allocateRuleId(existingIds, prefix) {
  if (!PREFIX.test(prefix)) throw new Error('invalid rule prefix: ' + prefix);
  const pattern = new RegExp('^' + prefix + '-(\\d+)$');
  let highest = 0;
  for (const id of existingIds) {
    const match = pattern.exec(String(id));
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  let next = highest + 1;
  while (existingIds.has(prefix + '-' + next)) next++;
  return prefix + '-' + next;
}

export function loadLedger(path) {
  if (!existsSync(path)) return { ids: {} };
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function assignRuleIds({ existingIds, ledger, proposals }) {
  const result = { ...ledger, ids: { ...(ledger?.ids ?? {}) } };
  const known = new Set(existingIds);
  for (const proposal of proposals) {
    if (result.ids[proposal]) continue;
    const id = allocateRuleId(known, proposal.split('-')[0]);
    result.ids[proposal] = id;
    known.add(id);
  }
  return result;
}
