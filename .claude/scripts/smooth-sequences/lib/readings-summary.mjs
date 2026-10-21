/**
 * Summarize the educe readings a smooth-sequences report must not hide.
 *
 * The inquest asks the specification 3,768 questions and records 201 Yes answers on
 * the audited workspace; those answers are readings, not findings, and this module does
 * not convert them. It reports the counts and the unresolved subjects so a reader can
 * see that the final gate did not look at them. A malformed or unreadable file becomes a
 * named withheld entry: silence would be indistinguishable from "no Yes answers".
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const READINGS_DIRECTORY = 'educe-sequences';
export const MAX_UNRESOLVED_SUBJECTS = 50;

const INQUEST_FILE = 'readings-inquest.jsonl';
const ADVERSARIAL_FILE = 'readings-adversarial.jsonl';
const UNCOVERED_FILE = 'readings-uncovered.jsonl';
const ANSWER_YES = 'Yes';
const ANSWER_NO = 'No';

/** The empty shape a workspace with no readings reports. */
export function emptyReadings() {
  return {
    status: 'not-available',
    inquest: {
      records: 0,
      byLens: {},
      byAnswer: {},
      yes: 0,
      no: 0,
      unresolvedSubjects: [],
      overflow: 0,
    },
    adversarial: { records: 0, byOutcome: {} },
    uncovered: { records: 0 },
    withheld: [],
  };
}

/** One withheld surface for an unreadable or malformed file. */
// [::TICKET::] PX-283, PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-283|PX-284) --for-spec --no-implementation-order`.
function withheldEntry(fileName, detail) {
  return {
    layer: 'readings',
    check: `readings:${fileName}`,
    reason: `${fileName}${detail}`,
  };
}

/** Read one JSONL file, or state why it could not be read. */
// [::TICKET::] PX-283, PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-283|PX-284) --for-spec --no-implementation-order`.
function readJsonLines(directory, fileName) {
  const path = join(directory, fileName);
  if (!existsSync(path)) return { status: 'absent', rows: [], withheld: [] };
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    return { status: 'unreadable', rows: [], withheld: [withheldEntry(fileName, `: ${error.message}`)] };
  }
  const rows = [];
  const withheld = [];
  const lines = text.split('\n');
  for (const [index, line] of lines.entries()) {
    if (line.trim() === '') continue;
    try {
      rows.push(JSON.parse(line));
    } catch (error) {
      withheld.push(withheldEntry(fileName, `:${index + 1} ${error.message}`));
    }
  }
  return { status: 'readable', rows, withheld };
}

/** Count one answer under one lens without losing the other answers. */
// [::TICKET::] PX-283, PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-283|PX-284) --for-spec --no-implementation-order`.
function countAnswer(target, lens, answer) {
  if (typeof lens !== 'string' || lens.length === 0) return;
  if (target[lens] === undefined) target[lens] = {};
  const key = typeof answer === 'string' && answer.length > 0 ? answer : 'unanswered';
  target[lens][key] = (target[lens][key] ?? 0) + 1;
}

/** The inquest summary, including the capped unresolved Yes subjects. */
// [::TICKET::] PX-283, PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-283|PX-284) --for-spec --no-implementation-order`.
function summarizeInquest(rows, limit) {
  const byLens = {};
  const byAnswer = {};
  const yesSubjects = new Set();
  for (const row of rows) {
    countAnswer(byLens, row?.lens, row?.answer);
    const answer = typeof row?.answer === 'string' && row.answer.length > 0 ? row.answer : 'unanswered';
    byAnswer[answer] = (byAnswer[answer] ?? 0) + 1;
    if (row?.answer === ANSWER_YES && typeof row?.subject === 'string' && row.subject.length > 0) {
      yesSubjects.add(row.subject);
    }
  }
  const subjects = [...yesSubjects].sort();
  return {
    records: rows.length,
    byLens,
    byAnswer,
    yes: byAnswer[ANSWER_YES] ?? 0,
    no: byAnswer[ANSWER_NO] ?? 0,
    unresolvedSubjects: subjects.slice(0, limit),
    overflow: Math.max(0, subjects.length - limit),
  };
}

/** The adversarial summary. */
// [::TICKET::] PX-283, PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-283|PX-284) --for-spec --no-implementation-order`.
function summarizeAdversarial(rows) {
  const byOutcome = {};
  for (const row of rows) {
    const outcome = typeof row?.outcome === 'string' && row.outcome.length > 0 ? row.outcome : 'unknown';
    byOutcome[outcome] = (byOutcome[outcome] ?? 0) + 1;
  }
  return { records: rows.length, byOutcome };
}

/**
 * Summarize the readings under one workspace root.
 *
 * @param {string} root — workspace root
 * @param {{ limit?: number }} [options]
 * @returns {object}
 */
export function summarizeReadings(root, { limit = MAX_UNRESOLVED_SUBJECTS } = {}) {
  const directory = join(root, READINGS_DIRECTORY);
  if (!existsSync(directory)) return emptyReadings();

  const inquest = readJsonLines(directory, INQUEST_FILE);
  const adversarial = readJsonLines(directory, ADVERSARIAL_FILE);
  const uncovered = readJsonLines(directory, UNCOVERED_FILE);
  const withheld = [...inquest.withheld, ...adversarial.withheld, ...uncovered.withheld];
  const hasAnyFile = [inquest, adversarial, uncovered].some((file) => file.status !== 'absent');
  if (!hasAnyFile) return emptyReadings();

  const status = withheld.length > 0 ? 'partial' : 'available';
  return {
    status,
    inquest: summarizeInquest(inquest.rows, limit),
    adversarial: summarizeAdversarial(adversarial.rows),
    uncovered: { records: uncovered.rows.length },
    withheld,
  };
}

/** One line for the console and the Markdown report. */
export function formatReadingsLine(readings) {
  if (readings.status === 'not-available') return 'not-available';
  const inquest = readings.inquest;
  const subjects = inquest.unresolvedSubjects.length === 0
    ? 'none'
    : `${inquest.unresolvedSubjects.length}${inquest.overflow > 0 ? ` (+${inquest.overflow} more)` : ''}`;
  const suffix = readings.status === 'partial' ? '; partial' : '';
  return `inquest ${inquest.yes} Yes/${inquest.no} No, unresolved subjects ${subjects}; adversarial ${readings.adversarial.records}; uncovered ${readings.uncovered.records}${suffix}`;
}
