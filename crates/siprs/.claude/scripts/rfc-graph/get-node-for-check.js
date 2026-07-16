#!/usr/bin/env node

/**
 * get-node-for-check.js — Display individual node quality check
 *
 * Shows the output of query.js saved in the _quality/ directory,
 * appending three check items at the end.
 *
 * CLI: get-node-for-check.js <nodeId>
 *   nodeId: e.g. N0001
 *
 * Exit codes:
 *   0  Normal termination
 *   1  Error termination (missing arguments / file not found)
 */

const fs = require("fs");
const path = require("path");

/** Path to the _quality directory (relative to the current working directory) */
const QUALITY_DIR = path.resolve(process.cwd(), "_quality");

/** Check items template */
const CHECK_ITEMS = `
# Check Items
1. Whether relationships with other nodes correctly reflect the design document description
2. Whether each node's content covers the corresponding section of the design document completely
3. Whether there is any missing information that /formulate-tickets and /formulate-tickets-for-next need when decomposing tickets from this graph
`;

/**
 * Print an error message in a three-part template and exit with code 1
 *
 * @param {string} message — what happened
 * @param {string} cause — why it happened
 * @param {string} action — next action to take
 */
function printError(message, cause, action) {
  process.stderr.write(
    `[ERROR] ${message}\n` +
    `Cause: ${cause}\n` +
    `Action: ${action}\n`
  );
  process.exit(1);
}

/**
 * Main entry point
 *
 * 1. Get node ID from arguments
 * 2. Read _quality/<nodeId>.md
 * 3. Display content and check items
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printError(
      "Node ID not specified.",
      "Executed without arguments.",
      "Specify a node ID like: get-node-for-check.js N0001"
    );
  }

  const nodeId = args[0];

  // Validate node ID format (Nxxxx)
  if (!/^N[0-9]{4}$/.test(nodeId)) {
    printError(
      `Invalid node ID format: ${nodeId}`,
      "Must follow Nxxxx format (e.g. N0001).",
      "Specify a valid node ID."
    );
  }

  const filePath = path.join(QUALITY_DIR, `${nodeId}.md`);

  if (!fs.existsSync(filePath)) {
    printError(
      `Quality check file not found: ${filePath}`,
      `The file _quality/${nodeId}.md for node ID ${nodeId} does not exist.`,
      "Run query-all-nodes.sh first to generate the _quality/ directory."
    );
  }

  const content = fs.readFileSync(filePath, "utf8");

  // Display content
  process.stdout.write(content);

  // Add a blank line if content does not end with one
  if (!content.endsWith("\n")) {
    process.stdout.write("\n");
  }

  // Append check items
  process.stdout.write(CHECK_ITEMS);
}

if (require.main === module) {
  main();
}

module.exports = { CHECK_ITEMS, QUALITY_DIR };
