#!/usr/bin/env node

/**
 * dump-ticket-graph-commands.js — Append Tickets.json nodeIDs as spec commands
 *
 * Read the nodeIDs field set in each ticket of Tickets.json,
 * generate corresponding query.js commands and append them to the spec file.
 *
 * CLI: dump-ticket-graph-commands.js --tickets=<path> --graph=<path> --source=<path>
 *
 * If the graph file does not exist, append a "graph file not found" message.
 * Skip tickets without nodeIDs.
 */

const fs = require('fs');
const path = require('path');
const { resolveSpecPath } = require('../lib/resolve-spec-path');

// ============================================================
// Constants
// ============================================================

/** CLI argument prefix for Tickets.json path */
const TICKETS_PATH_ARG_PREFIX = '--tickets=';

/** CLI argument prefix for graph file path */
const GRAPH_PATH_ARG_PREFIX = '--graph=';

/** CLI argument prefix for source file path */
const SOURCE_PATH_ARG_PREFIX = '--source=';

/** Success exit code */
const EXIT_SUCCESS = 0;

/** Failure exit code */
const EXIT_FAILURE = 1;

/** Relative path to the scripts directory */
const SCRIPTS_DIR = '.claude/scripts/rfc-graph';

/** Default number of search hops */
const DEFAULT_HOPS = 3;

/** Message when graph is absent */
const NO_GRAPH_MESSAGE = 'Graph file not found. Run /graphify-rfc first to generate the graph.';

/** Section heading */
const SECTION_HEADING = '### RFC Design Graph Structure Exploration Commands';

// ============================================================
// Command-line argument parsing
// ============================================================

/**
 * Parse command-line arguments.
 *
 * @param {string[]} [testArgs] — Test argument array (defaults to process.argv)
 * @returns {{ ticketsPath: string, graphPath: string, sourcePath: string }}
 * @throws {Error} If arguments are invalid
 */
function parseArguments(testArgs) {
  const args = testArgs || process.argv.slice(2);

  // --help option
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    printUsage();
    process.exit(EXIT_SUCCESS);
  }

  // Three arguments are required
  if (args.length < 3) {
    throw new Error(
      'Insufficient arguments.\n' +
      '  Usage: dump-ticket-graph-commands.js --tickets=<path> --graph=<path> --source=<path>'
    );
  }

  // Parse --tickets=<path>
  const ticketsFlag = args[0];
  if (!ticketsFlag.startsWith(TICKETS_PATH_ARG_PREFIX)) {
    throw new Error(
      'The first argument must be --tickets=<path>.\n' +
      `  Actual value: ${ticketsFlag}`
    );
  }
  const ticketsPath = ticketsFlag.slice(TICKETS_PATH_ARG_PREFIX.length);
  if (!ticketsPath) {
    throw new Error('--tickets=<path> <path> is empty.');
  }

  // Parse --graph=<path>
  const graphFlag = args[1];
  if (!graphFlag.startsWith(GRAPH_PATH_ARG_PREFIX)) {
    throw new Error(
      'The second argument must be --graph=<path>.\n' +
      `  Actual value: ${graphFlag}`
    );
  }
  const graphPath = graphFlag.slice(GRAPH_PATH_ARG_PREFIX.length);
  if (!graphPath) {
    throw new Error('--graph=<path> <path> is empty.');
  }

  // Parse --source=<path>
  const sourceFlag = args[2];
  if (!sourceFlag.startsWith(SOURCE_PATH_ARG_PREFIX)) {
    throw new Error(
      'The third argument must be --source=<path>.\n' +
      `  Actual value: ${sourceFlag}`
    );
  }
  const sourcePath = sourceFlag.slice(SOURCE_PATH_ARG_PREFIX.length);
  if (!sourcePath) {
    throw new Error('--source=<path> <path> is empty.');
  }

  // Check for excess arguments
  if (args.length > 3) {
    throw new Error(
      'Excess arguments.\n' +
      '  Usage: dump-ticket-graph-commands.js --tickets=<path> --graph=<path> --source=<path>'
    );
  }

  return { ticketsPath, graphPath, sourcePath };
}

// ============================================================
// File loading
// ============================================================

/**
 * Load Tickets.json.
 *
 * @param {string} ticketsPath — Path to Tickets.json
 * @returns {Object} Parsed Tickets.json data
 * @throws {Error} If file reading or JSON parsing fails
 */
function loadTickets(ticketsPath) {
  if (!fs.existsSync(ticketsPath)) {
    throw new Error(
      `Tickets.json not found: ${ticketsPath}`
    );
  }

  let raw;
  try {
    raw = fs.readFileSync(ticketsPath, 'utf8');
  } catch (readError) {
    throw new Error(
      `Tickets.json failed to load: ${readError.message}`
    );
  }

  let tickets;
  try {
    tickets = JSON.parse(raw);
  } catch (parseError) {
    throw new Error(
      `Tickets.json JSON parse failed: ${parseError.message}`
    );
  }

  return tickets;
}

// ============================================================
// Data collection (pure functions)
// ============================================================

/**
 * Collect nodeIDs from all tickets.
 *
 * Only collects when nodeIDs exists and is a non-empty array.
 * Skip tickets without nodeIDs or with empty arrays.
 *
 * @param {Object} tickets — Tickets.json data ({ phases: [...], tickets: [...] } format)
 * @returns {Array<{ ticketKey: string, nodeIds: string[] }>} NodeIDs per ticket
 */
function collectNodeIds(tickets) {
  const result = [];

  // Iterate over tickets arrays within the phases array
  const phases = tickets.phases || [];
  for (const phase of phases) {
    const phaseTickets = phase.tickets || [];
    for (const ticket of phaseTickets) {
      const nodeIds = ticket.nodeIDs;
      if (Array.isArray(nodeIds) && nodeIds.length > 0) {
        const ticketKey = `P${phase.phaseId}-${ticket.id}`;
        result.push({ ticketKey, nodeIds });
      }
    }
  }

  return result;
}

/**
 * Check whether the graph file exists and validate node ID presence.
 *
 * @param {string} graphPath — Path to the graph file
 * @returns {boolean} Whether the graph file exists
 */
function graphExists(graphPath) {
  return fs.existsSync(graphPath);
}

/**
 * Generate a query.js command string.
 *
 * @param {string} nodeId — Node ID
 * @param {Object} nodeTitleMap — Mapping of node ID to title
 * @param {string} graphPath — Path to the graph file
 * @param {string} sourcePath — Path to the source file
 * @returns {string} query.js command string
 */
function generateCommand(nodeId, nodeTitleMap, graphPath, sourcePath) {
  const title = nodeTitleMap[nodeId] || '';
  const titleSuffix = title ? ` (${title})` : '';
  const graphFileName = path.basename(graphPath);
  const sourceFileName = path.basename(sourcePath);

  return `- ${nodeId}${titleSuffix} → \`node ${SCRIPTS_DIR}/query.js --graph=${graphFileName} --source=${sourceFileName} --id=${nodeId} --hops=${DEFAULT_HOPS}\``;
}

/**
 * Build a mapping of node ID to title from the graph data.
 *
 * @param {Object} graph — Parsed graph data
 * @returns {Object<string, string>} Mapping of node ID to title
 */
function buildNodeTitleMap(graph) {
  const map = {};
  if (Array.isArray(graph.nodes)) {
    for (const node of graph.nodes) {
      map[node.id] = node.title || '';
    }
  }
  return map;
}

/**
 * Generate the content of the "RFC design graph structure exploration commands" section.
 *
 * @param {Array<{ ticketKey: string, nodeIds: string[], commands: string[] }>} results — Results per ticket
 * @param {string} graphFileName — Graph file name
 * @returns {string} Full section string
 */
function formatSection(results, graphFileName) {
  const lines = [SECTION_HEADING, '', `Graph file: ${graphFileName}`, ''];

  for (const result of results) {
    lines.push(`Nodes integrated in ticket ${result.ticketKey}:`);
    for (const command of result.commands) {
      lines.push(command);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate the message section for when the graph is absent.
 *
 * @returns {string} Full section string
 */
function formatNoGraphSection() {
  return [
    SECTION_HEADING,
    '',
    NO_GRAPH_MESSAGE,
    '',
  ].join('\n');
}

// ============================================================
// File writing
// ============================================================

// resolveSpecPath is provided by the shared module scripts/lib/resolve-spec-path.js.
// It performs referenceSection-based path resolution to prevent speculative mis-writes.

/**
 * Append a section to the spec file (idempotent).
 *
 * Skips if the same section heading already exists in the spec file.
 *
 * @param {string} specPath — Path to the spec file
 * @param {string} section — Section string to append
 * @returns {boolean} true if appended, false if skipped
 */
function appendToSpec(specPath, section) {
  const existingContent = fs.readFileSync(specPath, 'utf8');

  // Idempotency: skip if the same section heading already exists
  const sectionHeading = section.split('\n')[0].trim();
  if (existingContent.includes(sectionHeading)) {
    return false;
  }

  const newContent = existingContent.trimEnd() + '\n\n' + section + '\n';
  fs.writeFileSync(specPath, newContent, 'utf8');
  return true;
}

// ============================================================
// Help display
// ============================================================

/**
 * Display usage information.
 */
function printUsage() {
  console.log(
    'dump-ticket-graph-commands.js — Append Tickets.json nodeIDs as spec commands\n' +
    '\n' +
    'Usage:\n' +
    '  dump-ticket-graph-commands.js --tickets=<path> --graph=<path> --source=<path>\n' +
    '\n' +
    'Options:\n' +
    '  --tickets=<path>  Path to Tickets.json\n' +
    '  --graph=<path>    Path to the graph file\n' +
    '  --source=<path>   Path to the source file\n' +
    '  --help, -h        Display this help\n' +
    '\n' +
    'Exit codes:\n' +
    '  0  Normal completion\n' +
    '  1  Argument error or file load error\n'
  );
}

// ============================================================
// Entry point
// ============================================================

/**
 * main — CLI entry point
 *
 * 1. Parse arguments
 * 2. Load Tickets.json
 * 3. Collect nodeIDs
 * 4. Check graph existence
 * 5. Generate commands (if graph exists) or generate absence message
 * 6. Output results to stdout
 *
 * All errors are output to stderr with a three-line template and exit code 1.
 * No file modifications are performed (only stdout output).
 */
function main() {
  let ticketsPath, graphPath, sourcePath;

  try {
    const parsed = parseArguments();
    ticketsPath = parsed.ticketsPath;
    graphPath = parsed.graphPath;
    sourcePath = parsed.sourcePath;
  } catch (parseError) {
    process.stderr.write(
      `[ERROR] Argument parse failed.\n` +
      `Cause: ${parseError.message}\n` +
      `Action: Re-run with correct arguments.\n`
    );
    process.exit(EXIT_FAILURE);
  }

  let tickets;
  try {
    tickets = loadTickets(ticketsPath);
  } catch (ticketsError) {
    process.stderr.write(
      `[ERROR] Tickets.json failed to load.\n` +
      `Cause: ${ticketsError.message}\n` +
      `Action: Specify a valid Tickets.json via --tickets=<path>.\n`
    );
    process.exit(EXIT_FAILURE);
  }

  const nodeIdEntries = collectNodeIds(tickets);

  // If no nodeIDs found, exit normally without output
  if (nodeIdEntries.length === 0) {
    process.exit(EXIT_SUCCESS);
  }

  const graphFileName = path.basename(graphPath);
  const graphFileExists = graphExists(graphPath);

  if (graphFileExists) {
    // Graph exists: read node info and generate commands
    let graph;
    try {
      const raw = fs.readFileSync(graphPath, 'utf8');
      graph = JSON.parse(raw);
    } catch (graphError) {
      process.stderr.write(
        `[ERROR] Graph file failed to load.\n` +
        `Cause: ${graphError.message}\n` +
        `Action: Specify a valid graph file via --graph=<path>.\n`
      );
      process.exit(EXIT_FAILURE);
    }

    const nodeTitleMap = buildNodeTitleMap(graph);

    // Generate commands for each ticket entry
    const results = [];
    for (const entry of nodeIdEntries) {
      const commands = entry.nodeIds.map(nodeId =>
        generateCommand(nodeId, nodeTitleMap, graphPath, sourcePath)
      );
      results.push({
        ticketKey: entry.ticketKey,
        nodeIds: entry.nodeIds,
        commands,
      });
    }

    const section = formatSection(results, graphFileName);
    console.log(section);

    // Append to each ticket's spec if it exists
    const writtenSpecs = [];
    for (const entry of nodeIdEntries) {
      const specPath = resolveSpecPath(entry.ticketKey, ticketsPath);
      if (specPath) {
        try {
          const sectionForTicket = formatSection(
            [results.find(r => r.ticketKey === entry.ticketKey)],
            graphFileName
          );
          appendToSpec(specPath, sectionForTicket);
          writtenSpecs.push(entry.ticketKey);
        } catch {
          // Skip if spec does not exist (non-fatal)
        }
      }
    }

    if (writtenSpecs.length > 0) {
      console.error(`Appended to spec: ${writtenSpecs.join(', ')}`);
    }
  } else {
    // Graph does not exist: output absence message
    const section = formatNoGraphSection();
    console.log(section);
  }

  process.exit(EXIT_SUCCESS);
}

// Only call main when executed as CLI
if (require.main === module) {
  main();
}

module.exports = {
  parseArguments,
  loadTickets,
  collectNodeIds,
  generateCommand,
  buildNodeTitleMap,
  formatSection,
  formatNoGraphSection,
  appendToSpec,
  printUsage,
};
