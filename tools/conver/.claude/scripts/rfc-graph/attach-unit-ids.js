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
const { findAllocateManifest } = require('../lib/package-artifacts');
const {
  artifactStepsForSequences,
  collectViewUnits,
  declaredSequenceIds,
  mapDigest,
  registryRowsForPackage,
  stepBearingRecords,
  viewDigest,
} = require('../sequences-slice/lib/distribution-map.mjs');

/**
 * The admission checks graphify runs before it attaches a single unit.
 *
 * The map is the bridge between the smooth-sequences view and the graph. A map that was
 * rendered from an older view, a view unit the map never carried, a step the view dropped
 * or a registry boundary with no ctr unit must stop graphify before node splitting, not
 * after the graph is written. The checks are read-only and return named codes.
 *
 * @param {{ view: object, map: object, artifact?: object|null, registry?: Array<object> }} input
 * @returns {Array<{ code: string, subject: string|null, message: string }>}
 */
// [::TICKET::] PX-312, PX-313, PX-314 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313|PX-314) --for-spec --no-implementation-order`.
function verifyViewAgainstMap({ view, map, artifact = null, registry = [] } = {}) {
  const findings = [];
  if (map?.sourceViewDigest !== viewDigest(view)) {
    findings.push({ code: 'STALE_DISTRIBUTION_MAP', subject: map?.packageId ?? null, message: 'map.sourceViewDigest does not equal viewDigest(view)' });
  }
  if (map?.digest !== mapDigest(map)) {
    findings.push({ code: 'DISTRIBUTION_DIGEST_MISMATCH', subject: 'map', message: 'map.digest does not equal mapDigest(map)' });
  }

  const viewUnitIds = new Set(collectViewUnits(view).keys());
  const mapUnits = new Set((map?.units ?? []).map((unit) => unit.unitId));
  const residualUnits = new Set((map?.residuals ?? []).map((residual) => residual.unit));
  const missing = [...viewUnitIds].filter((unitId) => !mapUnits.has(unitId) && !residualUnits.has(unitId));
  const invented = [...mapUnits].filter((unitId) => !viewUnitIds.has(unitId));
  if (missing.length > 0 || invented.length > 0) {
    findings.push({ code: 'UNIT_SET_MISMATCH', subject: null, message: `missing=${missing.join(',') || 'none'}; invented=${invented.join(',') || 'none'}` });
  }

  if (artifact !== null) {
    const stepBearing = stepBearingRecords(view);
    for (const [sequenceId, steps] of artifactStepsForSequences(artifact, declaredSequenceIds(view))) {
      const carried = new Set(
        (stepBearing.get(sequenceId) ?? []).flatMap((record) => record.steps.map((step) => step.stepId)),
      );
      for (const step of steps) {
        if (!carried.has(step.id)) {
          findings.push({ code: 'SEQUENCE_STEPS_UNDISTRIBUTED', subject: step.id, message: `step ${step.id} has no step-bearing view record` });
        }
      }
    }
  }

  for (const row of registryRowsForPackage(registry, view?.packageId)) {
    const ctrUnit = `ctr-${row.boundary_id}`;
    if (!viewUnitIds.has(ctrUnit)) {
      findings.push({ code: 'MISSING_BOUNDARY_CONTRACT', subject: ctrUnit, message: `registry boundary ${row.boundary_id} has no ctr unit in the view` });
    }
  }

  return findings;
}

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

// [::TICKET::] PX-315 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-315) --for-spec --no-implementation-order`.
function refuse(code, message, action) {
  console.error(`[ERROR] ${code}: ${message}`);
  console.error(`Cause: ${message}`);
  console.error(`Action: ${action}`);
  return 1;
}

// [::TICKET::] PX-315 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-315) --for-spec --no-implementation-order`.
function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

// [::TICKET::] PX-306, PX-307, PX-312, PX-313, PX-315, PX-319 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-306|PX-307|PX-312|PX-313|PX-315|PX-319) --for-spec --no-implementation-order`.
async function main() {
  const argv = process.argv.slice(2);
  const graphPath = argumentFor(argv, 'graph');
  const rfcPath = argumentFor(argv, 'rfc');
  const ledgerPath = argumentFor(argv, 'ledger');
  const dirsTreePath = argumentFor(argv, 'dirs-tree');
  const viewPath = argumentFor(argv, 'view');
  const registryPath = argumentFor(argv, 'registry');
  const artifactPath = argumentFor(argv, 'artifact');
  const admit = argv.includes('--admit');
  if (admit) {
    if (rfcPath === null || viewPath === null) {
      console.error('usage: node attach-unit-ids.js --admit --rfc=<RFC.md> --view=<SEQUENCES.json> [--registry=<ALLOCATE-MANIFEST.json>] [--artifact=<root *-sequences.json>]');
      return 2;
    }
  } else if (graphPath === null || rfcPath === null) {
    console.error('usage: node attach-unit-ids.js --graph=<GRAPH.json> --rfc=<RFC.md> [--ledger=<RFC.md|ledger.json>] [--dirs-tree=<Dirs-Tree.json>] [--view=<SEQUENCES.json>] [--registry=<ALLOCATE-MANIFEST.json>]');
    return 2;
  }

  const {
    assignUnitIdsFromMap,
    assignUnitIdsFromRfc,
    collectLedgerUnitIds,
    readDistributionMap,
    unassignedAnchors,
  } = await import(LIBRARY);

  if (admit) {
    if (viewPath === null || viewPath === '' || !fs.existsSync(viewPath)) {
      return refuse('MISSING_VIEW', `view is not readable: ${viewPath ?? '(missing)'}`, 'pass --view=<SEQUENCES.json>');
    }
    if (rfcPath === null || rfcPath === '' || !fs.existsSync(rfcPath)) {
      return refuse('MISSING_RFC', `RFC is not readable: ${rfcPath ?? '(missing)'}`, 'pass --rfc=<RFC.md>');
    }
    const inWorkspace = findAllocateManifest(path.dirname(path.resolve(rfcPath))) !== null;
    if (inWorkspace && (artifactPath === null || artifactPath === '' || !fs.existsSync(artifactPath))) {
      return refuse('MISSING_SIDECAR', 'the workspace has an allocate manifest and the root *-sequences.json is missing or unreadable', 'restore the root artifact or pass --artifact=<path>');
    }
    if (inWorkspace && (registryPath === null || registryPath === '' || !fs.existsSync(registryPath))) {
      return refuse('MISSING_REGISTRY', 'the workspace has an allocate manifest and the contract_registry is missing or unreadable', 'restore WORKSPACIFY-ALLOCATE-MANIFEST.json or pass --registry=<path>');
    }
    try {
      const rfcText = fs.readFileSync(rfcPath, 'utf8');
      const map = readDistributionMap(rfcText);
      if (!inWorkspace && map === null) {
        process.stdout.write(`${JSON.stringify({ ok: true, skipped: 'no-workspace', findings: [] })}\n`);
        return 0;
      }
      const view = JSON.parse(fs.readFileSync(viewPath, 'utf8'));
      const registry = registryPath === null || registryPath === ''
        ? []
        : (JSON.parse(fs.readFileSync(registryPath, 'utf8')).contract_registry ?? []);
      const artifact = artifactPath === null || artifactPath === ''
        ? null
        : JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
      const findings = verifyViewAgainstMap({ view, map, artifact, registry });
      for (const entry of findings) console.error(`${entry.code}: ${entry.subject ?? ''} ${entry.message}`);
      process.stdout.write(`${JSON.stringify({ ok: findings.length === 0, findings })}\n`);
      return findings.length === 0 ? 0 : 1;
    } catch (error) {
      return refuse(error.code ?? 'UNREADABLE_SIDECAR', error.message, 'repair the file and re-run');
    }
  }

  let rfcText;
  try {
    rfcText = fs.readFileSync(rfcPath, 'utf8');
  } catch (error) {
    return refuse('MISSING_RFC', error.message, 'pass a readable --rfc=<RFC.md>');
  }
  const map = readDistributionMap(rfcText);

  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));

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
      collectNodeFilePaths,
      collectNodePaths,
      verifyDistributionCoverage,
    } = require('./lib/distribution-index.js');
    const dirsTree = JSON.parse(fs.readFileSync(dirsTreePath, 'utf8'));
    dirsTree.distribution = buildDistributionIndex(next, collectNodePaths(dirsTree.trees), next.distributionDigest, collectNodeFilePaths(dirsTree.trees));
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

module.exports = { main, verifyViewAgainstMap };
