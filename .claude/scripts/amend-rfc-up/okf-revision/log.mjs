// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function appendRevisionLog({ outDir, entries = [], entry }) {
  const next = [...entries, entry].sort((left, right) => String(right.date).localeCompare(String(left.date)));
  const path = join(outDir, 'source/okf-log.json');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ schema: 'okf-log/v1', entries: next }, null, 2)}\n`);
  return next;
}
