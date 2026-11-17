'use strict';

// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
/**
 * PX-437 C001/C002 — the gap scan consumes v3 artifacts and never absorbs.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runGapScan } = require('../../.claude/scripts/tickets/omission-gap-scan.js');

const KEY = 'clause|pkg-alpha|C001|precondition|abcdef0123456789';

/** A bare package plus a v3 artifact set. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function fixture(remainderValue) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'px437-gap-'));
  fs.writeFileSync(path.join(cwd, 'Tickets.json'), JSON.stringify({ title: 'fixture', round: 1, metadata: {}, phases: [] }));
  return {
    cwd,
    artifacts: {
      inventory: { version: 1, digest: 'sha256:inventory', clauses: [{ key: KEY, contractId: 'C001', element: 'precondition', applicability: 'TESTABLE' }], conflicts: [] },
      testIndex: { version: 1, digest: 'sha256:index', tests: [{ id: 't', digest: 'sha256:test', ignored: false, annotations: ['verifies:' + KEY] }], findings: [] },
      coverage: {
        version: 1,
        inventoryDigest: 'sha256:inventory',
        testIndexDigest: 'sha256:index',
        clauses: [],
        remainder: { total: 1, proven: 0, unresolved: remainderValue, structural: 0, remainder: remainderValue, debt: 0, notApplicable: 0, repairs: 0, expiredDeferred: 0, unclassified: 0, unmapped: 1, unproven: 0, staleProof: 0, conflict: 0, duplicateOwner: 0 },
      },
    },
  };
}

test('C001: the gap scan carries the v3 remainder and binds it into the digest', () => {
  const first = fixture(1);
  const second = fixture(0);
  try {
    const registry = { version: 3, detectors: [], seeds: [], surfaceRequirements: {} };
    const reportA = runGapScan({ cwd: first.cwd, registry, reportOnly: true, v3Artifacts: first.artifacts });
    const reportB = runGapScan({ cwd: second.cwd, registry, reportOnly: true, v3Artifacts: second.artifacts });

    assert.equal(reportA.v3.remainder.remainder, 1);
    assert.notEqual(reportA.digest, reportB.digest);
  } finally {
    fs.rmSync(first.cwd, { recursive: true, force: true });
    fs.rmSync(second.cwd, { recursive: true, force: true });
  }
});

test('C002: a ticketed finding is not added to baseline by the scan', () => {
  const fixtureData = fixture(1);
  try {
    const registry = { version: 3, detectors: [], seeds: [], surfaceRequirements: {} };
    const report = runGapScan({ cwd: fixtureData.cwd, registry, reportOnly: true, v3Artifacts: fixtureData.artifacts });
    assert.equal(fs.existsSync(path.join(fixtureData.cwd, 'OMISSION-CONVERGENCE.json')), false);
    assert.equal(report.baseline, undefined);
  } finally {
    fs.rmSync(fixtureData.cwd, { recursive: true, force: true });
  }
});
