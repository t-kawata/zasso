// [::TICKET::] PX-200, PX-202 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-200|PX-202) --for-spec --no-implementation-order`.
// PX-200 @verifies C001
// The review reports observations about the dependency graph and the boundaries. It
// never edits the graph, never grades and never decides: the AI records a decision.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildDependencyReview, REVIEW_KINDS } from '../../../.claude/scripts/workspacify-tree/lib/dependency-review.mjs';

function reviewInput(overrides = {}) {
  return {
    packages: [
      { id: 'pkg-a', name: 'a', path: 'crates/protocol/a', layer: 'protocol', kind: 'production-library', responsibilities: ['x'], seed_required: true, owns: { objects: ['obj-1'] } },
      { id: 'pkg-b', name: 'b', path: 'crates/protocol/b', layer: 'protocol', kind: 'production-library', responsibilities: ['y'], seed_required: true, owns: { objects: ['obj-2'] } },
    ],
    normalEdges: [{ from: 'pkg-b', to: 'pkg-a', reasonCode: 'canonical-object', reason: 'b consumes a' }],
    forbiddenEdges: [],
    boundaries: [{ id: 'boundary-001', consumer_package: 'pkg-b', provider_package: 'pkg-a', stage2_contract_scope: ['input'] }],
    ownershipEntries: [
      { inventory_ref: 'obj-1', canonical_name: 'obj-1', category: 'object', owner_package: 'pkg-a' },
      { inventory_ref: 'obj-2', canonical_name: 'obj-2', category: 'object', owner_package: 'pkg-b' },
    ],
    ...overrides,
  };
}

test('C001 the review reports edges that serialize implementation without carrying material', () => {
  const review = buildDependencyReview(reviewInput());
  const candidate = review.candidates.find((entry) => entry.kind === 'unnecessary_serialization');
  assert.ok(candidate, JSON.stringify(review.candidates));
  assert.match(candidate.id, /^review-\d{6}$/);
  assert.ok(candidate.observation.endsWith('.'));
  assert.ok(candidate.evidence_refs.length > 0);
  assert.equal(typeof candidate.grade, 'undefined', 'the review never grades');
  assert.ok(REVIEW_KINDS.includes(candidate.kind));
});

test('C001 a forbidden edge with a viable alternative is reported, and a shared-material edge is not serializing wastefully', () => {
  const forbidden = buildDependencyReview(reviewInput({
    normalEdges: [],
    boundaries: [],
    forbiddenEdges: [{ from: 'pkg-b', to: 'pkg-a', reasonCode: 'forbidden-layer', reason: 'must not couple', alternative: 'port-injection' }],
  }));
  assert.ok(forbidden.candidates.some((entry) => entry.kind === 'forbidden_edge_alternative'), JSON.stringify(forbidden.candidates));

  // An edge into a package that owns nothing is a composition question, not a value
  // dependency, so it is not flagged as serialization.
  const shared = buildDependencyReview(reviewInput({
    ownershipEntries: [
      { inventory_ref: 'obj-1', canonical_name: 'obj-1', category: 'object', owner_package: 'pkg-a' },
      { inventory_ref: 'obj-2', canonical_name: 'obj-2', category: 'object', owner_package: 'pkg-a' },
    ],
  }));
  assert.equal(shared.candidates.some((entry) => entry.kind === 'unnecessary_serialization'), false, JSON.stringify(shared.candidates));
});

test('C001 mutually dependent packages and a dominant provider are reported', () => {
  const mutual = buildDependencyReview(reviewInput({
    normalEdges: [
      { from: 'pkg-b', to: 'pkg-a', reasonCode: 'canonical-object', reason: 'b consumes a' },
      { from: 'pkg-a', to: 'pkg-b', reasonCode: 'canonical-object', reason: 'a consumes b' },
    ],
  }));
  assert.ok(mutual.candidates.some((entry) => entry.kind === 'under_split_pair'), JSON.stringify(mutual.candidates));

  const wide = buildDependencyReview({
    packages: [
      { id: 'pkg-hub', name: 'hub', path: 'crates/protocol/hub', layer: 'protocol', kind: 'production-library', responsibilities: ['x'], seed_required: true, owns: { objects: ['obj-1'] } },
      { id: 'pkg-c1', name: 'c1', path: 'crates/protocol/c1', layer: 'protocol', kind: 'production-library', responsibilities: ['y'], seed_required: true, owns: { objects: ['obj-2'] } },
      { id: 'pkg-c2', name: 'c2', path: 'crates/protocol/c2', layer: 'protocol', kind: 'production-library', responsibilities: ['z'], seed_required: true, owns: { objects: ['obj-3'] } },
    ],
    normalEdges: [
      { from: 'pkg-c1', to: 'pkg-hub', reasonCode: 'canonical-object', reason: 'c1 consumes hub' },
      { from: 'pkg-c2', to: 'pkg-hub', reasonCode: 'canonical-object', reason: 'c2 consumes hub' },
    ],
    forbiddenEdges: [],
    boundaries: [],
    ownershipEntries: [
      { inventory_ref: 'obj-1', canonical_name: 'obj-1', category: 'object', owner_package: 'pkg-hub' },
      { inventory_ref: 'obj-2', canonical_name: 'obj-2', category: 'object', owner_package: 'pkg-c1' },
      { inventory_ref: 'obj-3', canonical_name: 'obj-3', category: 'object', owner_package: 'pkg-c2' },
    ],
  });
  assert.ok(wide.candidates.some((entry) => entry.kind === 'interface_instability'), JSON.stringify(wide.candidates));
});

test('C001 the review is deterministic, id-ordered and empty for a graph with nothing to report', () => {
  const first = buildDependencyReview(reviewInput());
  const second = buildDependencyReview(reviewInput());
  assert.deepEqual(second, first);
  first.candidates.forEach((candidate, index) => {
    assert.equal(candidate.id, `review-${String(index + 1).padStart(6, '0')}`);
  });
  assert.deepEqual(buildDependencyReview(reviewInput({ normalEdges: [], boundaries: [], packages: [reviewInput().packages[0]] })).candidates, []);
});
