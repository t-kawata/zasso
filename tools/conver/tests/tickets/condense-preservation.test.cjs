'use strict';
// PX-396 @verifies C001 @verifies C003 @verifies C004

/**
 * PX-396 — condensation must preserve every non-derived ticket field.
 *
 * The merge is exercised directly for the ledger and union rules, and through
 * applyPlan for the rehydrate and package-wide ownership rules that only run
 * with the distribution artifacts present.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  mergeTicketGroup,
} = require('../../.claude/scripts/tickets/lib/ticket-partition.js');
const {
  applyPlan,
  rehydrate,
  auditContractOwnership,
  repairContractsFromLedger,
} = require('../../.claude/scripts/tickets/condense-tickets.js');

const DERIVED_FIELDS = new Set([
  'contracts', 'formulaObligations', 'distribution', 'prerequisites', 'mergeAttempts',
]);

/** One fully populated ticket; overrides are merged last. */
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
    investigation: `investigation ${id}`,
    boyScoutPlan: `boy scout ${id}`,
    instrumentation: `instrumentation ${id}`,
    referenceSection: `RFC (§${id})`,
    testUnit: [`UT: unit ${id}`],
    testIntegration: [`IT: integration ${id}`],
    testExceptions: [],
    acceptanceCriteria: [`AC ${id}`],
    planTestCode: [`plan code ${id}`],
    sourcePaths: [`src/${id}`],
    referenceUrls: [`https://example.test/${id}`],
    rfcDiscrepancies: [`discrepancy ${id}`],
    targetStubs: [{ id: `TS-${id}`, ticketKey: `P0-${id}` }],
    targetCrimes: [{ id: `TC-${id}`, ticketKey: `P0-${id}` }],
    foundOmissions: [{ id: `OM-${id}`, ticketKey: `P0-${id}` }],
    unlistedFileReason: [`unlisted ${id}`],
    contracts: [{ id: `C00${id}`, sourceEdge: `N000${id}->N000${id + 1}`, precondition: 'p', postcondition: 'q', invariant: 'r' }],
    changes: [{ before: 'a', after: 'b', description: `change ${id}` }],
    default_files: [`src/file${id}.js`],
    ...overrides,
  };
}

/** The absorbed record: every field except the derived set and the ledger itself. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function preservedRecord(entry) {
  const record = { ...entry };
  delete record.condensedFrom;
  for (const field of DERIVED_FIELDS) delete record[field];
  return record;
}

/** A fresh temporary directory. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function freshDirectory(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

/** Write a package with optional distribution artifacts. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function writePackage(directory, tickets, options = {}) {
  const document = {
    title: 'fixture',
    round: 1,
    metadata: { source: 'fixture', generatedAt: '2026-11-09' },
    phases: [{
      id: 0,
      name: 'P0',
      summary: 'fixture phase',
      nodeIds: tickets.flatMap((entry) => entry.nodeIds ?? []),
      tickets,
    }],
  };
  fs.writeFileSync(path.join(directory, 'Tickets.json'), `${JSON.stringify(document, null, 2)}\n`);
  if (options.graph) fs.writeFileSync(path.join(directory, 'RFC-GRAPH.json'), `${JSON.stringify(options.graph, null, 2)}\n`);
  if (options.dirsTree) fs.writeFileSync(path.join(directory, 'RFC-Dirs-Tree.json'), `${JSON.stringify(options.dirsTree, null, 2)}\n`);
  return document;
}

test('C001: one ledger record per absorbed ticket holds every non-derived field', () => {
  const survivor = ticket(1);
  const absorbedA = ticket(2);
  const absorbedB = ticket(3);
  const merged = mergeTicketGroup([survivor, absorbedA, absorbedB], { start: 0, end: 3 }).ticket;

  assert.equal(merged.condensedFrom.originKey, 'P0-1');
  assert.equal(merged.condensedFrom.tickets.length, 2);
  assert.deepEqual(merged.condensedFrom.tickets[0].record, preservedRecord(absorbedA));
  assert.deepEqual(merged.condensedFrom.tickets[1].record, preservedRecord(absorbedB));
  assert.equal(merged.condensedFrom.tickets[0].originKey, 'P0-1');
});

test('C001: a future field survives the ledger without a production branch', () => {
  const absorbed = ticket(2, { customFutureField: { atoms: ['x'] } });
  const merged = mergeTicketGroup([ticket(1), absorbed], { start: 0, end: 2 }).ticket;

  assert.deepEqual(merged.condensedFrom.tickets[0].record.customFutureField, { atoms: ['x'] });
});

test('C001: the survivor prose fields are not modified by the merge', () => {
  const survivor = ticket(1);
  const merged = mergeTicketGroup([survivor, ticket(2)], { start: 0, end: 2 }).ticket;

  assert.equal(merged.background, survivor.background);
  assert.equal(merged.notes, survivor.notes);
  assert.equal(merged.invariants, survivor.invariants);
  assert.deepEqual(merged.scope, survivor.scope);
});

test('C001: machine fields are unioned and ticket references are remapped', () => {
  const survivor = ticket(1, { targetStubs: [], targetCrimes: [], foundOmissions: [] });
  const absorbed = ticket(2);
  const merged = mergeTicketGroup([survivor, absorbed], { start: 0, end: 2 }).ticket;

  assert.ok(merged.planTestCode.includes('plan code 2'));
  assert.ok(merged.sourcePaths.includes('src/2'));
  assert.ok(merged.referenceUrls.includes('https://example.test/2'));
  assert.ok(merged.rfcDiscrepancies.includes('discrepancy 2'));
  assert.equal(merged.targetStubs[0].ticketKey, 'P0-1');
  assert.equal(merged.targetCrimes[0].ticketKey, 'P0-1');
  assert.equal(merged.foundOmissions[0].ticketKey, 'P0-1');
  assert.ok(merged.referenceSection.includes('§2'));
});

test('C001: an absorbed contract id owned elsewhere is not a loss', () => {
  const owner = { contracts: [{ id: 'C002' }] };
  const findings = auditContractOwnership([{ contracts: [{ id: 'C001' }] }, owner], ['C002']);

  assert.deepEqual(findings, []);
  const missing = auditContractOwnership([{ contracts: [{ id: 'C001' }] }], ['C002']);
  assert.deepEqual(missing.map((finding) => finding.code), ['CONTRACT_NOT_REBUILT']);
});

test('C003: a missing contract is repaired from the ledger before apply fails', () => {
  const survivor = { id: 1, phaseId: 0, contracts: [] };
  const ledger = [{
    key: 'P0-2',
    originKey: 'P0-1',
    record: { contracts: [{ id: 'C002', precondition: 'p', postcondition: 'q', invariant: 'r' }] },
  }];
  const repaired = repairContractsFromLedger([survivor], [{ code: 'CONTRACT_NOT_REBUILT', contractId: 'C002' }], ledger);

  assert.equal(survivor.contracts.length, 1);
  assert.equal(survivor.contracts[0].id, 'C002');
  assert.deepEqual(repaired, []);
});

test('C003: an authored referenceSection survives rehydrate', async () => {
  const directory = freshDirectory('condense-reference');
  const untouched = ticket(3, { referenceSection: 'authored §1.1' });
  const document = {
    title: 'fixture',
    round: 1,
    metadata: { source: 'fixture', generatedAt: '2026-11-09' },
    phases: [{
      id: 0,
      name: 'P0',
      summary: 'fixture phase',
      nodeIds: ['N0001', 'N0002', 'N0003'],
      tickets: [ticket(1), ticket(2), untouched],
    }],
  };
  const artifacts = {
    directory,
    graph: { sourceFile: 'RFC.md', nodes: [{ id: 'N0003', title: '§9.9 Elsewhere' }], edges: [] },
    dirsTree: { distribution: { units: {} } },
    view: null,
    registry: null,
    stepSidecar: null,
    formulaSidecarPath: null,
    map: {},
  };

  await rehydrate(artifacts, document, {});

  assert.equal(document.phases[0].tickets[2].referenceSection, 'authored §1.1');
});

test('C004: a second apply returns NO_CHANGE and keeps the ledger', async () => {
  const directory = freshDirectory('condense-ledger-idempotent');
  writePackage(directory, [ticket(1), ticket(2)]);
  const ticketsPath = path.join(directory, 'Tickets.json');
  const budget = { operations: 8, sequenceSteps: 8, ownedContracts: 4, files: 10, testUnit: 100, testIntegration: 100, modules: 100 };

  const first = await applyPlan({ ticketsPath, budget, verify: () => ({ ok: true }) });
  assert.equal(first.ok, true);
  const afterFirst = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  assert.equal(afterFirst.phases[0].tickets[0].condensedFrom.tickets.length, 1);

  const second = await applyPlan({ ticketsPath, budget, verify: () => ({ ok: true }) });
  assert.equal(second.noChange, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(ticketsPath, 'utf8')), afterFirst);
});
