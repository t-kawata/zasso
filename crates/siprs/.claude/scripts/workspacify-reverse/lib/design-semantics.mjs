// [::TICKET::] P26-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-4 --for-spec --no-implementation-order`.
/**
 * The AI's design semantics — an expert reading, admitted only as an inference.
 *
 * The analysis measures, and a measurement is not an interpretation. What the machine
 * cannot supply is the design reading an engineer adds on top: which package owns which
 * responsibility, why a boundary is where it is, what a contract means. This module is
 * the door that reading comes through, and it is a narrow one, because the spec is a
 * document other commands act on.
 *
 * Three rules, each enforced by refusal rather than by advice:
 *
 *   - an entry must name the measured claims it infers from, and every one of those ids
 *     must exist. `origin-spec.mjs` already refuses an `inferred` claim with no basis —
 *     "an assertion wearing an inference label" — and this is the stricter half of the
 *     same rule: a basis that names nothing is not a basis;
 *   - an entry must state what would falsify it. An interpretation nobody can refute is
 *     indistinguishable from a preference, and the spec's whole discipline is that every
 *     claim carries the means of its own refutation;
 *   - an entry may not name a claim id, a claim type or evidence, because each of those
 *     is how a measurement would be re-opened. The measured claims are what the run
 *     found; an author adds beside them and never over them.
 *
 * A refused file admits nothing. Admitting the sound entries of a partly broken file
 * would publish a spec whose authored section silently differs from the file the
 * operator handed over, and nothing in the document would say so.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

/** The one key the file carries, so an unexpected one is refused by name. */
export const SEMANTICS_FILE_KEY = 'semantics';

/** The namespace an authored claim's id lives in, so it is never mistaken for a measurement. */
export const DESIGN_CLAIM_ID_PREFIX = 'clm-design-';

/** The fields an entry may carry. Anything else is an attempt to write a measurement. */
const AUTHORED_FIELDS = Object.freeze(['statement', 'falsification', 'basis', 'scope']);

/** The fields that would re-open a measurement rather than add beside one. */
const MEASUREMENT_FIELDS = Object.freeze(['claim_id', 'claim_type', 'evidence', 'evidence_records', 'claim_type_reason']);

/** The id an authored claim carries: a function of its statement, so a re-run reproduces it. */
export function designClaimId(statement) {
  return `${DESIGN_CLAIM_ID_PREFIX}${createHash('sha256').update(statement, 'utf8').digest('hex').slice(0, 12)}`;
}

/**
 * The entries an operator authored, read from the file they wrote.
 *
 * @returns {{entries: Array|null, findings: string[]}}
 */
export function readSemanticsFile(filePath) {
  if (!existsSync(filePath)) return { entries: null, findings: [`${filePath} does not exist`] };

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    return { entries: null, findings: [`${filePath} could not be read as JSON (${error.message})`] };
  }

  return { entries: parsed, findings: [] };
}

/** What is wrong with one entry, as the reasons a reader has to act on. */
// [::TICKET::] P26-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-4 --for-spec --no-implementation-order`.
function findingsForEntry(entry, index, measuredIds) {
  const where = `entry ${index}`;
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    return [`${where} is not an object`];
  }

  const findings = [];
  for (const field of MEASUREMENT_FIELDS) {
    if (field in entry) {
      findings.push(`${where} carries "${field}", which is how a measured claim is re-opened rather than added beside`);
    }
  }
  for (const field of Object.keys(entry)) {
    if (!AUTHORED_FIELDS.includes(field)) findings.push(`${where} carries "${field}", which no authored entry may state`);
  }
  if (typeof entry.statement !== 'string' || entry.statement.trim().length === 0) {
    findings.push(`${where} states no statement`);
  }
  if (typeof entry.falsification !== 'string' || entry.falsification.trim().length === 0) {
    findings.push(`${where} states no falsification, so nothing about it could be refuted`);
  }
  if (typeof entry.scope !== 'string' || entry.scope.trim().length === 0) {
    findings.push(`${where} names no scope`);
  }
  if (!Array.isArray(entry.basis) || entry.basis.length === 0) {
    findings.push(`${where} names no basis`);
  } else {
    for (const id of entry.basis) {
      if (!measuredIds.has(id)) findings.push(`${where} names ${id} in its basis, and no claim carries that id`);
    }
  }
  return findings;
}

/**
 * The authored entries as claims, or nothing and the reasons.
 *
 * @returns {{claims: Array|null, findings: string[]}}
 */
export function validateDesignSemantics({ authored, claims } = {}) {
  const measured = Array.isArray(claims) ? claims : [];
  const measuredIds = new Set(measured.map((claim) => claim.claim_id));

  if (authored === null || typeof authored !== 'object' || Array.isArray(authored)) {
    return { claims: null, findings: ['the semantics must be one object holding one key, one entry per design reading'] };
  }
  const unknown = Object.keys(authored).filter((key) => key !== SEMANTICS_FILE_KEY);
  if (unknown.length > 0) {
    return { claims: null, findings: [`the file adds ${unknown.join(', ')}, and it carries exactly one key: ${SEMANTICS_FILE_KEY}`] };
  }
  const entries = authored[SEMANTICS_FILE_KEY];
  if (!Array.isArray(entries) || entries.length === 0) {
    return { claims: null, findings: [`${SEMANTICS_FILE_KEY} must hold at least one entry`] };
  }

  const findings = entries.flatMap((entry, position) => findingsForEntry(entry, position + 1, measuredIds));
  if (findings.length > 0) return { claims: null, findings };

  return {
    claims: entries.map((entry) => ({
      claim_id: designClaimId(entry.statement),
      claim_type: 'inferred',
      scope: entry.scope,
      statement: entry.statement,
      falsification: entry.falsification,
      evidence: [],
      counterevidence: [],
      basis: [...entry.basis],
    })),
    findings: [],
  };
}

/** The advice an operator acts on when the file was refused, naming each finding. */
export function renderSemanticsAdvice(findings, { path }) {
  const lines = ['The design semantics were not admitted.', `  Where: ${path}`];
  for (const finding of findings) lines.push(`  Which: ${finding}`);
  lines.push('What to do: correct the entry the finding names and run the same command again. Nothing was');
  lines.push('  published, so no partial spec is left behind — and an entry admitted from a partly');
  lines.push('  broken file would be one the operator never wrote.');
  return `${lines.join('\n')}\n`;
}

/** The verdict written when the entries were admitted. */
export function renderSemanticsVerdict({ count, path }) {
  return `${count} design ${count === 1 ? 'reading was' : 'readings were'} admitted from ${path}, as inferred claims beside the measured ones.\n`;
}
