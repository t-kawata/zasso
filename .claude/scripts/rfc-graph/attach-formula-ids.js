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

const { findAllocateManifest } = require('../lib/package-artifacts');
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

// [::TICKET::] PX-361, PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-361|PX-365) --for-spec --no-implementation-order`.
function finding(code, subject, message) {
  return {
    code,
    subject,
    message,
    severity: 'blocking',
    action: 'repair the generated Formula ledger RFC location in RFC.md and RFC-FORMULAS.json, then re-run attach-formula-ids.js',
    verify: 'node "$(git rev-parse --show-toplevel)/.claude/scripts/rfc-graph/attach-formula-ids.js" --graph=<graph> --sidecar=<sidecar> --rfc=<rfc>',
  };
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

/** Strip a heading marker and a section sign, then lower-case. */
// [::TICKET::] PX-390 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-390 --for-spec --no-implementation-order`.
function normalizedSection(value) {
  return String(value ?? '')
    .trim()
    .replace(/^#+\s*/, '')
    .replace(/^§\s*/, '')
    .toLowerCase();
}

/**
 * Whether a heading names the section a formula records.
 *
 * The ledger records a section reference, not always the whole heading text. An exact
 * heading still matches; otherwise the reference must be a token at the start of the
 * heading, so `14.1` never matches `14.10`. The caller still requires one carrier.
 */
// [::TICKET::] PX-390 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-390 --for-spec --no-implementation-order`.
function sectionMatchesHeading(headingText, section) {
  const token = normalizedSection(section);
  const heading = normalizedSection(headingText);
  if (token.length === 0 || heading.length === 0) return false;
  if (heading === token) return true;
  if (!heading.startsWith(token)) return false;
  return !/[0-9a-z]/.test(heading[token.length] ?? '');
}

/** The heading text a node carries that names the section, or null. */
// [::TICKET::] PX-390 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-390 --for-spec --no-implementation-order`.
function matchingHeading(node, section) {
  const candidates = [
    node?.id,
    node?.title,
    ...((node?.headingRefs ?? []).flatMap((reference) => reference.texts ?? [])),
  ];
  return candidates.find((text) => typeof text === 'string' && sectionMatchesHeading(text, section)) ?? null;
}

/** Every node that names the section, plus the heading when the match is unique. */
// [::TICKET::] PX-390 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-390 --for-spec --no-implementation-order`.
function resolveSectionCarrier(nodes, section) {
  const carriers = (nodes ?? []).filter((node) => matchingHeading(node, section) !== null);
  return {
    carriers,
    heading: carriers.length === 1 ? matchingHeading(carriers[0], section) : null,
  };
}

/** The formulas a package owns, or null when the ownership cannot be measured. */
// [::TICKET::] PX-390 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-390 --for-spec --no-implementation-order`.
async function ownedFormulaCount({ rfcPath, seedPath, specPath, treeManifestPath }) {
  if (!rfcPath || !seedPath || !specPath || !treeManifestPath) return null;
  if (!fs.existsSync(seedPath) || !fs.existsSync(specPath) || !fs.existsSync(treeManifestPath)) return null;
  try {
    const { ownedFormulasForPackage } = await import(FORMULA_LIBRARY);
    return ownedFormulasForPackage({
      seedText: fs.readFileSync(seedPath, 'utf8'),
      specText: fs.readFileSync(specPath, 'utf8'),
      treeManifest: JSON.parse(fs.readFileSync(treeManifestPath, 'utf8')),
    }).owned.length;
  } catch {
    return null;
  }
}

/** Attach every sidecar formula to exactly one node. */
// [::TICKET::] PX-361, PX-390 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-361|PX-390) --for-spec --no-implementation-order`.
async function attachFormulaIds(options) {
  const {
    graphPath,
    sidecarPath,
    rfcPath = null,
    specPath = null,
    dirsTreePath = null,
    seedPath = null,
    treeManifestPath = null,
    write = false,
  } = options;
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const findings = [];
  const rfcText = rfcPath !== null && fs.existsSync(rfcPath) ? fs.readFileSync(rfcPath, 'utf8') : '';
  const { readFormulaLedger, validateFormulaSidecar } = await import(FORMULA_LIBRARY);
  const ledger = rfcText.length > 0 ? readFormulaLedger(rfcText) : null;

  if (typeof sidecarPath !== 'string' || !fs.existsSync(sidecarPath)) {
    const owned = await ownedFormulaCount({
      rfcPath: rfcPath !== null && fs.existsSync(rfcPath) ? rfcPath : null,
      seedPath,
      specPath,
      treeManifestPath,
    });
    if (owned === 0 && ledger === null) {
      return { ok: true, skipped: 'no-formulas', graph, findings: [] };
    }
    return {
      ok: false,
      graph,
      findings: [finding(
        'MISSING_FORMULA_SIDECAR',
        sidecarPath,
        owned === null
          ? 'the package carries no sidecar and its formula ownership cannot be measured'
          : `the package owns ${owned} formula(s) and carries no sidecar`,
      )],
    };
  }

  let sidecar;
  try {
    sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
  } catch (error) {
    return { ok: false, graph, findings: [finding('SIDECAR_UNREADABLE', sidecarPath, error.message)] };
  }
  if (ledger !== null) {
    const parityFindings = validateFormulaSidecar(sidecar, ledger);
    if (parityFindings.length > 0) {
      return {
        ok: false,
        graph,
        findings: parityFindings.map((entry) => finding('STALE_SIDECAR', entry.formulaId ?? entry.field ?? null, entry.message)),
      };
    }
  }

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
  const resolvedSections = [];
  for (const formula of sidecar.formulas ?? []) {
    if (!isFormulaId(formula.id)) {
      findings.push(finding('INVALID_FORMULA_ID', String(formula.id), 'the sidecar carries a malformed formula id'));
      continue;
    }
    const section = formulaSection(formula);
    const carrier = resolveSectionCarrier([...nodes.values()], section);
    if (carrier.carriers.length === 0) {
      findings.push(finding('MISSING_NODE', formula.id, `no graph node matches section ${section || '(none)'}`));
      continue;
    }
    if (carrier.carriers.length > 1) {
      findings.push(finding('AMBIGUOUS_NODE', formula.id, `section ${section} matches ${carrier.carriers.map((node) => node.id).join(', ')}`));
      continue;
    }
    const node = nodes.get(carrier.carriers[0].id);
    const formulaIds = [...readFormulaIds(node)];
    if (!formulaIds.includes(formula.id)) formulaIds.push(formula.id);
    node.formulaIds = formulaIds;
    resolvedSections.push({ formulaId: formula.id, section, heading: carrier.heading });
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
  return { ok: true, graph, dirsTree, formulaIds, resolvedSections, findings: [] };
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

// [::TICKET::] PX-361, PX-390 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-361|PX-390) --for-spec --no-implementation-order`.
async function main(argv = process.argv.slice(2)) {
  const graphPath = argumentFor(argv, 'graph');
  const sidecarPath = argumentFor(argv, 'sidecar');
  if (graphPath === null || sidecarPath === null) {
    console.error('[ERROR] --graph=<GRAPH.json> --sidecar=<RFC-FORMULAS.json> are required');
    return 1;
  }
  const rfcFlag = argumentFor(argv, 'rfc');
  const rfcPath = rfcFlag === null ? null : path.resolve(rfcFlag);
  const packageDir = rfcPath === null ? process.cwd() : path.dirname(rfcPath);
  const seedFlag = argumentFor(argv, 'seed');
  const seedPath = seedFlag === null ? path.join(packageDir, 'RFC-SEED.md') : path.resolve(seedFlag);
  const allocateManifest = findAllocateManifest(packageDir);
  const workspaceRoot = allocateManifest === null ? packageDir : path.dirname(allocateManifest);
  const treeFlag = argumentFor(argv, 'tree-manifest');
  const treeManifestPath = treeFlag === null
    ? path.join(workspaceRoot, 'WORKSPACIFY-TREE-MANIFEST.json')
    : path.resolve(treeFlag);
  let specPath = argumentFor(argv, 'spec') === null ? null : path.resolve(argumentFor(argv, 'spec'));
  if (specPath === null && fs.existsSync(seedPath)) {
    try {
      const { parseSeedIdentity } = await import(FORMULA_LIBRARY);
      specPath = path.resolve(workspaceRoot, parseSeedIdentity(fs.readFileSync(seedPath, 'utf8')).sourceSpec.path);
    } catch {
      specPath = null;
    }
  }

  const result = await attachFormulaIds({
    graphPath: path.resolve(graphPath),
    sidecarPath: path.resolve(sidecarPath),
    rfcPath,
    specPath,
    dirsTreePath: argumentFor(argv, 'dirs-tree') === null ? null : path.resolve(argumentFor(argv, 'dirs-tree')),
    seedPath,
    treeManifestPath,
    write: argv.includes('--write'),
  });
  for (const entry of result.findings ?? []) console.error(`${entry.code}: ${entry.subject} ${entry.message}`);
  process.stdout.write(`${JSON.stringify({
    ok: result.ok,
    skipped: result.skipped ?? null,
    formulaIds: result.formulaIds ?? [],
    formulaDigest: result.graph?.formulaDigest ?? null,
    resolvedSections: result.resolvedSections ?? [],
    findings: result.findings ?? [],
  })}\n`);
  return result.ok ? 0 : 1;
}

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(`[ERROR] ATTACH_FORMULA_FAILED: ${error.message}`);
    console.error('Cause: the formula sidecar or graph could not be read');
    console.error('Action: repair the file named above and re-run attach-formula-ids.js');
    process.exit(1);
  });
}

module.exports = { attachFormulaIds, enrichMappedEntries };
