#!/usr/bin/env node
/**
 * Run the criterion when work leaves the workspace, and decide nothing about it.
 *
 * The criterion runs when something asks it to, and a tree that never runs the grill is never asked.
 * This hook is the asking: it reads the command a session is about to run and, when that command is
 * a git commit or a git push, evaluates the criterion over the working directory and prints what it
 * found. Any other command reaches no check, so a session that is reading, testing or searching pays
 * nothing for this being installed.
 *
 * It exits 0 on every path, including the ones where it cannot read its input. That is deliberate
 * and it is the whole reason this is a hook rather than a gate: a reporter that could fail would be
 * a second blocking point, and the blocking decision belongs to one place, the grill Step 8 gate,
 * where the run has already declared that it intends to establish the guarantee. A commit is not
 * that declaration, so a commit is told what stands and is not stopped by it.
 *
 * A Stop hook was the obvious alternative and is deliberately not used: that event fires at the end
 * of every turn, so wiring it there would add a full workspace scan to every turn in every project
 * the tooling is installed into.
 */
import path from 'node:path';

import { CRITERION_BOUNDARY } from '../sequences-slice/lib/distribution-criterion.mjs';
import { toHomeRelative } from '../lib/path-utils.js';

import { main as completenessMain } from './check-distribution-completeness.js';

const PREFIX = '[obligation-guard]';

/** This hook never blocks, on any path, including the ones where it cannot do its work. */
const EXIT_ADVISORY = 0;

/**
 * The command forms that move work out of the workspace.
 *
 * Anchored so that a command merely containing the words is not matched: `git log --grep commit`
 * and `echo "git push"` are reads and a message, and running a workspace scan for them would make
 * the hook cost something for commands that change nothing.
 */
const LEAVING_THE_WORKSPACE = /(?:^|[;&|]\s*)git\s+(?:commit|push)\b/;

/** The command a hook invocation is about, or null when the input does not carry one. */
// [::TICKET::] PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-263 --for-spec --no-implementation-order`.
export function commandOf(rawInput) {
  const parsed = JSON.parse(String(rawInput ?? ''));
  const command = parsed?.tool_input?.command;
  return typeof command === 'string' ? command : null;
}

/** One command's output and everything it printed, so a quiet verdict can be summarised. */
// [::TICKET::] PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-263 --for-spec --no-implementation-order`.
function captureOutput(run) {
  const written = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => {
    written.push(String(chunk));
    return true;
  };
  try {
    return { status: run(), output: written.join('') };
  } finally {
    process.stdout.write = originalWrite;
  }
}

/**
 * Print the criterion over the working directory when the command is one that leaves it.
 *
 * @param {string} rawInput — the tool input a PreToolUse hook receives on stdin
 * @param {string} [directory] — the workspace to measure, which is the session's own directory
 * @returns {number}
 */
// [::TICKET::] PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-263 --for-spec --no-implementation-order`.
export function main(rawInput, directory = process.cwd()) {
  let command;
  try {
    command = commandOf(rawInput);
  } catch (error) {
    process.stderr.write(`${PREFIX} could not read the tool input, so nothing was measured — ${error.message}\n`);
    return EXIT_ADVISORY;
  }
  if (command === null || !LEAVING_THE_WORKSPACE.test(command)) return EXIT_ADVISORY;

  const lines = [`obligation-guard: distribution state for ${toHomeRelative(directory)}`];
  try {
    const measured = captureOutput(() => completenessMain([directory]));
    const findings = measured.output.split('\n').filter((line) => line.trim().length > 0);
    lines.push(...(findings.length > 0 ? findings : ['the criterion reported nothing to print']));
    if (measured.status !== 0) lines.push(`short clauses: the criterion is not satisfied; ${CRITERION_BOUNDARY}`);
  } catch (error) {
    lines.push(`the criterion could not be evaluated — ${error.message}`);
  }
  lines.push(`${PREFIX} never blocks; the blocking decision belongs to the grill Step 8 gate`);
  // Written to stderr rather than stdout on purpose. A PreToolUse hook answers with an exit code,
  // and its stdout is read by the harness as a decision; free text there is a contract this hook
  // cannot verify and whose failure would land on every Bash call in every project the tooling is
  // installed into. Stderr is surfaced to the reader without being parsed, which is what an
  // advisory wants.
  process.stderr.write(`${lines.join('\n')}\n`);
  return EXIT_ADVISORY;
}

// A hook is spawned as a program with its input on stdin, so the entry point reads the stream.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const chunks = [];
  process.stdin.on('data', (chunk) => chunks.push(chunk));
  process.stdin.on('end', () => process.exit(main(chunks.join(''))));
  process.stdin.on('error', () => process.exit(EXIT_ADVISORY));
}

export { EXIT_ADVISORY, LEAVING_THE_WORKSPACE, PREFIX, captureOutput };
