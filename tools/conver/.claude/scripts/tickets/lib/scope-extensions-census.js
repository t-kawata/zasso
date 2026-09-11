#!/usr/bin/env node
/**
 * scope-extensions-census.js
 *
 * Measures which file extensions this repository actually contains, so that the
 * set of extensions the annotation system supports can be compared against it.
 *
 * The comparison exists because SOURCE_EXTENSIONS is a hand-maintained list and
 * nothing has ever checked it. Its own comment names the consequence: a file the
 * mechanism does not know about is simply never reported on. `.mjs` was added by
 * P22-4 for that reason; `.cjs` — 134 tracked files, this repository's own tests
 * — was left behind and stayed invisible through every ticket since.
 *
 * Reading and deciding are separate functions. `readTrackedPaths` performs the
 * one side effect, at the outermost edge; `censusTrackedExtensions` and
 * `findUndecidedExtensions` are pure over an injected file list, so the decision
 * can be tested without a repository and the reading can be tested without a
 * decision.
 *
 * Pure data in, plain data out. This module reports; it never admits an
 * extension on its own authority.
 */

const { execFileSync } = require("node:child_process");

/**
 * How many tracked files an extension needs before its absence from both sets is
 * a decision owed rather than a one-off.
 *
 * Three: every extension this repository has decided on carries at least five
 * files, so the floor sits below every real case and above the noise of a single
 * stray file. It is a judgement, and it is named here so the judgement is one
 * place rather than a literal inside a comparison.
 */
const MINIMUM_FILES_FOR_DECISION = 3;

/** `git ls-files` on this repository emits a few hundred kilobytes; 64 MiB is slack, not a target. */
const MAX_GIT_OUTPUT_BYTES = 64 * 1024 * 1024;

/**
 * The dotted, lowercased extension of a path, or null when it carries none.
 *
 * The extension is what follows the last dot in the basename, and a leading dot
 * is not one: `.gitignore` is a nameless file, not a file of type "gitignore",
 * and reading it as an extension would put a phantom entry in the census.
 * `.eslintrc.json` does have one and `.env` does not, which is the difference
 * the position of the dot decides.
 *
 * A path with no extension is not an extension with an empty name: `Makefile`
 * and `LICENSE` are tracked here and belong to no decision.
 */
// [::TICKET::] PX-209 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-209 --for-spec --no-implementation-order`.
function parseExtension(trackedPath) {
  const basename = trackedPath.slice(trackedPath.lastIndexOf("/") + 1);
  const dotIndex = basename.lastIndexOf(".");
  const extension = basename.slice(dotIndex + 1);
  if (dotIndex <= 0 || extension === "") return null;
  return `.${extension.toLowerCase()}`;
}

/**
 * Every path git tracks under repoRoot.
 *
 * A failure to read the repository is a failure of the check, not an empty
 * census. An empty census would report "nothing undecided", which is the exact
 * false negative this module exists to remove, so nothing is caught here.
 */
// [::TICKET::] PX-209 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-209 --for-spec --no-implementation-order`.
function readTrackedPaths(repoRoot) {
  const stdout = execFileSync("git", ["ls-files"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
  });
  return stdout.split("\n").filter((line) => line.length > 0);
}

/**
 * Count tracked files per extension, ignoring every path beneath an ignored
 * root and dropping extensions below the decision floor.
 *
 * The ignored roots are path prefixes, not extension names, which is what keeps
 * 2253 vendored C/C++ files out of the census while the same extensions in this
 * repository's own tree would still owe a decision.
 *
 * Returns a Map from dotted extension to count.
 */
// [::TICKET::] PX-209 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-209 --for-spec --no-implementation-order`.
function censusTrackedExtensions({
  trackedPaths,
  ignoredRoots,
  minimumFiles = MINIMUM_FILES_FOR_DECISION,
}) {
  const counts = new Map();

  for (const trackedPath of trackedPaths) {
    if (ignoredRoots.some((root) => trackedPath.startsWith(root))) continue;
    const extension = parseExtension(trackedPath);
    if (extension === null) continue;
    counts.set(extension, (counts.get(extension) ?? 0) + 1);
  }

  return new Map([...counts].filter(([, count]) => count >= minimumFiles));
}

/**
 * The extensions the census found that neither set accounts for, sorted.
 *
 * An empty result is the whole of the pass condition. A non-empty one is
 * reported by name so the reader can decide without re-deriving the census.
 */
// [::TICKET::] PX-209 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-209 --for-spec --no-implementation-order`.
function findUndecidedExtensions(census, { included, excluded }) {
  return [...census.keys()]
    .filter((extension) => !included.has(extension) && !excluded.has(extension))
    .sort();
}

module.exports = {
  MINIMUM_FILES_FOR_DECISION,
  MAX_GIT_OUTPUT_BYTES,
  parseExtension,
  readTrackedPaths,
  censusTrackedExtensions,
  findUndecidedExtensions,
};
