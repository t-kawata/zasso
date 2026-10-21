import { test } from 'node:test';
import assert from 'node:assert/strict';

import { migrateArtifactToV3, renderArtifact } from '../../.claude/scripts/smooth-sequences/lib/migrate-v3.mjs';
import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import { loadWorkspace } from '../../.claude/scripts/smooth-sequences/lib/workspace.mjs';
import { materializeSmoothWorkspace, minimalV2Artifact } from './helpers/workspace-fixture.mjs';

/** The input the migration reads. */
// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-286 --for-spec --no-implementation-order`.
function migrationInput(workspace) {
  const loaded = loadWorkspace(workspace.root);
  return {
    artifact: loaded.artifact,
    treeManifest: loaded.treeManifest,
    allocateManifest: loaded.allocateManifest,
    packages: loaded.packages,
  };
}

/** A cited fact on one step. */
// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-286 --for-spec --no-implementation-order`.
function citedFact(stepId, line, quote, factId, text) {
  return { factId, text, source: { step: stepId, line, quote } };
}

/** The annotation for the producer step. */
// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-286 --for-spec --no-implementation-order`.
function producerContract() {
  return {
    pre: [],
    post: [citedFact('A-1__ProduceFact', 1, 'the producer derives order_id', 'order_id', 'order_id is derived')],
    invariants: [],
    consumes: [],
    produces: ['order_id'],
    errors: [],
    crosses: ['boundary-001'],
  };
}

/** The annotation for the consumer step. */
// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-286 --for-spec --no-implementation-order`.
function consumerContract() {
  return {
    pre: [citedFact('A-1__ConsumeFact', 2, 'the consumer reads order_id', 'order_id', 'order_id is present')],
    post: [],
    invariants: [],
    consumes: ['order_id'],
    produces: [],
    errors: [],
    crosses: ['boundary-001'],
  };
}

// @verifies C002
test('an annotation writes both the typed and the authored contract', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const v3 = migrateArtifactToV3({
      ...migrationInput(workspace),
      annotations: { contracts: { 'A-1__ProduceFact': producerContract() } },
    });
    const step = v3.steps.find((entry) => entry.id === 'A-1__ProduceFact');
    assert.deepEqual(step.contract.post.map((fact) => fact.factId), ['order_id']);
    assert.deepEqual(step.contract.authored.post.map((fact) => fact.factId), ['order_id']);
    assert.deepEqual(step.contract.crosses, ['boundary-001']);
    assert.equal(v3.migration.authorship['steps[].contract'].authored.includes('A-1__ProduceFact'), true);
    assert.equal(v3.migration.authorship['steps[].contract'].synthesized.includes('A-1__ConsumeFact'), true);
    assert.equal(typeof v3.migration.annotations_digest, 'string');
  } finally {
    workspace.remove();
  }
});

// @verifies C002
test('the same annotations produce byte-identical output', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const annotations = { contracts: { 'A-1__ProduceFact': producerContract() } };
    const first = migrateArtifactToV3({ ...migrationInput(workspace), annotations });
    const second = migrateArtifactToV3({ ...migrationInput(workspace), artifact: first, annotations });
    assert.equal(renderArtifact(second), renderArtifact(first));
    assert.equal(second.migration.annotations_digest, first.migration.annotations_digest);
    assert.equal(second.migration.source_digest, first.migration.source_digest);
  } finally {
    workspace.remove();
  }
});

// @verifies C002
test('a later annotations document merges into an existing v3 artifact', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const input = migrationInput(workspace);
    const first = migrateArtifactToV3({
      ...input,
      annotations: { contracts: { 'A-1__ProduceFact': producerContract() } },
    });
    const second = migrateArtifactToV3({
      ...input,
      artifact: first,
      annotations: { contracts: { 'A-1__ConsumeFact': consumerContract() } },
    });
    const producer = second.steps.find((entry) => entry.id === 'A-1__ProduceFact');
    const consumer = second.steps.find((entry) => entry.id === 'A-1__ConsumeFact');
    assert.deepEqual(producer.contract.authored.post.map((fact) => fact.factId), ['order_id']);
    assert.deepEqual(consumer.contract.authored.pre.map((fact) => fact.factId), ['order_id']);
    assert.deepEqual(second.migration.authorship['steps[].contract'].authored.sort(), ['A-1__ConsumeFact', 'A-1__ProduceFact']);
  } finally {
    workspace.remove();
  }
});

// @verifies C002
test('the v2 prose contract survives the annotation', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const v2 = minimalV2Artifact();
    const v3 = migrateArtifactToV3({
      ...migrationInput(workspace),
      annotations: { contracts: { 'A-1__ProduceFact': producerContract() } },
    });
    assert.equal(v3.steps[0].contract_prose, v2.steps[0].contract);
  } finally {
    workspace.remove();
  }
});

// @verifies C003
test('an uncited authored fact is refused', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    assert.throws(
      () => migrateArtifactToV3({
        ...migrationInput(workspace),
        annotations: {
          contracts: {
            'A-1__ProduceFact': {
              pre: [{ factId: 'x', text: 'x is required' }],
              post: [], invariants: [], consumes: [], produces: [], errors: [], crosses: [],
            },
          },
        },
      }),
      (error) => error.code === 'UNCITED_AUTHORED_FACT',
    );
  } finally {
    workspace.remove();
  }
});

// @verifies C003
test('an authored fact citing a different line is refused', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const contract = producerContract();
    contract.post[0].source.line = 99;
    assert.throws(
      () => migrateArtifactToV3({
        ...migrationInput(workspace),
        annotations: { contracts: { 'A-1__ProduceFact': contract } },
      }),
      (error) => error.code === 'UNCITED_AUTHORED_FACT',
    );
  } finally {
    workspace.remove();
  }
});

// @verifies C003
test('a cited ground is accepted and an uncited ground is refused', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const input = migrationInput(workspace);
    const v3 = migrateArtifactToV3({
      ...input,
      annotations: {
        boundary_grounds: [{
          boundary: 'boundary-001',
          ground: 'not crossed by an enumerated sequence',
          source: { reasonCode: 'canonical-object' },
        }],
      },
    });
    assert.equal(v3.boundary_grounds.length, 1);
    assert.throws(
      () => migrateArtifactToV3({
        ...input,
        annotations: { boundary_grounds: [{ boundary: 'boundary-001', ground: 'not crossed' }] },
      }),
      (error) => error.code === 'UNCITED_BOUNDARY_GROUND',
    );
    assert.throws(
      () => migrateArtifactToV3({
        ...input,
        annotations: {
          boundary_grounds: [{ boundary: 'boundary-001', ground: 'not crossed', source: { reasonCode: 'wrong-code' } }],
        },
      }),
      (error) => error.code === 'UNCITED_BOUNDARY_GROUND',
    );
  } finally {
    workspace.remove();
  }
});

/** The complete annotations for the two-step fixture. */
// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-286 --for-spec --no-implementation-order`.
function completeAnnotations() {
  return {
    contracts: {
      'A-1__ProduceFact': producerContract(),
      'A-1__ConsumeFact': consumerContract(),
    },
    operations: {
      ProduceFact: {
        registry_contribution: 'required',
        boundary_effects: [{ boundary: 'boundary-001', direction: 'provides' }],
      },
      ConsumeFact: {
        registry_contribution: 'required',
        boundary_effects: [{ boundary: 'boundary-001', direction: 'consumes' }],
      },
    },
    boundary_grounds: [{
      boundary: 'boundary-001',
      ground: 'the crossing is enumerated by both steps',
      source: { reasonCode: 'canonical-object' },
    }],
  };
}

// @verifies C002
test('a fully annotated v2 workspace runs enforce to pass', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const migrated = migrateArtifactToV3({
      ...migrationInput(workspace),
      annotations: completeAnnotations(),
    });
    const migratedWorkspace = materializeSmoothWorkspace({ artifact: migrated });
    try {
      const result = runCommand([migratedWorkspace.root], { stdout: () => {}, stderr: () => {} });
      assert.equal(result.exitCode, 0);
      assert.equal(result.report.verdict, 'pass');
      assert.deepEqual(result.report.blocked, []);
      assert.equal(result.report.findings.length, 0);
    } finally {
      migratedWorkspace.remove();
    }
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('a partially annotated v2 workspace exits 4 with the authored count', () => {
  const workspace = materializeSmoothWorkspace({ artifact: minimalV2Artifact() });
  try {
    const migrated = migrateArtifactToV3({
      ...migrationInput(workspace),
      annotations: { contracts: { 'A-1__ProduceFact': producerContract() } },
    });
    const migratedWorkspace = materializeSmoothWorkspace({ artifact: migrated });
    try {
      const result = runCommand([migratedWorkspace.root], { stdout: () => {}, stderr: () => {} });
      assert.equal(result.exitCode, 4);
      assert.equal(result.report.verdict, 'unproven');
      assert.ok(result.report.blocked.some((entry) => entry.reason.includes('authored 1/2')));
      assert.equal(result.report.findings.some((finding) => finding.checkId === 'S5.authored-source-missing'), false);
    } finally {
      migratedWorkspace.remove();
    }
  } finally {
    workspace.remove();
  }
});
