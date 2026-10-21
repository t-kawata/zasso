// [::TICKET::] PX-289 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-289 --for-spec --no-implementation-order`.
/**
 * The completion certificate. Pass is a property of this object, not a separate verdict
 * string: a run is complete only when every required obligation is closed and no check is
 * vacuous, no judgment is broken or unresolved, and no receipt is stale.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { contextDigest } from './evidence.mjs';
import { OBLIGATION_CLASS, OBLIGATION_STATE } from './registry.mjs';

export const CERTIFICATE_FILE_NAME = 'COMPLETION-CERTIFICATE.json';
export const CERTIFICATE_SCHEMA_VERSION = 1;

/** The residue every certificate states rather than hides. */
const DEFAULT_RESIDUE = Object.freeze([
  { claim: 'semantic prose equivalence', falsifier: 'Name a prose clause the typed fact set does not carry.' },
  { claim: 'enumeration completeness relative to the world', falsifier: 'Name an operation the specification states and the census does not carry.' },
]);

/** One open obligation in the certificate. */
// [::TICKET::] PX-289, PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-289|PX-290) --for-spec --no-implementation-order`.
function openEntry(entry) {
  return { id: entry.id, code: entry.reason ?? 'OPEN_OBLIGATION', subject: entry.subject ?? null };
}

/**
 * Build the certificate from the resolved obligations, checks and readings.
 *
 * @param {{ obligations?: Array<object>, checks?: Array<object>, readings?: object,
 *   judgments?: Array<object>, inputs?: object }} input
 * @returns {object}
 */
export function buildCertificate({ obligations = [], checks = [], readings = null, judgments = [], inputs = {} } = {}) {
  const open = [];
  const stuck = [];
  let closedMechanical = 0;
  let closedSemantic = 0;
  let claims = 0;

  for (const entry of obligations) {
    if (entry.state === OBLIGATION_STATE.OPEN) open.push(openEntry(entry));
    if (entry.state === OBLIGATION_STATE.STUCK) stuck.push(openEntry(entry));
    if (entry.state === OBLIGATION_STATE.CLOSED) {
      if (entry.class === OBLIGATION_CLASS.MECHANICAL) closedMechanical += 1;
      if (entry.class === OBLIGATION_CLASS.SEMANTIC) closedSemantic += 1;
    }
  }

  const vacuous = (Array.isArray(checks) ? checks : [])
    .filter((check) => check.status === 'vacuous')
    .map((check) => ({ id: check.id, reason: check.reason ?? 'VACUOUS' }));
  const held = (Array.isArray(judgments) ? judgments : []).filter((entry) => entry.state === 'held').length;
  const broken = (Array.isArray(judgments) ? judgments : []).filter((entry) => entry.state === 'broken').length;
  const unresolved = (Array.isArray(judgments) ? judgments : []).filter((entry) => entry.state === 'stuck').length;
  for (const entry of Array.isArray(checks) ? checks : []) {
    claims += Number.isInteger(entry.evaluatedClaims) ? entry.evaluatedClaims : 0;
  }
  if (readings?.open) {
    for (const entry of readings.open) {
      if (!open.some((existing) => existing.id === entry.id)) open.push(openEntry(entry));
    }
  }

  const complete = open.length === 0 && stuck.length === 0 && vacuous.length === 0 && broken === 0 && unresolved === 0;
  return {
    schemaVersion: CERTIFICATE_SCHEMA_VERSION,
    status: complete ? 'complete' : 'incomplete',
    inputs,
    obligations: {
      total: obligations.length,
      closed: closedMechanical + closedSemantic,
      open: open.length,
      stuck: stuck.length,
      notApplicable: obligations.filter((entry) => entry.state === OBLIGATION_STATE.NOT_APPLICABLE).length,
    },
    proven: { mechanical: closedMechanical, claims },
    judged: { total: Array.isArray(judgments) ? judgments.length : 0, held, broken, unresolved },
    accepted: { riskDispositions: (Array.isArray(judgments) ? judgments : []).filter((entry) => entry.verdict === 'accepted').length },
    residue: [...DEFAULT_RESIDUE],
    closed: obligations.filter((entry) => entry.state === OBLIGATION_STATE.CLOSED).map((entry) => entry.id).sort(),
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
