#!/usr/bin/env node
'use strict';

/**
 * PX-436 — build the canonical clause inventory.
 *
 * The inventory is written beside the package as CONTRACT-INVENTORY.json. A
 * project-condition problem is returned as a finding, never as a process
 * failure: the repair ladder consumes findings, and this script is additive in
 * PX-436.
 */

const fs = require('node:fs');
const path = require('node:path');

const { writeTemporaryThenRename } = require('./lib/atomic-write.js');
const { DEFAULT_ELEMENTS } = require('./lib/contract-clause.js');
const { buildInventory } = require('./lib/inventory.js');
const { ticketKeyOf } = require('./lib/omission-detectors.js');

const OUTPUT_FILE_NAME = 'CONTRACT-INVENTORY.json';
const CONFIG_FILE_NAME = 'CONTRACT-INVENTORY-CONFIG.json';

/** Read `--name=value` from the argument list. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function argumentValue(args, name) {
  const prefix = '--' + name + '=';
  const match = args.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

/** Read JSON, or null when the path is absent. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function readJsonIfPresent(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** The first existing candidate path, or null. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function firstExisting(cwd, candidates) {
  for (const candidate of candidates) {
    const full = path.isAbsolute(candidate) ? candidate : path.join(cwd, candidate);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

/** The unique file in `cwd` matching a suffix, or null. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function uniqueSibling(cwd, suffix) {
  if (!fs.existsSync(cwd)) return null;
  const matches = fs.readdirSync(cwd).filter((name) => name.endsWith(suffix)).sort();
  return matches.length === 1 ? path.join(cwd, matches[0]) : null;
}

/** Flatten a ticket document into the adapter's ticket-source shape. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function ticketSourceOf(document) {
  const tickets = [];
  for (const phase of document?.phases ?? []) {
    for (const ticket of phase.tickets ?? []) {
      tickets.push({ key: ticketKeyOf({ ...ticket, phaseId: ticket.phaseId ?? phase.id }), contracts: ticket.contracts ?? [] });
    }
  }
  return tickets;
}

/**
 * Read the project's declared configuration or derive the smallest default.
 *
 * The default reads only the artifacts this package already ships. A project
 * that needs another grammar, element vocabulary or source supplies the config.
 */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function loadConfiguration({ cwd, configPath }) {
  const explicit = readJsonIfPresent(configPath ?? firstExisting(cwd, [CONFIG_FILE_NAME]));
  if (explicit !== null) return explicit;

  const adapter = {
    id: 'generic-manifest',
    version: 1,
    scope: path.basename(path.resolve(cwd)),
    contractIdScope: 'global',
    elements: [...DEFAULT_ELEMENTS],
  };
  const sources = [];

  const graphPath = firstExisting(cwd, ['RFC-GRAPH.json']) ?? uniqueSibling(cwd, '-GRAPH.json');
  const graph = readJsonIfPresent(graphPath);
  if (graph !== null) {
    sources.push({ kind: 'graph', artifact: path.relative(cwd, graphPath), edges: graph.edges ?? [] });
  }

  const ticketsPath = firstExisting(cwd, ['Tickets.json']);
  const tickets = readJsonIfPresent(ticketsPath);
  if (tickets !== null) {
    sources.push({ kind: 'tickets', artifact: 'Tickets.json', tickets: ticketSourceOf(tickets) });
  }

  return { adapter, sources };
}

/** CLI entry point. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  const cwd = path.resolve(argumentValue(args, 'cwd') ?? process.cwd());
  const configPath = argumentValue(args, 'config');
  const out = argumentValue(args, 'out');
  const reportOnly = args.includes('--report-only');

  let configuration;
  try {
    configuration = loadConfiguration({ cwd, configPath: configPath ? path.resolve(cwd, configPath) : null });
  } catch (error) {
    process.stdout.write(JSON.stringify({
      ok: false,
      code: 'CONFIG_UNREADABLE',
      problem: error instanceof Error ? error.message : String(error),
    }) + '\n');
    process.exit(0);
    return;
  }

  const inventory = buildInventory({
    adapter: configuration.adapter,
    sources: configuration.sources,
  });

  if (!reportOnly) {
    const target = path.resolve(cwd, out ?? OUTPUT_FILE_NAME);
    writeTemporaryThenRename(target, JSON.stringify(inventory, null, 2) + '\n');
  }

  process.stdout.write(JSON.stringify(inventory) + '\n');
  process.exit(0);
}

if (require.main === module) main();

module.exports = { CONFIG_FILE_NAME, OUTPUT_FILE_NAME, loadConfiguration, main, ticketSourceOf };
