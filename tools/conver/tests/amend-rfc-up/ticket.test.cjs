'use strict';

/**
 * PX-419 — amendment ticket creation and digest reuse.
 */

const { test } = require('node:test');
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  ensureAmendmentTicket,
  findAmendmentTicket,
} = require('../../.claude/scripts/amend-rfc-up/ticket.js');
const { cleanup } = require('./helpers.cjs');

function makeTicketsFile() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'px419-ticket-'));
  const ticketsPath = path.join(directory, 'Tickets.json');
  fs.writeFileSync(ticketsPath, JSON.stringify({
    title: 'fixture',
    round: 1,
    metadata: { source: 'fixture', generatedAt: '2026-01-01' },
    phases: [{ id: -1, name: '[X]', tickets: [] }],
  }, null, 2) + '\n');
  return { directory, ticketsPath };
}

function fakeRunner(ticketsPath) {
  let nextId = 419;
  return ({ title, notes }) => {
    const document = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
    const phase = document.phases.find((entry) => entry.id === -1);
    const ticketKey = `PX-${nextId}`;
    phase.tickets.push({ id: nextId, phaseId: -1, status: 'todo', title, notes });
    fs.writeFileSync(ticketsPath, JSON.stringify(document, null, 2) + '\n');
    nextId += 1;
    return { ticketKey };
  };
}

// @verifies C002
test('C002: a planned amendment ticket is created and reused by digest', () => {
  const { directory, ticketsPath } = makeTicketsFile();
  try {
    const runner = fakeRunner(ticketsPath);
    const first = ensureAmendmentTicket({
      packageDir: directory,
      ticketsPath,
      materialDigest: 'material-sha',
      instructionDigest: 'instruction-sha',
      runner,
    });
    assert.equal(first.created, true);
    assert.equal(first.reused, false);
    assert.match(first.ticketKey, /^PX-[0-9]+$/);

    const document = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
    const ticket = document.phases[0].tickets[0];
    assert.equal(ticket.status, 'todo');
    assert.match(ticket.notes, /Amendment digest: [0-9a-f]{64}/);

    const second = ensureAmendmentTicket({
      packageDir: directory,
      ticketsPath,
      materialDigest: 'material-sha',
      instructionDigest: 'instruction-sha',
      runner,
    });
    assert.equal(second.created, false);
    assert.equal(second.reused, true);
    assert.equal(second.ticketKey, first.ticketKey);
    assert.equal(findAmendmentTicket({ ticketsPath, digest: second.digest }).ticketKey, first.ticketKey);
  } finally {
    cleanup(directory);
  }
});

test('C002: a different digest creates a different ticket', () => {
  const { directory, ticketsPath } = makeTicketsFile();
  try {
    const runner = fakeRunner(ticketsPath);
    const first = ensureAmendmentTicket({
      packageDir: directory, ticketsPath,
      materialDigest: 'material-a', instructionDigest: 'instruction-a', runner,
    });
    const second = ensureAmendmentTicket({
      packageDir: directory, ticketsPath,
      materialDigest: 'material-b', instructionDigest: 'instruction-b', runner,
    });
    assert.notEqual(second.ticketKey, first.ticketKey);
    assert.equal(second.created, true);
  } finally {
    cleanup(directory);
  }
});

test('C002: the default runner uses the ticket CRUD add-ticket script', () => {
  const { directory, ticketsPath } = makeTicketsFile();
  try {
    const result = ensureAmendmentTicket({
      packageDir: directory,
      ticketsPath,
      materialDigest: 'material-sha',
      instructionDigest: 'instruction-sha',
    });
    assert.match(result.ticketKey, /^PX-[0-9]+$/);
    const document = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
    assert.equal(document.phases[0].tickets.length, 1);
  } finally {
    cleanup(directory);
  }
});

// @verifies C002
test('C002: the ticket CLI ensures a package ticket', () => {
  const { directory, ticketsPath } = makeTicketsFile();
  try {
    const result = spawnSync(process.execPath, [
      path.resolve(__dirname, '../../.claude/scripts/amend-rfc-up/ticket.js'),
      'ensure',
      `--package=${directory}`,
      `--tickets=${ticketsPath}`,
      '--material-digest=material-sha',
      '--instruction-digest=instruction-sha',
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.match(parsed.ticketKey, /^PX-[0-9]+$/);
    assert.equal(parsed.created, true);
  } finally {
    cleanup(directory);
  }
});
