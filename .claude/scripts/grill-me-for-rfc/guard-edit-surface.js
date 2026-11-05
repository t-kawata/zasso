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
import { basename, dirname, join, resolve, sep } from 'node:path';

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

const USAGE = 'usage: guard-edit-surface.js <path> [--why] [--json] [--package=<dir>] [--allow-cross-package=<evidence.json>]';

/** The refusal codes a cross-package write can produce. */
const CROSS_PACKAGE_CODES = Object.freeze({
  EVIDENCE_MISSING: 'CROSS_PACKAGE_EVIDENCE_MISSING',
  EVIDENCE_INVALID: 'CROSS_PACKAGE_EVIDENCE_INVALID',
  PACKAGE_MISSING: 'CROSS_PACKAGE_PACKAGE_MISSING',
  PACKAGE_REQUIRED: 'CROSS_PACKAGE_PACKAGE_REQUIRED',
  GATE_FAILED: 'CROSS_PACKAGE_GATE_FAILED',
  GATE_UNKNOWN: 'CROSS_PACKAGE_GATE_UNKNOWN',
});

/**
 * The verdicts a cross-package edit must present.
 *
 * The edit changes a Rust surface another package carries. The API gate is the
 * program that reads that surface; evidence that names no verdict from it is a
 * record of some other run, not proof that this edit is safe.
 */
const REQUIRED_CROSS_PACKAGE_GATES = Object.freeze(['verify-api-consistency']);

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

/** Whether a resolved path is the directory or below it. */
// [::TICKET::] PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-369 --for-spec --no-implementation-order`.
function isInside(targetPath, parentPath) {
  const resolvedTarget = resolve(targetPath);
  const resolvedParent = resolve(parentPath);
  return resolvedTarget === resolvedParent || resolvedTarget.startsWith(`${resolvedParent}${sep}`);
}

/**
 * The evidence that authorizes one cross-package generated write.
 *
 * A gate that edits a neighbour must show that the neighbour's own gates ran. The file is
 * validated rather than trusted: a missing, malformed or short evidence file refuses by
 * name, and one failed gate refuses the write it names.
 *
 * @param {string|null} evidencePath
 * @param {string} target
 * @returns {{ ok: boolean, rule: string, detail: string }}
 */
// [::TICKET::] PX-369, PX-371 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-369|PX-371) --for-spec --no-implementation-order`.
function readCrossPackageEvidence(evidencePath, target) {
  if (evidencePath === null) {
    return {
      ok: false,
      rule: CROSS_PACKAGE_CODES.EVIDENCE_MISSING,
      detail: 'a generated file outside the invocation package needs --allow-cross-package with per-package gate evidence',
    };
  }

  let evidence;
  try {
    evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
  } catch {
    return {
      ok: false,
      rule: CROSS_PACKAGE_CODES.EVIDENCE_INVALID,
      detail: `the evidence file ${evidencePath} is missing or not JSON`,
    };
  }

  if (typeof evidence?.generatedAt !== 'string' || !Array.isArray(evidence?.editedPackages) || evidence.editedPackages.length === 0) {
    return {
      ok: false,
      rule: CROSS_PACKAGE_CODES.EVIDENCE_INVALID,
      detail: 'the evidence file must carry generatedAt and a non-empty editedPackages list',
    };
  }

  const owner = evidence.editedPackages.find((entry) => typeof entry?.package === 'string'
    && entry.package.length > 0
    && isInside(target, entry.package));
  if (owner === undefined) {
    return {
      ok: false,
      rule: CROSS_PACKAGE_CODES.PACKAGE_MISSING,
      detail: `no edited package in the evidence contains ${target}`,
    };
  }

  if (!Array.isArray(owner.gates) || owner.gates.length === 0) {
    return {
      ok: false,
      rule: CROSS_PACKAGE_CODES.EVIDENCE_INVALID,
      detail: `the evidence for ${owner.package} names no gate`,
    };
  }

  const failed = owner.gates.find((gate) => !Number.isInteger(gate?.exitCode) || gate.exitCode !== 0);
  if (failed !== undefined) {
    return {
      ok: false,
      rule: CROSS_PACKAGE_CODES.GATE_FAILED,
      detail: `${failed?.name ?? 'a gate'} exited ${failed?.exitCode} for ${owner.package}`,
    };
  }

  const missing = REQUIRED_CROSS_PACKAGE_GATES.filter(
    (name) => !owner.gates.some((gate) => gate?.name === name),
  );
  if (missing.length > 0) {
    return {
      ok: false,
      rule: CROSS_PACKAGE_CODES.GATE_UNKNOWN,
      detail: `the evidence for ${owner.package} names no ${missing.join(', ')} verdict`,
    };
  }

  return {
    ok: true,
    rule: 'cross-package',
    detail: `${owner.package} gates all exited zero`,
  };
}

/**
 * Classify one path against the boundary.
 *
 * @param {string} target
 * @param {{path: string, resolved: string|null}|null} specification
 * @param {{packageDir: string|null, evidencePath: string|null}} write
 * @returns {{ allowed: boolean, rule: string, detail: string }}
 */
// [::TICKET::] PX-359, PX-360, PX-361, PX-369, PX-371 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361|PX-369|PX-371) --for-spec --no-implementation-order`.
function classifyPath(target, specification, write = { packageDir: null, evidencePath: null }) {
  const name = basename(target);
  const generated = GENERATED_BASENAMES.includes(name);
  const record = JUDGMENT_RECORD_BASENAMES.includes(name);
  if (generated || record) {
    // Without --package there is no boundary to compare against. Falling back to
    // the process cwd made the same target local or foreign depending on where the
    // caller happened to stand, which is the opposite of a default-deny boundary.
    if (write.packageDir === null) {
      return {
        allowed: false,
        rule: CROSS_PACKAGE_CODES.PACKAGE_REQUIRED,
        detail: 'a generated file needs --package naming the invocation package',
      };
    }
    if (isInside(target, write.packageDir)) {
      return generated
        ? { allowed: true, rule: 'generated', detail: 'a file this command generates in its own package' }
        : { allowed: true, rule: 'record', detail: 'the package obligation record this run writes its judgments into' };
    }
    const evidence = readCrossPackageEvidence(write.evidencePath, target);
    return { allowed: evidence.ok, rule: evidence.rule, detail: evidence.detail };
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
// [::TICKET::] PX-239, PX-359, PX-360, PX-361, PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-239|PX-359|PX-360|PX-361|PX-369) --for-spec --no-implementation-order`.
function parseArgs(argv) {
  return {
    target: argv.find((arg) => !arg.startsWith('--')) ?? '',
    why: argv.includes('--why'),
    json: argv.includes('--json'),
    seed: argv.find((arg) => arg.startsWith('--seed='))?.slice('--seed='.length) ?? null,
    package: argv.find((arg) => arg.startsWith('--package='))?.slice('--package='.length) ?? null,
    allowCrossPackage: argv.find((arg) => arg.startsWith('--allow-cross-package='))?.slice('--allow-cross-package='.length) ?? null,
  };
}

/**
 * @param {string[]} argv
 * @returns {number} the exit status
 */
export function run(argv) {
  const { target, why, json, seed, package: packageArgument, allowCrossPackage } = parseArgs(argv);

  if (target.length === 0) {
    process.stderr.write(`${USAGE}\n`);
    return 1;
  }

  const name = basename(target);
  const specification = resolveSeededSpecification(target, seed);
  const verdict = classifyPath(target, specification, {
    packageDir: packageArgument === null ? null : resolve(packageArgument),
    evidencePath: allowCrossPackage,
  });

  if (json) {
    process.stdout.write(
      `${JSON.stringify({
        path: target,
        basename: name,
        allowed: verdict.allowed,
        rule: verdict.rule,
        seed: specification?.seedPath ?? null,
        evidence: allowCrossPackage,
      })}\n`,
    );
  }

  if (why) {
    const unmatched = verdict.rule === 'unknown' ? ' (no rule matched)' : '';
    process.stdout.write(`rule: ${verdict.rule}${unmatched} — ${verdict.detail}\n`);
  }

  if (!verdict.allowed) {
    process.stderr.write(`refused: ${name} — ${verdict.rule}: ${verdict.detail}\n`);
    return 1;
  }

  return 0;
}

process.exit(run(process.argv.slice(2)));
