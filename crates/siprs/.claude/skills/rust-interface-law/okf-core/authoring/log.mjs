/**
 * Write a dated log. The date is explicit; the clock is never read.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function writeLog({ outDir, entries = [] }) {
  const byDate = new Map();
  for (const entry of entries) {
    if (!isDate(entry.date)) throw new Error(`invalid log date: ${entry.date}`);
    if (!byDate.has(entry.date)) byDate.set(entry.date, []);
    byDate.get(entry.date).push(entry.text);
  }
  const dates = [...byDate.keys()].sort((left, right) => right.localeCompare(left));
  const lines = ['# Knowledge Log', ''];
  for (const date of dates) {
    lines.push(`## ${date}`);
    for (const text of byDate.get(date)) lines.push(`- ${text}`);
    lines.push('');
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'log.md'), `${lines.join('\n').replace(/\n+$/, '')}\n`);
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function isDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
