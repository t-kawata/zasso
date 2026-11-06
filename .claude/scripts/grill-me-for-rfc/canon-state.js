#!/usr/bin/env node
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-377 --for-spec --no-implementation-order`.
/**
 * canon-state.js <rfc-dir> [--json]
 *
 * Classifies the package by what it has already derived and whether the derivation
 * still matches the canonical RFC.
 *
 * The grill rewrites RFC.md from its settled tree. That is safe while the RFC is the
 * only design artifact, and unsafe once tickets exist and were derived from it: the
 * drill computes its delta against a baseline captured inside one drill run, so a
 * rewrite made outside that run is absorbed into the next baseline and never reaches
 * the derived artifacts. A package with a graph and a directory tree but no tickets
 * is a different case: drill cannot run (it requires Tickets.json), so the grill owns
 * the rewrite and the package owes the rederive chain.
 *
 * Read-only: it creates nothing and repairs nothing.
 *
 * Exit-code contract:
 *   standalone | partial | materialized-stale -> 0, prints the state and the next owner
 *   materialized-fresh                        -> 1, prints the state and the drill route
 *
 * CLI:
 *   canon-state.js <rfc-dir> [--json]
 */
import fs from 'fs';
import path from 'path';
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-377 --for-spec --no-implementation-order`.
import stageReceipt from '../rfc-graph/lib/stage-receipt.js';
import { toHomeRelative } from '../lib/path-utils.js';

const { RECEIPT_STATE, digestFile, readStageReceipts } = stageReceipt;

const EXIT_SUCCESS = 0;
const EXIT_MATERIALIZED_FRESH = 1;

/** The ticket file /boundify-graph writes beside the RFC it splits. */
const TICKETS_FILENAME = 'Tickets.json';
const RFC_FILENAME = 'RFC.md';
const STATUS_FILENAME = 'Status.json';

/** The suffixes the upstream loop's derived artifacts carry. */
const DERIVED_SUFFIXES = Object.freeze(['-GRAPH.json', '-Dirs-Tree.json']);

/** The four answers the guard may give. */
const CANON_STATES = Object.freeze({
  STANDALONE: 'standalone',
  PARTIAL: 'partial',
  MATERIALIZED_FRESH: 'materialized-fresh',
  MATERIALIZED_STALE: 'materialized-stale',
});

/** The stages that must rerun after a canonical rewrite, in order. */
const REDERIVE_CHAIN = Object.freeze(['graphify', 'boundify', 'split']);

/** Every derived artifact the directory holds, in the order it is read. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function collectDerivedArtifacts(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((name) => name === TICKETS_FILENAME || DERIVED_SUFFIXES.some((suffix) => name.endsWith(suffix)))
    .sort();
}

/** The rederive record a grill run leaves, or null when none was recorded. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function readRederiveRecord(directory) {
  try {
    const status = JSON.parse(fs.readFileSync(path.join(directory, STATUS_FILENAME), 'utf8'));
    return status?.rederive ?? null;
  } catch {
    return null;
  }
}

/** A compact view of the receipts the classifier read, without the digest bodies. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function summarizeReceipts(receipts) {
  return Object.fromEntries(
    Object.entries(receipts).map(([stage, entry]) => [stage, entry.state]),
  );
}

/**
 * Whether the canon stands alone, is partially materialized, or is materialized.
 *
 * A package with tickets but no receipts is legacy: it keeps the pre-PX-377 answer
 * (materialized-fresh) until its next chain run writes the receipts. A package with
 * a recorded rederive obligation, or with one receipt that does not match the current
 * RFC digest, is stale and must rederive rather than run drill.
 */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-377 --for-spec --no-implementation-order`.
export function classifyCanonState(directory) {
  const artifacts = collectDerivedArtifacts(directory);
  const hasTickets = artifacts.includes(TICKETS_FILENAME);
  const hasGraph = artifacts.some((name) => name.endsWith('-GRAPH.json'));
  const hasDirsTree = artifacts.some((name) => name.endsWith('-Dirs-Tree.json'));

  if (!hasTickets && !hasGraph && !hasDirsTree) {
    return { state: CANON_STATES.STANDALONE, artifacts, nextOwner: 'grill', rederive: [], receipts: {} };
  }
  if (!hasTickets) {
    return {
      state: CANON_STATES.PARTIAL,
      artifacts,
      nextOwner: 'grill',
      rederive: [...REDERIVE_CHAIN],
      receipts: {},
    };
  }

  const rfcDigest = digestFile(path.join(directory, RFC_FILENAME));
  const receipts = readStageReceipts(directory, rfcDigest);
  const rederiveRecord = readRederiveRecord(directory);
  const stale = rederiveRecord?.required === true
    || Object.values(receipts).some((entry) => entry.state === RECEIPT_STATE.STALE);

  if (stale) {
    return {
      state: CANON_STATES.MATERIALIZED_STALE,
      artifacts,
      nextOwner: 'repair',
      rederive: [...REDERIVE_CHAIN],
      receipts: summarizeReceipts(receipts),
    };
  }
  return {
    state: CANON_STATES.MATERIALIZED_FRESH,
    artifacts,
    nextOwner: 'drill',
    rederive: [],
    receipts: summarizeReceipts(receipts),
  };
}

/** The human-readable sentence for one classification. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-377 --for-spec --no-implementation-order`.
export function renderCanonState(classification, directory) {
  const where = toHomeRelative(directory);
  const artifacts = classification.artifacts.length === 0 ? 'none' : classification.artifacts.join(', ');
  if (classification.state === CANON_STATES.STANDALONE) {
    return `The canon is standalone: ${where}. Next: /grill-me-for-rfc.`;
  }
  if (classification.state === CANON_STATES.PARTIAL) {
    return `The canon is partially materialized (${artifacts}) in ${where}. Next: /grill-me-for-rfc, then rederive: /graphify-rfc -> /boundify-graph -> /split-to-tickets.`;
  }
  if (classification.state === CANON_STATES.MATERIALIZED_STALE) {
    return `The canon is materialized-stale (${artifacts}) in ${where}. Next: /grill-me-for-rfc, then rederive: /graphify-rfc -> /boundify-graph -> /split-to-tickets.`;
  }
  return `The canon is materialized-fresh (${artifacts}) in ${where}. Run /drill-rfc-down to evolve it.`;
}

/** The CLI entry point. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-377 --for-spec --no-implementation-order`.
export function main(argv = process.argv.slice(2)) {
  const rfcDirArgument = argv.find((argument) => !argument.startsWith('--'));
  if (!rfcDirArgument) {
    process.stderr.write('Usage: canon-state.js <rfc-dir> [--json]\n');
    return EXIT_SUCCESS;
  }
  const directory = path.resolve(rfcDirArgument);
  const classification = classifyCanonState(directory);

  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(classification, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderCanonState(classification, directory)}\n`);
  }

  return classification.state === CANON_STATES.MATERIALIZED_FRESH
    ? EXIT_MATERIALIZED_FRESH
    : EXIT_SUCCESS;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  process.exit(main());
}
