/**
 * Extract display and inline mathematics from specification and RFC text.
 *
 * Four delimiter forms are one identity: `\[...\]` and `$$...$$` are display,
 * `\(...\)` and `$...$` are inline. Code fences, code spans and escaped dollars are
 * presentation the specification uses to talk about formulas, never formulas.
 */
import { digestFormula, formulaId } from './digest.mjs';
import { normalizeFormula } from './normalize.mjs';

/** Environments whose whole body is mathematics. */
const MATH_ENVIRONMENTS = new Set([
  'math',
  'displaymath',
  'equation',
  'equation*',
  'align',
  'align*',
  'aligned',
  'gather',
  'gather*',
  'multline',
  'multline*',
  'eqnarray',
  'eqnarray*',
]);

const FENCE_PATTERN = /^\s*(`{3,}|~{3,})/;
const ENVIRONMENT_PATTERN = /\\begin\{([a-zA-Z*]+)\}/g;

/** How many backslashes immediately precede an offset. */
// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function precedingBackslashes(text, offset) {
  let count = 0;
  for (let index = offset - 1; index >= 0 && text[index] === '\\'; index -= 1) count += 1;
  return count;
}

/** Whether the character at offset is escaped by a backslash. */
// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function isEscaped(text, offset) {
  return precedingBackslashes(text, offset) % 2 === 1;
}

/** Replace every non-newline character in a range with a space. */
// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function blankRange(text, start, end) {
  const replacement = text.slice(start, end).replace(/[^\n]/g, ' ');
  return `${text.slice(0, start)}${replacement}${text.slice(end)}`;
}

/** Mask fenced blocks and inline code spans without moving any line. */
// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function maskCode(text) {
  const lines = text.split('\n');
  let offset = 0;
  let fence = null;

  for (const line of lines) {
    const lineStart = offset;
    const lineEnd = offset + line.length;
    const fenceMatch = line.match(FENCE_PATTERN);

    if (fence !== null) {
      text = blankRange(text, lineStart, lineEnd);
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) {
        fence = null;
      }
    } else if (fenceMatch) {
      fence = fenceMatch[1];
      text = blankRange(text, lineStart, lineEnd);
    } else {
      text = maskInlineCode(text, lineStart, lineEnd);
    }
    offset = lineEnd + 1;
  }

  return text;
}

/** Mask backtick spans on one line. */
// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function maskInlineCode(text, lineStart, lineEnd) {
  const line = text.slice(lineStart, lineEnd);
  let cursor = 0;

  while (cursor < line.length) {
    const open = line.indexOf('`', cursor);
    if (open === -1) break;
    const run = /^`+/.exec(line.slice(open))[0];
    const close = line.indexOf(run, open + run.length);
    if (close === -1) break;
    text = blankRange(text, lineStart + open, lineStart + close + run.length);
    cursor = close + run.length;
  }

  return text;
}

/** Find a delimiter on the same line that is not escaped. */
// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function findClosing(text, from, delimiter) {
  let cursor = text.indexOf(delimiter, from);
  while (cursor !== -1 && isEscaped(text, cursor)) {
    cursor = text.indexOf(delimiter, cursor + delimiter.length);
  }
  return cursor;
}

/** Find a single-dollar close on the same line, refusing prose that only mentions money. */
// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function findInlineDollarClose(text, from) {
  const newline = text.indexOf('\n', from);
  const limit = newline === -1 ? text.length : newline;
  let cursor = text.indexOf('$', from);

  while (cursor !== -1 && cursor < limit) {
    const isDouble = text[cursor + 1] === '$' || text[cursor - 1] === '$';
    if (!isEscaped(text, cursor) && !isDouble) {
      const body = text.slice(from, cursor);
      const touchesSpace = body.length === 0 || /^\s|\s$/.test(body);
      if (!touchesSpace) return cursor;
    }
    cursor = text.indexOf('$', cursor + 1);
  }

  return -1;
}

/** Line numbers for every offset, computed once. */
// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function lineIndex(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') starts.push(index + 1);
  }
  return (offset) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (starts[middle] <= offset) low = middle;
      else high = middle - 1;
    }
    return low + 1;
  };
}

/** The earliest display candidate currently visible in the working text. */
// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function nextDisplay(text) {
  const candidates = [];

  const bracket = text.indexOf('\\[');
  if (bracket !== -1) {
    const close = findClosing(text, bracket + 2, '\\]');
    if (close !== -1) candidates.push({ start: bracket, end: close + 2, open: 2, delimiter: 'bracket' });
  }

  const dollars = text.indexOf('$$');
  if (dollars !== -1) {
    const close = text.indexOf('$$', dollars + 2);
    if (close !== -1) candidates.push({ start: dollars, end: close + 2, open: 2, delimiter: 'dollar' });
  }

  ENVIRONMENT_PATTERN.lastIndex = 0;
  let environmentMatch;
  while ((environmentMatch = ENVIRONMENT_PATTERN.exec(text)) !== null) {
    const name = environmentMatch[1];
    if (!MATH_ENVIRONMENTS.has(name)) continue;
    const closing = `\\end{${name}}`;
    const close = text.indexOf(closing, environmentMatch.index + environmentMatch[0].length);
    if (close !== -1) {
      candidates.push({
        start: environmentMatch.index,
        end: close + closing.length,
        open: 0,
        delimiter: 'environment',
      });
      break;
    }
  }

  return candidates.sort((left, right) => left.start - right.start)[0] ?? null;
}

/** The earliest inline candidate currently visible in the working text. */
// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function nextInline(text) {
  const candidates = [];

  const parenthesis = text.indexOf('\\(');
  if (parenthesis !== -1) {
    const close = findClosing(text, parenthesis + 2, '\\)');
    if (close !== -1) candidates.push({ start: parenthesis, end: close + 2, open: 2, delimiter: 'bracket' });
  }

  let dollar = text.indexOf('$');
  while (dollar !== -1 && text[dollar + 1] === '$') dollar = text.indexOf('$', dollar + 2);
  if (dollar !== -1 && !isEscaped(text, dollar)) {
    const close = findInlineDollarClose(text, dollar + 1);
    if (close !== -1) candidates.push({ start: dollar, end: close + 1, open: 1, delimiter: 'dollar' });
  }

  return candidates.sort((left, right) => left.start - right.start)[0] ?? null;
}

/** Turn one matched range into the formula record every later stage reads. */
// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function recordFormula(source, candidate, lineAt) {
  const openLength = candidate.open;
  const closeLength = candidate.delimiter === 'dollar' ? openLength : openLength;
  const body = source.slice(candidate.start + openLength, candidate.end - closeLength).trim();
  if (body.length === 0) return null;

  const normalized = normalizeFormula(body);
  if (normalized.length === 0) return null;
  const digest = digestFormula(normalized);

  return {
    id: formulaId(digest),
    digest,
    body,
    display: candidate.delimiter !== 'inline',
    delimiter: candidate.delimiter,
    normalized,
    lineStart: lineAt(candidate.start),
    lineEnd: lineAt(Math.max(candidate.start, candidate.end - 1)),
  };
}

/**
 * Extract every formula occurrence, in source order.
 *
 * @param {string} text
 * @returns {Array<{id: string, digest: string, body: string, display: boolean, delimiter: string, normalized: string, lineStart: number, lineEnd: number}>}
 */
export function extractFormulas(text) {
  const source = String(text);
  const lineAt = lineIndex(source);
  let working = maskCode(source);
  const formulas = [];

  for (;;) {
    const candidate = nextDisplay(working);
    if (candidate === null) break;
    const formula = recordFormula(source, candidate, lineAt);
    if (formula !== null) formulas.push(formula);
    working = blankRange(working, candidate.start, candidate.end);
  }

  working = maskCode(source);
  for (;;) {
    const candidate = nextInline(working);
    if (candidate === null) break;
    const formula = recordFormula(source, { ...candidate, delimiter: candidate.delimiter }, lineAt);
    if (formula !== null) formulas.push({ ...formula, display: false });
    working = blankRange(working, candidate.start, candidate.end);
  }

  return formulas.sort((left, right) => left.lineStart - right.lineStart || left.lineEnd - right.lineEnd);
}

/**
 * One record per digest, keeping the first occurrence's location.
 *
 * @param {ReturnType<typeof extractFormulas>} formulas
 * @returns {ReturnType<typeof extractFormulas>}
 */
export function uniqueFormulas(formulas) {
  const seen = new Set();
  return formulas.filter((formula) => {
    if (seen.has(formula.id)) return false;
    seen.add(formula.id);
    return true;
  });
}
