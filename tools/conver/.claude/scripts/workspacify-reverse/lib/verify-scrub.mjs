// [::TICKET::] PX-203 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-203 --for-spec --no-implementation-order`.
/**
 * Verification that a scrub reached zero residue.
 *
 * The predicate is deliberately the detector's own: verification re-runs
 * detection rather than re-implementing it. If the two could disagree, a scrub
 * could pass a weaker check than the one that found the traces, which is
 * exactly the one-sided bypass this gate exists to prevent.
 */
import {
  detectForwardTraces,
  detectTicketKeyedFilenames,
} from './detect-forward-traces.mjs';
import { TRACE_PATTERNS } from './trace-patterns.mjs';

/** Layers whose residue means the experiment input is still contaminated. */
const CONTAMINATING_LAYERS = ['L1', 'L2', 'L3'];

/**
 * @param {string} rootPath
 * @param {object} [options]
 * @returns {{ residualCount: number, findings: Array<{file: string, line: number, layer: string, text: string}> }}
 */
export function verifyScrub(rootPath, options = {}) {
  const detection = detectForwardTraces(rootPath, options);
  const findings = [];

  for (const layerId of CONTAMINATING_LAYERS) {
    for (const finding of detection.layers[layerId].findings) {
      findings.push({ ...finding, layer: layerId });
    }
  }

  // A file name that still carries a ticket key leaks the phase decomposition.
  for (const relative of detectTicketKeyedFilenames(rootPath, options)) {
    findings.push({ file: relative, line: 1, layer: 'filename', text: relative });
  }

  return { residualCount: findings.length, findings };
}

/**
 * The process exit code for a verification result: zero residue is success.
 * @param {{ residualCount: number }} result
 * @returns {number}
 */
export function exitCodeFor(result) {
  return result.residualCount === 0 ? 0 : 1;
}

/** Render a verification result as Markdown for the AI and the human. */
export function renderVerification(result, rootPath) {
  if (result.residualCount === 0) {
    return [`## Scrub verification — PASS`, '', `No forward-rotation trace remains under \`${rootPath}\`.`, ''].join('\n');
  }
  const lines = [
    '## Scrub verification — FAIL',
    '',
    `${result.residualCount} trace(s) remain under \`${rootPath}\`.`,
    '',
  ];
  for (const finding of result.findings.slice(0, 50)) {
    lines.push(`- [${finding.layer}] \`${finding.file}:${finding.line}\` ${String(finding.text).trim()}`);
  }
  return lines.join('\n');
}

/** The predicate shared with the detector. */
verifyScrub.patterns = TRACE_PATTERNS;
