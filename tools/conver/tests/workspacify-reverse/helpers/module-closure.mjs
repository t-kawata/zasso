// [::TICKET::] P25-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-4 --for-spec --no-implementation-order`.
// [::TICKET::] P25-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-3 --for-spec --no-implementation-order`.
// [::TICKET::] P25-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-2 --for-spec --no-implementation-order`.
/**
 * module-closure — the modules an entry point can reach, computed from the files.
 *
 * Two guards need this and they must not disagree. `reachability.test.mjs` holds
 * the closure to the set design §6 records, and `command-procedure.test.mjs` holds
 * the command's absence section to the same set. While the walk lived inside the
 * first test, the second could only compare the section against a *remembered*
 * number, which is how a section can stay describing six closed rows while the
 * measurement beneath it says five modules.
 *
 * So the walk is one function and the two guards read it in their own runs. The
 * measurement is recomputed on every call: a closure kept beside the files would be
 * a second thing to drift from them, which is the defect a stored extension list
 * was in the census this repository already repaired once.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Every specifier shape that creates an edge between two modules.
 *
 * A static `from`, a side-effect `import '...'`, a re-export's `from` and a dynamic
 * `import('...')` all load a module. Measured 2026-09-15: none of the four shapes
 * beyond a plain `from` appears in this tree, so matching only `from` gives the
 * right answer today — and would go on giving it after a side-effect import was
 * added, silently, because both the guard and the section it guards read the same
 * walk. A walk that cannot see an edge makes "unreachable" the wrong answer in the
 * one direction that produces no finding.
 */
const RELATIVE_IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.[^'"]+)['"]/g;

/** The suffix that makes a file a module of the library under measurement. */
const MODULE_SUFFIX = '.mjs';

/**
 * Every relative specifier a file names, resolved to a path that exists and is a file.
 *
 * A specifier that resolves to nothing is dropped rather than reported: it is a
 * broken import, and naming it here would report it as an unreachable module, which
 * it is not. `node --test` fails on the broken import itself, by name.
 *
 * @param {string} file - absolute path of the importing file
 * @returns {string[]} absolute paths, sorted
 */
export function importsOf(file) {
// [::TICKET::] P25-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-5 --for-spec --no-implementation-order`.
  const found = new Set();
  for (const match of readFileSync(file, 'utf8').matchAll(RELATIVE_IMPORT)) {
    const target = resolve(dirname(file), match[1]);
    if (existsSync(target) && statSync(target).isFile()) found.add(target);
  }
  return [...found].sort();
}

/**
 * The transitive closure from an entry point, and the modules of `directory` it misses.
 *
 * `reached` holds the entry point itself as well as every module it pulls in, so a
 * caller can ask whether a specific file was reached rather than re-walking. The
 * entry point is not required to live inside `directory`: `run.mjs` sits beside its
 * library rather than in it, and a walk that assumed otherwise would report the
 * whole library as unreachable.
 *
 * @param {string} entry - absolute path of the entry point
 * @param {string} directory - absolute path of the library to measure
 * @returns {{ reached: Set<string>, unreachable: string[] }} unreachable holds basenames, sorted
 */
// [::TICKET::] P25-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-2 --for-spec --no-implementation-order`.
export function readModuleClosure(entry, directory) {
  const reached = new Set();
  const pending = [resolve(entry)];
  while (pending.length > 0) {
    const current = pending.pop();
    if (reached.has(current)) continue;
    reached.add(current);
    for (const dependency of importsOf(current)) pending.push(dependency);
  }

  const libraryRoot = resolve(directory);
  return {
    reached,
    unreachable: readdirSync(libraryRoot)
      .filter((name) => name.endsWith(MODULE_SUFFIX))
      .filter((name) => !reached.has(join(libraryRoot, name)))
      .sort(),
  };
}

/**
 * The modules of a library an entry point does not reach, by name.
 *
 * Named for what it returns rather than for the walk that produces it, so a caller
 * reads the finding without following the mechanism.
 *
 * @param {string} entry
 * @param {string} directory
 * @returns {string[]}
 */
// [::TICKET::] P25-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-2 --for-spec --no-implementation-order`.
export function unreachableModulesFrom(entry, directory) {
  return readModuleClosure(entry, directory).unreachable;
}

/**
 * The modules of a library an entry point does reach, excluding the entry point itself.
 *
 * The complement of `unreachableModulesFrom`, and it exists because an absence
 * section has to be checked in both directions: naming a module that is absent is
 * one defect, and naming a module that is present is the other.
 *
 * @param {string} entry
 * @param {string} directory
 * @returns {string[]}
 */
export function reachableModulesIn(entry, directory) {
  const { unreachable } = readModuleClosure(entry, directory);
  return readdirSync(resolve(directory))
    .filter((name) => name.endsWith(MODULE_SUFFIX))
    .filter((name) => !unreachable.includes(name))
    .sort();
}
