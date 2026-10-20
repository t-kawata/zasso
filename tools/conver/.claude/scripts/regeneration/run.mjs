#!/usr/bin/env node
/**
 * The regeneration transaction CLI.
 *
 * Usage:
 *   node .claude/scripts/regeneration/run.mjs open --spec=<candidate> --reason="..."
 *   node .claude/scripts/regeneration/run.mjs open --allocate-decisions=<candidate> --reason="..."
 *   node .claude/scripts/regeneration/run.mjs open --tree-decisions=<candidate> --reason="..."
 *   node .claude/scripts/regeneration/run.mjs status
 *   node .claude/scripts/regeneration/run.mjs derive [--transaction=<id>]
 *   node .claude/scripts/regeneration/run.mjs verify [--transaction=<id>]
 *   node .claude/scripts/regeneration/run.mjs commit [--transaction=<id>]
 *   node .claude/scripts/regeneration/run.mjs abort [--transaction=<id>]
 *   node .claude/scripts/regeneration/run.mjs recover
 *
 * The current directory is the live workspace. The CLI never accepts a hash or a force
 * flag: the chain is computed here, and an invalid chain is refused rather than
 * overridden. Output names the exact command a reader runs next.
 */
import { cwd, exit } from 'node:process';

import { runCommand } from '../smooth-sequences/run.mjs';
import { commitGeneration, recoverCommit } from './lib/commit.mjs';
import { RegenerationError } from './lib/errors.mjs';
import { STATES, activeTransaction } from './lib/ledger.mjs';
import {
  abortTransaction,
  deriveGeneration,
  openTransaction,
  describeStatus,
  verifyGeneration,
} from './lib/transaction.mjs';

const USAGE = 'usage: run.mjs <open|status|derive|verify|commit|abort|recover> [--spec=] [--allocate-decisions=] [--tree-decisions=] [--reason=] [--transaction=]';
const FORBIDDEN = new Set(['--force', '--hash', '--source-hash']);
const NEXT_OPEN = 'node .claude/scripts/regeneration/run.mjs open';
const NEXT_DERIVE = 'node .claude/scripts/regeneration/run.mjs derive';
const NEXT_VERIFY = 'node .claude/scripts/regeneration/run.mjs verify';
const NEXT_COMMIT = 'node .claude/scripts/regeneration/run.mjs commit';
const NEXT_ABORT_OPEN = 'node .claude/scripts/regeneration/run.mjs abort, fix the candidate, then open a new transaction';

/** A value a one-line console report can carry. */
// [::TICKET::] PX-279 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-279 --for-spec --no-implementation-order`.
function display(value) {
  if (value === null || value === undefined) return 'none';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** A detector run over one workspace root. */
// [::TICKET::] PX-278, PX-279 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-278|PX-279) --for-spec --no-implementation-order`.
function detect({ root, allowTransaction }) {
  const result = runCommand([root], { stdout: () => {}, stderr: () => {}, allowTransaction });
  return {
    exitCode: result.exitCode,
    findings: result.report?.findings ?? [],
    withheld: result.report?.withheld ?? [],
  };
}

/** Parse the command line, refusing any force or hash argument. */
// [::TICKET::] PX-278, PX-279 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-278|PX-279) --for-spec --no-implementation-order`.
function parseArguments(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (const arg of rest) {
    const name = arg.split('=')[0];
    if (FORBIDDEN.has(name)) {
      throw new RegenerationError(`unknown argument: ${arg}`, {
        code: 'FORBIDDEN_ARGUMENT',
        repair: 'The chain is computed by the transaction; force and hash arguments are not accepted.',
      });
    }
    if (arg.startsWith('--spec=')) options.spec = arg.slice('--spec='.length);
    else if (arg.startsWith('--allocate-decisions=')) options.allocateDecisions = arg.slice('--allocate-decisions='.length);
    else if (arg.startsWith('--tree-decisions=')) options.treeDecisions = arg.slice('--tree-decisions='.length);
    else if (arg.startsWith('--reason=')) options.reason = arg.slice('--reason='.length);
    else if (arg.startsWith('--transaction=')) options.transaction = arg.slice('--transaction='.length);
    else if (arg.startsWith('--')) {
      throw new RegenerationError(`unknown argument: ${arg}`, {
        code: 'UNKNOWN_ARGUMENT',
        repair: USAGE,
      });
    }
  }
  return { command, options };
}

/** The transaction the command names, or the active one. */
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
function transactionIdOf(root, options) {
  if (options.transaction !== undefined) return options.transaction;
  const active = activeTransaction(root);
  if (active === null) {
    throw new RegenerationError('no transaction is active', {
      code: 'NO_ACTIVE_TRANSACTION',
      repair: 'Open a transaction or pass --transaction=<id>.',
    });
  }
  return active.id;
}

/** Print the identity and next command of one transaction. */
// [::TICKET::] PX-279 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-279 --for-spec --no-implementation-order`.
function printTransaction(entry, current) {
  process.stdout.write(`id: ${entry.id}\n`);
  process.stdout.write(`state: ${entry.state}\n`);
  process.stdout.write(`staging: ${display(entry.stagingRoot)}\n`);
  process.stdout.write(`spec: ${display(current.stagingSpecPath)}\n`);
  process.stdout.write(`candidate-spec: ${display(entry.candidateSpec)}\n`);
  process.stdout.write(`candidate-allocate-decisions: ${display(entry.candidateAllocateDecisions)}\n`);
  process.stdout.write(`candidate-tree-decisions: ${display(entry.candidateTreeDecisions)}\n`);
  process.stdout.write(`next: ${current.next}\n`);
}

/** Print the unverified chain links and detector findings. */
// [::TICKET::] PX-279 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-279 --for-spec --no-implementation-order`.
function printUnverified(receipt) {
  for (const link of receipt?.chain?.links ?? []) {
    if (!link.ok) process.stdout.write(`link: ${link.link} ${link.code} expected=${display(link.expected)} actual=${display(link.actual)}\n`);
  }
  for (const finding of receipt?.detector?.findings ?? []) {
    process.stdout.write(`finding: ${finding.checkId} ${display(finding.subject)} — ${display(finding.fix)}\n`);
  }
  process.stdout.write(`next: ${NEXT_DERIVE}\n`);
}

/** Run one command and print its outcome. */
// [::TICKET::] PX-278, PX-279 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-278|PX-279) --for-spec --no-implementation-order`.
function run(argv) {
  const root = cwd();
  const { command, options } = parseArguments(argv);
  if (command === 'open') {
    if (options.reason === undefined || (options.spec === undefined && options.allocateDecisions === undefined && options.treeDecisions === undefined)) {
      throw new RegenerationError('open needs --reason and at least one candidate', {
        code: 'MISSING_ARGUMENT',
        repair: USAGE,
      });
    }
    const opened = openTransaction({
      root,
      candidateSpec: options.spec,
      candidateAllocateDecisions: options.allocateDecisions,
      candidateTreeDecisions: options.treeDecisions,
      reason: options.reason,
    });
    process.stdout.write(`opened ${opened.transactionId}\n`);
    process.stdout.write(`staging: ${opened.stagingRoot}\n`);
    process.stdout.write(`spec: ${opened.stagingSpecPath}\n`);
    process.stdout.write(`next: ${NEXT_DERIVE}\n`);
    return 0;
  }
  if (command === 'status') {
    const current = describeStatus(root);
    if (current.transaction === null) {
      process.stdout.write('state: none\n');
      process.stdout.write(`next: ${NEXT_OPEN}\n`);
      return 0;
    }
    printTransaction(current.transaction, current);
    return current.state === STATES.JUDGMENT_REQUIRED ? 3 : 0;
  }
  if (command === 'derive') {
    const derived = deriveGeneration({ root, transactionId: transactionIdOf(root, options) });
    process.stdout.write(`state: ${derived.state}\n`);
    if (derived.state === 'educe-pending') {
      process.stdout.write(`spec: ${display(derived.stagingSpecPath)}\n`);
      process.stdout.write(`next: ${display(derived.next)}\n`);
      return 0;
    }
    if (derived.state === STATES.DERIVE_FAILED) {
      process.stdout.write(`failed: ${display(derived.failedStep)}\n`);
      process.stdout.write(`stderr: ${(derived.stderr ?? derived.error ?? '').trim()}\n`);
      process.stdout.write(`next: ${NEXT_ABORT_OPEN}\n`);
      return 1;
    }
    process.stdout.write(`next: ${NEXT_VERIFY}\n`);
    return 0;
  }
  if (command === 'verify') {
    const verified = verifyGeneration({ root, transactionId: transactionIdOf(root, options), runDetector: detect });
    process.stdout.write(`state: ${verified.state}\n`);
    if (verified.state === 'unverified') {
      printUnverified(verified.receipt);
      return 1;
    }
    if (verified.state === STATES.JUDGMENT_REQUIRED) {
      process.stdout.write(`reason: ${display(verified.reason)}\n`);
      process.stdout.write(`next: fix the named ground in staging, then ${NEXT_VERIFY}\n`);
      return 3;
    }
    process.stdout.write(`next: ${NEXT_COMMIT}\n`);
    return 0;
  }
  if (command === 'commit') {
    const transactionId = transactionIdOf(root, options);
    const committed = commitGeneration({
      root,
      transactionId,
      runDetector: ({ root: target }) => detect({ root: target, allowTransaction: transactionId }),
    });
    process.stdout.write(`state: ${committed.state}\n`);
    process.stdout.write(`archive: ${committed.archiveRoot}\n`);
    process.stdout.write('next: node .claude/scripts/smooth-sequences/run.mjs\n');
    return 0;
  }
  if (command === 'abort') {
    abortTransaction({ root, transactionId: transactionIdOf(root, options) });
    process.stdout.write('state: aborted\n');
    process.stdout.write(`next: ${NEXT_OPEN}\n`);
    return 0;
  }
  if (command === 'recover') {
    const recovered = recoverCommit(root);
    process.stdout.write(`state: ${recovered.state}\n`);
    return 0;
  }
  process.stderr.write(`${USAGE}\n`);
  return 2;
}

try {
  exit(run(process.argv.slice(2)));
} catch (error) {
  if (error instanceof RegenerationError) {
    process.stderr.write(`regeneration: ${error.code}: ${error.message}${error.repair ? ` — ${error.repair}` : ''}\n`);
    exit(error.code === 'FORBIDDEN_ARGUMENT' || error.code === 'UNKNOWN_ARGUMENT' || error.code === 'MISSING_ARGUMENT' ? 2 : 1);
  }
  process.stderr.write(`regeneration: ${error.message}\n`);
  exit(1);
}
