// @verifies C001
const assert = require('assert');

const {
  checkKeyValidity,
} = require('../../scripts/tickets/validate-no-external-excuses.js');

// Statuses in this fixture are deliberately synthetic: the behavior must depend on
// the status value, never on a workspace, path or ticket-key family.
const ticketsData = {
  phases: [
    {
      id: 0,
      tickets: [
        { id: 3, status: 'made' },
        { id: 4, status: 'todo' },
        { id: 5, status: 'reviewed' },
      ],
    },
  ],
};

let passed = 0;
let failed = 0;

// [::TICKET::] PX-414 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-414 --for-spec --no-implementation-order`.
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${error.message}`);
    failed++;
  }
}

console.log('\n## A STUB keyed to a spec-complete ticket is an active obligation\n');

test('status "made" is an active obligation', () => {
  const verdict = checkKeyValidity('P0-3', ticketsData, false);
  assert.strictEqual(verdict.passed, true, verdict.reason);
});

test('status "todo" is an active obligation', () => {
  const verdict = checkKeyValidity('P0-4', ticketsData, false);
  assert.strictEqual(verdict.passed, true, verdict.reason);
});

test('status "reviewed" needs consolidation mode', () => {
  assert.strictEqual(checkKeyValidity('P0-5', ticketsData, false).passed, false);
  assert.strictEqual(checkKeyValidity('P0-5', ticketsData, true).passed, true);
});

test('a missing ticket still fails', () => {
  assert.strictEqual(checkKeyValidity('P0-99', ticketsData, false).passed, false);
});

console.log(`\n━━━ Results: ${passed} passed, ${failed} failed ━━━\n`);
process.exit(failed > 0 ? 1 : 0);
