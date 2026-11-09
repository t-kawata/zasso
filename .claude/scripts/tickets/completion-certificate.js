'use strict';

/**
 * completion-certificate.js — record the proof a finished repair loop produced.
 *
 * A certificate is not a promise that the work is correct; it is the evidence
 * that the gates were run, that every gate produced a digest, and that the last
 * two runs found nothing. Missing evidence means no certificate.
 */

const {
  findingsDigest,
} = require('./lib/gate-finding.js');
const { writeTemporaryThenRename } = require('./lib/atomic-write.js');

const CERTIFICATE_INCOMPLETE = 'CERTIFICATE_INCOMPLETE';
const REQUIRED_STABLE_RUNS = 2;

/** A certificate that cannot prove its claim. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
class CertificateError extends Error {
  /**
   * @param {string} message — which proof is missing
   */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
  constructor(message) {
    super(message);
    this.name = 'CertificateError';
    this.code = CERTIFICATE_INCOMPLETE;
  }
}

/**
 * Build a completion certificate.
 *
 * @param {object} input
 * @param {string} [input.ticketKey] — the ticket the certificate belongs to
 * @param {{ name: string, digest: string }[]} input.gates — one digest per gate
 * @param {number} input.runCount — how many gate cycles ran
 * @param {object[]} input.finalFindings — must be empty
 * @param {string} [input.finalDigest] — digest of the final finding set
 * @returns {object} — frozen certificate
 * @throws {CertificateError} when the proof is incomplete
 */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function buildCertificate({ ticketKey, gates, runCount, finalFindings, finalDigest }) {
  const problems = [];

  if (ticketKey !== undefined && (typeof ticketKey !== 'string' || ticketKey.trim() === '')) {
    problems.push('ticketKey must be a non-empty string when provided');
  }
  if (!Array.isArray(gates) || gates.length === 0) {
    problems.push('at least one gate digest is required');
  } else {
    gates.forEach((gate, index) => {
      if (!gate || typeof gate !== 'object' || Array.isArray(gate)) {
        problems.push('gates[' + index + '] must be an object');
        return;
      }
      if (typeof gate.name !== 'string' || gate.name.trim() === '') {
        problems.push('gates[' + index + '].name is required');
      }
      if (typeof gate.digest !== 'string' || gate.digest.trim() === '') {
        problems.push('gates[' + index + '].digest is required');
      }
    });
  }
  if (!Number.isInteger(runCount) || runCount < REQUIRED_STABLE_RUNS) {
    problems.push('runCount must be at least ' + REQUIRED_STABLE_RUNS);
  }
  if (!Array.isArray(finalFindings) || finalFindings.length > 0) {
    problems.push('finalFindings must be empty — the zero-finding proof is missing');
  }

  if (problems.length > 0) {
    throw new CertificateError('Cannot build a completion certificate: ' + problems.join('; '));
  }

  return Object.freeze({
    ticketKey: ticketKey === undefined ? null : ticketKey.trim(),
    gates: Object.freeze(gates.map((gate) => Object.freeze({
      name: gate.name.trim(),
      digest: gate.digest.trim(),
    }))),
    runCount,
    finalDigest: typeof finalDigest === 'string' ? finalDigest : findingsDigest([]),
    proof: Object.freeze({
      zeroFindings: true,
      stableRuns: REQUIRED_STABLE_RUNS,
      findingCount: 0,
    }),
  });
}

/**
 * Write a certificate atomically.
 *
 * @param {string} targetPath
 * @param {object} certificate
 */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function writeCertificate(targetPath, certificate) {
  writeTemporaryThenRename(targetPath, JSON.stringify(certificate, null, 2) + '\n');
}

module.exports = {
  CERTIFICATE_INCOMPLETE,
  CertificateError,
  buildCertificate,
  writeCertificate,
};
