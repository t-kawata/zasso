// PX-373 @verifies C001 C002 C003 C004
// Evolve mode for /split-to-tickets: no refusal, no renumbering, status preserved.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCRIPT_DIR = path.resolve(__dirname, '../../.claude/scripts/tickets');

// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function loadEvolve() {
  return require(path.join(SCRIPT_DIR, 'split-evolve.js'));
}

// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function loadPhase() {
  return require(path.join(SCRIPT_DIR, 'update-phase.js'));
}

// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function makeNode(id, title, unitIds = []) {
  return {
    id,
    title,
    kind: 'architecture',
    slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
    headingRefs: [{ refId: `REF-${id}`, heading: 1, texts: [title] }],
    unitIds,
  };
}

// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function makeDirsTree(fileByNode) {
  return {
    trees: {
      rust: {
        name: 'src',
        type: 'directory',
        children: Object.entries(fileByNode).map(([nodeId, file]) => ({
          name: file.replace(/^src\//, ''),
          type: 'file',
          mappedNodeIds: [{ nodeId }],
        })),
      },
    },
  };
}

// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function makeTicket(overrides = {}) {
  return {
    id: 1,
    phaseId: 0,
    status: 'reviewed',
    title: 'alpha',
    nodeIds: ['N0001'],
    default_files: ['src/a.rs'],
    background: 'authored background',
    scope: ['authored scope'],
    notes: 'authored notes',
    acceptanceCriteria: ['authored acceptance'],
    testUnit: ['UT: authored'],
    testIntegration: ['IT: authored'],
    testExceptions: [],
    contracts: [{ id: 'C001', sourceEdge: 'edge', precondition: 'pre', postcondition: 'post', invariant: 'inv' }],
    distribution: { units: [{ unitId: 'op-1', kind: 'operation', obligation: { mode: 'implement' } }] },
    formulaObligations: [{ id: 'F1' }],
    ...overrides,
  };
}

// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function makeTickets(overrides = {}) {
  return {
    title: 'T',
    round: 1,
    metadata: { source: 'RFC.md', generatedAt: '2026-01-01' },
    phases: [{ id: 0, name: 'P0', nodeIds: ['N0001'], tickets: [makeTicket(overrides)] }],
  };
}

// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function makeTwoTicketDocument(secondOverrides = {}) {
  const document = makeTickets({ nodeIds: [], default_files: ['src/a.rs'] });
  document.phases[0].nodeIds = [];
  document.phases[0].tickets.push(makeTicket({ id: 2, nodeIds: [], default_files: ['src/a.rs'], ...secondOverrides }));
  return document;
}

// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function makeTwoPhaseDocument() {
  const document = makeTickets();
  document.phases[0].nodeIds = ['N0001'];
  document.phases.push({
    id: 1,
    name: 'P1',
    nodeIds: ['N0004'],
    tickets: [{
      id: 1,
      phaseId: 1,
      status: 'todo',
      title: 'delta',
      nodeIds: ['N0004'],
      default_files: ['src/d.rs'],
    }],
  });
  return document;
}

// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
function makeWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'px373-evolve-'));
  const graphPath = path.join(dir, 'RFC-GRAPH.json');
  const dirsTreePath = path.join(dir, 'RFC-Dirs-Tree.json');
  const ticketsPath = path.join(dir, 'Tickets.json');
  return { dir, graphPath, dirsTreePath, ticketsPath };
}

test('C001 runEvolve with no Tickets.json returns fresh mode and writes nothing', async () => {
  const { graphPath, dirsTreePath, ticketsPath } = makeWorkspace();
  fs.writeFileSync(graphPath, JSON.stringify({ nodes: [makeNode('N0001', 'alpha')], edges: [] }));
  fs.writeFileSync(dirsTreePath, JSON.stringify(makeDirsTree({ N0001: 'src/a.rs' })));

  const report = await loadEvolve().runEvolve({ ticketsPath, graphPath, dirsTreePath, viewPath: null });

  assert.equal(report.mode, 'fresh');
  assert.equal(fs.existsSync(ticketsPath), false);
});

test('C004 deriveTicketDelta is no-change when every graph node is covered', () => {
  const { deriveTicketDelta } = loadEvolve();
  const tickets = makeTickets();
  const graph = { nodes: [makeNode('N0001', 'alpha')], edges: [] };
  const dirsTree = makeDirsTree({ N0001: 'src/a.rs' });

  const delta = deriveTicketDelta({ ticketsDocument: tickets, graph, dirsTree, view: null });

  assert.deepEqual(delta.newNodes, []);
  assert.deepEqual(delta.changedNodes, []);
  assert.deepEqual(delta.removedNodes, []);
  assert.equal(delta.conflictClass, 'no-change');
});

test('C002 matchNodeIdentity resolves an exact node id first', () => {
  const { collectTickets, matchNodeIdentity } = loadEvolve();
  const tickets = makeTickets();
  const graph = { nodes: [makeNode('N0001', 'alpha')], edges: [] };

  const matches = matchNodeIdentity(collectTickets(tickets), graph, makeDirsTree({ N0001: 'src/a.rs' }));

  assert.equal(matches.get('P0-1')[0].nodeId, 'N0001');
  assert.equal(matches.get('P0-1')[0].rank, 'id');
});

test('C002 matchNodeIdentity falls back to the Dirs-Tree file mapping', () => {
  const { collectTickets, matchNodeIdentity } = loadEvolve();
  const tickets = makeTickets({ nodeIds: [], title: 'unrelated heading', default_files: ['src/b.rs'] });
  const graph = { nodes: [makeNode('N0002', 'beta section')], edges: [] };

  const matches = matchNodeIdentity(collectTickets(tickets), graph, makeDirsTree({ N0002: 'src/b.rs' }));

  assert.equal(matches.get('P0-1')[0].nodeId, 'N0002');
  assert.equal(matches.get('P0-1')[0].rank, 'path');
});

test('C003 retireTicket removes derived fields, keeps status and records retiredFrom', () => {
  const { retireTicket } = loadEvolve();
  const ticket = makeTicket();

  const retired = retireTicket(ticket, 'graph-node-removed');

  assert.deepEqual(retired.nodeIds, []);
  assert.equal(retired.status, 'reviewed');
  assert.equal(retired.retiredFrom.nodeIds[0], 'N0001');
  assert.equal(retired.retiredFrom.contracts.length, 1);
  assert.equal('contracts' in retired, false);
  assert.equal('distribution' in retired, false);
  assert.equal('formulaObligations' in retired, false);
});

test('C003 applyTicketEvolution preserves authored fields and does not mutate the input', () => {
  const { applyTicketEvolution, deriveTicketDelta, planTicketPlacement } = loadEvolve();
  const tickets = makeTickets();
  const graph = { nodes: [makeNode('N0001', 'alpha'), makeNode('N0002', 'beta')], edges: [] };
  const dirsTree = makeDirsTree({ N0001: 'src/a.rs', N0002: 'src/b.rs' });
  const before = JSON.stringify(tickets);
  const delta = deriveTicketDelta({ ticketsDocument: tickets, graph, dirsTree, view: null });

  const evolved = applyTicketEvolution(tickets, planTicketPlacement(delta, tickets, graph));

  assert.equal(JSON.stringify(tickets), before, 'the input document is not mutated');
  assert.equal(evolved.round, tickets.round);
  assert.equal(evolved.metadata.generatedAt, tickets.metadata.generatedAt);
  assert.equal(evolved.phases[0].tickets[0].status, 'reviewed');
  assert.equal(evolved.phases[0].tickets[0].background, 'authored background');
  assert.equal(evolved.phases[0].tickets[0].notes, 'authored notes');
});

test('C002 planTicketPlacement appends a new phase without renumbering an existing phase', () => {
  const { deriveTicketDelta, planTicketPlacement } = loadEvolve();
  const tickets = makeTickets();
  const graph = { nodes: [makeNode('N0001', 'alpha'), makeNode('N0002', 'beta')], edges: [] };
  const dirsTree = makeDirsTree({ N0001: 'src/a.rs', N0002: 'src/b.rs' });
  const delta = deriveTicketDelta({ ticketsDocument: tickets, graph, dirsTree, view: null });

  const plan = planTicketPlacement(delta, tickets, graph);

  assert.equal(plan.ticketAdditions.length, 1);
  assert.equal(plan.ticketAdditions[0].ticket.nodeIds[0], 'N0002');
  assert.equal(plan.insertions.length, 1);
  assert.equal(plan.insertions[0].phase.id, 1);
  assert.equal(plan.insertions[0].index, 1);
  assert.equal(tickets.phases[0].id, 0, 'the existing phase id is unchanged');
});

test('C002 insertPhaseAt accepts a non-contiguous id and preserves array order', () => {
  const { insertPhaseAt } = loadPhase();
  const tickets = makeTickets();

  const result = insertPhaseAt(tickets, { id: 7, name: 'P7', nodeIds: [], tickets: [] }, 0);

  assert.equal(result.ok, true);
  assert.equal(result.document.phases[0].id, 7);
  assert.equal(result.document.phases[1].id, 0);
  assert.equal(tickets.phases.length, 1, 'the input document is not mutated');
});

test('C002 addPhaseNodeIds appends once and reports a duplicate without writing it twice', () => {
  const { addPhaseNodeIds } = loadPhase();
  const tickets = makeTickets();

  const first = addPhaseNodeIds(tickets, 0, ['N0002']);
  const second = addPhaseNodeIds(first.document, 0, ['N0002']);

  assert.deepEqual(first.added, ['N0002']);
  assert.deepEqual(second.added, []);
  assert.deepEqual(second.duplicates, ['N0002']);
  assert.deepEqual(second.document.phases[0].nodeIds, ['N0001', 'N0002']);
});

test('C004 a second delta on the evolved document is no-change', () => {
  const { applyTicketEvolution, deriveTicketDelta, planTicketPlacement } = loadEvolve();
  const tickets = makeTickets();
  const graph = { nodes: [makeNode('N0001', 'alpha'), makeNode('N0002', 'beta')], edges: [] };
  const dirsTree = makeDirsTree({ N0001: 'src/a.rs', N0002: 'src/b.rs' });
  const delta = deriveTicketDelta({ ticketsDocument: tickets, graph, dirsTree, view: null });
  const evolved = applyTicketEvolution(tickets, planTicketPlacement(delta, tickets, graph));

  const second = deriveTicketDelta({ ticketsDocument: evolved, graph, dirsTree, view: null });

  assert.equal(second.conflictClass, 'no-change');
});

test('C002 a split keeps the original key and status and adds the extra node as a todo ticket', () => {
  const { deriveTicketDelta, planTicketPlacement } = loadEvolve();
  const tickets = makeTickets({ nodeIds: ['N0001'], title: 'alpha beta', default_files: ['src/a.rs'] });
  const graph = { nodes: [makeNode('N0010', 'alpha'), makeNode('N0011', 'beta')], edges: [] };
  const dirsTree = makeDirsTree({ N0010: 'src/a.rs', N0011: 'src/b.rs' });
  const delta = deriveTicketDelta({ ticketsDocument: tickets, graph, dirsTree, view: null });

  const plan = planTicketPlacement(delta, tickets, graph);
  const evolved = loadEvolve().applyTicketEvolution(tickets, plan);

  assert.equal(plan.ticketAdditions.length, 1);
  assert.equal(plan.retirements.length, 0);
  assert.equal(evolved.phases[0].tickets[0].id, 1);
  assert.equal(evolved.phases[0].tickets[0].status, 'reviewed');
  assert.equal(evolved.phases[0].tickets[0].nodeIds[0], 'N0010');
});

test('C002 a merge keeps the lower key and retires the absorbed ticket', () => {
  const { deriveTicketDelta, planTicketPlacement } = loadEvolve();
  const tickets = makeTwoTicketDocument();
  const graph = { nodes: [makeNode('N0010', 'alpha')], edges: [] };
  const dirsTree = makeDirsTree({ N0010: 'src/a.rs' });
  const delta = deriveTicketDelta({ ticketsDocument: tickets, graph, dirsTree, view: null });

  const plan = planTicketPlacement(delta, tickets, graph);

  assert.equal(plan.retirements.length, 1);
  assert.equal(plan.retirements[0].ticketKey, 'P0-2');
  assert.equal(plan.retirements[0].reason, 'merged-into-P0-1');
});

test('C004 a stale staging baseline is detectable before promotion', () => {
  const { prepareStaging, assertStagingBaseline } = require(path.resolve(
    SCRIPT_DIR, '../drill-rfc-down/lib/staging-baseline.js',
  ));
  const { ticketsPath } = makeWorkspace();
  fs.writeFileSync(ticketsPath, JSON.stringify(makeTickets()));
  const stagingPath = `${ticketsPath}.staging.json`;
  prepareStaging(ticketsPath, stagingPath);
  fs.writeFileSync(ticketsPath, JSON.stringify({ changed: true }));

  const result = assertStagingBaseline(stagingPath, ticketsPath);

  assert.equal(result.ok, false);
  assert.equal(result.code, 'STALE_STAGING_BASELINE');
});

test('C002 total identity loss is reported instead of throwing', () => {
  const { deriveTicketDelta } = loadEvolve();
  const tickets = makeTickets();
  const graph = { nodes: [makeNode('N0099', 'completely different heading')], edges: [] };

  const delta = deriveTicketDelta({
    ticketsDocument: tickets,
    graph,
    dirsTree: makeDirsTree({ N0099: 'src/z.rs' }),
    view: null,
  });

  assert.equal(delta.identityLost, true);
});

test('C002 a graph node with no Dirs-Tree file records unlistedFileReason', () => {
  const { deriveTicketDelta, planTicketPlacement } = loadEvolve();
  const tickets = makeTickets();
  const graph = { nodes: [makeNode('N0001', 'alpha'), makeNode('N0002', 'beta')], edges: [] };
  const dirsTree = makeDirsTree({ N0001: 'src/a.rs' });
  const delta = deriveTicketDelta({ ticketsDocument: tickets, graph, dirsTree, view: null });

  const plan = planTicketPlacement(delta, tickets, graph);
  const added = plan.ticketAdditions[0].ticket;

  assert.equal(added.default_files, undefined);
  assert.match(added.unlistedFileReason, /Dirs-Tree/);
});

test('C003 a retired ticket contributes no distribution units', () => {
  const { retireTicket } = loadEvolve();
  const retired = retireTicket(makeTicket(), 'graph-node-removed');

  assert.equal('distribution' in retired, false);
  assert.equal(retired.distribution, undefined);
});

test('C003 retireTicket is deterministic and carries no clock value', () => {
  const { retireTicket } = loadEvolve();
  const ticket = makeTicket();

  const first = retireTicket(ticket, 'graph-node-removed');
  const second = retireTicket(ticket, 'graph-node-removed');

  assert.deepEqual(second, first);
  assert.equal('retiredAt' in first.retiredFrom, false);
});

test('C003 applyTicketEvolution is deterministic for the same document and plan', () => {
  const { applyTicketEvolution, deriveTicketDelta, planTicketPlacement } = loadEvolve();
  const tickets = makeTwoPhaseDocument();
  const graph = { nodes: [makeNode('N0001', 'alpha'), makeNode('N0004', 'delta'), makeNode('N0003', 'gamma')], edges: [] };
  const dirsTree = makeDirsTree({ N0001: 'src/a.rs', N0004: 'src/d.rs', N0003: 'src/g.rs' });
  const delta = deriveTicketDelta({ ticketsDocument: tickets, graph, dirsTree, view: null });
  const plan = planTicketPlacement(delta, tickets, graph);

  const first = applyTicketEvolution(tickets, plan);
  const second = applyTicketEvolution(tickets, plan);

  assert.deepEqual(second, first);
});

test('C002 a new consumer is placed after the phase owning its provider', () => {
  const { deriveTicketDelta, planTicketPlacement } = loadEvolve();
  const tickets = makeTwoPhaseDocument();
  const graph = {
    nodes: [makeNode('N0001', 'alpha'), makeNode('N0004', 'delta'), makeNode('N0003', 'gamma')],
    edges: [{ from: 'N0003', to: 'N0004', type: 'depends_on' }],
  };
  const dirsTree = makeDirsTree({ N0001: 'src/a.rs', N0004: 'src/d.rs', N0003: 'src/g.rs' });
  const delta = deriveTicketDelta({ ticketsDocument: tickets, graph, dirsTree, view: null });

  const plan = planTicketPlacement(delta, tickets, graph);

  assert.equal(plan.insertions[0].index, 2);
});

test('C002 a new provider is placed before the phase owning its consumer', () => {
  const { deriveTicketDelta, planTicketPlacement } = loadEvolve();
  const tickets = makeTwoPhaseDocument();
  const graph = {
    nodes: [makeNode('N0001', 'alpha'), makeNode('N0004', 'delta'), makeNode('N0003', 'gamma')],
    edges: [{ from: 'N0004', to: 'N0003', type: 'depends_on' }],
  };
  const dirsTree = makeDirsTree({ N0001: 'src/a.rs', N0004: 'src/d.rs', N0003: 'src/g.rs' });
  const delta = deriveTicketDelta({ ticketsDocument: tickets, graph, dirsTree, view: null });

  const plan = planTicketPlacement(delta, tickets, graph);

  assert.equal(plan.insertions[0].index, 1);
});

test('IT C002 runEvolve adds a new node, preserves the reviewed status and archives the previous file', async () => {
  const { graphPath, dirsTreePath, ticketsPath } = makeWorkspace();
  fs.writeFileSync(graphPath, JSON.stringify({
    nodes: [makeNode('N0001', 'alpha'), makeNode('N0002', 'beta')],
    edges: [],
  }));
  fs.writeFileSync(dirsTreePath, JSON.stringify(makeDirsTree({ N0001: 'src/a.rs', N0002: 'src/b.rs' })));
  fs.writeFileSync(ticketsPath, JSON.stringify(makeTickets()));

  const report = await loadEvolve().runEvolve({ ticketsPath, graphPath, dirsTreePath, viewPath: null });
  const evolved = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));

  assert.equal(report.mode, 'evolve');
  assert.equal(report.changed, true);
  assert.equal(evolved.phases[0].tickets[0].status, 'reviewed');
  assert.equal(evolved.phases[0].tickets[0].background, 'authored background');
  assert.equal(evolved.phases.length, 2);
  assert.equal(evolved.phases[1].tickets.length, 1);
  assert.equal(fs.existsSync(report.archivePath), true);
});

test('IT C004 a second identical run writes nothing', async () => {
  const { graphPath, dirsTreePath, ticketsPath } = makeWorkspace();
  fs.writeFileSync(graphPath, JSON.stringify({
    nodes: [makeNode('N0001', 'alpha'), makeNode('N0002', 'beta')],
    edges: [],
  }));
  fs.writeFileSync(dirsTreePath, JSON.stringify(makeDirsTree({ N0001: 'src/a.rs', N0002: 'src/b.rs' })));
  fs.writeFileSync(ticketsPath, JSON.stringify(makeTickets()));

  await loadEvolve().runEvolve({ ticketsPath, graphPath, dirsTreePath, viewPath: null });
  const afterFirst = fs.readFileSync(ticketsPath, 'utf8');
  const second = await loadEvolve().runEvolve({ ticketsPath, graphPath, dirsTreePath, viewPath: null });

  assert.equal(second.changed, false);
  assert.equal(fs.readFileSync(ticketsPath, 'utf8'), afterFirst);
});

test('IT C002 verify-all-ticket-coverage accepts the evolved document', async () => {
  const { graphPath, dirsTreePath, ticketsPath } = makeWorkspace();
  fs.writeFileSync(graphPath, JSON.stringify({
    nodes: [makeNode('N0001', 'alpha'), makeNode('N0002', 'beta')],
    edges: [],
  }));
  fs.writeFileSync(dirsTreePath, JSON.stringify(makeDirsTree({ N0001: 'src/a.rs', N0002: 'src/b.rs' })));
  fs.writeFileSync(ticketsPath, JSON.stringify(makeTickets()));
  await loadEvolve().runEvolve({ ticketsPath, graphPath, dirsTreePath, viewPath: null });

  const { checkPhase } = require(path.resolve(SCRIPT_DIR, 'verify-all-ticket-coverage.js'));
  const evolved = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  const results = evolved.phases.map((phase) => checkPhase(phase));

  assert.equal(results.every((result) => result.valid), true);
});
