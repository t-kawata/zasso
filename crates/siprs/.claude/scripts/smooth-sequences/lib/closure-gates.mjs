// The design-authoring gates the acceptance gate must not pass over.
//
// /smooth-sequences is the last command in the pipeline, and a pass from it used to mean
// only that its own checks found nothing. The grill's mechanical gates are what prove the
// obligation list is total and every demand is placed; they run in the transaction and in
// /grill-me-for-rfc, but not here, so a workspace could pass this gate while its sequences
// axis was still unstated. This module runs the same four gates the transaction runs, so
// a pass here means the closure those gates measure holds too.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
const SCRIPT_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'grill-me-for-rfc');

/** The gates, in the order the transaction runs them. */
// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
export const CLOSURE_GATES = Object.freeze([
  { script: 'check-obligation-coverage.js', args: (root) => [root] },
  { script: 'check-contribution-completeness.js', args: (root) => [root] },
  { script: 'check-distribution-completeness.js', args: (root) => [root] },
  { script: 'defect-report.js', args: (root) => [root, '--gate'] },
]);

/** The first non-empty line a gate wrote, so the report names the refusal it made. */
// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
function firstLine(text) {
  return String(text ?? '').split('\n').map((line) => line.trim()).find((line) => line.length > 0) ?? '';
}

/** Run one gate with the node binary in use, from the workspace it measures. */
// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
function runGate({ root, script, args }) {
  const result = spawnSync(process.execPath, [join(SCRIPT_DIRECTORY, script), ...args(root)], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    script,
    exitCode: result.status ?? 1,
    reason: firstLine(result.stderr) || firstLine(result.stdout),
  };
}

/**
 * Run every closure gate over one workspace.
 *
 * `run` is injectable so the mapping from an exit code to a named refusal is testable
 * without a whole workspace behind each gate.
 *
 * @param {{root: string, run?: Function}} request
 * @returns {{ok: boolean, gates: Array<{script: string, exitCode: number, reason: string}>}}
 */
// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
export function runClosureGates({ root, run = runGate } = {}) {
  const gates = CLOSURE_GATES.map((gate) => run({ root, ...gate }));
  return { ok: gates.every((gate) => gate.exitCode === 0), gates };
}
