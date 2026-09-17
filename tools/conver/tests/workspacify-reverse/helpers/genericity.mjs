// [::TICKET::] P25-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-4 --for-spec --no-implementation-order`.
/**
 * genericity — the project names this repository carries, and where they are allowed to be.
 *
 * A guard applied to every subject must not name one of them. `PRODUCTION_MARKERS`
 * refused a mutation plan whose reference contained `siprs-with-4layers`, which
 * protects this repository's answer key and leaves every other tree refused only if
 * its path happens to contain one of the four generic words.
 *
 * Nothing is exempt any more. `oracle-bundle.mjs` used to export the paths of this
 * repository's own two trees, and the exemption declared here is what let it; both
 * trees have been deleted and the module now takes the answer key it measures as a
 * parameter, so the exemption was removed rather than left standing. The sweep is
 * what noticed, which is what it is for: an exemption that matches nothing is a
 * permission nobody is using and is the first step to one nobody is watching.
 *
 * Pure over an injected module list: the caller reads the files, this decides. A
 * sweep that reads the tree itself could only ever be seen to pass.
 */

/**
 * The names of this repository's own material.
 *
 * Declared rather than derived: there is no way to compute "the projects this
 * toolchain belongs to" from a filesystem, and a sweep that guessed would be
 * guessing about the thing it exists to check.
 */
export const REPOSITORY_MATERIAL_NAMES = Object.freeze([
// [::TICKET::] P25-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-5 --for-spec --no-implementation-order`.
  'siprs-for-reverse',
  'siprs-with-4layers',
]);

/**
 * The modules allowed to carry one of those names as a runtime value, each with why.
 *
 * Every entry must be exempt for something: the sweep reports an entry that matches
 * no finding, so a stale exemption is removed rather than accumulating.
 */
export const EXPERIMENT_ONLY_MODULES = Object.freeze({});

/** A line whose first non-space characters open a comment. */
const COMMENT_LINE = /^\s*(\/\/|\*|\/\*)/;

/**
 * Every place a declared name appears as a runtime value rather than in prose.
 *
 * A comment is not a value: this tree carries four comments naming the answer key and
 * three values, and a sweep that counted mentions would report the comments and could
 * not be satisfied without deleting explanations that are worth keeping. The
 * distinction is the whole reason this is a function rather than a grep.
 *
 * @param {{ modules: Array<{path: string, text: string}>, names: readonly string[] }} input
 * @returns {Array<{ path: string, line: number, name: string }>} in module order, then line order
 */
// [::TICKET::] P25-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-4 --for-spec --no-implementation-order`.
export function projectNameValuesIn({ modules, names }) {
  const findings = [];

  for (const module of modules) {
    const lines = module.text.split('\n');
    for (const [index, line] of lines.entries()) {
      if (COMMENT_LINE.test(line)) continue;
      const name = names.find((candidate) => line.includes(candidate));
      if (name !== undefined) findings.push({ path: module.path, line: index + 1, name });
    }
  }

  return findings;
}
