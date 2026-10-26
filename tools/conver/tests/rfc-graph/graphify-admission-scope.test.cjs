// PX-314 @verifies C001
// The admission gate reads the root artifact and the registry; it must report only the
// package's slice, while still reporting an obligation-only sequence whose steps were lost.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { verifyViewAgainstMap } = require('../../.claude/scripts/rfc-graph/attach-unit-ids.js');
const { multiPackageFixture } = require('../sequences-slice/helpers/multi-package-fixture.mjs');

// [::TICKET::] PX-314 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-314 --for-spec --no-implementation-order`.
test('C001 a foreign step and a foreign boundary produce no admission finding', async () => {
  const { view, map, artifact, registry } = await multiPackageFixture();
  const findings = verifyViewAgainstMap({ view, map, artifact, registry });
  assert.deepEqual(findings, []);
});

test('C001 an obligation-only sequence still reports its lost step', async () => {
  const { view, map, artifact, registry } = await multiPackageFixture({ obligationOnly: true });
  const findings = verifyViewAgainstMap({ view, map, artifact, registry });
  const finding = findings.find((entry) => entry.code === 'SEQUENCE_STEPS_UNDISTRIBUTED');
  assert.ok(finding);
  assert.equal(finding.subject, 'A-1__ProduceFact');
  assert.equal(findings.some((entry) => entry.subject === 'B-1__Foreign'), false);
});

test('C001 a declared ctr unit missing from the view is MISSING_BOUNDARY_CONTRACT', async () => {
  const { view, map, artifact, registry } = await multiPackageFixture();
  view.obligationUnits = [];
  const findings = verifyViewAgainstMap({ view, map, artifact, registry });
  assert.ok(findings.some((entry) => entry.code === 'MISSING_BOUNDARY_CONTRACT' && entry.subject === 'ctr-boundary-001'));
});
