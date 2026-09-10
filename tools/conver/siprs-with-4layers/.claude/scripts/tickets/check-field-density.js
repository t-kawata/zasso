#!/usr/bin/env node
/**
 * check-field-density.js <Tickets.json path> <ticket-key>
 *
 * Executed by AI at the end of /make-ticket Step 5. Detects [::TEMPLATE-STUB::]
 * markers across all fields of the target ticket and verifies whether any remain unfilled.
 *
 * Behavior:
 *   - exit 0: no markers found (all fields filled)
 *   - exit 1: one or more markers found (unfilled fields), details JSON to stderr
 *   - stdout: JSON { ok: true/false, count: N, density: { ... } }
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

/** Regex for detecting markers */
const STUB_PATTERN = /\[::TEMPLATE-STUB::([^\]]+)::\]/g;

/** Density scoring target fields and their expected item counts */
const FIELD_EXPECTED = {
  invariants: 4,
  background: 4,
  scope: 13,
  testUnit: 4,
  testIntegration: 4,
  testExceptions: 3,
  instrumentation: 4,
  notes: 5,
  acceptanceCriteria: 3,
  investigation: 1,
  boyScoutPlan: 1,
};

function main() {
  const ticketsPath = process.argv[2];
  const ticketKey = process.argv[3];

  if (!ticketsPath || !ticketKey) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "Usage: check-field-density.js <Tickets.json> <ticket-key>",
      }),
    );
    process.exit(EXIT_FAILURE);
  }

  const resolvedPath = path.resolve(ticketsPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(
      JSON.stringify({
        ok: false,
        error: `Tickets.json not found: ${resolvedPath}`,
      }),
    );
    process.exit(EXIT_FAILURE);
  }

  // Retrieve ticket via get-ticket.js
  const getScript = path.join(__dirname, "get-ticket.js");
  let getResult;
  try {
    const stdout = execFileSync(process.execPath, [getScript, resolvedPath, ticketKey], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    getResult = JSON.parse(stdout);
  } catch (e) {
    console.error(
      JSON.stringify({
        ok: false,
        error: `Failed to get ticket: ${e.message}`,
      }),
    );
    process.exit(EXIT_FAILURE);
  }

  if (!getResult.success) {
    console.error(
      JSON.stringify({
        ok: false,
        error: `Ticket not found: ${ticketKey}`,
      }),
    );
    process.exit(EXIT_FAILURE);
  }

  const ticket = getResult.ticket;

  // Concatenate all fields as strings and detect markers
  const allStubs = []; // { field, marker, context }
  const fieldDensity = {};
  let totalExpected = 0;
  let totalFilled = 0;

  for (const field of Object.keys(FIELD_EXPECTED)) {
    const raw = ticket[field];
    if (raw === undefined || raw === null) {
      // Field itself does not exist
      fieldDensity[field] = { expected: FIELD_EXPECTED[field], filled: 0, ratio: 0 };
      continue;
    }

    const str = typeof raw === "string" ? raw : JSON.stringify(raw);
    STUB_PATTERN.lastIndex = 0;
    const matches = [];
    let m;
    while ((m = STUB_PATTERN.exec(str)) !== null) {
      matches.push({ marker: m[0], name: m[1] });
    }

    const expected = FIELD_EXPECTED[field];
    const filled = expected - matches.length;
    fieldDensity[field] = { expected, filled, ratio: filled / expected };
    totalExpected += expected;
    totalFilled += filled;

    if (matches.length > 0) {
      allStubs.push({ field, count: matches.length, markers: matches.map((x) => x.marker) });
    }
  }

  // Density scoring results
  const densityResult = {
    fields: fieldDensity,
    total: { expected: totalExpected, filled: totalFilled },
    overallRatio: totalExpected > 0 ? totalFilled / totalExpected : 1,
  };

  // Output results to stdout
  const result = {
    ok: allStubs.length === 0,
    count: allStubs.reduce((sum, s) => sum + s.count, 0),
    density: densityResult,
    stubs: allStubs.length > 0 ? allStubs : undefined,
  };
  console.log(JSON.stringify(result));

  if (allStubs.length > 0) {
    // Output unfilled details to stderr
    const errors = allStubs.map(
      (s) => `${s.field}: ${s.count} unset marker(s) - ${s.markers.join(", ")}`,
    );
    console.error(
      JSON.stringify(
        {
          ok: false,
          count: allStubs.reduce((sum, s) => sum + s.count, 0),
          message: "Unset template markers found",
          errors,
        },
        null,
        2,
      ),
    );
    process.exit(EXIT_FAILURE);
  }

  process.exit(EXIT_SUCCESS);
}

if (require.main === module) {
  main();
}

module.exports = { main, STUB_PATTERN, FIELD_EXPECTED };
