#!/usr/bin/env node
// PX-361 @verifies C001
// [::TICKET::] PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-361 --for-spec --no-implementation-order`.
/**
 * verify-formula-file-coverage.js --graph=<GRAPH.json> --dirs-tree=<Dirs-Tree.json>
 *   [--sidecar=<RFC-FORMULAS.json>] [--root=<dir>]
 *
 * Prove every formula id reaches one graph node and a leaf file whose generated header
 * names it. A notation-only formula may have no runtime file when its realization names
 * an RFC record, but it still needs a node and a symbol. Never writes.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { readFormulaIds, readHeaderFormulaIds, isFormulaId } = require('./lib/formula-ids.js');
const { readHeaderNodeId } = require('./lib/unit-ids.mjs');

// [::TICKET::] PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-361) --for-spec --no-implementation-order`.
function argumentFor(argv, name) {
  const inline = argv.find((entry) => entry.startsWith(`--${name}=`));
  if (inline !== undefined) return inline.slice(`--${name}=`.length);
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? null : argv[index + 1] ?? null;
}

// [::TICKET::] PX-361, PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-361|PX-365) --for-spec --no-implementation-order`.
function finding(code, subject, message) {
  return {
    code,
    subject,
    message,
    severity: 'blocking',
    action: 're-run attach-formula-ids.js --dirs-tree and refresh-file-headers.js, then re-run verify-formula-file-coverage.js',
    verify: 'node .claude/scripts/rfc-graph/verify-formula-file-coverage.js --graph=<graph> --dirs-tree=<dirs-tree> --sidecar=<sidecar> --root=<root>',
  };
}

// [::TICKET::] PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-361) --for-spec --no-implementation-order`.
function verifyFormulaFileCoverage({ graph, dirsTree, sidecar, root }) {
  const findings = [];
  const nodes = new Map((graph?.nodes ?? []).map((node) => [node.id, node]));
  const entries = dirsTree?.distribution?.formulas ?? {};
  const sidecarIds = new Set((sidecar?.formulas ?? []).map((formula) => formula.id));

  for (const formula of sidecar?.formulas ?? []) {
    const carriers = [...nodes.values()].filter((node) => readFormulaIds(node).includes(formula.id));
    if (carriers.length === 0) {
      findings.push(finding('FORMULA_WITHOUT_NODE', formula.id, `${formula.id} is carried by no graph node`));
      continue;
    }
    if (carriers.length > 1) {
      findings.push(finding('FORMULA_WITH_MULTIPLE_NODES', formula.id, `${formula.id} is carried by ${carriers.map((node) => node.id).join(', ')}`));
    }
    const entry = entries[formula.id];
    if (entry === undefined) {
      findings.push(finding('FORMULA_WITHOUT_INDEX', formula.id, `${formula.id} is absent from distribution.formulas`));
      continue;
    }
    const expectedNodeIds = carriers.map((node) => node.id).sort();
    if (JSON.stringify([...(entry.nodeIds ?? [])].sort()) !== JSON.stringify(expectedNodeIds)) {
      findings.push(finding('FORMULA_INDEX_NODE_MISMATCH', formula.id, `${formula.id} index names ${(entry.nodeIds ?? []).join(', ')}`));
    }
    if ((entry.symbols ?? []).length === 0) {
      findings.push(finding('FORMULA_WITHOUT_SYMBOL', formula.id, `${formula.id} names no realization symbol`));
    }
    const filePaths = entry.filePaths ?? [];
    const notationWithoutRuntime = formula.implementation?.class === 'notation' && (entry.symbols ?? []).length > 0;
    if (filePaths.length === 0 && !notationWithoutRuntime) {
      findings.push(finding('FORMULA_WITHOUT_FILE', formula.id, `${formula.id} resolves to no leaf file`));
      continue;
    }
    for (const filePath of filePaths) {
      const absolute = path.resolve(root, filePath);
      if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
        findings.push(finding('FORMULA_FILE_MISSING', `${formula.id}:${filePath}`, `${filePath} does not exist`));
        continue;
      }
      if (!readHeaderFormulaIds(fs.readFileSync(absolute, 'utf8')).includes(formula.id)) {
        findings.push(finding('FORMULA_HEADER_MISSING', `${formula.id}:${filePath}`, `${filePath} header does not name ${formula.id}`));
      }
    }
  }

  for (const node of graph?.nodes ?? []) {
    for (const formulaId of readFormulaIds(node)) {
      if (!sidecarIds.has(formulaId)) {
        findings.push(finding('FORMULA_INVENTED', formulaId, `${node.id} carries ${formulaId} and the sidecar does not`));
      }
    }
  }

  for (const [formulaId, entry] of Object.entries(entries)) {
    if (!isFormulaId(formulaId)) {
      findings.push(finding('FORMULA_INVALID_ID', formulaId, 'distribution.formulas carries a malformed id'));
      continue;
    }
    for (const filePath of entry.filePaths ?? []) {
      const absolute = path.resolve(root, filePath);
      if (!fs.existsSync(absolute)) continue;
      const text = fs.readFileSync(absolute, 'utf8');
      const nodeId = readHeaderNodeId(text);
      if (nodeId === null || !nodes.has(nodeId)) continue;
      for (const named of readHeaderFormulaIds(text)) {
        if (!readFormulaIds(nodes.get(nodeId)).includes(named)) {
          findings.push(finding('HEADER_FORMULA_NOT_ON_NODE', `${filePath}:${named}`, `header names ${named} but ${nodeId} does not carry it`));
        }
      }
    }
  }

  return findings;
}

// [::TICKET::] PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-361) --for-spec --no-implementation-order`.
function main(argv = process.argv.slice(2)) {
  const graphPath = argumentFor(argv, 'graph');
  const dirsTreePath = argumentFor(argv, 'dirs-tree');
  if (graphPath === null || dirsTreePath === null) {
    console.error('[ERROR] --graph=<GRAPH.json> --dirs-tree=<Dirs-Tree.json> are required');
    return 1;
  }
  const root = path.resolve(argumentFor(argv, 'root') ?? path.dirname(graphPath));
  const sidecarPath = path.resolve(argumentFor(argv, 'sidecar') ?? path.join(path.dirname(graphPath), 'RFC-FORMULAS.json'));
  const graph = JSON.parse(fs.readFileSync(path.resolve(graphPath), 'utf8'));
  const dirsTree = JSON.parse(fs.readFileSync(path.resolve(dirsTreePath), 'utf8'));
  const sidecar = fs.existsSync(sidecarPath) ? JSON.parse(fs.readFileSync(sidecarPath, 'utf8')) : { formulas: [] };
  const findings = verifyFormulaFileCoverage({ graph, dirsTree, sidecar, root });
  for (const entry of findings) console.error(`${entry.code}: ${entry.subject} ${entry.message}`);
  process.stdout.write(`${JSON.stringify({ ok: findings.length === 0, findings })}\n`);
  return findings.length === 0 ? 0 : 1;
}

if (require.main === module) process.exit(main());

module.exports = { verifyFormulaFileCoverage };
