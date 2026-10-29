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
// [::TICKET::] PX-67, PX-68, PX-69, PX-70, PX-71, PX-332 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-67|PX-68|PX-69|PX-70|PX-71|PX-332) --for-spec --no-implementation-order`.
function generateMarkdown(graph) {
  const nodeMap = {};
  for (const node of graph.nodes) {
    nodeMap[node.id] = node;
  }

  let md = '# Edge Contract Annotation Guide\n\n';
  for (let i = 0; i < graph.edges.length; i++) {
    const edge = graph.edges[i];
    const fromNode = nodeMap[edge.from] || {};
    const toNode = nodeMap[edge.to] || {};

    md += '## Edge ' + (i + 1) + ': ' + edge.from + ' → ' + edge.to + ' (' + edge.type + ')\n';
    md += '- **Source node (' + edge.from + ')**: kind=' + (fromNode.kind || '?') + ', title="' + (fromNode.title || '?') + '"\n';
    md += '  Summary: ' + (fromNode.summary || '(none)') + '\n';
    md += '- **Target node (' + edge.to + ')**: kind=' + (toNode.kind || '?') + ', title="' + (toNode.title || '?') + '"\n';
    md += '  Summary: ' + (toNode.summary || '(none)') + '\n';
    md += '- **Strength**: ' + (edge.attributes ? edge.attributes.strength || 'hard' : 'hard')
      + ', **Bidirectional**: ' + (edge.attributes ? edge.attributes.bidirectional || false : false) + '\n';
    if (edge.attributes && edge.attributes.note) md += '- **Existing note**: ' + edge.attributes.note + '\n';

    md += '\n  **Proposed contracts (fill in below):**\n';
    md += '  ```json\n';
    md += '  [{"id":"C' + String(i + 1).padStart(3, '0') + '","precondition":"...","postcondition":"...","invariant":"..."}]\n';
    md += '  ```\n\n';
  }
  return md;
}

// [::TICKET::] PX-67, PX-68, PX-69, PX-70, PX-71, PX-332 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-67|PX-68|PX-69|PX-70|PX-71|PX-332) --for-spec --no-implementation-order`.
function main() {
  const graphPath = process.argv[2];
  if (!graphPath) {
    console.error('[ERROR] Missing graph path argument');
    console.error('Cause: No argument provided');
    console.error('Action: Run with: node annotate-contracts.js <path-to-GRAPH.json>');
    process.exit(1);
  }
  const resolvedGraphPath = path.resolve(graphPath);
  if (!fs.existsSync(resolvedGraphPath)) {
    console.error('[ERROR] Graph file not found: ' + resolvedGraphPath);
    console.error('Cause: File does not exist at the specified path');
    console.error('Action: Verify the graph path and re-run');
    process.exit(1);
  }

  let graph;
  try {
    graph = JSON.parse(fs.readFileSync(resolvedGraphPath, 'utf8'));
  } catch (e) {
    console.error('[ERROR] Failed to parse graph JSON: ' + e.message);
    console.error('Cause: Invalid JSON at ' + resolvedGraphPath);
    console.error('Action: Fix the JSON syntax and re-run');
    process.exit(1);
  }

  const md = generateMarkdown(graph);
  process.stdout.write(md + '\n');
}

if (require.main === module) main();
module.exports = { generateMarkdown };
