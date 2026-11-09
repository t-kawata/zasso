'use strict';

/**
 * repair-loop.js — run gates, apply repairs, rerun until the findings stop.
 *
 * Completion needs two consecutive zero-finding runs with the same digest: one
 * zero run can be the moment before a repair reveals the next defect. A tool
 * that refuses a fix is recorded, not thrown — the pipeline must not stop.
 */

const { findingsDigest, stableStringify } = require('./lib/gate-finding.js');
const { buildRepairPlan } = require('./repair-plan.js');
const { detectDebt, debtFinding } = require('./gate-debt.js');
const { buildCertificate } = require('./completion-certificate.js');

const DEFAULT_MAX_RUNS = 8;
const REQUIRED_STABLE_RUNS = 2;

/** The durable key of a fix, used to apply each repair once per run. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function fixKey(fix) {
  return fix.tool + '|' + stableStringify(fix.input);
}

/**
 * Run one gate cycle and normalize its output.
 *
 * @param {Function} runGates — returns { findings, gates }
 * @returns {{ findings: object[], gates: object[] }}
 */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function runGateCycle(runGates) {
  const cycle = runGates();
  if (!cycle || !Array.isArray(cycle.findings)) {
    throw new Error('runGates must return { findings, gates }');
  }

  const gates = Array.isArray(cycle.gates) && cycle.gates.length > 0
    ? cycle.gates
    : [{ name: 'all-gates', digest: findingsDigest(cycle.findings) }];

  return { findings: cycle.findings, gates };
}

/**
 * Apply each distinct fix once and record every refusal.
 *
 * @param {{ findings: object[] }} plan
 * @param {Function} applyFix — (fix, finding) => void
 * @returns {Array<{ finding: object, fix: object, error: Error }>}
 */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function applyFixes(plan, applyFix) {
  const appliedKeys = new Set();
  const failedFixes = [];

  for (const finding of plan.findings) {
    for (const fix of finding.fixes) {
      const key = fixKey(fix);
      if (appliedKeys.has(key)) continue;
      appliedKeys.add(key);
      try {
        applyFix(fix, finding);
      } catch (error) {
        failedFixes.push({ finding, fix, error });
      }
    }
  }

  return failedFixes;
}

/** Whether the loop has seen enough consecutive zero-finding runs. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function isStable(stableRuns) {
  return stableRuns >= REQUIRED_STABLE_RUNS;
}

/**
 * Run the repair loop.
 *
 * @param {object} input
 * @param {Function} input.runGates — () => { findings, gates }
 * @param {Function} input.applyFix — (fix, finding) => void
 * @param {string} [input.ticketKey]
 * @param {number} [input.maxRuns]
 * @param {boolean} [input.debtCheck]
 * @returns {object}
 */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function runRepairLoop({ runGates, applyFix, ticketKey, maxRuns = DEFAULT_MAX_RUNS, debtCheck = true }) {
  if (typeof runGates !== 'function') throw new Error('runGates is required');
  if (typeof applyFix !== 'function') throw new Error('applyFix is required');

  let previousGateFindings = null;
  let stableRuns = 0;
  let runs = 0;
  let lastGates = [];
  let finalFindings = [];
  let finalDigest = findingsDigest([]);
  const failedFixes = [];
  const debtFindings = [];

  while (runs < maxRuns) {
    runs += 1;
    const cycle = runGateCycle(runGates);
    lastGates = cycle.gates;

    let findings = cycle.findings;
    if (debtCheck) {
      const debt = detectDebt({ previousFindings: previousGateFindings, currentFindings: findings });
      if (debt.increased) {
        const entry = debtFinding(debt, findings);
        debtFindings.push(entry);
        findings = [...findings, entry];
      }
      // Compare the next run with the real gate output, not the synthetic entry.
      previousGateFindings = cycle.findings;
    }

    const plan = buildRepairPlan(findings);
    finalFindings = plan.findings;
    finalDigest = plan.digest;

    if (plan.count === 0) {
      stableRuns += 1;
      if (isStable(stableRuns)) {
        return {
          completed: true,
          runs,
          finalFindings: [],
          finalDigest,
          certificate: buildCertificate({
            ticketKey,
            gates: lastGates,
            runCount: runs,
            finalFindings: [],
            finalDigest,
          }),
          failedFixes,
          debtFindings,
          reason: null,
        };
      }
      continue;
    }

    stableRuns = 0;
    failedFixes.push(...applyFixes(plan, applyFix));
  }

  return {
    completed: false,
    runs,
    finalFindings,
    finalDigest,
    certificate: null,
    failedFixes,
    debtFindings,
    reason: 'MAX_RUNS',
  };
}

module.exports = {
  DEFAULT_MAX_RUNS,
  REQUIRED_STABLE_RUNS,
  runGateCycle,
  applyFixes,
  isStable,
  runRepairLoop,
};
