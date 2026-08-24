/**
 * add-ticket-phase.test.cjs — Phase auto-numbering for add-ticket.js
 *
 * Regression test for the detached PX (-1) phase being counted by the new-phase
 * auto-numbering. add-ticket.js assigned `data.phases.length` (16 for a
 * Tickets.json with PX + phases 0..14) instead of `max existing id + 1` (15).
 *
 * @verifies  new phase id follows the max existing phase id + 1 (PX excluded)
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ADD_TICKET = path.resolve(__dirname, '../../.claude/scripts/tickets/add-ticket.js');
const VALIDATE_LIB = path.resolve(__dirname, '../../.claude/scripts/lib/validate-tickets.js');

let tmpRoot;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'add-ticket-phase-'));
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/** Build a validate-valid Tickets.json with a detached PX (-1) phase + phases 0..14. */
function buildTicketsWithMaxPhase14() {
  const phases = [
    {
      id: -1,
      name: 'PX',
      tickets: [
        { id: 1, phaseId: -1, status: 'reviewed', title: 'PX ticket', nodeIds: [], scope: [], testUnit: [], testIntegration: [], testExceptions: [], changes: [] },
      ],
    },
  ];
  for (let i = 0; i <= 14; i++) {
    phases.push({ id: i, name: `Phase ${i}`, tickets: [] });
  }
  return { title: 'Test', round: 5, metadata: { source: 'RFC.md', generatedAt: '2026-08-24' }, phases };
}

describe('add-ticket.js phase auto-numbering', () => {
  it('assigns the new phase id as max existing id + 1 (PX -1 excluded, not phases.length)', () => {
    const ticketsPath = path.join(tmpRoot, 'Tickets.json');
    writeJson(ticketsPath, buildTicketsWithMaxPhase14());

    const ticketInput = JSON.stringify({
      title: 'Session storage',
      nodeIds: ['N0003'],
      scope: [],
      testUnit: [],
      testIntegration: [],
      testExceptions: [],
      changes: [],
      phaseName: 'Implementation Integration',
    });

    const res = spawnSync(process.execPath, [ADD_TICKET, ticketsPath, 'Implementation Integration'], {
      encoding: 'utf8',
      input: ticketInput,
    });
    assert.equal(res.status, 0, res.stderr);

    const updated = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
    const newPhase = updated.phases.find((p) => p.name === 'Implementation Integration');
    assert.ok(newPhase, 'new phase was created');
    assert.equal(
      newPhase.id,
      15,
      `new phase id must be max existing id (14) + 1 = 15, got ${newPhase.id} (bug: phases.length = 16 counts PX)`
    );

    const { validateTickets } = require(VALIDATE_LIB);
    const validation = validateTickets(updated);
    assert.equal(validation.valid, true, `validate-tickets should pass: ${JSON.stringify(validation.errors)}`);
  });
});
