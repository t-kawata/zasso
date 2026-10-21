// [::TICKET::] PX-289 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-289 --for-spec --no-implementation-order`.
/**
 * Mechanical predicates and the check-to-obligation resolution.
 *
 * These functions decide only facts the workspace already carries. A semantic claim is
 * never resolved here; it stays open until the judgment protocol records a held judgment.
 */
import { OBLIGATION_CLASS, OBLIGATION_STATE } from './registry.mjs';

export const ACTIVE_DISPOSITION = 'active';
export const REALIZED_OUTCOMES = new Set(['direct', 'viaNeighbour', 'singleStep']);

/** The operations a span reading performed. */
export function spanOperations(span = []) {
  const operations = new Set();
  for (const reading of Array.isArray(span) ? span : []) {
    for (const step of Array.isArray(reading?.steps) ? reading.steps : []) {
      if (typeof step?.operation === 'string') operations.add(step.operation);
    }
  }
  return operations;
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
  if (subCheck === undefined || subCheck === null) {
    return { state: OBLIGATION_STATE.OPEN, code: 'MISSING_CHECK' };
  }
  if (subCheck.status === 'blocked') {
    return { state: OBLIGATION_STATE.OPEN, code: 'BLOCKED_SURFACE', reason: subCheck.reason };
  }
  const evaluatedClaims = Number.isInteger(subCheck.evaluatedClaims) ? subCheck.evaluatedClaims : subCheck.denominator ?? 0;
  if (findings.length > 0) {
    return { state: OBLIGATION_STATE.OPEN, code: 'FINDING' };
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

/** Resolve the reading obligations that a record can settle without a judgment. */
// [::TICKET::] PX-289 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-289 --for-spec --no-implementation-order`.
export function resolveReadingsObligations(obligations = [], { readings = {} } = {}) {
  const uncovered = new Map((Array.isArray(readings.uncovered) ? readings.uncovered : [])
    .map((row) => [row?.subject, row]));
  const inquest = new Set((Array.isArray(readings.inquest) ? readings.inquest : [])
    .filter((row) => typeof row?.subject === 'string' && typeof row?.lens === 'string')
    .map((row) => `${row.subject}\u0000${row.lens}`));
  const adversarial = new Set((Array.isArray(readings.adversarial) ? readings.adversarial : []).map((row) => row?.subject));
  return obligations.map((entry) => {
    if (!entry.id.startsWith('READ:')) return entry;
    if (entry.id.startsWith('READ:UNCOVERED:')) {
      if (entry.class === OBLIGATION_CLASS.MECHANICAL) {
        return { ...entry, state: OBLIGATION_STATE.CLOSED, reason: null };
      }
      const row = uncovered.get(entry.subject);
      if (row !== undefined && (row.outcome === 'performed' || row.outcome === 'escaped')) {
        return { ...entry, state: OBLIGATION_STATE.CLOSED, reason: null };
      }
      return { ...entry, state: OBLIGATION_STATE.OPEN, reason: 'MISSING_EVIDENCE' };
    }
    if (entry.id.startsWith('READ:INQUEST:')) {
      const pair = entry.subject ?? '';
      const separator = pair.lastIndexOf(':');
      const key = separator === -1 ? pair : `${pair.slice(0, separator)}\u0000${pair.slice(separator + 1)}`;
      return inquest.has(key)
        ? { ...entry, state: OBLIGATION_STATE.CLOSED, reason: null }
        : { ...entry, state: OBLIGATION_STATE.OPEN, reason: 'MISSING_EVIDENCE' };
    }
    if (entry.id.startsWith('READ:ADVERSARIAL:')) {
      return adversarial.has(entry.subject)
        ? { ...entry, state: OBLIGATION_STATE.CLOSED, reason: null }
        : { ...entry, state: OBLIGATION_STATE.OPEN, reason: 'MISSING_EVIDENCE' };
    }
    return entry;
  });
}

/** Resolve the semantic obligations a held judgment or a held attack can close. */
// [::TICKET::] PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-290 --for-spec --no-implementation-order`.
export function resolveJudgmentObligations(obligations = [], { judgments = [], attacks = [] } = {}) {
  const heldJudgments = new Set(
    (Array.isArray(judgments) ? judgments : [])
      .filter((entry) => typeof entry?.obligationId === 'string' && Array.isArray(entry?.basis) && entry.basis.length > 0)
      .map((entry) => entry.obligationId),
  );
  const heldRiskPrefixes = new Set(
    [...heldJudgments]
      .filter((id) => id.startsWith('RISK:'))
      .flatMap((id) => [id, id.slice(0, id.lastIndexOf(':'))]),
  );
  const heldAttacks = new Set(
    (Array.isArray(attacks) ? attacks : [])
      .filter((entry) => entry?.outcome === 'held' && typeof entry?.subject === 'string')
      .map((entry) => entry.subject),
  );
  return obligations.map((entry) => {
    if (entry.id.startsWith('FALSIFY:') && heldAttacks.has(entry.subject)) {
      return { ...entry, state: OBLIGATION_STATE.CLOSED, reason: null };
    }
    if (entry.id.startsWith('RISK:')) {
      const prefix = entry.id.slice(0, entry.id.lastIndexOf(':'));
      if (heldJudgments.has(entry.id) || heldRiskPrefixes.has(prefix)) {
        return { ...entry, state: OBLIGATION_STATE.CLOSED, reason: null };
      }
    }
    if (entry.id.startsWith('DIST:FIDELITY:') && heldJudgments.has(entry.id)) {
      return { ...entry, state: OBLIGATION_STATE.CLOSED, reason: null };
    }
    if (entry.id.startsWith('JUDGE:') && heldJudgments.has(entry.id)) {
      return { ...entry, state: OBLIGATION_STATE.CLOSED, reason: null };
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
