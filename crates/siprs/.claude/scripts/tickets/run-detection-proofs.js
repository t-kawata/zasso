#!/usr/bin/env node
'use strict';

/**
 * PX-436 — run detection proofs.
 *
 * The coverage map records the mutation and command that prove each clause.
 * This script executes the missing or stale proofs, never the runtime ones in
 * `changed` mode, and writes the proof records back. A project-condition
 * failure is a result, never a process failure.
 */

const fs = require('node:fs');
const path = require('node:path');

const { writeTemporaryThenRename } = require('./lib/atomic-write.js');
const { runDetectionProof, runProofs } = require('./lib/proof-engine.js');
const { requireSupportedVersion } = require('./lib/versioned-json.js');

const COVERAGE_FILE_NAME = 'CONTRACT-COVERAGE.json';
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

/** A proof entry the engine can run, or a repair result. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function proofEntryOf(clause) {
  const test = Array.isArray(clause?.tests) ? clause.tests[0] : null;
  return {
    key: clause?.key ?? null,
    test: test ?? null,
    proof: clause?.proof ?? null,
    mutation: clause?.mutation ?? null,
    command: clause?.command ?? null,
  };
}

/** Run one entry, or report the input it is missing. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function runEntry({ entry, timeoutMs }) {
  if (entry.test === null || entry.mutation === null || entry.command === null) {
    return { status: 'REPAIR_REQUIRED', reason: 'PROOF_INPUT_MISSING', clauseKey: entry.key, restored: false };
  }
  return runDetectionProof({
    clause: { key: entry.key },
    testId: entry.test.id,
    testDigest: entry.test.digest,
    mutation: entry.mutation,
    command: entry.command,
    timeoutMs,
  });
}

/** CLI entry point. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  const cwd = path.resolve(argumentValue(args, 'cwd') ?? process.cwd());
  const coveragePath = path.resolve(cwd, argumentValue(args, 'coverage') ?? COVERAGE_FILE_NAME);
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

  const entries = (coverage.clauses ?? [])
    .filter((clause) => clause.applicability === 'TESTABLE')
    .map(proofEntryOf);
  const run = runProofs({
    clauses: entries,
    mode,
    budget,
    runProof: (entry) => runEntry({ entry, timeoutMs }),
  });

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
  }) + '\n');
  process.exit(0);
}

if (require.main === module) main();

module.exports = {
  COVERAGE_FILE_NAME,
  DEFAULT_TIMEOUT_MS,
  main,
  proofEntryOf,
  runEntry,
};
