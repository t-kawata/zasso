'use strict';

/**
 * PX-440 C003 — one v3 terminal predicate.
 *
 * A run is complete only when the measured remainder is zero AND no ticket and
 * no repair remain open. The legacy --require-converged path must not return 0
 * while v3 artifacts say the run is incomplete.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { runDetectionGate, runV3Gate } = require('../../.claude/scripts/tickets/omission-detection-gate.js');
const { evidenceDigestOf } = require('../../.claude/scripts/tickets/lib/dispositions.js');

const GATE = path.resolve(__dirname, '../../.claude/scripts/tickets/omission-detection-gate.js');
const KEY = 'clause|pkg-alpha|OBL-alpha|precondition|aaaaaaaaaaaaaaaa';
const EVIDENCE = [{ file: 'docs/HANDOVER.md', line: 652 }];

/** The minimal v3 artifacts for one resolved clause. */
// [::TICKET::] PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-440 --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-440 --for-spec --no-implementation-order`.
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

test('C003 Postcondition: an open ticket prevents completion even with remainder zero', () => {
  const gate = runV3Gate({ cwd: process.cwd(), v3Artifacts: artifacts(), dispositions: dispositions(), repairs: [], openTickets: 1 });

  assert.equal(gate.complete, false);
  assert.equal(gate.exitCode, 10);
  assert.equal(gate.predicateVersion, 3);
  assert.equal(gate.terminal, false);
  assert.equal(gate.gates.find((entry) => entry.name === 'open-tickets').ok, false);
});

test('C003 Postcondition: zero remainder, zero open tickets and zero repairs completes', () => {
  const gate = runV3Gate({ cwd: process.cwd(), v3Artifacts: artifacts(), dispositions: dispositions(), repairs: [], openTickets: 0 });

  assert.equal(gate.complete, true);
  assert.equal(gate.exitCode, 0);
  assert.equal(gate.terminal, true);
  assert.equal(gate.counts.remainder, 0);
});

test('C003 Postcondition: a pending repair prevents completion', () => {
  const gate = runV3Gate({
    cwd: process.cwd(),
    v3Artifacts: artifacts(),
    dispositions: dispositions(),
    repairs: [{ repairKey: 'sha256:repair', status: 'pending' }],
    openTickets: 0,
  });

  assert.equal(gate.complete, false);
  assert.equal(gate.exitCode, 10);
});

test('C003 Invariant: with v3 artifacts the legacy require-converged path returns the v3 verdict', () => {
  const gate = runDetectionGate({
    cwd: process.cwd(),
    requireConverged: true,
    v3Artifacts: artifacts(),
    dispositions: dispositions(),
    repairs: [],
    openTickets: 1,
  });

  assert.equal(gate.exitCode, 10);
  assert.equal(gate.predicateVersion, 3);
  assert.equal(gate.complete, false);
});

test('C003 Postcondition: a debt increase prevents completion', () => {
  const deferred = [{
    key: KEY,
    status: 'DEFERRED',
    owner: 'P1-1',
    reason: 'review pending',
    normativeSource: 'process:1',
    createdAt: '2026-11-17',
    expiresAt: '2027-01-01',
  }];
  const gate = runV3Gate({
    cwd: process.cwd(),
    v3Artifacts: { ...artifacts(), inventory: { ...artifacts().inventory, clauses: [{ ...artifacts().inventory.clauses[0], applicability: 'PROCESS' }] } },
    dispositions: deferred,
    repairs: [],
    openTickets: 0,
    convergence: { debtBefore: 0, newTickets: 0 },
  });

  assert.equal(gate.complete, false);
  assert.equal(gate.gates.find((entry) => entry.name === 'convergence').ok, false);
  assert.equal(gate.counts.debt, 1);
});

test('C003 Postcondition: a changed digest since the previous run prevents completion', () => {
  const gate = runV3Gate({
    cwd: process.cwd(),
    v3Artifacts: artifacts(),
    dispositions: dispositions(),
    repairs: [],
    openTickets: 0,
    convergence: { previous: { inventoryDigest: 'sha256:other', coverageDigest: 'sha256:other' }, debtBefore: 0, newTickets: 0 },
  });

  assert.equal(gate.complete, false);
  assert.equal(gate.counts.crossRunStable, false);
});

test('C003 Postcondition: a new ticket for a covered obligation prevents completion', () => {
  const gate = runV3Gate({
    cwd: process.cwd(),
    v3Artifacts: artifacts(),
    dispositions: dispositions(),
    repairs: [],
    openTickets: 0,
    convergence: { debtBefore: 0, newTickets: 1 },
  });

  assert.equal(gate.complete, false);
  assert.equal(gate.gates.find((entry) => entry.name === 'convergence').ok, false);
});

test('C003 Invariant: --v3 without artifacts is work, never a false pass', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'px440-gate-'));
  try {
    const result = spawnSync(process.execPath, [GATE, '--cwd=' + cwd, '--v3'], { cwd, encoding: 'utf8' });
    const report = JSON.parse(result.stdout);
    assert.equal(result.status, 10);
    assert.equal(report.predicateVersion, 3);
    assert.equal(report.complete, false);
    assert.equal(report.findings[0].code, 'V3_ARTIFACTS_MISSING');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
