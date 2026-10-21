// [::TICKET::] PX-289 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-289 --for-spec --no-implementation-order`.
/**
 * Mechanical predicates and the check-to-obligation resolution.
 *
 * These functions decide only facts the workspace already carries. A semantic claim is
 * never resolved here; it stays open until the judgment protocol records a held judgment.
 */
import { ACTIVE_DISPOSITION, OBLIGATION_CLASS, OBLIGATION_STATE, REALIZED_OUTCOMES } from './registry.mjs';
import { performedOperations } from './span.mjs';

/** The operations a span reading performed; the shared definition lives in span.mjs. */
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
export function checkUncoveredMechanical(worklist = [], span = []) {
  const performed = spanOperations(span);
  const mechanical = worklist.filter((operationId) => performed.has(operationId));
  const required = worklist.filter((operationId) => !performed.has(operationId));
  return { mechanical, required };
}

/** The census bijection for one aspect. */
export function checkCensusBijection(censusIds = [], artifactIds = []) {
  const census = new Set(censusIds);
  const artifact = new Set(artifactIds);
  return {
    ok: censusIds.every((id) => artifact.has(id)) && artifactIds.every((id) => census.has(id)),
    missing: censusIds.filter((id) => !artifact.has(id)),
    extra: artifactIds.filter((id) => !census.has(id)),
  };
}

/** Whether every declared entry has a span reading. */
export function checkSpanCoverage(entries = [], span = []) {
  const covered = new Set((Array.isArray(span) ? span : []).map((reading) => reading?.subject).filter(Boolean));
  const missing = entries.map((entry) => (typeof entry === 'string' ? entry : entry?.id)).filter((id) => !covered.has(id));
  return { ok: missing.length === 0, missing };
}

/** Whether every realized sequence and active operation has an owner and a ledger row. */
export function checkDistribution({ artifact = {}, packages = [] } = {}) {
  const operationOwners = new Set();
  const sequenceOwners = new Set();
  const ledgerUnits = new Set();
  for (const pkg of packages) {
    for (const unit of pkg?.view?.ownedOperationUnits ?? []) operationOwners.add(unit.operationId);
    for (const unit of pkg?.view?.ownedSequenceUnits ?? []) sequenceOwners.add(unit.sequenceId);
    for (const unit of pkg?.view?.crossBoundarySequenceUnits ?? []) sequenceOwners.add(unit.sequenceId);
    const rows = pkg?.ledgerRows ?? [];
    for (const row of rows) ledgerUnits.add(row.unit);
  }
  const missingOperations = (artifact.operations ?? [])
    .filter((operation) => operation?.disposition === ACTIVE_DISPOSITION)
    .map((operation) => operation.id)
    .filter((id) => !operationOwners.has(id) || !ledgerUnits.has(`op-${id}`));
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
export function classifyMechanicalCheck({ subCheck, findings = [], required = true } = {}) {
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
  if (subCheck === undefined || subCheck === null) {
    return { state: OBLIGATION_STATE.OPEN, code: 'MISSING_CHECK' };
  }
  if (subCheck.status === 'blocked') {
    return { state: OBLIGATION_STATE.OPEN, code: 'BLOCKED_SURFACE', reason: subCheck.reason };
  }
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
export function resolveCensusObligations(obligations = [], context = {}) {
  const { census = {}, artifact = {}, treeManifest = {}, allocateManifest = {}, packages = [] } = context;
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
    if (entry.kind !== 'census') return entry;
    const kind = entry.id.replace('CENSUS:BIJECTION:', '');
    const resolution = result.get(kind);
    if (resolution === undefined || !resolution.ok) {
      return { ...entry, state: OBLIGATION_STATE.OPEN, reason: 'CENSUS_MISMATCH' };
    }
    return { ...entry, state: OBLIGATION_STATE.CLOSED, reason: null };
  });
}

/** A non-empty string. */
// [::TICKET::] PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-292|PX-293) --for-spec --no-implementation-order`.
function text(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/** Whether a row cites a line and a quote. */
// [::TICKET::] PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-292|PX-293) --for-spec --no-implementation-order`.
function validCitation(record) {
  return Number.isInteger(record?.line) && record.line > 0 && text(record?.quote);
}

/** Whether a Yes carries a resolution performed against the current artifact. */
// [::TICKET::] PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-292|PX-293) --for-spec --no-implementation-order`.
function validFindingResolution(row, artifactDigest) {
  const resolution = row?.resolution;
  if (resolution === undefined || resolution === null) return false;
  if (!['spec-change', 'artifact-change'].includes(resolution.kind)) return false;
  if (artifactDigest !== null && resolution.artifactDigest !== artifactDigest) return false;
  return validCitation(resolution.evidence);
}

/** Whether one ruling attack has the shape the ruling question asks for. */
// [::TICKET::] PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-292|PX-293) --for-spec --no-implementation-order`.
function validRulingAttack(attack) {
  if (!['held', 'broken', 'unresolved'].includes(attack?.outcome)) return false;
  if (attack.outcome === 'held' && !text(attack?.searched?.source)) return false;
  if (attack.outcome === 'broken' && (attack.counterexample === undefined || attack.counterexample === null)) return false;
  if (attack.outcome === 'unresolved' && !text(attack.reason)) return false;
  return true;
}

/** The evidence freshness verdict for one row. */
// [::TICKET::] PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-292|PX-293) --for-spec --no-implementation-order`.
function freshnessOf(row, artifactDigest) {
  if (artifactDigest === null) return { ok: true, reason: null };
  if (row?.artifactDigest === undefined) return { ok: false, reason: 'LEGACY_RECORD' };
  if (row.artifactDigest !== artifactDigest) return { ok: false, reason: 'STALE_EVIDENCE' };
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
export function resolveReadingsObligations(obligations = [], { readings = {}, artifactDigest = null } = {}) {
  const uncovered = new Map((Array.isArray(readings.uncovered) ? readings.uncovered : [])
    .map((row) => [row?.subject, row]));
  const inquest = new Map((Array.isArray(readings.inquest) ? readings.inquest : [])
    .filter((row) => typeof row?.subject === 'string' && typeof row?.lens === 'string')
    .map((row) => [`${row.subject}\u0000${row.lens}`, row]));
  const rulings = new Map((Array.isArray(readings.adversarial) ? readings.adversarial : [])
    .filter((row) => typeof row?.subject === 'string')
    .map((row) => [row.subject, row]));
  const attacks = Array.isArray(readings.attack) ? readings.attack : [];
  return obligations.map((entry) => {
    if (!entry.id.startsWith('READ:')) return entry;
    if (entry.id.startsWith('READ:UNCOVERED:')) {
      if (entry.class === OBLIGATION_CLASS.MECHANICAL) {
        return { ...entry, state: OBLIGATION_STATE.CLOSED, reason: null };
      }
      const row = uncovered.get(entry.subject);
      if (row === undefined || (row.outcome !== 'performed' && row.outcome !== 'escaped')) {
        return { ...entry, state: OBLIGATION_STATE.OPEN, reason: 'MISSING_EVIDENCE' };
      }
      const freshness = freshnessOf(row, artifactDigest);
      return freshness.ok
        ? { ...entry, state: OBLIGATION_STATE.CLOSED, reason: null }
        : { ...entry, state: OBLIGATION_STATE.OPEN, reason: freshness.reason };
    }
    if (entry.id.startsWith('READ:INQUEST:')) {
      const pair = entry.subject ?? '';
      const separator = pair.lastIndexOf(':');
      const key = separator === -1 ? pair : `${pair.slice(0, separator)}\u0000${pair.slice(separator + 1)}`;
      const row = inquest.get(key);
      if (row === undefined) return { ...entry, state: OBLIGATION_STATE.OPEN, reason: 'MISSING_EVIDENCE' };
      const freshness = freshnessOf(row, artifactDigest);
      if (!freshness.ok) return { ...entry, state: OBLIGATION_STATE.OPEN, reason: freshness.reason };
      if (row.answer === 'Yes') {
        return validFindingResolution(row, artifactDigest)
          ? { ...entry, state: OBLIGATION_STATE.CLOSED, reason: 'FINDING_FIXED' }
          : { ...entry, state: OBLIGATION_STATE.OPEN, reason: 'FINDING_OPEN' };
      }
      if (row.answer === 'No') {
        if (!validCitation(row)) return { ...entry, state: OBLIGATION_STATE.OPEN, reason: 'MISSING_BASIS' };
        if (row.previous === 'Yes' && !validFindingResolution(row, artifactDigest)) {
          return { ...entry, state: OBLIGATION_STATE.OPEN, reason: 'MISSING_RESOLUTION' };
        }
        return { ...entry, state: OBLIGATION_STATE.CLOSED, reason: null };
      }
      return { ...entry, state: OBLIGATION_STATE.OPEN, reason: 'UNKNOWN_ANSWER' };
    }
    if (entry.id.startsWith('READ:ADVERSARIAL:')) {
      const ruling = rulings.get(entry.subject);
      if (ruling === undefined || !['excluded', 'notASequence', 'suppliedRule'].includes(ruling.outcome)) {
        return { ...entry, state: OBLIGATION_STATE.OPEN, reason: 'MISSING_RULING' };
      }
      const freshness = freshnessOf(ruling, artifactDigest);
      if (!freshness.ok) return { ...entry, state: OBLIGATION_STATE.OPEN, reason: freshness.reason };
      const obligationId = `READ:ADVERSARIAL:${entry.subject}`;
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
export function resolveMechanicalObligations(obligations = [], { findings = [], subChecks = [] } = {}) {
  const subCheckById = new Map((Array.isArray(subChecks) ? subChecks : []).map((entry) => [entry.id, entry]));
  const findingsByCheck = new Map();
  for (const finding of findings) {
    if (!findingsByCheck.has(finding.checkId)) findingsByCheck.set(finding.checkId, []);
    findingsByCheck.get(finding.checkId).push(finding);
  }
  return obligations.map((entry) => {
    if (entry.class !== OBLIGATION_CLASS.MECHANICAL) return entry;
    if (entry.kind === 'check') {
      const subCheck = subCheckById.get(entry.subject);
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
