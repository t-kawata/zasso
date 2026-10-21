// @verifies C005
// @verifies C006
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyContractOrigin,
  migrateArtifactToV3,
} from '../../.claude/scripts/smooth-sequences/lib/migrate-v3.mjs';
import { readAuthoredContract } from '../../.claude/scripts/smooth-sequences/lib/checks-layer-b.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import { materializeSmoothWorkspace, minimalV2Artifact } from './helpers/workspace-fixture.mjs';

// [::TICKET::] PX-288 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-288 --for-spec --no-implementation-order`.
function migrationInput(workspace) {
  const loaded = loadWorkspace(workspace.root);
  return {
    artifact: loaded.artifact,
    treeManifest: loaded.treeManifest,
    allocateManifest: loaded.allocateManifest,
    packages: loaded.packages,
  };
}

test('classification is equality of the canonical contract', () => {
  assert.equal(classifyContractOrigin({ pre: [], post: [{ factId: 'a' }] }, { post: [{ factId: 'a' }], pre: [] }), 'synthesized');
  assert.equal(classifyContractOrigin({ pre: [], post: [{ factId: 'b' }] }, { pre: [], post: [{ factId: 'a' }] }), 'authored');
});

test('a v2 migration without annotations marks every derived contract synthesized', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const v3 = migrateArtifactToV3(migrationInput(workspace));
    const record = v3.migration.authorship['steps[].contract.authored'];
    assert.deepEqual(record.authored, []);
    assert.deepEqual(record.synthesized, ['A-1__ProduceFact', 'A-1__ConsumeFact']);
    assert.equal(v3.steps.every((step) => step.contract.contract_origin === 'synthesized'), true);
  } finally {
    workspace.remove();
  }
});

test('an explicit annotation is authored even when it coincides with the projection', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const v3 = migrateArtifactToV3({
      ...migrationInput(workspace),
      annotations: {
        contracts: {
          'A-1__ProduceFact': {
            pre: [],
            post: [{ factId: 'order_id', text: 'order_id is derived', source: { step: 'A-1__ProduceFact', line: 1, quote: 'the producer derives order_id' } }],
            invariants: [],
            consumes: [],
            produces: ['order_id'],
            errors: [],
            crosses: ['boundary-001'],
          },
        },
      },
    });
    const producer = v3.steps.find((step) => step.id === 'A-1__ProduceFact');
    const consumer = v3.steps.find((step) => step.id === 'A-1__ConsumeFact');
    assert.equal(producer.contract.contract_origin, 'authored');
    assert.equal(consumer.contract.contract_origin, 'synthesized');
    assert.notEqual(readAuthoredContract(producer), null);
    assert.equal(readAuthoredContract(consumer), null);
  } finally {
    workspace.remove();
  }
});

test('sequence flow and grounded object annotations survive migration', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const v3 = migrateArtifactToV3({
      ...migrationInput(workspace),
      annotations: {
        sequence_flow_grounds: ['A-1'],
        grounded_objects: [{ object: 'object:Order', ground: 'the order leaves the enumerated sequences as an external output' }],
      },
    });
    assert.deepEqual(v3.sequence_flow_grounds, [{ sequence: 'A-1' }]);
    assert.ok(v3.groundedObjects.some((entry) => entry.object === 'object:Order'));
  } finally {
    workspace.remove();
  }
});
