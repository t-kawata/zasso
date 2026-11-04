#!/usr/bin/env node
/**
 * guard-edit-surface.js <path> [--why] [--json]
 *
 * Decides whether a path may be written by `/grill-me-for-rfc`. The command generates
 * `RFC.md`, `DesignTree.json`, `CheckList.md` and `Status.json` anywhere in the
 * workspace, and records its own judgments in the package obligation record; the stage-1
 * artifacts and the specification are hash-recorded inputs and are never rewritten, in
 * this directory or any other.
 *
 * The answer is default-deny. A name that matches no rule is refused, because the
 * allow-list is a list a human grows deliberately, never a guess this script makes.
 *
 * Exit 0 — the path is one this command generates.
 * Exit 1 — the path is a frozen input, matches no rule, or was not given.
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import { OBLIGATION_RECORD_BASENAME } from '../sequences-slice/lib/obligation.mjs';
import { SEED_FILENAME, parseSeedIdentity, resolveWorkspaceRoot } from '../spec-formula/identity.mjs';

/** The basenames this command generates, and may therefore correct anywhere. */
const GENERATED_BASENAMES = ['RFC.md', 'DesignTree.json', 'CheckList.md', 'Status.json'];

/**
 * The documents this command writes that belong to a package rather than to a session.
 *
 * The obligation record is where a run puts the judgments it had to make for itself: the demands
 * no relation reaches, each with the specification evidence it rests on. It is written rather than
 * generated, so it is not a document this command may correct — it is one it must be able to add
 * to. The name is read from the module that writes it, because two spellings of one filename is a
 * guard that can refuse the very file the run is about to write.
 */
const JUDGMENT_RECORD_BASENAMES = [OBLIGATION_RECORD_BASENAME];

/** The basenames that are stage-1 inputs, matched by name at any depth. */
const FROZEN_BASENAMES = [
// [::TICKET::] PX-256 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-256 --for-spec --no-implementation-order`.
  'RFC-SEED.md',
  'INFO-RFC-SEED.md',
  'EXPLAIN-RFC-SEED.md',
  'WORKSPACIFY-ALLOCATE-MANIFEST.json',
  'WORKSPACIFY-TREE-MANIFEST.json',
  // The projection /grill-me-for-rfc writes from the sequences artifact. Generated, not
  // authored, so the grill must not rewrite it: a rewritten view would carry the grill's
  // reading of the sequences rather than the artifact's, and nothing downstream could tell
  // the two apart. It is frozen for the same reason RFC-SEED.md is, and regenerable, so
  // refusing to edit it costs nothing.
  'SEQUENCES.md',
  'SEQUENCES.json',
];

/**
 * The legacy specification name, kept only for a workspace that has no readable seed.
 *
 * The authority is the seed's `source_spec.path`; this pattern is the fallback that
 * keeps an older workspace default-deny rather than newly permissive.
 */
const LEGACY_SPECIFICATION_BASENAME_PATTERN = /^GaiaSekkeiShiyousho_v.*\.md$/;

/** Where a defect belonging to a frozen input is resolved instead. */
const OWNING_RFC_ALTERNATIVE = "resolve it in the owning RFC's output";

const UNKNOWN_RULE_DETAIL = 'unknown path; extend the allow-list deliberately';

const USAGE = 'usage: guard-edit-surface.js <path> [--why] [--json]';

/** The nearest seed above a path, or null. */
// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function findSeedPath(startDirectory) {
  let directory = resolve(startDirectory);
  for (;;) {
    const candidate = join(directory, SEED_FILENAME);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

/** The specification the seed names, or null when no seed can be read. */
// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function resolveSeededSpecification(target, explicitSeed) {
  const seedPath = explicitSeed ?? findSeedPath(dirname(resolve(target)));
  if (seedPath === null || !existsSync(seedPath)) return null;

  try {
    const identity = parseSeedIdentity(readFileSync(seedPath, 'utf8'));
    const workspaceRoot = resolveWorkspaceRoot(seedPath);
    return {
      seedPath,
      path: identity.sourceSpec.path,
      resolved: workspaceRoot === null ? null : resolve(workspaceRoot, identity.sourceSpec.path),
    };
  } catch {
    return null;
  }
}

/**
 * Classify one path against the boundary.
 *
 * @param {string} target
 * @param {{path: string, resolved: string|null}|null} specification
 * @returns {{ allowed: boolean, rule: string, detail: string }}
 */
// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function classifyPath(target, specification) {
  const name = basename(target);
  if (GENERATED_BASENAMES.includes(name)) {
    return { allowed: true, rule: 'generated', detail: 'a file this command generates' };
  }
  if (JUDGMENT_RECORD_BASENAMES.includes(name)) {
    return { allowed: true, rule: 'record', detail: 'the package obligation record this run writes its judgments into' };
  }

  const resolvedTarget = resolve(target);
  const sealedBySeed = specification !== null
    && (name === basename(specification.path) || resolvedTarget === specification.resolved);
  if (FROZEN_BASENAMES.includes(name) || sealedBySeed || LEGACY_SPECIFICATION_BASENAME_PATTERN.test(name)) {
    return { allowed: false, rule: 'frozen', detail: `a stage-1 input; ${OWNING_RFC_ALTERNATIVE}` };
  }
  return { allowed: false, rule: 'unknown', detail: UNKNOWN_RULE_DETAIL };
}

/**
 * @param {string[]} argv
 * @returns {{ target: string, why: boolean, json: boolean, seed: string|null }}
 */
// [::TICKET::] PX-239, PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-239|PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function parseArgs(argv) {
  return {
    target: argv.find((arg) => !arg.startsWith('--')) ?? '',
    why: argv.includes('--why'),
    json: argv.includes('--json'),
    seed: argv.find((arg) => arg.startsWith('--seed='))?.slice('--seed='.length) ?? null,
  };
}

/**
 * @param {string[]} argv
 * @returns {number} the exit status
 */
export function run(argv) {
  const { target, why, json, seed } = parseArgs(argv);

  if (target.length === 0) {
    process.stderr.write(`${USAGE}\n`);
    return 1;
  }

  const name = basename(target);
  const specification = resolveSeededSpecification(target, seed);
  const verdict = classifyPath(target, specification);

  if (json) {
    process.stdout.write(
      `${JSON.stringify({ path: target, basename: name, allowed: verdict.allowed, rule: verdict.rule, seed: specification?.seedPath ?? null })}\n`,
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
