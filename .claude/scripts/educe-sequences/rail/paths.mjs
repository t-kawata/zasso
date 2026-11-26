// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
// path derivation for the fixed-specification contract (PX-240, PX-454, contract C010).
//
// The output location depends only on the argument, so a run and a verification
// need nothing beyond the specification path. Two consequences are
// deliberate: no flag, environment variable or configuration reaches this module,
// and only the final extension is removed, so a name such as `spec.v32.final.md`
// yields `spec.v32.final-sequences.json` rather than losing `final` as well.
import { existsSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import process from 'node:process';
// [::TICKET::] PX-241 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-241 --for-spec --no-implementation-order`.

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

/** The fixed specification name at the workspace root. */
export const SYSTEM_DESIGN_FILE_NAME = 'SYSTEM-DESIGN.md';

/**
 * Resolve the fixed specification.
 *
 * The command takes no argument. The specification is always SYSTEM-DESIGN.md in
 * the workspace root, which is the caller's cwd; an absent file is refused by
 * name rather than falling back to another document.
 *
 * @param {string[]} argv — the arguments after the script name
 * @param {string} [cwd] — the workspace root; defaults to the process cwd
 * @returns {{ok: true, specPath: string} | {ok: false, reason: string}}
 */
export function parseSpecArgument(argv, cwd = process.cwd()) {
  if (argv.length > 1) {
    return { ok: false, reason: `the command takes no argument; ${argv.length} were given: ${argv.join(', ')}` };
  }

  const given = argv.length === 1 ? String(argv[0] ?? '').trim() : '';
  if (given !== '') {
    return {
      ok: false,
      reason: `the command takes no argument; the specification is ${SYSTEM_DESIGN_FILE_NAME} at the workspace root`,
    };
  }

  const specPath = resolve(cwd, SYSTEM_DESIGN_FILE_NAME);
  if (!existsSync(specPath)) {
    return { ok: false, reason: `the workspace root ${cwd} has no ${SYSTEM_DESIGN_FILE_NAME}` };
  }
  return { ok: true, specPath };
}
