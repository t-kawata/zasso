// [::TICKET::] PX-202 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-202 --for-spec --no-implementation-order`.
// PX-202 @verifies C005
// Forbidden edges were published but never handed to the checks, so the count that
// claims to reflect them was structurally zero and the "declared both ways" branch
// could not fire.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runGatePipeline } from '../../../.claude/scripts/workspacify-tree/lib/validation.mjs';

const owns = (objects) => ({ objects, claims: [], invariants: [], state_machines: [], error_codes: [], required_tests: [] });
const packages = () => [
  { id: 'pkg-a', name: 'alpha', path: 'crates/protocol/alpha', layer: 'protocol', kind: 'production-library', responsibilities: ['x'], seed_required: true, owns: owns(['obj-000001']) },
  { id: 'pkg-b', name: 'beta', path: 'crates/protocol/beta', layer: 'protocol', kind: 'production-library', responsibilities: ['y'], seed_required: true, owns: owns(['obj-000002']) },
];
const inventory = () => {
  const traced = (id, owner) => ({ id, canonical_name: id, owner_package: owner, source_refs: [{ segment_id: 's-000001', line_start: 1, line_end: 1 }] });
  return {
    objects: [traced('obj-000001', 'pkg-a'), traced('obj-000002', 'pkg-b')],
    claims: [], invariants: [], stateMachines: [], errorCodes: [], requiredTests: [], terms: [], unresolved_candidates: [],
  };
};
const decisionInput = () => ({
  approvals: [], ownership: [{ objectId: 'obj-000001', packageId: 'pkg-a' }, { objectId: 'obj-000002', packageId: 'pkg-b' }],
  semantic_review: { status: 'APPROVED', statement: 'reviewed the coupling', approver: 'px-202' },
  spec_defects: [], residual_questions: [], dependency_reviews: [],
});
const tree = () => [{ name: 'crates', path: 'crates', kind: 'dir', children: [{ name: 'protocol', path: 'crates/protocol', kind: 'dir', children: [{ name: 'alpha', path: 'crates/protocol/alpha', kind: 'dir', children: [] }, { name: 'beta', path: 'crates/protocol/beta', kind: 'dir', children: [] }] }] }];

function pipelineInput({ normalEdges, forbiddenEdges, boundaries }) {
  return {
    structure: { reconstruction: { status: 'PASS' }, segments: [], spec_pulse: { candidates: [] } },
    inventory: inventory(),
    workspace: { packages: packages(), tree: tree() },
    dependencies: { normalEdges, forbiddenEdges, boundaries },
    adapters: { databasePolicy: { applicable: false } },
    decisions: decisionInput(),
    review: { candidates: [] },
  };
}

// Boundaries travel in the decisions shape: consumer/provider, as the payload declares them.
const boundary = (consumer, provider) => ({
  id: 'boundary-001', consumer, provider, dependencyReasonCode: 'canonical-object',
});

test('C005 a published forbidden edge reaches the gate and is counted as received', () => {
  const { gates, finalAudit } = runGatePipeline(pipelineInput({
    normalEdges: [{ from: 'pkg-b', to: 'pkg-a', reasonCode: 'canonical-object' }],
    forbiddenEdges: [{ from: 'pkg-a', to: 'pkg-b', kind: 'forbidden', reasonCode: 'composition', alternative: 'port-injection' }],
    boundaries: [boundary('pkg-b', 'pkg-a')],
  }));
  const g4 = gates.find((gate) => gate.id === 'G4');
  // The declaration arrived: it is neither a violation nor invisible.
  assert.equal(g4.counts.declared_forbidden_edge_count, 1, JSON.stringify(g4.counts));
  assert.equal(g4.counts.forbidden_edge_count, 0, 'a well-formed forbidden declaration is not itself a violation');
  assert.equal(g4.status, 'PASS', JSON.stringify(g4.reasons));
  // final_audit keeps its meaning: how many normal edges are forbidden in effect.
  assert.equal(finalAudit.forbidden_dependency_count, 0);

  const violating = runGatePipeline(pipelineInput({
    normalEdges: [{ from: 'pkg-a', to: 'pkg-b', reasonCode: 'composition' }],
    forbiddenEdges: [{ from: 'pkg-a', to: 'pkg-b', kind: 'forbidden', reasonCode: 'composition', alternative: 'port-injection' }],
    boundaries: [boundary('pkg-a', 'pkg-b')],
  }));
  assert.equal(violating.finalAudit.forbidden_dependency_count, 1);
});

test('C005 a pair declared as both normal and forbidden is refused, naming the pair', () => {
  const { gates } = runGatePipeline(pipelineInput({
    normalEdges: [{ from: 'pkg-a', to: 'pkg-b', reasonCode: 'composition' }],
    forbiddenEdges: [{ from: 'pkg-a', to: 'pkg-b', kind: 'forbidden', reasonCode: 'composition', alternative: 'port-injection' }],
    boundaries: [boundary('pkg-a', 'pkg-b')],
  }));
  const g4 = gates.find((gate) => gate.id === 'G4');
  assert.notEqual(g4.status, 'PASS', JSON.stringify(g4));
  assert.ok(g4.reasons.join(' ').includes('pkg-a->pkg-b'), JSON.stringify(g4.reasons));
});

test('C005 the forbidden edge reaches the vocabulary check too', () => {
  const { gates } = runGatePipeline(pipelineInput({
    normalEdges: [],
    // A forbidden edge with an alternative is well formed; the missing alternative is not.
    forbiddenEdges: [{ from: 'pkg-a', to: 'pkg-b', kind: 'forbidden', reasonCode: 'composition' }],
    boundaries: [],
  }));
  const g4 = gates.find((gate) => gate.id === 'G4');
  assert.notEqual(g4.status, 'PASS');
  assert.ok(g4.reasons.join(' ').includes('alternative'), JSON.stringify(g4.reasons));
});

test('C005 no forbidden edge means no forbidden count', () => {
  const { gates, finalAudit } = runGatePipeline(pipelineInput({
    normalEdges: [{ from: 'pkg-b', to: 'pkg-a', reasonCode: 'canonical-object' }],
    forbiddenEdges: [],
    boundaries: [boundary('pkg-b', 'pkg-a')],
  }));
  assert.equal(gates.find((gate) => gate.id === 'G4').counts.forbidden_edge_count, 0);
  assert.equal(finalAudit.forbidden_dependency_count, 0);
});
