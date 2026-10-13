#!/usr/bin/env node
/**
 * check-distribution-ledger.js <RFC_DIR> [--units=<path>]
 *
 * The structural gate for the distribution appendix.
 *
 * Modelled on check-divergence-ledger.js, and it keeps that gate's deliberate omission: it
 * does not require a design-tree coverage table, because gaia-foundation carries none and a
 * gate that fails on a real package is a gate nobody can pass.
 *
 * It decides whether the record is well formed and whether each row points somewhere real.
 * It does not decide whether the RFC's prose adequately describes a unit: scan-defects.js
 * states in its own header that deciding whether two prose designs contradict each other is
 * not decidable, so an adequacy assertion would assert a reading rather than a property.
 *
 * Exit-code contract:
 *   well formed → 0
 *   absent, malformed, or a row that does not resolve → 1
 *
 * Design context: tools/conver/README.md — 上流ループ / /grill-me-for-rfc (STEP 5).
 */

import fs from 'node:fs';
import path from 'node:path';

import { LEDGER_TITLE_SUFFIX, readDistributionLedger } from '../sequences-slice/lib/distribution-ledger.mjs';

const EXIT_OK = 0;
const EXIT_FAILED = 1;

const RFC_FILENAME = 'RFC.md';
const UNITS_FLAG_PREFIX = '--units=';

const USAGE = 'usage: check-distribution-ledger.js <RFC_DIR> [--units=<path>]';

/**
 * The unit ids a package's view distributes, or an empty set when there is no view.
 *
 * Read from the view rather than derived, because the view is what the package was told to
 * implement; a gate that recomputed the set would be asserting its own arithmetic instead
 * of the material's contents. An absent view bounds nothing, and the membership rule is
 * then skipped rather than failing every row.
 */
// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
function readUnitIds(unitsPath) {
  try {
    const view = JSON.parse(fs.readFileSync(unitsPath, 'utf8'));
    const ids = [
      ...(view.ownedOperationUnits ?? []).map((unit) => unit.unitId),
      ...(view.ownedSequenceUnits ?? []).map((unit) => unit.unitId),
      ...(view.crossBoundarySequenceUnits ?? []).map((unit) => unit.unitId),
    ];
    return new Set(ids);
  } catch {
    return new Set();
  }
}

// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
function main(argv = process.argv.slice(2)) {
  const [rfcDirArgument] = argv.filter((argument) => !argument.startsWith('--'));
  if (rfcDirArgument === undefined) {
    process.stderr.write(`${USAGE}\n`);
    return EXIT_FAILED;
  }

  const rfcDir = path.resolve(rfcDirArgument);
  const unitsArgument = argv.find((argument) => argument.startsWith(UNITS_FLAG_PREFIX));
  const unitsPath = unitsArgument === undefined
    ? path.join(rfcDir, 'SEQUENCES.json')
    : path.resolve(unitsArgument.slice(UNITS_FLAG_PREFIX.length));

  let rfcText;
  try {
    rfcText = fs.readFileSync(path.join(rfcDir, RFC_FILENAME), 'utf8');
  } catch {
    process.stderr.write(`refused: ${path.join(rfcDir, RFC_FILENAME)} could not be read\n`);
    return EXIT_FAILED;
  }

  const verdict = readDistributionLedger(rfcText, readUnitIds(unitsPath));
  if (verdict === null) {
    process.stderr.write(`refused: this RFC carries no ${LEDGER_TITLE_SUFFIX}\n`);
    return EXIT_FAILED;
  }
  if (!verdict.ok) {
    process.stderr.write(`refused: ${verdict.reason}\n`);
    return EXIT_FAILED;
  }
  process.stdout.write(`${LEDGER_TITLE_SUFFIX} is well formed: ${verdict.rows.length} row(s)\n`);
  return EXIT_OK;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  process.exit(main());
}

export { main, readUnitIds };
