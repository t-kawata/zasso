'use strict';
// PX-402 @verifies C001 @verifies C002 @verifies C003 @verifies C005 @verifies C007

/**
 * PX-402 — one-shot repair of an existing gapped package.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  normalizeTickets,
  normalizeWorkspace,
  planNormalization,
} = require('../../.claude/scripts/tickets/normalize-ticket-ids.js');

// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
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
    testUnit: [`UT: unit ${id}`],
    testIntegration: [`IT: integration ${id}`],
    testExceptions: [],
    acceptanceCriteria: [`AC ${id}`],
    contracts: [{ id: 'C001', sourceEdge: `N000${id}->N000${id + 1}`, precondition: 'p', postcondition: 'q', invariant: 'r' }],
    default_files: [`src/file${id}.js`],
    ...overrides,
  };
}

// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function documentFor(tickets) {
  return {
    title: 'fixture',
    round: 1,
    metadata: { source: 'fixture', generatedAt: '2026-11-10' },
    phases: [{ id: 0, name: 'P0', summary: '', nodeIds: [], tickets }],
  };
}

// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function freshDirectory(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

test('planNormalization exposes the dense map without writing', () => {
  const plan = planNormalization(documentFor([ticket(1), ticket(3)]));
  assert.equal(plan.changed, true);
  assert.equal(plan.generationBefore, 0);
  assert.equal(plan.generation, 1);
  assert.equal(plan.keyMap.get('P0-3'), 'P0-2');
  assert.deepEqual(plan.findings, []);
});

test('normalizeTickets applies, archives and is idempotent', () => {
  const directory = freshDirectory('normalize-apply');
  const ticketsPath = path.join(directory, 'Tickets.json');
  fs.writeFileSync(ticketsPath, `${JSON.stringify(documentFor([ticket(1), ticket(3)]), null, 2)}\n`);
  const first = normalizeTickets({ ticketsPath, apply: true, verify: () => ({ ok: true }) });
  assert.equal(first.ok, true);
  assert.equal(first.changed, true);
  assert.ok(fs.existsSync(first.archivePath));
  const repaired = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  assert.deepEqual(repaired.phases[0].tickets.map((entry) => entry.id), [1, 2]);
  assert.equal(repaired.identity.generation, 1);
  const second = normalizeTickets({ ticketsPath, apply: true, verify: () => ({ ok: true }) });
  assert.equal(second.noChange, true);
});

test('normalizeTickets resolves a dangling key through an archive nodeIds owner', () => {
  const directory = freshDirectory('normalize-archive');
  const ticketsPath = path.join(directory, 'Tickets.json');
  fs.writeFileSync(ticketsPath, `${JSON.stringify(documentFor([
    ticket(1, { nodeIds: ['N0009'] }),
    ticket(3, { notes: 'see P0-9' }),
  ]), null, 2)}\n`);
  const archivePath = path.join(directory, 'Tickets.pre-consolidate.json');
  fs.writeFileSync(archivePath, `${JSON.stringify(documentFor([
    ticket(9, { nodeIds: ['N0009'] }),
  ]), null, 2)}\n`);
  const result = normalizeTickets({
    ticketsPath,
    apply: true,
    archives: [directory],
    verify: () => ({ ok: true }),
  });
  assert.equal(result.ok, true);
  const repaired = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  assert.equal(repaired.phases[0].tickets[1].notes, 'see P0-1');
});

test('an ambiguous archive owner fails before writing', () => {
  const directory = freshDirectory('normalize-ambiguous');
  const ticketsPath = path.join(directory, 'Tickets.json');
  const original = `${JSON.stringify(documentFor([
    ticket(1, { nodeIds: ['N0009'] }),
    ticket(2, { nodeIds: ['N0009'] }),
    ticket(5, { notes: 'see P0-9' }),
  ]), null, 2)}\n`;
  fs.writeFileSync(ticketsPath, original);
  fs.writeFileSync(path.join(directory, 'Tickets.pre-consolidate.json'), `${JSON.stringify(documentFor([
    ticket(9, { nodeIds: ['N0009'] }),
  ]), null, 2)}\n`);
  const result = normalizeTickets({
    ticketsPath,
    apply: true,
    archives: [directory],
    verify: () => ({ ok: true }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'IDENTITY_ARCHIVE_AMBIGUOUS');
  assert.equal(fs.readFileSync(ticketsPath, 'utf8'), original);
});

test('normalizeWorkspace repairs only the gapped package and is idempotent', () => {
  const root = freshDirectory('normalize-workspace');
  const gapped = path.join(root, 'pkg-gapped');
  const dense = path.join(root, 'pkg-dense');
  fs.mkdirSync(gapped, { recursive: true });
  fs.mkdirSync(dense, { recursive: true });
  fs.writeFileSync(path.join(gapped, 'Tickets.json'), `${JSON.stringify(documentFor([ticket(1), ticket(3)]), null, 2)}\n`);
  fs.writeFileSync(path.join(dense, 'Tickets.json'), `${JSON.stringify(documentFor([ticket(1), ticket(2)]), null, 2)}\n`);

  const first = normalizeWorkspace({
    workspaceRoot: root,
    apply: true,
    verify: () => ({ ok: true }),
    verifyWorkspace: false,
  });
  assert.equal(first.ok, true);
  assert.equal(first.documents, 2);
  assert.equal(first.changed, 1);
  assert.equal(first.noChange, 1);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(gapped, 'Tickets.json'), 'utf8')).phases[0].tickets.map((entry) => entry.id),
    [1, 2],
  );

  const second = normalizeWorkspace({
    workspaceRoot: root,
    apply: true,
    verify: () => ({ ok: true }),
    verifyWorkspace: false,
  });
  assert.equal(second.changed, 0);
  assert.equal(second.noChange, 2);
});

test('an unrecoverable pre-existing key becomes a legacy label and is recorded', () => {
  const directory = freshDirectory('normalize-legacy-label');
  const ticketsPath = path.join(directory, 'Tickets.json');
  fs.writeFileSync(ticketsPath, `${JSON.stringify(documentFor([ticket(1, { notes: 'see P9-9' })]), null, 2)}\n`);
  const result = normalizeTickets({ ticketsPath, apply: true, verify: () => ({ ok: true }) });
  assert.equal(result.ok, true);
  const repaired = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  assert.equal(repaired.phases[0].tickets[0].notes, 'see legacy ticket 9.9');
  assert.equal(repaired.identity.legacyReferences['P9-9@g0'], 'legacy ticket 9.9');
});

test('a key whose sentence names one current file owner becomes that key', () => {
  const directory = freshDirectory('normalize-file-owner');
  const ticketsPath = path.join(directory, 'Tickets.json');
  fs.writeFileSync(ticketsPath, `${JSON.stringify(documentFor([
    ticket(1, { default_files: ['src/owner.rs'] }),
    ticket(3, { notes: 'declared by P9-9 in `src/owner.rs`' }),
  ]), null, 2)}\n`);
  const result = normalizeTickets({ ticketsPath, apply: true, verify: () => ({ ok: true }) });
  assert.equal(result.ok, true);
  const repaired = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  assert.equal(repaired.phases[0].tickets[1].notes, 'declared by P0-1 in `src/owner.rs`');
});

test('--strict-unresolved refuses to neutralize a pre-existing key', () => {
  const directory = freshDirectory('normalize-strict');
  const ticketsPath = path.join(directory, 'Tickets.json');
  const original = `${JSON.stringify(documentFor([ticket(1, { notes: 'see P9-9' })]), null, 2)}\n`;
  fs.writeFileSync(ticketsPath, original);
  const result = normalizeTickets({
    ticketsPath,
    apply: true,
    strictUnresolved: true,
    verify: () => ({ ok: true }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'IDENTITY_HISTORY_UNRESOLVED');
  assert.equal(fs.readFileSync(ticketsPath, 'utf8'), original);
});

test('a repaired document that already contains live key tokens is NO_CHANGE on the second run', () => {
  const directory = freshDirectory('normalize-idempotent-live-keys');
  const ticketsPath = path.join(directory, 'Tickets.json');
  fs.writeFileSync(ticketsPath, `${JSON.stringify(documentFor([
    ticket(1, { notes: 'see P0-1' }),
    ticket(3, { notes: 'see P0-1' }),
  ]), null, 2)}\n`);
  const first = normalizeTickets({ ticketsPath, apply: true, verify: () => ({ ok: true }) });
  assert.equal(first.ok, true);
  const second = normalizeTickets({ ticketsPath, apply: true, verify: () => ({ ok: true }) });
  assert.equal(second.noChange, true);
});

test('a renumbered obligation refreshes the per-ticket and per-unit digests', () => {
  const { digestTicketDistribution } = require('../../.claude/scripts/tickets/add-tickets-for-phase.js');
  const directory = freshDirectory('normalize-digest-refresh');
  const ticketsPath = path.join(directory, 'Tickets.json');
  fs.writeFileSync(ticketsPath, `${JSON.stringify(documentFor([
    ticket(1),
    ticket(3, {
      distribution: {
        sourceMapDigest: null,
        sourceViewDigest: null,
        digest: 'stale',
        units: [{
          unitId: 'u1',
          kind: 'operation',
          role: 'implementer',
          obligation: { mode: 'implement', implementerTicketKey: 'P0-3', implementerTicketId: 3 },
        }],
      },
    }),
  ]), null, 2)}\n`);
  const result = normalizeTickets({ ticketsPath, apply: true, verify: () => ({ ok: true }) });
  assert.equal(result.ok, true);
  const repaired = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  const survivor = repaired.phases[0].tickets[1];
  assert.equal(survivor.distribution.units[0].obligation.implementerTicketKey, 'P0-2');
  assert.equal(survivor.distribution.units[0].obligation.implementerTicketId, 2);
  assert.equal(survivor.distribution.digest, digestTicketDistribution(survivor.distribution));
  assert.notEqual(survivor.distribution.digest, 'stale');
});

test('a historical record with a lost owner is recorded as a legacy reference', () => {
  const directory = freshDirectory('normalize-legacy-history');
  const ticketsPath = path.join(directory, 'Tickets.json');
  fs.writeFileSync(ticketsPath, `${JSON.stringify(documentFor([
    ticket(1, {
      condensedFrom: {
        originKey: 'P0-1',
        generation: 0,
        tickets: [{ key: 'P0-2', id: 2, generation: 0, record: { notes: 'see P9-9' } }],
      },
    }),
  ]), null, 2)}\n`);
  const first = normalizeTickets({ ticketsPath, apply: true, verify: () => ({ ok: true }) });
  assert.equal(first.ok, true);
  const repaired = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  assert.equal(typeof repaired.identity.legacyReferences['P9-9@g0'], 'string');
  assert.equal(repaired.phases[0].tickets[0].condensedFrom.tickets[0].record.notes, 'see P9-9');
  const second = normalizeTickets({ ticketsPath, apply: true, verify: () => ({ ok: true }) });
  assert.equal(second.noChange, true);
});

test('an unresolved structured prerequisite key is not neutralized', () => {
  const directory = freshDirectory('normalize-structured-key');
  const ticketsPath = path.join(directory, 'Tickets.json');
  const original = `${JSON.stringify(documentFor([
    ticket(1, { prerequisites: [{ ticket: 'P9-9', kind: 'implementation', source: 'graph:x' }] }),
  ]), null, 2)}\n`;
  fs.writeFileSync(ticketsPath, original);
  const result = normalizeTickets({ ticketsPath, apply: true, verify: () => ({ ok: true }) });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'IDENTITY_HISTORY_UNRESOLVED');
  assert.equal(fs.readFileSync(ticketsPath, 'utf8'), original);
});
