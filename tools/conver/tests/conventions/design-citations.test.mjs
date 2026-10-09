// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
/**
 * design-citations — the design document's load-bearing evidence pointers resolve.
 *
 * `docs/WORKSPACIFY-4-PATTERNS-COMPLETE-DESIGN.md` rests its claims on `file:line`
 * citations: §2.1 builds the case that the fifth layer re-instantiates the four
 * layers per directory out of six such pointers, §5.1 pins the reverse command
 * file's assertions with three more, and §5.4 pins atomic publishing with two.
 * Appendix A opens by saying a reader should be able to "re-derive rather than
 * trust", which only holds while the pointers point at the thing they were read
 * from.
 *
 * They had stopped. Nine of sixteen had drifted — `scope.mjs:1222` named an
 * unrelated JSDoc 707 lines above the single `publishDocuments` call, and the range
 * that was supposed to carry §5.1's eight structural assertions was an unrelated
 * stage-ordering test, with the assertions actually defined in the test helper. The
 * document's own Appendix A.5 shows the discipline it expects ("corrected here
 * rather than left with a date that would make a current-looking number out of an
 * old run"); nothing applied it to the citations.
 *
 * This is the check that makes the next drift fail rather than mislead. Each entry
 * names the citation as the document writes it, the line it must resolve to now,
 * and a token that line must contain — so a moved definition fails on the token and
 * a renumbered document fails on the citation. Adding an entry is how a new
 * load-bearing pointer joins the set.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// [::TICKET::] PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-241 --for-spec --no-implementation-order`.

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DESIGN_PATH = join(PROJECT_ROOT, 'docs', 'archive', 'WORKSPACIFY-4-PATTERNS-COMPLETE-DESIGN.md');

/**
 * The citations the document's argument leans on.
 *
 * `asWritten` is a plain substring of the document; `line` and `token` are what the
 * reader following it must find. The token is chosen to be the part of the line that
 * says what the document claims the line says, so a line that still exists but no
 * longer carries the claim fails here rather than being counted as resolved.
 *
 * Three of these moved on 2026-09-15 when `P25-7` removed lines above them — one in
 * `run.mjs`, two in `command.test.mjs` — and each was re-measured to the line that now
 * carries its token rather than adjusted to fit.
 *
 * Seven more were re-measured on 2026-09-17. The experiment's two trees were deleted
 * and the suites that drove them were edited down, which moved lines in `command.test.mjs`
 * and `run.mjs`; the other four had drifted earlier and unnoticed, which is the drift this
 * table exists to make fail. The document was corrected beside the table, because a
 * pointer that resolves to the right line while the prose still prints the old number is
 * the same defect one reader further on.
 */
const ANCHORED_CITATIONS = Object.freeze([
  { asWritten: 'allocate-manifest.mjs:43', path: '.claude/scripts/workspacify-allocate/lib/allocate-manifest.mjs', line: 43, token: 'SEED_FILE_NAME' },
  { asWritten: 'workspacify-allocate/lib/reverse-mode.mjs:212', path: '.claude/scripts/workspacify-allocate/lib/reverse-mode.mjs', line: 212, token: 'seed-bearing package(s) holds exactly one' },
  { asWritten: 'seed-render.mjs:76', path: '.claude/scripts/workspacify-allocate/lib/seed-render.mjs', line: 76, token: 'SEED_TITLE_PREFIX}${pkg.name}' },
  { asWritten: '.claude/commands/split-to-tickets.md:47', path: '.claude/commands/split-to-tickets.md', line: 47, token: 'docs/Tickets.json' },
  { asWritten: "`ROOT_PACKAGE_PATH = '.'` (line 69)", path: '.claude/scripts/workspacify-tree/lib/structure-parity.mjs', line: 69, token: "ROOT_PACKAGE_PATH = '.'" },
  { asWritten: 'lines 126-131', path: '.claude/scripts/workspacify-tree/lib/structure-parity.mjs', line: 131, token: 'ROOT_PACKAGE_PATH : relativeDir' },
  { asWritten: 'line 172', path: '.claude/scripts/workspacify-tree/lib/structure-parity.mjs', line: 172, token: 'function packageOwnsPath' },
  { asWritten: 'drill-rfc-down/boundify-step.js:66', path: '.claude/scripts/drill-rfc-down/boundify-step.js', line: 66, token: '.delta.json' },
  { asWritten: 'command-file-digest.mjs:50', path: '.claude/scripts/workspacify-reverse/lib/command-file-digest.mjs', line: 50, token: 'COMMAND_FILE_NAMES' },
  { asWritten: 'command.test.mjs:145', path: 'tests/workspacify-reverse/integration/command.test.mjs', line: 145, token: 'a creation, not an edit' },
  { asWritten: 'command-file.mjs:270', path: 'tests/workspacify-reverse/helpers/command-file.mjs', line: 270, token: 'function assertCommandFileStructure' },
  { asWritten: 'command.test.mjs:153', path: 'tests/workspacify-reverse/integration/command.test.mjs', line: 153, token: 'assertCommandFileStructure' },
  // Re-measured 2026-10-01 by PX-231, which inserted a two-line import into scope.mjs: the
  // citation moved with the file rather than the file being kept still for the citation.
  // Re-measured again when the canonical RFC name was fixed at `RFC.md` (PX-235): the same
  // edit added the prior-partition name resolver above these two, and both moved with it.
  // [::TICKET::] PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-231 --for-spec --no-implementation-order`.
  { asWritten: 'scope.mjs:1994', path: '.claude/scripts/workspacify-reverse/lib/scope.mjs', line: 1994, token: 'replacePublishedDocuments(out, documents)' },
  { asWritten: 'scope.mjs:1833-1838', path: '.claude/scripts/workspacify-reverse/lib/scope.mjs', line: 1833, token: 'the analysis modified its target' },
  { asWritten: 'seed-local-checks.mjs:36', path: '.claude/scripts/workspacify-allocate/lib/seed-local-checks.mjs', line: 36, token: 'SEED_REQUIRED_SECTIONS.length' },
  { asWritten: 'run.mjs:383-387', path: '.claude/scripts/workspacify-reverse/run.mjs', line: 387, token: 'action: second, root: process.cwd()' },
]);

/**
 * The document, with its dashes normalised.
 *
 * The prose writes a range as an en dash (`lines 126–131`) and a citation as a
 * hyphen. Normalising both to the hyphen means an entry is written one way and
 * matches either, which keeps the table readable instead of full of escapes.
 */
const DESIGN_TEXT = readFileSync(DESIGN_PATH, 'utf8').replace(/[–—]/g, '-');

/** The line at 1-indexed `line`, or null when the file is shorter than that. */
function lineOf(relativePath, line) {
  const lines = readFileSync(join(PROJECT_ROOT, relativePath), 'utf8').split('\n');
  return line >= 1 && line <= lines.length ? lines[line - 1] : null;
}

test('the document carries every citation the argument rests on', () => {
  const absent = ANCHORED_CITATIONS.filter((entry) => !DESIGN_TEXT.includes(entry.asWritten)).map((entry) => entry.asWritten);
  assert.deepEqual(absent, [], `the document no longer writes these citations: ${absent.join(', ')}`);
});

test('every anchored citation resolves to the line that carries the claim', () => {
  const unresolved = [];
  for (const entry of ANCHORED_CITATIONS) {
    const line = lineOf(entry.path, entry.line);
    if (line === null || !line.includes(entry.token)) {
      unresolved.push(`${entry.asWritten} -> ${entry.path}:${entry.line} does not carry "${entry.token}"`);
    }
  }
  assert.deepEqual(unresolved, [], `these citations no longer resolve:\n  ${unresolved.join('\n  ')}`);
});

// ---------------------------------------------------------------------------
// Every citation, not only the load-bearing ones
// ---------------------------------------------------------------------------

/**
 * Every file under the project that a citation may name, as project-relative paths.
 *
 * `node_modules` and `.git` are skipped: a citation that resolved into either would be
 * pointing at something the document has no business citing.
 *
 * A nested `.claude` is skipped as well, and that one matters. The subject trees carry
 * their own installed copy of conver, so `drill-rfc-down/boundify-step.js` names two
 * files — the tool's and the copy inside the answer key. Neither is what the document
 * means: it cites the tool, and the copies are the drift `installed-copy-drift.test.mjs`
 * measures. Only the project's own `.claude` is indexed.
 */
function projectFiles(directory = PROJECT_ROOT, prefix = '') {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    if (entry.name === '.claude' && prefix !== '') continue;
    const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) found.push(...projectFiles(join(directory, entry.name), relativePath));
    else found.push(relativePath);
  }
  return found;
}

const PROJECT_FILES = projectFiles();

/**
 * Where a citation's path points.
 *
 * The document writes a citation from whichever root makes it shortest — `scope.mjs:1929`,
 * `workspacify-allocate/lib/reverse-mode.mjs:210`, `.claude/commands/split-to-tickets.md:37-38`
 * — so the fixed point is the path's tail. A tail matching two files is reported rather
 * than guessed at, because a citation that names either of two files names neither.
 */
function resolveCitation(citedPath) {
  const matches = PROJECT_FILES.filter(
    (file) => file === citedPath || file.endsWith(`/${citedPath}`),
  );
  return matches;
}

test('every file:line citation in the document resolves to exactly one file', () => {
  const unresolved = [];
  const seen = new Set();
  for (const [, citedPath] of DESIGN_TEXT.matchAll(/`([^`\s]+?):\d+(?:-\d+)?`/g)) {
    if (seen.has(citedPath)) continue;
    seen.add(citedPath);
    const matches = resolveCitation(citedPath);
    if (matches.length !== 1) {
      unresolved.push(`${citedPath} -> ${matches.length} file(s): ${matches.slice(0, 3).join(', ')}`);
    }
  }
  assert.deepEqual(unresolved, [], `these citations do not name one file:\n  ${unresolved.join('\n  ')}`);
});

test('every cited line is inside its file', () => {
  const outOfRange = [];
  for (const [, citedPath, start, end] of DESIGN_TEXT.matchAll(/`([^`\s]+?):(\d+)(?:-(\d+))?`/g)) {
    const [file] = resolveCitation(citedPath);
    if (file === undefined) continue;
    const lineCount = readFileSync(join(PROJECT_ROOT, file), 'utf8').split('\n').length;
    for (const cited of [start, end].filter(Boolean)) {
      if (Number(cited) > lineCount) outOfRange.push(`${citedPath}:${cited} exceeds the file's ${lineCount} lines`);
    }
  }
  assert.deepEqual(outOfRange, [], `these citations point past the end of their file:\n  ${outOfRange.join('\n  ')}`);
});

// ---------------------------------------------------------------------------
// The second design document
// ---------------------------------------------------------------------------

/**
 * `docs/EDUCE-SEQUENCES-DESIGN.md` rests on four pointers into the rail it describes:
 * the declared check array, the pin re-derivation, the citation rule that selects a
 * neighbour, and the integrator that proves a reading before it writes one. The same
 * two questions are asked of it as of the first document, because a design document
 * that is not held to its subject is a page about nothing in particular.
 */
const EDUCE_DESIGN_PATH = join(PROJECT_ROOT, 'docs', 'EDUCE-SEQUENCES-DESIGN.md');
const EDUCE_DESIGN_TEXT = readFileSync(EDUCE_DESIGN_PATH, 'utf8').replace(/[–—]/g, '-');

// [::TICKET::] PX-242 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-242 --for-spec --no-implementation-order`.
// [::TICKET::] PX-243 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-243 --for-spec --no-implementation-order`.
// [::TICKET::] PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-244 --for-spec --no-implementation-order`.
// [::TICKET::] PX-247 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-247 --for-spec --no-implementation-order`.
// [::TICKET::] PX-249 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-249 --for-spec --no-implementation-order`.
// [::TICKET::] PX-252 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-252 --for-spec --no-implementation-order`.
// [::TICKET::] PX-253 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-253 --for-spec --no-implementation-order`.
const EDUCE_ANCHORED_CITATIONS = Object.freeze([
// [::TICKET::] PX-246 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-246 --for-spec --no-implementation-order`.
  // Re-measured after the provenance annotation of PX-240 inserted one comment line per
  // file: the citation moved with the file rather than the file being kept still for it.
  { asWritten: 'pins.mjs:519', path: '.claude/scripts/educe-sequences/rail/pins.mjs', line: 519, token: 'export function rederiveAll' },
  { asWritten: 'pins.mjs:280', path: '.claude/scripts/educe-sequences/rail/pins.mjs', line: 280, token: 'export function selectNeighbourFor' },
  { asWritten: 'engine.mjs:626', path: '.claude/scripts/educe-sequences/rail/engine.mjs', line: 626, token: 'export const CHECKS' },
  { asWritten: 'reading.mjs:405', path: '.claude/scripts/educe-sequences/rail/reading.mjs', line: 405, token: 'export function applyReadings' },
  // Re-measured when PX-242 opened the run into generations: five of these moved with the
  // files that gained an import, a constant or a subcommand, and the citation followed the
  // definition rather than the definition being kept still for it. PX-243 moved seven
  // more, each by the lines its own change added above the definition. PX-244 moved five:
  // the store left the tool tree, the loader arrived, and the loader is what a citation to
  // the ad-hoc surface now resolves to. The review of all three moved five more: the audit
  // became part of what a run recorded, in one place instead of at each call site.
  { asWritten: 'gates.mjs:129', path: '.claude/scripts/educe-sequences/rail/gates.mjs', line: 129, token: 'export const PHASES' },
  { asWritten: 'phases.mjs:272', path: '.claude/scripts/educe-sequences/rail/phases.mjs', line: 272, token: 'export function runPhase' },
  { asWritten: 'run-state.mjs:170', path: '.claude/scripts/educe-sequences/rail/run-state.mjs', line: 170, token: 'export function openRun' },
  { asWritten: 'readings.mjs:253', path: '.claude/scripts/educe-sequences/rail/readings.mjs', line: 253, token: 'export function readReadingsFile' },
  { asWritten: 'adhoc.mjs:148', path: '.claude/scripts/educe-sequences/rail/adhoc.mjs', line: 148, token: 'export function scaffoldCheck' },
  // Written with its directory because `report.mjs` alone names two files in this tree,
  // and a citation that names either of two files names neither.
  { asWritten: 'rail/report.mjs:206', path: '.claude/scripts/educe-sequences/rail/report.mjs', line: 206, token: 'export function buildReport' },
  { asWritten: 'phase.mjs:329', path: '.claude/scripts/educe-sequences/rail/phase.mjs', line: 329, token: 'export async function main' },
  // Added by PX-245, which made a generation measure what it produced and stopped
  // refusing a repeat over an unchanged set. The four above were re-measured with it,
  // each by the lines the same change added above the definition.
  // Re-measured by PX-251, which moved four of these by the lines its own change added
  // above the definition. The citation follows the definition rather than the definition
  // being kept still for it — engine.mjs gained the vocabulary import it re-exports,
  // coverage.mjs gained the partitions and the predecessor mapping, and report.mjs gained
  // the per-term block and the shared annotation.
  { asWritten: 'coverage.mjs:239', path: '.claude/scripts/educe-sequences/rail/coverage.mjs', line: 239, token: 'export function coverageOf' },
  { asWritten: 'rail/report.mjs:144', path: '.claude/scripts/educe-sequences/rail/report.mjs', line: 144, token: 'function coverageLines' },
  { asWritten: 'gates.mjs:474', path: '.claude/scripts/educe-sequences/rail/gates.mjs', line: 474, token: 'export function unchangedRepeatReason' },
  // Re-measured by PX-253, which moved two of these by the lines its own change added
  // above the definition: the phase 9 action reads the artifact it replaces before
  // composing, so `runPhase` and `beginRun` both sit below the comparison it now holds.
  { asWritten: 'phases.mjs:422', path: '.claude/scripts/educe-sequences/rail/phases.mjs', line: 422, token: 'export function beginRun' },
]);

test('the educe-sequences document carries every citation its argument rests on', () => {
  const absent = EDUCE_ANCHORED_CITATIONS.filter((entry) => !EDUCE_DESIGN_TEXT.includes(entry.asWritten)).map((entry) => entry.asWritten);
  assert.deepEqual(absent, [], `the document no longer writes these citations: ${absent.join(', ')}`);
});

test('every anchored educe-sequences citation resolves to the line that carries the claim', () => {
  const unresolved = [];
  for (const entry of EDUCE_ANCHORED_CITATIONS) {
    const line = lineOf(entry.path, entry.line);
    if (line === null || !line.includes(entry.token)) {
      unresolved.push(`${entry.asWritten} -> ${entry.path}:${entry.line} does not carry "${entry.token}"`);
    }
  }
  assert.deepEqual(unresolved, [], `these citations no longer resolve:\n  ${unresolved.join('\n  ')}`);
});

test('every file:line citation in the educe-sequences document resolves to exactly one file', () => {
  const unresolved = [];
  const seen = new Set();
  for (const [, citedPath] of EDUCE_DESIGN_TEXT.matchAll(/`([^`\s]+?):\d+(?:-\d+)?`/g)) {
    if (seen.has(citedPath)) continue;
    seen.add(citedPath);
    const matches = resolveCitation(citedPath);
    if (matches.length !== 1) {
      unresolved.push(`${citedPath} -> ${matches.length} file(s): ${matches.slice(0, 3).join(', ')}`);
    }
  }
  assert.deepEqual(unresolved, [], `these citations do not name one file:\n  ${unresolved.join('\n  ')}`);
});

test('every educe-sequences cited line is inside its file', () => {
  const outOfRange = [];
  for (const [, citedPath, start, end] of EDUCE_DESIGN_TEXT.matchAll(/`([^`\s]+?):(\d+)(?:-(\d+))?`/g)) {
    const [file] = resolveCitation(citedPath);
    if (file === undefined) continue;
    const lineCount = readFileSync(join(PROJECT_ROOT, file), 'utf8').split('\n').length;
    for (const cited of [start, end].filter(Boolean)) {
      if (Number(cited) > lineCount) outOfRange.push(`${citedPath}:${cited} exceeds the file's ${lineCount} lines`);
    }
  }
  assert.deepEqual(outOfRange, [], `these citations point past the end of their file:\n  ${outOfRange.join('\n  ')}`);
});
