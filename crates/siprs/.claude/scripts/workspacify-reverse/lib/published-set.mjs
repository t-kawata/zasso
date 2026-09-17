/**
 * What the destination holds, against what a run of the entrance owes it.
 *
 * Three states, and the difference between them is the whole point of the check.
 * A document the analysis never reached is `absent`, and for a document a shallower
 * run does not publish that is a fact about the run rather than a defect. A document
 * that exists and holds nothing is `empty`, and that is always a defect: the publisher
 * writes a document or writes none, so an empty one is a write that failed. Collapsing
 * the two into one comparison (`length > 0`) is exactly the reading this module exists
 * to prevent — a reader told "missing" would look for a run that was never asked to
 * produce it.
 *
 * [::TICKET::] P26-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-3 --for-spec --no-implementation-order`.
 */
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** The three states a document the destination may hold can be in. */
export const PUBLICATION_STATES = Object.freeze({
  ABSENT: 'absent',
  EMPTY: 'empty',
  PRESENT: 'present',
});

/**
 * The documents the exit owes.
 *
 * A run that reached R8 publishes all three, so a destination missing one did not
 * reach the exit — which is the question Step 3 asks.
 */
export const EXIT_DOCUMENTS = Object.freeze([
  'ANALYSIS-SCOPE.json',
  'ORIGIN-LONG-SPEC.json',
  'ORIGIN-LONG-SPEC.md',
]);

/**
 * The documents Step 4 reads, beside the two the exit owes.
 *
 * A run whose depth stopped earlier does not publish every one of them, so their
 * absence is reported rather than refused; an empty one is refused, because the
 * publisher never writes one.
 */
export const READING_DOCUMENTS = Object.freeze([
  'R0-R2-REPORT.md',
  'CLAIM-LEDGER.json',
  'R7-SERVING.md',
  'CAPABILITY-PROFILE.json',
]);

/** The state of one document: absent, empty or present. */
export function readPublicationState(filePath) {
  if (!existsSync(filePath)) return PUBLICATION_STATES.ABSENT;
  const size = statSync(filePath).size;
  return size === 0 ? PUBLICATION_STATES.EMPTY : PUBLICATION_STATES.PRESENT;
}

/**
 * What the destination holds against what the run owes it.
 *
 * @param {{destination: string}} params — the reserved directory beneath the subject
 * @returns {{destination: string, owed: object[], reads: object[], present: number, owedCount: number}}
 */
export function readPublishedSet({ destination } = {}) {
  const owed = EXIT_DOCUMENTS.map((name) => ({ name, state: readPublicationState(join(destination, name)) }));
  const reads = READING_DOCUMENTS.filter((name) => !EXIT_DOCUMENTS.includes(name)).map((name) => ({
    name,
    state: readPublicationState(join(destination, name)),
  }));

  return {
    destination,
    owed,
    reads,
    present: owed.filter((document) => document.state === PUBLICATION_STATES.PRESENT).length,
    owedCount: owed.length,
  };
}

/**
 * The findings a reader must act on.
 *
 * An owed document that is absent or empty, and a reading document that is empty.
 * A reading document that is absent is reported by the render and is not a finding:
 * the analysis publishes it only when its depth reached the stage that produces it.
 */
export function findUnpublished(set) {
  const findings = [];
  for (const document of set.owed) {
    if (document.state !== PUBLICATION_STATES.PRESENT) {
      findings.push({ name: document.name, state: document.state, owes: true });
    }
  }
  for (const document of set.reads) {
    if (document.state === PUBLICATION_STATES.EMPTY) {
      findings.push({ name: document.name, state: document.state, owes: false });
    }
  }
  return findings;
}

/** The set as Markdown: every document with its state, then the count that is owed. */
export function renderPublishedSet(set) {
  const lines = [
    '# Published set',
    '',
    `Destination: \`${set.destination}\``,
    `Owed and present: ${set.present} of ${set.owedCount}.`,
    '',
    '| Document | State |',
    '|---|---|',
  ];
  for (const document of set.owed) lines.push(`| \`${document.name}\` | ${document.state} |`);
  for (const document of set.reads) lines.push(`| \`${document.name}\` | ${document.state} |`);
  return `${lines.join('\n')}\n`;
}

/** The findings as the advice an operator acts on, naming each document and its state. */
export function renderUnpublishedAdvice(findings, { destination }) {
  const lines = ['The destination does not hold what this Step owes.', `  Where: ${destination}`];
  for (const finding of findings) {
    lines.push(`  Which: ${finding.name} is ${finding.state}${finding.owes ? '' : ' (read by Step 4)'}`);
  }
  lines.push('What to do: return to Step 2 and run the entrance again. Publishing is atomic, so a');
  lines.push('  destination in this state means the run did not reach the exit, and nothing partial');
  lines.push('  is left to repair by hand.');
  return `${lines.join('\n')}\n`;
}
