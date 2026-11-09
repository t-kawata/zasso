'use strict';

/**
 * repair-plan.js — collapse and order a set of findings into one worklist.
 *
 * Gates run independently, so the same defect can be reported twice and the
 * emission order is arbitrary. The plan makes the worklist deterministic:
 * identity deduplicates, and the asset class decides which repair must happen
 * before which.
 */

const {
  GateFindingError,
  FINDING_ERROR_CODES,
  validateFinding,
  findingIdentity,
  findingsDigest,
} = require('./lib/gate-finding.js');

/** Repair order. A contract gap must be closed before the test that proves it. */
const REPAIR_ORDER = Object.freeze([
  'contract',
  'test',
  'annotation',
  'spec',
  'formula',
  'other',
]);

/** The asset class carried by a finding-code prefix. */
const ASSET_CLASS_PREFIXES = Object.freeze([
  ['CONTRACT', 'contract'],
  ['TEST', 'test'],
  ['ACCEPTANCE', 'test'],
  ['ANNOTATION', 'annotation'],
  ['SPEC', 'spec'],
  ['FORMULA', 'formula'],
]);

/**
 * Map a finding to its asset class through the code prefix.
 *
 * @param {object} finding
 * @returns {string} — contract | test | annotation | spec | formula | other
 */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function assetClassOf(finding) {
  const code = String(finding.code || '').toUpperCase();
  for (const [prefix, assetClass] of ASSET_CLASS_PREFIXES) {
    if (code.startsWith(prefix)) return assetClass;
  }
  return 'other';
}

/**
 * The repair position of an asset class.
 *
 * @param {string} assetClass
 * @returns {number}
 */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function repairRank(assetClass) {
  const index = REPAIR_ORDER.indexOf(assetClass);
  return index === -1 ? REPAIR_ORDER.length : index;
}

/**
 * Build the deterministic repair plan.
 *
 * @param {object[]} findings
 * @returns {{ count: number, findings: object[], byCode: object, digest: string }}
 * @throws {GateFindingError} when a gate emitted an incomplete finding
 */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function buildRepairPlan(findings) {
  const uniqueByIdentity = new Map();

  for (const finding of findings) {
    const verdict = validateFinding(finding);
    if (!verdict.ok) {
      throw new GateFindingError(
        'Repair plan received an incomplete finding: ' + verdict.problems.join('; '),
        FINDING_ERROR_CODES.GATE_FINDING_INCOMPLETE,
      );
    }
    uniqueByIdentity.set(findingIdentity(finding), finding);
  }

  const ordered = [...uniqueByIdentity.values()].sort((left, right) => {
    const byRank = repairRank(assetClassOf(left)) - repairRank(assetClassOf(right));
    if (byRank !== 0) return byRank;
    return findingIdentity(left).localeCompare(findingIdentity(right));
  });

  const byCode = {};
  for (const finding of ordered) {
    byCode[finding.code] = (byCode[finding.code] || 0) + 1;
  }

  return {
    count: ordered.length,
    findings: Object.freeze(ordered),
    byCode: Object.freeze(byCode),
    digest: findingsDigest(ordered),
  };
}

module.exports = {
  REPAIR_ORDER,
  assetClassOf,
  repairRank,
  buildRepairPlan,
};
