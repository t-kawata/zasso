'use strict';
// PX-398 @verifies C001 @verifies C002 @verifies C005

/**
 * PX-398 — the two known false passes.
 *
 * One code block used to satisfy every contract in planTestCode, and one shared
 * keyword used to satisfy a contract in the test plan. The default gates keep
 * that behaviour for existing callers; report mode names the uncovered contract.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  verifyPlanContracts,
  findPlanTestCodeGaps,
} = require('../../.claude/scripts/tickets/verify-plan-contracts.js');
const {
  verifyMakeContracts,
  findMakeContractIdGaps,
} = require('../../.claude/scripts/tickets/verify-make-contracts.js');

const CLAUDE_DIR = path.resolve(__dirname, '../..', '.claude');
const VERIFY_PLAN = path.join(CLAUDE_DIR, 'scripts/tickets/verify-plan-contracts.js');
const VERIFY_MAKE = path.join(CLAUDE_DIR, 'scripts/tickets/verify-make-contracts.js');

/** One contract with a distinctive clause. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function contract(id) {
  return {
    id,
    sourceEdge: 'N0001->N0002',
    precondition: 'alpha ' + id,
    postcondition: 'beta ' + id,
    invariant: 'gamma ' + id,
  };
}

/** A Tickets.json fixture that both default gates accept. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function writeValidFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-false-pass-'));
  const ticketsPath = path.join(directory, 'Tickets.json');
  fs.writeFileSync(ticketsPath, JSON.stringify({
    title: 'fixture',
    round: 1,
    metadata: { source: 'fixture', generatedAt: '2026-11-09' },
    phases: [{
      id: -1,
      name: 'PX',
      tickets: [{
        id: 1,
        phaseId: -1,
        status: 'planned',
        title: 'Fixture',
        contracts: [contract('C001')],
        planTestCode: ['C001 test\n\n```js\nassert.ok(true);\n```'],
        testUnit: ['UT: C001 alpha beta gamma'],
        testIntegration: [],
        testExceptions: [],
      }],
    }],
  }, null, 2) + '\n');
  return ticketsPath;
}

test('C001: two contracts sharing one untagged code block are both reported', () => {
  const ticket = {
    contracts: [contract('C001'), contract('C002')],
    planTestCode: ['```js\nassert.ok(true);\n```'],
  };

  const findings = findPlanTestCodeGaps(ticket, 'PX-1', 'Tickets.json');

  assert.equal(findings.length, 2);
  assert.deepEqual(findings.map((entry) => entry.code), [
    'CONTRACT_TEST_MISSING',
    'CONTRACT_TEST_MISSING',
  ]);
  assert.ok(findings.some((entry) => entry.asset.includes('C001')));
  assert.ok(findings.some((entry) => entry.asset.includes('C002')));
  assert.ok(findings.every((entry) => entry.fixes.length > 0));
});

test('C001: each contract id in its own code entry is covered', () => {
  const ticket = {
    contracts: [contract('C001'), contract('C002')],
    planTestCode: [
      'C001 test\n\n```js\nassert.ok(true);\n```',
      'C002 test\n\n```js\nassert.equal(1, 1);\n```',
    ],
  };

  assert.deepEqual(findPlanTestCodeGaps(ticket, 'PX-1', 'Tickets.json'), []);
});

test('C001/C005: the default Gate P still passes the one-code-block ticket', () => {
  const ticket = {
    contracts: [contract('C001'), contract('C002')],
    planTestCode: ['```js\nassert.ok(true);\n```'],
  };

  assert.deepEqual(verifyPlanContracts(ticket), []);
  assert.deepEqual(verifyPlanContracts({ contracts: [], planTestCode: [] }), []);
});

test('C002: a keyword match elsewhere does not satisfy the contract id', () => {
  const ticket = {
    contracts: [contract('C001')],
    testUnit: ['UT: alpha beta gamma'],
    testIntegration: [],
    testExceptions: [],
  };

  assert.deepEqual(verifyMakeContracts(ticket), []);

  const findings = findMakeContractIdGaps(ticket, 'PX-1', 'Tickets.json');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, 'CONTRACT_TEST_MISSING');
  assert.match(findings[0].asset, /C001/);
});

test('C002: the contract id in the test plan satisfies the strict id check', () => {
  const ticket = {
    contracts: [contract('C001')],
    testUnit: ['UT: C001 alpha beta gamma'],
    testIntegration: [],
    testExceptions: [],
  };

  assert.deepEqual(findMakeContractIdGaps(ticket, 'PX-1', 'Tickets.json'), []);
});

test('C005: default plan and make gate stdout is unchanged for a valid fixture', () => {
  const ticketsPath = writeValidFixture();

  assert.equal(
    execFileSync(process.execPath, [VERIFY_PLAN, '--ticket-key=PX-1', '--tickets=' + ticketsPath], { encoding: 'utf8' }),
    '{"ok":true,"ticket":"PX-1"}\n',
  );
  assert.equal(
    execFileSync(process.execPath, [VERIFY_MAKE, '--ticket-key=PX-1', '--tickets=' + ticketsPath], { encoding: 'utf8' }),
    '{"ok":true,"ticket":"PX-1"}\n',
  );
});
