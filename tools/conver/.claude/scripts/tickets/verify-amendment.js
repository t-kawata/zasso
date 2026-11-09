'use strict';

/**
 * The report-mode view of the amendment gate manifest.
 *
 * Report mode always exits zero: a skip is not a finding, and an absent artifact
 * is a skip. The envelope is the same one every PX-398 gate emits, extended with
 * the two states absence needs.
 */

const path = require('node:path');

const {
  ARTIFACT_STATES,
  resolveArtifactStates,
} = require('./lib/design-amendment-state.js');
const {
  GATE_ENTRIES,
  runGateManifest,
} = require('./amendment-gate-manifest.js');
const { gateFinding } = require('./lib/gate-report.js');

const GATE = 'verify-amendment';

/** The finding an unreadable or ambiguous artifact carries. */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function stateFinding(ticketKey, state) {
  return gateFinding({
    code: state.code ?? 'UNREADABLE_ARTIFACT',
    asset: ticketKey + '/' + state.kind,
    problem: state.message ?? state.code ?? 'artifact is not readable',
    rerun: 'design-amendment.js --dry-run --ticket-key=' + ticketKey,
    fix: {
      tool: 'design-amendment',
      input: { ticketKey, artifact: state.kind, dryRun: true },
    },
  });
}

/**
 * Run the amendment gate manifest and return the report envelope.
 *
 * @param {{ cwd?: string, ticketKey: string, ticketsPath?: string|null,
 *           report?: boolean, runners?: object }} input
 * @returns {{ gate: string, ticketKey: string, findings: object[],
 *             skipped: object[], unverifiable: object[] }}
 */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function verifyAmendment({ cwd = process.cwd(), ticketKey, ticketsPath = null, report = false, runners = {} }) {
  const states = resolveArtifactStates({ cwd });
  const skipped = [];
  const findings = [];

  for (const state of states) {
    if (state.state === ARTIFACT_STATES.ABSENT) {
      skipped.push({ artifact: state.kind, reason: 'absent' });
    } else if (state.state === ARTIFACT_STATES.AMBIGUOUS || state.state === ARTIFACT_STATES.UNREADABLE) {
      findings.push(stateFinding(ticketKey, state));
    }
  }

  const presentKinds = states
    .filter((state) => state.state === ARTIFACT_STATES.PRESENT)
    .map((state) => state.kind);
  const gateResult = runGateManifest({ cwd, ticketKey, ticketsPath, presentKinds, runners });
  findings.push(...gateResult.findings);

  return {
    gate: GATE,
    ticketKey,
    findings,
    skipped,
    unverifiable: gateResult.unverifiable,
  };
}

/** Read `--name=value` from the argument list. */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function argumentValue(args, name) {
  const prefix = '--' + name + '=';
  const match = args.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  const ticketKey = argumentValue(args, 'ticket-key');
  if (!ticketKey) {
    process.stdout.write(JSON.stringify({
      gate: GATE,
      ticketKey: null,
      findings: [gateFinding({
        code: 'GATE_INPUT_MISSING',
        asset: GATE,
        problem: '--ticket-key is required',
        rerun: 'verify-amendment.js --ticket-key=<key>',
        fix: { tool: 'verify-amendment', input: { ticketKey: null } },
      })],
      skipped: [],
      unverifiable: [],
    }) + '\n');
    process.exit(0);
  }

  const cwd = path.resolve(argumentValue(args, 'cwd') || process.cwd());
  const report = verifyAmendment({
    cwd,
    ticketKey,
    ticketsPath: argumentValue(args, 'tickets') ?? null,
    report: args.includes('--report'),
  });
  process.stdout.write(JSON.stringify(report) + '\n');
  process.exit(0);
}

if (require.main === module) main();

module.exports = {
  GATE,
  GATE_ENTRIES,
  runGateManifest,
  verifyAmendment,
};
