// PX-314 @verifies C001, C003, C004, C005, C007
// Graph-stage verifiers read the workspace-wide artifact and registry, but each package
// owns only its slice. These tests pin that scope and the gaps the slice leaves open.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { verifyChain } from '../../.claude/scripts/sequences-slice/verify-chain.mjs';
import { declaredSequenceIds } from '../../.claude/scripts/sequences-slice/lib/distribution-map.mjs';
import { multiPackageFixture } from './helpers/multi-package-fixture.mjs';

// [::TICKET::] PX-314 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-314 --for-spec --no-implementation-order`.
test('C001 a foreign artifact step and a foreign registry row produce no finding', () => {
  const result = verifyChain(multiPackageFixture());
  assert.deepEqual(result.findings, []);
  assert.equal(result.ok, true);
});

test('C001 a declared obligation-only sequence still reports its undeclared step', () => {
  const result = verifyChain(multiPackageFixture({ obligationOnly: true }));
  const finding = result.findings.find((entry) => entry.code === 'SEQUENCE_STEPS_UNDISTRIBUTED');
  assert.ok(finding);
  assert.equal(finding.subject, 'A-1__ProduceFact');
  assert.equal(result.findings.some((entry) => entry.subject === 'B-1__Foreign'), false);
});

test('C003 a stale map keeps its named code', () => {
  const input = multiPackageFixture();
  input.map.sourceViewDigest = '0'.repeat(64);
  input.map.digest = '0'.repeat(64);
  const result = verifyChain(input);
  assert.ok(result.findings.some((entry) => entry.code === 'STALE_DISTRIBUTION_MAP'));
  assert.equal(result.ok, false);
});

test('C004 a changed artifact step contract is STEP_CONTRACT_MISMATCH', () => {
  const result = verifyChain(multiPackageFixture({ contractMutation: true }));
  assert.ok(result.findings.some((entry) => entry.code === 'STEP_CONTRACT_MISMATCH'));
});

test('C005 preflight does not require a Dirs-Tree', () => {
  const result = verifyChain({ ...multiPackageFixture(), dirsTree: null, stage: 'boundify', preflight: true });
  assert.deepEqual(result.findings, []);
});

test('C005 a stale Dirs-Tree fails after generation', () => {
  const input = multiPackageFixture();
  input.dirsTree.distribution.digest = '0'.repeat(64);
  const result = verifyChain({ ...input, stage: 'boundify' });
  assert.ok(result.findings.some((entry) => entry.code === 'DISTRIBUTION_DIGEST_MISMATCH' && entry.subject === 'dirs'));
});

test('C007 a bidirectional boundary edge is still direction-checked', () => {
  const result = verifyChain(multiPackageFixture({ directionFlip: true }));
  assert.ok(result.findings.some((entry) => entry.code === 'BOUNDARY_DIRECTION_MISMATCH'));
});

test('a step repeated inside one ticket is DUPLICATE_SEQUENCE_STEP', () => {
  const result = verifyChain(multiPackageFixture({ duplicateStep: true }));
  assert.ok(result.findings.some((entry) => entry.code === 'DUPLICATE_SEQUENCE_STEP' && entry.subject === 'A-1__ProduceFact'));
});

test('declaredSequenceIds includes an obligation-only cross-boundary sequence', () => {
  const view = {
    obligationUnits: [{ unitId: 'xdir-A-1', kind: 'cross-boundary-sequence', subject: 'A-1' }],
  };
  assert.deepEqual([...declaredSequenceIds(view)], ['A-1']);
});
