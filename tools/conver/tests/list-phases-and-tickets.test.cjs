/**
 * list-phases-and-tickets.test.cjs — Tests for list-phases-and-tickets.js
 *
 * Verifies:
 * 1. resolveCheckbox renders '[R<N>]' for round-aware statuses (R1, R2, R99)
 * 2. resolveCheckbox keeps existing checkbox mapping for ALLOWED statuses
 * 3. resolveCheckbox falls back to '[ ]' for unknown statuses
 * 4. Full rendering outputs '- [R1]' for a ticket with status R1
 * 5. orderPhasesPxFirst moves the PX phase (id === -1) to the front only when needed
 * 6. persistPxFirstOrder rewrites Tickets.json PX-first, skipping the write when unchanged
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  resolveCheckbox,
  renderTicketLines,
  orderPhasesPxFirst,
  persistPxFirstOrder
} = require('../.claude/scripts/tickets/list-phases-and-tickets.js');

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

// ============================================================
// Unit tests: orderPhasesPxFirst
// ============================================================

function phaseIds(phases) {
  return phases.map(function (p) { return p.id; });
}

// PX in the middle -> moved to front, others keep relative order
{
  const input = [{ id: 0 }, { id: -1 }, { id: 1 }, { id: 2 }];
  const out = orderPhasesPxFirst(input);
  assert.deepStrictEqual(phaseIds(out), [-1, 0, 1, 2], 'PX moves to front');
  assert.notStrictEqual(out, input, 'reorder returns a new array');
  assert.deepStrictEqual(phaseIds(input), [0, -1, 1, 2], 'input array is not mutated');
}

// PX already first -> unchanged (same reference, no reorder)
{
  const input = [{ id: -1 }, { id: 0 }, { id: 1 }];
  assert.strictEqual(orderPhasesPxFirst(input), input, 'already first -> same reference');
}

// PX absent -> unchanged
{
  const input = [{ id: 0 }, { id: 1 }];
  assert.strictEqual(orderPhasesPxFirst(input), input, 'no PX -> same reference');
}

// Empty array -> unchanged
{
  const input = [];
  assert.strictEqual(orderPhasesPxFirst(input), input, 'empty -> same reference');
}

// Only PX -> unchanged
{
  const input = [{ id: -1 }];
  assert.strictEqual(orderPhasesPxFirst(input), input, 'only PX -> same reference');
}

// undefined / null -> unchanged
assert.strictEqual(orderPhasesPxFirst(undefined), undefined, 'undefined -> unchanged');
assert.strictEqual(orderPhasesPxFirst(null), null, 'null -> unchanged');

// ============================================================
// persistPxFirstOrder: file write-back tests
// ============================================================

function writeTempTickets(phases) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-test-'));
  const fp = path.join(dir, 'Tickets.json');
  fs.writeFileSync(fp, JSON.stringify({ phases: phases }, null, 2) + '\n', 'utf8');
  return fp;
}

function removeTempFile(fp) {
  fs.rmSync(path.dirname(fp), { recursive: true, force: true });
}

// PX in the middle -> file is rewritten with PX first, 2-space + trailing newline
{
  const fp = writeTempTickets([
    { id: 0, name: 'P0', tickets: [] },
    { id: -1, name: 'PX', tickets: [] },
    { id: 1, name: 'P1', tickets: [] }
  ]);
  try {
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const wrote = persistPxFirstOrder(fp, data);
    assert.strictEqual(wrote, true, 'order changed -> must write');
    const after = JSON.parse(fs.readFileSync(fp, 'utf8'));
    assert.deepStrictEqual(phaseIds(after.phases), [-1, 0, 1], 'file now has PX first');
    const raw = fs.readFileSync(fp, 'utf8');
    assert.ok(raw.endsWith('}\n'), 'trailing newline preserved');
    assert.ok(raw.includes('\n  "phases"'), '2-space indentation preserved');
  } finally {
    removeTempFile(fp);
  }
}

// PX already first -> file is NOT rewritten
{
  const fp = writeTempTickets([
    { id: -1, name: 'PX', tickets: [] },
    { id: 0, name: 'P0', tickets: [] }
  ]);
  try {
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const beforeRaw = fs.readFileSync(fp, 'utf8');
    const beforeMtime = fs.statSync(fp).mtimeMs;
    const wrote = persistPxFirstOrder(fp, data);
    assert.strictEqual(wrote, false, 'already first -> no write');
    assert.strictEqual(fs.readFileSync(fp, 'utf8'), beforeRaw, 'file content unchanged');
    assert.strictEqual(fs.statSync(fp).mtimeMs, beforeMtime, 'file mtime unchanged');
  } finally {
    removeTempFile(fp);
  }
}

// PX absent -> file is NOT rewritten
{
  const fp = writeTempTickets([
    { id: 0, name: 'P0', tickets: [] },
    { id: 1, name: 'P1', tickets: [] }
  ]);
  try {
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const wrote = persistPxFirstOrder(fp, data);
    assert.strictEqual(wrote, false, 'PX absent -> no write');
    const after = JSON.parse(fs.readFileSync(fp, 'utf8'));
    assert.deepStrictEqual(phaseIds(after.phases), [0, 1], 'phase order untouched');
  } finally {
    removeTempFile(fp);
  }
}

// Empty phases -> no write
{
  const fp = writeTempTickets([]);
  try {
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const wrote = persistPxFirstOrder(fp, data);
    assert.strictEqual(wrote, false, 'empty phases -> no write');
  } finally {
    removeTempFile(fp);
  }
}
