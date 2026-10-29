// [::TICKET::] P26-4, P26-5 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(P26-4|P26-5) --for-spec --no-implementation-order`.
/**
 * The AI's design semantics — an expert reading, admitted only as an inference, and
 * only once every package has one.
 *
 * The analysis measures, and a measurement is not an interpretation. What the machine
 * cannot supply is the design reading an engineer adds on top: what a package is for,
 * what it guarantees, why its boundary is where it is. This module is the door that
 * reading comes through, and it is a narrow one, because the spec is a document other
 * commands act on.
 *
 * The unit is the **package**, not the file. Completeness is therefore a property of the
 * `packages x items` matrix: every cell is closed by a reading or by a decline that
 * gives a reason a reader can weigh, and a file with one hole is refused whole. A file
 * that said a great deal about one package and nothing about the next would otherwise
 * read as a smaller semantics when it is an incomplete one — the same failure the spec
 * itself was built to stop, one level down.
 *
 * Four further rules keep the closure from being satisfied mechanically, and none of
 * them judges whether a reading is *good* — that is the author's and the reviewer's, and
 * the command file says so:
 *
 *   - `grounded`: a reading names the measured claims it infers from, and every id
 *     resolves. `origin-spec.mjs` already refuses an `inferred` claim with no basis;
 *     this is the stricter half of the same rule;
 *   - `refutable`: a reading states what would refute it, and the statement names
 *     something a reader could actually go and do. An interpretation nobody can refute
 *     is indistinguishable from a preference;
 *   - `not_restatement` and `not_reused`: a reading that repeats the measurement, or
 *     the same sentence answering two cells, is not an interpretation;
 *   - `names` and `covers`: the items whose subject is a counterpart have to name one,
 *     and the boundary has to account for every crossing the run measured in its scope.
 *
 * Refusal is total. Admitting the sound entries of a partly broken file would publish a
 * spec whose authored section silently differs from the file the operator handed over,
 * and nothing in the document would say so.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { SEMANTICS_ITEMS, semanticsItem } from './design-semantics-schema.mjs';

/** The two keys the file carries, so an unexpected one is refused by name. */
export const READINGS_FILE_KEY = 'readings';
export const DECLINED_FILE_KEY = 'declined';

/** The namespace an authored claim's id lives in, so it is never mistaken for a measurement. */
export const DESIGN_CLAIM_ID_PREFIX = 'clm-design-';

/** The fields a reading may carry. Anything else is an attempt to write a measurement. */
const READING_FIELDS = Object.freeze(['scope', 'item', 'statement', 'falsification', 'basis']);

/** The fields that would re-open a measurement rather than add beside one. */
const MEASUREMENT_FIELDS = Object.freeze(['claim_id', 'claim_type', 'evidence', 'evidence_records', 'claim_type_reason']);

/** A decline reason that says nothing, so the cell it closes is not really closed. */
const BOILERPLATE_REASONS = Object.freeze(['n/a', 'na', 'none', 'not applicable', 'see above', 'tbd', 'todo', '-', '--']);

/** A reading shorter than this is a label, not a statement about the design. */
const MIN_STATEMENT_LENGTH = 20;

/** Something a reader could go and do: a location in the tree, or a command. */
const REFUTABLE_PATTERN = /(?:[\w./-]+\.[A-Za-z0-9]+:\d+)|(?:`[^`]+`)/;

/** A reading that says its counterpart does not exist is a complete answer, not a silence. */
const NO_COUNTERPART_PATTERN = /\bnone\b|\bno\s+(?:[a-z]+\s+)?(?:consumer|collaborator|owner|caller|writer|reader|peer|dependency|package)s?\b/i;

/** The id an authored claim carries: a function of its cell and its wording. */
export function designClaimId({ scope, item, statement }) {
  const seed = `${scope}\u0000${item}\u0000${statement}`;
  return `${DESIGN_CLAIM_ID_PREFIX}${createHash('sha256').update(seed, 'utf8').digest('hex').slice(0, 12)}`;
}

/**
 * The entries an operator authored, read from the file they wrote.
 *
 * @returns {{entries: object|null, findings: string[]}}
 */
export function readSemanticsFile(filePath) {
  if (!existsSync(filePath)) return { entries: null, findings: [`${filePath} does not exist`] };

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    return { entries: null, findings: [`${filePath} could not be read as JSON (${error.message})`] };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { entries: null, findings: [`${filePath} must hold one object with "${READINGS_FILE_KEY}" and "${DECLINED_FILE_KEY}"`] };
  }
  const unknown = Object.keys(parsed).filter((key) => key !== READINGS_FILE_KEY && key !== DECLINED_FILE_KEY);
  if (unknown.length > 0) {
    return { entries: null, findings: [`${filePath} carries ${unknown.join(', ')}, and the only keys are ${READINGS_FILE_KEY} and ${DECLINED_FILE_KEY}`] };
  }
  const readings = Array.isArray(parsed[READINGS_FILE_KEY]) ? parsed[READINGS_FILE_KEY] : [];
  const declined = Array.isArray(parsed[DECLINED_FILE_KEY]) ? parsed[DECLINED_FILE_KEY] : [];
  if (readings.length === 0 && declined.length === 0) {
    return { entries: null, findings: [`${filePath} closes no cell: it holds neither a reading nor a decline`] };
  }
  return { entries: { readings, declined }, findings: [] };
}

/** The text a comparison works on, so case and spacing do not decide distinctness. */
function normalise(text) {
  return String(text).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** The names a reading may use to point at a counterpart: a package, or a location. */
function counterpartsIn(statement, packages) {
  const found = packages.filter((name) => statement.includes(name));
  return REFUTABLE_PATTERN.test(statement) ? [...found, 'a location in the tree'] : found;
}

/** What is wrong with one cell's reading, before the file as a whole is judged. */
function findingsForReading(reading, cell, context) {
  const where = `${cell.scope} — ${cell.item}`;
  if (reading === null || typeof reading !== 'object' || Array.isArray(reading)) {
    return [`${where}: the reading is not an object`];
  }

  const findings = [];
  for (const field of MEASUREMENT_FIELDS) {
    if (field in reading) {
      findings.push(`${where}: carries "${field}", which is how a measured claim is re-opened rather than added beside`);
    }
  }
  for (const field of Object.keys(reading)) {
    if (!READING_FIELDS.includes(field)) findings.push(`${where}: carries "${field}", which no reading may state`);
  }
  if (reading.scope !== cell.scope || reading.item !== cell.item) {
    findings.push(`${where}: the reading declares ${reading.scope ?? 'no scope'} — ${reading.item ?? 'no item'}, which is not the cell it closes`);
  }

  const statement = typeof reading.statement === 'string' ? reading.statement.trim() : '';
  if (statement.length < MIN_STATEMENT_LENGTH) {
    findings.push(`${where}: states no statement of the design`);
  }
  if (typeof reading.falsification !== 'string' || reading.falsification.trim().length === 0) {
    findings.push(`${where}: states no falsification, so nothing about it could be refuted`);
  } else if (!REFUTABLE_PATTERN.test(reading.falsification)) {
    findings.push(`${where}: its falsification names neither a location in the tree nor a command, so no reader could run it`);
  }

  if (!Array.isArray(reading.basis) || reading.basis.length === 0) {
    findings.push(`${where}: names no basis`);
  } else {
    for (const id of reading.basis) {
      if (!context.measuredIds.has(id)) findings.push(`${where}: names ${id} in its basis, and no claim carries that id`);
    }
    for (const id of reading.basis) {
      const measured = context.measuredById.get(id);
      if (measured !== undefined && statement.length > 0 && normalise(statement) === normalise(measured.statement)) {
        findings.push(`${where}: restates the measurement at ${id} rather than interpreting it`);
      }
    }
  }

  // The boundary answers for the crossings the run measured in its own scope: a reading
  // that accounts for one of two is not an account of the boundary.
  if (cell.item === 'boundary') {
    const crossings = context.crossingsByScope.get(cell.scope) ?? [];
    const named = new Set(Array.isArray(reading.basis) ? reading.basis : []);
    for (const crossing of crossings) {
      if (!named.has(crossing)) findings.push(`${where}: leaves the crossing at ${crossing} unaccounted for`);
    }
  }

  if (context.namesRequired.has(cell.item) && statement.length > 0) {
    const counterparts = counterpartsIn(statement, context.packages);
    if (counterparts.length === 0 && !NO_COUNTERPART_PATTERN.test(statement)) {
      findings.push(`${where}: names no counterpart, and does not say that there is none`);
    }
  }

  if (statement.length > 0) {
    const seen = context.wordingSeen.get(normalise(statement));
    if (seen !== undefined) {
      findings.push(`${where}: repeats word for word the reading at ${seen}, so one sentence is answering two cells`);
    } else {
      context.wordingSeen.set(normalise(statement), where);
    }
  }

  return findings;
}

/** What is wrong with one decline. */
function findingsForDecline(declined, cell) {
  const where = `${cell.scope} — ${cell.item}`;
  if (declined === null || typeof declined !== 'object' || Array.isArray(declined)) {
    return [`${where}: the decline is not an object`];
  }
  const findings = [];
  if (declined.scope !== cell.scope || declined.item !== cell.item) {
    findings.push(`${where}: the decline declares ${declined.scope ?? 'no scope'} — ${declined.item ?? 'no item'}, which is not the cell it closes`);
  }
  const reason = typeof declined.reason === 'string' ? declined.reason.trim() : '';
  if (reason.length === 0) {
    findings.push(`${where}: gives no reason, so the cell is not closed by it`);
  } else if (BOILERPLATE_REASONS.includes(reason.toLowerCase())) {
    findings.push(`${where}: its reason is "${reason}", which says nothing a reader could weigh`);
  }
  return findings;
}

/** The context every cell is judged in, gathered once so the arithmetic has one source. */
function buildContext({ claims, packages }) {
  const measured = Array.isArray(claims) ? claims : [];
  return {
    packages,
    measuredIds: new Set(measured.map((claim) => claim.claim_id)),
    measuredById: new Map(measured.map((claim) => [claim.claim_id, claim])),
    crossingsByScope: measured.reduce((byScope, claim) => {
      if (!String(claim.claim_id).includes('boundary_crossing')) return byScope;
      const held = byScope.get(claim.scope) ?? [];
      held.push(claim.claim_id);
      return byScope.set(claim.scope, held);
    }, new Map()),
    namesRequired: new Set(SEMANTICS_ITEMS.filter((entry) => entry.checks.includes('names')).map((entry) => entry.key)),
    wordingSeen: new Map(),
  };
}

/** Every cell of the matrix, with whatever the file said about it. */
function cellsOf({ readings, declined, packages }) {
  const readingsByCell = new Map(readings.map((reading) => [`${reading?.scope}\u0000${reading?.item}`, reading]));
  const declinedByCell = new Map(declined.map((entry) => [`${entry?.scope}\u0000${entry?.item}`, entry]));

  const findings = [];
  const cells = [];
  for (const scope of packages) {
    for (const entry of SEMANTICS_ITEMS) {
      const at = `${scope}\u0000${entry.key}`;
      const reading = readingsByCell.get(at);
      const declinedEntry = declinedByCell.get(at);
      if (reading !== undefined && declinedEntry !== undefined) {
        findings.push(`${scope} — ${entry.key}: closed twice, by a reading and by a decline`);
        continue;
      }
      if (reading !== undefined) {
        readingsByCell.delete(at);
        cells.push({ scope, item: entry.key, reading, declined: null });
        continue;
      }
      if (declinedEntry !== undefined) {
        declinedByCell.delete(at);
        cells.push({ scope, item: entry.key, reading: null, declined: declinedEntry });
        continue;
      }
      findings.push(`${scope} — ${entry.key}: neither written nor declined, so the semantics is not closed at this package`);
    }
  }
  for (const orphan of readingsByCell.values()) {
    findings.push(`${orphan?.scope ?? 'an unnamed scope'} — ${orphan?.item ?? 'an unnamed item'}: a reading for a cell the partition does not hold`);
  }
  for (const orphan of declinedByCell.values()) {
    findings.push(`${orphan?.scope ?? 'an unnamed scope'} — ${orphan?.item ?? 'an unnamed item'}: a decline for a cell the partition does not hold`);
  }
  return { cells, findings };
}

/**
 * The authored readings as claims, or nothing and the reasons.
 *
 * @returns {{claims: Array|null, findings: string[]}}
 */
export function validateDesignSemantics({ authored, claims, packages } = {}) {
  const declared = Array.isArray(packages) && packages.length > 0 ? [...packages].sort() : null;
  if (declared === null) {
    return { claims: null, findings: ['the packages the partition declares were not supplied, so the matrix has no rows'] };
  }
  if (authored === null || typeof authored !== 'object' || Array.isArray(authored)) {
    return { claims: null, findings: ['the semantics must be one object holding the readings and the declines'] };
  }

  const context = buildContext({ claims, packages: declared });
  const { cells, findings: closureFindings } = cellsOf({
    readings: Array.isArray(authored[READINGS_FILE_KEY]) ? authored[READINGS_FILE_KEY] : [],
    declined: Array.isArray(authored[DECLINED_FILE_KEY]) ? authored[DECLINED_FILE_KEY] : [],
    packages: declared,
  });

  const findings = [
    ...closureFindings,
    ...cells.flatMap((cell) => (cell.reading !== null
      ? findingsForReading(cell.reading, cell, context)
      : findingsForDecline(cell.declined, cell))),
  ];
  if (findings.length > 0) return { claims: null, findings };

  return {
    claims: cells.filter((cell) => cell.reading !== null).map((cell) => ({
      claim_id: designClaimId(cell.reading),
      claim_type: 'inferred',
      scope: cell.reading.scope,
      statement: cell.reading.statement,
      falsification: cell.reading.falsification,
      semantics_item: cell.reading.item,
      evidence: [],
      counterevidence: [],
      basis: [...cell.reading.basis],
    })),
    findings: [],
  };
}

/** The coverage the spec's Design semantics section carries, per package. */
// [::TICKET::] P26-5 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=P26-5 --for-spec --no-implementation-order`.
export function summariseCoverage({ authored, packages }) {
  const readings = Array.isArray(authored?.[READINGS_FILE_KEY]) ? authored[READINGS_FILE_KEY] : [];
  const declined = Array.isArray(authored?.[DECLINED_FILE_KEY]) ? authored[DECLINED_FILE_KEY] : [];
  const rows = (packages ?? []).map((scope) => ({
    scope,
    written: readings.filter((reading) => reading?.scope === scope).length,
    declined: declined.filter((entry) => entry?.scope === scope).length,
  }));
  return {
    packages: rows.length,
    cells: rows.length * SEMANTICS_ITEMS.length,
    written: readings.length,
    declined: declined.length,
    rows,
    declinedCells: declined.map((entry) => ({ scope: entry?.scope, item: entry?.item, reason: entry?.reason })),
  };
}

/** Whether one item's answer is present for every package, which is what the locator asks. */
export function isCellWritten({ claims, scope, item }) {
  return (claims ?? []).some((claim) => claim.semantics_item === item && claim.scope === scope);
}

/** The item a claim answers, or `undefined` for a measured claim. */
export function itemOfClaim(claim) {
  return claim?.semantics_item === undefined ? undefined : semanticsItem(claim.semantics_item)?.key;
}

/** The advice an operator acts on when the file was refused, naming each finding. */
export function renderSemanticsAdvice(findings, { path }) {
  const lines = ['The design semantics were not admitted.', `  Where: ${path}`];
  for (const finding of findings) lines.push(`  Which: ${finding}`);
  lines.push('What to do: correct the cell the finding names and run the same command again. Nothing was');
  lines.push('  published, so no partial spec is left behind — and a cell admitted from a partly');
  lines.push('  broken file would be one the operator never wrote.');
  return `${lines.join('\n')}\n`;
}

/** The verdict written when the readings were admitted. */
export function renderSemanticsVerdict({ count, path }) {
  return `${count} design ${count === 1 ? 'reading was' : 'readings were'} admitted from ${path}, as inferred claims beside the measured ones.\n`;
}
