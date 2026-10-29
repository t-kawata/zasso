// PX-306 @verifies C001
// An authored fact must be supported by the step quote or by the typed row it cites. A
// registry clause copied into a step is a projection, not prose, and must be typed as such
// so the boundary meshing never compares the registry with itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MIN_FACT_SUPPORT_RATIO,
  classifyContractOrigin,
  isFactTextSupported,
  migrateArtifactToV3,
  normalizeAuthoredContract,
} from '../../.claude/scripts/smooth-sequences/lib/migrate-v3.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import { materializeSmoothWorkspace, minimalV2Artifact } from './helpers/workspace-fixture.mjs';

// [::TICKET::] PX-306 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-306 --for-spec --no-implementation-order`.
function migrationInput(workspace) {
  const loaded = loadWorkspace(workspace.root);
  return {
    artifact: loaded.artifact,
    treeManifest: loaded.treeManifest,
    allocateManifest: loaded.allocateManifest,
    packages: loaded.packages,
  };
}

const step = { id: 'A-1__ProduceFact', line: 1, quote: 'the producer derives order_id' };

// [::TICKET::] PX-306 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-306 --for-spec --no-implementation-order`.
function contract(post) {
  return { pre: [], post, invariants: [], consumes: [], produces: [], errors: [], crosses: [] };
}

test('C001 a fact whose text is not supported by the quote is refused', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    assert.throws(
      () => migrateArtifactToV3({
        ...migrationInput(workspace),
        annotations: {
          contracts: {
            'A-1__ProduceFact': contract([{
              factId: 'billing',
              text: 'the invoice is settled by the billing service',
              source: { step: 'A-1__ProduceFact', line: 1, quote: 'the producer derives order_id' },
            }]),
          },
        },
      }),
      (error) => error.code === 'UNCITED_AUTHORED_FACT',
    );
  } finally {
    workspace.remove();
  }
});

test('C001 a paraphrase supported by the quote is accepted', () => {
  const normalized = normalizeAuthoredContract(contract([{
    factId: 'order_id',
    text: 'order_id is derived',
    source: { step: 'A-1__ProduceFact', line: 1, quote: 'the producer derives order_id' },
  }]), step);
  assert.equal(normalized.post[0].factId, 'order_id');
  assert.equal(MIN_FACT_SUPPORT_RATIO > 0, true);
});

test('C001 a registry projection is accepted only when its typed row supports it', () => {
  const registry = [{ boundary_id: 'boundary-001', clauses: { postconditions: ['order_id is derived'] } }];
  const normalized = normalizeAuthoredContract(contract([{
    factId: 'order_id',
    text: 'order_id is derived',
    origin: 'contract_registry',
    source: { step: 'A-1__ProduceFact', line: 1, quote: 'the producer derives order_id', boundaryId: 'boundary-001', field: 'postconditions' },
  }]), step, { contractRegistry: registry });
  assert.equal(normalized.post[0].origin, 'contract_registry');
  assert.equal(normalized.post[0].source.boundaryId, 'boundary-001');
});

test('C001 a registry claim the registry does not carry is refused', () => {
  const registry = [{ boundary_id: 'boundary-001', clauses: { postconditions: ['order_id is derived'] } }];
  assert.throws(
    () => normalizeAuthoredContract(contract([{
      factId: 'refund',
      text: 'the refund is issued',
      origin: 'contract_registry',
      source: { step: 'A-1__ProduceFact', line: 1, quote: 'the producer derives order_id', boundaryId: 'boundary-001', field: 'postconditions' },
    }]), step, { contractRegistry: registry }),
    (error) => error.code === 'UNCITED_AUTHORED_FACT',
  );
});

test('C001 support compares content tokens, not stopwords', () => {
  assert.equal(isFactTextSupported('order_id is derived', 'the producer derives order_id'), true);
  assert.equal(isFactTextSupported('the invoice is settled', 'the producer derives order_id'), false);
});

test('C001 a contract made only of typed projections is classified as projected', () => {
  const projected = { pre: [], post: [{ factId: 'order_id', text: 'order_id is derived', origin: 'contract_registry' }], invariants: [], consumes: [], produces: [], errors: [], crosses: [] };
  assert.equal(classifyContractOrigin(projected, { pre: [], post: [], invariants: [], consumes: [], produces: [], errors: [], crosses: [] }), 'projected');
});
