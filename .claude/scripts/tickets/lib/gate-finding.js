'use strict';

/**
 * gate-finding.js — the shared shape every gate finding must satisfy.
 *
 * A finding exists to keep the pipeline moving: it names the broken asset, the
 * problem, an executable repair and the rerun that proves the repair. A gate
 * that cannot name a repair has a defect of its own, so an incomplete finding
 * is rejected here rather than handed to a caller that would have to stop.
 */

const crypto = require('node:crypto');

const GATE_FINDING_INCOMPLETE = 'GATE_FINDING_INCOMPLETE';
const DEBT_INCREASED = 'DEBT_INCREASED';
const REPAIR_TOOL_INVALID_INPUT = 'REPAIR_TOOL_INVALID_INPUT';
const REPAIR_TARGET_MISSING = 'REPAIR_TARGET_MISSING';
const CERTIFICATE_INCOMPLETE = 'CERTIFICATE_INCOMPLETE';

/** The named failure codes the repair pipeline understands. */
const FINDING_ERROR_CODES = Object.freeze({
  GATE_FINDING_INCOMPLETE,
  DEBT_INCREASED,
  REPAIR_TOOL_INVALID_INPUT,
  REPAIR_TARGET_MISSING,
  CERTIFICATE_INCOMPLETE,
});

/** A validation failure that names the incomplete finding. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
class GateFindingError extends Error {
  /**
   * @param {string} message — which part of the finding is missing
   * @param {string} [code] — named failure code
   */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
  constructor(message, code = GATE_FINDING_INCOMPLETE) {
    super(message);
    this.name = 'GateFindingError';
    this.code = code;
  }
}

/** Whether a value is a non-empty string. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validate a finding.
 *
 * @param {object} finding
 * @returns {{ ok: boolean, problems: string[] }}
 */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function validateFinding(finding) {
  if (!finding || typeof finding !== 'object' || Array.isArray(finding)) {
    return { ok: false, problems: ['finding must be an object'] };
  }

  const problems = [];
  if (!isNonEmptyString(finding.code)) problems.push('code must be a non-empty string');
  if (!isNonEmptyString(finding.asset)) problems.push('asset must be a non-empty string');
  if (!isNonEmptyString(finding.problem)) problems.push('problem must be a non-empty string');

  if (!Array.isArray(finding.fixes) || finding.fixes.length === 0) {
    problems.push('fixes must be a non-empty array of executable fixes');
  } else {
    finding.fixes.forEach((fix, index) => {
      if (!fix || typeof fix !== 'object' || Array.isArray(fix)) {
        problems.push('fixes[' + index + '] must be an object');
        return;
      }
      if (!isNonEmptyString(fix.tool)) problems.push('fixes[' + index + '].tool must be a non-empty string');
      if (!fix.input || typeof fix.input !== 'object' || Array.isArray(fix.input)) {
        problems.push('fixes[' + index + '].input must be an object');
      }
    });
  }

  if (!isNonEmptyString(finding.rerun)) problems.push('rerun must be a non-empty command');

  return { ok: problems.length === 0, problems };
}

/**
 * Build a frozen finding, or reject an incomplete one.
 *
 * @param {object} input
 * @returns {object} — frozen finding
 * @throws {GateFindingError} when a fix or rerun is missing
 */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function createFinding(input) {
  const verdict = validateFinding(input);
  if (!verdict.ok) {
    throw new GateFindingError(
      'Incomplete gate finding: ' + verdict.problems.join('; '),
      GATE_FINDING_INCOMPLETE,
    );
  }

  const fixes = input.fixes.map((fix) => Object.freeze({
    tool: fix.tool.trim(),
    input: Object.freeze({ ...fix.input }),
  }));

  return Object.freeze({
    code: input.code.trim(),
    asset: input.asset.trim(),
    problem: input.problem.trim(),
    fixes: Object.freeze(fixes),
    rerun: input.rerun.trim(),
  });
}

/** The identity that deduplicates findings across gates and runs. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function findingIdentity(finding) {
  return finding.code + '|' + finding.asset + '|' + finding.problem;
}

/** A deterministic JSON string with sorted object keys. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function stableStringify(value) {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map((key) => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

/**
 * A digest over the finding identities, independent of emission order.
 *
 * The empty set has a fixed digest, which is what lets the loop prove "two
 * consecutive zero-finding runs with the same digest".
 *
 * @param {object[]} findings
 * @returns {string} — lowercase hex SHA-256
 */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function findingsDigest(findings) {
  const identities = (findings || []).map(findingIdentity).sort();
  return crypto.createHash('sha256').update(identities.join('\n')).digest('hex');
}

module.exports = {
  FINDING_ERROR_CODES,
  GateFindingError,
  createFinding,
  validateFinding,
  findingIdentity,
  findingsDigest,
  stableStringify,
};
