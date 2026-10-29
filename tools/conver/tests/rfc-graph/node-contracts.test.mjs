// PX-336 Red: the per-node semantic implementation brief.
// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C005

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildNodeBrief, verifyNodeContracts } from '../../.claude/scripts/rfc-graph/lib/node-contracts.mjs';

/** The six section labels every brief carries, in order. */
const SECTION_LABELS = ['YOU ARE HERE', 'IMPLEMENT', 'MUST HOLD', 'DO NOT', 'ORDER', 'PROOF'];

/** The text between two section labels, so a DO NOT fact cannot satisfy a MUST HOLD assertion. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function sectionText(brief, startLabel, endLabel) {
  const start = brief.indexOf(startLabel);
  const end = endLabel === null ? brief.length : brief.indexOf(endLabel);
  assert.notEqual(start, -1, `missing section ${startLabel}`);
  assert.notEqual(end, -1, `missing section ${endLabel}`);
  return brief.slice(start, end);
}

/** One operation unit in the package view, with the obligation fields the brief reads. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function operationUnit(operationId, overrides = {}) {
  return {
    unitId: `op-${operationId}`,
    operationId,
    resultObjectClasses: ['RootEntry'],
    ownerPackageIds: ['pkg-0003'],
    roleCandidate: 'implementer',
    obligation: {
      purpose: `the ${operationId} procedure`,
      requiredAuthority: 'soul_authority_and_lease',
      requiresSessionBinding: true,
      requiresRemoteTimeHandshake: true,
      requiredPreStateCheckpoint: true,
      idempotencyScope: `${operationId} identity tuple`,
      initialStatus: 'submitted',
      finalityPredicate: 'finalized when the single state transition completes',
      cancellationRule: 'cancellable before the first external action starts',
      reversalOrRecoveryRule: 'reversal and recovery follow the OperationStatus map',
      boundaryEffects: [],
      resultObjectClasses: ['RootEntry'],
      ...overrides,
    },
  };
}

/** One sidecar step row. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function stepRow(stepId, operationId, contractProse, contract = {}) {
  return {
    stepId,
    sequenceId: stepId.split('__')[0],
    operationId,
    nodeIds: ['N0052'],
    contractProse,
    contract: {
      pre: [{ factId: 'authority:x', text: 'authority soul_authority_and_lease' }],
      post: [{ factId: 'object:RootEntry', text: 'RootEntry' }],
      invariants: [{ factId: 'idempotency', text: `${operationId} identity tuple` }],
      consumes: [],
      produces: [],
      errors: [],
      crosses: [],
      ...contract,
    },
    digest: `digest-${stepId}`,
  };
}

/** A graph node carrying the units a brief must resolve. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function node(id, unitIds, title = `node ${id}`, summary = `summary ${id}`) {
  return { id, title, kind: 'api_contract', summary, language: 'rust', slug: id.toLowerCase(), headingRefs: [], unitIds };
}

/** A boundary contract edge with the registry note the resolver reads. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function boundaryEdge(from, to, boundaryId, contractText) {
  return {
    from,
    to,
    type: 'depends_on',
    attributes: { note: `registry:${boundaryId};digest:abc` },
    contracts: [
      { id: 'C001', precondition: 'structural', postcondition: 'structural', invariant: 'structural' },
      { id: 'C930', precondition: contractText, postcondition: contractText, invariant: contractText },
    ],
  };
}

/** The complete fixture the normal and verify cases share. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function completeFixture() {
  const graph = {
    nodes: [
      node('N0052', ['op-CreateRootEntry', 'op-VerifyRootLedgerChain'], '§3.6.4 RootLedgerEntry', 'single-writer append-only chain'),
      node('N0083', ['ctr-boundary-023'], '§3.10.6 boundary-023', 'CivicEpochCommitment'),
    ],
    edges: [boundaryEdge('N0083', 'N0052', 'boundary-023', 'The forum records the epoch against a checkpoint and never finalizes it.')],
  };
  const view = {
    ownedOperationUnits: [operationUnit('CreateRootEntry')],
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: [
      { unitId: 'op-VerifyRootLedgerChain', relation: 'assigns', subject: 'VerifyRootLedgerChain', kind: 'operation', roleCandidate: 'implementer', ground: 'root issuance ledger chain rules; line 1294' },
      { unitId: 'ctr-boundary-023', relation: 'carries', subject: 'boundary-023', direction: 'provides', counterpart: 'pkg-0010' },
    ],
  };
  const stepContracts = {
    steps: [
      stepRow('A-3887__3', 'CreateRootEntry', 'eKYC proofが無効・不足・失効等なら発行せず、not_requiredのforumでは必須条件にしない'),
      stepRow('S-application-and-payment__2', 'CreateRootEntry', 'proofがissued_at時点で完全オフライン検証に通ること'),
    ],
  };
  return { graph, view, stepContracts };
}

describe('buildNodeBrief', () => {
  it('renders all six sections and every unit on the node', () => {
    const { graph, view, stepContracts } = completeFixture();
    const brief = buildNodeBrief({ graph, view, stepContracts, nodeId: 'N0052' });

    for (const label of SECTION_LABELS) assert.match(brief, new RegExp(label));
    assert.match(brief, /CreateRootEntry/);
    assert.match(brief, /A-3887__3/);
    assert.match(brief, /S-application-and-payment__2/);
    assert.match(brief, /eKYC proofが無効/);
    assert.match(brief, /完全オフライン検証/);
    assert.match(brief, /op-VerifyRootLedgerChain/);
    assert.match(brief, /no step contract/i);
  });

  it('renders sequence steps in order and marks a foreign step external', () => {
    const graph = { nodes: [node('N0001', ['xdir-S-application-and-payment'], 'sequence node')], edges: [] };
    const view = {
      ownedOperationUnits: [operationUnit('LocalOp')],
      ownedSequenceUnits: [],
      crossBoundarySequenceUnits: [{
        unitId: 'xdir-S-application-and-payment',
        sequenceId: 'S-application-and-payment',
        ownerPackageIds: ['pkg-0003', 'pkg-0010'],
        outcome: 'direct',
        steps: [
          { stepId: 'S-application-and-payment__1', operationId: 'LocalOp', order: 1 },
          { stepId: 'S-application-and-payment__2', operationId: 'ForeignOp', order: 2 },
        ],
      }],
      obligationUnits: [],
    };
    const stepContracts = { steps: [stepRow('S-application-and-payment__1', 'LocalOp', 'local prose')] };
    const brief = buildNodeBrief({ graph, view, stepContracts, nodeId: 'N0001' });

    assert.ok(brief.indexOf('S-application-and-payment__1') < brief.indexOf('S-application-and-payment__2'));
    assert.match(brief, /ForeignOp/);
    assert.match(brief, /external/i);
    assert.match(brief, /local prose/);
  });

  it('renders boundary direction, counterpart, graph contract and registry clauses', () => {
    const { graph, view } = completeFixture();
    const registry = {
      contract_registry: [{
        boundary_id: 'boundary-023',
        consumer_package: 'pkg-0010',
        provider_package: 'pkg-0003',
        clauses: {
          input: 'CivicEpochBlock and the finalized checkpoint reference',
          errors: ['CivicFinalityConflict when two descriptors finalize'],
          tests: ['unit: a conflicting descriptor fails'],
        },
      }],
    };
    const brief = buildNodeBrief({ graph, view, stepContracts: { steps: [] }, registry, nodeId: 'N0083' });

    assert.match(brief, /boundary-023/);
    assert.match(brief, /provides/);
    assert.match(brief, /pkg-0010/);
    assert.match(brief, /The forum records the epoch against a checkpoint/);
    assert.match(brief, /CivicFinalityConflict/);
    assert.match(brief, /a conflicting descriptor fails/);
    assert.match(brief, /CivicEpochBlock and the finalized checkpoint reference/);
    assert.match(brief, /consumer pkg-0010; provider pkg-0003/);
  });

  it('caps a fact axis and states the omitted count', () => {
    const graph = { nodes: [node('N0001', ['op-Op'])], edges: [] };
    const view = { ownedOperationUnits: [operationUnit('Op')], ownedSequenceUnits: [], crossBoundarySequenceUnits: [], obligationUnits: [] };
    const pre = Array.from({ length: 15 }, (_, index) => ({ factId: `pre-${index}`, text: `exact precondition ${index}` }));
    const stepContracts = { steps: [stepRow('S__1', 'Op', 'prose', { pre })] };
    const brief = buildNodeBrief({ graph, view, stepContracts, nodeId: 'N0001', options: { maxFactsPerAxis: 6 } });

    assert.equal((brief.match(/exact precondition/g) || []).length, 6);
    assert.match(brief, /showing 6 of 15/);
  });

  it('is byte-identical for the same input', () => {
    const { graph, view, stepContracts } = completeFixture();
    assert.equal(
      buildNodeBrief({ graph, view, stepContracts, nodeId: 'N0052' }),
      buildNodeBrief({ graph, view, stepContracts, nodeId: 'N0052' }),
    );
  });

  it('renders a node with no units as design context', () => {
    const graph = { nodes: [node('N0001', [], 'design node', 'design only')], edges: [] };
    const view = { ownedOperationUnits: [], ownedSequenceUnits: [], crossBoundarySequenceUnits: [], obligationUnits: [] };
    const brief = buildNodeBrief({ graph, view, stepContracts: { steps: [] }, nodeId: 'N0001' });
    assert.match(brief, /Units: none/);
    assert.match(brief, /No distributed unit is mapped/);
  });

  it('classifies a boundary outside the package ctr set as EXTERNAL and keeps it out of MUST HOLD', () => {
    const graph = { nodes: [node('N0001', ['op-Op'])], edges: [] };
    const view = { ownedOperationUnits: [operationUnit('Op')], ownedSequenceUnits: [], crossBoundarySequenceUnits: [], obligationUnits: [] };
    const externalFact = {
      factId: 'boundary:boundary-024/preconditions/0',
      text: 'foreign civic clause that must not be a local obligation',
      source: { boundaryId: 'boundary-024' },
    };
    const stepContracts = { steps: [stepRow('S__1', 'Op', 'prose', { crosses: ['boundary-024'], pre: [externalFact] })] };
    const brief = buildNodeBrief({ graph, view, stepContracts, nodeId: 'N0001' });

    assert.match(brief, /EXTERNAL/);
    assert.match(brief, /boundary-024/);
    const mustHold = sectionText(brief, 'MUST HOLD', 'DO NOT');
    assert.doesNotMatch(mustHold, /boundary-024/);
    assert.doesNotMatch(mustHold, /foreign civic clause/);
    assert.match(sectionText(brief, 'DO NOT', null), /boundary-024/);
  });
});

describe('verifyNodeContracts', () => {
  it('passes the complete fixture', () => {
    const { graph, view, stepContracts } = completeFixture();
    const result = verifyNodeContracts({ graph, view, stepContracts });
    assert.equal(result.ok, true);
    assert.deepEqual(result.findings, []);
  });

  it('reports a local step whose operation has no node', () => {
    const { graph, view } = completeFixture();
    const stepContracts = { steps: [stepRow('S__1', 'MissingOp', 'orphan step')] };
    const result = verifyNodeContracts({ graph, view, stepContracts });
    assert.equal(result.ok, false);
    assert.equal(result.findings[0].code, 'CONTRACT_CHAIN_OPEN');
    assert.equal(result.findings[0].subject, 'S__1');
  });

  it('reports a ctr unit without an incident boundary edge', () => {
    const { graph, view, stepContracts } = completeFixture();
    const withoutEdge = { ...graph, edges: [] };
    const result = verifyNodeContracts({ graph: withoutEdge, view, stepContracts });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((finding) => finding.code === 'MISSING_BOUNDARY_EDGE'));
  });

  it('reports an incident edge that carries no contract', () => {
    const { graph, view, stepContracts } = completeFixture();
    const withoutContracts = {
      ...graph,
      edges: [{ from: 'N0083', to: 'N0052', type: 'depends_on', attributes: { note: 'registry:boundary-023' }, contracts: [] }],
    };
    const result = verifyNodeContracts({ graph: withoutContracts, view, stepContracts });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((finding) => finding.code === 'BOUNDARY_EDGE_WITHOUT_CONTRACT'));
  });

  it('reports an unsupported unit kind', () => {
    const graph = { nodes: [node('N0001', ['obl-surface'])], edges: [] };
    const view = { ownedOperationUnits: [], ownedSequenceUnits: [], crossBoundarySequenceUnits: [], obligationUnits: [] };
    const result = verifyNodeContracts({ graph, view, stepContracts: { steps: [] } });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((finding) => finding.code === 'UNSUPPORTED_UNIT_KIND'));
  });

  it('exposes no registry argument', () => {
    assert.doesNotMatch(verifyNodeContracts.toString(), /registry/);
    const { graph, view, stepContracts } = completeFixture();
    const result = verifyNodeContracts({ graph, view, stepContracts, registry: { contract_registry: [] } });
    assert.equal(result.ok, true);
  });
});

// ---------------------------------------------------------------------------
// PX-337: complete boundary inventory, cap pointers, sequence context, messages.
// ---------------------------------------------------------------------------

/** A contract carrying the three clauses the brief expands. */
// [::TICKET::] PX-337 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-337 --for-spec --no-implementation-order`.
function contract(id, text) {
  return { id, precondition: `${text} pre`, postcondition: `${text} post`, invariant: `${text} inv` };
}

/** An edge that carries the registry note for boundary-023. */
// [::TICKET::] PX-337 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-337 --for-spec --no-implementation-order`.
function registryEdge(from, to, contracts, type = 'references') {
  return { from, to, type, attributes: { note: 'registry:boundary-023;digest:abc' }, contracts };
}

/** The package view for the multi-edge boundary cases. */
// [::TICKET::] PX-337 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-337 --for-spec --no-implementation-order`.
function boundaryView() {
  return {
    ownedOperationUnits: [operationUnit('CreateRootEntry')],
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: [
      { unitId: 'ctr-boundary-023', relation: 'carries', subject: 'boundary-023', direction: 'provides', counterpart: 'pkg-0010' },
    ],
  };
}

/** Seven registry-note edges and eight contracts, measured on gaia-forum boundary-023. */
// [::TICKET::] PX-337 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-337 --for-spec --no-implementation-order`.
function multiEdgeBoundaryFixture() {
  const graph = {
    nodes: [
      node('N0055', ['op-CreateRootEntry', 'ctr-boundary-023'], '§3.6.7 The root entry', 'root entry'),
      node('N0083', ['ctr-boundary-023'], '§3.10.6 boundary-023', 'civic'),
      node('N0048', [], 'N0048'), node('N0077', [], 'N0077'), node('N0089', [], 'N0089'),
      node('N0050', [], 'N0050'), node('N0052', [], 'N0052'), node('N0032', [], 'N0032'),
    ],
    edges: [
      registryEdge('N0083', 'N0055', [contract('C176', 'hand-off'), contract('C930', 'registry projection')], 'depends_on'),
      registryEdge('N0055', 'N0048', [contract('C057', 'part of')], 'part_of'),
      registryEdge('N0083', 'N0077', [contract('C081', 'part of')], 'part_of'),
      registryEdge('N0089', 'N0055', [contract('C182', 'named not owned')]),
      registryEdge('N0055', 'N0050', [contract('C209', 'admission rule')]),
      registryEdge('N0055', 'N0052', [contract('C210', 'ledger position')]),
      registryEdge('N0055', 'N0032', [contract('C211', 'parent allocation')]),
    ],
  };
  const stepContracts = { steps: [stepRow('R-3889__1', 'CreateRootEntry', 'complete the root entry')] };
  return { graph, view: boundaryView(), stepContracts };
}

describe('PX-337 boundary inventory', () => {
  it('lists every registry-note edge and contract id and expands one projection', () => {
    const { graph, view, stepContracts } = multiEdgeBoundaryFixture();
    const brief = buildNodeBrief({ graph, view, stepContracts, nodeId: 'N0055' });

    assert.match(brief, /Boundary contracts \(8\)/);
    for (const id of ['C057', 'C081', 'C176', 'C930', 'C182', 'C209', 'C210', 'C211']) {
      assert.ok(brief.includes(id), `missing contract ${id}`);
    }
    assert.match(brief, /Expanded contract: C930 \(N0083 -> N0055\)/);
    assert.match(brief, /precondition: registry projection pre/);
    assert.match(brief, /Not expanded: C057, C081, C176, C182, C209, C210, C211/);
  });

  it('distinguishes no incident edge from an incident edge without a contract', () => {
    const noEdge = {
      graph: { nodes: [node('N0083', ['ctr-boundary-023'])], edges: [] },
      view: boundaryView(),
      stepContracts: { steps: [] },
    };
    const noEdgeBrief = buildNodeBrief({ ...noEdge, nodeId: 'N0083' });
    assert.match(noEdgeBrief, /no incident boundary edge/);
    assert.doesNotMatch(noEdgeBrief, /Expanded contract:/);

    const noContract = {
      graph: {
        nodes: [node('N0083', ['ctr-boundary-023']), node('N0055', [])],
        edges: [registryEdge('N0083', 'N0055', [])],
      },
      view: boundaryView(),
      stepContracts: { steps: [] },
    };
    const noContractBrief = buildNodeBrief({ ...noContract, nodeId: 'N0083' });
    assert.match(noContractBrief, /incident edges carry no contract/);
    assert.doesNotMatch(noContractBrief, /Expanded contract:/);
  });

  it('prints a distinct message for each registry state', () => {
    const { graph, view, stepContracts } = multiEdgeBoundaryFixture();
    const withoutRegistry = buildNodeBrief({ graph, view, stepContracts, nodeId: 'N0055' });
    assert.match(withoutRegistry, /Registry: not supplied/);

    const emptyRegistry = buildNodeBrief({
      graph, view, stepContracts, nodeId: 'N0055', registry: { contract_registry: [] },
    });
    assert.match(emptyRegistry, /Registry: no row for boundary-023/);

    const graphOnlyRegistry = buildNodeBrief({
      graph, view, stepContracts, nodeId: 'N0055',
      registry: {
        contract_registry: [{
          boundary_id: 'boundary-023',
          consumer_package: 'pkg-0010',
          provider_package: 'pkg-0003',
          clauses: { preconditions: ['a'], postconditions: ['b'], invariants: ['c'] },
        }],
      },
    });
    assert.match(graphOnlyRegistry, /no clause groups beyond graph pre\/post\/invariant/);
  });

  it('points a capped axis at every contributing step row', () => {
    const graph = { nodes: [node('N0055', ['op-CreateRootEntry'], 'root entry')], edges: [] };
    const view = { ownedOperationUnits: [operationUnit('CreateRootEntry')], ownedSequenceUnits: [], crossBoundarySequenceUnits: [], obligationUnits: [] };
    const post = (prefix) => Array.from({ length: 3 }, (_, index) => ({ factId: `${prefix}-${index}`, text: `${prefix} post ${index}` }));
    const stepContracts = {
      steps: [
        stepRow('R-3889__1', 'CreateRootEntry', 'one', { post: post('r') }),
        stepRow('S-application-and-payment__1', 'CreateRootEntry', 'two', { post: post('s1') }),
        stepRow('A-3887__3', 'CreateRootEntry', 'three', { post: post('a') }),
        stepRow('S-application-and-payment__2', 'CreateRootEntry', 'four', { post: post('s2') }),
      ],
    };
    const brief = buildNodeBrief({ graph, view, stepContracts, nodeId: 'N0055', options: { maxFactsPerAxis: 6 } });

    const pointerLine = brief.split('\n').find((line) => line.includes('showing 6 of 12; full list at'));
    assert.ok(pointerLine, 'the capped axis states the omitted count and pointer');
    for (const stepId of ['R-3889__1', 'S-application-and-payment__1', 'A-3887__3', 'S-application-and-payment__2']) {
      assert.ok(pointerLine.includes(stepId), `pointer omits ${stepId}`);
    }
  });

  it('renders the ordered chain of a sequence that is not a unit on the node', () => {
    const graph = { nodes: [node('N0055', ['op-CreateRootEntry'], 'root entry')], edges: [] };
    const view = {
      ownedOperationUnits: [operationUnit('OBJECT_GET'), operationUnit('CreateRootEntry')],
      ownedSequenceUnits: [],
      crossBoundarySequenceUnits: [{
        unitId: 'xdir-S-application-and-payment',
        sequenceId: 'S-application-and-payment',
        ownerPackageIds: ['pkg-0003'],
        outcome: 'direct',
        steps: [
          { stepId: 'S-application-and-payment__0', operationId: 'OBJECT_GET', order: 0 },
          { stepId: 'S-application-and-payment__1', operationId: 'SubmitForumEkycParticipationProof', order: 1 },
          { stepId: 'S-application-and-payment__2', operationId: 'CreateRootEntry', order: 2 },
          { stepId: 'S-application-and-payment__3', operationId: 'IssueTemporalHealthLease', order: 3 },
        ],
      }],
      obligationUnits: [],
    };
    const stepContracts = { steps: [stepRow('S-application-and-payment__2', 'CreateRootEntry', 'proof')] };
    const brief = buildNodeBrief({ graph, view, stepContracts, nodeId: 'N0055' });

    assert.match(brief, /S-application-and-payment \(context\): 0\. OBJECT_GET -> 1\. SubmitForumEkycParticipationProof \(external\) -> 2\. CreateRootEntry -> 3\. IssueTemporalHealthLease \(external\)/);
  });
});
