#!/usr/bin/env node
/**
 * canon-state.js <rfc-dir>
 *
 * Reports whether a package's canonical RFC still stands alone, or whether the
 * upstream loop has already derived artifacts from it.
 *
 * The grill rewrites RFC.md from its settled tree. That is safe while the RFC is
 * the only design artifact in the package. It is unsafe once /graphify-rfc and
 * /boundify-graph have derived a graph, a directory tree and tickets: the drill
 * computes its delta against a baseline it captures at Step 1-2 and removes at
 * Step 1-12 (clean), so a rewrite made outside one drill run is absorbed into the
 * next run's fresh baseline, reported as no change, and never reaches the derived
 * artifacts. This script answers the one question that decides which command owns
 * the evolution, so the boundary is enforced rather than assumed.
 *
 * The derived artifacts are recognised by suffix rather than by a literal name,
 * because a package may carry either the canonical `RFC.md` or a legacy
 * `RFC-<SLUG>.md` spelling, and both derive `<stem>-GRAPH.json` beside themselves.
 *
 * Read-only: it creates nothing and repairs nothing.
 *
 * Exit-code contract:
 *   stands alone → 0, prints the directory on stdout
 *   materialised → 1, names the artifact found on stderr
 *
 * CLI:
 *   canon-state.js <rfc-dir>
 */
import fs from "fs";
import path from "path";
// [::TICKET::] PX-238 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-238 --for-spec --no-implementation-order`.
import { toHomeRelative } from '../lib/path-utils.js';

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

/** The ticket file /boundify-graph writes beside the RFC it splits. */
const TICKETS_FILENAME = "Tickets.json";

/**
 * The suffixes the upstream loop's derived artifacts carry.
 *
 * A graph and a directory tree are named after the RFC they came from, so the
 * stem is matched instead of the whole name.
 */
const DERIVED_SUFFIXES = ["-GRAPH.json", "-Dirs-Tree.json"];

const rfcDirArg = process.argv[2];
if (!rfcDirArg) {
  console.error("Usage: canon-state.js <rfc-dir>");
  process.exit(EXIT_FAILURE);
}

const rfcDir = path.resolve(rfcDirArg);

/**
 * Every derived artifact the directory holds, in the order it is read.
 *
 * @param {string} directory — absolute path of the package
 * @returns {string[]} the artifact filenames found, empty when the canon stands alone
 */
// [::TICKET::] PX-238 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-238 --for-spec --no-implementation-order`.
function derivedArtifactsIn(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((name) => name === TICKETS_FILENAME || DERIVED_SUFFIXES.some((suffix) => name.endsWith(suffix)))
    .sort();
}

const found = derivedArtifactsIn(rfcDir);

if (found.length > 0) {
  console.error(
    `This package's RFC has already been derived from: ${found.join(", ")} in ${toHomeRelative(rfcDir)}.`,
  );
  console.error(
    "Rewriting it here would desynchronise the graph, the directory tree and the tickets. Run /drill-rfc-down: it is the command that evolves a materialised canon.",
  );
  process.exit(EXIT_FAILURE);
}

process.stdout.write(`The canon stands alone: ${toHomeRelative(rfcDir)}\n`);
process.exit(EXIT_SUCCESS);
