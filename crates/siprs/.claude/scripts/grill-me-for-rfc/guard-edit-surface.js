#!/usr/bin/env node
/**
 * guard-edit-surface.js <path> [--why] [--json]
 *
 * Decides whether a path may be written by `/grill-me-for-rfc`. The command generates
 * `RFC.md`, `DesignTree.json`, `CheckList.md` and `Status.json` anywhere in the
 * workspace; the stage-1 artifacts and the specification are hash-recorded inputs and
 * are never rewritten, in this directory or any other.
 *
 * The answer is default-deny. A name that matches no rule is refused, because the
 * allow-list is a list a human grows deliberately, never a guess this script makes.
 *
 * Exit 0 — the path is one this command generates.
 * Exit 1 — the path is a frozen input, matches no rule, or was not given.
 */
import { basename } from 'node:path';

/** The basenames this command generates, and may therefore correct anywhere. */
const GENERATED_BASENAMES = ['RFC.md', 'DesignTree.json', 'CheckList.md', 'Status.json'];

/** The basenames that are stage-1 inputs, matched by name at any depth. */
const FROZEN_BASENAMES = [
  'RFC-SEED.md',
  'INFO-RFC-SEED.md',
  'EXPLAIN-RFC-SEED.md',
  'WORKSPACIFY-ALLOCATE-MANIFEST.json',
  'WORKSPACIFY-TREE-MANIFEST.json',
];

/** The specification is versioned, so it is matched by pattern rather than by name. */
const SPECIFICATION_BASENAME_PATTERN = /^GaiaSekkeiShiyousho_v.*\.md$/;

/** Where a defect belonging to a frozen input is resolved instead. */
const OWNING_RFC_ALTERNATIVE = "resolve it in the owning RFC's output";

const UNKNOWN_RULE_DETAIL = 'unknown path; extend the allow-list deliberately';

const USAGE = 'usage: guard-edit-surface.js <path> [--why] [--json]';

/**
 * Classify one basename against the boundary.
 *
 * @param {string} name
 * @returns {{ allowed: boolean, rule: string, detail: string }}
 */
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.
function classifyBasename(name) {
  if (GENERATED_BASENAMES.includes(name)) {
    return { allowed: true, rule: 'generated', detail: 'a file this command generates' };
  }
  if (FROZEN_BASENAMES.includes(name) || SPECIFICATION_BASENAME_PATTERN.test(name)) {
    return { allowed: false, rule: 'frozen', detail: `a stage-1 input; ${OWNING_RFC_ALTERNATIVE}` };
  }
  return { allowed: false, rule: 'unknown', detail: UNKNOWN_RULE_DETAIL };
}

/**
 * @param {string[]} argv
 * @returns {{ target: string, why: boolean, json: boolean }}
 */
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.
function parseArgs(argv) {
  return {
    target: argv.find((arg) => !arg.startsWith('--')) ?? '',
    why: argv.includes('--why'),
    json: argv.includes('--json'),
  };
}

/**
 * @param {string[]} argv
 * @returns {number} the exit status
 */
export function run(argv) {
  const { target, why, json } = parseArgs(argv);

  if (target.length === 0) {
    process.stderr.write(`${USAGE}\n`);
    return 1;
  }

  const name = basename(target);
  const verdict = classifyBasename(name);

  if (json) {
    process.stdout.write(
      `${JSON.stringify({ path: target, basename: name, allowed: verdict.allowed, rule: verdict.rule })}\n`,
    );
  }

  if (why) {
    const unmatched = verdict.rule === 'unknown' ? ' (no rule matched)' : '';
    process.stdout.write(`rule: ${verdict.rule}${unmatched} — ${verdict.detail}\n`);
  }

  if (!verdict.allowed) {
    process.stderr.write(`refused: ${name} — ${verdict.detail}\n`);
    return 1;
  }

  return 0;
}

process.exit(run(process.argv.slice(2)));
