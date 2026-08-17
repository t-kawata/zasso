#!/usr/bin/env node

/**
 * extract-toc-candidates.js — Extract heading candidates from graph nodes (Step 1)
 *
 * CLI: extract-toc-candidates.js --graph=<path>
 *
 * Produces [{level:number, title:string}] in document order. The level comes
 * from the first headingRefs entry, defaulting to 2 for nodes without refs.
 */

const { readGraphFile } = require('./validate-graph-arg.js');

/** CLI argument prefix specifying the graph file path */
const GRAPH_PATH_ARG_PREFIX = '--graph=';

/** Default heading level for nodes without headingRefs */
const DEFAULT_TOC_LEVEL = 2;

/**
 * Parse command line arguments.
 *
 * @param {string[]} [args] — Test argument array (defaults to process.argv when omitted)
 * @returns {{ graphPath: string }}
 * @throws {Error} If the argument syntax is invalid
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function parseArguments(args) {
  const argv = args || process.argv.slice(2);
  if (argv.length !== 1 || !argv[0].startsWith(GRAPH_PATH_ARG_PREFIX)) {
    throw new Error(`Usage: extract-toc-candidates.js ${GRAPH_PATH_ARG_PREFIX}<path>`);
  }
  const graphPath = argv[0].slice(GRAPH_PATH_ARG_PREFIX.length);
  if (!graphPath) {
    throw new Error('--graph=<path> value is empty.');
  }
  return { graphPath };
}

/**
 * Extract heading candidates from graph nodes in document order.
 *
 * @param {Object} graph — Schema-validated graph
 * @returns {Array<{ level: number, title: string }>} Heading candidates
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function extractTocCandidates(graph) {
  return (graph.nodes || [])
    .filter((node) => typeof node.title === 'string' && node.title.trim() !== '')
    .map((node) => ({
      level:
        Array.isArray(node.headingRefs) && node.headingRefs.length > 0
          ? node.headingRefs[0].heading
          : DEFAULT_TOC_LEVEL,
      title: node.title,
    }));
}

/**
 * main — CLI entry point.
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function main() {
  const { graphPath } = parseArguments();
  const graph = readGraphFile(graphPath);
  process.stdout.write(JSON.stringify(extractTocCandidates(graph)) + '\n');
  process.exit(0);
}

// Call main only when executed as CLI
if (require.main === module) {
  main();
}

module.exports = {
  parseArguments,
  extractTocCandidates,
  main,
  GRAPH_PATH_ARG_PREFIX,
  DEFAULT_TOC_LEVEL,
};
