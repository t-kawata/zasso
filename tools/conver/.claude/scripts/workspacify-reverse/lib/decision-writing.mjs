/**
 * Writing the six decisions, through the schema the gate reads.
 *
 * The reader authors the answers; this module writes them. The split matters because the
 * document's shape is not a judgement — the six keys, the required fields inside each,
 * the surface closed to six — and a document written by hand is a document that can be
 * shaped wrong in ways the gate then reports as missing answers. Writing through the
 * schema turns "the answer was refused" into one event with one cause.
 *
 * A refused write leaves the destination untouched. A partial document would be worse
 * than none: the gate would report the answers it does contain as present and the run
 * would proceed on five.
 *
 * [::TICKET::] P26-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-3 --for-spec --no-implementation-order`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { JUDGEMENT_ITEMS, findSchemaViolations } from './reverse-decisions.mjs';

/** The six keys the design licenses, in the order it licenses them. */
export const DECISION_KEYS = Object.freeze(JUDGEMENT_ITEMS.map((item) => item.id));

/**
 * The answers a reader authored, read from the file they wrote.
 *
 * @returns {{answers: object|null, findings: string[]}}
 */
export function readAnswers(filePath) {
  if (!existsSync(filePath)) {
    return { answers: null, findings: [`${filePath} does not exist`] };
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    return { answers: null, findings: [`${filePath} could not be read as JSON (${error.message})`] };
  }

  const findings = [];
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { answers: null, findings: [`${filePath} must hold one object, one key per decision`] };
  }

  const written = Object.keys(parsed).sort();
  const licensed = [...DECISION_KEYS].sort();
  const missing = licensed.filter((key) => !written.includes(key));
  const extra = written.filter((key) => !licensed.includes(key));
  if (missing.length > 0) findings.push(`the answers leave out ${missing.join(', ')}`);
  if (extra.length > 0) {
    findings.push(`the answers add ${extra.join(', ')}, and the surface is closed to the six the design licenses`);
  }

  return { answers: findings.length === 0 ? parsed : null, findings };
}

/**
 * Write the answers as the decisions document.
 *
 * @returns {{path: string|null, findings: string[]}} — the path written, or why nothing was
 */
export function writeDecisions({ destination, answers, path }) {
  const violations = findSchemaViolations(answers);
  if (violations.length > 0) {
    return { path: null, findings: violations.map((violation) => `the schema refuses the answer: ${violation.message ?? violation}`) };
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(answers, null, 2)}\n`, 'utf8');
  return { path, findings: [] };
}

/** The advice an operator acts on when the answers were refused, naming each finding. */
export function renderDecisionWritingAdvice(findings, { path }) {
  const lines = ['The six decisions were not written.', `  Where: ${path}`];
  for (const finding of findings) lines.push(`  Which: ${finding}`);
  lines.push('What to do: correct the answers file and run the same command again. Nothing was');
  lines.push('  written, so the destination holds no partial document to repair.');
  return `${lines.join('\n')}\n`;
}

/** The verdict written when the six decisions are recorded. */
export function renderDecisionWritingVerdict({ path }) {
  return `The six decisions are recorded at ${path}. Run the gate to check them: node .claude/scripts/workspacify-reverse/run.mjs gate\n`;
}
