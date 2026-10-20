#!/usr/bin/env node
/**
 * The regeneration transaction CLI.
 *
 * Usage:
 *   node .claude/scripts/regeneration/run.mjs open --spec=<candidate> --reason="..."
 *   node .claude/scripts/regeneration/run.mjs status
 *   node .claude/scripts/regeneration/run.mjs derive [--transaction=<id>]
 *   node .claude/scripts/regeneration/run.mjs verify [--transaction=<id>]
 *   node .claude/scripts/regeneration/run.mjs commit [--transaction=<id>]
 *   node .claude/scripts/regeneration/run.mjs abort [--transaction=<id>]
 *   node .claude/scripts/regeneration/run.mjs recover
 *
 * The current directory is the live workspace. The CLI never accepts a hash or a force
 * flag: the chain is computed here, and an invalid chain is refused rather than
 * overridden.
 */
import { cwd, exit } from 'node:process';

import { runCommand } from '../smooth-sequences/run.mjs';
import { commitGeneration, recoverCommit } from './lib/commit.mjs';
import { RegenerationError } from './lib/errors.mjs';
import { activeTransaction } from './lib/ledger.mjs';
import {
  abortTransaction,
  deriveGeneration,
  openTransaction,
  describeStatus,
  verifyGeneration,
} from './lib/transaction.mjs';

const USAGE = 'usage: run.mjs <open|status|derive|verify|commit|abort|recover> [--spec=] [--reason=] [--transaction=]';
const FORBIDDEN = new Set(['--force', '--hash', '--source-hash']);

/** A detector run over one workspace root. */
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
function detect({ root }) {
  const result = runCommand([root], { stdout: () => {}, stderr: () => {} });
  return {
    exitCode: result.exitCode,
    findings: result.report?.findings ?? [],
    withheld: result.report?.withheld ?? [],
  };
}

/** Parse the command line, refusing any force or hash argument. */
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
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

/** Run one command and print its outcome. */
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
function run(argv) {
  const root = cwd();
  const { command, options } = parseArguments(argv);
  if (command === 'open') {
    if (options.spec === undefined || options.reason === undefined) {
      throw new RegenerationError('open needs --spec and --reason', {
        code: 'MISSING_ARGUMENT',
        repair: USAGE,
      });
    }
    const opened = openTransaction({ root, candidateSpec: options.spec, reason: options.reason });
    process.stdout.write(`opened ${opened.transactionId}\nstaging: ${opened.stagingRoot}\nnext: derive\n`);
    return 0;
  }
  if (command === 'status') {
    const current = describeStatus(root);
    process.stdout.write(`state: ${current.state}\nnext: ${current.next}\n`);
    return current.state === 'judgment-required' ? 3 : 0;
  }
  if (command === 'derive') {
    const derived = deriveGeneration({ root, transactionId: transactionIdOf(root, options) });
    process.stdout.write(`state: ${derived.state}\n`);
    if (derived.next !== undefined) process.stdout.write(`next: ${derived.next}\n`);
    return derived.state === 'derive-failed' ? 1 : 0;
  }
  if (command === 'verify') {
    const verified = verifyGeneration({ root, transactionId: transactionIdOf(root, options), runDetector: detect });
    process.stdout.write(`state: ${verified.state}\n`);
    if (verified.reason !== undefined) process.stdout.write(`reason: ${verified.reason}\n`);
    return verified.state === 'verified' ? 0 : verified.state === 'judgment-required' ? 3 : 1;
  }
  if (command === 'commit') {
    const committed = commitGeneration({ root, transactionId: transactionIdOf(root, options), runDetector: detect });
    process.stdout.write(`state: ${committed.state}\narchive: ${committed.archiveRoot}\n`);
    return 0;
  }
  if (command === 'abort') {
    abortTransaction({ root, transactionId: transactionIdOf(root, options) });
    process.stdout.write('state: aborted\n');
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
    exit(error.code === 'FORBIDDEN_ARGUMENT' || error.code === 'UNKNOWN_ARGUMENT' ? 2 : 1);
  }
  process.stderr.write(`regeneration: ${error.message}\n`);
  exit(1);
}
