#!/usr/bin/env node
/**
 * Report the obligation state of a workspace without deciding anything about it.
 *
 * The two gates answer whether the guarantee holds, and they answer it with an exit code the grill
 * reads at Step 1, Step 3 and Step 8. A tree that never runs the grill is therefore never asked,
 * and this reporter is the asking: it runs both gates over a workspace and prints what they say,
 * so a session can see the state without a pipeline run and without a verdict being pronounced.
 *
 * It exits 0 on every path, which is the whole point of separating it from the gates. A reporter
 * that could fail would become a second blocking point, and the blocking decision belongs to one
 * place — the Step 8 gate — where the run has already declared that it intends to establish the
 * guarantee. Anywhere else, a nonzero exit would stop work over a state the reader had not claimed.
 *
 * The gate verdicts are read by running the gates rather than by measuring a second time. A second
 * reader would be a second thing to drift, and the drift would be invisible: the reporter and the
 * gate would disagree about the same workspace and the reader would have no way to tell which one
 * the grill would act on.
 */
import path from 'node:path';

import { main as coverageGateMain } from './check-obligation-coverage.js';
import { main as dischargeGateMain } from './check-ledger-discharge.js';
import { toHomeRelative } from '../lib/path-utils.js';

const USAGE = 'usage: report-obligation-state.js <WORKSPACE_ROOT>';

/** This reporter never blocks, on any path, including the ones where it cannot do its work. */
const EXIT_ADVISORY = 0;

/**
 * One gate's exit code and everything it printed.
 *
 * The gates write their findings to stdout and answer with a code, and there is no way to ask them
 * for the findings without also letting them print. Redirecting for the duration of one call keeps
 * the two apart so a quiet verdict can be summarised in one line instead of replayed, and the
 * redirection is restored in a finally so a gate that throws does not leave the process writing
 * into a buffer nobody reads.
 *
 * @param {() => number} runGate
 * @returns {{ status: number, output: string }}
 */
// [::TICKET::] PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-262 --for-spec --no-implementation-order`.
function captureGateOutput(runGate) {
  const written = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => {
    written.push(String(chunk));
    return true;
  };
  try {
    return { status: runGate(), output: written.join('') };
  } finally {
    process.stdout.write = originalWrite;
  }
}

/** The findings a gate printed, as lines, or nothing when it found nothing to report. */
// [::TICKET::] PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-262 --for-spec --no-implementation-order`.
function findingsOf(gate, subject) {
  if (gate.status === EXIT_ADVISORY) return [`${subject}: reported nothing to repair`];
  return gate.output.split('\n').filter((line) => line.trim().length > 0).map((line) => `  ${line}`);
}

/**
 * Run both gates over one workspace and print what they said.
 *
 * @param {string[]} [argv]
 * @returns {number}
 */
// [::TICKET::] PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-262 --for-spec --no-implementation-order`.
export function main(argv = process.argv.slice(2)) {
  const [rootArgument] = argv.filter((argument) => !argument.startsWith('--'));
  if (rootArgument === undefined) {
    process.stderr.write(`${USAGE}\n`);
    return EXIT_ADVISORY;
  }
  const root = path.resolve(rootArgument);

  const lines = [`obligation state: ${toHomeRelative(root)}`];
  for (const [subject, runGate] of [['coverage', coverageGateMain], ['discharge', dischargeGateMain]]) {
    try {
      lines.push(...findingsOf(captureGateOutput(() => runGate([root])), subject));
    } catch (error) {
      lines.push(`  ${subject}: the gate could not be run — ${error.message}`);
    }
  }
  lines.push('advisory: nothing here blocks; the blocking decision belongs to the grill Step 8 gate');
  process.stdout.write(`${lines.join('\n')}\n`);
  return EXIT_ADVISORY;
}

// The reporter is spawned as a program by a session and by its tests, so the entry point is explicit.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  process.exit(main());
}

export { captureGateOutput, findingsOf };
