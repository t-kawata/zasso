'use strict';

/**
 * PX-436 — coverage map and remainder arithmetic.
 *
 * A clause is PROVEN only when a non-ignored test is mapped and its proof is
 * fresh and observed failing. Keyword and annotation matches are candidates;
 * they never produce a verdict by themselves.
 */

const INVENTORY_DIGEST_MISMATCH = 'INVENTORY_DIGEST_MISMATCH';

/** The statuses a valid disposition may carry. */
const PROVEN = 'PROVEN';
const NOT_APPLICABLE_VERIFIED = 'NOT_APPLICABLE_VERIFIED';
const DEFERRED = 'DEFERRED';

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

/** Whether a proof is fresh against the mapped test. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function isProofFresh({ proof, testDigest }) {
  return proof !== null
    && typeof proof === 'object'
    && proof.status === PROVEN
    && isNonEmptyString(proof.verifiedAt)
    && proof.digests !== null
    && typeof proof.digests === 'object'
    && proof.digests.test === testDigest;
}

/**
 * Evaluate one clause.
 *
 * @param {{clause:object, testIndex:object, coverageEntry:object|null, now?:Date}} input
 * @returns {{key:string,status:string,tests:object[],proof:object|null,applicability:string,findings:object[]}}
 */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function evaluateClause({ clause, testIndex, coverageEntry = null, now = new Date() }) {
  const mapped = resolveMappedTests({ clause, testIndex, coverageEntry });
  const declared = coverageEntry?.applicability ?? clause.applicability ?? null;
  const applicability = declared ?? 'UNCLASSIFIED';
  const base = { key: clause.key, tests: mapped, proof: coverageEntry?.proof ?? null, applicability };

  if (declared === null) {
    return { ...base, status: 'UNCLASSIFIED', findings: [clauseFinding(clause, 'CLAUSE_UNCLASSIFIED', 'clause ' + clause.key + ' has no applicability classification')] };
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
  if (!isProofFresh({ proof, testDigest: nonIgnored[0].digest })) {
    return { ...base, status: 'CLAUSE_PROOF_STALE', findings: [clauseFinding(clause, 'CLAUSE_PROOF_STALE', 'proof digests changed; re-run the proof')] };
  }
  return { ...base, status: PROVEN, findings: [] };
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
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
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
    if (clause.status === DEFERRED) {
      const expiresAt = clause.disposition?.expiresAt;
      if (typeof expiresAt === 'string' && new Date(expiresAt).getTime() > now.getTime()) {
        counts.deferred += 1;
        counts.debt += 1;
        continue;
      }
      counts.expiredDeferred += 1;
    }
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
 * @param {{inventory:object, testIndex:object, coverage:object}} input
 * @returns {{bindingValid:boolean, coverage:object, findings:object[], remainder:object}}
 */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function scanClauseCoverage({ inventory, testIndex, coverage }) {
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
  const evaluated = (inventory?.clauses ?? [])
    .map((clause) => {
      const entry = entries.get(clause.key) ?? null;
      const safeEntry = bindingValid ? entry : (entry === null ? null : { ...entry, proof: null });
      return evaluateClause({ clause, testIndex, coverageEntry: safeEntry });
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
  INVENTORY_DIGEST_MISMATCH,
  clauseLevelAnnotations,
  computeRemainder,
  evaluateClause,
  exactAnnotation,
  isProofFresh,
  resolveMappedTests,
  scanClauseCoverage,
};
