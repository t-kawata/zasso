// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
/**
 * The verdict lattice of the smooth-sequences gate.
 *
 * A run has three outcomes, not two. `findings` means the workspace was measured and
 * something is wrong. `unproven` means the workspace could not be measured: a required
 * surface was absent, synthesized by a migration, or the educe readings still carry an
 * unresolved Yes. `pass` is reserved for a run where every registered check executed
 * over an authored surface and nothing was found. The three outcomes have distinct exit
 * codes so a caller cannot read `unproven` as success.
 */

export const VERDICT_PASS = 'pass';
export const VERDICT_FINDINGS = 'findings';
export const VERDICT_UNPROVEN = 'unproven';

export const EXIT_PASS = 0;
export const EXIT_FINDINGS = 1;
export const EXIT_MISUSE = 2;
export const EXIT_JUDGMENT = 3;
export const EXIT_UNPROVEN = 4;

/**
 * Classify one evaluation.
 *
 * Findings take precedence: a run that found a defect is `findings` even when another
 * surface is also blocked, because the defect is the actionable result. With no
 * findings, any blocked surface, unresolved reading or schema downgrade makes the run
 * `unproven`. Only a fully measured, fully resolved run is `pass`.
 *
 * @param {{ findings?: Array<object>, blocked?: Array<object>,
 *   unresolvedReadings?: number, downgrade?: object|null }} input
 * @returns {{ verdict: string, exitCode: number }}
 */
// [::TICKET::] PX-289 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-289 --for-spec --no-implementation-order`.
export function classifyVerdict(options = {}) {
  const {
    findings = [],
    blocked = [],
    unresolvedReadings = 0,
    downgrade = null,
    certificate = null,
  } = options;
  if (findings.length > 0) {
    return { verdict: VERDICT_FINDINGS, exitCode: EXIT_FINDINGS };
  }
  if (certificate !== null && certificate !== undefined) {
    if (downgrade !== null || blocked.length > 0 || certificate.status !== 'complete') {
      return { verdict: VERDICT_UNPROVEN, exitCode: EXIT_UNPROVEN };
    }
    return { verdict: VERDICT_PASS, exitCode: EXIT_PASS };
  }
  if (downgrade !== null || blocked.length > 0 || unresolvedReadings > 0) {
    return { verdict: VERDICT_UNPROVEN, exitCode: EXIT_UNPROVEN };
  }
  return { verdict: VERDICT_PASS, exitCode: EXIT_PASS };
}
