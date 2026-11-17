'use strict';

/**
 * PX-436 — coverage map and remainder arithmetic.
 *
 * A clause is PROVEN only when a non-ignored test is mapped and its proof is
 * fresh and observed failing. Keyword and annotation matches are candidates;
 * they never produce a verdict by themselves.
 */

const { createHash } = require('node:crypto');

const { inputsDigestOf } = require('./proof-inputs.js');

const INVENTORY_DIGEST_MISMATCH = 'INVENTORY_DIGEST_MISMATCH';

/** The statuses a valid disposition may carry. */
const PROVEN = 'PROVEN';
const NOT_APPLICABLE_VERIFIED = 'NOT_APPLICABLE_VERIFIED';
const DESIGN_PREDICATE_VERIFIED = 'DESIGN_PREDICATE_VERIFIED';
const PROCESS_VERIFIED = 'PROCESS_VERIFIED';
const EXTERNAL_VERIFIED = 'EXTERNAL_VERIFIED';
const DEFERRED = 'DEFERRED';
const DEFERRED_EXPIRED = 'DEFERRED_EXPIRED';
const CLAUSE_DISPOSITION_UNVERIFIED = 'CLAUSE_DISPOSITION_UNVERIFIED';
const TESTABLE = 'TESTABLE';

/** The applicability names that require a verified disposition. */
const VERIFIABLE_APPLICABILITY = new Set(['DESIGN_PREDICATE', 'PROCESS', 'EXTERNAL', 'NOT_APPLICABLE', 'DEFERRED']);

/** Whether a value is a non-empty string. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/** The exact annotation that names one canonical clause. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function exactAnnotation(clauseKey) {
  return 'verifies:' + clauseKey;
}

/** The clause-level annotation an adapter may write. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function clauseLevelAnnotations(clause) {
  const element = clause.ordinal === null || clause.ordinal === undefined
    ? clause.element
    : clause.element + '#' + String(clause.ordinal);
  return [
    'verifies:' + clause.contractId + '/' + element,
    'verifies:' + clause.contractId + '/' + element + '#' + String(clause.ordinal ?? ''),
  ];
}

/** A finding anchored on one clause. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function clauseFinding(clause, code, problem) {
  return {
    stableKey: clause.key,
    surface: 'contract-clause',
    assetId: clause.key,
    code,
    class: 'must-fix',
    problem,
  };
}

/**
 * Resolve the tests mapped to one clause.
 *
 * An explicit coverage entry wins; otherwise annotations on the indexed tests
 * are the candidate mapping. A contract-level annotation covers no clause.
 */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function resolveMappedTests({ clause, testIndex, coverageEntry }) {
  if (Array.isArray(coverageEntry?.tests)) {
    const byId = new Map((testIndex?.tests ?? []).map((entry) => [entry.id, entry]));
    return coverageEntry.tests.map((entry) => {
      const test = byId.get(entry.id);
      return test === undefined ? { id: entry.id, missing: true } : { ...test, missing: false };
    });
  }

  const exact = exactAnnotation(clause.key);
  const clauseLevel = clauseLevelAnnotations(clause);
  return (testIndex?.tests ?? [])
    .filter((test) => (test.annotations ?? []).some((annotation) => annotation === exact || clauseLevel.includes(annotation)))
    .map((test) => ({ ...test, missing: false }));
}

/**
 * Whether a proof is fresh against the complete experiment inputs.
 *
 * A missing input is unknown, and unknown is never reusable. The proof must
 * have been produced by the same engine and must have restored the source.
 */
// [::TICKET::] PX-436, PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-436|PX-441) --for-spec --no-implementation-order`.
function isProofFresh({ proof, inputs }) {
  if (proof === null || typeof proof !== 'object') return false;
  if (proof.status !== PROVEN) return false;
  if (!isNonEmptyString(proof.verifiedAt)) return false;
  if (proof.restored !== true) return false;
  if (inputs === null || inputs === undefined || typeof inputs !== 'object') return false;
  if (!Number.isInteger(proof.inputsVersion) || proof.inputsVersion !== inputs.version) return false;
  if (!isNonEmptyString(proof.inputsDigest) || proof.inputsDigest !== inputsDigestOf(inputs)) return false;
  if (proof.digests === null || typeof proof.digests !== 'object') return false;
  if (proof.digests.source !== inputs.mutationFileDigest) return false;
  if (proof.digests.test !== inputs.testDigest) return false;
  if (proof.digests.command !== inputs.commandDigest) return false;
  if (proof.closureScope !== inputs.closureScope) return false;
  return true;
}

/**
 * Resolve a validated non-testable disposition.
 *
 * TESTABLE returns null so the ordinary mapping and proof path stays in
 * charge; every other status is already validated by lib/dispositions.js.
 */
// [::TICKET::] PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-440 --for-spec --no-implementation-order`.
function resolveVerifiedDisposition({ clause, disposition, base, now }) {
  if (disposition.status === TESTABLE) return null;
  if (disposition.status === DEFERRED) {
    const expiresAt = disposition.expiresAt;
    if (typeof expiresAt === 'string' && new Date(expiresAt).getTime() > now.getTime()) {
      return { ...base, status: DEFERRED, findings: [] };
    }
    return { ...base, status: DEFERRED_EXPIRED, findings: [clauseFinding(clause, DEFERRED_EXPIRED, 'deferral expired at ' + String(expiresAt))] };
  }
  if ([NOT_APPLICABLE_VERIFIED, DESIGN_PREDICATE_VERIFIED, PROCESS_VERIFIED, EXTERNAL_VERIFIED].includes(disposition.status)) {
    return { ...base, status: disposition.status, findings: [] };
  }
  return null;
}

/**
 * Evaluate one clause.
 *
 * @param {{clause:object, testIndex:object, coverageEntry:object|null, disposition?:object|null, proofInputs?:object|null, now?:Date}} input
 * @returns {{key:string,status:string,tests:object[],proof:object|null,applicability:string,findings:object[]}}
 */
// [::TICKET::] PX-436, PX-440, PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-436|PX-440|PX-441) --for-spec --no-implementation-order`.
function evaluateClause({ clause, testIndex, coverageEntry = null, disposition = null, proofInputs = null, now = new Date() }) {
  const mapped = resolveMappedTests({ clause, testIndex, coverageEntry });
  const declared = disposition?.status ?? coverageEntry?.applicability ?? clause.applicability ?? null;
  const applicability = disposition?.status ?? coverageEntry?.applicability ?? clause.applicability ?? 'UNCLASSIFIED';
  const base = { key: clause.key, tests: mapped, proof: coverageEntry?.proof ?? null, applicability, disposition: disposition ?? null };

  if (disposition !== null) {
    const resolved = resolveVerifiedDisposition({ clause, disposition, base, now });
    if (resolved !== null) return resolved;
  }

  if (declared === null) {
    return { ...base, status: 'UNCLASSIFIED', findings: [clauseFinding(clause, 'CLAUSE_UNCLASSIFIED', 'clause ' + clause.key + ' has no applicability classification')] };
  }

  if (disposition === null && VERIFIABLE_APPLICABILITY.has(declared)) {
    return { ...base, status: CLAUSE_DISPOSITION_UNVERIFIED, findings: [clauseFinding(clause, CLAUSE_DISPOSITION_UNVERIFIED, 'clause ' + clause.key + ' is ' + declared + ' but has no verified disposition')] };
  }

  if (mapped.length === 0) {
    return { ...base, status: 'UNMAPPED', findings: [clauseFinding(clause, 'CLAUSE_UNMAPPED', 'no test is mapped to clause ' + clause.key)] };
  }

  const missing = mapped.filter((test) => test.missing === true);
  if (missing.length > 0) {
    return { ...base, status: 'TEST_MISSING', findings: missing.map((test) => clauseFinding(clause, 'TEST_MISSING', 'mapped test ' + test.id + ' is absent from TEST-INDEX.json')) };
  }

  const nonIgnored = mapped.filter((test) => test.ignored !== true);
  if (nonIgnored.length === 0) {
    return { ...base, status: 'TEST_IGNORED', findings: [clauseFinding(clause, 'TEST_IGNORED', 'every mapped test is ignored or skipped')] };
  }

  const proof = coverageEntry?.proof ?? null;
  if (proof === null) {
    return { ...base, status: 'CLAUSE_PROOF_MISSING', findings: [clauseFinding(clause, 'CLAUSE_PROOF_MISSING', 'mapped test has no detection proof')] };
  }
  if (proof.status === 'CLAUSE_PROOF_FAILED' || proof.status === 'UNSTABLE') {
    return { ...base, status: proof.status, findings: [clauseFinding(clause, proof.status, 'detection proof did not prove the clause')] };
  }
  if (proofInputs === null) {
    return { ...base, status: 'CLAUSE_PROOF_STALE', findings: [clauseFinding(clause, 'CLAUSE_PROOF_STALE', 'proof inputs are unknown; re-run the proof')] };
  }
  if (!isProofFresh({ proof, inputs: proofInputs })) {
    return { ...base, status: 'CLAUSE_PROOF_STALE', findings: [clauseFinding(clause, 'CLAUSE_PROOF_STALE', 'proof inputs changed; re-run the proof')] };
  }
  return { ...base, status: PROVEN, findings: [] };
}

/**
 * The digest of one measured coverage result.
 *
 * The terminal predicate compares two evaluations over the same artifacts: a
 * shared digest proves the measurement did not move between them.
 */
// [::TICKET::] PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-440 --for-spec --no-implementation-order`.
function coverageDigestOf(coverage) {
  return 'sha256:' + createHash('sha256').update(JSON.stringify(coverage?.clauses ?? [])).digest('hex');
}

/**
 * Count the blocking remainder.
 *
 * A clause is unresolved when it has no valid disposition. A conflict or
 * duplicate owner is structural and is counted once, never again as an
 * unresolved clause.
 *
 * @param {{clauses:object[], conflicts?:object[], duplicateOwners?:object[], now?:Date}} input
 * @returns {object}
 */
// [::TICKET::] PX-436, PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-436|PX-440) --for-spec --no-implementation-order`.
function computeRemainder({ clauses, conflicts = [], duplicateOwners = [], now = new Date() }) {
  const structuralKeys = new Set([
    ...(conflicts ?? []).flatMap((conflict) => conflict.keys ?? [conflict.key]).filter(isNonEmptyString),
    ...(duplicateOwners ?? []).map((entry) => entry.key).filter(isNonEmptyString),
  ]);
  const counts = {
    total: (clauses ?? []).length,
    proven: 0,
    design: 0,
    process: 0,
    external: 0,
    notApplicable: 0,
    deferred: 0,
    expiredDeferred: 0,
    unmapped: 0,
    unproven: 0,
    unclassified: 0,
    staleProof: 0,
    structural: structuralKeys.size,
    conflict: (conflicts ?? []).length,
    duplicateOwner: (duplicateOwners ?? []).length,
    debt: 0,
    repairs: 0,
  };
  let unresolved = 0;

  for (const clause of clauses ?? []) {
    if (clause.status === PROVEN) {
      counts.proven += 1;
      continue;
    }
    if (clause.status === NOT_APPLICABLE_VERIFIED) {
      counts.notApplicable += 1;
      continue;
    }
    if (clause.status === DESIGN_PREDICATE_VERIFIED) {
      counts.design += 1;
      continue;
    }
    if (clause.status === PROCESS_VERIFIED) {
      counts.process += 1;
      continue;
    }
    if (clause.status === EXTERNAL_VERIFIED) {
      counts.external += 1;
      continue;
    }
    if (clause.status === DEFERRED) {
      const expiresAt = clause.disposition?.expiresAt;
      if (typeof expiresAt === 'string' && new Date(expiresAt).getTime() > now.getTime()) {
        counts.deferred += 1;
        counts.debt += 1;
        continue;
      }
      counts.expiredDeferred += 1;
    }
    if (clause.status === DEFERRED_EXPIRED) counts.expiredDeferred += 1;
    if (clause.status === 'UNMAPPED') counts.unmapped += 1;
    else if (clause.status === 'UNCLASSIFIED') counts.unclassified += 1;
    else if (clause.status === 'CLAUSE_PROOF_STALE') {
      counts.staleProof += 1;
      counts.unproven += 1;
    } else {
      counts.unproven += 1;
    }
    if (!structuralKeys.has(clause.key)) unresolved += 1;
  }

  return { ...counts, unresolved, remainder: unresolved + counts.structural };
}

/**
 * Scan an inventory against a test index and a coverage map.
 *
 * @param {{inventory:object, testIndex:object, coverage:object, dispositions?:object[], proofInputsByKey?:Map<string,object>}} input
 * @returns {{bindingValid:boolean, coverage:object, findings:object[], remainder:object}}
 */
// [::TICKET::] PX-436, PX-440, PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-436|PX-440|PX-441) --for-spec --no-implementation-order`.
function scanClauseCoverage({ inventory, testIndex, coverage, dispositions = [], proofInputsByKey = new Map(), now = new Date() }) {
  const bindingValid = coverage?.inventoryDigest === inventory?.digest
    && coverage?.testIndexDigest === testIndex?.digest;
  const findings = [];
  if (!bindingValid) {
    findings.push({
      code: INVENTORY_DIGEST_MISMATCH,
      class: 'must-fix',
      problem: 'coverage map was built against a different inventory or test index; rebuild the mapping',
    });
  }

  const entries = new Map((coverage?.clauses ?? []).map((entry) => [entry.key, entry]));
  const dispositionsByKey = new Map((dispositions ?? []).map((entry) => [entry.key, entry]));
  const evaluated = (inventory?.clauses ?? [])
    .map((clause) => {
      const entry = entries.get(clause.key) ?? null;
      // A global digest mismatch is a finding, not a reason to discard every
      // proof. Only this clause's own input tuple decides reuse.
      const proofInputs = proofInputsByKey instanceof Map
        ? proofInputsByKey.get(clause.key) ?? null
        : proofInputsByKey?.[clause.key] ?? null;
      return evaluateClause({ clause, testIndex, coverageEntry: entry, disposition: dispositionsByKey.get(clause.key) ?? null, proofInputs, now });
    })
    .sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));

  const remainder = computeRemainder({
    clauses: evaluated,
    conflicts: inventory?.conflicts ?? [],
    duplicateOwners: inventory?.duplicateOwners ?? [],
  });
  findings.push(...evaluated.flatMap((entry) => entry.findings));

  return {
    bindingValid,
    findings,
    remainder,
    coverage: {
      version: 1,
      inventoryDigest: inventory?.digest ?? null,
      testIndexDigest: testIndex?.digest ?? null,
      clauses: evaluated,
      remainder,
    },
  };
}

module.exports = {
  CLAUSE_DISPOSITION_UNVERIFIED,
  DEFERRED,
  DEFERRED_EXPIRED,
  DESIGN_PREDICATE_VERIFIED,
  EXTERNAL_VERIFIED,
  INVENTORY_DIGEST_MISMATCH,
  NOT_APPLICABLE_VERIFIED,
  PROCESS_VERIFIED,
  PROVEN,
  TESTABLE,
  clauseLevelAnnotations,
  computeRemainder,
  coverageDigestOf,
  evaluateClause,
  exactAnnotation,
  isProofFresh,
  resolveMappedTests,
  scanClauseCoverage,
};
