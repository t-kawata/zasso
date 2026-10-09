#!/usr/bin/env node
// [::TICKET::] PX-250 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-250 --for-spec --no-implementation-order`.
/**
 * text.mjs — read a sequence artifact at a console.
 *
 * Usage:
 *   text.mjs <artifact>.json --list
 *   text.mjs <artifact>.json --id <sequence> [--id <sequence>…] [--ascii] [--width <columns>]
 *   text.mjs <artifact>.json --id <sequence> [--id <sequence>…] --mermaid
 *
 * Three readings of one artifact and one generator behind them: `--list` says what the
 * artifact holds, `--id` draws a chosen sequence, and `--mermaid` prints the source the
 * drawing was made from. The raw mode prints exactly the bytes the fence in
 * `<spec>-sequences.md` carries, so a diagram and the source printed for it cannot disagree.
 *
 * The library that turns that source into a picture is reached by the drawn mode alone, and
 * by an import that happens when that mode runs. A machine that has never run `install.js`
 * can still list the artifact and print the Mermaid for any sequence in it.
 *
 * The file is read and never written: this is a reader, so it cannot damage an artifact the
 * rail produced or the specification beside it.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { DIAGRAMMED_OUTCOMES } from './engine.mjs';
import { participantsOf, sequenceDiagramSource } from './harness.mjs';

/**
 * How the command answers. `REFUSED` is a statement about the artifact, `MISUSED` one about
 * the invocation; both write nothing, because a refusal that printed a partial reading would
 * be indistinguishable from a reading.
 */
export const TEXT_EXIT = Object.freeze({ OK: 0, REFUSED: 1, MISUSED: 2 });

/** The budget used when the output is not a terminal and no width was asked for. */
export const DEFAULT_WIDTH = 120;

/** The narrowest budget the command accepts, and the floor the fold never divides by. */
export const MIN_WIDTH = 20;

/**
 * What a folded message is joined with.
 *
 * A Mermaid message is one line, so a fold has to be expressed inside the message. This is
 * the only separator that both Mermaid and the rendering library read as a line break, and
 * that survives `encodeForDiagram` — it holds no character that position escapes.
 */
export const FOLD_SEPARATOR = '<br/>';

/** The narrowest message budget the fitting loop will try before it reports what it reached. */
export const MIN_MESSAGE_WIDTH = 8;

/** How many times the fitting loop may narrow the budget before it reports what it reached. */
const FITTING_ATTEMPTS = 6;

/** The narrowest tail the tree's fold will leave on a line before it moves the cut back. */
const MIN_TAIL_COLUMNS = 12;

/**
 * The narrowest an act's value is folded to when the name and the column above it have spent
 * the budget. The same idea as the drawn mode's `MIN_MESSAGE_WIDTH`: below this a fold stops
 * being a reading and becomes one character per line.
 */
const MIN_ACT_COLUMNS = 8;

/** The character classes that decide where a line of mixed script may end. */
const KANA = /[ぁ-ゟ゠-ヿー]/;
const KANJI = /[一-鿿]/;
const LATIN = /[A-Za-z0-9_`.\-]/;

/**
 * The marks a line may not begin with, which are the closing brackets and the punctuation
 * that ends the clause before it. `）」` opening a line reads as a typo rather than as prose.
 */
const MAY_NOT_OPEN_A_LINE = '）」』】〉》、。，．：；！？';

/** The marks a line may not end with, which are the brackets waiting for what follows. */
const MAY_NOT_END_A_LINE = '（「『【〈《';

/** The mark a tree's heading opens with, so a heading can be told from a branch at a glance. */
const TREE_HEAD = '▸';

/** The two glyphs a branch line opens with: one more step follows, or none does. */
const BRANCH_MORE = '├─';
const BRANCH_LAST = '└─';

/** The spine a sequence's lines hang from, where it continues and where the last step ends it. */
const TREE_SPINE = '│ ';
const TREE_BLANK = '  ';

/** The bare spine: under a heading, and between two steps, so a step reads as one block. */
const TREE_BAR = '  │';

/** The columns a branch line spends before its label, and the lead each body line repeats. */
const BRANCH_INDENT = '  ';
const ORDINAL_WIDTH = 2;
const ORDINAL_GAP = 5;
const LABEL_GAP = 2;
const BODY_LEAD_COLUMNS = 4;

/**
 * The words a tree labels an act with, and the one it labels a shared act with.
 *
 * The three are the act's own fields, named rather than left to their order: a reader of a
 * mixed-script specification cannot tell where a predicate ends and an object begins when the
 * two are printed as one run.
 */
const TREE_LABELS = Object.freeze({
  WHO: 'WHO: ',
  WHAT: 'WHAT: ',
  WHOSE: 'WHOSE: ',
  SHARE: 'SHARE: ',
});

/** What a tree prints where the artifact carries no value for a field it names. */
const NOT_STATED = '(not stated)';

const LIBRARY_NAME = 'beautiful-mermaid';

const USAGE = [
  'usage:',
  `  text.mjs <artifact>.json --list`,
  `  text.mjs <artifact>.json --tree [--id <sequence>…] [--width <columns>]`,
  `  text.mjs <artifact>.json --id <sequence> [--id <sequence>…] [--ascii] [--width <columns>]`,
  `  text.mjs <artifact>.json --id <sequence> [--id <sequence>…] --mermaid`,
].join('\n');

/** Whether a mode reads the artifact whole or names what to read from it. */
const SELECTOR_RULE = Object.freeze({
  list: 'refuses',
  tree: 'accepts',
  source: 'requires',
  drawn: 'requires',
});

const SELECTOR_REFUSAL = '--list and --id cannot both be given: one names what the artifact holds, the other names what to read from it';
const SELECTOR_REQUIRED = 'no --id was given, so there is no sequence to read';

/** The flags each mode cannot act on, and what that mode prints, for the refusal to name. */
const INERT_BY_MODE = Object.freeze({
  list: Object.freeze(['--ascii', '--width', '--mermaid', '--tree']),
  tree: Object.freeze(['--ascii', '--mermaid']),
  source: Object.freeze(['--ascii', '--width', '--tree']),
  drawn: Object.freeze([]),
});

const MODE_DESCRIPTION = Object.freeze({
  list: '--list, which prints the list',
  tree: '--tree, which prints the acts',
  source: '--mermaid, which prints the source unfolded',
});

/**
 * Fold one message to a width budget.
 *
 * The library widens a diagram rather than wrapping a message inside it, so a message longer
 * than the terminal has to be broken here or the drawing arrives wider than the screen. Words
 * break at their spaces; a word longer than the budget is split, because dropping part of it
 * would be a lie about what the step says.
 *
 * The fold is total: any text and any budget yields at least one line, and every character
 * survives in order. Characters are counted rather than bytes, so a message carrying a
 * multi-byte character is measured by what a reader sees.
 */
// [::TICKET::] PX-250 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-250 --for-spec --no-implementation-order`.
export function foldMessage(text, budget) {
  const width = Math.max(1, Math.floor(budget));
  const collapsed = String(text).replace(/\s+/g, ' ').trim();
  if (collapsed === '') {
    return [''];
  }

  const lines = [];
  let line = '';
  for (const word of collapsed.split(' ')) {
    const characters = [...word];
    if (characters.length > width) {
      if (line !== '') {
        lines.push(line);
        line = '';
      }
      for (let start = 0; start < characters.length; start += width) {
        lines.push(characters.slice(start, start + width).join(''));
      }
      continue;
    }
    if (line === '') {
      line = word;
      continue;
    }
    if ([...line].length + 1 + characters.length <= width) {
      line = `${line} ${word}`;
      continue;
    }
    lines.push(line);
    line = word;
  }
  if (line !== '') {
    lines.push(line);
  }
  return lines;
}

/**
 * The ranges a terminal draws two columns wide, which is East Asian Width W and F as UAX #11
 * assigns them.
 *
 * The list is written out rather than computed because Node exposes no width property, and it
 * is the one the JavaScript ecosystem has converged on. Its edges are what the ranges are for:
 * U+303F sits inside the CJK symbol block and is Narrow, so the first range stops before it,
 * and the ideographs and pictographs above the basic plane are Wide while lying outside every
 * range a basic-plane table would carry.
 */
// [::TICKET::] PX-252 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-252 --for-spec --no-implementation-order`.
const WIDE_RANGES = Object.freeze([
  [0x1100, 0x115f], [0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf],
  [0x4e00, 0x9fff], [0xa000, 0xa4cf], [0xa960, 0xa97f], [0xac00, 0xd7a3],
  [0xf900, 0xfaff], [0xfe10, 0xfe19], [0xfe30, 0xfe6f], [0xff00, 0xff60],
  [0xffe0, 0xffe6], [0x1b000, 0x1b001], [0x1f200, 0x1f251], [0x1f300, 0x1f64f],
  [0x1f900, 0x1f9ff], [0x20000, 0x3fffd],
]);

/** The columns one character occupies: two when a terminal draws it wide, one otherwise. */
// [::TICKET::] PX-252 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-252 --for-spec --no-implementation-order`.
function characterColumns(character) {
  const code = character.codePointAt(0);
  return WIDE_RANGES.some(([low, high]) => code >= low && code <= high) ? 2 : 1;
}

/**
 * The columns a line occupies, counted as the reader's eye counts them.
 *
 * A character outside the Latin ranges is drawn two columns wide while `[...line].length`
 * counts it once, so a budget measured in code points lets a line of Japanese overrun the
 * terminal it was folded for. `foldMessage` and `widestLine` measure in code points and keep
 * doing so: the drawn mode is fitted by them, and measuring it differently would move every
 * diagram this command has ever printed.
 */
// [::TICKET::] PX-252 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-252 --for-spec --no-implementation-order`.
export function displayColumns(text) {
  return [...String(text)].reduce((total, character) => total + characterColumns(character), 0);
}

/**
 * Where a reader of this text expects a line to be allowed to end.
 *
 * Japanese is written without spaces, so a greedy cut lands anywhere and splits a compound a
 * reader holds together. A break is offered after a space, after the punctuation that ends a
 * clause, and at a script boundary — kana into kanji or Latin, Latin into kanji, kanji or
 * Latin into kana — which is where a clause tends to end. A mark that may not open a line
 * closes the offer before it, and one that may not end a line closes the offer after it.
 *
 * @returns {number[]} the indices a line may be cut at, each exclusive of the cut character
 */
// [::TICKET::] PX-252 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-252 --for-spec --no-implementation-order`.
function breakPointsOf(characters) {
  const points = [];
  for (let index = 0; index < characters.length - 1; index += 1) {
    const left = characters[index];
    const right = characters[index + 1];
    if (MAY_NOT_OPEN_A_LINE.includes(right) || MAY_NOT_END_A_LINE.includes(left)) {
      continue;
    }
    if (left === ' ' || MAY_NOT_OPEN_A_LINE.includes(left)) {
      points.push(index + 1);
      continue;
    }
    if (KANA.test(left) && (KANJI.test(right) || LATIN.test(right))) {
      points.push(index + 1);
      continue;
    }
    if (LATIN.test(left) && KANJI.test(right)) {
      points.push(index + 1);
      continue;
    }
    if ((KANJI.test(left) || LATIN.test(left)) && KANA.test(right)) {
      points.push(index + 1);
    }
  }
  return points;
}

/**
 * Fold to a column budget, cutting only where a reader expects a line to end.
 *
 * The fold is total — any text at any budget yields at least one line — and lossless: every
 * character survives, in order, with only the spaces at a cut removed. A Latin token that
 * fits on a line of its own is never split, which is why the cut falls back to the start of
 * the word when the budget lands inside one.
 *
 * A last line of a few characters reads as a mistake, so when the tail is narrower than
 * `MIN_TAIL_COLUMNS` the cut is moved back to the place that leaves the two lines closest in
 * width. That is what keeps `... ContentAccessGrant` / `等のサービス結果を発行する` from
 * becoming `... ContentAccessGrant等` / `のサービス結果を発行する`, a line opening on a particle.
 */
// [::TICKET::] PX-252 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-252 --for-spec --no-implementation-order`.
export function foldToBreak(text, budget) {
  const characters = [...String(text)];
  // A character cannot be split across lines, so a budget narrower than the widest one is
  // raised to it: the alternative is a fold that is not total, or a promise the fold cannot
  // keep. The tree's own budget is floored at MIN_WIDTH, so this is the last line of defence.
  const widest = characters.reduce((most, character) => Math.max(most, characterColumns(character)), 1);
  const columns = Math.max(widest, Math.floor(budget));
  const points = breakPointsOf(characters);
  const lines = [];
  const ranges = [];
  let start = 0;

  while (start < characters.length) {
    const tail = characters.slice(start).join('');
    if (displayColumns(tail) <= columns) {
      lines.push(tail.trim());
      ranges.push([start, characters.length]);
      break;
    }
    const fitting = points.filter((at) => at > start && displayColumns(characters.slice(start, at).join('').trimEnd()) <= columns);
    let end;
    if (fitting.length > 0) {
      end = fitting[fitting.length - 1];
    } else {
      end = start;
      let width = 0;
      while (end < characters.length && width + characterColumns(characters[end]) <= columns) {
        width += characterColumns(characters[end]);
        end += 1;
      }
      if (end === start) {
        end = start + 1;
      }
      while (end > start + 1 && LATIN.test(characters[end - 1]) && LATIN.test(characters[end])) {
        end -= 1;
      }
    }
    lines.push(characters.slice(start, end).join('').trimEnd());
    ranges.push([start, end]);
    start = end;
    while (characters[start] === ' ') {
      start += 1;
    }
  }

  if (lines.length >= 2 && displayColumns(lines[lines.length - 1]) < MIN_TAIL_COLUMNS) {
    const balanced = balancedCut(characters, points, ranges[ranges.length - 2], columns);
    if (balanced !== null) {
      lines[lines.length - 2] = characters.slice(ranges[ranges.length - 2][0], balanced).join('').trimEnd();
      lines[lines.length - 1] = characters.slice(balanced).join('').trim();
    }
  }
  return lines.length === 0 ? [''] : lines;
}

/**
 * The cut inside one line that leaves the two lines closest in width.
 *
 * Moving the cut back lengthens the tail and shortens the line above it. A cut that leaves
 * the line above less than half full has over-corrected — it trades an orphan tail for an
 * orphan head — so only the cuts that keep both halves substantial are considered.
 *
 * @returns {number|null} the index to cut at, or null when no cut improves the balance
 */
// [::TICKET::] PX-252 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-252 --for-spec --no-implementation-order`.
function balancedCut(characters, points, [from, to], columns) {
  const candidates = points
    .filter((at) => at > from && at < to)
    .map((at) => ({
      at,
      head: displayColumns(characters.slice(from, at).join('').trimEnd()),
      tail: displayColumns(characters.slice(at).join('').trim()),
    }))
    .filter(({ head, tail }) => tail <= columns && head >= columns / 2)
    .sort((left, right) => Math.abs(left.head - left.tail) - Math.abs(right.head - right.tail));
  return candidates.length === 0 ? null : candidates[0].at;
}

/**
 * Which of the two arrays a sequence artifact must carry are absent.
 *
 * The path is reader-supplied, so a JSON file that is not an artifact is data rather than an
 * impossibility. It is refused by name the way a mistyped id is, and never by a stack trace:
 * a crash says the tool is broken, and what is actually broken is the argument.
 */
// [::TICKET::] PX-250 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-250 --for-spec --no-implementation-order`.
function missingArtifactFields(document) {
  // `operations` is required by the schema, and the tree counts the operations no step names —
  // the one reading that reads the array. A document without it is refused by name like any
  // other, rather than reaching the count and failing there as a stack trace.
  return ['sequences', 'steps', 'operations'].filter((field) => !Array.isArray(document?.[field]));
}

/** The steps one sequence owns, in the order the artifact records them. */
// [::TICKET::] PX-250 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-250 --for-spec --no-implementation-order`.
function stepsOf(artifact, id) {
  return artifact.steps.filter((step) => step.sequence === id);
}

/** One line per sequence: what it is, where it came from, and how much it carries. */
// [::TICKET::] PX-250 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-250 --for-spec --no-implementation-order`.
function sequenceListLines(artifact) {
  return artifact.sequences.map((entry) => {
    const steps = stepsOf(artifact, entry.id);
    return `${entry.id}  ${entry.firstLine}-${entry.lastLine}  ${entry.outcome ?? 'unread'}  ${steps.length} step${steps.length === 1 ? '' : 's'}`;
  });
}

/**
 * What a `P<n>` in the drawing stands for.
 *
 * A terminal cannot scroll a diagram sideways the way a Mermaid viewport can, and the
 * artifact's participant names are full noun phrases, so the drawing carries the identifiers
 * and the names are printed underneath it.
 */
// [::TICKET::] PX-250 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-250 --for-spec --no-implementation-order`.
function legendLines(steps) {
  return participantsOf(steps).map((name, index) => `P${index + 1} = ${name}`);
}

/** The sequences whose steps name one operation, which is what makes an act a shared one. */
// [::TICKET::] PX-252 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-252 --for-spec --no-implementation-order`.
function namingSequences(artifact, operation) {
  return [...new Set(artifact.steps.filter((step) => step.operation === operation).map((step) => step.sequence))];
}

/** A count with its noun, so a line about one thing does not read as a line about many. */
// [::TICKET::] PX-252 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-252 --for-spec --no-implementation-order`.
function counted(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Pad to a column width, which is not a character count. */
// [::TICKET::] PX-252 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-252 --for-spec --no-implementation-order`.
function padTo(text, width) {
  return `${text}${' '.repeat(Math.max(0, width - displayColumns(text)))}`;
}

/**
 * What the tree did not draw.
 *
 * The tree is rooted at the sequences that claim to be one, so everything else is absent from
 * it — and an absence that is not counted reads as an absence that does not exist. The two
 * sets are the entries ruled not a sequence and the operations no step names, which are the
 * two the rail already counts elsewhere rather than two this reading invents.
 */
// [::TICKET::] PX-252 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-252 --for-spec --no-implementation-order`.
function notDrawnLine(artifact) {
  const drawn = new Set(artifact.sequences.filter((entry) => DIAGRAMMED_OUTCOMES.includes(entry.outcome)).map((entry) => entry.id));
  const named = new Set(artifact.steps.map((step) => step.operation));
  const entries = artifact.sequences.filter((entry) => !drawn.has(entry.id)).length;
  const operations = artifact.operations.filter((operation) => !named.has(operation.id)).length;
  return `not drawn: ${counted(entries, 'entry', 'entries')}, ${counted(operations, 'operation', 'operations')} no step names`;
}

/**
 * One sequence's acts, in the order the artifact records them.
 *
 * The order is the artifact's own array order, never a name parsed for one: `step.id` is the
 * reader's own convention and the two artifacts in this repository already disagree about its
 * separator, so what is printed is what the artifact says.
 *
 * A step the artifact holds no `subject`, `predicate` or `object` for prints the label with
 * `(not stated)`. The schema requires none of the three, and a block that silently lost a
 * line would read as a step that carries nothing rather than as a step whose acts are absent.
 *
 * The name column is padded to the widest operation of this sequence, so the labels of one
 * sequence begin in one column and the reading is scannable down the names.
 */
// [::TICKET::] PX-252 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-252 --for-spec --no-implementation-order`.
function sequenceBlockLines(artifact, entry, steps, width) {
  const heading = `${TREE_HEAD} ${entry.id}   ${entry.outcome ?? 'unread'} · lines ${entry.firstLine}–${entry.lastLine} · ${counted(steps.length, 'step', 'steps')}`;
  if (steps.length === 0) {
    return [heading, TREE_BAR, `${entry.id} carries no step in this artifact, so there is nothing to draw`];
  }

  const nameWidth = Math.max(...steps.map((step) => displayColumns(step.operation ?? '')));
  // The ordinal grows a column at a hundred, and the body lines are indented to where the
  // labels begin: a column counted from a constant would leave them one out on the long ones.
  const ordinalWidth = Math.max(ORDINAL_WIDTH, String(steps.length).length);
  const labelColumn = displayColumns(BRANCH_INDENT) + displayColumns(BRANCH_MORE) + 1 + ordinalWidth + ORDINAL_GAP + nameWidth + LABEL_GAP;
  const lines = [heading, TREE_BAR];

  steps.forEach((step, index) => {
    const isLast = index === steps.length - 1;
    const branch = `${BRANCH_INDENT}${isLast ? BRANCH_LAST : BRANCH_MORE} ${String(index + 1).padStart(ordinalWidth, '0')}${' '.repeat(ORDINAL_GAP)}${padTo(step.operation ?? '', nameWidth)}${' '.repeat(LABEL_GAP)}`;
    const body = `${BRANCH_INDENT}${isLast ? TREE_BLANK : TREE_SPINE}${' '.repeat(labelColumn - BODY_LEAD_COLUMNS)}`;
    const shared = namingSequences(artifact, step.operation).filter((id) => id !== entry.id).length;
    const fields = [
      [TREE_LABELS.WHO, step.subject],
      [TREE_LABELS.WHAT, step.predicate],
      [TREE_LABELS.WHOSE, step.object],
      ...(shared === 0 ? [] : [[TREE_LABELS.SHARE, `also named by ${counted(shared, 'other sequence', 'other sequences')}`]]),
    ];

    fields.forEach(([label, value], position) => {
      const lead = position === 0 ? branch : body;
      const stated = typeof value === 'string' && value.trim() !== '' ? value : NOT_STATED;
      // A name and a column wider than the budget leave the value no room at all. The reading
      // is printed rather than withheld — the rule the drawn mode keeps for a drawing that is
      // merely wide — but the value keeps a floor, because folding it to one character per
      // line reads as a defect rather than as a reading.
      const room = Math.max(MIN_ACT_COLUMNS, width - displayColumns(lead) - displayColumns(label));
      const folded = foldToBreak(stated, room);

      folded.forEach((line, row) => {
        lines.push(row === 0 ? `${lead}${label}${line}` : `${' '.repeat(labelColumn + displayColumns(label))}${line}`);
      });
    });
    if (!isLast) {
      lines.push(TREE_BAR);
    }
  });
  return lines;
}

/**
 * The fourth reading: what each sequence's acts are, in the order they are performed.
 *
 * Without `--id` it roots where the drawing roots — at the entries that claim to be a
 * sequence — because two readings of one artifact must owe the same set or a reader comparing
 * them is comparing nothing. It closes with what it did not draw, so an empty screen is never
 * the only thing a reader is told.
 *
 * With `--id` it prints the named entries and nothing else, whatever their outcome: `--id`
 * names an entry, not a claim.
 *
 * @param {string[]} ids - entries the artifact holds; an id it does not hold is a caller's
 *   error rather than this reading's, and `textCommand` refuses one by name before it gets
 *   here. An empty list is the reading of the whole artifact, not of nothing.
 * @returns {string} the reading, which is every line the caller writes
 */
// [::TICKET::] PX-252 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-252 --for-spec --no-implementation-order`.
export function treeReading(artifact, ids, width) {
  const chosen = ids.length === 0
    ? artifact.sequences.filter((entry) => DIAGRAMMED_OUTCOMES.includes(entry.outcome))
    : ids.map((id) => artifact.sequences.find((entry) => entry.id === id));
  const blocks = chosen.map((entry) => sequenceBlockLines(artifact, entry, stepsOf(artifact, entry.id), width));
  const separated = blocks.flatMap((block, index) => (index === 0 ? block : ['', ...block]));
  const tail = ids.length === 0 ? ['', notDrawnLine(artifact)] : [];
  return `${[...separated, ...tail].join('\n')}\n`;
}

/** The width of the widest line of a rendering, counted as a reader sees it. */
// [::TICKET::] PX-250 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-250 --for-spec --no-implementation-order`.
function widestLine(text) {
  return Math.max(0, ...String(text).split('\n').map((line) => [...line].length));
}

/**
 * Draw one sequence inside a width budget, through whatever renderer it is given.
 *
 * The budget is the diagram's, not the message's. The library spaces the lifelines apart to
 * fit the widest message between two of them, so a message allowed to run to the width of
 * the terminal pushes the whole diagram far past it — measured on the real artifact, a
 * 25-participant sequence is 272 columns with messages folded to 6 and 951 with them folded
 * to 80. So the message budget is narrowed until the drawing fits, and the loop measures the
 * rendering rather than predicting it, because the relationship is the library's to decide.
 *
 * The renderer is a parameter because the library is not ours: a caller can hold the drawn
 * mode to the text it hands over without the dependency installed.
 *
 * @returns {Promise<{ok: true, text: string, note: string}|{ok: false, reason: string}>}
 */
// [::TICKET::] PX-250 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-250 --for-spec --no-implementation-order`.
async function drawSequence({ artifact, id, width, useAscii, render }) {
  const entry = artifact.sequences.find((sequence) => sequence.id === id);
  const steps = stepsOf(artifact, id);
  const heading = `${entry.id} ${entry.firstLine}-${entry.lastLine} ${entry.outcome ?? 'unread'}`;

  // Most entries of a real artifact carry no step: they are the regions the reader ruled not
  // a sequence, and an entry the reader ruled out is owed no diagram. Handing an empty
  // sequence to the renderer would produce blankness under a heading, which reads as a
  // failure rather than as the answer.
  if (steps.length === 0) {
    return { ok: true, text: [heading, '', `${entry.id} carries no step in this artifact, so there is nothing to draw`].join('\n'), note: '' };
  }

  // The drawing carries the identifiers: a participant name in this artifact is a full noun
  // phrase, and a diagram whose boxes are 99 columns wide cannot be read in a terminal at all.
  const displayName = (name, identifier) => identifier;

  let budget = width;
  let reached = null;
  for (let attempt = 0; attempt < FITTING_ATTEMPTS; attempt += 1) {
    const fold = (message) => foldMessage(message, budget).join(FOLD_SEPARATOR);
    const drawn = await render(sequenceDiagramSource(entry, steps, { fold, displayName }), { useAscii });
    if (!drawn.ok) {
      return drawn;
    }
    reached = { text: drawn.text, measured: widestLine(drawn.text) };
    if (reached.measured <= width || budget <= MIN_MESSAGE_WIDTH) {
      break;
    }
    const narrowed = Math.floor(budget * (width / reached.measured));
    budget = narrowed < budget ? Math.max(MIN_MESSAGE_WIDTH, narrowed) : budget - 1;
  }

  const note = reached.measured <= width
    ? ''
    : `${entry.id} is ${reached.measured} columns wide at the narrowest message budget, which is wider than the ${width} asked for; it is printed anyway, because a diagram that is merely wide can be scrolled and one that was withheld cannot be read`;
  return {
    ok: true,
    text: [heading, '', reached.text.replace(/\n+$/, ''), '', ...legendLines(steps)].join('\n'),
    note,
  };
}

/** The renderer the drawn mode uses when no other is given, reaching the library when it runs. */
// [::TICKET::] PX-250 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-250 --for-spec --no-implementation-order`.
async function renderMermaidText(source, { useAscii }) {
  let renderMermaidASCII;
  try {
    ({ renderMermaidASCII } = await import('beautiful-mermaid'));
  } catch {
    return {
      ok: false,
      reason: `${LIBRARY_NAME} is not installed, so no sequence can be drawn. Run \`node install.js\` beside the project to install it, or use --list and --mermaid, which need no library.`,
    };
  }
  return { ok: true, text: renderMermaidASCII(source, { useAscii, colorMode: 'none' }) };
}

/**
 * Read the invocation.
 *
 * A flag that cannot act on the chosen mode is refused rather than ignored: silently
 * accepting `--width` beside `--mermaid` would let the reader believe the printed source was
 * folded, when the raw source is deliberately the unfolded bytes the fence carries.
 */
// [::TICKET::] PX-250, PX-252 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-250|PX-252) --for-spec --no-implementation-order`.
function parseTextArguments(tokens) {
  const [artifactPath, ...rest] = tokens;
  if (artifactPath === undefined) {
    return { ok: false, reason: `no artifact was named\n${USAGE}` };
  }

  const ids = [];
  const given = new Set();
  let width = null;

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === '--list' || token === '--tree' || token === '--mermaid' || token === '--ascii') {
      given.add(token);
      continue;
    }
    if (token === '--id' || token === '--width') {
      const value = rest[index + 1];
      if (value === undefined) {
        return { ok: false, reason: `${token} must be followed by a value\n${USAGE}` };
      }
      index += 1;
      if (token === '--id') {
        ids.push(value);
        continue;
      }
      const columns = Number(value);
      if (!Number.isInteger(columns) || columns < MIN_WIDTH) {
        return { ok: false, reason: `--width must be a whole number of columns, at least ${MIN_WIDTH}; got ${value}` };
      }
      width = columns;
      given.add('--width');
      continue;
    }
    return { ok: false, reason: `unknown option: ${token}\n${USAGE}` };
  }

  const mode = given.has('--list') ? 'list' : given.has('--tree') ? 'tree' : given.has('--mermaid') ? 'source' : 'drawn';
  const selector = SELECTOR_RULE[mode];
  if (selector === 'refuses' && ids.length > 0) {
    return { ok: false, reason: SELECTOR_REFUSAL };
  }
  if (selector === 'requires' && ids.length === 0) {
    return { ok: false, reason: `${SELECTOR_REQUIRED}\n${USAGE}` };
  }

  const inert = INERT_BY_MODE[mode].filter((flag) => given.has(flag));
  if (inert.length > 0) {
    return { ok: false, reason: `${inert.join(' and ')} cannot act on ${MODE_DESCRIPTION[mode]}` };
  }

  return { ok: true, artifactPath, ids, mode, width, useAscii: given.has('--ascii') };
}

/**
 * Read the artifact the way the invocation asked for.
 *
 * @param {string[]} tokens - the arguments after the script name
 * @param {{render?: Function, columns?: number}} [options] - the renderer and the terminal width
 * @returns {Promise<{exitCode: number, output: string, reason: string}>} output is stdout;
 *   reason is stderr, carrying why a refusal happened or what a drawing that could not be
 *   made to fit actually reached
 */
// [::TICKET::] PX-250 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-250 --for-spec --no-implementation-order`.
export async function textCommand(tokens, { render = renderMermaidText, columns } = {}) {
  const parsed = parseTextArguments(tokens);
  if (!parsed.ok) {
    return { exitCode: TEXT_EXIT.MISUSED, output: '', reason: parsed.reason };
  }
  if (!existsSync(parsed.artifactPath)) {
    return { exitCode: TEXT_EXIT.MISUSED, output: '', reason: `no artifact at ${parsed.artifactPath}` };
  }

  let artifact;
  try {
    artifact = JSON.parse(readFileSync(parsed.artifactPath, 'utf8'));
  } catch (error) {
    return { exitCode: TEXT_EXIT.REFUSED, output: '', reason: `${parsed.artifactPath} cannot be read as a sequence artifact: ${error.message}` };
  }

  const missing = missingArtifactFields(artifact);
  if (missing.length > 0) {
    return { exitCode: TEXT_EXIT.REFUSED, output: '', reason: `${parsed.artifactPath} is not a sequence artifact: it carries no ${missing.join(' and no ')} array` };
  }

  if (parsed.mode === 'list') {
    return { exitCode: TEXT_EXIT.OK, output: `${sequenceListLines(artifact).join('\n')}\n`, reason: '' };
  }

  const unknown = parsed.ids.filter((id) => !artifact.sequences.some((entry) => entry.id === id));
  if (unknown.length > 0) {
    return { exitCode: TEXT_EXIT.REFUSED, output: '', reason: `${parsed.artifactPath} holds no sequence named ${unknown.join(', ')}` };
  }

  const terminalWidth = Number.isInteger(columns) && columns >= MIN_WIDTH ? columns : DEFAULT_WIDTH;
  const width = parsed.width ?? terminalWidth;

  if (parsed.mode === 'tree') {
    return { exitCode: TEXT_EXIT.OK, output: treeReading(artifact, parsed.ids, width), reason: '' };
  }

  if (parsed.mode === 'source') {
    const blocks = parsed.ids.map((id) => sequenceDiagramSource(
      artifact.sequences.find((entry) => entry.id === id),
      stepsOf(artifact, id),
    ));
    return { exitCode: TEXT_EXIT.OK, output: `${blocks.join('\n\n')}\n`, reason: '' };
  }

  const drawn = [];
  const notes = [];
  for (const id of parsed.ids) {
    const block = await drawSequence({ artifact, id, width, useAscii: parsed.useAscii, render });
    if (!block.ok) {
      return { exitCode: TEXT_EXIT.REFUSED, output: '', reason: block.reason };
    }
    drawn.push(block.text);
    if (block.note !== '') {
      notes.push(block.note);
    }
  }
  return { exitCode: TEXT_EXIT.OK, output: `${drawn.join('\n\n')}\n`, reason: notes.join('\n') };
}

// [::TICKET::] PX-250 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-250 --for-spec --no-implementation-order`.
async function main() {
  const answer = await textCommand(process.argv.slice(2), { columns: process.stdout.columns });
  if (answer.output !== '') {
    process.stdout.write(answer.output);
  }
  if (answer.reason !== '') {
    process.stderr.write(`${answer.reason}\n`);
  }
  process.exitCode = answer.exitCode;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
