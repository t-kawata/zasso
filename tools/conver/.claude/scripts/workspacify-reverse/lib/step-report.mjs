/**
 * The report Step 8 prints: the stages that ran, the destination, and the digest outcome.
 *
 * Nothing here grades the reverse engineering. Whether it succeeded is a judgement a
 * human makes over several rounds, and the machine's vocabulary is `proved` /
 * `not proved` for exactly that reason — the outcome reported here is about the target
 * digest, which is a fact about the run rather than a verdict on the work.
 *
 * [::TICKET::] P26-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-3 --for-spec --no-implementation-order`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { reservedReverseDirectory } from './holdout-ledger.mjs';
import { stageLabel } from './scope.mjs';

/** The scope document, which records the stages and the target digest. */
export const SCOPE_FILE_NAME = 'ANALYSIS-SCOPE.json';

/**
 * The report, read from what the run published.
 *
 * @param {{root: string, destination?: string}} params
 * @returns {{destination: string, stages: string[], outcome: string|null, findings: string[]}}
 */
export function readStepReport({ root, destination = reservedReverseDirectory(root) } = {}) {
  const scopePath = join(destination, SCOPE_FILE_NAME);
  if (!existsSync(destination)) {
    return {
      destination,
      stages: [],
      outcome: null,
      findings: [`${destination} does not exist: the analysis published nothing into it`],
    };
  }
  if (!existsSync(scopePath)) {
    return {
      destination,
      stages: [],
      outcome: null,
      findings: [`${scopePath} is absent: without it the stages that ran cannot be named`],
    };
  }

  try {
    const scope = JSON.parse(readFileSync(scopePath, 'utf8'));
    const stages = Array.isArray(scope.stages_run) ? scope.stages_run : [];
    const digest = scope.target_digest ?? {};
    // The outcome is the digest comparison and nothing else: the run published because
    // the target was unchanged, and a destination without that record has no outcome to
    // report rather than a favourable one.
    const outcome = Object.hasOwn(digest, 'unmodified') ? (digest.unmodified ? 'proved' : 'not proved') : null;
    return { destination, stages, outcome, findings: [] };
  } catch (error) {
    return { destination, stages: [], outcome: null, findings: [`${scopePath} could not be read (${error.message})`] };
  }
}

/** The report as Markdown: the stages, the destination and the outcome, and nothing else. */
export function renderStepReport(report) {
  const lines = ['# Report', '', `Destination: \`${report.destination}\``, ''];
  lines.push(
    report.stages.length === 0
      ? 'Stages that ran: none recorded.'
      : `Stages that ran: ${report.stages.map((stage) => `\`${stageLabel(stage)}\``).join(', ')}.`,
  );
  lines.push('', `Outcome: ${report.outcome ?? 'not recorded'}.`);
  return `${lines.join('\n')}\n`;
}

/** The findings as the advice an operator acts on, naming what is missing and where. */
export function renderReportAdvice(findings, { destination }) {
  const lines = ['The report cannot be given: nothing was published to read it from.', `  Where: ${destination}`];
  for (const finding of findings) lines.push(`  Which: ${finding}`);
  lines.push('What to do: return to Step 2 and run the entrance again. There is no partial result,');
  lines.push('  so nothing is repaired by hand.');
  return `${lines.join('\n')}\n`;
}
