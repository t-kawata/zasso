'use strict';
// PX-396 @verifies C001

/**
 * PX-396 — deterministic restoration from pre-condense archives.
 *
 * A dry run writes nothing. An apply restores the archive bytes, keeps the
 * archive, and refuses when the archive needed for an absorbed key is absent.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  restoreCondensedTickets,
} = require('../../.claude/scripts/tickets/restore-condensed-tickets.js');
const {
  normalizeTickets,
} = require('../../.claude/scripts/tickets/normalize-ticket-ids.js');

/** A ticket with a stable shape. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function ticket(id, overrides = {}) {
  return {
    id,
    phaseId: 0,
    status: 'todo',
    title: `Ticket ${id}`,
    nodeIds: [`N000${id}`],
    background: `background ${id}`,
    notes: `notes ${id}`,
    scope: [`scope ${id}`],
    invariants: `invariants ${id}`,
    referenceSection: `RFC (§${id})`,
    testUnit: [`UT: unit ${id}`],
    testIntegration: [],
    testExceptions: [],
    acceptanceCriteria: [`AC ${id}`],
    contracts: [{ id: `C00${id}`, sourceEdge: `N000${id}->N000${id + 1}`, precondition: 'p', postcondition: 'q', invariant: 'r' }],
    default_files: [`src/file${id}.js`],
    ...overrides,
  };
}

/** A document with the given tickets. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function documentFor(tickets) {
  return {
    title: 'fixture',
    round: 1,
    metadata: { source: 'fixture', generatedAt: '2026-11-09' },
    phases: [{ id: 0, name: 'P0', summary: '', nodeIds: tickets.flatMap((entry) => entry.nodeIds), tickets }],
  };
}

/** A fresh temporary package directory. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function freshDirectory(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

/** Write a package with one archive and one current document. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function writeRestorablePackage(directory) {
  const archived = documentFor([ticket(1), ticket(2), ticket(3)]);
  const archive = path.join(directory, 'Tickets.pre-condense-2026-11-09T00-00-00-000Z.json');
  fs.writeFileSync(archive, `${JSON.stringify(archived, null, 2)}\n`);
  const survivor = ticket(1, {
    title: 'Ticket 1 / Ticket 2',
    background: 'background 1\n\n### From P0-2: Ticket 2\nbackground 2',
    condensedFrom: {
      originKey: 'P0-1',
      planDigest: 'digest',
      condensedAt: '2026-11-09',
      tickets: [{ key: 'P0-2', id: 2, status: 'todo', title: 'Ticket 2' }],
    },
  });
  const untouched = ticket(3);
  delete untouched.referenceSection;
  const current = path.join(directory, 'Tickets.json');
  fs.writeFileSync(current, `${JSON.stringify(documentFor([survivor, untouched]), null, 2)}\n`);
  return { archive, current, archived };
}

test('restore dry-run writes nothing and reports the repair', () => {
  const directory = freshDirectory('restore-dry');
  const { current, archived } = writeRestorablePackage(directory);
  const before = fs.readFileSync(current);

  const result = restoreCondensedTickets({ ticketsPath: current, apply: false });

  assert.equal(result.ok, true);
  assert.equal(result.before, 2);
  assert.equal(result.after, 3);
  assert.equal(result.repairedLosses, 1);
  assert.deepEqual(fs.readFileSync(current), before);
  assert.equal(JSON.parse(fs.readFileSync(current, 'utf8')).phases[0].tickets.length, 2);
  assert.equal(archived.phases[0].tickets.length, 3);
});

test('restore apply replaces the document with the archive and keeps the archive', () => {
  const directory = freshDirectory('restore-apply');
  const { archive, current, archived } = writeRestorablePackage(directory);

  const result = restoreCondensedTickets({ ticketsPath: current, apply: true });

  assert.equal(result.ok, true);
  assert.equal(result.archivePath, archive);
  assert.equal(fs.existsSync(archive), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(current, 'utf8')), archived);
});

test('restore refuses when no archive contains every absorbed key', () => {
  const directory = freshDirectory('restore-missing');
  const survivor = ticket(1, {
    condensedFrom: {
      originKey: 'P0-1',
      tickets: [{ key: 'P0-2', id: 2, status: 'todo', title: 'Ticket 2' }],
    },
  });
  const current = path.join(directory, 'Tickets.json');
  fs.writeFileSync(current, `${JSON.stringify(documentFor([survivor]), null, 2)}\n`);

  const result = restoreCondensedTickets({ ticketsPath: current, apply: false });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'RESTORE_ARCHIVE_MISSING');
  assert.equal(JSON.parse(fs.readFileSync(current, 'utf8')).phases[0].tickets.length, 1);
});

test('restore selects the archive generation after a dense repair', () => {
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
  const directory = freshDirectory('restore-after-renumber');
  const archived = documentFor([ticket(1), ticket(2), ticket(4)]);
  const archivePath = path.join(directory, 'Tickets.pre-condense-2026-11-09T00-00-00-000Z.json');
  fs.writeFileSync(archivePath, `${JSON.stringify(archived, null, 2)}\n`);

  const survivor = ticket(1, {
    condensedFrom: {
      originKey: 'P0-1',
      generation: 0,
      tickets: [{ key: 'P0-2', id: 2, status: 'todo', title: 'Ticket 2', generation: 0 }],
    },
  });
  const currentPath = path.join(directory, 'Tickets.json');
  fs.writeFileSync(currentPath, `${JSON.stringify(documentFor([survivor, ticket(4)]), null, 2)}\n`);

  const repaired = normalizeTickets({ ticketsPath: currentPath, apply: true, verify: () => ({ ok: true }) });
  assert.equal(repaired.ok, true);

  const result = restoreCondensedTickets({ ticketsPath: currentPath, apply: false });
  assert.equal(result.ok, true);
  assert.equal(path.basename(result.archivePath), path.basename(archivePath));
  assert.deepEqual(result.archived, archived);
});
