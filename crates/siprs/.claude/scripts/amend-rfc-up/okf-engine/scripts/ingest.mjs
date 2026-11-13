// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
// @verifies C001
/**
 * Ingest is an explicit build action, not a runtime side effect.
 *
 * It measures one source and writes a pending record. The build command then
 * re-derives the lock and the OKF tree from the full source set.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { measureSources } from './lib/atoms.mjs';

export function ingestSource({ root, source, skillDir }) {
  const measured = measureSources({ root, paths: [source] });
  const record = {
    schema: 'okf-ingest/v1',
    source: measured.manifest[0],
    atoms: measured.atoms.length,
    claims: measured.claims.length,
  };
  const out = join(skillDir, 'source/ingest-pending.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
  return record;
}
