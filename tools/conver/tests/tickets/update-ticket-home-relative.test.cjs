// [::TICKET::] PX-231 @verifies C004
//
// The ticket writer is the boundary where prose entered Tickets.json and carried
// this machine's home directory into a committed artefact. A path in `notes` is
// not a path field, so the field-specific normaliser never saw it; the writer now
// converts every string before serialising the document.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { homedir, tmpdir } = require('node:os');
const path = require('node:path');

const SCRIPT = path.resolve(__dirname, '../../.claude/scripts/tickets/update-ticket.js');

function writeTickets(directory) {
  const ticketsPath = path.join(directory, 'Tickets.json');
  writeFileSync(ticketsPath, JSON.stringify({
    title: 'Test',
    round: 1,
    metadata: { source: 'r.md', generatedAt: '2026-06-25' },
    phases: [{
      id: 0,
      name: 'P0',
      tickets: [{ id: 1, phaseId: 0, status: 'todo', title: 'a' }],
    }],
  }, null, 2));
  return ticketsPath;
}

test('update-ticket stores a home path embedded in prose as ~', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'update-home-'));
  try {
    const ticketsPath = writeTickets(directory);
    const home = homedir();
    const update = { notes: `validated on ${home}/shyme/zasso/specs/PX-1.md` };

    const result = spawnSync(process.execPath, [SCRIPT, ticketsPath, 'P0-1'], {
      input: JSON.stringify(update),
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    const written = JSON.parse(readFileSync(ticketsPath, 'utf8'));
    assert.equal(
      written.phases[0].tickets[0].notes,
      'validated on ~/shyme/zasso/specs/PX-1.md',
      'the committed ticket names no machine',
    );
    assert.equal(readFileSync(ticketsPath, 'utf8').includes(home), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
