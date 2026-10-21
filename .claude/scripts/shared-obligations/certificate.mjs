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

export const CERTIFICATE_FILE_NAME = 'COMPLETION-CERTIFICATE.json';
export const CERTIFICATE_SCHEMA_VERSION = 2;

/** The residue every certificate states rather than hides. */
const DEFAULT_RESIDUE = Object.freeze([
  { claim: 'semantic prose equivalence', falsifier: 'Name a prose clause the typed fact set does not carry.' },
  { claim: 'enumeration completeness relative to the world', falsifier: 'Name an operation the specification states and the census does not carry.' },
]);

/** The assurance shape used when the caller supplies none. */
// [::TICKET::] PX-291, PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-291|PX-292|PX-293) --for-spec --no-implementation-order`.
function normalizeAssurance(assurance) {
  return {
    anchoredRatio: assurance?.anchoredRatio ?? 1,
    genericBasis: assurance?.genericBasis ?? 0,
    reusedBasis: assurance?.reusedBasis ?? 0,
    staleRecords: assurance?.staleRecords ?? 0,
    provisionalRecords: assurance?.provisionalRecords ?? 0,
    unattackedTier1: assurance?.unattackedTier1 ?? 0,
    independentAttacks: assurance?.independentAttacks ?? 0,
  };
}

/** Whether every assurance counter is clean. */
// [::TICKET::] PX-291, PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-291|PX-292|PX-293) --for-spec --no-implementation-order`.
function assuranceIsClean(assurance) {
  return assurance.anchoredRatio >= 1
    && assurance.genericBasis === 0
    && assurance.reusedBasis === 0
    && assurance.staleRecords === 0
    && assurance.provisionalRecords === 0
    && assurance.unattackedTier1 === 0;
}

/** One open obligation in the certificate. */
// [::TICKET::] PX-289, PX-291, PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-289|PX-291|PX-292|PX-293) --for-spec --no-implementation-order`.
function openEntry(entry, code) {
  const reason = code ?? entry.reason ?? 'OPEN_OBLIGATION';
  return { id: entry.id, code: reason, reason, subject: entry.subject ?? null };
}

/**
 * Build the certificate from the decisions over the resolved obligations.
 *
 * @param {{ obligations?: Array<object>, decisions?: Array<object>,
 *   checks?: Array<object>, readings?: object, inputs?: object,
 *   assurance?: object }} input
 * @returns {object}
 */
export function buildCertificate(options = {}) {
  const {
    obligations = [],
    decisions = [],
    checks = [],
    readings = null,
    inputs = {},
    assurance = null,
  } = options;
  const byId = new Map();
  for (const decision of Array.isArray(decisions) ? decisions : []) {
    if (typeof decision?.obligationId === 'string') byId.set(decision.obligationId, decision);
  }

  const open = [];
  const stuck = [];
  let closedMechanical = 0;
  let closedSemantic = 0;
  let notApplicable = 0;
  let claims = 0;

  for (const entry of obligations) {
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

  const judgedDecisions = (Array.isArray(decisions) ? decisions : []).filter((entry) => entry.source === 'judgment');
  const readingDecisions = (Array.isArray(decisions) ? decisions : []).filter((entry) => entry.source === 'reading');
  const held = judgedDecisions.filter((entry) => entry.state === 'held').length;
  const broken = judgedDecisions.filter((entry) => entry.state === 'broken').length;
  const unresolved = judgedDecisions.filter((entry) => entry.state === 'stuck').length;
  const cleanAssurance = normalizeAssurance(assurance);

  const complete = open.length === 0
    && stuck.length === 0
    && vacuous.length === 0
    && broken === 0
    && unresolved === 0
    && assuranceIsClean(cleanAssurance);
  return {
    schemaVersion: CERTIFICATE_SCHEMA_VERSION,
    status: complete ? 'complete' : 'incomplete',
    inputs,
    obligations: {
      total: obligations.length,
      closed: closedMechanical + closedSemantic,
      open: open.length,
      stuck: stuck.length,
      notApplicable,
    },
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
        const decision = byId.get(entry.id);
        return decision !== undefined && ['held', 'proven', 'not_applicable'].includes(decision.state);
      })
      .map((entry) => entry.id)
      .sort(),
    open: [...open, ...stuck, ...vacuous],
  };
}

/** The certificate's status, or incomplete when it is absent. */
export function certificateStatus(certificate) {
  return certificate?.status === 'complete' ? 'complete' : 'incomplete';
}

/** The digest that binds a generation to its certificate. */
export function certificateDigest(certificate) {
  return contextDigest(certificate ?? { status: 'incomplete' });
}

/** Write the certificate under the run directory and return its path. */
export function writeCertificate(root, certificate) {
  if (!existsSync(root)) return null;
  const directory = join(root, 'smooth-sequences');
  mkdirSync(directory, { recursive: true });
  const path = join(directory, CERTIFICATE_FILE_NAME);
  writeFileSync(path, `${JSON.stringify(certificate, null, 2)}\n`);
  return path;
}
