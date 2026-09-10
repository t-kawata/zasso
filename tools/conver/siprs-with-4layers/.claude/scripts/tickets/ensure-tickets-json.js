#!/usr/bin/env node

/**
 * ensure-tickets-json.js — Tickets.json existence guarantee script
 *
 * Checks for Tickets.json existence and auto-creates template + PX phase if absent.
 * Output is mechanically parseable JSON (with instruction field).
 *
 * CLI: ensure-tickets-json.js --dir=<path>
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

/**
 * Parse command-line arguments
 */
function parseArguments(testArgs) {
  const args = testArgs || process.argv.slice(2);
  const dirFlag = args.find(a => a.startsWith('--dir='));
  const dir = dirFlag ? dirFlag.slice('--dir='.length) : '.';
  return path.resolve(dir);
}

/**
 * Execute a script in a child process
 */
function runScript(scriptName, scriptArgs) {
  const scriptPath = path.join(__dirname, scriptName);
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`${scriptName} not found: ${scriptPath}`);
  }
  return execFileSync(process.execPath, [scriptPath, ...scriptArgs], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/**
 * Main processing
 */
function main() {
  const dir = parseArguments();
  const ticketsPath = path.join(dir, 'Tickets.json');
  const existed = fs.existsSync(ticketsPath);

  if (existed) {
    console.log(JSON.stringify({
      success: true,
      path: ticketsPath,
      existed: true,
      instruction: 'Tickets.json already exists. Add tickets with add-ticket.js and run resolve-ticket-context.js.',
    }));
    process.exit(EXIT_SUCCESS);
  }

  // Tickets.json does not exist: create template + PX phase
  try {
    runScript('write-tickets-json-template.js', [
      ticketsPath,
      JSON.stringify({
        title: 'Tickets',
        source: '',
        generatedAt: new Date().toISOString().slice(0, 10),
      }),
    ]);
  } catch (e) {
    process.stderr.write(`[ERROR] write-tickets-json-template.js execution failed.\nCause: ${e.message}\n`);
    process.exit(EXIT_FAILURE);
  }

  try {
    runScript('add-px-phase.js', [ticketsPath]);
  } catch (e) {
    process.stderr.write(`[ERROR] add-px-phase.js execution failed.\nCause: ${e.message}\n`);
    process.exit(EXIT_FAILURE);
  }

  console.log(JSON.stringify({
    success: true,
    path: ticketsPath,
    existed: false,
    instruction: 'Tickets.json created. Add tickets with add-ticket.js and then run resolve-ticket-context.js.',
  }));
  process.exit(EXIT_SUCCESS);
}

if (require.main === module) {
  main();
}

module.exports = { parseArguments, main };
