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

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DESIGN_PATH = join(PROJECT_ROOT, 'docs', 'WORKSPACIFY-4-PATTERNS-COMPLETE-DESIGN.md');
const ANALYSIS_DIRECTORY = join(PROJECT_ROOT, 'tests', 'workspacify-reverse', 'analysis');

const DESIGN_TEXT = readFileSync(DESIGN_PATH, 'utf8');

/** The text between two `###` headings, exclusive of both. */
// [::TICKET::] P26-1, P25-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P26-1|P25-7) --for-spec --no-implementation-order`.
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
 * §2.3 writes the three status files as one shorthand — `RFC-<PKG>-{GRAPHIFY,
 * BOUNDIFY,SPLIT}-Status.json` — so a reader counts three names where a literal
 * comparison sees one. Expanding is what lets the page's list and the instrument's
 * list be compared at all.
 */
// [::TICKET::] P26-1, P25-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P26-1|P25-7) --for-spec --no-implementation-order`.
function expandBraceShorthands(text) {
  // Only a brace carrying a comma is a shorthand. `{package}` is the name slot — the
  // instrument writes `RFC-{package}-GRAPH.json` and expanding the slot would rewrite
  // every template into a name nothing declares.
  const shorthand = /\{([^{}]*,[^{}]*)\}/.exec(text);
  if (shorthand === null) return [text];
  const [whole, options] = shorthand;
  return options
    .split(',')
    .flatMap((option) => expandBraceShorthands(text.replace(whole, option)));
}

/**
 * The artefact names §2.3 writes, with `<PKG>` normalised and shorthands expanded.
 *
 * A span is added as written *and* as expanded: `RFC-{package}.md` is the name the
 * instrument declares, and expanding its braces would rewrite it into a name nothing
 * declares. Only the shorthand spans have a form worth expanding, and taking both
 * costs nothing.
 */
// [::TICKET::] P26-1, P25-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P26-1|P25-7) --for-spec --no-implementation-order`.
function declaredInventories() {
  const section = sectionBetween('### 2.3', '### 2.4');
  const names = new Set();
  const add = (name) => {
    if (/\.(json|md)$/.test(name)) names.add(name);
  };
  for (const [, span] of section.matchAll(/`([^`]+)`/g)) {
    const normalized = span.replace(/<PKG>/g, '{package}');
    add(normalized);
    for (const expanded of expandBraceShorthands(normalized)) add(expanded);
  }
  return names;
}

test('§2.3 names every artefact the terminal-state instrument measures against', () => {
  const declared = declaredInventories();
  // §2.3 states the fourth layer once, as the template every package follows, and the
  // workspace root is a package under the path `.` (§2.1). So a root artefact is listed
  // when the template that would name it for any other package is listed.
  const asTemplate = (name) => name.replace(/^RFC-ROOT/, 'RFC-{package}');
  const measured = [
    ...TERMINAL_ARTEFACTS.root,
    ...TERMINAL_ARTEFACTS.fifthLayer,
    ...TERMINAL_ARTEFACTS.package,
    ...TERMINAL_ARTEFACTS.packageNamed,
    ...TERMINAL_ARTEFACTS.packageFifthLayer,
  ];
  const absent = measured.filter((name) => !declared.has(name) && !declared.has(asTemplate(name)));
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
// [::TICKET::] P26-1, P25-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P26-1|P25-7) --for-spec --no-implementation-order`.
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
  // section a rewriter is told not to produce, which is how the file came to carry
  // "Two modes, never conflated" — required by §5.8 — while §5.3 said nothing of it.
  const missing = [...command.matchAll(/^## (.+)$/gm)]
    .map(([, title]) => title.trim())
    .filter((title) => !block.includes(title));
  assert.deepEqual(missing, [], `§5.3 does not list ${missing.join(', ')}, which the file carries`);
});
