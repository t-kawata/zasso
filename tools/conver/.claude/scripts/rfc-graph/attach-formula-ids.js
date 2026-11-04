#!/usr/bin/env node
// PX-361 @verifies C001
// [::TICKET::] PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-361 --for-spec --no-implementation-order`.
/**
 * attach-formula-ids.js --graph=<GRAPH.json> --sidecar=<RFC-FORMULAS.json>
 *   [--rfc=<RFC.md>] [--spec=<spec.md>] [--dirs-tree=<Dirs-Tree.json>] [--write]
 *
 * Resolve each sidecar formula to the one graph node whose section realizes it, attach
 * the id, and bind the graph to the sidecar content with formulaDigest. A stale sidecar,
 * a missing node or an invented graph id is refused before either file is written.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');

const { collectNodeFilePaths } = require('./lib/distribution-index.js');
const {
  buildFormulaIndex,
  computeFormulaDigest,
  isFormulaId,
  readFormulaIds,
} = require('./lib/formula-ids.js');

const FORMULA_LIBRARY = pathToFileURL(path.join(__dirname, '..', 'spec-formula', 'index.mjs')).href;

// [::TICKET::] PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-361) --for-spec --no-implementation-order`.
function argumentFor(argv, name) {
  const inline = argv.find((entry) => entry.startsWith(`--${name}=`));
  if (inline !== undefined) return inline.slice(`--${name}=`.length);
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? null : argv[index + 1] ?? null;
}

// [::TICKET::] PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-361) --for-spec --no-implementation-order`.
function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

// [::TICKET::] PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-361) --for-spec --no-implementation-order`.
function finding(code, subject, message) {
  return { code, subject, message };
}

// [::TICKET::] PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-361) --for-spec --no-implementation-order`.
function normalized(value) {
  return String(value ?? '').trim().toLowerCase();
}

/** The section a formula says realizes it. */
// [::TICKET::] PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-361) --for-spec --no-implementation-order`.
function formulaSection(formula) {
  return formula?.implementation?.rfcSection ?? formula?.rfcLocation?.section ?? '';
}

/** Whether a node is the one the formula names. */
// [::TICKET::] PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-361) --for-spec --no-implementation-order`.
function nodeMatchesSection(node, section) {
  const wanted = normalized(section);
  if (wanted.length === 0) return false;
  if (normalized(node.id) === wanted || normalized(node.title) === wanted) return true;
  return (node.headingRefs ?? []).some((reference) => (reference.texts ?? []).some((text) => normalized(text) === wanted));
}

/** Attach every sidecar formula to exactly one node. */
// [::TICKET::] PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-361) --for-spec --no-implementation-order`.
async function attachFormulaIds(options) {
  const {
    graphPath,
    sidecarPath,
    rfcPath = null,
    specPath = null,
    dirsTreePath = null,
    write = false,
  } = options;
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
  const findings = [];

  if (specPath !== null) {
    const digest = sha256(fs.readFileSync(specPath));
    if (sidecar.specDigest !== digest) {
      findings.push(finding('STALE_SIDECAR', 'specDigest', `sidecar records ${sidecar.specDigest} and the specification is ${digest}`));
    }
  }
  if (rfcPath !== null) {
    const { computeRfcDigest } = await import(FORMULA_LIBRARY);
    const digest = computeRfcDigest(fs.readFileSync(rfcPath, 'utf8'));
    if (sidecar.rfcDigest !== digest) {
      findings.push(finding('STALE_SIDECAR', 'rfcDigest', `sidecar records ${sidecar.rfcDigest} and the RFC body is ${digest}`));
    }
  }
  if (findings.length > 0) return { ok: false, graph, findings };

  const nodes = new Map((graph.nodes ?? []).map((node) => [node.id, node]));
  for (const formula of sidecar.formulas ?? []) {
    if (!isFormulaId(formula.id)) {
      findings.push(finding('INVALID_FORMULA_ID', String(formula.id), 'the sidecar carries a malformed formula id'));
      continue;
    }
    const section = formulaSection(formula);
    const carriers = (graph.nodes ?? []).filter((node) => nodeMatchesSection(node, section));
    if (carriers.length === 0) {
      findings.push(finding('MISSING_NODE', formula.id, `no graph node matches section ${section || '(none)'}`));
      continue;
    }
    if (carriers.length > 1) {
      findings.push(finding('AMBIGUOUS_NODE', formula.id, `section ${section} matches ${carriers.map((node) => node.id).join(', ')}`));
      continue;
    }
    const node = nodes.get(carriers[0].id);
    const formulaIds = [...readFormulaIds(node)];
    if (!formulaIds.includes(formula.id)) formulaIds.push(formula.id);
    node.formulaIds = formulaIds;
  }

  const sidecarIds = new Set((sidecar.formulas ?? []).map((formula) => formula.id));
  for (const node of graph.nodes ?? []) {
    for (const formulaId of readFormulaIds(node)) {
      if (!sidecarIds.has(formulaId)) {
        findings.push(finding('INVENTED_FORMULA', formulaId, `${node.id} carries ${formulaId} and the sidecar does not`));
      }
    }
  }

  if (findings.length > 0) return { ok: false, graph, findings };

  graph.formulaDigest = computeFormulaDigest(sidecar);
  const formulaIds = [...sidecarIds].sort();

  let dirsTree = null;
  if (dirsTreePath !== null) {
    dirsTree = JSON.parse(fs.readFileSync(dirsTreePath, 'utf8'));
    const nodeToFilePaths = collectNodeFilePaths(dirsTree.trees);
    dirsTree.distribution = dirsTree.distribution ?? { digest: '0'.repeat(64), units: {} };
    dirsTree.distribution.formulas = buildFormulaIndex(graph, sidecar, nodeToFilePaths);
    enrichMappedEntries(dirsTree.trees, graph);
    if (write) fs.writeFileSync(dirsTreePath, `${JSON.stringify(dirsTree, null, 2)}\n`);
  }

  if (write) fs.writeFileSync(graphPath, `${JSON.stringify(graph, null, 2)}\n`);
  return { ok: true, graph, dirsTree, formulaIds, findings: [] };
}

/** Carry formulaIds into the tree entries so a later header regeneration names them. */
// [::TICKET::] PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-361) --for-spec --no-implementation-order`.
function enrichMappedEntries(trees, graph) {
  const formulaIdsByNode = new Map((graph.nodes ?? []).map((node) => [node.id, readFormulaIds(node)]));
  const walk = (node) => {
    for (const mapped of Array.isArray(node?.mappedNodeIds) ? node.mappedNodeIds : []) {
      if (typeof mapped !== 'object' || mapped === null) continue;
      const formulaIds = formulaIdsByNode.get(mapped.nodeId) ?? [];
      if (formulaIds.length > 0) mapped.formulaIds = formulaIds;
    }
    for (const child of Array.isArray(node?.children) ? node.children : []) walk(child);
  };
  for (const root of Object.values(trees ?? {})) walk(root);
}

// [::TICKET::] PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-361) --for-spec --no-implementation-order`.
async function main(argv = process.argv.slice(2)) {
  const graphPath = argumentFor(argv, 'graph');
  const sidecarPath = argumentFor(argv, 'sidecar');
  if (graphPath === null || sidecarPath === null) {
    console.error('[ERROR] --graph=<GRAPH.json> --sidecar=<RFC-FORMULAS.json> are required');
    return 1;
  }
  const result = await attachFormulaIds({
    graphPath: path.resolve(graphPath),
    sidecarPath: path.resolve(sidecarPath),
    rfcPath: argumentFor(argv, 'rfc') === null ? null : path.resolve(argumentFor(argv, 'rfc')),
    specPath: argumentFor(argv, 'spec') === null ? null : path.resolve(argumentFor(argv, 'spec')),
    dirsTreePath: argumentFor(argv, 'dirs-tree') === null ? null : path.resolve(argumentFor(argv, 'dirs-tree')),
    write: argv.includes('--write'),
  });
  for (const entry of result.findings ?? []) console.error(`${entry.code}: ${entry.subject} ${entry.message}`);
  process.stdout.write(`${JSON.stringify({ ok: result.ok, formulaIds: result.formulaIds ?? [], formulaDigest: result.graph?.formulaDigest ?? null, findings: result.findings ?? [] })}\n`);
  return result.ok ? 0 : 1;
}

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(`[ERROR] ${error.message}`);
    process.exit(1);
  });
}

module.exports = { attachFormulaIds, enrichMappedEntries };
