#!/usr/bin/env node

/**
 * attach-unit-ids.js — Carry RFC unit anchors onto graph nodes.
 *
 * Usage:
 *   node attach-unit-ids.js --graph=<GRAPH.json> --rfc=<RFC.md> [--ledger=<RFC.md|ledger.json>]
 *
 * PX-306 @verifies C002
 *
 * The command is mechanical: it reads `<!-- unit: ... -->` under each heading, attaches
 * the ids to the node whose heading built that section, and refuses to leave a ledger row
 * without a graph node. It does not invent a unit and does not rewrite a node that already
 * carries one.
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('node:url');

const LIBRARY = pathToFileURL(path.join(__dirname, 'lib', 'unit-ids.mjs')).href;
const LEDGER_LIBRARY = pathToFileURL(path.join(__dirname, '..', 'sequences-slice', 'lib', 'distribution-ledger.mjs')).href;

// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
function argumentFor(argv, name) {
  const inline = argv.find((entry) => entry.startsWith(`--${name}=`));
  if (inline !== undefined) return inline.slice(`--${name}=`.length);
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? null : argv[index + 1] ?? null;
}

// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
function writeAtomically(targetPath, contents) {
  const staged = `${targetPath}.partial.${process.pid}`;
  fs.writeFileSync(staged, contents);
  fs.renameSync(staged, targetPath);
}

// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
async function ledgerUnitsOf(ledgerPath, collectLedgerUnitIds) {
  if (ledgerPath === null) return [];
  const text = fs.readFileSync(ledgerPath, 'utf8');
  if (ledgerPath.endsWith('.md')) {
    const { readLedgerRows } = await import(LEDGER_LIBRARY);
    return collectLedgerUnitIds(readLedgerRows(text) ?? []);
  }
  const document = JSON.parse(text);
  const rows = Array.isArray(document) ? document : document.rows ?? document.ledger ?? [];
  return collectLedgerUnitIds(rows);
}

// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
async function main() {
  const argv = process.argv.slice(2);
  const graphPath = argumentFor(argv, 'graph');
  const rfcPath = argumentFor(argv, 'rfc');
  const ledgerPath = argumentFor(argv, 'ledger');
  if (graphPath === null || rfcPath === null) {
    console.error('usage: node attach-unit-ids.js --graph=<GRAPH.json> --rfc=<RFC.md> [--ledger=<RFC.md|ledger.json>]');
    return 2;
  }

  const {
    assignUnitIdsFromRfc,
    collectLedgerUnitIds,
    unassignedAnchors,
  } = await import(LIBRARY);

  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const rfcText = fs.readFileSync(rfcPath, 'utf8');
  const next = assignUnitIdsFromRfc(graph, rfcText);
  const unassigned = unassignedAnchors(graph, rfcText);
  const graphUnits = new Set((next.nodes ?? []).flatMap((node) => node.unitIds ?? []));
  const ledgerUnits = await ledgerUnitsOf(ledgerPath, collectLedgerUnitIds);
  const missing = ledgerUnits.filter((unitId) => !graphUnits.has(unitId));
  if (missing.length > 0) {
    console.error(`MISSING_UNIT_AT_LAYER: ${missing.join(', ')}`);
    return 1;
  }

  writeAtomically(graphPath, `${JSON.stringify(next, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ ok: true, unitIds: [...graphUnits], unassigned })}\n`);
  return 0;
}

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { main };
