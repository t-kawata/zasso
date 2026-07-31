/**
 * list-phases-and-tickets.test.cjs — Tests for list-phases-and-tickets.js PX-114 round-aware rendering
 *
 * Verifies:
 * 1. resolveCheckbox renders '[R<N>]' for round-aware statuses (R1, R2, R99)
 * 2. resolveCheckbox keeps existing checkbox mapping for ALLOWED statuses
 * 3. resolveCheckbox falls back to '[ ]' for unknown statuses
 * 4. Full rendering outputs '- [R1]' for a ticket with status R1
 */

const assert = require('node:assert/strict');
const { resolveCheckbox, renderTicketLines } = require('../.claude/scripts/tickets/list-phases-and-tickets.js');

// ============================================================
// Unit tests: resolveCheckbox
// ============================================================

// Round-aware status renders '[R<N>]'
assert.strictEqual(resolveCheckbox('R1'), '[R1]', 'R1 -> [R1]');
assert.strictEqual(resolveCheckbox('R2'), '[R2]', 'R2 -> [R2]');
assert.strictEqual(resolveCheckbox('R99'), '[R99]', 'R99 -> [R99]');

// Existing ALLOWED mapping preserved
assert.strictEqual(resolveCheckbox('todo'), '[ ]', 'todo -> [ ]');
assert.strictEqual(resolveCheckbox('made'), '[_]', 'made -> [_]');
assert.strictEqual(resolveCheckbox('planned'), '[|]', 'planned -> [|]');
assert.strictEqual(resolveCheckbox('done'), '[/]', 'done -> [/]');
assert.strictEqual(resolveCheckbox('reviewed'), '[x]', 'reviewed -> [x]');
assert.strictEqual(resolveCheckbox('remanded'), '[!]', 'remanded -> [!]');

// Unknown / malformed round status falls back to '[ ]'
assert.strictEqual(resolveCheckbox('R'), '[ ]', 'R -> fallback [ ]');
assert.strictEqual(resolveCheckbox('R0'), '[ ]', 'R0 -> fallback [ ]');
assert.strictEqual(resolveCheckbox('unknown'), '[ ]', 'unknown -> fallback [ ]');

console.log('✅ resolveCheckbox unit tests passed');

// ============================================================
// Rendering test: full markdown line for an R-status ticket
// ============================================================

const lines = renderTicketLines({
  phases: [
    { id: 0, name: 'P0', tickets: [{ id: 1, phaseId: 0, status: 'R1', title: 'Ticket A' }] }
  ]
});

const renderedLine = lines.find(function(l) { return l.includes('P0-1'); });
assert.ok(renderedLine, 'P0-1 must appear in rendered output');
assert.ok(renderedLine.includes('[R1]'), 'Rendered line must show [R1], got: ' + renderedLine);
assert.strictEqual(renderedLine, '    - [R1] P0-1: Ticket A');

console.log('✅ renderTicketLines R-status test passed');
console.log('\n🎉 All list-phases-and-tickets PX-114 tests passed!');
