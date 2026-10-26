const { test } = require('node:test');
const assert = require('node:assert/strict');

const { verifyViewAgainstMap } = require('../../.claude/scripts/rfc-graph/attach-unit-ids.js');
const { viewDigest, mapDigest } = require('../../.claude/scripts/sequences-slice/lib/distribution-map.mjs');

// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function fixture() {
  const view = {
    packageId: 'pkg-0001',
    ownedOperationUnits: [{ unitId: 'op-ProduceFact', operationId: 'ProduceFact', ownerPackageIds: ['pkg-0001'] }],
    ownedSequenceUnits: [{
      unitId: 'seq-A-1',
      sequenceId: 'A-1',
      ownerPackageIds: ['pkg-0001'],
      steps: [{ order: 1, stepId: 'A-1__ProduceFact', operationId: 'ProduceFact' }],
    }],
    crossBoundarySequenceUnits: [],
    obligationUnits: [{ unitId: 'ctr-boundary-001', kind: 'contract', subject: 'boundary-001' }],
  };
  const map = {
    schemaVersion: 1,
    packageId: 'pkg-0001',
    sourceViewDigest: viewDigest(view),
    units: [
      { unitId: 'op-ProduceFact', kind: 'operation', owners: ['pkg-0001'], sections: ['1.1'], ground: 'fixture' },
      { unitId: 'seq-A-1', kind: 'sequence', owners: ['pkg-0001'], sections: ['1.1'], ground: 'fixture' },
      { unitId: 'ctr-boundary-001', kind: 'contract', owners: ['pkg-0001'], sections: ['1.1'], ground: 'fixture' },
    ],
    residuals: [],
  };
  map.digest = mapDigest(map);
  const artifact = {
    sequences: [{ id: 'A-1', outcome: 'singleStep' }],
    steps: [{ id: 'A-1__ProduceFact', sequence: 'A-1', operation: 'ProduceFact', order: 1, line: 1 }],
  };
  return { view, map, artifact, registry: [{ boundary_id: 'boundary-001' }] };
}

test('a matching view and map have no admission finding', () => {
  const input = fixture();
  assert.deepEqual(verifyViewAgainstMap(input), []);
});

test('a stale map is STALE_DISTRIBUTION_MAP', () => {
  const input = fixture();
  input.map.sourceViewDigest = '0'.repeat(64);
  input.map.digest = mapDigest(input.map);
  const findings = verifyViewAgainstMap(input);
  assert.ok(findings.some((finding) => finding.code === 'STALE_DISTRIBUTION_MAP'));
});

test('a view unit missing from the map is UNIT_SET_MISMATCH', () => {
  const input = fixture();
  input.map.units = input.map.units.filter((unit) => unit.unitId !== 'seq-A-1');
  input.map.sourceViewDigest = viewDigest(input.view);
  input.map.digest = mapDigest(input.map);
  const findings = verifyViewAgainstMap(input);
  assert.ok(findings.some((finding) => finding.code === 'UNIT_SET_MISMATCH'));
});

test('a step without a step-bearing record is SEQUENCE_STEPS_UNDISTRIBUTED', () => {
  const input = fixture();
  input.view.ownedSequenceUnits[0].steps = [];
  input.map.sourceViewDigest = viewDigest(input.view);
  input.map.digest = mapDigest(input.map);
  const findings = verifyViewAgainstMap(input);
  assert.ok(findings.some((finding) => finding.code === 'SEQUENCE_STEPS_UNDISTRIBUTED'));
});

test('a registry boundary without a ctr unit is MISSING_BOUNDARY_CONTRACT', () => {
  const input = fixture();
  input.view.obligationUnits = [];
  input.map.sourceViewDigest = viewDigest(input.view);
  input.map.digest = mapDigest(input.map);
  const findings = verifyViewAgainstMap(input);
  assert.ok(findings.some((finding) => finding.code === 'MISSING_BOUNDARY_CONTRACT'));
});
