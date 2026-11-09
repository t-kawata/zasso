'use strict';

/**
 * PX-395 — synthetic manifest workspace fixture.
 *
 * The workspace discovery reads WORKSPACIFY-TREE-MANIFEST.json and the allocate
 * manifest, so a test workspace needs both files at its root and one directory per
 * declared package. The fixture keeps the ticket shape of the condense-tickets
 * fixture so a package can be condensed end to end.
 */

const fs = require('node:fs');
const path = require('node:path');

/** Write a JSON document, creating its parent directory. */
// [::TICKET::] PX-395 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-395 --for-spec --no-implementation-order`.
function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

/** One ticket whose workload is driven by its file count. */
// [::TICKET::] PX-395 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-395 --for-spec --no-implementation-order`.
function ticket(id, overrides = {}) {
  return {
    id,
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

/** The ledger shape validateTickets accepts. */
// [::TICKET::] PX-395 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-395 --for-spec --no-implementation-order`.
function ticketDocument(tickets) {
  return {
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
}

/**
 * Write one package directory.
 *
 * `graph: false` and `dirsTree: false` produce an unsplit or aggregate package:
 * the ledger exists but the distribution artifacts do not.
 */
// [::TICKET::] PX-395 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-395 --for-spec --no-implementation-order`.
function writePackage(directory, tickets, options = {}) {
  writeJson(path.join(directory, 'Tickets.json'), ticketDocument(tickets));
  if (options.graph !== false) writeJson(path.join(directory, 'RFC-GRAPH.json'), { nodes: [], edges: [] });
  if (options.dirsTree !== false) writeJson(path.join(directory, 'RFC-Dirs-Tree.json'), { distribution: { units: {} } });
  if (options.view !== undefined && options.view !== null) writeJson(path.join(directory, 'SEQUENCES.json'), options.view);
  return path.join(directory, 'Tickets.json');
}

/**
 * Create a workspace root.
 *
 * `packages` is the manifest row list in declaration order. Rows are written as
 * given, so a duplicate path or a missing directory survives into the discovery.
 */
// [::TICKET::] PX-395 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-395 --for-spec --no-implementation-order`.
function createWorkspace(root, options = {}) {
  if (options.manifest !== false) {
    writeJson(path.join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), {
      workspace: { packages: (options.packages ?? []).map((pkg) => ({ id: pkg.id, path: pkg.path })) },
    });
    writeJson(path.join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), { contract_registry: [] });
  }
  return root;
}

module.exports = {
  createWorkspace,
  ticket,
  ticketDocument,
  writeJson,
  writePackage,
};
