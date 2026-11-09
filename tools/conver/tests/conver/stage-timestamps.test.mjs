import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const UPDATE_TICKET = fileURLToPath(new URL('../../.claude/scripts/tickets/update-ticket.js', import.meta.url));
const MALFEASANCE_UPDATE = fileURLToPath(new URL('../../.claude/scripts/tickets/malfeasance-update.js', import.meta.url));
const UPDATE_STEP_STATUS = fileURLToPath(new URL('../../.claude/scripts/crystalize-readme/update-step-status.js', import.meta.url));
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// [::TICKET::] PX-401 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-401 --for-spec --no-implementation-order`.
function temporaryDirectory(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `px401-${label}-`));
}

// [::TICKET::] PX-401 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-401 --for-spec --no-implementation-order`.
function writeTickets(directory) {
  const document = {
    title: 'PX-401 timestamp fixture',
    round: 1,
    metadata: { source: 'test', generatedAt: '2026-11-10' },
    phases: [{
      id: 0,
      name: 'P0',
      tickets: [{ id: 1, phaseId: 0, title: 'fixture ticket', status: 'todo', contracts: [{ id: 'C001', sourceEdge: 'edge', precondition: 'p', postcondition: 'q', invariant: 'r' }] }],
    }],
  };
  const file = path.join(directory, 'Tickets.json');
  fs.writeFileSync(file, JSON.stringify(document, null, 2) + '\n');
  return file;
}

// [::TICKET::] PX-401 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-401 --for-spec --no-implementation-order`.
function readTicket(file) {
  const document = JSON.parse(fs.readFileSync(file, 'utf8'));
  return document.phases[0].tickets[0];
}

// [::TICKET::] PX-401 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-401 --for-spec --no-implementation-order`.
function writeCrime(directory) {
  const file = path.join(directory, 'Malfeasance.json');
  fs.writeFileSync(file, JSON.stringify({
    version: 1,
    records: [{
      id: 2,
      file: 'src/example.js',
      line: 1,
      description: 'Incomplete implementation',
      detected_at: '2026-11-01T00:00:00.000Z',
      status: 'open',
      note: '',
    }],
  }, null, 2) + '\n');
  return file;
}

// [::TICKET::] PX-401 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-401 --for-spec --no-implementation-order`.
function readCrime(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8')).records[0];
}

// [::TICKET::] PX-401 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-401 --for-spec --no-implementation-order`.
function writeCrystalizeStatus(directory) {
  const file = path.join(directory, 'CRYSTALIZE-Status.json');
  fs.writeFileSync(file, JSON.stringify({
    sourceFile: path.join(directory, 'README.md'),
    graphFile: path.join(directory, 'graph.json'),
    currentStep: 1,
    steps: { 0: 'pending', 1: 'pending', 2: 'pending', 3: 'pending' },
    grill: { tocApproved: false, examplesApproved: false, toc: { nodes: [] }, sections: [] },
  }, null, 2) + '\n');
  return file;
}

test('C001: each status transition writes exactly one ISO instant', () => {
  const directory = temporaryDirectory('status');
  const file = writeTickets(directory);
  for (const [status, field] of [['made', 'made_at'], ['planned', 'planned_at'], ['done', 'done_at'], ['reviewed', 'reviewed_at']]) {
    fs.writeFileSync(file, JSON.stringify({
      title: 'PX-401 timestamp fixture',
      round: 1,
      metadata: { source: 'test', generatedAt: '2026-11-10' },
      phases: [{ id: 0, name: 'P0', tickets: [{ id: 1, phaseId: 0, title: 'fixture ticket', status: 'todo', contracts: [{ id: 'C001', sourceEdge: 'edge', precondition: 'p', postcondition: 'q', invariant: 'r' }] }] }],
    }, null, 2) + '\n');
    execFileSync('node', [UPDATE_TICKET, 'Tickets.json', 'P0-1'], {
      cwd: directory,
      input: JSON.stringify({ status }),
    });
    const ticket = readTicket(file);
    assert.equal(ticket.status, status);
    assert.match(ticket[field], ISO_INSTANT);
  }
});

test('C002: a repeated status and a non-status update preserve the first instant', () => {
  const directory = temporaryDirectory('idempotent');
  const file = writeTickets(directory);
  execFileSync('node', [UPDATE_TICKET, 'Tickets.json', 'P0-1'], {
    cwd: directory,
    input: JSON.stringify({ status: 'reviewed' }),
  });
  const first = readTicket(file).reviewed_at;
  execFileSync('node', [UPDATE_TICKET, 'Tickets.json', 'P0-1'], {
    cwd: directory,
    input: JSON.stringify({ status: 'reviewed' }),
  });
  assert.equal(readTicket(file).reviewed_at, first);
  execFileSync('node', [UPDATE_TICKET, 'Tickets.json', 'P0-1'], {
    cwd: directory,
    input: JSON.stringify({ note: 'no status change' }),
  });
  assert.equal(readTicket(file).reviewed_at, first);
  assert.equal(readTicket(file).planned_at, undefined);
});

test('C003: false_positive writes resolved_at and keeps it on a repeated update', () => {
  const directory = temporaryDirectory('malfeasance');
  const file = writeCrime(directory);
  execFileSync('node', [MALFEASANCE_UPDATE, '2', 'status', 'false_positive'], { cwd: directory });
  const first = readCrime(file).resolved_at;
  assert.match(first, ISO_INSTANT);
  execFileSync('node', [MALFEASANCE_UPDATE, '2', 'status', 'false_positive'], { cwd: directory });
  assert.equal(readCrime(file).resolved_at, first);
});

test('C004: every CRYSTALIZE step update writes updated_at and the final step writes completed_at', () => {
  const directory = temporaryDirectory('crystalize');
  const file = writeCrystalizeStatus(directory);
  execFileSync('node', [UPDATE_STEP_STATUS, `--status=${file}`, 'start-step', '2']);
  const started = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.match(started.updated_at, ISO_INSTANT);
  assert.equal(started.completed_at, undefined);
  execFileSync('node', [UPDATE_STEP_STATUS, `--status=${file}`, 'end-step', '3']);
  const completed = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.match(completed.updated_at, ISO_INSTANT);
  assert.match(completed.completed_at, ISO_INSTANT);
});

test('C004: starting or resetting after the final step clears completed_at', () => {
  const directory = temporaryDirectory('crystalize-reset');
  const file = writeCrystalizeStatus(directory);
  execFileSync('node', [UPDATE_STEP_STATUS, `--status=${file}`, 'end-step', '3']);
  assert.match(JSON.parse(fs.readFileSync(file, 'utf8')).completed_at, ISO_INSTANT);
  execFileSync('node', [UPDATE_STEP_STATUS, `--status=${file}`, 'start-step', '2']);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).completed_at, undefined);
  execFileSync('node', [UPDATE_STEP_STATUS, `--status=${file}`, 'end-step', '3']);
  assert.match(JSON.parse(fs.readFileSync(file, 'utf8')).completed_at, ISO_INSTANT);
  execFileSync('node', [UPDATE_STEP_STATUS, `--status=${file}`, 'reset-to-step', '1']);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).completed_at, undefined);
});
