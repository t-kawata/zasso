// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-289 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-289 --for-spec --no-implementation-order`.
/**
 * Mechanical predicates and the check-to-obligation resolution.
 *
 * These functions decide only facts the workspace already carries. A semantic claim is
 * never resolved here; it stays open until the judgment protocol records a held judgment.
 */
import { isDegenerateQuote } from './judgment.mjs';
import { ACTIVE_DISPOSITION, OBLIGATION_CLASS, OBLIGATION_STATE, REALIZED_OUTCOMES, compareOperationCensus } from './registry.mjs';
import { performedOperations } from './span.mjs';

const MAX_REPORTED_MISMATCH_IDS = 5;

/** The operations a span reading performed; the shared definition lives in span.mjs. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function spanOperations(span = []) {
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
  return performedOperations(span);
}

/**
 * Split the census worklist into mechanically performed and reader-required members.
 *
 * @param {string[]} worklist — every operation the borrowed census names
 * @param {Array<object>} span — readings-span.jsonl rows
 * @returns {{ mechanical: string[], required: string[] }}
 */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function checkUncoveredMechanical(worklist = [], span = []) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const performed = spanOperations(span);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const mechanical = worklist.filter((operationId) => performed.has(operationId));
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const required = worklist.filter((operationId) => !performed.has(operationId));
  return { mechanical, required };
}

/** The census bijection for one aspect. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function checkCensusBijection(censusIds = [], artifactIds = []) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const census = new Set(censusIds);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const artifact = new Set(artifactIds);
  return {
    ok: censusIds.every((id) => artifact.has(id)) && artifactIds.every((id) => census.has(id)),
    missing: censusIds.filter((id) => !artifact.has(id)),
    extra: artifactIds.filter((id) => !census.has(id)),
  };
}

/** Whether every declared entry has a span reading. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function checkSpanCoverage(entries = [], span = []) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const covered = new Set((Array.isArray(span) ? span : []).map((reading) => reading?.subject).filter(Boolean));
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const missing = entries.map((entry) => (typeof entry === 'string' ? entry : entry?.id)).filter((id) => !covered.has(id));
  return { ok: missing.length === 0, missing };
}

/** Whether every realized sequence and active operation has an owner and a ledger row. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function checkDistribution({ artifact = {}, packages = [] } = {}) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const operationOwners = new Set();
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const sequenceOwners = new Set();
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const ledgerUnits = new Set();
  for (const pkg of packages) {
    for (const unit of pkg?.view?.ownedOperationUnits ?? []) operationOwners.add(unit.operationId);
    for (const unit of pkg?.view?.ownedSequenceUnits ?? []) sequenceOwners.add(unit.sequenceId);
    for (const unit of pkg?.view?.crossBoundarySequenceUnits ?? []) sequenceOwners.add(unit.sequenceId);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const rows = pkg?.ledgerRows ?? [];
    for (const row of rows) ledgerUnits.add(row.unit);
  }
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const missingOperations = (artifact.operations ?? [])
    .filter((operation) => operation?.disposition === ACTIVE_DISPOSITION)
    .map((operation) => operation.id)
    .filter((id) => !operationOwners.has(id) || !ledgerUnits.has(`op-${id}`));
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const missingSequences = (artifact.sequences ?? [])
    .filter((sequence) => REALIZED_OUTCOMES.has(sequence?.outcome))
    .map((sequence) => sequence.id)
    .filter((id) => !sequenceOwners.has(id) && !ledgerUnits.has(`seq-${id}`) && !ledgerUnits.has(`xdir-${id}`));
  return { ok: missingOperations.length === 0 && missingSequences.length === 0, missingOperations, missingSequences };
}

/**
 * Classify one mechanical check result.
 *
 * executed: the surface is present and at least one claim was evaluated.
 * vacuous: the surface is present but no claim was evaluated.
 * blocked: the surface is absent or the denominator is zero.
 */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function classifyMechanicalCheck({ subCheck, findings = [], required = true } = {}) {
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
  if (subCheck === undefined || subCheck === null) {
    return { state: OBLIGATION_STATE.OPEN, code: 'MISSING_CHECK' };
  }
  if (subCheck.status === 'blocked') {
    return { state: OBLIGATION_STATE.OPEN, code: 'BLOCKED_SURFACE', reason: subCheck.reason };
  }
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const evaluatedClaims = Number.isInteger(subCheck.evaluatedClaims) ? subCheck.evaluatedClaims : null;
  if (findings.length > 0) {
    return { state: OBLIGATION_STATE.OPEN, code: 'FINDING' };
  }
  if (required && evaluatedClaims === null) {
    return { state: OBLIGATION_STATE.OPEN, code: 'MISSING_DENOMINATOR' };
  }
  if (required && evaluatedClaims === 0) {
    return { state: OBLIGATION_STATE.OPEN, code: 'VACUOUS' };
  }
  return { state: OBLIGATION_STATE.CLOSED, code: null };
}

/** Resolve the census bijection obligations from the declared and artifact surfaces. */
// [::TICKET::] PX-289 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-289 --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function resolveCensusObligations(obligations = [], context = {}) {
  const { census = {}, artifact = {}, treeManifest = {}, allocateManifest = {}, packages = [] } = context;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const result = new Map([
    ['operations', checkCensusBijection(census.operations ?? [], (artifact.operations ?? []).map((entry) => entry.id))],
    ['entries', checkCensusBijection(census.entries ?? [], (artifact.sequences ?? []).map((entry) => entry.id))],
    ['sections', checkCensusBijection(census.sections ?? [], (artifact.sections ?? []).map((entry) => entry.id))],
    ['boundaries', checkCensusBijection(
      (treeManifest.dependencies?.boundaries ?? []).map((entry) => entry.id),
      (allocateManifest.contract_registry ?? []).map((entry) => entry.boundary_id),
    )],
    ['packages', checkCensusBijection(
      (treeManifest.workspace?.packages ?? []).map((entry) => entry.id),
      packages.map((entry) => entry.id),
    )],
  ]);
  return obligations.map((entry) => {
    if (entry.kind !== 'census' || !String(entry.id).startsWith('CENSUS:BIJECTION:')) return entry;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const kind = entry.id.replace('CENSUS:BIJECTION:', '');
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const resolution = result.get(kind);
    if (resolution === undefined || !resolution.ok) {
      return { ...entry, state: OBLIGATION_STATE.OPEN, reason: 'CENSUS_MISMATCH' };
    }
    return { ...entry, state: OBLIGATION_STATE.CLOSED, reason: null };
  });
}

/**
 * Resolve the operation-census consistency obligation.
 *
 * Zero mismatches close the obligation. A mismatch keeps it open with the count and
 * the first operation ids, so the next iteration can see which rows disagree.
 */
export function resolveConsistencyObligations(obligations = [], options = {}) {
  const {
    operationCensus = null,
    artifact = {},
    packages = [],
    allocateManifest = null,
  } = options;
  return obligations.map((entry) => {
    if (entry.id !== 'CENSUS:CONSISTENCY:operations') return entry;
    if (operationCensus === null || operationCensus === undefined) {
      return { ...entry, state: OBLIGATION_STATE.OPEN, reason: 'CENSUS_UNAVAILABLE' };
    }
    if (operationCensus.ok !== true) {
      return { ...entry, state: OBLIGATION_STATE.OPEN, reason: operationCensus.code ?? 'CENSUS_UNAVAILABLE' };
    }
    const { mismatches } = compareOperationCensus({
      censusRows: operationCensus.rows,
      artifact,
      packages,
      allocateManifest,
    });
    if (mismatches.length === 0) {
      return { ...entry, state: OBLIGATION_STATE.CLOSED, reason: null };
    }
    const ids = [...new Set(mismatches
      .map((mismatch) => mismatch.operationId)
      .filter((id) => typeof id === 'string'))];
    return {
      ...entry,
      state: OBLIGATION_STATE.OPEN,
      reason: 'OPERATION_CENSUS_MISMATCH',
      subject: `${mismatches.length} mismatch(es): ${ids.slice(0, MAX_REPORTED_MISMATCH_IDS).join(', ')}`,
    };
  });
}

/** A non-empty string. */
// [::TICKET::] PX-292, PX-293, PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-292|PX-293|PX-297) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function text(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/** A whitespace-normalized string for quote comparison. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-297) --for-spec --no-implementation-order`.
function normalize(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** Whether a row cites a line and a quote. */
// [::TICKET::] PX-292, PX-293, PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-292|PX-293|PX-297) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function validCitation(record) {
  return Number.isInteger(record?.line) && record.line > 0 && text(record?.quote);
}

/** A reading quote must occur on the cited line when the lines are supplied. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function validateReadingCitation(record, linesByPath) {
  if (!validCitation(record)) {
    return { ok: false, code: 'MISSING_BASIS', problem: 'the reading needs a positive line and a quote' };
  }
  if (linesByPath === undefined || linesByPath === null) {
    return { ok: true, code: null, problem: null };
  }
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const path = record.path ?? Object.keys(linesByPath)[0];
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const lines = linesByPath[path];
  if (!Array.isArray(lines)) {
    return { ok: false, code: 'READING_QUOTE_NOT_FOUND', problem: `the source ${path} was not supplied` };
  }
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const line = lines[record.line - 1];
  if (typeof line !== 'string' || !normalize(line).includes(normalize(record.quote))) {
    return { ok: false, code: 'READING_QUOTE_NOT_FOUND', problem: 'the quote does not occur on the cited line' };
  }
  return { ok: true, code: null, problem: null };
}

/** Whether a Yes carries a resolution performed against the current artifact. */
// [::TICKET::] PX-292, PX-293, PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-292|PX-293|PX-297) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function validFindingResolution(row, artifactDigest) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const resolution = row?.resolution;
  if (resolution === undefined || resolution === null) return false;
  if (!['spec-change', 'artifact-change'].includes(resolution.kind)) return false;
  if (artifactDigest !== null && resolution.artifactDigest !== artifactDigest) return false;
  return validCitation(resolution.evidence);
}

/** Whether one ruling attack has the shape the ruling question asks for. */
// [::TICKET::] PX-292, PX-293, PX-297, PX-303 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-292|PX-293|PX-297|PX-303) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function validRulingAttack(attack) {
  if (!['held', 'broken', 'unresolved'].includes(attack?.outcome)) return false;
  if (attack.outcome === 'held'
    && (!text(attack?.searched?.source) || isDegenerateQuote(attack?.searched?.quote))) return false;
  if (attack.outcome === 'broken' && (attack.counterexample === undefined || attack.counterexample === null)) return false;
  if (attack.outcome === 'unresolved' && !text(attack.reason)) return false;
  return true;
}

/** The evidence freshness verdict for one row. */
// [::TICKET::] PX-292, PX-293, PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-292|PX-293|PX-297) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function freshnessOf(row, artifactDigest) {
  if (artifactDigest === null) return { ok: true, reason: null };
  if (row?.artifactDigest === undefined) return { ok: false, reason: 'LEGACY_RECORD' };
  if (row.artifactDigest !== artifactDigest) return { ok: false, reason: 'STALE_EVIDENCE' };
  return { ok: true, reason: null };
}

/**
 * Whether a reading was produced by the current generation.
 *
 * The artifact digest says the record answers the current bytes. This says the
 * reader answered the current generation, which is what a re-read means.
 */
// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-297) --for-spec --no-implementation-order`.
function generationFreshness(row, generation, generationStartedAt) {
  if (generation !== null && row?.readerGeneration !== generation) {
    return { ok: false, reason: 'READER_GENERATION_STALE' };
  }
  if (typeof generationStartedAt === 'string'
    && (typeof row?.readAt !== 'string' || row.readAt < generationStartedAt)) {
    return { ok: false, reason: 'READING_NOT_REREAD' };
  }
  return { ok: true, reason: null };
}

/**
 * Resolve the reading obligations that a record can settle without a judgment.
 *
 * A Yes is a finding: it closes only with a resolution performed against the current
 * artifact. A ruling closes only after an attack on it holds. A row whose artifact digest
 * is absent or different answers an older artifact and is named rather than trusted.
 */
// [::TICKET::] PX-289, PX-292 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-289|PX-292) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function resolveReadingsObligations(obligations = [], options = {}) {
  const {
    readings = {}, artifactDigest = null, linesByPath = null, inheritedPolicy = 'block',
    generation = null, generationStartedAt = null,
  } = options;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const uncovered = new Map((Array.isArray(readings.uncovered) ? readings.uncovered : [])
    .map((row) => [row?.subject, row]));
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const inquest = new Map((Array.isArray(readings.inquest) ? readings.inquest : [])
    .filter((row) => typeof row?.subject === 'string' && typeof row?.lens === 'string')
    .map((row) => [`${row.subject}\u0000${row.lens}`, row]));
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const rulings = new Map((Array.isArray(readings.adversarial) ? readings.adversarial : [])
    .filter((row) => typeof row?.subject === 'string')
    .map((row) => [row.subject, row]));
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const attacks = Array.isArray(readings.attack) ? readings.attack : [];
  return obligations.map((entry) => {
    if (!entry.id.startsWith('READ:')) return entry;
    if (entry.id.startsWith('READ:UNCOVERED:')) {
      if (entry.class === OBLIGATION_CLASS.MECHANICAL) {
        return { ...entry, state: OBLIGATION_STATE.CLOSED, reason: null };
      }
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      const row = uncovered.get(entry.subject);
      if (row === undefined || (row.outcome !== 'performed' && row.outcome !== 'escaped')) {
        return { ...entry, state: OBLIGATION_STATE.OPEN, reason: 'MISSING_EVIDENCE' };
      }
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      const freshness = freshnessOf(row, artifactDigest);
      if (!freshness.ok) return { ...entry, state: OBLIGATION_STATE.OPEN, reason: freshness.reason };
      const generationCheck = generationFreshness(row, generation, generationStartedAt);
      return generationCheck.ok
        ? { ...entry, state: OBLIGATION_STATE.CLOSED, reason: null }
        : { ...entry, state: OBLIGATION_STATE.OPEN, reason: generationCheck.reason };
    }
    if (entry.id.startsWith('READ:INQUEST:')) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      const pair = entry.subject ?? '';
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      const separator = pair.lastIndexOf(':');
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      const key = separator === -1 ? pair : `${pair.slice(0, separator)}\u0000${pair.slice(separator + 1)}`;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      const row = inquest.get(key);
      if (row === undefined) return { ...entry, state: OBLIGATION_STATE.OPEN, reason: 'MISSING_EVIDENCE' };
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      const freshness = freshnessOf(row, artifactDigest);
      if (!freshness.ok) return { ...entry, state: OBLIGATION_STATE.OPEN, reason: freshness.reason };
      const generationCheck = generationFreshness(row, generation, generationStartedAt);
      if (!generationCheck.ok) return { ...entry, state: OBLIGATION_STATE.OPEN, reason: generationCheck.reason };
      if (row.inheritedFrom !== undefined && inheritedPolicy !== 'accept') {
        return { ...entry, state: OBLIGATION_STATE.OPEN, reason: 'INHERITED_READING' };
      }
      if (row.answer === 'Yes') {
        return validFindingResolution(row, artifactDigest)
          ? { ...entry, state: OBLIGATION_STATE.CLOSED, reason: 'FINDING_FIXED' }
          : { ...entry, state: OBLIGATION_STATE.OPEN, reason: 'FINDING_OPEN' };
      }
      if (row.answer === 'No') {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
        const citation = validateReadingCitation(row, linesByPath);
        if (!citation.ok) {
          return {
            ...entry,
            state: OBLIGATION_STATE.OPEN,
            reason: citation.code === 'READING_QUOTE_NOT_FOUND' ? 'READING_QUOTE_NOT_FOUND' : 'MISSING_BASIS',
          };
        }
        if (row.previous === 'Yes' && !validFindingResolution(row, artifactDigest)) {
          return { ...entry, state: OBLIGATION_STATE.OPEN, reason: 'MISSING_RESOLUTION' };
        }
        return { ...entry, state: OBLIGATION_STATE.CLOSED, reason: null };
      }
      return { ...entry, state: OBLIGATION_STATE.OPEN, reason: 'UNKNOWN_ANSWER' };
    }
    if (entry.id.startsWith('READ:ADVERSARIAL:')) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      const ruling = rulings.get(entry.subject);
      if (ruling === undefined || !['excluded', 'notASequence', 'suppliedRule'].includes(ruling.outcome)) {
        return { ...entry, state: OBLIGATION_STATE.OPEN, reason: 'MISSING_RULING' };
      }
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      const freshness = freshnessOf(ruling, artifactDigest);
      if (!freshness.ok) return { ...entry, state: OBLIGATION_STATE.OPEN, reason: freshness.reason };
      const generationCheck = generationFreshness(ruling, generation, generationStartedAt);
      if (!generationCheck.ok) return { ...entry, state: OBLIGATION_STATE.OPEN, reason: generationCheck.reason };
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      const obligationId = `READ:ADVERSARIAL:${entry.subject}`;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      const attack = attacks.find((row) => row?.obligationId === obligationId)
        ?? attacks.find((row) => row?.subject === entry.subject && row?.rulingId !== undefined);
      if (attack === undefined) return { ...entry, state: OBLIGATION_STATE.OPEN, reason: 'MISSING_ATTACK' };
      if (!validRulingAttack(attack)) return { ...entry, state: OBLIGATION_STATE.OPEN, reason: 'ATTACK_INVALID' };
      if (attack.outcome === 'held') return { ...entry, state: OBLIGATION_STATE.CLOSED, reason: null };
      return {
        ...entry,
        state: OBLIGATION_STATE.OPEN,
        reason: attack.outcome === 'broken' ? 'ATTACK_BROKEN' : 'ATTACK_UNRESOLVED',
      };
    }
    return entry;
  });
}

/** Resolve the mechanical and reading obligations that are decidable without a judgment. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function resolveMechanicalObligations(obligations = [], { findings = [], subChecks = [] } = {}) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const subCheckById = new Map((Array.isArray(subChecks) ? subChecks : []).map((entry) => [entry.id, entry]));
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const findingsByCheck = new Map();
  for (const finding of findings) {
    if (!findingsByCheck.has(finding.checkId)) findingsByCheck.set(finding.checkId, []);
    findingsByCheck.get(finding.checkId).push(finding);
  }
  return obligations.map((entry) => {
    if (entry.class !== OBLIGATION_CLASS.MECHANICAL) return entry;
    if (entry.kind === 'check') {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      const subCheck = subCheckById.get(entry.subject);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      const resolution = classifyMechanicalCheck({
        subCheck,
        findings: findingsByCheck.get(entry.subject) ?? [],
        required: entry.required,
      });
      return { ...entry, state: resolution.state, reason: resolution.code };
    }
    return entry;
  });
}
