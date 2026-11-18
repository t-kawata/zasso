'use strict';

// @verifies C004
// @verifies C005
// [::TICKET::] PX-444: a package supplies its mandatory ticket clause outside .claude.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { planOmissionTickets } = require('../../.claude/scripts/tickets/apply-omission-findings.js');
const { WORKLOAD_COMPONENTS } = require('../../.claude/scripts/tickets/lib/ticket-workload.js');
const {
  OMISSION_TICKET_NOTES_FILE_NAME,
  loadProjectTicketNotes,
} = require('../../.claude/scripts/tickets/lib/project-ticket-notes.js');

/** One contract with one clause per required element. */
// [::TICKET::] PX-444 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-444 --for-spec --no-implementation-order`.
function contractInventory() {
  return {
    scope: 'pkg',
    clauses: [
      { key: 'clause|pkg|C001|precondition|a', contractId: 'C001', element: 'precondition', text: 'pre', source: 'E1-E2' },
      { key: 'clause|pkg|C001|postcondition|b', contractId: 'C001', element: 'postcondition', text: 'post', source: 'E1-E2' },
      { key: 'clause|pkg|C001|invariant|c', contractId: 'C001', element: 'invariant', text: 'inv', source: 'E1-E2' },
    ],
  };
}

/** Three implementation clauses that cannot share one zero-budget ticket. */
// [::TICKET::] PX-444 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-444 --for-spec --no-implementation-order`.
function unprovenRemainder() {
  return [{
    key: 'clause|pkg|C001|unmapped|a',
    group: 'pkg|C001',
    contractId: 'C001',
    blockingClass: 'unmapped',
    clauseClasses: [
      { key: 'clause|pkg|C001|precondition|a', blockingClass: 'unmapped' },
      { key: 'clause|pkg|C001|postcondition|b', blockingClass: 'unmapped' },
      { key: 'clause|pkg|C001|invariant|c', blockingClass: 'unmapped' },
    ],
  }];
}

/** Every measured component at zero, so each atom needs its own ticket. */
// [::TICKET::] PX-444 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-444 --for-spec --no-implementation-order`.
function zeroBudget() {
  return Object.fromEntries(WORKLOAD_COMPONENTS.map((component) => [component, 0]));
}

/** Create a package directory with an optional note document. */
// [::TICKET::] PX-444 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-444 --for-spec --no-implementation-order`.
function projectWithNotes(document) {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'px444-notes-'));
  if (document !== null) {
    fs.writeFileSync(path.join(projectDir, OMISSION_TICKET_NOTES_FILE_NAME), JSON.stringify(document));
  }
  return projectDir;
}

/** Remove a temporary package directory. */
// [::TICKET::] PX-444 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-444 --for-spec --no-implementation-order`.
function removeProject(projectDir) {
  fs.rmSync(projectDir, { recursive: true, force: true });
}

/** Plan the standard fixture with an optional project directory and note. */
// [::TICKET::] PX-444 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-444 --for-spec --no-implementation-order`.
function plan({ projectDir = null, ticketNotes = null } = {}) {
  return planOmissionTickets({
    remainder: unprovenRemainder(),
    inventory: contractInventory(),
    ticketsData: { phases: [] },
    budget: zeroBudget(),
    components: WORKLOAD_COMPONENTS,
    context: {},
    projectDir,
    ticketNotes,
  });
}

test('C004: an absent note file contributes no text', () => {
  const projectDir = projectWithNotes(null);
  try {
    assert.equal(loadProjectTicketNotes(projectDir), '');
  } finally {
    removeProject(projectDir);
  }
});

test('C004: a version-1 note is trimmed and appended verbatim', () => {
  const projectDir = projectWithNotes({ version: 1, notes: '  Project laboratory clause  ' });
  try {
    assert.equal(loadProjectTicketNotes(projectDir), 'Project laboratory clause');

    const result = plan({ projectDir });
    for (const ticket of result.created) {
      assert.ok(ticket.notes.endsWith('re-running the coverage flow. Project laboratory clause'));
    }
  } finally {
    removeProject(projectDir);
  }
});

test('C004: an explicit ticket note overrides the package file', () => {
  const projectDir = projectWithNotes({ version: 1, notes: 'from file' });
  try {
    const result = plan({ projectDir, ticketNotes: 'explicit note' });

    assert.ok(result.created[0].notes.includes('explicit note'));
    assert.equal(result.created[0].notes.includes('from file'), false);
  } finally {
    removeProject(projectDir);
  }
});

test('C004: an unsupported version is a named refusal', () => {
  const projectDir = projectWithNotes({ version: 2, notes: 'x' });
  try {
    assert.throws(
      () => loadProjectTicketNotes(projectDir),
      (error) => error.code === 'UNSUPPORTED_VERSION',
    );
  } finally {
    removeProject(projectDir);
  }
});

test('C004: an empty note is a named refusal', () => {
  const projectDir = projectWithNotes({ version: 1, notes: '   ' });
  try {
    assert.throws(
      () => loadProjectTicketNotes(projectDir),
      (error) => error.code === 'OMISSION_TICKET_NOTES_INVALID',
    );
  } finally {
    removeProject(projectDir);
  }
});

test('C004: a non-string note is a named refusal', () => {
  const projectDir = projectWithNotes({ version: 1, notes: 42 });
  try {
    assert.throws(
      () => loadProjectTicketNotes(projectDir),
      (error) => error.code === 'OMISSION_TICKET_NOTES_INVALID',
    );
  } finally {
    removeProject(projectDir);
  }
});

test('C005: the planner never reads a package note without projectDir', () => {
  const projectDir = projectWithNotes({ version: 1, notes: 'must not be read' });
  try {
    const result = plan();

    for (const ticket of result.created) {
      assert.equal(ticket.notes.includes('must not be read'), false);
    }
  } finally {
    removeProject(projectDir);
  }
});

test('C005: the command documents the package artifact and the refusal', () => {
  const document = fs.readFileSync(
    path.resolve(__dirname, '../../.claude/commands/find-omissions.md'),
    'utf8',
  );

  assert.ok(document.includes(OMISSION_TICKET_NOTES_FILE_NAME));
  assert.ok(document.includes('OMISSION_TICKET_NOTES_INVALID'));
  assert.ok(/version[^\n]*1/.test(document));
});
