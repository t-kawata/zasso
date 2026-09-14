#!/usr/bin/env node

/**
 * validate-edge-contracts.js — Validate all edge contracts in GRAPH.json
 *
 * Usage: node validate-edge-contracts.js --graph=<path>
 *
 * Exits 0 if all edges have valid contracts, 1 on failure.
 * Outputs 3-line error template ([ERROR] / Cause: / Action:) on stderr for each violation.
 *
 * [::TICKET::] PX-66: Schema Foundation — edge contracts validation
 */

const fs = require('fs');
const path = require('path');

const CONTRACT_ID_RE = /^C\d{3}$/;

/**
 * Parse CLI arguments
 * @returns {{ graphPath: string }}
 */
// [::TICKET::] PX-66, PX-67, PX-68, PX-69, PX-70, PX-71 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-66|PX-67|PX-68|PX-69|PX-70|PX-71) --for-spec --no-implementation-order`.
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
 * Validate all edge contracts in a graph object
 * @param {object} graph — Parsed GRAPH.json content
 * @returns {Array<{edge: string, detail: string}>} — List of validation errors
 */
// [::TICKET::] PX-66, PX-67, PX-68, PX-69, PX-70, PX-71 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-66|PX-67|PX-68|PX-69|PX-70|PX-71) --for-spec --no-implementation-order`.
function validateEdgeContracts(graph) {
  const errors = [];
  if (!graph.edges || !Array.isArray(graph.edges)) {
    errors.push({ edge: '(root)', detail: 'edges array is missing or not an array' });
    return errors;
  }
  const seenIds = {};
  for (let i = 0; i < graph.edges.length; i++) {
    const e = graph.edges[i];
    const prefix = 'edges[' + i + '](' + (e.from || '?') + '→' + (e.to || '?') + ')';

    // Check contracts array existence
    if (!e.contracts) {
      errors.push({ edge: prefix, detail: 'contracts is missing' });
      continue;
    }
    if (!Array.isArray(e.contracts)) {
      errors.push({ edge: prefix, detail: 'contracts must be an array' });
      continue;
    }
    if (e.contracts.length === 0) {
      errors.push({ edge: prefix, detail: 'contracts array is empty (minItems:1)' });
      continue;
    }

    // Validate each contract in the array
    for (let j = 0; j < e.contracts.length; j++) {
      const c = e.contracts[j];
      const cp = prefix + '.contracts[' + j + ']';
      if (!c || typeof c !== 'object' || Array.isArray(c)) {
        errors.push({ edge: cp, detail: 'contract must be an object' });
        continue;
      }

      // Required string fields
      if (typeof c.precondition !== 'string' || c.precondition.length < 1) {
        errors.push({ edge: cp, detail: 'precondition must be non-empty string' });
      }
      if (typeof c.postcondition !== 'string' || c.postcondition.length < 1) {
        errors.push({ edge: cp, detail: 'postcondition must be non-empty string' });
      }
      if (typeof c.invariant !== 'string' || c.invariant.length < 1) {
        errors.push({ edge: cp, detail: 'invariant must be non-empty string' });
      }

      // Contract ID format and uniqueness check
      if (c.id !== undefined) {
        if (typeof c.id !== 'string' || !CONTRACT_ID_RE.test(c.id)) {
          errors.push({ edge: cp, detail: 'id "' + String(c.id) + '" must match C000 format' });
        } else if (seenIds[c.id]) {
          errors.push({ edge: cp, detail: 'duplicate contract id "' + c.id + '"' });
        } else {
          seenIds[c.id] = true;
        }
      }
    }
  }
  return errors;
}

// [::TICKET::] PX-66, PX-67, PX-68, PX-69, PX-70, PX-71 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-66|PX-67|PX-68|PX-69|PX-70|PX-71) --for-spec --no-implementation-order`.
function main() {
  const { graphPath } = parseArgs();
  if (!fs.existsSync(graphPath)) {
    console.error('[ERROR] Graph file not found: ' + graphPath);
    console.error('Cause: File does not exist at the specified path');
    console.error('Action: Verify the graph path and re-run');
    process.exit(1);
  }

  let graph;
  try {
    graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  } catch (e) {
    console.error('[ERROR] Failed to parse graph JSON: ' + e.message);
    console.error('Cause: Invalid JSON at ' + graphPath);
    console.error('Action: Fix the JSON syntax and re-run');
    process.exit(1);
  }

  const errors = validateEdgeContracts(graph);
  if (errors.length > 0) {
    for (const err of errors) {
      console.error('[ERROR] Edge ' + err.edge + ': ' + err.detail);
      console.error('Cause: Contract validation failed');
      console.error('Action: Fix the contract in the specified edge and re-run graphify');
    }
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, edgeCount: graph.edges.length }));
  process.exit(0);
}

if (require.main === module) main();
module.exports = { validateEdgeContracts };
