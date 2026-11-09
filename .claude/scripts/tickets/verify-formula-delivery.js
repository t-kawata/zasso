#!/usr/bin/env node
'use strict';

/**
 * verify-formula-delivery.js — expose the formula dry-run as a gate report.
 *
 * The merge tool already decides whether a formula has an implementation symbol
 * and a verification test. This gate does not re-implement that decision; it
 * converts the existing findings into the shared report shape.
 *
 * Report only: prints one finding envelope and exits zero.
 */

const { mergeFormulasToTickets } = require('./merge-formulas-to-tickets.js');
const {
  gateFinding,
  gateRerun,
  emitGateReport,
  argumentValue,
  resolveArgumentPath,
  implementationRoute,
  inputRoute,
} = require('./lib/gate-report.js');

const GATE = 'verify-formula-delivery';

/**
 * Convert a merge dry-run result into gate findings.
 *
 * @param {object} result — mergeFormulasToTickets output
 * @param {{ ticketKey: string, ticketsPath?: string, rerun: string }} options
 * @returns {object[]} — frozen findings
 */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function formulaResultToFindings(result, { ticketKey, ticketsPath, rerun }) {
  if (!result || result.ok === true || !Array.isArray(result.findings)) return [];

  return result.findings.map((entry) => {
    const formulaId = entry.subject ?? '?';
    const asset = ticketKey + '/formula/' + formulaId;
    return gateFinding({
      code: entry.code,
      asset,
      problem: entry.message,
      rerun,
      fix: implementationRoute({
        formulaId,
        code: entry.code,
        asset,
        message: entry.message,
      }),
    });
  });
}

// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  const ticketKey = argumentValue(args, 'ticket-key') || '(package)';
  const ticketsPath = resolveArgumentPath(args, 'tickets');
  const rerun = gateRerun(GATE, ticketKey, ticketsPath || '(missing)');

  let result;
  try {
    result = mergeFormulasToTickets({
      ticketsPath,
      dirsTreePath: resolveArgumentPath(args, 'dirs-tree'),
      sidecarPath: resolveArgumentPath(args, 'sidecar'),
      specPath: resolveArgumentPath(args, 'spec'),
      treeManifestPath: resolveArgumentPath(args, 'tree-manifest'),
      cwd: process.cwd(),
      write: false,
    });
  } catch (error) {
    emitGateReport({
      gate: GATE,
      ticketKey,
      findings: [gateFinding({
        code: 'FORMULA_GATE_FAILED',
        asset: ticketKey + '/formula',
        problem: error.message,
        rerun,
        fix: inputRoute({
          asset: ticketKey + '/formula',
          instruction: 'Repair the formula inputs named in the error and re-run the formula gate',
        }),
      })],
    });
    process.exit(0);
  }

  emitGateReport({
    gate: GATE,
    ticketKey,
    findings: formulaResultToFindings(result, { ticketKey, ticketsPath, rerun }),
  });
  process.exit(0);
}

if (require.main === module) main();

module.exports = { GATE, formulaResultToFindings };
