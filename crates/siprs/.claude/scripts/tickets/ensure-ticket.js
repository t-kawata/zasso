#!/usr/bin/env node

/**
 * ensure-ticket.js — Create a ticket when one does not exist (does not create spec file)
 *
 * Manual execution by AI in /make-ticket Step 2 (decision branch) when ticket creation
 * is requested from prior conversation. Internally calls add-ticket.js to add the ticket
 * to Tickets.json, then runs show-ticket-context.js to display results.
 *
 * Does not create a spec file. The ticket's specPath is determined by naming convention;
 * actual spec file content is written in Step 6 (show-ticket-context.js --for-spec).
 *
 * Required args: --ticket-key, --title
 * Options (reflect conversation information onto the ticket):
 *   --background="..."         background/purpose (string)
 *   --scope='["item1","..."]'  implementation scope (JSON array)
 *   --test-unit='["..."]'        test plan: unit tests (JSON array)
 *   --test-integration='["..."]' test plan: integration tests (JSON array)
 *   --test-exceptions='["..."]'  test plan: untestable items (JSON array)
 *   --default-files='["..."]'  implementation target files (JSON array)
 *   --acceptance-criteria='["..."]'  completion criteria (JSON array)
 *   --contracts='[{...}]'           optional contracts (JSON array of C000-format objects)
 *   --notes="..."              supplementary information (string)
 *
 * CLI: ensure-ticket.js --ticket-key=<PX-{id}> --title="..." [options] [--tickets=<Tickets.json>]
 */

const fs = require('fs');
const path = require('path');
// [::TICKET::] PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-231 --for-spec --no-implementation-order`.
const { toHomeRelative } = require('../lib/path-utils');
const { execFileSync } = require('child_process');

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

/** Extract a numeric ID from a ticket key */
function extractTicketId(ticketKey) {
  const match = ticketKey.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Derive the spec file path for a ticket key.
 *
 * The specs directory sits beside Tickets.json, and every spec in it is named by its
 * ticket key. Both facts are the ones `lib/resolve-spec-path.js` already applies for the
 * exporters that read a written spec, so this function applies them rather than deriving
 * a second address: a private spelling here is what put a generation of specs under a
 * `tickets/specs/` directory nothing else looked in, named after a slug of the
 * Tickets.json path rather than after the ticket.
 *
 * @param {string} ticketKey - "P{phaseId}-{ticketId}" or "PX-{ticketId}"
 * @param {string} ticketsPath - path to Tickets.json
 * @returns {string|null} absolute spec path, or null when the key carries no ticket id
 */
function resolveSpecPath(ticketKey, ticketsPath) {
  if (extractTicketId(ticketKey) === null) return null;
  const specsDir = path.resolve(path.dirname(path.resolve(ticketsPath)), 'specs');
  return path.resolve(specsDir, ticketKey + '.md');
}

/** Parse command-line arguments */
// [::TICKET::] PX-73 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-73 --for-spec --no-implementation-order`.
function parseArgs(testArgs) {
  const args = testArgs || process.argv.slice(2);
  let ticketsPath = '';
  let ticketKey = '';
  let title = '';
  let background = '';
  let scope = null;
  let testUnit = null;
  let testIntegration = null;
  let testExceptions = null;
  let default_files = null;
  let acceptanceCriteria = null;
  let contracts = null;
  let notes = '';
  for (const arg of args) {
    if (arg.startsWith('--tickets=')) {
      ticketsPath = arg.slice('--tickets='.length);
    } else if (arg.startsWith('--ticket-key=')) {
      ticketKey = arg.slice('--ticket-key='.length);
    } else if (arg.startsWith('--title=')) {
      title = arg.slice('--title='.length);
    } else if (arg.startsWith('--background=')) {
      background = arg.slice('--background='.length);
    } else if (arg.startsWith('--scope=')) {
      scope = JSON.parse(arg.slice('--scope='.length));
    } else if (arg.startsWith('--test-unit=')) {
      testUnit = JSON.parse(arg.slice('--test-unit='.length));
    } else if (arg.startsWith('--test-integration=')) {
      testIntegration = JSON.parse(arg.slice('--test-integration='.length));
    } else if (arg.startsWith('--test-exceptions=')) {
      testExceptions = JSON.parse(arg.slice('--test-exceptions='.length));
    } else if (arg.startsWith('--default-files=')) {
      default_files = JSON.parse(arg.slice('--default-files='.length));
    } else if (arg.startsWith('--acceptance-criteria=')) {
      acceptanceCriteria = JSON.parse(arg.slice('--acceptance-criteria='.length));
    } else if (arg.startsWith('--contracts=')) {
      contracts = JSON.parse(arg.slice('--contracts='.length));
    } else if (arg.startsWith('--notes=')) {
      notes = arg.slice('--notes='.length);
    }
  }
  if (!ticketsPath) {
    ticketsPath = path.resolve('Tickets.json');
  } else {
    ticketsPath = path.resolve(ticketsPath);
  }
  return { ticketsPath, ticketKey, title, background, scope, testUnit, testIntegration, testExceptions, default_files, acceptanceCriteria, contracts, notes };
}

// [::TICKET::] PX-73, PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-73|PX-231) --for-spec --no-implementation-order`.
function main() {
  const { ticketsPath, ticketKey, title, background, scope, testUnit, testIntegration, testExceptions, default_files, acceptanceCriteria, contracts, notes } = parseArgs();

  if (!ticketKey) {
    console.error('Error: --ticket-key is required.');
    process.exit(EXIT_FAILURE);
  }
  if (!title) {
    console.error('Error: --title is required.');
    process.exit(EXIT_FAILURE);
  }

  // Derive spec path (do not create file)
  const specPath = resolveSpecPath(ticketKey, ticketsPath);

  // Add ticket to PX phase via add-ticket.js
  const addTicketScript = path.join(__dirname, 'add-ticket.js');
  if (!fs.existsSync(addTicketScript)) {
    console.error('Error: add-ticket.js not found.');
    process.exit(EXIT_FAILURE);
  }
  let addResult;
  try {
    const ticketData = { title };
    // Stored home-relative: the record is read on machines that do not have this home,
    // and the reader expands it against whichever home is reading.
    if (specPath) ticketData.specPath = toHomeRelative(specPath);
    if (background) ticketData.background = background;
    if (scope) ticketData.scope = scope;
    if (testUnit) ticketData.testUnit = testUnit;
    if (testIntegration) ticketData.testIntegration = testIntegration;
    if (testExceptions) ticketData.testExceptions = testExceptions;
    if (default_files) ticketData.default_files = default_files;
    if (acceptanceCriteria) ticketData.acceptanceCriteria = acceptanceCriteria;
    if (contracts) ticketData.contracts = contracts;
    if (notes) ticketData.notes = notes;
    const input = JSON.stringify(ticketData);
    const stdout = execFileSync(process.execPath, [addTicketScript, ticketsPath, 'PX'], {
      encoding: 'utf8',
      input,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    addResult = JSON.parse(stdout);
  } catch (e) {
    console.error(`add-ticket.js execution failed: ${e.message}`);
    process.exit(EXIT_FAILURE);
  }
  if (!addResult.success) {
    console.error(`add-ticket.js failed: ${addResult.error || 'unknown'}`);
    process.exit(EXIT_FAILURE);
  }
  const actualTicketKey = addResult.ticketKey || ticketKey;

  // Run show-ticket-context.js to display results
  const showScript = path.join(__dirname, 'show-ticket-context.js');
  if (!fs.existsSync(showScript)) {
    console.error('Error: show-ticket-context.js not found.');
    process.exit(EXIT_FAILURE);
  }
  try {
    execFileSync(process.execPath, [showScript, `--ticket-key=${actualTicketKey}`, `--tickets=${ticketsPath}`], {
      encoding: 'utf8',
      stdio: ['pipe', 'inherit', 'pipe'],
    });
  } catch (e) {
    console.error(`show-ticket-context.js execution failed: ${e.message}`);
    process.exit(EXIT_FAILURE);
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, main, resolveSpecPath, extractTicketId };
