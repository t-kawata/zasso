// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { sha256Text } from '../revision/determinism.mjs';

export function writeConceptIdentity({ outDir, concepts }) {
  const records = {};
  for (const concept of concepts) {
    records[concept.id] = {
      path: concept.path,
      status: concept.status ?? 'added',
      new_body_sha256: sha256Text(concept.body ?? ''),
    };
  }
  writeJson(join(outDir, 'source/concept-identity.json'), { schema: 'okf-concept-identity/v1', concepts: records });
  return records;
}

export function writeArtifactMap({ outDir, artifacts = {} }) {
  writeJson(join(outDir, 'source/revision/artifact-map.json'), { schema: 'revision-artifact-map/v1', artifacts });
  return artifacts;
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
