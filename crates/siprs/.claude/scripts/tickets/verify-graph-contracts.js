#!/usr/bin/env node

/**
 * verify-graph-contracts.js — Verify graph-level contract consistency (Gate L1)
 *
 * Usage: node verify-graph-contracts.js --graph=<path>
 *
 * Verifies:
 * 1. All edges have contracts[] (non-empty for depends_on/constrains/conflicts_with)
 * 2. All contract fields (precondition/postcondition/invariant) are non-empty
 * 3. No duplicate contract IDs across the graph
 * 4. Edge type vs contract consistency
 *
 * Exits 0 on pass, 1 on failure. 3-line error template on stderr.
 *
 * [::TICKET::] PX-69: Gate L1 + Gate M
 */

const fs = require('fs');
const path = require('path');

/** Edge types that require non-empty contracts */
const TYPES_REQUIRING_CONTRACTS = ['depends_on', 'constrains', 'conflicts_with'];

/** Edge types that are optional (no contract requirement) */
const TYPES_OPTIONAL = ['references', 'refines', 'extends', 'supersedes', 'triggers', 'precedes', 'part_of', 'validates', 'implements'];

// [::TICKET::] PX-69, PX-70, PX-71 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-69|PX-70|PX-71) --for-spec --no-implementation-order`.
function parseArgs() {
  const args = process.argv.slice(2);
  for (const a of args) {
    if (a.startsWith('--graph=')) return { graphPath: path.resolve(a.slice('--graph='.length)) };
  }
  console.error('[ERROR] --graph=<path> is required');
  console.error('Cause: Missing --graph argument');
  console.error('Action: Re-run with --graph=<path-to-GRAPH.json>');
  process.exit(1);
}

/**
 * Verify graph contract consistency
 * @param {object} graph — Parsed GRAPH.json
 * @returns {Array<{edge: string, detail: string}>} — Errors (empty array = pass)
 */
// [::TICKET::] PX-69, PX-70, PX-71 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-69|PX-70|PX-71) --for-spec --no-implementation-order`.
function verifyGraphContracts(graph) {
  const errors = [];
  const seenIds = {};
  const edges = graph.edges || [];

  for (const edge of edges) {
    const tag = (edge.from || '?') + '→' + (edge.to || '?') + '(' + (edge.type || '?') + ')';

    // Check 1: contracts existence
    if (!edge.contracts) {
      if (TYPES_REQUIRING_CONTRACTS.includes(edge.type)) {
        errors.push({ edge: tag, detail: 'contracts missing; type "' + edge.type + '" requires non-empty contracts' });
      }
      // For optional types, missing contracts is acceptable
      continue;
    }

    if (!Array.isArray(edge.contracts)) {
      errors.push({ edge: tag, detail: 'contracts must be an array' });
      continue;
    }

    if (edge.contracts.length === 0) {
      if (TYPES_REQUIRING_CONTRACTS.includes(edge.type)) {
        errors.push({ edge: tag, detail: 'contracts empty; type "' + edge.type + '" requires non-empty contracts' });
      }
      continue;
    }

    // Check 2: contract field non-empty + Check 3: ID uniqueness
    for (const c of edge.contracts) {
      const cp = tag + '.contracts[' + (edge.contracts.indexOf(c)) + ']';
      if (typeof c.precondition !== 'string' || c.precondition.length < 1) {
        errors.push({ edge: cp, detail: 'precondition must be non-empty string' });
      }
      if (typeof c.postcondition !== 'string' || c.postcondition.length < 1) {
        errors.push({ edge: cp, detail: 'postcondition must be non-empty string' });
      }
      if (typeof c.invariant !== 'string' || c.invariant.length < 1) {
        errors.push({ edge: cp, detail: 'invariant must be non-empty string' });
      }
      if (c.id) {
        if (seenIds[c.id]) {
          errors.push({ edge: cp, detail: 'duplicate contract id "' + c.id + '"' });
        } else {
          seenIds[c.id] = true;
        }
      }
    }
  }

  return errors;
}

// [::TICKET::] PX-69, PX-70, PX-71 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-69|PX-70|PX-71) --for-spec --no-implementation-order`.
function main() {
  const { graphPath } = parseArgs();
  if (!fs.existsSync(graphPath)) {
    console.error('[ERROR] Graph file not found: ' + graphPath);
    process.exit(1);
  }
  let graph;
  try { graph = JSON.parse(fs.readFileSync(graphPath, 'utf8')); }
  catch (e) {
    console.error('[ERROR] Failed to parse graph JSON: ' + e.message);
    process.exit(1);
  }
  const errors = verifyGraphContracts(graph);
  if (errors.length > 0) {
    for (const err of errors) {
      console.error('[ERROR] Edge ' + err.edge + ': ' + err.detail);
      console.error('Cause: Contract consistency violation');
      console.error('Action: Fix the edge contract and re-run graphify');
    }
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, edgeCount: edges.length }));
  process.exit(0);
}

if (require.main === module) main();
module.exports = { verifyGraphContracts, TYPES_REQUIRING_CONTRACTS, TYPES_OPTIONAL };
