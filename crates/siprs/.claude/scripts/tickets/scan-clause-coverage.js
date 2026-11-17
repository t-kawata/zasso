#!/usr/bin/env node
'use strict';

/**
 * PX-436 — scan clause coverage.
 *
 * Reads the inventory, the test index and the recorded coverage map; emits the
 * per-clause status, the remainder and normalized findings. No text matching
 * produces a verdict.
 */

const fs = require('node:fs');
const path = require('node:path');

const { writeTemporaryThenRename } = require('./lib/atomic-write.js');
const { scanClauseCoverage } = require('./lib/coverage-map.js');
const { DISPOSITIONS_FILE_NAME, loadDispositions } = require('./lib/dispositions.js');
const { buildProofInputsByKey } = require('./lib/proof-plan.js');
const { resolveAdapters } = require('./build-test-index.js');
const { requireSupportedVersion } = require('./lib/versioned-json.js');

const INVENTORY_FILE_NAME = 'CONTRACT-INVENTORY.json';
const INDEX_FILE_NAME = 'TEST-INDEX.json';
const COVERAGE_FILE_NAME = 'CONTRACT-COVERAGE.json';

/** Read `--name=value` from the argument list. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function argumentValue(args, name) {
  const prefix = '--' + name + '=';
  const match = args.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

/** Read JSON or null. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function readJsonIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** CLI entry point. */
// [::TICKET::] PX-436, PX-440, PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-436|PX-440|PX-441) --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  const cwd = path.resolve(argumentValue(args, 'cwd') ?? process.cwd());
  const inventoryPath = path.resolve(cwd, argumentValue(args, 'inventory') ?? INVENTORY_FILE_NAME);
  const indexPath = path.resolve(cwd, argumentValue(args, 'index') ?? INDEX_FILE_NAME);
  const coveragePath = path.resolve(cwd, argumentValue(args, 'coverage') ?? COVERAGE_FILE_NAME);
  const dispositionsPath = path.resolve(cwd, argumentValue(args, 'dispositions') ?? DISPOSITIONS_FILE_NAME);
  const configPath = argumentValue(args, 'config');
  const outPath = path.resolve(cwd, argumentValue(args, 'out') ?? COVERAGE_FILE_NAME);
  const reportOnly = args.includes('--report-only');

  const inventory = readJsonIfPresent(inventoryPath);
  const testIndex = readJsonIfPresent(indexPath);
  if (inventory === null || testIndex === null) {
    process.stdout.write(JSON.stringify({
      ok: false,
      code: inventory === null ? 'INVENTORY_MISSING' : 'TEST_INDEX_MISSING',
    }) + '\n');
    process.exit(0);
    return;
  }

  const coverage = readJsonIfPresent(coveragePath) ?? { version: 1, inventoryDigest: null, testIndexDigest: null, clauses: [] };
  try {
    requireSupportedVersion(inventory, [1], inventoryPath);
    requireSupportedVersion(testIndex, [1], indexPath);
    requireSupportedVersion(coverage, [1], coveragePath);
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, code: 'UNSUPPORTED_VERSION', problem: error.message }) + '\n');
    process.exit(0);
    return;
  }
  const clauseKeys = new Set((inventory.clauses ?? []).map((clause) => clause.key));
  const loaded = loadDispositions({ cwd, clauseKeys });
  const dispositions = [...loaded.byKey.values()];
  let adapters = [];
  try {
    adapters = resolveAdapters({ cwd, configPath: configPath ? path.resolve(cwd, configPath) : null });
  } catch {
    adapters = [];
  }
  const inputs = buildProofInputsByKey({ cwd, inventory, testIndex, coverage, dispositions, adapters });
  const result = scanClauseCoverage({
    inventory,
    testIndex,
    coverage,
    dispositions,
    proofInputsByKey: inputs.byKey,
  });

  if (!reportOnly) {
    writeTemporaryThenRename(outPath, JSON.stringify(result.coverage, null, 2) + '\n');
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    bindingValid: result.bindingValid,
    remainder: result.remainder,
    findings: [...result.findings, ...loaded.findings],
    dispositionLedger: loaded.exists ? dispositionsPath : null,
    dispositionFindings: loaded.findings,
    proofInputsMissing: inputs.missing,
  }) + '\n');
  process.exit(0);
}

if (require.main === module) main();

module.exports = {
  COVERAGE_FILE_NAME,
  INDEX_FILE_NAME,
  INVENTORY_FILE_NAME,
  main,
};
