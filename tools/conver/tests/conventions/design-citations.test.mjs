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

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DESIGN_PATH = join(PROJECT_ROOT, 'docs', 'WORKSPACIFY-4-PATTERNS-COMPLETE-DESIGN.md');

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
 */
// [::TICKET::] PX-213 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-213 --for-spec --no-implementation-order`.
// [::TICKET::] PX-214 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-214 --for-spec --no-implementation-order`.
// [::TICKET::] P26-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-2 --for-spec --no-implementation-order`.
const ANCHORED_CITATIONS = Object.freeze([
  { asWritten: 'allocate-manifest.mjs:43', path: '.claude/scripts/workspacify-allocate/lib/allocate-manifest.mjs', line: 43, token: 'SEED_FILE_NAME' },
  { asWritten: 'workspacify-allocate/lib/reverse-mode.mjs:212', path: '.claude/scripts/workspacify-allocate/lib/reverse-mode.mjs', line: 212, token: 'seed-bearing package(s) holds exactly one' },
  { asWritten: 'seed-render.mjs:76', path: '.claude/scripts/workspacify-allocate/lib/seed-render.mjs', line: 76, token: 'SEED_TITLE_PREFIX}${pkg.name}' },
  { asWritten: '.claude/commands/split-to-tickets.md:46-47', path: '.claude/commands/split-to-tickets.md', line: 47, token: 'docs/Tickets.json' },
  { asWritten: "`ROOT_PACKAGE_PATH = '.'` (line 69)", path: '.claude/scripts/workspacify-tree/lib/structure-parity.mjs', line: 69, token: "ROOT_PACKAGE_PATH = '.'" },
  { asWritten: 'lines 126-131', path: '.claude/scripts/workspacify-tree/lib/structure-parity.mjs', line: 131, token: 'ROOT_PACKAGE_PATH : relativeDir' },
  { asWritten: 'line 172', path: '.claude/scripts/workspacify-tree/lib/structure-parity.mjs', line: 172, token: 'function packageOwnsPath' },
  { asWritten: 'drill-rfc-down/boundify-step.js:66', path: '.claude/scripts/drill-rfc-down/boundify-step.js', line: 66, token: '.delta.json' },
  { asWritten: 'command-file-digest.mjs:50', path: '.claude/scripts/workspacify-reverse/lib/command-file-digest.mjs', line: 50, token: 'COMMAND_FILE_NAMES' },
  { asWritten: 'command.test.mjs:147', path: 'tests/workspacify-reverse/integration/command.test.mjs', line: 147, token: 'a creation, not an edit' },
  { asWritten: 'command-file.mjs:214', path: 'tests/workspacify-reverse/helpers/command-file.mjs', line: 214, token: 'function assertCommandFileStructure' },
  { asWritten: 'command.test.mjs:155', path: 'tests/workspacify-reverse/integration/command.test.mjs', line: 155, token: 'assertCommandFileStructure' },
  { asWritten: 'scope.mjs:1973', path: '.claude/scripts/workspacify-reverse/lib/scope.mjs', line: 1973, token: 'replacePublishedDocuments(out, documents)' },
  { asWritten: 'scope.mjs:1833-1837', path: '.claude/scripts/workspacify-reverse/lib/scope.mjs', line: 1834, token: 'the analysis modified its target' },
  { asWritten: 'seed-local-checks.mjs:36', path: '.claude/scripts/workspacify-allocate/lib/seed-local-checks.mjs', line: 36, token: 'SEED_REQUIRED_SECTIONS.length' },
  { asWritten: 'run.mjs:336-341', path: '.claude/scripts/workspacify-reverse/run.mjs', line: 341, token: 'action: second, root: process.cwd()' },
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
// [::TICKET::] P26-1, P25-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P26-1|P25-7) --for-spec --no-implementation-order`.
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
// [::TICKET::] P26-1, P25-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P26-1|P25-7) --for-spec --no-implementation-order`.
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
// [::TICKET::] P26-1, P25-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P26-1|P25-7) --for-spec --no-implementation-order`.
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
