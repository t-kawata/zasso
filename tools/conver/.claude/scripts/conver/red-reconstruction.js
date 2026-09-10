// [::TICKET::] P22-19 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-19 --for-spec --no-implementation-order`.
/**
 * The implementation loop's isolated path for Red reconstruction tickets.
 *
 * A reconstruction ticket is a ticket whose purpose is to observe a failure.
 * An existing implementation is broken on purpose so that the Red that
 * /start-ticket's Red phase demands can be reconstructed after the fact
 * (ABOUT-REVERSE 3.5). Confirming it in the working tree would damage the very
 * artefact the reverse rotation is analysing, so it runs in a disposable git
 * worktree instead. The isolation itself lives in `worktree-isolation.mjs`;
 * this module is what the loop calls.
 *
 * Two vocabularies are kept apart. The isolation says whether the main tree
 * moved and whether the worktree was destroyed. This module says whether the
 * Red was observed. Neither says "succeeded", because whether reverse
 * engineering succeeded is a judgement a human makes after several loop rounds
 * (ABOUT-REVERSE 3.3).
 *
 * A ticket is a reconstruction ticket if and only if it carries the
 * `counterexample_plan_id` that /split-to-tickets stamps on it (ABOUT-REVERSE
 * 6.8 S5, 6.14.6 S5). The check is repeated here as a refusal rather than
 * assumed from upstream: the alternative to running a ticket isolated is not
 * running it at all, and a ticket with no plan would carry its uncertainty
 * straight into implementation.
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { withIsolatedWorktree } from '../workspacify-reverse/lib/worktree-isolation.mjs';

/** The field /split-to-tickets stamps on a reconstruction ticket, and its absence. */
export const RECONSTRUCTION_PLAN_FIELD = 'counterexample_plan_id';

/** The ticket field the recorded evidence is written to. */
export const RED_EVIDENCE_FIELD = 'redEvidence';

export const RED_PROVED = 'proved';
export const RED_NOT_PROVED = 'not-proved';

/** The only two things this module is allowed to say about a Red. */
export const RED_VERDICTS = Object.freeze([RED_PROVED, RED_NOT_PROVED]);

/** A pass either ran something or found nothing to run; neither is a success claim. */
export const PASS_STATUSES = Object.freeze(['executed', 'nothing-to-execute']);

const REASON_PLAN_ID_MISSING = 'plan-id-missing';
const REASON_EXECUTOR_MISSING = 'executor-missing';
const REASON_INVALID_EXECUTION_RESULT = 'invalid-execution-result';

/** The reasons this module raises, built from the constants the throws use so the two cannot drift. */
export const RED_REASONS = Object.freeze([
  REASON_PLAN_ID_MISSING,
  REASON_EXECUTOR_MISSING,
  REASON_INVALID_EXECUTION_RESULT,
]);

/** The reason a reconstruction cannot proceed, and the message a human reads. */
// [::TICKET::] P22-19 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-19 --for-spec --no-implementation-order`.
export class RedReconstructionError extends Error {
// [::TICKET::] P22-19 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-19 --for-spec --no-implementation-order`.
  constructor(reason, message) {
    super(message);
    this.name = 'RedReconstructionError';
    this.reason = reason;
  }
}

/**
 * How a ticket is named in a message: the same key the loop and the ledger use.
 *
 * Both parts of the key are required. A ticket whose phase is missing would
 * otherwise be named `Pundefined-20`, which reads as a real key and is not one.
 */
function describeTicket(ticket) {
  if (ticket === null || typeof ticket !== 'object') return '(unnamed ticket)';
  if (!Number.isInteger(ticket.id) || !Number.isInteger(ticket.phaseId)) return '(unnamed ticket)';
  return ticket.phaseId === -1 ? `PX-${ticket.id}` : `P${ticket.phaseId}-${ticket.id}`;
}

/**
 * A short, safe description of a value that was refused for its shape.
 *
 * This is only ever called on a value already rejected, and `JSON.stringify`
 * would be the obvious tool and the wrong one: a circular value would make the
 * refusal throw a TypeError, so the check would fail in the act of reporting
 * that it failed. Listing the keys cannot throw, and it names the field a
 * reader needs to know was missing.
 */
function describeResult(result) {
  if (result === null) return 'null';
  if (typeof result === 'function') return 'a function';
  if (typeof result !== 'object') return `${typeof result} ${String(result)}`;
  const keys = Object.keys(result);
  return `an object with key(s) ${keys.length === 0 ? 'none' : keys.join(', ')}`;
}

/** True when a ticket carries the plan identifier a reconstruction ticket must have. */
export function isReconstructionTicket(ticket) {
  const planId = ticket?.[RECONSTRUCTION_PLAN_FIELD];
  return typeof planId === 'string' && planId.trim().length > 0;
}

/** The tickets the loop must route down the isolated path, in the order given. */
export function selectReconstructionTickets(tickets) {
  return (Array.isArray(tickets) ? tickets : []).filter(isReconstructionTicket);
}

/** Refuse a ticket that is not a reconstruction ticket. */
export function assertReconstructionTicket(ticket) {
  if (!isReconstructionTicket(ticket)) {
    throw new RedReconstructionError(
      REASON_PLAN_ID_MISSING,
      `ticket ${describeTicket(ticket)} carries no ${RECONSTRUCTION_PLAN_FIELD}, so there is no falsification plan to execute — without one the uncertainty this ticket exists to settle would disappear at implementation time`,
    );
  }
  return ticket;
}

/**
 * What the execution said about the Red, or a refusal naming why it said nothing.
 *
 * A result that does not state whether the Red was proved is refused rather
 * than read as "not proved". An unstated answer is not an answer, and recording
 * it as one would turn "I did not look there" into evidence that nothing was
 * there — the same substitution P22-18's dynamic surface refuses.
 */
// [::TICKET::] P22-19 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-19 --for-spec --no-implementation-order`.
function readObservation(execution) {
  if (execution === null || typeof execution !== 'object' || typeof execution.redProved !== 'boolean') {
    throw new RedReconstructionError(
      REASON_INVALID_EXECUTION_RESULT,
      `the isolated execution returned ${describeResult(execution)}, which does not state whether the Red was proved — an unstated answer is refused rather than recorded as "not proved"`,
    );
  }
  return {
    redProved: execution.redProved,
    observations: Array.isArray(execution.observations) ? [...execution.observations] : [],
  };
}

/** The evidence a finished execution produced, in the shape both callers read. */
// [::TICKET::] P22-19 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-19 --for-spec --no-implementation-order`.
function buildRecord(ticket, outcome, observation) {
  return {
    ticketKey: describeTicket(ticket),
    counterexamplePlanId: ticket[RECONSTRUCTION_PLAN_FIELD],
    verdict: observation.redProved ? RED_PROVED : RED_NOT_PROVED,
    redObserved: observation.redProved,
    observations: observation.observations,
    worktreePath: outcome.worktreePath,
    scratchBase: outcome.scratchBase,
    mainTreeDigest: outcome.mainTreeDigest,
    restorationOutcome: outcome.restorationOutcome,
  };
}

/**
 * Run one reconstruction ticket inside its own worktree, and report what was seen.
 *
 * `execute` is the caller's, and it receives the worktree path and nothing
 * else: the isolation guarantees the path is a disposable checkout, and this
 * function guarantees the isolation ran.
 *
 * @param {object} ticket - a ticket carrying a counterexample plan identifier
 * @param {object} options
 * @param {string} options.root - the working tree to isolate
 * @param {(context: {ticket: object, worktreePath: string}) => any} options.execute - what to run inside
 * @returns {Promise<object>} the recorded evidence
 */
export async function executeReconstructionTicket(ticket, options = {}) {
  assertReconstructionTicket(ticket);

  const { root, execute, ...isolationOptions } = options;
  if (typeof execute !== 'function') {
    throw new RedReconstructionError(
      REASON_EXECUTOR_MISSING,
      `ticket ${describeTicket(ticket)} needs something to run inside its worktree, and a ${typeof execute} is not something that can be run`,
    );
  }

  const outcome = await withIsolatedWorktree(
    root,
    (worktreePath) => execute({ ticket, worktreePath }),
    isolationOptions,
  );

  return buildRecord(ticket, outcome, readObservation(outcome.execution));
}

/**
 * Execute every reconstruction ticket in a set, each in its own worktree.
 *
 * Zero tickets is an explicit result, not a vacuous success. "Nothing needed
 * reconstructing" and "everything was reconstructed" are different claims, and
 * a pass that reported the second while meaning the first would be exactly the
 * false green this path exists to prevent.
 *
 * An execution that throws stops the pass rather than being skipped: the
 * isolation guarantees there is nothing left to clean up, and a silently
 * skipped ticket would be a gap nobody was told about.
 *
 * @param {object} options
 * @param {Array<object>} options.tickets - every ticket under consideration, ordinary ones included
 * @param {string} options.root - the working tree to isolate
 * @param {(context: {ticket: object, worktreePath: string}) => any} options.execute - what to run inside
 * @returns {Promise<object>} the pass
 */
export async function runReconstructionPass({ tickets, root, execute, ...isolationOptions } = {}) {
  const selected = selectReconstructionTickets(tickets);
  const requested = Array.isArray(tickets) ? tickets.length : 0;

  if (selected.length === 0) {
    return {
      status: 'nothing-to-execute',
      verdict: RED_NOT_PROVED,
      reason: 'no-reconstruction-tickets',
      requested,
      executed: [],
    };
  }

  const executed = [];
  for (const ticket of selected) {
    executed.push(await executeReconstructionTicket(ticket, { root, execute, ...isolationOptions }));
  }

  return {
    status: 'executed',
    verdict: executed.every((record) => record.redObserved) ? RED_PROVED : RED_NOT_PROVED,
    reason: null,
    requested,
    executed,
  };
}

/**
 * The ticket as it is once the Red evidence is recorded against it.
 *
 * A new object, never the one passed in. Evidence recorded by mutating the
 * caller's ticket would be invisible to anything still holding the previous
 * value, and the loop re-reads tickets between phases.
 */
export function recordRedEvidence(ticket, record) {
  return {
    ...ticket,
    [RED_EVIDENCE_FIELD]: {
      counterexample_plan_id: record.counterexamplePlanId,
      verdict: record.verdict,
      red_observed: record.redObserved,
      worktree_path: record.worktreePath,
      restoration_outcome: record.restorationOutcome,
      main_tree_unchanged: record.mainTreeDigest.unchanged,
      changed_paths: [...record.mainTreeDigest.changedPaths],
      observations: [...record.observations],
    },
  };
}

/** How the guarded paths ended, as a phrase the table can hold. */
// [::TICKET::] P22-19 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-19 --for-spec --no-implementation-order`.
function describeMainTree(mainTreeDigest) {
  return mainTreeDigest.unchanged
    ? 'byte-identical'
    : `changed: ${mainTreeDigest.changedPaths.join(', ')}`;
}

/** The pass as the Markdown a human reads, in plain and deliberately helpful English. */
export function renderReconstructionReport(pass) {
  const lines = ['## Red reconstruction', ''];

  if (pass.status === 'nothing-to-execute') {
    lines.push(
      `**Nothing to reconstruct.** ${pass.requested} ticket(s) were offered and none of them carries a `
      + 'reconstruction plan, so no isolated execution ran. This is a statement about the set, not a '
      + 'result about reconstruction.',
    );
    lines.push('');
    return lines.join('\n');
  }

  const proved = pass.executed.filter((record) => record.redObserved).length;
  const total = pass.executed.length;

  if (proved === total) {
    lines.push(`**Red proved** for all ${total} reconstruction ticket(s) offered.`);
  } else if (proved === 0) {
    lines.push(`**Red not proved** for any of the ${total} reconstruction ticket(s) offered.`);
  } else {
    lines.push(`**Red proved** for ${proved} of ${total} reconstruction ticket(s); not proved for ${total - proved}.`);
  }
  lines.push('');

  lines.push('| Ticket | Plan | Red | Worktree | Main tree | Restoration |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const record of pass.executed) {
    lines.push(
      `| ${record.ticketKey} | \`${record.counterexamplePlanId}\` | ${record.verdict} `
      + `| ${record.worktreePath} | ${describeMainTree(record.mainTreeDigest)} | ${record.restorationOutcome} |`,
    );
  }
  lines.push('');

  const observations = pass.executed.flatMap(
    (record) => record.observations.map((observation) => `- ${record.ticketKey}: ${observation}`),
  );
  if (observations.length > 0) {
    lines.push('What the executions saw:', '', ...observations, '');
  }

  return lines.join('\n');
}

/** Every ticket in a Tickets.json document, each carrying the phase it belongs to. */
// [::TICKET::] P22-19 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-19 --for-spec --no-implementation-order`.
function loadTickets(ticketsPath) {
  const document = JSON.parse(readFileSync(ticketsPath, 'utf8'));
  const phases = Array.isArray(document.phases) ? document.phases : [];
  return phases.flatMap((phase) =>
    (Array.isArray(phase.tickets) ? phase.tickets : []).map((ticket) => ({ ...ticket, phaseId: phase.id })),
  );
}

const USAGE = [
  'Usage: node red-reconstruction.js --tickets=<Tickets.json> [--json]',
  '',
  'Lists the tickets the implementation loop must route down the isolated path,',
  'which are the ones carrying a counterexample_plan_id. It executes nothing:',
  'executing needs an agent session, and the loop supplies that.',
].join('\n');

/** The flags the command understands; an unrecognised one is an error, not a default. */
// [::TICKET::] P22-19 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-19 --for-spec --no-implementation-order`.
function parseArguments(argv) {
  const options = { ticketsPath: null, json: false, error: null };
  for (const argument of argv) {
    if (argument === '--json') {
      options.json = true;
    } else if (argument.startsWith('--tickets=')) {
      options.ticketsPath = argument.slice('--tickets='.length);
    } else if (argument === '--help' || argument === '-h') {
      options.error = USAGE;
    } else {
      options.error = `unrecognised argument: ${argument}\n\n${USAGE}`;
    }
  }
  if (options.error === null && (options.ticketsPath === null || options.ticketsPath.length === 0)) {
    options.error = `--tickets=<Tickets.json> is required\n\n${USAGE}`;
  }
  return options;
}

/** The dispatch view, as the Markdown a human reads and the JSON a script consumes. */
// [::TICKET::] P22-19 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-19 --for-spec --no-implementation-order`.
function renderDispatch(tickets) {
  const reconstruction = selectReconstructionTickets(tickets);
  const lines = ['## Red reconstruction — dispatch', ''];

  if (reconstruction.length === 0) {
    lines.push(
      `**No reconstruction ticket.** None of the ${tickets.length} ticket(s) in the ledger carries a `
      + 'counterexample_plan_id, so nothing will be routed down the isolated path. This is not a pass — '
      + 'it says only that this ledger holds no Red to rebuild.',
    );
    lines.push('');
    return lines.join('\n');
  }

  lines.push(
    `**${reconstruction.length} reconstruction ticket(s)** of ${tickets.length} must execute in an `
    + 'isolated worktree rather than in the working tree.',
  );
  lines.push('');
  lines.push('| Ticket | Plan | Title |');
  lines.push('| --- | --- | --- |');
  for (const ticket of reconstruction) {
    lines.push(`| ${describeTicket(ticket)} | \`${ticket[RECONSTRUCTION_PLAN_FIELD]}\` | ${ticket.title ?? '(untitled)'} |`);
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * The command the loop calls to see which tickets need the isolated path.
 *
 * Exit 0 whenever the answer was produced, 2 on a usage or read error. The exit
 * code is not a verdict about reconstruction: this command reports which
 * tickets exist, and nothing is executed here.
 */
export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.error !== null) {
    process.stderr.write(`${options.error}\n`);
    return 2;
  }

  let tickets;
  try {
    tickets = loadTickets(options.ticketsPath);
  } catch (error) {
    process.stderr.write(`could not read ${options.ticketsPath}: ${error.message}\n`);
    return 2;
  }

  process.stdout.write(
    options.json
      ? `${JSON.stringify({ reconstruction: selectReconstructionTickets(tickets), total: tickets.length }, null, 2)}\n`
      : renderDispatch(tickets),
  );
  return 0;
}

const invokedAsCommand =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedAsCommand) process.exit(main());
