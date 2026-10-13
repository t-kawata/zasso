// PX-257 @verifies C001
// PX-257 @verifies C002
// PX-257 @verifies C003
// PX-257 @verifies C005
// The nine checks are calibrated against the live workspace before they are trusted, and
// every one of them reports zero findings there. That is the property these tests hold: a
// check that fired on a real package would be a check nobody could pass, so each is first
// shown silent on the measured shape and then shown to speak when the shape is broken.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PINNED_VOCABULARY_NAMES,
  readPinnedVocabularies,
} from '../../.claude/scripts/sequences-slice/lib/vocabulary.mjs';
import { runChecks } from '../../.claude/scripts/sequences-slice/verify.mjs';

/** A projection reproducing the shapes measured on the live workspace. */
// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
function liveShapedProjection(overrides = {}) {
  const operations = [
    {
      id: 'IssueCertificate',
      initial_status: 'submitted',
      allowed_status_transitions: {
        submitted: ['accepted', 'rejected', 'cancelled', 'expired'],
        accepted: ['pending_proof', 'finalized'],
        pending_proof: ['accepted', 'failed'],
        finalized: [],
        rejected: [],
        cancelled: [],
        expired: [],
        failed: [],
      },
      mutates_protocol_state: true,
      requires_remote_time_handshake: true,
      requires_session_binding: true,
      required_pre_state_checkpoint: true,
      required_authority: 'soul_authority_and_lease',
      required_proof_classes: [],
      reject_code_families: ['transfer', 'civic'],
      evidence: { spec_lines: [30, 40] },
    },
  ];

  return {
    artifact: {
      schema_version: 2,
      spec: { path: 'Spec.md', sha256: 'a'.repeat(64), lines: 100 },
      pins: {
        enumerations: [
          { name: 'OperationStatus', members: ['draft', 'submitted', 'accepted', 'pending_proof', 'finalized', 'rejected', 'cancelled', 'expired', 'failed'], ranges: [[129, 129]], closedness: 'closed' },
          { name: 'WebSocketMethod', members: ['session.time_handshake.begin', 'operation.submit'], ranges: [[14159, 14159]], closedness: 'closed' },
          { name: 'RestEndpoint', members: ['POST /v1/operations/{operation-kind}'], ranges: [[15882, 15882]], closedness: 'closed' },
          { name: 'CliCommand', members: ['gaia operation submit'], ranges: [[900, 900]], closedness: 'closed' },
          { name: 'ExecutionMode', members: ['local', 'remote'], ranges: [[901, 901]], closedness: 'closed' },
        ],
      },
      // Sections tile 21..100; lines 1..20 are the preamble the check names rather than counts.
      sections: [{ id: 's1', firstLine: 21, lastLine: 100 }],
      exemptions: [{ subject: 'G-255', lens: 'omission', why: 'blank line' }],
      operations,
      sequences: [{ id: 'S-1', outcome: 'direct' }],
      steps: [{ id: 'S-1__1', sequence: 'S-1', operation: 'IssueCertificate' }],
    },
    treeManifest: {
      workspace: {
        packages: [
          { id: 'pkg-0006', path: 'crates/protocol/gaia-certificates', owns: { claims: ['claim-000001'], state_machines: ['req-000029'] } },
          { id: 'pkg-0011', path: 'crates/protocol/gaia-commerce', owns: { claims: [], state_machines: [] } },
        ],
      },
      inventory: {
        objects: [{ canonical_name: 'Certificate', owner_package: 'pkg-0006' }],
        claims: [{ id: 'claim-000001', canonical_name: 'Certificate', primary_owner: 'pkg-0006', collaborating_owners: [] }],
      },
      stage2_handoff: {
        contract_boundaries: [
          { id: 'boundary-001', consumer_package: 'pkg-0006', provider_package: 'pkg-0011', stage2_contract_scope: ['input', 'output', 'errors'] },
        ],
      },
    },
    allocateManifest: {
      contract_registry: [
        { contract_id: 'contract-boundary-001', boundary_id: 'boundary-001', clauses: { input: 'x', output: 'y', errors: ['InvalidThing'] } },
      ],
    },
    ...overrides,
  };
}

/** A projection with one thing broken, named so a failure says which check moved. */
// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
function broken(name) {
  const projection = liveShapedProjection();
  if (name === 'C1') projection.artifact.operations[0].initial_status = 'soulbound';
  if (name === 'C2') projection.treeManifest.workspace.packages[0].owns.claims = [];
  if (name === 'C3') projection.treeManifest.stage2_handoff.contract_boundaries[0].stage2_contract_scope = ['input', 'output', 'errors', 'ordering'];
  if (name === 'C4') projection.artifact.sections = [{ id: 's1', firstLine: 21, lastLine: 90 }];
  if (name === 'C5') delete projection.artifact.operations[0].required_authority;
  if (name === 'C6') projection.artifact.operations[0].allowed_status_transitions.submitted.push('soulbound');
  if (name === 'C7') projection.artifact.operations[0].reject_code_families = ['transfer', ''];
  if (name === 'C8') projection.artifact.operations[0].evidence = { spec_lines: [999] };
  if (name === 'C9') projection.treeManifest.workspace.packages[1].owns.state_machines = ['req-000029'];
  return projection;
}

// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C005 the five pinned vocabularies are read by name from pins.enumerations', () => {
  const vocabularies = readPinnedVocabularies(liveShapedProjection().artifact);
  assert.deepEqual([...vocabularies.keys()].sort(), [...PINNED_VOCABULARY_NAMES].sort());
  assert.ok(vocabularies.get('OperationStatus').members.includes('submitted'));
  assert.equal(vocabularies.get('OperationStatus').closed, true);
  assert.throws(() => readPinnedVocabularies({ pins: { enumerations: [] } }), /OperationStatus/);
});

// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C005 a name the artifact uses that its vocabulary does not carry is reported with the token', () => {
  const findings = runChecks({ projection: broken('C1') }).checks.C1;
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'high');
  assert.match(findings[0].message, /soulbound/);
  assert.match(findings[0].message, /OperationStatus/);
});

// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C002 ownership closure is bidirectional: an owned claim absent from the inventory is an omission', () => {
  const findings = runChecks({ projection: broken('C2') }).checks.C2;
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'high');
  assert.match(findings[0].message, /claim-000001/);
});

// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C003 a declared clause key the registry does not carry is reported naming the boundary and the key', () => {
  const findings = runChecks({ projection: broken('C3') }).checks.C3;
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'high');
  assert.match(findings[0].message, /boundary-001/);
  assert.match(findings[0].message, /ordering/);
});

// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C004 sections and the named preamble together account for every specification line', () => {
  const projection = liveShapedProjection();
  assert.deepEqual(runChecks({ projection }).checks.C4, []);
  const findings = runChecks({ projection: broken('C4') }).checks.C4;
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'high');
  assert.match(findings[0].message, /91/);
});

// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C005 a fact table missing a required field is reported', () => {
  const findings = runChecks({ projection: broken('C5') }).checks.C5;
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /IssueCertificate/);
  assert.match(findings[0].message, /required_authority/);
});

// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C006 a transition to a status outside OperationStatus is reported, while a terminal status with no key is not', () => {
  const projection = liveShapedProjection();
  assert.deepEqual(runChecks({ projection }).checks.C6, [], 'a successor that is a member but never a key is terminal, not a fault');
  const findings = runChecks({ projection: broken('C6') }).checks.C6;
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /soulbound/);
});

// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C007 the reject-code families are checked for their own consistency, not against clause prose', () => {
  const projection = liveShapedProjection();
  assert.deepEqual(runChecks({ projection }).checks.C7, []);
  // MEASURED: the live registry holds 408 prose sentences under clauses.errors while the
  // artifact holds 13 namespace-like families, so comparing the two would fire 13 times on
  // a sound workspace. The check asserts what is decidable instead.
  assert.equal(projection.artifact.operations[0].reject_code_families.every((name) => name.length > 0), true);
  const findings = runChecks({ projection: broken('C7') }).checks.C7;
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /IssueCertificate/);
});

// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C008 a spec line outside every section is reported', () => {
  const projection = liveShapedProjection();
  assert.deepEqual(runChecks({ projection }).checks.C8, []);
  const findings = runChecks({ projection: broken('C8') }).checks.C8;
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /999/);
});

// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C009 a state machine owned by two packages is reported as a contradiction', () => {
  const projection = liveShapedProjection();
  assert.deepEqual(runChecks({ projection }).checks.C9, []);
  const findings = runChecks({ projection: broken('C9') }).checks.C9;
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /req-000029/);
});

// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C001 no check fires on the measured shape, so the whole set is silent on a sound workspace', () => {
  const result = runChecks({ projection: liveShapedProjection() });
  assert.deepEqual(Object.keys(result.checks).sort(), ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9']);
  for (const [id, findings] of Object.entries(result.checks)) {
    assert.deepEqual(findings, [], `${id} fired on the calibrated shape`);
  }
  assert.deepEqual(result.summary, { high: 0, low: 0, total: 0 });
});

// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C001 each check reports its own findings, so one broken axis does not mask another', () => {
  const result = runChecks({ projection: broken('C3') });
  assert.equal(result.checks.C3.length, 1);
  assert.deepEqual(result.checks.C1, []);
  assert.deepEqual(result.checks.C2, []);
  assert.equal(result.summary.high, 1);
  for (const findings of Object.values(result.checks)) {
    for (const finding of findings) assert.ok(['high', 'low'].includes(finding.severity));
  }
});

// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C001 the check set reads only the projection, so it is a function of what it was given', () => {
  const projection = liveShapedProjection();
  assert.deepEqual(runChecks({ projection }), runChecks({ projection }));
});
