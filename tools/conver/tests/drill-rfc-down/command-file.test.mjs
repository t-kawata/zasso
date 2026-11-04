// PX-365 @verifies C004
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const COMMANDS = join(ROOT, '.claude/commands');
const DRILL = readFileSync(join(COMMANDS, 'drill-rfc-down.md'), 'utf8');
const GRILL = readFileSync(join(COMMANDS, 'grill-me-for-rfc.md'), 'utf8');

// [::TICKET::] PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-365 --for-spec --no-implementation-order`.
test('C004 invariant: neither command carries a ticket id or change-history prose', () => {
  for (const [name, text] of [['drill-rfc-down.md', DRILL], ['grill-me-for-rfc.md', GRILL]]) {
    assert.equal(/PX-[0-9]+/.test(text), false, `${name} carries a ticket id`);
    assert.equal(/change history|formerly known as/i.test(text), false, `${name} carries history prose`);
  }
});

test('C004 postcondition: drill carries the identity, ledger, graph, Dirs-Tree, ticket and verify gates', () => {
  for (const gate of [
    'verify-source-identity.js',
    'check-formula-coverage.js',
    'attach-formula-ids.js',
    'verify-formula-file-coverage.js',
    'merge-formulas-to-tickets.js',
    'verify-step.js',
    'BLOCKED_PREREQUISITE',
    'REPAIR_NO_PROGRESS',
    'DRILL-REPORT.json',
  ]) {
    assert.equal(DRILL.includes(gate), true, `drill-rfc-down.md is missing ${gate}`);
  }
});

test('C004 invariant: the shared question-gate block is byte-identical in both commands', () => {
  const block = (text) => text.slice(
    text.indexOf('<!-- question-gate:begin -->'),
    text.indexOf('<!-- question-gate:end -->') + '<!-- question-gate:end -->'.length,
  );
  assert.equal(block(DRILL), block(GRILL));
});

test('C004 invariant: the existing step headings survive the surgical edits', () => {
  for (const heading of ['### Step 0', '### Step 1', '### Step 2', '### Step 3', '### Step 4', '### Step 5']) {
    assert.equal(DRILL.includes(heading), true, heading);
  }
  for (const heading of ['### STEP 0', '### STEP 5c', '### STEP 8']) {
    assert.equal(GRILL.includes(heading), true, heading);
  }
});
