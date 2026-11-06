// PX-383 @verifies C002
// A fact may cite the operation line the specification states, not only the token a
// step was read from. The citation is mechanical: the line must exist, the quote must
// be on it, and a one-word restatement is refused as vacuous.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  migrateArtifactToV3,
  normalizeAuthoredContract,
} from '../../.claude/scripts/smooth-sequences/lib/migrate-v3.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import { materializeSmoothWorkspace, minimalV2Artifact } from './helpers/workspace-fixture.mjs';

const SPEC_LINES = { 'spec.md': ['the producer derives order_id'] };

/** The input the migration reads. */
// [::TICKET::] PX-383 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-383 --for-spec --no-implementation-order`.
function migrationInput(workspace) {
  const loaded = loadWorkspace(workspace.root);
  return {
    artifact: loaded.artifact,
    treeManifest: loaded.treeManifest,
    allocateManifest: loaded.allocateManifest,
    packages: loaded.packages,
  };
}

/** The producer step's operation-level contract. */
// [::TICKET::] PX-383 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-383 --for-spec --no-implementation-order`.
function producerContract(overrides = {}) {
  return {
    pre: [],
    post: [{
      factId: 'order_id',
      text: 'order_id is derived',
      source: { operation: 'ProduceFact', line: 1, quote: 'the producer derives order_id' },
    }],
    invariants: [],
    consumes: [],
    produces: ['order_id'],
    errors: [],
    crosses: [],
    ...overrides,
  };
}

test('C002 an operation-level citation is accepted when its quote is on the operation line', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const migrated = migrateArtifactToV3({
      ...migrationInput(workspace),
      annotations: { contracts: { 'A-1__ProduceFact': producerContract() } },
      specLines: SPEC_LINES,
    });

    const step = migrated.steps.find((entry) => entry.id === 'A-1__ProduceFact');
    assert.equal(step.contract.post[0].source.operation, 'ProduceFact');
    assert.equal(migrated.migration.authorship['steps[].contract'].authored.includes('A-1__ProduceFact'), true);
  } finally {
    workspace.remove();
  }
});

test('C002 a quote absent from the operation line is refused', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    assert.throws(
      () => migrateArtifactToV3({
        ...migrationInput(workspace),
        annotations: {
          contracts: {
            'A-1__ProduceFact': producerContract({
              post: [{
                factId: 'order_id',
                text: 'order_id is derived',
                source: { operation: 'ProduceFact', line: 1, quote: 'a line the specification does not carry' },
              }],
            }),
          },
        },
        specLines: SPEC_LINES,
      }),
      (error) => error.code === 'UNCITED_AUTHORED_FACT',
    );
  } finally {
    workspace.remove();
  }
});

test('C002 an operation citation for another operation is refused', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    assert.throws(
      () => migrateArtifactToV3({
        ...migrationInput(workspace),
        annotations: {
          contracts: {
            'A-1__ProduceFact': producerContract({
              post: [{
                factId: 'order_id',
                text: 'order_id is derived',
                source: { operation: 'ConsumeFact', line: 1, quote: 'the producer derives order_id' },
              }],
            }),
          },
        },
        specLines: SPEC_LINES,
      }),
      (error) => error.code === 'UNCITED_AUTHORED_FACT',
    );
  } finally {
    workspace.remove();
  }
});

test('C002 a one-word quote restatement is refused as vacuous', () => {
  const step = {
    id: 'A-1__ProduceFact',
    operation: 'ProduceFact',
    line: 1,
    quote: 'validate',
  };

  assert.throws(
    () => normalizeAuthoredContract(
      { post: [{ factId: 'x', text: 'validate', source: { step: step.id, line: step.line, quote: 'validate' } }] },
      step,
    ),
    (error) => error.code === 'VACUOUS_AUTHORED_FACT',
  );
});

test('C002 the existing step-level citation still passes', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const migrated = migrateArtifactToV3({
      ...migrationInput(workspace),
      annotations: {
        contracts: {
          'A-1__ProduceFact': producerContract({
            post: [{
              factId: 'order_id',
              text: 'order_id is derived',
              source: { step: 'A-1__ProduceFact', line: 1, quote: 'the producer derives order_id' },
            }],
          }),
        },
      },
      specLines: SPEC_LINES,
    });

    assert.equal(migrated.steps.find((entry) => entry.id === 'A-1__ProduceFact').contract.post[0].factId, 'order_id');
  } finally {
    workspace.remove();
  }
});
