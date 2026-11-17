#!/usr/bin/env node
'use strict';

/**
 * PX-442 — standalone legacy artifact migration.
 *
 * The find flow runs the same migration automatically. This CLI exists for an
 * operator who wants to migrate first and inspect the report, or to project the
 * result with --report-only without writing anything.
 */

const fs = require('node:fs');
const path = require('node:path');

const { resolveAdapters } = require('./build-test-index.js');
const { migrateArtifacts, writeMigratedArtifacts } = require('./lib/proof-migration.js');

const COVERAGE_FILE_NAME = 'CONTRACT-COVERAGE.json';
const INVENTORY_FILE_NAME = 'CONTRACT-INVENTORY.json';
const INDEX_FILE_NAME = 'TEST-INDEX.json';

/** Read `--name=value` from the argument list. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function argumentValue(args, name) {
  const prefix = '--' + name + '=';
  const match = args.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

/** Read JSON, or null when absent. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function readJsonIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** CLI entry point. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  const cwd = path.resolve(argumentValue(args, 'cwd') ?? process.cwd());
  const reportOnly = args.includes('--report-only');

  const coverage = readJsonIfPresent(path.resolve(cwd, argumentValue(args, 'coverage') ?? COVERAGE_FILE_NAME));
  if (coverage === null) {
    process.stdout.write(JSON.stringify({ ok: true, skipped: 'coverage-missing' }) + '\n');
    process.exit(0);
    return;
  }

  const inventory = readJsonIfPresent(path.resolve(cwd, argumentValue(args, 'inventory') ?? INVENTORY_FILE_NAME));
  const testIndex = readJsonIfPresent(path.resolve(cwd, argumentValue(args, 'index') ?? INDEX_FILE_NAME));
  let adapters = [];
  try {
    adapters = resolveAdapters({ cwd });
  } catch {
    adapters = [];
  }

  const result = migrateArtifacts({
    cwd,
    coverage,
    ledger: undefined,
    repairs: undefined,
    ticketsData: undefined,
    inventory,
    testIndex,
    adapters,
    reportOnly,
  });
  const written = writeMigratedArtifacts({ cwd, artifacts: result, reportOnly });

  process.stdout.write(JSON.stringify({ ok: true, written, ...result.report }) + '\n');
  process.exit(0);
}

if (require.main === module) main();

module.exports = {
  COVERAGE_FILE_NAME,
  INDEX_FILE_NAME,
  INVENTORY_FILE_NAME,
  main,
};
