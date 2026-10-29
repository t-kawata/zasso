// PX-310 @verifies C002
// A prose fact the typed rows cannot support is preserved as contract_prose rather
// than deleted. The annotations document carries the prose for the step.
import test from 'node:test';
import assert from 'node:assert/strict';

import { migrateArtifactToV3 } from '../../.claude/scripts/smooth-sequences/lib/migrate-v3.mjs';

// [::TICKET::] PX-310 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-310 --for-spec --no-implementation-order`.
function minimalV3Artifact() {
  return {
    schema_version: 3,
    spec: { path: 'spec.md', sha256: 'spec-digest' },
    operations: [{ id: 'Op', disposition: 'active', result_object_classes: [] }],
    steps: [{
      id: 'A-1__Op',
      sequence: 'A-1',
      operation: 'Op',
      line: 1,
      quote: 'the step line',
      contract: {
        pre: [],
        post: [],
        invariants: [],
        consumes: [],
        produces: [],
        errors: [],
        crosses: [],
        authored: { pre: [], post: [], invariants: [], consumes: [], produces: [], errors: [] },
      },
    }],
    sequences: [],
    sections: [],
  };
}

test('C002 an annotation contract_prose is preserved on the step', () => {
  const artifact = minimalV3Artifact();
  const migrated = migrateArtifactToV3({
    artifact,
    treeManifest: { dependencies: { boundaries: [] } },
    allocateManifest: { contract_registry: [] },
    packages: [],
    sourceDigest: 'source',
    annotations: {
      contracts: {
        'A-1__Op': {
          pre: [],
          post: [],
          invariants: [],
          consumes: [],
          produces: [],
          errors: [],
          contract_prose: 'a prose fact no typed row carries',
        },
      },
    },
  });
  assert.equal(migrated.steps[0].contract_prose, 'a prose fact no typed row carries');
});
