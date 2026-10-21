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
const UNCOVERED_OUTCOMES = Object.freeze(['performed', 'escaped']);

/** The raw rows the registry and judgment protocol read. */
// [::TICKET::] PX-289 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-289 --for-spec --no-implementation-order`.
export function readReadingsForRegistry(root) {
  const directory = join(root, READINGS_DIRECTORY);
  if (!existsSync(directory)) {
    return { span: [], uncovered: [], inquest: [], adversarial: [], adjudicate: [], judgment: [], attack: [] };
  }
  return {
    span: readJsonLines(directory, 'readings-span.jsonl').rows,
    uncovered: readJsonLines(directory, UNCOVERED_FILE).rows,
    inquest: readJsonLines(directory, INQUEST_FILE).rows,
    adversarial: readJsonLines(directory, ADVERSARIAL_FILE).rows,
    adjudicate: readJsonLines(directory, 'readings-adjudicate.jsonl').rows,
    judgment: readJsonLines(directory, 'readings-judgment.jsonl').rows,
    attack: readJsonLines(directory, 'readings-attack.jsonl').rows,
  };
}

/** The empty shape a workspace with no readings reports. */
// [::TICKET::] PX-289 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-289 --for-spec --no-implementation-order`.
export function emptyReadings(registry = []) {
  const requiredInquest = registry.filter((entry) => typeof entry.id === 'string' && entry.id.startsWith('READ:INQUEST:'));
  const requiredUncovered = registry.filter((entry) => typeof entry.id === 'string' && entry.id.startsWith('READ:UNCOVERED:') && entry.class === 'semantic');
  const open = registry
    .filter((entry) => entry.required !== false)
    .map((entry) => ({ id: entry.id, code: 'MISSING_EVIDENCE', subject: entry.subject ?? null }));
  return {
    status: 'absent',
    present: false,
    inquest: {
      records: 0,
      byLens: {},
      byAnswer: {},
      yes: 0,
      no: 0,
      required: requiredInquest.map((entry) => entry.id),
      missing: requiredInquest.map((entry) => entry.id),
      unresolvedSubjects: [],
      unresolvedDetails: [],
      unresolvedSubjectCount: 0,
      overflow: 0,
      path: null,
    },
    adversarial: { records: 0, byOutcome: {}, required: [], missing: [] },
    uncovered: {
      records: 0,
      unresolved: requiredUncovered.length,
      byOutcome: {},
      required: requiredUncovered.map((entry) => entry.subject ?? entry.id),
      mechanical: registry.filter((entry) => typeof entry.id === 'string' && entry.id.startsWith('READ:UNCOVERED:') && entry.class === 'mechanical').map((entry) => entry.subject ?? entry.id),
      missing: requiredUncovered.map((entry) => entry.subject ?? entry.id),
    },
    span: { records: 0 },
    open,
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

/** The subject and lens a registry inquest obligation names. */
// [::TICKET::] PX-289, PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-289|PX-290) --for-spec --no-implementation-order`.
function inquestPairOf(entry) {
  const subject = String(entry?.subject ?? '');
  const separator = subject.lastIndexOf(':');
  if (separator === -1) return null;
  return { subject: subject.slice(0, separator), lens: subject.slice(separator + 1) };
}

/** The inquest summary, including the capped unresolved Yes subjects. */
// [::TICKET::] PX-283, PX-284, PX-286, PX-289, PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-283|PX-284|PX-286|PX-289|PX-290) --for-spec --no-implementation-order`.
function summarizeInquest(rows, limit, registry = []) {
  const byLens = {};
  const byAnswer = {};
  const details = [];
  const answered = new Set();
  for (const row of rows) {
    countAnswer(byLens, row?.lens, row?.answer);
    const answer = typeof row?.answer === 'string' && row.answer.length > 0 ? row.answer : 'unanswered';
    byAnswer[answer] = (byAnswer[answer] ?? 0) + 1;
    if (typeof row?.subject === 'string' && typeof row?.lens === 'string') {
      answered.add(`${row.subject}\u0000${row.lens}`);
    }
    if (row?.answer === ANSWER_YES && typeof row?.subject === 'string' && row.subject.length > 0) {
      details.push({
        subject: row.subject,
        line: typeof row?.line === 'number' ? row.line : null,
        quote: typeof row?.quote === 'string' ? row.quote : null,
      });
    }
  }
  const requiredEntries = registry.filter((entry) => typeof entry.id === 'string' && entry.id.startsWith('READ:INQUEST:'));
  const missing = requiredEntries
    .filter((entry) => {
      const pair = inquestPairOf(entry);
      return pair === null || !answered.has(`${pair.subject}\u0000${pair.lens}`);
    })
    .map((entry) => entry.id);
  const subjects = [...new Set(details.map((entry) => entry.subject))].sort();
  return {
    records: rows.length,
    byLens,
    byAnswer,
    yes: byAnswer[ANSWER_YES] ?? 0,
    no: byAnswer[ANSWER_NO] ?? 0,
    required: requiredEntries.map((entry) => entry.id),
    missing,
    unresolvedSubjectCount: subjects.length,
    unresolvedSubjects: subjects.slice(0, limit),
    unresolvedDetails: details.slice(0, limit),
    overflow: Math.max(0, subjects.length - limit),
  };
}

/**
 * The uncovered summary.
 *
 * A record whose outcome is not performed or escaped is not an answer to the uncovered
 * question, so it is counted as unresolved rather than as a clean measurement. The same
 * is true of a record with no subject: it cannot be matched to a worklist member.
 */
// [::TICKET::] PX-288, PX-289, PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-288|PX-289|PX-290) --for-spec --no-implementation-order`.
function summarizeUncovered(rows, registry = []) {
  const byOutcome = {};
  const resolved = new Set();
  let unresolvedRows = 0;
  for (const row of rows) {
    const outcome = typeof row?.outcome === 'string' && UNCOVERED_OUTCOMES.includes(row.outcome) ? row.outcome : null;
    if (outcome === null || typeof row?.subject !== 'string' || row.subject.length === 0) {
      unresolvedRows += 1;
      continue;
    }
    byOutcome[outcome] = (byOutcome[outcome] ?? 0) + 1;
    resolved.add(row.subject);
  }
  const requiredEntries = registry.filter((entry) => typeof entry.id === 'string'
    && entry.id.startsWith('READ:UNCOVERED:')
    && entry.class === 'semantic');
  const mechanicalEntries = registry.filter((entry) => typeof entry.id === 'string'
    && entry.id.startsWith('READ:UNCOVERED:')
    && entry.class === 'mechanical');
  const required = requiredEntries.map((entry) => entry.subject ?? entry.id);
  const missing = required.filter((subject) => !resolved.has(subject));
  return {
    records: rows.length,
    unresolved: unresolvedRows + missing.length,
    byOutcome,
    required,
    mechanical: mechanicalEntries.map((entry) => entry.subject ?? entry.id),
    missing,
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
export function summarizeReadings(root, { limit = MAX_UNRESOLVED_SUBJECTS, registry = [] } = {}) {
  const directory = join(root, READINGS_DIRECTORY);
  if (!existsSync(directory)) return emptyReadings(registry);

  const inquest = readJsonLines(directory, INQUEST_FILE);
  const adversarial = readJsonLines(directory, ADVERSARIAL_FILE);
  const uncovered = readJsonLines(directory, UNCOVERED_FILE);
  const withheld = [...inquest.withheld, ...adversarial.withheld, ...uncovered.withheld];
  const hasAnyFile = [inquest, adversarial, uncovered].some((file) => file.status !== 'absent');
  if (!hasAnyFile) return emptyReadings(registry);

  const status = withheld.length > 0 ? 'partial' : 'available';
  const inquestSummary = summarizeInquest(inquest.rows, limit, registry);
  inquestSummary.path = join(directory, INQUEST_FILE);
  const uncoveredSummary = summarizeUncovered(uncovered.rows, registry);
  const open = [
    ...inquestSummary.missing.map((id) => ({ id, code: 'MISSING_EVIDENCE', subject: id })),
    ...uncoveredSummary.missing.map((subject) => ({
      id: `READ:UNCOVERED:${subject}`,
      code: 'MISSING_EVIDENCE',
      subject,
    })),
  ];
  return {
    status,
    present: true,
    inquest: inquestSummary,
    adversarial: summarizeAdversarial(adversarial.rows),
    uncovered: uncoveredSummary,
    span: { records: (Array.isArray(readJsonLines(directory, 'readings-span.jsonl').rows) ? readJsonLines(directory, 'readings-span.jsonl').rows.length : 0) },
    open,
    withheld,
  };
}

/**
 * The full unresolved-reading set for one workspace.
 *
 * The report caps its display list; the debt gate must compare every Yes subject,
 * including those beyond the cap, so it reads the JSONL directly.
 *
 * @param {string} root — workspace root
 * @returns {{ subjects: Set<string>, count: number, withheldCount: number, path: string|null }}
 */
// [::TICKET::] PX-287 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-287 --for-spec --no-implementation-order`.
export function readUnresolvedReadingSubjects(root) {
  const directory = join(root, READINGS_DIRECTORY);
  const file = readJsonLines(directory, INQUEST_FILE);
  const subjects = new Set();
  let count = 0;
  for (const row of file.rows) {
    if (row?.answer !== ANSWER_YES) continue;
    count += 1;
    if (typeof row?.subject === 'string' && row.subject.length > 0) subjects.add(row.subject);
  }
  return {
    subjects,
    count,
    withheldCount: file.withheld.length,
    present: file.status !== 'absent',
    path: file.status === 'absent' ? null : join(directory, INQUEST_FILE),
  };
}

/** One line for the console and the Markdown report. */
export function formatReadingsLine(readings) {
  if (readings.status === 'not-available') return 'not-available';
  if (readings.status === 'absent') return 'absent; required readings are open';
  const inquest = readings.inquest;
  const subjects = inquest.unresolvedSubjects.length === 0
    ? 'none'
    : `${inquest.unresolvedSubjects.length}${inquest.overflow > 0 ? ` (+${inquest.overflow} more)` : ''}`;
  const suffix = readings.status === 'partial' ? '; partial' : '';
  return `inquest ${inquest.yes} Yes/${inquest.no} No, unresolved subjects ${subjects}; adversarial ${readings.adversarial.records}; uncovered ${readings.uncovered.records}${suffix}`;
}
