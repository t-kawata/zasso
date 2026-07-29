#!/usr/bin/env node

/**
 * check-ticket-status.js — Step 0 gate for plan/start/review commands
 *
 * Validates that a ticket's current status in Tickets.json matches the
 * expected status for the given pipeline phase.
 *
 * Phase → expected status mapping:
 *   plan   → "made"    (make-ticket completed, plan pending)
 *   start  → "planned" (plan-ticket completed, start pending)
 *   review → "done"    (start-ticket completed, review pending)
 *
 * CLI:
 *   node check-ticket-status.js --ticket-key=P{phaseID}-{ticketID} --phase=plan|start|review
 *
 * Exit codes:
 *   0 — status matches expected → proceed with the command
 *   1 — status mismatch or error → block the command
 */

const fs = require("fs");
const path = require("path");
const { parseTicketKey } = require("../lib/validate-tickets");

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

/** Phase → expected status mapping */
const PHASE_EXPECTED_STATUS = {
  plan: "made",
  start: "planned",
  review: "done",
};

/** Valid phase values */
const VALID_PHASES = new Set(Object.keys(PHASE_EXPECTED_STATUS));

/**
 * Parse CLI arguments.
 * Supports both --key=value and --key value formats.
 * @returns {{ ticketKey: string, phase: string } | null}
 */
function parseArgs(testArgs) {
  const args = testArgs || process.argv.slice(2);
  let ticketKey = "";
  let phase = "";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    // Handle --key=value format
    if (arg.startsWith("--ticket-key=")) {
      ticketKey = arg.slice("--ticket-key=".length);
    } else if (arg.startsWith("--phase=")) {
      phase = arg.slice("--phase=".length);
    } else if (arg === "--ticket-key" && i + 1 < args.length) {
      // Handle --key value format
      ticketKey = args[i + 1];
      i++;
    } else if (arg === "--phase" && i + 1 < args.length) {
      phase = args[i + 1];
      i++;
    }
  }

  if (!ticketKey || !phase) return null;
  return { ticketKey, phase };
}

/**
 * Resolve Tickets.json path relative to the script cwd or conver project root.
 * Tries: 1) explicit --tickets flag, 2) cwd/Tickets.json, 3) cwd/../../Tickets.json
 */
function resolveTicketsPath() {
  // Check for --tickets flag in args first
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--tickets=")) {
      return path.resolve(arg.slice("--tickets=".length));
    }
    if (arg === "--tickets" && i + 1 < args.length) {
      return path.resolve(args[i + 1]);
    }
  }
  // Default: look in cwd
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "Tickets.json"),
    path.resolve(cwd, "..", "..", "Tickets.json"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(cwd, "Tickets.json");
}

/**
 * Read Tickets.json and find ticket by phaseId + ticketId.
 * @returns {{ status: string, title: string } | null}
 */
function findTicketInJson(ticketsPath, phaseId, ticketId) {
  if (!fs.existsSync(ticketsPath)) return null;
  const raw = fs.readFileSync(ticketsPath, "utf-8");
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  for (const phase of data.phases || []) {
    for (const ticket of phase.tickets || []) {
      if (ticket.phaseId === phaseId && ticket.id === ticketId) {
        return { status: ticket.status, title: ticket.title };
      }
    }
  }
  return null;
}

/**
 * Main entry point.
 */
function main() {
  const parsed = parseArgs();
  if (!parsed) {
    console.log(
      JSON.stringify({
        success: false,
        error:
          "Usage: node check-ticket-status.js --ticket-key=P{phaseID}-{ticketID} --phase=plan|start|review [--tickets=<path>]",
      }),
    );
    process.exit(EXIT_FAILURE);
  }

  const { ticketKey, phase } = parsed;

  // Validate phase
  if (!VALID_PHASES.has(phase)) {
    console.log(
      JSON.stringify({
        success: false,
        error: `Invalid phase "${phase}". Must be one of: ${Array.from(VALID_PHASES).join(", ")}`,
      }),
    );
    process.exit(EXIT_FAILURE);
  }

  const expectedStatus = PHASE_EXPECTED_STATUS[phase];

  // Parse ticket key
  const keyParts = parseTicketKey(ticketKey);
  if (!keyParts) {
    console.log(
      JSON.stringify({
        success: false,
        error: `Invalid ticket key "${ticketKey}". Use P{phaseID}-{ticketID} format (e.g. P0-1, PX-53).`,
      }),
    );
    process.exit(EXIT_FAILURE);
  }

  const { phaseId, ticketId } = keyParts;
  const ticketsPath = resolveTicketsPath();

  if (!fs.existsSync(ticketsPath)) {
    console.log(
      JSON.stringify({
        success: false,
        error: `Tickets.json not found at: ${ticketsPath}`,
      }),
    );
    process.exit(EXIT_FAILURE);
  }

  const ticket = findTicketInJson(ticketsPath, phaseId, ticketId);
  if (!ticket) {
    console.log(
      JSON.stringify({
        success: false,
        error: `Ticket ${ticketKey} not found in ${ticketsPath}`,
      }),
    );
    process.exit(EXIT_FAILURE);
  }

  const currentStatus = ticket.status;
  const matches = currentStatus === expectedStatus;

  if (!matches) {
    console.log(
      `[BLOCKED] /${phase}-ticket ${ticketKey}: current status is "${currentStatus}", expected "${expectedStatus}".`,
    );
    console.log(
      `The ticket must first complete the "${expectedStatus}" phase before /${phase}-ticket can proceed.`,
    );
    process.exit(EXIT_FAILURE);
  }

  // Exit silently on match — the gate passes with no output needed.

  process.exit(EXIT_SUCCESS);
}

if (require.main === module) main();
module.exports = { parseArgs, findTicketInJson, main };
