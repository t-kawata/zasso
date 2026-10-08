/**
 * design-measurements — the numbers and lists the design document states are held
 * to the repository they describe.
 *
 * The document asks to be re-derived rather than trusted: Appendix A exists so that
 * "a reader can re-derive rather than trust", and A.5 re-dates itself in as many
 * words — "corrected here rather than left with a date that would make a
 * current-looking number out of an old run". Two places had stopped obeying that.
 *
 * §2.3 declares the terminal-state inventory, and the instrument that measures
 * against it (`terminal-state.mjs`) declares its own copy as data. They disagreed:
 * the instrument counts `DesignTree.json` among the root artefacts and the page did
 * not, so the page described an inventory one element short of the one every
 * observation is actually measured against. §A.1 said the analysis publishes 21
 * documents and that the directory beside it holds the sidecars of a `--through=r5.5`
 * run; the directory held 30 documents of a run that went to the exit.
 *
 * Neither is caught by reading harder. Both are caught by comparing the page against
 * the thing it is a page about, which is what this does.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TERMINAL_ARTEFACTS } from '../../.claude/scripts/workspacify-reverse/lib/terminal-state.mjs';
import { ENGINE_DECLARED_CHECK_COUNT } from '../../.claude/scripts/educe-sequences/rail/engine.mjs';
import { flattenPins } from '../../.claude/scripts/educe-sequences/rail/pins.mjs';
// [::TICKET::] PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-241 --for-spec --no-implementation-order`.

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DESIGN_PATH = join(PROJECT_ROOT, 'docs', 'archive', 'WORKSPACIFY-4-PATTERNS-COMPLETE-DESIGN.md');
const ANALYSIS_DIRECTORY = join(PROJECT_ROOT, 'tests', 'workspacify-reverse', 'analysis');

const DESIGN_TEXT = readFileSync(DESIGN_PATH, 'utf8');

/** The text between two `###` headings, exclusive of both. */
function sectionBetween(fromHeading, toHeading) {
  const from = DESIGN_TEXT.indexOf(fromHeading);
  const to = DESIGN_TEXT.indexOf(toHeading, from + 1);
  assert.notEqual(from, -1, `the document has no ${fromHeading}`);
  assert.notEqual(to, -1, `the document has no ${toHeading} after ${fromHeading}`);
  return DESIGN_TEXT.slice(from + fromHeading.length, to);
}

/**
 * Every name a brace shorthand stands for.
 *
 * §2.3 writes the three status files as one shorthand — `RFC-{GRAPHIFY,BOUNDIFY,SPLIT}-
 * Status.json` — so a reader counts three names where a literal comparison sees one.
 * Expanding is what lets the page's list and the instrument's list be compared at all.
 */
function expandBraceShorthands(text) {
  // Only a brace carrying a comma is a shorthand. A brace holding one word is part of the
  // name itself, and expanding it would rewrite that name into one nothing declares.
  const shorthand = /\{([^{}]*,[^{}]*)\}/.exec(text);
  if (shorthand === null) return [text];
  const [whole, options] = shorthand;
  return options
    .split(',')
    .flatMap((option) => expandBraceShorthands(text.replace(whole, option)));
}

/**
 * The artefact names §2.3 writes, with shorthands expanded.
 *
 * A span is added as written *and* as expanded: §2.3 writes the status files once, as
 * `RFC-{GRAPHIFY,BOUNDIFY,SPLIT}-Status.json`, and the instrument declares three names.
 * A span that is not a shorthand has a single form, and taking both costs nothing.
 */
function declaredInventories() {
  const section = sectionBetween('### 2.3', '### 2.4');
  const names = new Set();
  const add = (name) => {
    if (/\.(json|md)$/.test(name)) names.add(name);
  };
  for (const [, span] of section.matchAll(/`([^`]+)`/g)) {
    add(span);
    for (const expanded of expandBraceShorthands(span)) add(expanded);
  }
  return names;
}

test('§2.3 names every artefact the terminal-state instrument measures against', () => {
  const declared = declaredInventories();
  // §2.3 states the fourth layer once, and the workspace root is a package under the path
  // `.` (§2.1). Since the canonical RFC name is fixed at `RFC.md`, the root and a nested
  // package name their artefacts identically and the one list covers both.
  const measured = [
    ...TERMINAL_ARTEFACTS.root,
    ...TERMINAL_ARTEFACTS.fifthLayer,
    ...TERMINAL_ARTEFACTS.package,
    ...TERMINAL_ARTEFACTS.packageNamed,
    ...TERMINAL_ARTEFACTS.packageFifthLayer,
  ];
  const absent = measured.filter((name) => !declared.has(name));
  assert.deepEqual(
    absent,
    [],
    `§2.3 does not list ${absent.join(', ')}, which the instrument counts — the page would describe an inventory the observation is not measured against`,
  );
});

test('§A.1 states the number of documents the directory it describes actually holds', () => {
  const stated = /(\d+) of them, committed/.exec(DESIGN_TEXT);
  assert.notEqual(stated, null, '§A.1 states how many documents the held run published');
  const onDisk = readdirSync(ANALYSIS_DIRECTORY).length;
  assert.equal(
    Number(stated[1]),
    onDisk,
    `§A.1 says the held run published ${stated[1]} documents; the directory holds ${onDisk}`,
  );
});

test('§A.1 accounts for the difference between what the run published and what the directory holds', () => {
  // The two numbers describe different things and the document has to say so: the
  // transcript records what one run published, and the sentence beside it records what
  // the committed directory holds now. They were equal until a document left with the
  // tool that produced it, so the difference is exactly what the record names.
  const published = /# → (\d+) documents published/.exec(DESIGN_TEXT);
  assert.notEqual(published, null, 'Appendix A.1 records the published count');

  const held = /(\d+) of them, committed/.exec(DESIGN_TEXT);
  assert.notEqual(held, null, '§A.1 states how many documents the directory holds');

  // The comma after `those` is load-bearing: the document says "seven of those nine"
  // elsewhere, and the record this reads is the one that counts documents rather than
  // modules. The span is bounded rather than sentence-shaped because the sentence names
  // a file, and a file name carries a period.
  const left = /(\d+) of those,[\s\S]{0,300}?\bremoved\b/.exec(DESIGN_TEXT);
  assert.notEqual(left, null, '§A.1 says how many documents left the directory, and why');

  assert.equal(
    Number(published[1]) - Number(held[1]),
    Number(left[1]),
    'the published count and the held count differ by exactly what the record says was removed',
  );
});

// ---------------------------------------------------------------------------
// §5.3 — the structure the command file must take
// ---------------------------------------------------------------------------

/** The fenced block §5.3 draws the command file's section order from. */
function declaredStructureBlock() {
  const section = sectionBetween('### 5.3', '### 5.4');
  const fenced = /```\n([\s\S]*?)```/.exec(section);
  assert.notEqual(fenced, null, '§5.3 draws the structure as a fenced block');
  return fenced[1];
}

test('§5.3 lists every section the command file carries', () => {
  const block = declaredStructureBlock();
  const command = readFileSync(join(PROJECT_ROOT, '.claude', 'commands', 'workspacify-reverse.md'), 'utf8');
  // The block writes a section either as a heading or as a bare name, so the fixed
  // point is the title rather than the line. A section the block does not name is a
  // section a rewriter is told not to produce — the two can drift in that direction
  // only, which is why this assertion reads the file and not the block.
  const missing = [...command.matchAll(/^## (.+)$/gm)]
    .map(([, title]) => title.trim())
    .filter((title) => !block.includes(title));
  assert.deepEqual(missing, [], `§5.3 does not list ${missing.join(', ')}, which the file carries`);
});

// ---------------------------------------------------------------------------
// The educe-sequences design document
// ---------------------------------------------------------------------------

/**
 * The second design document states three quantities about its own subject: how large
 * the frozen corpus is, how many checks the engine declares, and how many pins a run
 * re-derives. Each is held to the repository here, because a page that prints a number
 * about a live instrument is a page that goes stale the moment the instrument changes —
 * and the stale number reads exactly like a current one.
 */
const EDUCE_DESIGN_TEXT = readFileSync(join(PROJECT_ROOT, 'docs', 'EDUCE-SEQUENCES-DESIGN.md'), 'utf8');
const EDUCE_CORPUS = join(PROJECT_ROOT, 'tests', 'educe-sequences', 'fixtures', 'gaia');
const EDUCE_GOLDEN_ARTIFACT = join(PROJECT_ROOT, 'tests', 'educe-sequences', 'fixtures', 'spec', 'ledger-sequences.json');

test('the educe-sequences document states the corpus size the corpus has', () => {
  const stated = /The corpus holds (\d+) files totalling (\d+) bytes/.exec(EDUCE_DESIGN_TEXT);
  assert.notEqual(stated, null, 'the document states the size of the corpus it describes');

  const files = Object.values(JSON.parse(readFileSync(join(EDUCE_CORPUS, 'MANIFEST.json'), 'utf8')).files);
  assert.equal(Number(stated[1]), files.length, 'the stated file count is the manifest\'s');
  assert.equal(Number(stated[2]), files.reduce((total, file) => total + file.bytes, 0), 'the stated byte count is the manifest\'s');
});

test('the educe-sequences document states the check and pin counts the run reports', () => {
  const stated = /reports (\d+) checks over (\d+) pins/.exec(EDUCE_DESIGN_TEXT);
  assert.notEqual(stated, null, 'the document states what a green run reports');

  assert.equal(Number(stated[1]), ENGINE_DECLARED_CHECK_COUNT);
  const artifact = JSON.parse(readFileSync(EDUCE_GOLDEN_ARTIFACT, 'utf8'));
  assert.equal(Number(stated[2]), flattenPins(artifact.pins).length);
});
