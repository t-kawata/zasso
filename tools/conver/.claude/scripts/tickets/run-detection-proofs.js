#!/usr/bin/env node
'use strict';

/**
 * PX-436, PX-441 — run detection proofs.
 *
 * The coverage map records the mutation and command that prove each clause.
 * This script executes only the missing or stale proofs, never the runtime ones
 * in `changed` mode, and writes the proof records back. A project-condition
 * failure is a result, never a process failure.
 */

const fs = require('node:fs');
const path = require('node:path');

const { writeTemporaryThenRename } = require('./lib/atomic-write.js');
const { requireSupportedVersion } = require('./lib/versioned-json.js');
const { DISPOSITIONS_FILE_NAME, loadDispositions } = require('./lib/dispositions.js');
const {
  buildProofEntries,
  proofCacheOf,
  runProofEntries,
} = require('./lib/proof-plan.js');
const { computeProofInputs } = require('./lib/proof-inputs.js');
const { resolveAdapters } = require('./build-test-index.js');

const COVERAGE_FILE_NAME = 'CONTRACT-COVERAGE.json';
const INVENTORY_FILE_NAME = 'CONTRACT-INVENTORY.json';
const INDEX_FILE_NAME = 'TEST-INDEX.json';
const DEFAULT_TIMEOUT_MS = 30000;

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

/** A proof entry the legacy coverage shape can name, or a repair result. */
// [::TICKET::] PX-436, PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-436|PX-441) --for-spec --no-implementation-order`.
function proofEntryOf(clause) {
  const test = Array.isArray(clause?.tests) && clause.tests.length > 0 ? clause.tests[0] : null;
  return {
    key: clause?.key ?? null,
    test: test ?? null,
    proof: clause?.proof ?? null,
    mutation: clause?.proof?.mutation ?? clause?.mutation ?? null,
    command: clause?.proof?.command ?? clause?.command ?? null,
  };
}

/** Build entries from a coverage map that has no test index beside it. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function legacyEntriesOf({ cwd, coverage }) {
  const entries = [];
  const missing = [];
  for (const clause of (coverage.clauses ?? []).filter((entry) => entry.applicability === 'TESTABLE')) {
    const plan = proofEntryOf(clause);
    if (plan.test === null || plan.mutation === null || plan.command === null) {
      missing.push({ key: clause.key, code: 'PROOF_PLAN_MISSING', field: null });
      continue;
    }
    const computed = computeProofInputs({
      cwd,
      clauseKey: clause.key,
      coverageEntry: clause,
      testEntry: plan.test,
      mutation: plan.mutation,
      commandTemplate: plan.command,
      adapter: null,
    });
    if (!computed.ok) {
      missing.push({ key: clause.key, code: computed.code, field: computed.field ?? null });
      continue;
    }
    entries.push({ ...plan, inputs: computed.inputs });
  }
  return { entries, missing };
}

/** CLI entry point. */
// [::TICKET::] PX-436, PX-441, PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-436|PX-441|PX-442) --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  const cwd = path.resolve(argumentValue(args, 'cwd') ?? process.cwd());
  const coveragePath = path.resolve(cwd, argumentValue(args, 'coverage') ?? COVERAGE_FILE_NAME);
  const inventoryPath = path.resolve(cwd, argumentValue(args, 'inventory') ?? INVENTORY_FILE_NAME);
  const indexPath = path.resolve(cwd, argumentValue(args, 'index') ?? INDEX_FILE_NAME);
  const dispositionsPath = path.resolve(cwd, argumentValue(args, 'dispositions') ?? DISPOSITIONS_FILE_NAME);
  const configPath = argumentValue(args, 'config');
  const outPath = path.resolve(cwd, argumentValue(args, 'out') ?? COVERAGE_FILE_NAME);
  const reportOnly = args.includes('--report-only');
  const mode = argumentValue(args, 'proofs') === 'all' ? 'all' : 'changed';
  const timeoutMs = Number.parseInt(argumentValue(args, 'timeout-ms') ?? String(DEFAULT_TIMEOUT_MS), 10);
  const budget = Number.parseInt(argumentValue(args, 'budget') ?? '0', 10);

  const coverage = readJsonIfPresent(coveragePath);
  if (coverage === null) {
    process.stdout.write(JSON.stringify({ ok: false, code: 'COVERAGE_MISSING' }) + '\n');
    process.exit(0);
    return;
  }
  try {
    requireSupportedVersion(coverage, [1], coveragePath);
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, code: 'UNSUPPORTED_VERSION', problem: error.message }) + '\n');
    process.exit(0);
    return;
  }

  const inventory = readJsonIfPresent(inventoryPath);
  const testIndex = readJsonIfPresent(indexPath);
  const clauseKeys = new Set((inventory?.clauses ?? coverage.clauses ?? []).map((clause) => clause.key));
  const loaded = loadDispositions({ cwd, filePath: dispositionsPath, clauseKeys });
  const dispositions = [...loaded.byKey.values()];
  const adapters = resolveAdapters({ cwd, configPath: configPath ? path.resolve(cwd, configPath) : null });

  const built = inventory !== null && testIndex !== null
    ? buildProofEntries({ cwd, inventory, testIndex, coverage, dispositions, adapters })
    : legacyEntriesOf({ cwd, coverage });
  const run = runProofEntries({ entries: built.entries, mode, budget, timeoutMs, cwd });

  const byKey = new Map((coverage.clauses ?? []).map((clause) => [clause.key, clause]));
  for (const result of run.results) {
    const clause = byKey.get(result.clauseKey);
    if (clause !== undefined) clause.proof = result;
  }

  if (!reportOnly) {
    writeTemporaryThenRename(outPath, JSON.stringify(coverage, null, 2) + '\n');
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    mode: run.mode,
    ran: run.ran,
    skipped: run.skipped,
    notRun: run.notRun,
    results: run.results,
    proofCache: proofCacheOf({
      total: built.entries.length + built.missing.length,
      entries: built.entries,
      run,
      missing: built.missing,
    }),
    missing: built.missing,
    dispositionFindings: loaded.findings,
  }) + '\n');
  process.exit(0);
}

if (require.main === module) main();

module.exports = {
  COVERAGE_FILE_NAME,
  DEFAULT_TIMEOUT_MS,
  legacyEntriesOf,
  main,
  proofEntryOf,
};
