// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-289, PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-289|PX-291) --for-spec --no-implementation-order`.
/**
 * The completion certificate. Pass is a property of this object, not a separate verdict
 * string: a run is complete only when every required obligation has a held decision, no
 * check is vacuous, no judgment is broken or unresolved, and no assurance counter is
 * non-zero.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { contextDigest } from './evidence.mjs';

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export const CERTIFICATE_FILE_NAME = 'COMPLETION-CERTIFICATE.json';
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export const CERTIFICATE_SCHEMA_VERSION = 3;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export const ASSURANCE_SCHEMA_VERSION = 1;

/** The counters the effort gate requires. A missing one is not a clean one. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export const V3_ASSURANCE_KEYS = Object.freeze([
  'basisResolvedRatio',
  'quoteGroundedRatio',
  'templateAttackRatio',
  'inheritedRatio',
  'escapeActConflictCount',
  'staleReceiptCount',
  'effortCoverage',
  'blindAttackRatio',
  'staleReaderGenerationCount',
  'generationMismatchCount',
  'rereadCount',
]);

/**
 * The counters a caller may supply but never owes.
 *
 * A null value means the evidence was not measured; it is neither clean nor
 * dirty. A numeric value is gated exactly like a required counter.
 */
export const OPTIONAL_ASSURANCE_KEYS = Object.freeze([
  'discriminatingRatio',
  'rejudgeAgreement',
]);

/** The keys that identify a v3 assurance object, including the optional counters. */
const V3_RECOGNITION_KEYS = Object.freeze([...V3_ASSURANCE_KEYS, ...OPTIONAL_ASSURANCE_KEYS]);

/** The residue every certificate states rather than hides. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
const DEFAULT_RESIDUE = Object.freeze([
  { claim: 'semantic prose equivalence', falsifier: 'Name a prose clause the typed fact set does not carry.' },
  { claim: 'enumeration completeness relative to the world', falsifier: 'Name an operation the specification states and the census does not carry.' },
]);

/** The id prefix a receipt entry carries so a consumer can tell it from an obligation. */
// [::TICKET::] PX-311 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-311 --for-spec --no-implementation-order`.
const RECEIPT_ID_PREFIX = 'RECEIPT:';

/** The receipt codes the certificate reports apart. */
// [::TICKET::] PX-311 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-311 --for-spec --no-implementation-order`.
const RECEIPT_CODES = Object.freeze({
  stale: Object.freeze(['STALE_RECEIPT', 'STALE_WRITE_RECEIPT']),
  missingWrite: 'MISSING_WRITE_RECEIPT',
});

/** Whether the caller supplied the v3 assurance shape. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function isV3Assurance(assurance) {
  if (assurance === null || typeof assurance !== 'object' || Array.isArray(assurance)) return false;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const keys = Object.keys(assurance);
  if (keys.length === 0) return true;
  return keys.some((key) => V3_RECOGNITION_KEYS.includes(key));
}

/** The assurance shape used when the caller supplies none. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-297, PX-302 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-297|PX-302) --for-spec --no-implementation-order`.
function normalizeAssurance(assurance) {
  if (isV3Assurance(assurance)) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const result = {
      anchoredRatio: assurance?.anchoredRatio ?? 1,
      genericBasis: assurance?.genericBasis ?? 0,
      reusedBasis: assurance?.reusedBasis ?? 0,
      staleRecords: assurance?.staleRecords ?? 0,
      provisionalRecords: assurance?.provisionalRecords ?? 0,
      unattackedTier1: assurance?.unattackedTier1 ?? 0,
      independentAttacks: assurance?.independentAttacks ?? 0,
    };
    for (const key of V3_ASSURANCE_KEYS) {
      if (assurance?.[key] !== undefined) result[key] = assurance[key];
    }
    const notMeasured = [];
    for (const key of OPTIONAL_ASSURANCE_KEYS) {
      const value = assurance?.[key];
      if (value === undefined || value === null) {
        result[key] = null;
        notMeasured.push(key);
      } else {
        result[key] = value;
      }
    }
    result.notMeasured = notMeasured;
    return result;
  }
  return {
    anchoredRatio: assurance?.anchoredRatio ?? 1,
    genericBasis: assurance?.genericBasis ?? 0,
    reusedBasis: assurance?.reusedBasis ?? 0,
    staleRecords: assurance?.staleRecords ?? 0,
    provisionalRecords: assurance?.provisionalRecords ?? 0,
    unattackedTier1: assurance?.unattackedTier1 ?? 0,
    independentAttacks: assurance?.independentAttacks ?? 0,
    notMeasured: [],
  };
}

/** The v3 counters the caller omitted. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function missingAssuranceCounters(assurance) {
  return V3_ASSURANCE_KEYS.filter((key) => assurance?.[key] === undefined);
}

/** Whether every assurance counter is clean. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-297, PX-302 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-297|PX-302) --for-spec --no-implementation-order`.
function assuranceIsClean(assurance, v3 = false) {
  if (v3) {
    return missingAssuranceCounters(assurance).length === 0
      && assurance.basisResolvedRatio === 1
      && assurance.quoteGroundedRatio === 1
      && assurance.templateAttackRatio === 0
      && assurance.inheritedRatio === 0
      && assurance.escapeActConflictCount === 0
      && assurance.staleReceiptCount === 0
      && assurance.effortCoverage === 1
      && assurance.blindAttackRatio === 1
      && (assurance.discriminatingRatio === null || assurance.discriminatingRatio === 1)
      && (assurance.rejudgeAgreement === null || assurance.rejudgeAgreement === 1)
      && assurance.staleReaderGenerationCount === 0
      && assurance.generationMismatchCount === 0;
  }
  return assurance.anchoredRatio >= 1
    && assurance.genericBasis === 0
    && assurance.reusedBasis === 0
    && assurance.staleRecords === 0
    && assurance.provisionalRecords === 0
    && assurance.unattackedTier1 === 0;
}

/** Detect a workspace whose history contains v3 but whose artifact is v2. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function detectSchemaDowngrade({ status = {}, artifact = {}, baseline = {} } = {}) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const history = Array.isArray(status?.schemaHistory) ? status.schemaHistory : [];
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const baselineHistory = Array.isArray(baseline?.provenance?.schemaHistory)
    ? baseline.provenance.schemaHistory
    : [];
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const sawV3 = history.includes(3) || baselineHistory.includes(3);
  if (sawV3 && artifact?.schema_version === 2) {
    return { code: 'UNPROVEN_DOWNGRADE', problem: 'a v3 history now records a v2 artifact' };
  }
  return { code: null, problem: null };
}

/** One open obligation in the certificate. */
// [::TICKET::] PX-289, PX-291, PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-289|PX-291|PX-292|PX-293) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function openEntry(entry, code) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const reason = code ?? entry.reason ?? 'OPEN_OBLIGATION';
  return { id: entry.id, code: reason, reason, subject: entry.subject ?? null };
}

/**
 * Build the certificate from the decisions over the resolved obligations.
 *
 * @param {{ obligations?: Array<object>, decisions?: Array<object>,
 *   checks?: Array<object>, readings?: object, inputs?: object,
 *   assurance?: object, closureGates?: Array<{script: string, exitCode: number, reason: string}> }} input
 * @returns {object}
 */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function buildCertificate(options = {}) {
  const {
    obligations = [],
    decisions = [],
    checks = [],
    readings = null,
    inputs = {},
    assurance = null,
    receiptDebt = [],
    closureGates = [],
  } = options;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const byId = new Map();
  for (const decision of Array.isArray(decisions) ? decisions : []) {
    if (typeof decision?.obligationId === 'string') byId.set(decision.obligationId, decision);
  }

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const open = [];
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const stuck = [];
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  let closedMechanical = 0;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  let closedSemantic = 0;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  let notApplicable = 0;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  let claims = 0;

  for (const entry of obligations) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const decision = byId.get(entry.id);
    if (decision === undefined) {
      open.push(openEntry({ ...entry, reason: 'NO_DECISION' }));
      continue;
    }
    if (decision.state === 'held' || decision.state === 'proven' || decision.state === 'not_applicable') {
      if (entry.class === 'mechanical') closedMechanical += 1;
      if (entry.class === 'semantic') closedSemantic += 1;
      if (decision.state === 'not_applicable') notApplicable += 1;
      continue;
    }
    if (decision.state === 'stuck') {
      stuck.push(openEntry({ ...entry, reason: decision.reason ?? 'STUCK' }));
      continue;
    }
    open.push(openEntry({ ...entry, reason: decision.reason ?? 'OPEN' }));
  }

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const vacuous = (Array.isArray(checks) ? checks : [])
    .filter((check) => check.status === 'vacuous')
    .map((check) => ({ id: check.id, code: check.reason ?? 'VACUOUS', reason: check.reason ?? 'VACUOUS', subject: null }));
  for (const check of Array.isArray(checks) ? checks : []) {
    claims += Number.isInteger(check.evaluatedClaims) ? check.evaluatedClaims : 0;
  }
  if (readings?.open) {
    for (const entry of readings.open) {
      if (!open.some((existing) => existing.id === entry.id)) open.push(openEntry(entry, entry.code));
    }
  }
  // Receipt debt blocks completion but is not an obligation. Keeping the entries in a
  // side list is what lets the summary count obligations and receipts apart without
  // changing the open[] shape a reader already consumes.
  const receiptEntries = [];
  for (const debt of Array.isArray(receiptDebt) ? receiptDebt : []) {
    const entry = {
      id: `${RECEIPT_ID_PREFIX}${debt?.path ?? debt?.phase ?? 'unknown'}`,
      code: debt?.code ?? 'STALE_RECEIPT',
      reason: debt?.code ?? 'STALE_RECEIPT',
      subject: Array.isArray(debt?.mismatches) ? debt.mismatches.join(', ') : null,
    };
    open.push(entry);
    receiptEntries.push(entry);
  }
  // A design-authoring gate that failed leaves the obligation list unproven, so the
  // certificate cannot call the workspace complete even when every evidence row holds.
  // The entry names the gate and the refusal it wrote, so the repair is not a guess.
  for (const gate of Array.isArray(closureGates) ? closureGates : []) {
    if (gate?.exitCode === 0) continue;
    open.push({
      id: `CLOSURE:${gate?.script ?? 'unknown'}`,
      code: 'GRILL_GATE_FAILED',
      reason: 'GRILL_GATE_FAILED',
      subject: gate?.reason ?? null,
    });
  }

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const judgedDecisions = (Array.isArray(decisions) ? decisions : []).filter((entry) => entry.source === 'judgment');
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const readingDecisions = (Array.isArray(decisions) ? decisions : []).filter((entry) => entry.source === 'reading');
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const held = judgedDecisions.filter((entry) => entry.state === 'held').length;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const broken = judgedDecisions.filter((entry) => entry.state === 'broken').length;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const unresolved = judgedDecisions.filter((entry) => entry.state === 'stuck').length;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const v3Assurance = isV3Assurance(assurance);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const cleanAssurance = normalizeAssurance(assurance);
  if (v3Assurance) {
    for (const key of missingAssuranceCounters(cleanAssurance)) {
      open.push({
        id: `ASSURANCE:${key}`,
        code: 'ASSURANCE_UNFALSIFIABLE',
        reason: 'ASSURANCE_UNFALSIFIABLE',
        subject: key,
      });
    }
  }

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  // An obligation is open when its decision does not close it. Counting the obligations
  // directly, rather than the open[] length, keeps total = closed + open + stuck even when
  // receipt, closure-gate or reading entries share the array.
  const openObligations = obligations.filter((entry) => {
    const decision = byId.get(entry.id);
    if (decision === undefined) return true;
    return !['held', 'proven', 'not_applicable', 'stuck'].includes(decision.state);
  }).length;
  const receiptSummary = {
    open: receiptEntries.length,
    stale: receiptEntries.filter((entry) => RECEIPT_CODES.stale.includes(entry.code)).length,
    missingWrite: receiptEntries.filter((entry) => entry.code === RECEIPT_CODES.missingWrite).length,
  };

  const complete = open.length === 0
    && stuck.length === 0
    && vacuous.length === 0
    && broken === 0
    && unresolved === 0
    && assuranceIsClean(cleanAssurance, v3Assurance);
  return {
    schemaVersion: CERTIFICATE_SCHEMA_VERSION,
    assuranceSchemaVersion: v3Assurance ? ASSURANCE_SCHEMA_VERSION : 0,
    status: complete ? 'complete' : 'incomplete',
    inputs,
    obligations: {
      total: obligations.length,
      closed: closedMechanical + closedSemantic,
      open: openObligations,
      stuck: stuck.length,
      notApplicable,
    },
    receipts: receiptSummary,
    proven: { mechanical: closedMechanical, claims },
    judged: {
      total: judgedDecisions.length,
      held,
      broken,
      unresolved,
      stuck: unresolved,
    },
    readings: { held: readingDecisions.filter((entry) => entry.state === 'held').length },
    assurance: cleanAssurance,
    accepted: {
      riskDispositions: judgedDecisions.filter((entry) => entry.verdict === 'accepted').length,
      exemptions: Number.isInteger(inputs?.exemptions) ? inputs.exemptions : 0,
    },
    residue: [...DEFAULT_RESIDUE],
    closed: obligations
      .filter((entry) => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
        const decision = byId.get(entry.id);
        return decision !== undefined && ['held', 'proven', 'not_applicable'].includes(decision.state);
      })
      .map((entry) => entry.id)
      .sort(),
    open: [...open, ...stuck, ...vacuous],
  };
}

/** The certificate's status, or incomplete when it is absent. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function certificateStatus(certificate) {
  return certificate?.status === 'complete' ? 'complete' : 'incomplete';
}

/** The digest that binds a generation to its certificate. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function certificateDigest(certificate) {
  return contextDigest(certificate ?? { status: 'incomplete' });
}

/** Write the certificate under the run directory and return its path. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function writeCertificate(root, certificate) {
  if (!existsSync(root)) return null;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const directory = join(root, 'smooth-sequences');
  mkdirSync(directory, { recursive: true });
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const path = join(directory, CERTIFICATE_FILE_NAME);
  writeFileSync(path, `${JSON.stringify(certificate, null, 2)}\n`);
  return path;
}
