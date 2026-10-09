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

const LIBRARY_NAME = 'beautiful-mermaid';

const USAGE = [
  'usage:',
  `  text.mjs <artifact>.json --list`,
  `  text.mjs <artifact>.json --id <sequence> [--id <sequence>…] [--ascii] [--width <columns>]`,
  `  text.mjs <artifact>.json --id <sequence> [--id <sequence>…] --mermaid`,
].join('\n');

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
 * Which of the two arrays a sequence artifact must carry are absent.
 *
 * The path is reader-supplied, so a JSON file that is not an artifact is data rather than an
 * impossibility. It is refused by name the way a mistyped id is, and never by a stack trace:
 * a crash says the tool is broken, and what is actually broken is the argument.
 */
// [::TICKET::] PX-250 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-250 --for-spec --no-implementation-order`.
function missingArtifactFields(document) {
  return ['sequences', 'steps'].filter((field) => !Array.isArray(document?.[field]));
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
// [::TICKET::] PX-250 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-250 --for-spec --no-implementation-order`.
function parseTextArguments(tokens) {
  const [artifactPath, ...rest] = tokens;
  if (artifactPath === undefined) {
    return { ok: false, reason: `no artifact was named\n${USAGE}` };
  }

  const ids = [];
  let wantsList = false;
  let wantsSource = false;
  let wantsAscii = false;
  let width = null;

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === '--list') {
      wantsList = true;
      continue;
    }
    if (token === '--mermaid') {
      wantsSource = true;
      continue;
    }
    if (token === '--ascii') {
      wantsAscii = true;
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
      continue;
    }
    return { ok: false, reason: `unknown option: ${token}\n${USAGE}` };
  }

  if (wantsList && ids.length > 0) {
    return { ok: false, reason: '--list and --id cannot both be given: one names what the artifact holds, the other names what to read from it' };
  }
  if (!wantsList && ids.length === 0) {
    return { ok: false, reason: `neither --list nor --id was given, so there is nothing to read\n${USAGE}` };
  }

  const mode = wantsList ? 'list' : wantsSource ? 'source' : 'drawn';
  const inert = {
    list: [...(wantsAscii ? ['--ascii'] : []), ...(width === null ? [] : ['--width']), ...(wantsSource ? ['--mermaid'] : [])],
    source: [...(wantsAscii ? ['--ascii'] : []), ...(width === null ? [] : ['--width'])],
    drawn: [],
  }[mode];

  if (inert.length > 0) {
    const whatItPrints = mode === 'source'
      ? '--mermaid, which prints the source unfolded'
      : '--list, which prints the list';
    return { ok: false, reason: `${inert.join(' and ')} cannot act on ${whatItPrints}` };
  }

  return { ok: true, artifactPath, ids, mode, width, useAscii: wantsAscii };
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

  if (parsed.mode === 'source') {
    const blocks = parsed.ids.map((id) => sequenceDiagramSource(
      artifact.sequences.find((entry) => entry.id === id),
      stepsOf(artifact, id),
    ));
    return { exitCode: TEXT_EXIT.OK, output: `${blocks.join('\n\n')}\n`, reason: '' };
  }

  const terminalWidth = Number.isInteger(columns) && columns >= MIN_WIDTH ? columns : DEFAULT_WIDTH;
  const width = parsed.width ?? terminalWidth;
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
