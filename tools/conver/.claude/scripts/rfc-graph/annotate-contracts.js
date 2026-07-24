#!/usr/bin/env node

/**
 * annotate-contracts.js — Output all edges with context for AI contract annotation
 *
 * Usage: node annotate-contracts.js <graph-path>
 *
 * Reads GRAPH.json and outputs each edge with its from/to node kind/summary
 * in Markdown format, allowing AI to annotate contracts (precondition/postcondition/invariant).
 *
 * [::TICKET::] PX-67: annotate-contracts — Edge contract annotation scripts
 */

const fs = require('fs');
const path = require('path');

/**
 * Generate Markdown output for edge contract annotation guide
 *
 * @param {object} graph — Parsed graph JSON
 * @returns {string} Markdown string
 */
// [::TICKET::] PX-67, PX-68, PX-69, PX-70, PX-71 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-67|PX-68|PX-69|PX-70|PX-71) --for-spec --no-implementation-order`.
function generateMarkdown(graph) {
  const nodeMap = {};
  for (const n of graph.nodes) nodeMap[n.id] = n;

  let md = '# Edge Contract Annotation Guide\n\n';
  for (let i = 0; i < graph.edges.length; i++) {
    const e = graph.edges[i];
    const fromNode = nodeMap[e.from] || {};
    const toNode = nodeMap[e.to] || {};

    md += '## Edge ' + (i + 1) + ': ' + e.from + ' → ' + e.to + ' (' + e.type + ')\n';
    md += '- **Source node (' + e.from + ')**: kind=' + (fromNode.kind || '?') + ', title="' + (fromNode.title || '?') + '"\n';
    md += '  Summary: ' + (fromNode.summary || '(none)') + '\n';
    md += '- **Target node (' + e.to + ')**: kind=' + (toNode.kind || '?') + ', title="' + (toNode.title || '?') + '"\n';
    md += '  Summary: ' + (toNode.summary || '(none)') + '\n';
    md += '- **Strength**: ' + (e.attributes ? e.attributes.strength || 'hard' : 'hard')
      + ', **Bidirectional**: ' + (e.attributes ? e.attributes.bidirectional || false : false) + '\n';
    if (e.attributes && e.attributes.note) md += '- **Existing note**: ' + e.attributes.note + '\n';

    md += '\n  **Proposed contracts (fill in below):**\n';
    md += '  ```json\n';
    md += '  [{"id":"C' + String(i + 1).padStart(3, '0') + '","precondition":"...","postcondition":"...","invariant":"..."}]\n';
    md += '  ```\n\n';
  }
  return md;
}

// [::TICKET::] PX-67, PX-68, PX-69, PX-70, PX-71 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-67|PX-68|PX-69|PX-70|PX-71) --for-spec --no-implementation-order`.
function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('[ERROR] Missing graph path argument');
    console.error('Cause: No argument provided');
    console.error('Action: Run with: node annotate-contracts.js <path-to-GRAPH.json>');
    process.exit(1);
  }
  const graphPath = path.resolve(arg);
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

  const md = generateMarkdown(graph);
  console.log(md);
}

if (require.main === module) main();
module.exports = { generateMarkdown };
