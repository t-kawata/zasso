#!/usr/bin/env node
/**
 * verify-consistencies.js --rfc=<path> --graph=<path> --dirs-tree=<path> --src=<dir> --tickets=<path> [--out=<path>]
 *
 * /drill-rfc-down Step 5 verify: the final cross-artifact verification (PX-169).
 *
 * Checks the five consistencies across the pipeline artifacts:
 *   - RFC headings  vs GRAPH headingRefs     (every RFC heading is covered)
 *   - GRAPH nodes   vs Dirs-Tree mappedNodeIds (every non-Prose node is mapped)
 *   - Dirs-Tree     vs src                    (every Dirs-Tree file exists in src)
 *   - GRAPH nodes   vs Tickets nodeIds        (every non-Prose node has a ticket)
 *   - dangling references                     (Dirs-Tree/Tickets reference real nodes)
 *
 * Findings are severity-ranked (high = structural break, low = cosmetic). The
 * check is READ-ONLY: it never writes to any artifact. It is deterministic.
 *
 * Exit codes: 0 = success (verification ran), 1 = failure (missing args / invalid input).
 *
 * Design context: tools/conver/README.md — 進化ループ / /drill-rfc-down (Step 5).
 */

import fs from 'fs';
import path from 'path';
// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
import { readDistributionLedger, resolvesInsideRfc } from '../sequences-slice/lib/distribution-ledger.mjs';
// [::TICKET::] PX-258 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-258 --for-spec --no-implementation-order`.
import { checkUnitCoverage, checkUnitProvenance } from '../sequences-slice/lib/unit-provenance.mjs';
import { collectLedgerResidualUnitIds, collectLedgerUnitIds, collectViewUnitIds, isUnitId } from '../rfc-graph/lib/unit-ids.mjs';
import { VIEW_JSON_NAME } from '../sequences-slice/lib/material.mjs';
import { fileURLToPath } from 'url';
import { detectOrphanContracts } from './detect-orphan-contracts.js';

/** Prose node kinds that are not required to map to src files or tickets. */
const PROSE_KINDS = ['rationale', 'glossary', 'requirement'];

/** Extract headings (level >= 2) from RFC source lines, skipping code blocks. */
// [::TICKET::] PX-169 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-169 --for-spec --no-implementation-order`.
function extractHeadings(rfcLines) {
  const headings = [];
  let inCodeBlock = false;
  for (const line of rfcLines) {
    if (/^\s*```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    const match = line.match(/^(#{2,6})\s+(.+)$/);
    if (match) headings.push({ level: match[1].length, text: match[2].trim() });
  }
  return headings;
}

/** Normalize a heading text for comparison (lowercase, collapse spaces). */
// [::TICKET::] PX-169 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-169 --for-spec --no-implementation-order`.
function normalizeHeading(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Whether any node headingRef covers the given heading (level + text match). */
// [::TICKET::] PX-169 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-169 --for-spec --no-implementation-order`.
function isHeadingCovered(heading, graphNodes) {
  const normalized = normalizeHeading(heading.text);
  for (const node of graphNodes || []) {
    for (const ref of node.headingRefs || []) {
      if (ref.heading !== heading.level) continue;
      for (const text of ref.texts || []) {
        const refText = normalizeHeading(text);
        if (refText === normalized || refText.includes(normalized) || normalized.includes(refText)) return true;
      }
    }
  }
  return false;
}

/** Collect every Dirs-Tree file path (e.g. "src/api/auth.rs") from one tree branch. */
// [::TICKET::] PX-169 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-169 --for-spec --no-implementation-order`.
function collectDirsTreeFiles(node, prefix, acc) {
  const currentPath = prefix ? `${prefix}/${node.name}` : node.name;
  if (node.type === 'file') acc.push({ path: currentPath, node });
  for (const child of node.children || []) collectDirsTreeFiles(child, currentPath, acc);
  return acc;
}

/** Collect every Dirs-Tree file across all language trees. */
// [::TICKET::] PX-169 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-169 --for-spec --no-implementation-order`.
function collectDirsTreeFilesFromTrees(trees) {
  const acc = [];
  for (const lang of Object.keys(trees || {})) {
    collectDirsTreeFiles(trees[lang], '', acc);
  }
  return acc;
}

/** Collect every src file path relative to srcDir (e.g. "api/auth.rs"). */
// [::TICKET::] PX-169 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-169 --for-spec --no-implementation-order`.
function collectSrcFiles(dir, prefix, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const currentPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) collectSrcFiles(fullPath, currentPath, acc);
    else if (entry.isFile()) acc.push(currentPath);
  }
  return acc;
}

/** Collect every ticket nodeId across all phases. */
// [::TICKET::] PX-169 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-169 --for-spec --no-implementation-order`.
function collectTicketNodeIds(tickets) {
  const ids = new Set();
  for (const phase of tickets.phases || []) {
    for (const ticket of phase.tickets || []) {
      for (const nodeId of ticket.nodeIds || []) ids.add(nodeId);
    }
  }
  return ids;
}

/** A finding: RFC heading with no GRAPH headingRef (high). */
// [::TICKET::] PX-169 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-169 --for-spec --no-implementation-order`.
function checkRfcHeadingCoverage(rfcLines, graphNodes) {
  return extractHeadings(rfcLines)
    .filter((heading) => !isHeadingCovered(heading, graphNodes))
    .map((heading) => ({ severity: 'high', message: `RFC heading "## ${heading.text}" is not covered by any GRAPH node headingRef` }));
}

/** A finding: a non-Prose GRAPH node unmapped in the Dirs-Tree (high). */
// [::TICKET::] PX-169 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-169 --for-spec --no-implementation-order`.
function checkGraphDirsTreeMapping(graphNodes, dirsTree) {
  const mapped = new Set(collectDirsTreeFilesFromTrees(dirsTree.trees || {})
    .flatMap((f) => (f.node.mappedNodeIds || []).map((m) => m.nodeId)));
  return (graphNodes || [])
    .filter((n) => !PROSE_KINDS.includes(n.kind))
    .filter((n) => !mapped.has(n.id))
    .map((n) => ({ severity: 'high', message: `graph node ${n.id} "${n.title}" is not mapped to any Dirs-Tree file` }));
}

/** A finding: a Dirs-Tree file missing from src (high) or a src extra file (low). */
// [::TICKET::] PX-169 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-169 --for-spec --no-implementation-order`.
function checkDirsTreeSrcConsistency(dirsTree, srcDir) {
  const findings = [];
  const srcSet = new Set(collectSrcFiles(srcDir, '', []));
  for (const file of collectDirsTreeFilesFromTrees(dirsTree.trees || {})) {
    // The Dirs-Tree path is "src/api/auth.rs"; srcDir is already that root.
    const relativePath = file.path.split('/').slice(1).join('/') || file.path;
    if (!srcSet.has(relativePath)) {
      findings.push({ severity: 'high', message: `Dirs-Tree file "${file.path}" is missing from src (${relativePath})` });
    }
  }
  const treeSet = new Set(collectDirsTreeFilesFromTrees(dirsTree.trees || {}).map((f) => f.path.split('/').slice(1).join('/') || f.path));
  for (const srcFile of srcSet) {
    if (!treeSet.has(srcFile)) {
      findings.push({ severity: 'low', message: `src file "${srcFile}" is not declared in the Dirs-Tree (possibly generated)` });
    }
  }
  return findings;
}

/** A finding: a non-Prose GRAPH node absent from Tickets (high). */
// [::TICKET::] PX-169 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-169 --for-spec --no-implementation-order`.
function checkGraphTicketCoverage(graphNodes, tickets) {
  const covered = collectTicketNodeIds(tickets);
  return (graphNodes || [])
    .filter((n) => !PROSE_KINDS.includes(n.kind))
    .filter((n) => !covered.has(n.id))
    .map((n) => ({ severity: 'high', message: `graph node ${n.id} "${n.title}" is absent from all Tickets nodeIds` }));
}

/** A finding: a Dirs-Tree or Tickets reference to a node that is not in the GRAPH (high). */
// [::TICKET::] PX-169, PX-368, PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-169|PX-368|PX-369) --for-spec --no-implementation-order`.
function checkDanglingReferences(graphNodes, dirsTree, tickets) {
  const findings = [];
  const graphIds = new Set((graphNodes || []).map((n) => n.id));
  for (const file of collectDirsTreeFilesFromTrees(dirsTree.trees || {})) {
    for (const mapping of file.node.mappedNodeIds || []) {
      if (!graphIds.has(mapping.nodeId)) {
        findings.push({ severity: 'high', message: `dangling reference: Dirs-Tree file "${file.path}" maps node ${mapping.nodeId} which is not in the GRAPH` });
      }
    }
  }
  for (const nodeId of collectTicketNodeIds(tickets)) {
    // A unit id travels in nodeIds beside the graph node ids; it names a unit, not a
    // graph node, so it is not a dangling node reference.
    if (isUnitId(nodeId)) continue;
    if (!graphIds.has(nodeId)) {
      findings.push({ severity: 'high', message: `dangling reference: a ticket references node ${nodeId} which is not in the GRAPH` });
    }
  }
  return findings;
}

/** A finding: an edge contract not present in any connecting ticket's contracts (high). */
// [::TICKET::] PX-172 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-172 --for-spec --no-implementation-order`.
function checkOrphanEdgeContracts(graph, tickets) {
  return detectOrphanContracts(graph, tickets).map((orphan) => {
    const edgeLabel = `${orphan.edge.from}→${orphan.edge.to}`;
    const connections = orphan.connectingTickets.length === 0
      ? 'no ticket owns the edge endpoints'
      : `connecting tickets: ${orphan.connectingTickets.map((t) => `${t.key}(${t.status})`).join(', ')}`;
    return { severity: 'high', message: `orphan edge contract ${orphan.contract.id} on edge ${edgeLabel} is present in no connecting ticket contract (${connections})` };
  });
}

/** Run all consistency checks and return the findings. */
// [::TICKET::] PX-169, PX-172 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-169|PX-172) --for-spec --no-implementation-order`.
/**
 * The sixth consistency: every unit the projection distributed is discharged in the ledger.
 *
 * This returns an empty array when the package carries no distribution ledger, and that
 * single line is the whole additivity argument. The obligation set comes from the registry,
 * so an absent material yields an empty loop; there is deliberately no branch here on a
 * material's file name, because a gate that read "if the material is present, then require
 * something" would make the material a precondition of operation.
 *
 * Severity follows the file's existing vocabulary: a unit the tree carries and the ledger
 * does not disclose is a structural break, and a row citing a location that does not resolve
 * inside this document is cosmetic, because the row exists and only its pointer is wrong.
 *
 * @param {string[]} rfcLines
 * @param {{ nodes?: object[] }} tree
 * @param {object|null} ledger - the verdict from readDistributionLedger, or null
 * @returns {object[]}
 */
// [::TICKET::] PX-257, PX-258 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-257|PX-258) --for-spec --no-implementation-order`.
function checkUnitPreservation(rfcLines, tree, ledger, artifacts = null) {
  if (ledger === null || ledger === undefined) return [];

  const findings = [];
  const unitIdsInTree = collectUnitIds(tree?.nodes ?? []);
  const disclosed = new Set(ledger.rows.map((row) => row.unit));

  for (const unitId of unitIdsInTree) {
    if (!disclosed.has(unitId)) {
      findings.push({ severity: 'high', message: `unit ${unitId} is distributed to this package and the distribution ledger does not disclose it` });
    }
  }
  for (const row of ledger.rows) {
    if (!resolvesInsideRfc(row.location)) {
      findings.push({ severity: 'low', message: `distribution ledger row ${row.index} cites "${row.location}", which does not resolve inside this RFC` });
    }
  }

  // PX-258 extends the same check rather than adding a second one with the same name: the
  // chain continues past the package, and the graph and the tickets are the next two links.
  findings.push(...checkUnitProvenance(artifacts?.graph ?? null, ledgerUnitIdsOf(tree), [], artifacts?.tickets ?? null));
  return findings;
}

/** The ledger unit ids a design tree implies, or nothing when it carries no unit nodes. */
// [::TICKET::] PX-258 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-258 --for-spec --no-implementation-order`.
function ledgerUnitIdsOf(tree) {
  const unitIds = collectUnitIds(tree?.nodes ?? []);
  return unitIds.length === 0 ? null : new Set(unitIds);
}

/** Every unit id the design tree carries, at any depth, in the prefixes the view uses. */
// [::TICKET::] PX-257, PX-258, PX-259 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-257|PX-258|PX-259) --for-spec --no-implementation-order`.
function collectUnitIds(nodes) {
  const unitIds = [];
  for (const node of nodes) {
    if (typeof node?.id === 'string' && /^(op|seq|xdir|ctr|obl)-/.test(node.id)) unitIds.push(node.id);
    unitIds.push(...collectUnitIds(node?.children ?? []));
  }
  return unitIds;
}

/** The package view beside the RFC, or null when it carries none. */
// [::TICKET::] PX-368, PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-368|PX-369) --for-spec --no-implementation-order`.
function readViewBeside(rfcPath) {
  if (typeof rfcPath !== 'string' || rfcPath.length === 0) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(path.dirname(rfcPath), VIEW_JSON_NAME), 'utf8'));
  } catch {
    return null;
  }
}

/** The header text of one mapped file, or null when the file does not exist or carries none. */
// [::TICKET::] PX-368, PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-368|PX-369) --for-spec --no-implementation-order`.
function readHeaderText(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return text.includes('Initial Design Artifact') ? text : null;
  } catch {
    return null;
  }
}

/**
 * The headers of the files the Dirs-Tree maps to nodes.
 *
 * A planned file that does not exist yet is skipped: before implementation the header is
 * not there to check, and a missing file is the plan's business rather than this gate's.
 */
// [::TICKET::] PX-368, PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-368|PX-369) --for-spec --no-implementation-order`.
function collectHeaderTexts(dirsTree, packageDir) {
  const texts = [];
  const walk = (node, segments) => {
    if (node === null || node === undefined) return;
    const nextSegments = typeof node.name === 'string' && node.name.length > 0 ? [...segments, node.name] : segments;
    if (node.type === 'file' && Array.isArray(node.mappedNodeIds) && node.mappedNodeIds.length > 0) {
      const header = readHeaderText(path.join(packageDir, ...nextSegments));
      if (header !== null) texts.push(header);
    }
    for (const child of Array.isArray(node.children) ? node.children : []) walk(child, nextSegments);
  };
  for (const tree of Object.values(dirsTree?.trees ?? {})) walk(tree, []);
  return texts;
}

/**
 * The per-package penetration chain: view -> ledger -> graph -> header -> ticket.
 *
 * A package with no view has no chain to check; that is the vacuous case and not a pass
 * over something. When the view exists, every layer must carry the same unit set, and an
 * omission and an invention are reported apart because they need different repairs.
 */
// [::TICKET::] PX-368, PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-368|PX-369) --for-spec --no-implementation-order`.
function checkViewUnitChain({ rfcText, view, artifacts, rfcPath, dirsTree }) {
  const viewUnitIds = collectViewUnitIds([view]);
  const ledger = readDistributionLedger(rfcText, new Set(viewUnitIds));
  if (ledger === null) return [];
  if (!ledger.ok) {
    const invented = (ledger.rows ?? [])
      .filter((row) => !viewUnitIds.includes(row.unit))
      .map((row) => row.unit);
    if (invented.length > 0) {
      return invented.map((unitId) => ({
        severity: 'high',
        code: 'INVENTED_UNIT',
        unitId,
        layer: 'rfc',
        message: `unit ${unitId} is in the ledger and no package view distributes it`,
      }));
    }
    return [{ severity: 'high', code: 'LEDGER_MALFORMED', layer: 'rfc', message: `the distribution ledger is not well formed: ${ledger.reason}` }];
  }

  const ledgerUnitIds = collectLedgerUnitIds(ledger.rows);
  const residualUnitIds = collectLedgerResidualUnitIds(ledger.rows);
  const findings = [
    ...checkUnitCoverage({
      viewUnitIds,
      ledgerUnitIds,
      residualUnitIds,
      graph: artifacts.graph,
      tickets: artifacts.tickets,
    }),
    ...checkUnitProvenance(
      artifacts.graph ?? null,
      new Set(ledgerUnitIds),
      collectHeaderTexts(dirsTree, path.dirname(rfcPath)),
      artifacts.tickets ?? null,
    ),
  ];

  for (const row of ledger.rows) {
    if (!resolvesInsideRfc(row.location)) {
      findings.push({ severity: 'low', message: `distribution ledger row ${row.index} cites "${row.location}", which does not resolve inside this RFC` });
    }
  }
  return findings;
}

// [::TICKET::] PX-257, PX-258, PX-368, PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-257|PX-258|PX-368|PX-369) --for-spec --no-implementation-order`.
function verifyConsistencies(rfcLines, { srcDir, artifacts, rfcPath = null }) {
  const { graph, dirsTree, tickets } = artifacts;
  const view = readViewBeside(rfcPath);
  const unitFindings = view === null
    ? []
    : checkViewUnitChain({ rfcText: rfcLines.join('\n'), view, artifacts, rfcPath, dirsTree });
  const findings = [
    ...checkRfcHeadingCoverage(rfcLines, graph.nodes || []),
    ...checkGraphDirsTreeMapping(graph.nodes || [], dirsTree),
    ...checkDirsTreeSrcConsistency(dirsTree, srcDir),
    ...checkGraphTicketCoverage(graph.nodes || [], tickets),
    ...checkDanglingReferences(graph.nodes || [], dirsTree, tickets),
    ...checkOrphanEdgeContracts(graph, tickets),
    ...unitFindings,
  ];
  const high = findings.filter((f) => f.severity === 'high').length;
  const low = findings.filter((f) => f.severity === 'low').length;
  return { ok: high === 0, findings, summary: { high, low, total: findings.length } };
}

// [::TICKET::] PX-169, PX-257, PX-258, PX-368, PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-169|PX-257|PX-258|PX-368|PX-369) --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  let rfcPath = '';
  let graphPath = '';
  let dirsTreePath = '';
  let srcDir = '';
  let ticketsPath = '';
  let outPath = '';
  for (const arg of args) {
    if (arg.startsWith('--rfc=')) rfcPath = arg.slice('--rfc='.length);
    else if (arg.startsWith('--graph=')) graphPath = arg.slice('--graph='.length);
    else if (arg.startsWith('--dirs-tree=')) dirsTreePath = arg.slice('--dirs-tree='.length);
    else if (arg.startsWith('--src=')) srcDir = arg.slice('--src='.length);
    else if (arg.startsWith('--tickets=')) ticketsPath = arg.slice('--tickets='.length);
    else if (arg.startsWith('--out=')) outPath = arg.slice('--out='.length);
  }
  if (!rfcPath || !graphPath || !dirsTreePath || !srcDir || !ticketsPath) {
    console.error('Usage: verify-consistencies.js --rfc=<path> --graph=<path> --dirs-tree=<path> --src=<dir> --tickets=<path> [--out=<path>]');
    process.exit(1);
  }
  const rfcLines = fs.readFileSync(rfcPath, 'utf8').split('\n');
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const dirsTree = JSON.parse(fs.readFileSync(dirsTreePath, 'utf8'));
  const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  const result = verifyConsistencies(rfcLines, {
    srcDir,
    artifacts: { graph, dirsTree, tickets },
    rfcPath,
  });
  const payload = JSON.stringify(result, null, 2) + '\n';
  if (outPath) fs.writeFileSync(outPath, payload, 'utf8');
  process.stdout.write(payload);
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main();
}

export {
  extractHeadings,
  isHeadingCovered,
  collectDirsTreeFiles,
  collectSrcFiles,
  collectTicketNodeIds,
  checkRfcHeadingCoverage,
  checkGraphDirsTreeMapping,
  checkDirsTreeSrcConsistency,
  checkGraphTicketCoverage,
  checkDanglingReferences,
  checkOrphanEdgeContracts,
  // [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
  checkUnitPreservation,
  verifyConsistencies,
  main,
};
