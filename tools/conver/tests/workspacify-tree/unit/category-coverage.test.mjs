// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C005
// [::TICKET::] PX-183: workspacify-tree category inventory and coverage gate tests.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-183 --for-spec --no-implementation-order`

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildHeadingTree } from '../../../.claude/scripts/workspacify-tree/lib/headings.mjs';
import { segmentAtHeadings } from '../../../.claude/scripts/workspacify-tree/lib/segmentation.mjs';
import { harvestCategoryInventory } from '../../../.claude/scripts/workspacify-tree/lib/extraction.mjs';
import { runOwnershipChecks } from '../../../.claude/scripts/workspacify-tree/lib/ownership.mjs';
import { findOverSplitRisks } from '../../../.claude/scripts/workspacify-tree/lib/boundary-review.mjs';
import { runGatePipeline } from '../../../.claude/scripts/workspacify-tree/lib/validation.mjs';

function analyze(sourceText) {
  const headings = buildHeadingTree(sourceText.split('\n'), undefined, { sourceText });
  const { segments } = segmentAtHeadings({ sourceText, headings }, { segmentLevel: 2 });
  return { sourceText, headings, segments };
}

test('category C001 [@verifies C001]: invariant error and test markers yield separate categories', () => {
  const { sourceText, headings, segments } = analyze('# T\n## R\n不変条件: b >= 0.\nエラーコード E1.\n検査対象: the ledger.\n');
  const categories = harvestCategoryInventory({ sourceText, headings, segments });
  assert.ok(categories.invariants.length >= 1);
  assert.ok(categories.errorCodes.length >= 1);
  assert.ok(categories.requiredTests.length >= 1);
});

test('ownership C002 [@verifies C002]: unassigned category items count as unallocated', () => {
  const result = runOwnershipChecks({
    invariants: [{ id: 'inv-1' }],
    errorCodes: [{ id: 'err-1' }],
    requiredTests: [{ id: 'tst-1' }],
    packages: [],
  });
  assert.ok(result.unallocated_count >= 3);
  assert.equal(result.invariant_orphan_count, 1);
});

test('tree C003 [@verifies C003]: non-empty workspace without a tree fails the gate', () => {
  const pipeline = runGatePipeline({
    structure: { reconstruction: { status: 'PASS' } },
    inventory: {},
    workspace: {
      packages: [{ id: 'pkg-a', name: 'a', path: 'crates/a', layer: 'protocol', kind: 'production-library', responsibilities: ['x'], seed_required: true }],
    },
    dependencies: {},
    decisions: { approvals: [] },
  });
  assert.notEqual(pipeline.status, 'COMPLETE');
});

test('boundary C004 [@verifies C004]: an edge without a boundary fails coverage', () => {
  const packages = [
    { id: 'a', name: 'a', path: 'crates/a', layer: 'protocol', kind: 'production-library', responsibilities: ['x'], seed_required: true },
    { id: 'b', name: 'b', path: 'crates/b', layer: 'protocol', kind: 'production-library', responsibilities: ['x'], seed_required: true },
  ];
  const tree = [
    { name: 'crates', path: 'crates', kind: 'dir', children: [
      { name: 'a', path: 'crates/a', kind: 'dir', children: [] },
      { name: 'b', path: 'crates/b', kind: 'dir', children: [] },
    ] },
  ];
  const pipeline = runGatePipeline({
    structure: { reconstruction: { status: 'PASS' } },
    inventory: {},
    workspace: { packages, tree },
    dependencies: { normalEdges: [{ from: 'a', to: 'b' }], boundaries: [] },
    decisions: { approvals: [] },
  });
  assert.notEqual(pipeline.status, 'COMPLETE');
});

test('parity C005 [@verifies C005]: a package-bearing manifest without a tree is rejected by the entry gate', async () => {
  const { checkTreeEntryGate } = await import('../../../.claude/scripts/workspacify-tree/lib/entry-parity.mjs');
  const treeLess = {
    artifact_kind: 'workspacify-tree-manifest',
    status: 'COMPLETE',
    schema_version: '1.0.0',
    integrity: { manifest_hash: '', reload_validation: 'PASS' },
    input: {},
    workspace: { packages: [{ id: 'a', name: 'a', path: 'crates/a', layer: 'protocol', kind: 'production-library' }] },
    dependencies: { orientation: 'consumer_to_direct_dependency', normal_edges: [], boundaries: [] },
    stage2_handoff: { eligible: true, entry_gate: { required_status: 'COMPLETE' }, contract_definition_order: [], contract_boundaries: [] },
    final_audit: {},
  };
  const gate = checkTreeEntryGate(treeLess, 'tests/workspacify-tree/fixtures/gaia-like-spec.md');
  assert.equal(gate.ok, false);
  assert.ok(gate.errors.some((message) => message.includes('tree')));
});

test('over-split C003 [@verifies C003]: a package owning invariants or tests without objects is not a no-owner risk', () => {
  const risks = findOverSplitRisks([{ id: 'p', name: 'p', path: 'crates/p', layer: 'protocol', kind: 'production-library', owns: { objects: [], claims: [], invariants: ['inv-1'], required_tests: ['tst-1'] } }]);
  assert.ok(!risks.some((r) => r.kind === 'no-owner' && r.packageId === 'p'));
});

test('over-split C003 boundary [@verifies C003]: a package owning nothing is still flagged', () => {
  const risks = findOverSplitRisks([{ id: 'q', name: 'q', path: 'crates/q', layer: 'protocol', kind: 'production-library', owns: { objects: [], claims: [] } }]);
  assert.ok(risks.some((r) => r.kind === 'no-owner' && r.packageId === 'q'));
});
