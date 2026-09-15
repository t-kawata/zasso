// [::TICKET::] P25-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-7 --for-spec --no-implementation-order`.
/**
 * removed-tool-residue — no live surface still names a tool this project removed.
 *
 * The serving layer once asked an external search CLI for candidate material. P25-7
 * removed it: the module, the option that asked the question, the section it printed,
 * the environment declaration, the tests and the published artefact. What is left to
 * guard is the name, because a reader who meets it in a live file is being told to use
 * something that is not there.
 *
 * Two kinds of file are not a live surface, and both exemptions are asserted rather
 * than assumed. The frozen records keep their text because their subject is what past
 * tickets did — a test that forbade them the name would forbid the audit trail from
 * being one. And this file exempts itself, because a guard that searches for a spelling
 * has to contain it; the self-exemption is a constant, asserted to name exactly this
 * path, so it cannot widen into a hole.
 *
 * One further line may carry a name: the paragraph in the design document that records
 * the removal. A reader who meets the name there learns it is gone, which is the
 * opposite of the defect this guards, and the paragraph's existence is asserted so the
 * permission cannot outlive the record it was granted for.
 *
 * A tracked file the scan cannot read as text is reported rather than passed over in
 * silence. The instrument's own rule is that a missing search must never read as a
 * search that found nothing, and a scan that quietly skipped a file would be that same
 * mistake in a different place.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COMMITTED_BUNDLE_PATH } from '../lib/bundle-freshness.mjs';
import { repositoryRootFrom, trackedPaths } from '../lib/repo-hygiene.mjs';

const REPOSITORY_ROOT = repositoryRootFrom(dirname(fileURLToPath(import.meta.url)));
const DESIGN_PATH = 'tools/conver/docs/WORKSPACIFY-4-PATTERNS-COMPLETE-DESIGN.md';

/** This file, the one path the scan exempts because it carries the names it searches for. */
const SELF_PATH = 'tools/conver/tests/conventions/removed-tool-residue.test.mjs';

/**
 * The instrument's own source — its modules and its command definitions.
 *
 * A file here that the scan cannot read is a finding rather than a skip, because this
 * tree is the instrument and the instrument is source. The published artefacts beside
 * it are not: a run's JSON is data and outgrows the cap below, which is why the trees
 * are named at this depth rather than one level up.
 */
const INSTRUMENT_SOURCE_ROOTS = Object.freeze([
  'tools/conver/.claude/',
  '.claude/',
  'crates/siprs/.claude/',
]);

/**
 * The tool's spellings, as patterns rather than as one name.
 *
 * A pattern catches the same name written a second way — a path, a constant, a
 * suffixed identifier — so a reintroduction does not have to reproduce the exact
 * spelling this list happens to hold.
 */
const DISTINCTIVE_IDENTIFIERS = Object.freeze([
  /zvec-grep/i,
  /ZG-CANDIDATES/,
  /\bprobeZg\b/,
  /ZG_SEARCH_MODES/,
  /zg-probe/,
]);

/**
 * The tool's bare name, which is two letters and therefore a weak signal.
 *
 * It is searched everywhere except the two places where it was measured to be
 * something else. In other people's trees it matches a base64 fragment (`"Zg=="`, a
 * test vector in pjsip's encryption test); in the committed conver bundle it matches a
 * minifier's local variable (`zg=Eh(...)`, in the built output of `src/entry.ts`).
 * Both are withdrawn by path rather than by guesswork, and the bundle needs no scan of
 * its own: this scan reads the source it is built from.
 */
const BARE_NAME = /\bzg\b/i;

/** Trees holding other people's code, where a two-letter name belongs to them. */
const THIRD_PARTY_TREE = /\/(vendor|third_party|node_modules)\//;

/**
 * The committed bundle and its installed copies, named from the declaration that
 * already owns them.
 *
 * `bundle-freshness.test.mjs` reads the same two constants to prove the artefact is
 * what the entry point builds, so a second spelling here would be a second thing to
 * drift from the build it describes.
 */
const BUNDLE_BASENAME = basename(COMMITTED_BUNDLE_PATH);
const INSTALLED_BUNDLE_DIRECTORY = 'scripts/conver';

const isGeneratedBundle = (path) =>
  path === COMMITTED_BUNDLE_PATH || path.endsWith(`/${INSTALLED_BUNDLE_DIRECTORY}/${BUNDLE_BASENAME}`);

/**
 * The records that keep their text: what past tickets did, not what to do now.
 *
 * Each is asserted to exist, so an exemption cannot outlive the file it names.
 */
const FROZEN_RECORDS = Object.freeze([
  'tools/conver/specs/',
  'tools/conver/tickets/specs/',
  'tools/conver/Tickets.json',
  'tools/conver/docs/P22-HANDOFF.md',
  'tools/conver/docs/REVIEW-2-FOR-ABOUT-REVERSE.md',
]);

/**
 * A file larger than this is data rather than a surface an instruction lives in.
 *
 * The measurement is why the cap exists: this repository tracks 526 MB, most of it
 * archives and shared libraries, and reading those to search for a word would cost the
 * whole run without adding a surface that can tell anyone to do anything.
 */
const MAX_SCANNED_BYTES = 2 * 1024 * 1024;

/**
 * Whether a line names the tool.
 *
 * A distinctive spelling is a finding wherever it appears: none of them is a
 * coincidence. The bare name is a finding only where a person could have written the
 * line, and the two conditions that withdraw it are each a measurement rather than a
 * precaution — see where they are declared.
 *
 * @param {string} line
 * @param {string} path - repository-relative, so a third-party tree can be recognised
 * @returns {boolean}
 */
// [::TICKET::] P25-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-7 --for-spec --no-implementation-order`.
function namesTheTool(line, path) {
  if (DISTINCTIVE_IDENTIFIERS.some((pattern) => pattern.test(line))) return true;
  if (isGeneratedBundle(path)) return false;
  if (THIRD_PARTY_TREE.test(path)) return false;
  return BARE_NAME.test(line);
}

/** The line numbers in `text` that name the tool, given where the file sits. */
// [::TICKET::] P25-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-7 --for-spec --no-implementation-order`.
function findIdentifiers(text, path = '') {
  const found = [];
  text.split('\n').forEach((line, index) => {
    if (namesTheTool(line, path)) found.push(index + 1);
  });
  return found;
}

/**
 * The lines of the design document that may carry a name: those in the paragraph that
 * records the removal.
 *
 * A paragraph rather than a line, because prose wraps — the sentence naming the document
 * and the verb saying it left land on different lines, and a rule requiring both on one
 * line would be a rule about the width of the page rather than about what the reader is
 * told. A fenced block is excluded: it quotes a command's output rather than a sentence
 * someone wrote, and output is where a name is a residue rather than a record.
 *
 * @param {string} text
 * @returns {number[]} 1-indexed line numbers
 */
// [::TICKET::] P25-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-7 --for-spec --no-implementation-order`.
function removalRecordLines(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => /^### A\.1/.test(line));
  if (start === -1) return [];

  const permitted = [];
  let paragraph = [];
  let inFence = false;
  const flush = () => {
    if (paragraph.length > 0 && paragraph.some(({ line }) => /removed/i.test(line))) {
      permitted.push(...paragraph.map(({ number }) => number));
    }
    paragraph = [];
  };

  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    // The fence is decided first, because a transcript's own comment lines begin with
    // `#` and would otherwise read as the end of the section it is quoted inside.
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (index > start && /^#{1,3} /.test(line)) break;
    if (line.trim() === '') flush();
    else paragraph.push({ line, number: index + 1 });
  }
  flush();
  return permitted;
}

/**
 * A file the scan will read, or the reason it will not.
 *
 * Text is decided by content rather than by extension: a `.json` holding bytes and a
 * `.bin` holding prose are both possible, and the question the scan asks is whether a
 * reader could be told anything by what the file holds.
 *
 * A path the working tree does not hold as a file — an entry the index carries and the
 * disk does not, or a path that is a directory — is not a surface anyone can be told to
 * open, so it is skipped. The source trees below are the exception to skipping, and the
 * reason is stated where they are declared.
 *
 * @param {string} absolutePath
 * @returns {{ readable: true, text: string } | { readable: false, reason: string }}
 */
// [::TICKET::] P25-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-7 --for-spec --no-implementation-order`.
function readIfText(absolutePath) {
  let stats;
  try {
    stats = statSync(absolutePath);
  } catch {
    return { readable: false, reason: 'is not in the working tree' };
  }
  if (!stats.isFile()) return { readable: false, reason: 'is not a file' };
  if (stats.size > MAX_SCANNED_BYTES) {
    return { readable: false, reason: `is larger than ${MAX_SCANNED_BYTES} bytes` };
  }
  const bytes = readFileSync(absolutePath);
  if (bytes.includes(0)) return { readable: false, reason: 'carries a NUL byte' };
  try {
    return { readable: true, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { readable: false, reason: 'is not UTF-8' };
  }
}

const isFrozen = (path) => FROZEN_RECORDS.some((name) => path === name || path.startsWith(name));

const isInstrumentSource = (path) => INSTRUMENT_SOURCE_ROOTS.some((root) => path.startsWith(root));

test('no live surface still names the removed tool', () => {
  const designLines = removalRecordLines(readFileSync(join(REPOSITORY_ROOT, DESIGN_PATH), 'utf8'));
  const offending = [];
  const unreadable = [];

  for (const path of trackedPaths(REPOSITORY_ROOT)) {
    if (path === SELF_PATH || isFrozen(path)) continue;
    const read = readIfText(join(REPOSITORY_ROOT, path));
    if (!read.readable) {
      if (isInstrumentSource(path)) unreadable.push(`${path} (${read.reason})`);
      continue;
    }
    for (const line of findIdentifiers(read.text, path)) {
      if (path === DESIGN_PATH && designLines.includes(line)) continue;
      offending.push(`${path}:${line}`);
    }
  }

  assert.deepEqual(
    offending,
    [],
    `these lines still name a tool this project removed:\n  ${offending.join('\n  ')}`,
  );
  assert.deepEqual(
    unreadable,
    [],
    `the scan could not read these files, so it cannot say they are clean:\n  ${unreadable.join('\n  ')}`,
  );
});

test('every frozen record named as an exemption exists', () => {
  const missing = FROZEN_RECORDS.filter((path) => !existsSync(join(REPOSITORY_ROOT, path)));
  assert.deepEqual(missing, [], `these exemptions name nothing: ${missing.join(', ')}`);
});

test('the scan exempts its own file and no other', () => {
  assert.equal(existsSync(join(REPOSITORY_ROOT, SELF_PATH)), true, 'the exemption names this file');
  assert.deepEqual(
    findIdentifiers(`the guard lives at ${SELF_PATH}`),
    [],
    'the exemption is a path rather than a spelling, so naming it is not itself a finding',
  );
});

test('the design document records the removal, which is what the one permitted line is for', () => {
  const recorded = removalRecordLines(readFileSync(join(REPOSITORY_ROOT, DESIGN_PATH), 'utf8'));
  assert.notEqual(
    recorded.length,
    0,
    'the permission to name the tool inside §A.1 is granted for a record, and the record is not there',
  );
});

test('the scan reports a reintroduced spelling by line, so a green run is a measurement', () => {
  assert.deepEqual(findIdentifiers("const tool = 'zg';\n", 'tools/conver/README.md'), [1]);
  assert.deepEqual(findIdentifiers('// candidates came from zvec-grep\n', 'tools/conver/src/a.ts'), [1]);
  assert.deepEqual(findIdentifiers("import { probeZg } from './lib/zg-probe.mjs';\n", 'x.mjs'), [1]);
  assert.deepEqual(findIdentifiers("const unrelated = 'zigzag';\n", 'tools/conver/README.md'), []);
  assert.deepEqual(findIdentifiers('const rows = [];\n', 'tools/conver/README.md'), []);
});

test('the two measured false positives are withdrawn, and only where they were measured', () => {
  // A base64 test vector in someone else's tree: the bare name, and nothing else.
  assert.deepEqual(findIdentifiers('        "Zg==",\n', 'tools/conver/siprs/vendor/pjsip/test.c'), []);
  assert.deepEqual(
    findIdentifiers('        "Zg==", // zvec-grep\n', 'tools/conver/siprs/vendor/pjsip/test.c'),
    [1],
    'a distinctive spelling in the same tree is still a finding',
  );

  // A minifier's local variable, in the built artefact of a source this scan reads.
  for (const path of [COMMITTED_BUNDLE_PATH, 'crates/siprs/.claude/scripts/conver/conver.js']) {
    assert.deepEqual(findIdentifiers('_d=Ft.ticketCount-Lt.ticketCount,zg=Eh(e.ticketsPath);\n', path), []);
    assert.deepEqual(
      findIdentifiers('const notes = "zvec-grep";\n', path),
      [1],
      'a distinctive spelling in the bundle is still a finding',
    );
  }

  // A bare name is a finding again the moment the file is not the artefact.
  assert.deepEqual(findIdentifiers('const tool = zg;\n', 'tools/conver/src/entry.ts'), [1]);
});
