// PX-361 @verifies C001
// [::TICKET::] PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-361 --for-spec --no-implementation-order`.
/**
 * The formula id, and the vessels that carry it from the RFC ledger to a file.
 *
 * The chain is the same one units use: the sidecar names the RFC section that realizes a
 * formula, the graph node built from that section carries the id, the generated header
 * names it, and the Dirs-Tree index resolves it to the leaf files and symbols. Every
 * reader is total: a graph written before the property existed yields an empty list.
 */
'use strict';

const { createHash } = require('node:crypto');

/** The id shape a formula carries. */
const FORMULA_ID_PATTERN = /^fx-[0-9a-f]{12}$/;

/** The header line that names the formulas a generated file realizes. */
const HEADER_FORMULAS_LINE = /^\s*(?:\/\/|#|\/\*|\*)?\s*formulas:\s*(.+)$/m;

/** Whether a string is a formula id. */
// [::TICKET::] PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-361) --for-spec --no-implementation-order`.
function isFormulaId(candidate) {
  return typeof candidate === 'string' && FORMULA_ID_PATTERN.test(candidate);
}

/** The formula ids a graph node carries, or an empty list. */
// [::TICKET::] PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-361) --for-spec --no-implementation-order`.
function readFormulaIds(node) {
  const formulaIds = node?.formulaIds;
  if (!Array.isArray(formulaIds)) return [];
  return formulaIds.filter(isFormulaId);
}

/** Every formula id a graph carries, deduplicated. */
// [::TICKET::] PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-361) --for-spec --no-implementation-order`.
function readGraphFormulaIds(graph) {
  const ids = new Set();
  for (const node of graph?.nodes ?? []) {
    for (const formulaId of readFormulaIds(node)) ids.add(formulaId);
  }
  return [...ids];
}

/** The digest that binds the graph to the sidecar's content, not only its ids. */
// [::TICKET::] PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-361) --for-spec --no-implementation-order`.
function computeFormulaDigest(sidecar) {
  const lines = (sidecar?.formulas ?? [])
    .map((formula) => `${formula.id}:${formula.digest}`)
    .sort();
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

/** The formula ids a generated header names. */
// [::TICKET::] PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-361) --for-spec --no-implementation-order`.
function readHeaderFormulaIds(text) {
  const match = HEADER_FORMULAS_LINE.exec(String(text));
  if (match === null) return [];
  return match[1].split(',').map((entry) => entry.trim()).filter(isFormulaId);
}

/**
 * The formula index the Dirs-Tree carries.
 *
 * @param {{ nodes?: Array<object> }} graph
 * @param {object} sidecar
 * @param {Map<string, string[]>} nodeToFilePaths
 * @returns {Record<string, {nodeIds: string[], filePaths: string[], symbols: string[]}>}
 */
// [::TICKET::] PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-361) --for-spec --no-implementation-order`.
function buildFormulaIndex(graph, sidecar, nodeToFilePaths) {
  const index = {};
  for (const formula of sidecar?.formulas ?? []) {
    const nodeIds = (graph?.nodes ?? [])
      .filter((node) => readFormulaIds(node).includes(formula.id))
      .map((node) => node.id)
      .sort();
    const filePaths = [...new Set(nodeIds.flatMap((nodeId) => nodeToFilePaths?.get(nodeId) ?? []))].sort();
    index[formula.id] = {
      nodeIds,
      filePaths,
      symbols: [...(formula.implementation?.symbols ?? [])].sort(),
    };
  }
  return index;
}

module.exports = {
  FORMULA_ID_PATTERN,
  buildFormulaIndex,
  computeFormulaDigest,
  isFormulaId,
  readFormulaIds,
  readGraphFormulaIds,
  readHeaderFormulaIds,
};
