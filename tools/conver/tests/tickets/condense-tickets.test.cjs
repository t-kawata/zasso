'use strict';
// PX-394 @verifies C001 @verifies C002 @verifies C003 @verifies C004 @verifies C005 @verifies C006

/**
 * PX-394 — condense-tickets.js apply, rollback, idempotency and discovery.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildPlan,
  applyPlan,
  discoverPackages,
} = require('../../.claude/scripts/tickets/condense-tickets.js');
const {
  condensePlan,
  partitionDigest,
} = require('../../.claude/scripts/tickets/lib/ticket-partition.js');

const BUDGET = Object.freeze({
  operations: 8,
  sequenceSteps: 8,
  ownedContracts: 4,
  files: 10,
  testUnit: 100,
  testIntegration: 100,
  modules: 100,
});

// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
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
    contracts: [{ id: 'C001', sourceEdge: 'N0001->N0002', precondition: 'a', postcondition: 'b', invariant: 'c' }],
    default_files: Array.from({ length: overrides.fileCount ?? 1 }, (_, index) => `src/file${id}-${index}.js`),
    ...overrides,
  };
}

// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function freshDirectory(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function writePackage(directory, tickets, options = {}) {
  const document = {
    title: 'fixture',
    round: 1,
    metadata: { source: 'fixture', generatedAt: '2026-11-09' },
    phases: [{
      id: 0,
      name: 'P0',
      summary: 'fixture phase',
      nodeIds: tickets.flatMap((entry) => entry.nodeIds),
      tickets,
    }],
  };
  fs.writeFileSync(path.join(directory, 'Tickets.json'), `${JSON.stringify(document, null, 2)}\n`);
  if (options.graph) fs.writeFileSync(path.join(directory, 'RFC-GRAPH.json'), `${JSON.stringify(options.graph, null, 2)}\n`);
  if (options.dirsTree) fs.writeFileSync(path.join(directory, 'RFC-Dirs-Tree.json'), `${JSON.stringify(options.dirsTree, null, 2)}\n`);
  if (options.view) fs.writeFileSync(path.join(directory, 'SEQUENCES.json'), `${JSON.stringify(options.view, null, 2)}\n`);
  return document;
}

test('apply merges, archives and is idempotent (C005)', async () => {
  const directory = freshDirectory('condense-apply');
  writePackage(directory, [ticket(1, { fileCount: 2 }), ticket(2, { fileCount: 3 })]);
  const first = await applyPlan({ ticketsPath: path.join(directory, 'Tickets.json'), budget: BUDGET, verify: () => ({ ok: true }) });
  assert.equal(first.ok, true);
  assert.equal(first.before, 2);
  assert.equal(first.after, 1);
  assert.equal(first.skipped, 'no-distribution');
  assert.equal(fs.existsSync(first.archivePath), true);
  const merged = JSON.parse(fs.readFileSync(path.join(directory, 'Tickets.json'), 'utf8'));
  assert.equal(merged.phases[0].tickets.length, 1);
  assert.equal(merged.phases[0].tickets[0].id, 1);
  const second = await applyPlan({ ticketsPath: path.join(directory, 'Tickets.json'), budget: BUDGET, verify: () => ({ ok: true }) });
  assert.equal(second.noChange, true);
});

test('a failing gate restores the archived bytes (C005)', async () => {
  const directory = freshDirectory('condense-rollback');
  writePackage(directory, [ticket(1, { fileCount: 2 }), ticket(2, { fileCount: 3 })]);
  const ticketsPath = path.join(directory, 'Tickets.json');
  const original = fs.readFileSync(ticketsPath, 'utf8');
  const failed = await applyPlan({
    ticketsPath,
    budget: BUDGET,
    verify: () => { throw new Error('closure'); },
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.code, 'CONDENSE_GATE_FAILED');
  assert.equal(fs.readFileSync(ticketsPath, 'utf8'), original);
});

test('a package without a view reports no-distribution and still merges nodes (C004)', async () => {
  const directory = freshDirectory('condense-noview');
  writePackage(directory, [ticket(1, { nodeIds: ['N0001'] }), ticket(2, { nodeIds: ['N0002'] })]);
  const result = await applyPlan({ ticketsPath: path.join(directory, 'Tickets.json'), budget: BUDGET, verify: () => ({ ok: true }) });
  assert.equal(result.skipped, 'no-distribution');
  const merged = JSON.parse(fs.readFileSync(path.join(directory, 'Tickets.json'), 'utf8'));
  assert.deepEqual(merged.phases[0].tickets[0].nodeIds, ['N0001', 'N0002']);
});

test('buildPlan and condensePlan produce the same digest (C006)', () => {
  const tickets = [ticket(1, { fileCount: 2 }), ticket(2, { fileCount: 3 })];
  const document = {
    title: 'fixture',
    round: 1,
    metadata: { source: 'fixture', generatedAt: '2026-11-09' },
    phases: [{ id: 0, name: 'P0', summary: '', nodeIds: ['N0001', 'N0002'], tickets }],
  };
  const graph = { nodes: [], edges: [] };
  const dirsTree = { distribution: { units: {} } };
  const plan = buildPlan({ ticketsDocument: document, graph, dirsTree, view: null, budget: BUDGET });
  const phasePlan = condensePlan(document.phases[0], { graph, dirsTree, view: null, nodeToFileMap: {} }, BUDGET);
  assert.equal(plan.phases[0].digest, partitionDigest(phasePlan));
  assert.equal(plan.phases[0].before, 2);
  assert.equal(plan.phases[0].after, 1);
});

test('discoverPackages excludes the root aggregate and fixtures (C004)', () => {
  const root = freshDirectory('condense-workspace');
  const good = path.join(root, 'crate-good');
  const graphOnly = path.join(root, 'crate-graph-only');
  const fixture = path.join(root, 'tests', 'fixtures', 'crate-fixture');
  for (const directory of [good, graphOnly, fixture]) fs.mkdirSync(directory, { recursive: true });
  writePackage(good, [ticket(1)]);
  fs.writeFileSync(path.join(good, 'RFC-GRAPH.json'), '{"nodes":[],"edges":[]}\n');
  fs.writeFileSync(path.join(good, 'RFC-Dirs-Tree.json'), '{"distribution":{"units":{}}}\n');
  writePackage(graphOnly, [ticket(1)]);
  fs.writeFileSync(path.join(graphOnly, 'RFC-GRAPH.json'), '{"nodes":[],"edges":[]}\n');
  writePackage(fixture, [ticket(1)]);
  fs.writeFileSync(path.join(fixture, 'RFC-GRAPH.json'), '{"nodes":[],"edges":[]}\n');
  fs.writeFileSync(path.join(fixture, 'RFC-Dirs-Tree.json'), '{"distribution":{"units":{}}}\n');
  writePackage(root, [ticket(1)]);
  fs.writeFileSync(path.join(root, 'RFC-GRAPH.json'), '{"nodes":[],"edges":[]}\n');
  fs.writeFileSync(path.join(root, 'RFC-Dirs-Tree.json'), '{"distribution":{"units":{}}}\n');
  const found = discoverPackages(root);
  assert.deepEqual(found, [good]);
});
