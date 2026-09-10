#!/usr/bin/env node
/**
 * list-remaining-stubs.js <Tickets.json path> <ticket-key>
 *
 * Repeatedly executed by AI during /make-ticket Step 4b. Detects
 * [::TEMPLATE-STUB::] markers across all ticket fields and lists unfilled
 * items in natural language.
 *
 * Reuses STUB_PATTERN from check-field-density.js, only output format differs.
 *
 * Behavior specification:
 *   - exit 0: 0 markers (all fields filled)
 *   - exit 1: 1+ markers (unfilled items exist)
 *   - stdout: Natural language format readable by humans (AI). No JSON output.
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

// Reuse stub detection pattern from check-field-density.js
const { STUB_PATTERN } = require("./check-field-density.js");

const EXIT_CLEAN = 0;
const EXIT_STUBS_REMAIN = 1;

/**
 * Flatten field value to string and detect all stub markers
 *
 * @param {*} rawValue - Ticket field value (string / array / undefined, etc.)
 * @returns {{ marker: string, name: string }[]} Array of detected markers
 */
function findStubs(rawValue) {
  if (rawValue === undefined || rawValue === null) return [];

  const str = typeof rawValue === "string"
    ? rawValue
    : Array.isArray(rawValue)
      ? rawValue.join("\n")
      : String(rawValue);

  STUB_PATTERN.lastIndex = 0;
  const matches = [];
  let m;
  while ((m = STUB_PATTERN.exec(str)) !== null) {
    matches.push({ marker: m[0], name: m[1] });
  }
  return matches;
}

/** List of ticket field names to scan */
const TARGET_FIELDS = [
  "invariants", "background", "scope", "testUnit", "testIntegration",
  "testExceptions", "instrumentation", "notes", "acceptanceCriteria",
  "investigation", "boyScoutPlan",
];

/**
 * Return a short description for a field name (auxiliary info for stub type)
 */
function fieldLabel(field) {
  const labels = {
    invariants: "Invariants — system must always satisfy",
    background: "Background — goal, purpose, motivation, constraints",
    scope: "Scope — changes, non-changes, affected areas",
    testUnit: "Unit Tests — normal, error, boundary, invariant",
    testIntegration: "Integration Tests — point, verify, prerequisites, tickets",
    testExceptions: "Exceptions — item, reason, alternative",
    instrumentation: "Instrumentation — logging, metrics, errors, health",
    notes: "Notes — steps, risks, caveats, open items, future",
    acceptanceCriteria: "Acceptance Criteria — happy, error, edge",
    investigation: "Investigation — evidence from code research",
    boyScoutPlan: "Boy Scout Rule — translatability improvements",
  };
  return labels[field] || "";
}

function main() {
  const ticketsPath = process.argv[2];
  const ticketKey = process.argv[3];

  if (!ticketsPath || !ticketKey) {
    console.error(
      "Usage: list-remaining-stubs.js <Tickets.json> <ticket-key>",
    );
    process.exit(EXIT_STUBS_REMAIN);
  }

  const resolvedPath = path.resolve(ticketsPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`Tickets.json not found: ${resolvedPath}`);
    process.exit(EXIT_STUBS_REMAIN);
  }

  // Get current ticket state via get-ticket.js
  const getScript = path.join(__dirname, "get-ticket.js");
  let getResult;
  try {
    const stdout = execFileSync(process.execPath, [getScript, resolvedPath, ticketKey], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    getResult = JSON.parse(stdout);
  } catch (e) {
    console.error(`Failed to get ticket: ${e.message}`);
    process.exit(EXIT_STUBS_REMAIN);
  }

  if (!getResult.success) {
    console.error(`Ticket not found: ${ticketKey}`);
    process.exit(EXIT_STUBS_REMAIN);
  }

  const ticket = getResult.ticket;

  // Scan all target fields, collect only those with stubs
  const stubsByField = {};
  let totalStubs = 0;

  for (const field of TARGET_FIELDS) {
    const stubs = findStubs(ticket[field]);
    if (stubs.length > 0) {
      stubsByField[field] = stubs;
      totalStubs += stubs.length;
    }
  }

  // Output in natural language format
  if (totalStubs === 0) {
    console.log(`✅  All TEMPLATE-STUB markers have been replaced. No remaining markers in ticket ${ticketKey}.`);
    process.exit(EXIT_CLEAN);
  }

  console.log(`⚠️  ${totalStubs} TEMPLATE-STUB marker(s) remaining in ticket ${ticketKey}\n`);

  for (const [field, stubs] of Object.entries(stubsByField)) {
    const label = fieldLabel(field);
    console.log(`  ${field} (${stubs.length}):`);
    if (label) console.log(`    — ${label}`);
    for (const s of stubs) {
      console.log(`    · ${s.marker}`);
    }
    console.log("");
  }

  console.log("Use 'update-ticket.js' to replace each remaining marker with actual content.\n");
  process.exit(EXIT_STUBS_REMAIN);
}

if (require.main === module) {
  main();
}

module.exports = { findStubs, main };
