'use strict';

/**
 * PX-442 C006 — one open-repair predicate for the gate and the find runner.
 *
 * `unrepairable` is a closed repair record; its open diagnostic ticket is
 * counted by the open-tickets gate, not by the repair gate.
 *
 * @verifies C006
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { isOpenRepair } = require('../../.claude/scripts/tickets/lib/repair-status.js');
const { runV3Gate } = require('../../.claude/scripts/tickets/omission-detection-gate.js');
const { evidenceDigestOf } = require('../../.claude/scripts/tickets/lib/dispositions.js');

const KEY = 'clause|pkg-alpha|OBL-alpha|precondition|aaaaaaaaaaaaaaaa';
const EVIDENCE = [{ file: 'docs/HANDOVER.md', line: 652 }];

/** The v3 artifacts with one resolved non-testable clause. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function artifacts() {
  return {
    inventory: {
      version: 1,
      digest: 'sha256:inventory',
      clauses: [{ key: KEY, scope: 'pkg-alpha', contractId: 'OBL-alpha', element: 'precondition', text: 'the clause', applicability: 'NOT_APPLICABLE', owners: [] }],
      conflicts: [],
    },
    testIndex: { version: 1, digest: 'sha256:index', tests: [], findings: [] },
    coverage: { version: 1, inventoryDigest: 'sha256:inventory', testIndexDigest: 'sha256:index', clauses: [] },
  };
}

/** The verified disposition for the clause. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function dispositions() {
  return [{
    key: KEY,
    status: 'NOT_APPLICABLE_VERIFIED',
    ruleId: 'R-NA',
    normativeSource: 'HANDOVER003 5.5',
    evidence: EVIDENCE,
    evidenceDigest: evidenceDigestOf(EVIDENCE),
  }];
}

test('C006 Postcondition: pending and in_progress are open; completed, false_positive and unrepairable are closed', () => {
  assert.equal(isOpenRepair({ repair: { status: 'pending' } }), true);
  assert.equal(isOpenRepair({ repair: { status: 'in_progress' } }), true);
  assert.equal(isOpenRepair({ repair: { status: 'completed' } }), false);
  assert.equal(isOpenRepair({ repair: { status: 'false_positive' } }), false);
  assert.equal(isOpenRepair({ repair: { status: 'unrepairable', ticketKey: 'P5-1' } }), false);
  assert.equal(isOpenRepair({ repair: { status: 'unrepairable' } }), false);
});

test('C006 Invariant: an unknown repair status is open by default', () => {
  assert.equal(isOpenRepair({ repair: { status: 'unknown_status' } }), true);
  assert.equal(isOpenRepair({ repair: null }), true);
});

test('C006 Invariant: an open diagnostic ticket blocks through open-tickets, not through the repair gate', () => {
  const gate = runV3Gate({
    cwd: process.cwd(),
    v3Artifacts: artifacts(),
    dispositions: dispositions(),
    repairs: [{ repairKey: 'sha256:repair', status: 'unrepairable', ticketKey: 'P5-1' }],
    openTickets: 1,
  });

  assert.equal(gate.gates.find((entry) => entry.name === 'repair').ok, true);
  assert.equal(gate.gates.find((entry) => entry.name === 'open-tickets').ok, false);
  assert.equal(gate.complete, false);
});

test('C006 Postcondition: with no open ticket the unrepairable record does not block completion', () => {
  const gate = runV3Gate({
    cwd: process.cwd(),
    v3Artifacts: artifacts(),
    dispositions: dispositions(),
    repairs: [{ repairKey: 'sha256:repair', status: 'unrepairable', ticketKey: 'P5-1' }],
    openTickets: 0,
  });

  assert.equal(gate.gates.find((entry) => entry.name === 'repair').ok, true);
  assert.equal(gate.complete, true);
  assert.equal(gate.exitCode, 0);
});
