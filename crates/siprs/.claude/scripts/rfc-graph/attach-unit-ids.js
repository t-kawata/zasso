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

// [::TICKET::] PX-306, PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-306|PX-307) --for-spec --no-implementation-order`.
async function main() {
  const argv = process.argv.slice(2);
  const graphPath = argumentFor(argv, 'graph');
  const rfcPath = argumentFor(argv, 'rfc');
  const ledgerPath = argumentFor(argv, 'ledger');
  const dirsTreePath = argumentFor(argv, 'dirs-tree');
  if (graphPath === null || rfcPath === null) {
    console.error('usage: node attach-unit-ids.js --graph=<GRAPH.json> --rfc=<RFC.md> [--ledger=<RFC.md|ledger.json>] [--dirs-tree=<Dirs-Tree.json>]');
    return 2;
  }

  const {
    assignUnitIdsFromMap,
    assignUnitIdsFromRfc,
    collectLedgerUnitIds,
    readDistributionMap,
    unassignedAnchors,
  } = await import(LIBRARY);

  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const rfcText = fs.readFileSync(rfcPath, 'utf8');
  const map = readDistributionMap(rfcText);

  let next;
  let unassigned = [];
  if (map !== null) {
    const placed = assignUnitIdsFromMap(graph, map, rfcText);
    if (placed.missing.length > 0) {
      console.error(`MISSING_UNIT_AT_LAYER: ${placed.missing.join(', ')}`);
      return 1;
    }
    if (placed.invented.length > 0) {
      console.error(`INVENTED_UNIT: ${placed.invented.join(', ')}`);
      return 1;
    }
    next = placed.graph;
  } else {
    next = assignUnitIdsFromRfc(graph, rfcText);
    unassigned = unassignedAnchors(graph, rfcText);
  }

  const graphUnits = new Set((next.nodes ?? []).flatMap((node) => node.unitIds ?? []));
  const ledgerUnits = await ledgerUnitsOf(ledgerPath, collectLedgerUnitIds);
  const missing = ledgerUnits.filter((unitId) => !graphUnits.has(unitId));
  if (missing.length > 0) {
    console.error(`MISSING_UNIT_AT_LAYER: ${missing.join(', ')}`);
    return 1;
  }

  writeAtomically(graphPath, `${JSON.stringify(next, null, 2)}\n`);

  if (dirsTreePath !== null && map !== null) {
    const {
      buildDistributionIndex,
      collectNodePaths,
      verifyDistributionCoverage,
    } = require('./lib/distribution-index.js');
    const dirsTree = JSON.parse(fs.readFileSync(dirsTreePath, 'utf8'));
    dirsTree.distribution = buildDistributionIndex(next, collectNodePaths(dirsTree.trees), next.distributionDigest);
    const coverage = verifyDistributionCoverage(dirsTree, next);
    if (!coverage.ok) {
      if (coverage.missing.length > 0) console.error(`MISSING_UNIT_AT_LAYER: ${coverage.missing.join(', ')}`);
      if (coverage.invented.length > 0) console.error(`INVENTED_UNIT: ${coverage.invented.join(', ')}`);
      if (coverage.unmapped.length > 0) console.error(`MISSING_UNIT_AT_LAYER: ${coverage.unmapped.join(', ')}`);
      return 1;
    }
    writeAtomically(dirsTreePath, `${JSON.stringify(dirsTree, null, 2)}\n`);
  }

  process.stdout.write(`${JSON.stringify({ ok: true, unitIds: [...graphUnits], unassigned, distributionDigest: next.distributionDigest ?? null })}\n`);
  return 0;
}

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { main };
