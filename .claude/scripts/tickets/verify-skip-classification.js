#!/usr/bin/env node
'use strict';

/**
 * verify-skip-classification.js — a skip is grounded, unproven or ungrounded.
 *
 * A gate that skips a check must say why. "No distribution" is a grounded
 * not-applicable reason; "not implemented yet" is an unproven skip; and claiming
 * not-applicable while the asset is present is ungrounded. The caller receives
 * the unproven and ungrounded ones as findings.
 *
 * Report only: prints one finding envelope and exits zero.
 */

const fs = require('node:fs');
const {
  gateFinding,
  gateRerun,
  emitGateReport,
  argumentValue,
  resolveArgumentPath,
  emitInputMissing,
  testRepairRoute,
} = require('./lib/gate-report.js');

const GATE = 'verify-skip-classification';
const NOT_APPLICABLE_REASONS = Object.freeze([
  'no-distribution',
  'no-prerequisites',
  'no-formulas',
  'no-formula-obligations',
  'ticket-not-found',
]);

/** Normalize a skip reason, dropping the `skipped:` prefix the CLIs use. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function normalizeReason(reason) {
  return String(reason || '').trim().toLowerCase().replace(/^skipped:/, '');
}

/**
 * Classify one skip.
 *
 * @param {{ check: string, reason: string, assetPresent?: boolean, producer?: string|null }} skip
 * @returns {{ status: string, code: string|null }}
 */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function classifySkip({ check, reason, assetPresent = false, producer = null }) {
  const normalized = normalizeReason(reason);
  const notApplicable = NOT_APPLICABLE_REASONS.includes(normalized);

  if (assetPresent && notApplicable) return { status: 'ungrounded', code: 'UNGROUNDED_SKIP' };
  if (producer) return { status: 'not_applicable', code: null };
  if (notApplicable) return { status: 'not_applicable', code: null };
  return { status: 'unproven', code: 'UNPROVEN_SKIP' };
}

/**
 * Turn unproven and ungrounded skips into findings.
 *
 * @param {object[]} skips
 * @param {string} ticketKey
 * @param {string} ticketsPath
 * @returns {object[]} — frozen findings
 */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function findSkipGaps(skips, ticketKey, ticketsPath) {
  const rerun = gateRerun(GATE, ticketKey, ticketsPath);
  const findings = [];

  for (const skip of skips || []) {
    if (!skip || typeof skip.check !== 'string' || skip.check.length === 0) continue;
    const verdict = classifySkip(skip);
    if (verdict.code === null) continue;

    const asset = ticketKey + '/' + skip.check;
    findings.push(gateFinding({
      code: verdict.code,
      asset,
      problem: 'skip ' + skip.check + ' is ' + verdict.status + ': ' + (skip.reason || '(no reason)'),
      rerun,
      fix: testRepairRoute({
        ticketKey,
        asset,
        instruction: 'Ground the skip as not-applicable with a producer, or implement the skipped check',
      }),
    }));
  }

  return findings;
}

// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  const ticketKey = argumentValue(args, 'ticket-key');
  const ticketsPath = resolveArgumentPath(args, 'tickets');
  if (!ticketKey || !ticketsPath) {
    emitInputMissing(GATE, ticketKey, ticketsPath);
    process.exit(0);
  }

  const skipsPath = resolveArgumentPath(args, 'skips');
  let skips = [];
  if (skipsPath !== undefined && fs.existsSync(skipsPath)) {
    skips = JSON.parse(fs.readFileSync(skipsPath, 'utf8'));
  }

  emitGateReport({
    gate: GATE,
    ticketKey,
    findings: findSkipGaps(skips, ticketKey, ticketsPath),
  });
  process.exit(0);
}

if (require.main === module) main();

module.exports = {
  GATE,
  NOT_APPLICABLE_REASONS,
  classifySkip,
  findSkipGaps,
};
