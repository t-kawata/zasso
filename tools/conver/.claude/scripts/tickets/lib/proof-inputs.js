'use strict';

/**
 * PX-441 — the inputs that determine one proof's outcome.
 *
 * A proof is a cacheable experiment, not a verdict about a clause. Reuse is
 * permitted only when the clause, the mutated source bytes, the mutation, the
 * mapped test, the runner command, the dependency closure, the proof engine,
 * the adapter and the toolchain are all identical. Every unknown input fails
 * closed.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const { TEXT_EXTENSIONS, compareText, walkFiles } = require('./adapters/helpers.js');

const PROOF_INPUTS_VERSION = 1;
const ENGINE_VERSION = 2;

/** The granularity a closure proves. Unknown never becomes file-level. */
const CLOSURE_SCOPE = Object.freeze({
  FILE: 'file',
  CRATE: 'crate',
  MODULE: 'module',
  PACKAGE: 'package',
});

const CLOSURE_SCOPES = new Set(Object.values(CLOSURE_SCOPE));

/** Harness artifacts never participate in the package source digest. */
const HARNESS_ARTIFACT_NAMES = new Set([
  'CONTRACT-INVENTORY.json',
  'CONTRACT-COVERAGE.json',
  'TEST-INDEX.json',
  'Tickets.json',
  '.conver-boundary.json',
  '.conver-find.lock',
]);

const HARNESS_ARTIFACT_PREFIXES = Object.freeze([
  'OMISSION-',
  'OMISSIONS-',
  'CONVER-',
  '_tmp-',
  '.conver-',
]);

const LOCKFILE_NAMES = Object.freeze([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'Cargo.lock',
  'go.sum',
  'Package.resolved',
]);

/** Whether a path belongs to the harness rather than the measured package. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function isHarnessArtifact(file) {
  const base = path.basename(String(file ?? ''));
  if (HARNESS_ARTIFACT_NAMES.has(base)) return true;
  if (base.startsWith('_tmp-') || base.startsWith('.conver-')) return true;
  const extension = path.extname(base).toLowerCase();
  const reportName = HARNESS_ARTIFACT_PREFIXES.slice(0, 3).some((prefix) => base.startsWith(prefix));
  return reportName && (extension === '.json' || extension === '.md');
}

const STABLE_PROOF_TARGET = 'STABLE_PROOF_TARGET';
const UNSTABLE_PROOF_TARGET = 'UNSTABLE_PROOF_TARGET';

/** Whether a mutation target can carry a reusable proof experiment. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function classifyMutationTarget({ file }) {
  return isHarnessArtifact(file) ? UNSTABLE_PROOF_TARGET : STABLE_PROOF_TARGET;
}

/** Whether a value is a non-empty string. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/** Sort object keys recursively so the digest is stable. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) sorted[key] = canonicalize(value[key]);
    return sorted;
  }
  return value;
}

/** The sha256 of a value, prefixed. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function sha256Of(value) {
  return 'sha256:' + createHash('sha256').update(String(value)).digest('hex');
}

/** The canonical digest of a complete input tuple. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function inputsDigestOf(inputs) {
  return sha256Of(JSON.stringify(canonicalize(inputs)));
}

/** The digest of the mutation instruction itself. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function mutationDigestOf(mutation) {
  return sha256Of(JSON.stringify(canonicalize(mutation)));
}

/** The digest of a file, or null when it cannot be read. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function fileDigestOf({ cwd, file }) {
  try {
    return sha256Of(fs.readFileSync(path.resolve(cwd, file), 'utf8'));
  } catch {
    return null;
  }
}

/** The digest of a resolved file set. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function closureDigestOf({ cwd, files }) {
  const lines = [...new Set(files ?? [])]
    .sort(compareText)
    .map((file) => file + ':' + (fileDigestOf({ cwd, file }) ?? 'missing'));
  return sha256Of(lines.join('\n'));
}

/** The textual files that constitute the measured package. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function packageSourceFiles({ cwd, adapter }) {
  const extensions = Array.isArray(adapter?.extensions) && adapter.extensions.length > 0
    ? adapter.extensions
    : [...TEXT_EXTENSIONS];
  return walkFiles({ cwd, roots: ['.'], extensions })
    .filter((file) => !isHarnessArtifact(file));
}

/** Fall back to a package-wide closure, or fail closed when the package is unreadable. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function packageFallback({ cwd, adapter, finding }) {
  const files = packageSourceFiles({ cwd, adapter });
  if (files.length === 0) {
    return {
      ok: false,
      code: 'PROOF_INPUTS_UNKNOWN',
      scope: CLOSURE_SCOPE.PACKAGE,
      files: [],
      findings: [finding ?? { code: 'CLOSURE_FALLBACK_PACKAGE', problem: 'no package source file is readable' }],
    };
  }
  return {
    ok: true,
    scope: CLOSURE_SCOPE.PACKAGE,
    files: files.sort(compareText),
    findings: [finding ?? { code: 'CLOSURE_FALLBACK_PACKAGE', problem: 'adapter has no dependency closure' }],
  };
}

/**
 * Resolve the dependency closure of the mutation target and the mapped test.
 *
 * The adapter may declare a precise closure. An absent, throwing or invalid
 * declaration is package-scoped, never file-scoped.
 */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function resolveDependencyClosure({ cwd, mutationFile, testFile, adapter }) {
  const seeds = [mutationFile, testFile].filter(isNonEmptyString);
  if (typeof adapter?.dependencyClosure !== 'function') return packageFallback({ cwd, adapter });

  let declared;
  try {
    declared = adapter.dependencyClosure({ cwd, files: seeds });
  } catch (error) {
    return packageFallback({
      cwd,
      adapter,
      finding: { code: 'CLOSURE_INVALID', problem: 'dependency closure failed: ' + error.message },
    });
  }

  const valid = declared !== null
    && typeof declared === 'object'
    && CLOSURE_SCOPES.has(declared.scope)
    && Array.isArray(declared.files)
    && declared.files.length > 0
    && declared.files.every(isNonEmptyString);
  if (!valid) {
    return packageFallback({
      cwd,
      adapter,
      finding: { code: 'CLOSURE_INVALID', problem: 'dependency closure must return a known scope and a non-empty file list' },
    });
  }

  const unreadable = declared.files.filter((file) => fileDigestOf({ cwd, file }) === null);
  if (unreadable.length > 0) {
    return packageFallback({
      cwd,
      adapter,
      finding: { code: 'CLOSURE_INVALID', problem: 'declared closure file is unreadable', files: unreadable.sort(compareText) },
    });
  }

  return {
    ok: true,
    scope: declared.scope,
    files: [...new Set(declared.files)].sort(compareText),
    findings: [],
  };
}

/** The toolchain fingerprint that makes a proof invalid after a runtime or dependency change. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function toolchainFingerprint({ cwd, adapter }) {
  const lockfile = LOCKFILE_NAMES.find((name) => fs.existsSync(path.join(cwd, name))) ?? null;
  return sha256Of(JSON.stringify(canonicalize({
    runtime: process.versions.node,
    language: adapter?.language ?? null,
    runner: adapter?.runner ?? null,
    lockfile,
    lockfileDigest: lockfile === null ? null : fileDigestOf({ cwd, file: lockfile }),
  })));
}

/** The mapped test record for one coverage entry. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function mappedTestOf({ coverageEntry, testEntry }) {
  if (testEntry !== null && testEntry !== undefined) return testEntry;
  const tests = Array.isArray(coverageEntry?.tests) ? coverageEntry.tests : [];
  return tests.find((test) => test.ignored !== true) ?? tests[0] ?? null;
}

/** The mutation a proof uses, from an explicit plan or an earlier proof. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function mutationOf({ coverageEntry, mutation }) {
  if (mutation !== null && mutation !== undefined) return mutation;
  return coverageEntry?.proof?.mutation ?? coverageEntry?.mutation ?? null;
}

/**
 * Compute the complete input tuple for one clause.
 *
 * @param {{cwd:string, clauseKey:string, coverageEntry?:object|null, testEntry?:object|null, mutation?:object|null, commandTemplate?:string|null, adapter?:object|null}} input
 * @returns {{ok:boolean, inputs?:object, inputsDigest?:string, findings?:object[], code?:string, field?:string}}
 */
// [::TICKET::] PX-441, PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-441|PX-442) --for-spec --no-implementation-order`.
function computeProofInputs({ cwd, clauseKey, coverageEntry = null, testEntry = null, mutation = null, commandTemplate = null, adapter = null }) {
  const resolvedMutation = mutationOf({ coverageEntry, mutation });
  if (!isNonEmptyString(resolvedMutation?.file) || !isNonEmptyString(resolvedMutation?.find)) {
    return { ok: false, code: 'PROOF_INPUT_MISSING', field: 'mutation' };
  }

  const mutationFileDigest = fileDigestOf({ cwd, file: resolvedMutation.file });
  if (mutationFileDigest === null) {
    return { ok: false, code: 'PROOF_INPUT_MISSING', field: 'mutationFile' };
  }

  const resolvedTest = mappedTestOf({ coverageEntry, testEntry });
  if (!isNonEmptyString(resolvedTest?.id) || !isNonEmptyString(resolvedTest?.digest)) {
    return { ok: false, code: 'PROOF_INPUT_MISSING', field: 'test' };
  }

  const template = commandTemplate ?? adapter?.runner ?? coverageEntry?.proof?.command ?? null;
  if (!isNonEmptyString(template)) {
    return { ok: false, code: 'PROOF_INPUT_MISSING', field: 'command' };
  }
  const resolvedCommand = template.includes('{test}') ? template.replace('{test}', resolvedTest.id) : template;

  let closure;
  try {
    closure = resolveDependencyClosure({
      cwd,
      mutationFile: resolvedMutation.file,
      testFile: isNonEmptyString(resolvedTest.file) ? resolvedTest.file : null,
      adapter,
    });
  } catch (error) {
    return {
      ok: false,
      code: 'PROOF_INPUTS_UNKNOWN',
      field: 'closure',
      findings: [{ code: 'CLOSURE_INVALID', problem: 'closure resolution failed: ' + error.message }],
    };
  }
  if (!closure.ok) {
    return { ok: false, code: closure.code ?? 'PROOF_INPUTS_UNKNOWN', field: 'closure', findings: closure.findings };
  }

  const inputs = {
    version: PROOF_INPUTS_VERSION,
    clauseKey,
    mutationFile: resolvedMutation.file,
    mutationFileDigest,
    mutationDigest: mutationDigestOf(resolvedMutation),
    testId: resolvedTest.id,
    testDigest: resolvedTest.digest,
    commandTemplate: template,
    commandDigest: sha256Of(resolvedCommand),
    closureScope: closure.scope,
    closureDigest: closureDigestOf({ cwd, files: closure.files }),
    engineVersion: ENGINE_VERSION,
    adapterVersion: adapter?.version ?? 1,
    toolchainDigest: toolchainFingerprint({ cwd, adapter }),
  };

  return {
    ok: true,
    inputs,
    inputsDigest: inputsDigestOf(inputs),
    closureFiles: closure.files,
    findings: closure.findings,
  };
}

/** The first reason a proof is not reusable, or null when it is fresh. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function invalidationReasonOf({ proof, inputs, inputsOk }) {
  if (inputsOk === false || inputs === null || inputs === undefined) return 'unknown';
  if (proof === null || proof === undefined || typeof proof !== 'object') return 'missing';
  if (proof.status !== 'PROVEN') return 'failed';
  if (proof.restored !== true) return 'restore';
  if (!Number.isInteger(proof.inputsVersion) || proof.inputsVersion !== inputs.version) return 'engine';
  if (!isNonEmptyString(proof.inputsDigest)) return 'legacy';
  if (proof.digests?.source !== inputs.mutationFileDigest) return 'source';
  if (proof.digests?.test !== inputs.testDigest) return 'test';
  if (proof.digests?.command !== inputs.commandDigest) return 'command';
  if (proof.closureScope !== inputs.closureScope) return 'closure';
  if (proof.inputsDigest === inputsDigestOf(inputs)) return null;

  const recorded = proof.inputs ?? {};
  if (recorded.clauseKey !== inputs.clauseKey) return 'clause';
  if (recorded.mutationDigest !== inputs.mutationDigest) return 'source';
  if (recorded.closureDigest !== inputs.closureDigest) return 'closure';
  if (recorded.engineVersion !== inputs.engineVersion) return 'engine';
  if (recorded.adapterVersion !== inputs.adapterVersion) return 'adapter';
  if (recorded.toolchainDigest !== inputs.toolchainDigest) return 'toolchain';
  return 'unknown';
}

module.exports = {
  CLOSURE_SCOPE,
  ENGINE_VERSION,
  HARNESS_ARTIFACT_NAMES,
  LOCKFILE_NAMES,
  PROOF_INPUTS_VERSION,
  STABLE_PROOF_TARGET,
  UNSTABLE_PROOF_TARGET,
  canonicalize,
  classifyMutationTarget,
  closureDigestOf,
  computeProofInputs,
  fileDigestOf,
  inputsDigestOf,
  invalidationReasonOf,
  isHarnessArtifact,
  mutationDigestOf,
  packageSourceFiles,
  resolveDependencyClosure,
  sha256Of,
  toolchainFingerprint,
};
