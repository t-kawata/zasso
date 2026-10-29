/**
 * check-command-steps.js — the steps a command file defines, held against the steps
 * its CRITICAL exception names.
 *
 * crystalize-readme.md forbids questions, confirmations, approvals, options and
 * human-decision delegation, and then excepts one step where asking the user is
 * required. That exception is only readable if it names a step the file defines: an
 * exception pointing at a step that does not exist cannot be resolved, so the
 * prohibition stays in force and the step it meant to except still stands accused
 * of violating it. This guard makes the reference checkable.
 *
 * The two readings are kept apart on purpose. The defined set comes from the
 * headings the file declares, and the named set comes from the exception paragraph
 * alone, so a number that merely appears elsewhere in the file is not a reference,
 * and a reference is matched as the identifier it is written as — "1.5" is not the
 * heading "1-5", and neither one resolves the other.
 *
 * Resolution is the whole claim. Whether a run obeys the exception is a choice an
 * agent makes and no script can observe it; whether the exception names something
 * the file defines is decidable, and that is what is decided here.
 *
 * CLI:
 *   node check-command-steps.js [--file=<path to a command file>]
 * exit 0 — every step the exception names is defined by the file
 * exit 1 — the block is missing, the exception is missing, or a name is unresolved
 * exit 2 — the file cannot be read, or an argument was not understood
 */

const { readFileSync } = require('node:fs');
const path = require('node:path');

/** The command file this guard reads when no --file is given. */
const DEFAULT_COMMAND_FILE = path.resolve(__dirname, '../../commands/crystalize-readme.md');

/** The one option this guard takes, and the line it prints when called otherwise. */
const FILE_OPTION = '--file=';
const USAGE = 'usage: check-command-steps.js [--file=<path to a command file>]';

/** The heading forms that declare a step. A step is `### Step N`; a sub-step is `#### N-M`. */
const DEFINED_STEP_PATTERNS = [/^###\s+Step\s+(\d+)\b/, /^####\s+(\d+-\d+)\b/];

/**
 * The two ways a step is named in prose: "Step 1" and "Step 1.5", or the sub-step
 * form "1-2". The dotted form is captured as written, never normalized, so it
 * cannot resolve against the hyphenated heading it resembles.
 */
const NAMED_STEP_PATTERN = /step\s+(\d+(?:\.\d+)*)|(\d+-\d+)/gi;

const CRITICAL_HEADING_PATTERN = /^#\s+CRITICAL\b/;
const TOP_LEVEL_HEADING_PATTERN = /^#\s+\S/;
const PROHIBITION_PATTERN = /strictly prohibit/i;
const EXCEPTION_PATTERN = /exception/i;

const NO_BLOCK = 'no CRITICAL block';
const NO_EXCEPTION = 'no exception paragraph';

/** The lines between the CRITICAL heading and the next top-level heading. */
// [::TICKET::] PX-271 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-271 --for-spec --no-implementation-order`.
function readBlockBody(lines, headingIndex) {
  const body = [];
  for (const line of lines.slice(headingIndex + 1)) {
    if (TOP_LEVEL_HEADING_PATTERN.test(line)) return body;
    body.push(line);
  }
  return body;
}

/** The blank-line separated paragraphs of a block body. */
// [::TICKET::] PX-271 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-271 --for-spec --no-implementation-order`.
function readParagraphs(body) {
  return body
    .join('\n')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '');
}

/** The first paragraph a pattern matches, or the empty string. */
// [::TICKET::] PX-271 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-271 --for-spec --no-implementation-order`.
function firstParagraphMatching(paragraphs, pattern) {
  return paragraphs.find((paragraph) => pattern.test(paragraph)) ?? '';
}

/**
 * Read the CRITICAL block of a command file: its heading, its prohibition, and the
 * exception that narrows it.
 *
 * @param {string} text
 * @returns {{ heading: string|null, prohibition: string, exception: string }}
 */
// [::TICKET::] PX-271 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-271 --for-spec --no-implementation-order`.
function readCriticalBlock(text) {
  const lines = text.split('\n');
  const headingIndex = lines.findIndex((line) => CRITICAL_HEADING_PATTERN.test(line));

  if (headingIndex === -1) return { heading: null, prohibition: '', exception: '' };

  const paragraphs = readParagraphs(readBlockBody(lines, headingIndex));

  return {
    heading: lines[headingIndex].trim(),
    prohibition: firstParagraphMatching(paragraphs, PROHIBITION_PATTERN),
    exception: firstParagraphMatching(paragraphs, EXCEPTION_PATTERN),
  };
}

/**
 * The step identifiers a command file declares, in the order it declares them.
 *
 * @param {string} text
 * @returns {string[]}
 */
// [::TICKET::] PX-271 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-271 --for-spec --no-implementation-order`.
function readDefinedSteps(text) {
  const defined = [];
  const lines = text.split('\n');

  for (const line of lines) {
    for (const pattern of DEFINED_STEP_PATTERNS) {
      const match = line.match(pattern);
      if (match !== null) {
        defined.push(match[1]);
        break;
      }
    }
  }

  return defined;
}

/**
 * The step identifiers one paragraph names, in the order it names them, once each.
 *
 * @param {string} paragraph
 * @returns {string[]}
 */
// [::TICKET::] PX-271 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-271 --for-spec --no-implementation-order`.
function readNamedSteps(paragraph) {
  const named = [];

  for (const match of paragraph.matchAll(NAMED_STEP_PATTERN)) {
    const identifier = match[1] ?? match[2];
    if (!named.includes(identifier)) named.push(identifier);
  }

  return named;
}

/**
 * Decide the file: which state it is in, and which of the names it makes have no heading.
 *
 * The fault is returned rather than thrown so the caller distinguishes "this file
 * cannot be judged" from "this file is judged and refused" — a block that excepts
 * nothing must never read as a pass.
 *
 * @param {string} text
 * @returns {{ fault: string|null, defined: string[], unresolved: Array<{ identifier: string, defined: string[] }> }}
 */
// [::TICKET::] PX-271 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-271 --for-spec --no-implementation-order`.
function inspectCommandSteps(text) {
  const defined = readDefinedSteps(text);
  const block = readCriticalBlock(text);

  if (block.heading === null) return { fault: NO_BLOCK, defined, unresolved: [] };
  if (block.exception === '') return { fault: NO_EXCEPTION, defined, unresolved: [] };

  const unresolved = readNamedSteps(block.exception)
    .filter((identifier) => !defined.includes(identifier))
    .map((identifier) => ({ identifier, defined }));

  return { fault: null, defined, unresolved };
}

/**
 * The steps a command file excepts but does not declare.
 *
 * @param {string} text
 * @returns {Array<{ identifier: string, defined: string[] }>}
 */
// [::TICKET::] PX-271 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-271 --for-spec --no-implementation-order`.
function findUnresolvedSteps(text) {
  return inspectCommandSteps(text).unresolved;
}

/**
 * Read the arguments: the file named by --file, or the one this guard was written for.
 *
 * An argument the guard does not understand is reported rather than ignored. Treating
 * a bare --file as if it were absent would judge the default command file and report
 * a verdict about a file the caller never named.
 *
 * @param {string[]} argv
 * @returns {{ file: string|null, unknown: string[] }}
 */
// [::TICKET::] PX-271 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-271 --for-spec --no-implementation-order`.
function readRequestedFile(argv) {
  const unknown = argv.filter((argument) => !argument.startsWith(FILE_OPTION));
  const option = argv.find((argument) => argument.startsWith(FILE_OPTION));

  if (unknown.length > 0) return { file: null, unknown };
  if (option === undefined) return { file: DEFAULT_COMMAND_FILE, unknown: [] };

  return { file: option.slice(FILE_OPTION.length), unknown: [] };
}

/**
 * Judge one command file and report the verdict on stdout or stderr.
 *
 * @param {string[]} argv
 * @returns {number} the exit code
 */
// [::TICKET::] PX-271 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-271 --for-spec --no-implementation-order`.
function main(argv) {
  const { file, unknown } = readRequestedFile(argv);
  let text;

  if (file === null) {
    process.stderr.write(`${USAGE}\nunknown argument: ${unknown.join(', ')}\n`);
    return 2;
  }

  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    process.stderr.write(`${file}: cannot read: ${error.message}\n`);
    return 2;
  }

  const { fault, defined, unresolved } = inspectCommandSteps(text);

  if (fault !== null) {
    process.stderr.write(`${file}: ${fault}\n`);
    return 1;
  }

  if (unresolved.length > 0) {
    const names = unresolved.map((finding) => finding.identifier).join(', ');
    process.stderr.write(
      `${file}: the CRITICAL exception names steps the file does not define: ${names} (defined: ${defined.join(', ')})\n`,
    );
    return 1;
  }

  return 0;
}

module.exports = {
  findUnresolvedSteps,
  inspectCommandSteps,
  readCriticalBlock,
  readDefinedSteps,
  readNamedSteps,
};

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
