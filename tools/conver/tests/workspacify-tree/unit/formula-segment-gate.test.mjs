// PX-389 @verifies C001
// [::TICKET::] PX-389 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-389 --for-spec --no-implementation-order`.
/**
 * G3 must refuse a formula-bearing segment that no package covers.
 *
 * The S8 denominator is the specification formula set, so a tree manifest that publishes
 * without an owner for a formula segment hands smooth an unrepairable surface. The gate
 * counts the orphan under its own name and folds it into unallocated_count.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runGatePipeline } from '../../../.claude/scripts/workspacify-tree/lib/validation.mjs';

const PACKAGES = Object.freeze([
  { id: 'pkg-alpha', name: 'alpha', path: 'crates/alpha', layer: 'protocol', kind: 'production-library', responsibilities: ['own the alpha rule'], seed_required: true, owns: {} },
]);

const TREE = Object.freeze([
  { name: 'crates', path: 'crates', kind: 'dir', children: [{ name: 'alpha', path: 'crates/alpha', kind: 'dir', children: [] }] },
]);

// [::TICKET::] PX-389 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-389 --for-spec --no-implementation-order`.
function segments() {
  return [{
    id: 's-000001',
    line_start: 1,
    line_end: 6,
    owned_inventory_ids: [],
    formula_ids: ['fx-0123456789ab'],
  }];
}

// [::TICKET::] PX-389 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-389 --for-spec --no-implementation-order`.
function pipelineWith(segmentOwnership) {
  return runGatePipeline({
    structure: { reconstruction: { status: 'PASS' }, headings: [], segments: segments(), spec_pulse: { candidates: [] } },
    inventory: {},
    workspace: { packages: PACKAGES, tree: TREE },
    dependencies: {},
    adapters: {},
    decisions: { approvals: [], segment_ownership: segmentOwnership },
    review: { candidates: [] },
  });
}

test('C001 invariant: an unclaimed formula segment is a named G3 orphan', () => {
  const pipeline = pipelineWith([]);

  assert.equal(pipeline.finalAudit.formula_segment_orphan_count, 1);
  assert.ok(pipeline.finalAudit.unallocated_count >= 1);
  const g3 = pipeline.gates.find((gate) => gate.id === 'G3');
  assert.equal(g3.status === 'PASS', false);
  assert.equal(g3.reasons.some((reason) => reason.includes('FORMULA_SEGMENT_UNOWNED')), true, JSON.stringify(g3.reasons));
});

test('C001 postcondition: a grounded claim clears the G3 count', () => {
  const pipeline = pipelineWith([{
    segmentId: 's-000001',
    packageId: 'pkg-alpha',
    source: { line: 3, quote: 'The alpha rule is normative.' },
  }]);

  assert.equal(pipeline.finalAudit.formula_segment_orphan_count ?? 0, 0);
});

test('C001 boundary: a segment with no formula is not counted', () => {
  const pipeline = runGatePipeline({
    structure: {
      reconstruction: { status: 'PASS' },
      headings: [],
      segments: [{ id: 's-000001', line_start: 1, line_end: 6, owned_inventory_ids: [] }],
      spec_pulse: { candidates: [] },
    },
    inventory: {},
    workspace: { packages: PACKAGES, tree: TREE },
    dependencies: {},
    adapters: {},
    decisions: { approvals: [] },
    review: { candidates: [] },
  });

  assert.equal(pipeline.finalAudit.formula_segment_orphan_count ?? 0, 0);
});
