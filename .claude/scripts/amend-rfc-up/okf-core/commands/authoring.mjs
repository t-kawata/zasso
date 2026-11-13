// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
/**
 * Authoring commands write a bundle from a model.
 */

import { writeConcept } from '../authoring/write.mjs';
import { writeDirectoryIndexes } from '../authoring/index.mjs';
import { writeLog } from '../authoring/log.mjs';

export function writeBundle({ outDir, concepts, logEntries = [] }) {
  for (const concept of concepts) writeConcept({ outDir, concept });
  writeLog({ outDir, entries: logEntries });
  return { concepts: concepts.length, logEntries: logEntries.length };
}

export function writeIndexes({ bundle, outDir }) {
  writeDirectoryIndexes({ bundle, outDir });
}

export function writeBundleLog({ outDir, entries }) {
  writeLog({ outDir, entries });
}

export { writeConcept };
