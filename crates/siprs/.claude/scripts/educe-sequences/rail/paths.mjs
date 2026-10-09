// path derivation for the one-argument contract (PX-240, contract C010).
//
// The output location depends only on the argument, so a run and a verification
// need nothing beyond the specification path. Two consequences are
// deliberate: no flag, environment variable or configuration reaches this module,
// and only the final extension is removed, so a name such as `spec.v32.final.md`
// yields `spec.v32.final-sequences.json` rather than losing `final` as well.
import { existsSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, resolve } from 'node:path';
// [::TICKET::] PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-241 --for-spec --no-implementation-order`.

/** The suffix every artifact carries, and the extension each form uses. */
export const ARTIFACT_SUFFIX = '-sequences';
export const ARTIFACT_EXTENSION = '.json';
export const RENDER_EXTENSION = '.md';

/**
 * The file name without its final extension.
 *
 * `extname` returns an empty string for a name with no dot, and the whole name
 * when it begins with one; both are left untouched so the caller decides.
 */
export function stripFinalExtension(fileName) {
  const extension = extname(fileName);
  return extension === '' ? fileName : fileName.slice(0, -extension.length);
}

/** The artifact path derived from a specification path: <dir>/<basename>-sequences.json. */
export function artifactPathFor(specPath) {
  const directory = dirname(specPath);
  const base = stripFinalExtension(specPath.slice(directory === '.' ? 0 : directory.length + 1));
  const derived = `${base}${ARTIFACT_SUFFIX}${ARTIFACT_EXTENSION}`;
  return directory === '.' ? derived : join(directory, derived);
}

/** The rendering path derived from the same specification path. */
export function renderPathFor(specPath) {
  const directory = dirname(specPath);
  const base = stripFinalExtension(specPath.slice(directory === '.' ? 0 : directory.length + 1));
  const derived = `${base}${ARTIFACT_SUFFIX}${RENDER_EXTENSION}`;
  return directory === '.' ? derived : join(directory, derived);
}

/**
 * Read the one positional argument.
 *
 * A refusal names the offending argument rather than the rule, because the caller
 * of a command learns more from "two arguments were given: a, b" than from
 * "expected exactly one argument".
 *
 * @param {string[]} argv — the arguments after the script name
 * @returns {{ok: true, specPath: string} | {ok: false, reason: string}}
 */
export function parseSpecArgument(argv) {
  if (argv.length === 0) {
    return { ok: false, reason: 'no argument was given; /educe-sequences takes the specification path and nothing else' };
  }
  if (argv.length > 1) {
    return { ok: false, reason: `two or more arguments were given: ${argv.join(', ')}; /educe-sequences takes one` };
  }

  const [given] = argv;
  if (!existsSync(given)) {
    return { ok: false, reason: `the argument does not name an existing file: ${given}` };
  }
  if (statSync(given).isDirectory()) {
    return { ok: false, reason: `the argument is a directory, not a specification file: ${given}` };
  }
  if (extname(given) === '') {
    return { ok: false, reason: `the argument has no extension, so no artifact name can be derived from it: ${given}` };
  }

  return { ok: true, specPath: isAbsolute(given) ? given : resolve(given) };
}
