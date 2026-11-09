'use strict';
// PX-397 @verifies C002

/**
 * PX-397 — the repair loop.
 *
 * The loop runs the gates, applies every executable fix, and reruns. Completion
 * needs two consecutive zero-finding runs with the same digest. A fix that the
 * tool refuses is recorded, never thrown: the loop must not stop the pipeline.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createFinding } = require('../../.claude/scripts/tickets/lib/gate-finding.js');
const { runRepairLoop } = require('../../.claude/scripts/tickets/repair-loop.js');
const { patchTicket } = require('../../.claude/scripts/tickets/patch-ticket.js');

/** A finding whose fix is a patch of one ticket field. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function finding(code, input, asset = 'PX-1/' + code) {
  return createFinding({
    code,
    asset,
    problem: 'problem for ' + code,
    fixes: [{ tool: 'patch-ticket', input }],
    rerun: 'rerun ' + code,
  });
}

/** A minimal valid Tickets.json document. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function fixtureDocument() {
  return {
    title: 'fixture',
    round: 1,
    metadata: { source: 'fixture', generatedAt: '2026-11-09' },
    phases: [{
      id: 0,
      name: 'P0',
      tickets: [{
        id: 1,
        phaseId: 0,
        status: 'planned',
        title: 'Fixture',
        scope: ['existing'],
        contracts: [{
          id: 'C001',
          sourceEdge: 'N0001->N0002',
          precondition: 'p',
          postcondition: 'q',
          invariant: 'r',
        }],
      }],
    }],
  };
}

test('C002: the loop completes after two consecutive zero-finding runs with the same digest', () => {
  let gateRuns = 0;
  let fixesApplied = 0;
  const repairable = finding('TEST_MISSING', { field: 'scope' });

  const result = runRepairLoop({
    runGates: () => {
      gateRuns += 1;
      return {
        findings: gateRuns === 1 ? [repairable] : [],
        gates: [{ name: 'synthetic', digest: 'digest-1' }],
      };
    },
    applyFix: () => { fixesApplied += 1; },
  });

  assert.equal(result.completed, true);
  assert.equal(result.runs, 3);
  assert.equal(fixesApplied, 1);
  assert.deepEqual(result.finalFindings, []);
  assert.equal(result.certificate.proof.stableRuns, 2);
  assert.equal(result.certificate.proof.zeroFindings, true);
});

test('C002: one zero run is not completion', () => {
  const result = runRepairLoop({
    runGates: () => ({ findings: [], gates: [{ name: 'synthetic', digest: 'd' }] }),
    applyFix: () => {},
    maxRuns: 1,
  });

  assert.equal(result.completed, false);
  assert.equal(result.reason, 'MAX_RUNS');
});

test('C002: an increasing identity set reports DEBT_INCREASED', () => {
  let gateRuns = 0;
  const first = finding('CONTRACT_TEST_MISSING', { field: 'scope' }, 'PX-1/C001');
  const second = finding('TEST_MISSING', { field: 'scope' }, 'PX-1/C002');

  const result = runRepairLoop({
    runGates: () => {
      gateRuns += 1;
      if (gateRuns === 1) return { findings: [first], gates: [{ name: 'synthetic', digest: 'd1' }] };
      if (gateRuns === 2) return { findings: [first, second], gates: [{ name: 'synthetic', digest: 'd2' }] };
      return { findings: [], gates: [{ name: 'synthetic', digest: 'd3' }] };
    },
    applyFix: () => {},
    maxRuns: 3,
  });

  assert.equal(result.completed, false);
  assert.equal(result.reason, 'MAX_RUNS');
  assert.ok(result.debtFindings.some((entry) => entry.code === 'DEBT_INCREASED'));
});

test('C002: identical fixes are applied once per run', () => {
  let gateRuns = 0;
  let fixesApplied = 0;
  const sharedInput = { field: 'scope' };
  const left = finding('CONTRACT_TEST_MISSING', sharedInput, 'PX-1/C001');
  const right = finding('TEST_MISSING', sharedInput, 'PX-1/C002');

  runRepairLoop({
    runGates: () => {
      gateRuns += 1;
      return {
        findings: gateRuns === 1 ? [left, right] : [],
        gates: [{ name: 'synthetic', digest: 'd' }],
      };
    },
    applyFix: () => { fixesApplied += 1; },
  });

  assert.equal(fixesApplied, 1);
});

test('C002: a rejected fix is recorded and the loop continues', () => {
  const repairable = finding('TEST_MISSING', { field: 'scope' });
  const result = runRepairLoop({
    runGates: () => ({
      findings: [repairable],
      gates: [{ name: 'synthetic', digest: 'd' }],
    }),
    applyFix: () => { throw new Error('tool refused'); },
    maxRuns: 2,
  });

  assert.equal(result.completed, false);
  assert.equal(result.reason, 'MAX_RUNS');
  assert.equal(result.failedFixes.length, 2);
  assert.match(result.failedFixes[0].error.message, /refused/);
});

test('IT: patch-ticket repairs a synthetic finding and the loop completes', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-loop-'));
  const ticketsPath = path.join(directory, 'Tickets.json');
  fs.writeFileSync(ticketsPath, JSON.stringify(fixtureDocument(), null, 2) + '\n');

  const repair = finding('TEST_MISSING', {
    ticketsPath,
    ticketKey: 'P0-1',
    field: 'scope',
    value: ['repaired'],
    mode: 'append',
  }, 'PX-1/scope');

  const result = runRepairLoop({
    runGates: () => {
      const document = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
      const ticket = document.phases[0].tickets[0];
      const findings = ticket.scope.includes('repaired') ? [] : [repair];
      return { findings, gates: [{ name: 'synthetic', digest: 'd' }] };
    },
    applyFix: (fix) => patchTicket(fix.input),
  });

  assert.equal(result.completed, true);
  const repaired = JSON.parse(fs.readFileSync(ticketsPath, 'utf8')).phases[0].tickets[0];
  assert.deepEqual(repaired.scope, ['existing', 'repaired']);
});
