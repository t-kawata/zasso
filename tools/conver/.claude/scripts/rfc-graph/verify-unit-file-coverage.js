#!/usr/bin/env node

/**
 * verify-unit-file-coverage — prove every unit has a leaf file and a header naming it.
 *
 * The distribution index records the leaf files a unit resolves to; the generated header
 * records the units a file implements. This gate reads both and names a unit that has no
 * file, a file whose header omits the unit, and a header naming a unit its node does not
 * carry. It never writes.
 *
 * Usage:
 *   node verify-unit-file-coverage.js --graph=<GRAPH.json> --dirs-tree=<Dirs-Tree.json> [--root=<dir>]
 */
const fs = require('fs');
const path = require('path');
const {
  resolveGraphPath,
  resolveDirsTreePath,
  reportResolvedPath,
} = require('../lib/package-artifacts');

const {
  readHeaderNodeId,
  readHeaderUnitIds,
} = require('./lib/unit-ids.mjs');

const EXIT_OK = 0;
const EXIT_FAILURE = 1;
const PROSE_KINDS = new Set(['rationale', 'glossary', 'requirement']);

/** Parse `--name=value` or `--name value`. */
// [::TICKET::] PX-319 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-319 --for-spec --no-implementation-order`.
function argumentFor(argv, name) {
  const inline = argv.find((entry) => entry.startsWith(`--${name}=`));
  if (inline !== undefined) return inline.slice(`--${name}=`.length);
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? null : argv[index + 1] ?? null;
}

/** The files a unit's index entry resolves to, existing on disk. */
// [::TICKET::] PX-319 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-319 --for-spec --no-implementation-order`.
function existingFiles(root, entry) {
  return (entry?.filePaths ?? [])
    .map((filePath) => path.resolve(root, filePath))
    .filter((filePath) => fs.existsSync(filePath) && fs.statSync(filePath).isFile());
}

/** One finding for a unit or a header. */
// [::TICKET::] PX-319 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-319 --for-spec --no-implementation-order`.
function finding(code, subject, message) {
  return { code, subject, message };
}

/** Verify every unit and every generated header. */
// [::TICKET::] PX-319 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-319 --for-spec --no-implementation-order`.
function verifyUnitFileCoverage({ graph, dirsTree, root }) {
  const findings = [];
  const nodes = new Map((graph?.nodes ?? []).map((node) => [node.id, node]));
  const units = Object.keys(dirsTree?.distribution?.units ?? {});

  for (const [unitId, entry] of Object.entries(dirsTree?.distribution?.units ?? {})) {
    const carryingNode = (entry.nodeIds ?? []).map((nodeId) => nodes.get(nodeId)).find(Boolean);
    if (carryingNode !== undefined && PROSE_KINDS.has(carryingNode.kind)) {
      findings.push(finding('UNIT_REQUIRES_FILE', unitId, `unit ${unitId} is carried by a ${carryingNode.kind} node, which has no implementation file`));
      continue;
    }
    const files = existingFiles(root, entry);
    if (files.length === 0) {
      findings.push(finding('UNIT_WITHOUT_FILE', unitId, `unit ${unitId} resolves to no existing leaf file`));
      continue;
    }
    const named = files.some((filePath) => readHeaderUnitIds(fs.readFileSync(filePath, 'utf8')).includes(unitId));
    if (!named) {
      findings.push(finding('UNIT_WITHOUT_HEADER', unitId, `unit ${unitId} is not named by any generated header`));
    }
  }

  for (const entry of Object.values(dirsTree?.distribution?.units ?? {})) {
    for (const filePath of entry.filePaths ?? []) {
      const absolute = path.resolve(root, filePath);
      if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) continue;
      const text = fs.readFileSync(absolute, 'utf8');
      const nodeId = readHeaderNodeId(text);
      if (nodeId === null || !nodes.has(nodeId)) continue;
      const nodeUnits = new Set(nodes.get(nodeId).unitIds ?? []);
      for (const unitId of readHeaderUnitIds(text)) {
        if (!nodeUnits.has(unitId)) {
          findings.push(finding('HEADER_UNIT_NOT_ON_NODE', `${filePath}:${unitId}`, `header names ${unitId} but ${nodeId} does not carry it`));
        }
      }
    }
  }

  if (units.length === 0) return findings;
  return findings;
}

/** Entry point. */
// [::TICKET::] PX-319, PX-334 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-319|PX-334) --for-spec --no-implementation-order`.
function main(argv = process.argv.slice(2)) {
  const graphFlag = argumentFor(argv, 'graph');
  const dirsTreeFlag = argumentFor(argv, 'dirs-tree');
  let graphPath;
  let dirsTreePath;
  try {
    graphPath = graphFlag !== null
      ? path.resolve(graphFlag)
      : resolveGraphPath({ cwd: process.cwd() });
    if (graphFlag === null) reportResolvedPath('graph', graphPath);
    dirsTreePath = dirsTreeFlag !== null
      ? path.resolve(dirsTreeFlag)
      : resolveDirsTreePath({ cwd: process.cwd(), graphPath });
    if (dirsTreeFlag === null) reportResolvedPath('dirs-tree', dirsTreePath);
  } catch (error) {
    console.error('[ERROR] ' + (error.code || 'MISSING_ARTIFACT') + ': ' + error.message);
    console.error('Cause: the coverage gate reads both layers');
    console.error('Action: ' + (error.remedy || 'pass both paths and re-run'));
    return EXIT_FAILURE;
  }
  const root = argumentFor(argv, 'root') ?? path.dirname(graphPath);
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const dirsTree = JSON.parse(fs.readFileSync(dirsTreePath, 'utf8'));
  const findings = verifyUnitFileCoverage({ graph, dirsTree, root });
  for (const entry of findings) console.error(`${entry.code}: ${entry.subject} ${entry.message}`);
  process.stdout.write(`${JSON.stringify({ ok: findings.length === 0, findings })}\n`);
  return findings.length === 0 ? EXIT_OK : EXIT_FAILURE;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { verifyUnitFileCoverage };
