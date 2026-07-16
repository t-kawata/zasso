#!/usr/bin/env node

/**
 * show-all-nodes-title-summary.js — Display title/summary of all nodes in a phase
 *
 * Used in split-to-tickets.md Step 4.2. Extracts and displays the title and summary
 * of matching nodes from GRAPH.json based on the nodeIds of the specified phase
 * in Tickets.json. The output serves as reference information for AI to generate
 * phase names and summaries.
 *
 * Usage:
 *   node show-all-nodes-title-summary.js --tickets=<PATH> --graph=<PATH> --phase=<phaseId>
 *
 * Output format:
 *   N0001: [§1 Purpose — Crate responsibility definition] Safely wrapping PJSUA from Rust...
 *   N0002: [§1a M20 implementation priority map] All implementation items for M20 supplement...
 *
 * Exit codes:
 *   0 = Success
 *   1 = Data error
 *   2 = Argument error
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Parse CLI arguments.
 */
function parseArguments(argv) {
  const parsed = {};
  for (const arg of argv) {
    const match = arg.match(/^--(.+?)=(.+)$/);
    if (match) {
      parsed[match[1]] = match[2];
    }
  }
  if (!parsed.tickets || !parsed.graph || !parsed.phase) {
    console.error('[ERROR] Usage: node show-all-nodes-title-summary.js --tickets=<PATH> --graph=<PATH> --phase=<phaseId>');
    process.exit(2);
  }
  return parsed;
}

/**
 * Get nodeIds for the specified phase.
 */
function getPhaseNodeIds(ticketsData, phaseId) {
  const phases = ticketsData.phases || [];
  const phase = phases.find(function(p) {
    return p.name === phaseId || 'P' + p.id === phaseId || String(p.id) === phaseId.replace('P', '');
  });
  if (!phase) {
    console.error('[ERROR] Phase not found: ' + phaseId);
    process.exit(1);
  }
  return phase.nodeIds || [];
}

/**
 * Main processing.
 */
function main() {
  const args = parseArguments(process.argv.slice(2));

  const ticketsData = JSON.parse(fs.readFileSync(path.resolve(args.tickets), 'utf8'));
  const graphData = JSON.parse(fs.readFileSync(path.resolve(args.graph), 'utf8'));
  const nodes = graphData.nodes || [];
  const nodeMap = {};
  for (const node of nodes) {
    nodeMap[node.id] = node;
  }

  const nodeIds = getPhaseNodeIds(ticketsData, args.phase);
  if (nodeIds.length === 0) {
    return; // Empty output, exit 0
  }

  for (const nid of nodeIds) {
    const node = nodeMap[nid];
    if (!node) {
      console.error('[ERROR] Node not found in GRAPH.json: ' + nid);
      process.exit(1);
    }
    const title = node.title || '(no title)';
    const summary = node.summary || '(no summary)';
    console.log(nid + ': [' + title + '] ' + summary);
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseArguments, getPhaseNodeIds };
