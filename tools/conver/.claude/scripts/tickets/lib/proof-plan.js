'use strict';

/**
 * PX-441 — proof entry construction shared by the find runner and the proof CLI.
 *
 * The module turns measured clauses into runnable experiments. It never guesses
 * a mutation or a command: an absent plan is reported as missing work.
 */

const { resolveMappedTests } = require('./coverage-map.js');
const { SOURCE_RESTORE_FAILED, runDetectionProof, runProofs } = require('./proof-engine.js');
const {
  UNSTABLE_PROOF_TARGET,
  classifyMutationTarget,
  computeProofInputs,
  invalidationReasonOf,
} = require('./proof-inputs.js');
const { createProofWorkspacePool } = require('./proof-workspace.js');

/** The adapter that produced one mapped test. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function adapterForTest({ testEntry, adapters, defaultAdapter = null }) {
  const id = testEntry?.adapter?.id;
  return (adapters ?? []).find((adapter) => adapter?.id === id) ?? defaultAdapter;
}

/** The current mapped test for one clause. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function mappedTestFor({ clause, testIndex, coverageEntry }) {
  const mapped = resolveMappedTests({ clause, testIndex, coverageEntry }).filter((test) => test.missing !== true);
  return mapped.find((test) => test.ignored !== true) ?? mapped[0] ?? null;
}

/** The mutation and command a clause may use. */
// [::TICKET::] PX-441, PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-441|PX-442) --for-spec --no-implementation-order`.
function resolveProofPlan({ coverageEntry, disposition, adapter }) {
  const mutation = coverageEntry?.proof?.mutation
    ?? disposition?.proof?.mutation
    ?? coverageEntry?.mutation
    ?? null;
  // The recorded template is part of the input tuple. Using the resolved
  // command instead would change inputsDigest and invalidate a valid proof.
  const commandTemplate = coverageEntry?.proof?.inputs?.commandTemplate
    ?? coverageEntry?.proof?.command
    ?? disposition?.proof?.command
    ?? adapter?.runner
    ?? null;
  return { mutation, commandTemplate };
}

/** The dispositions indexed by clause key. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function dispositionsByKeyOf(dispositions) {
  return new Map((dispositions ?? []).map((entry) => [entry.key, entry]));
}

/**
 * Compute current inputs for every inventory clause.
 *
 * @returns {{byKey:Map<string,object>, missing:object[], findings:object[]}}
 */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function buildProofInputsByKey({ cwd, inventory, testIndex, coverage, dispositions = [], adapters = [] }) {
  const entries = new Map((coverage?.clauses ?? []).map((entry) => [entry.key, entry]));
  const byDispositionKey = dispositionsByKeyOf(dispositions);
  const defaultAdapter = adapters[0] ?? null;
  const byKey = new Map();
  const missing = [];
  const findings = [];

  for (const clause of inventory?.clauses ?? []) {
    const coverageEntry = entries.get(clause.key) ?? null;
    if ((coverageEntry?.applicability ?? clause.applicability) !== 'TESTABLE') continue;
    const testEntry = mappedTestFor({ clause, testIndex, coverageEntry });
    const adapter = adapterForTest({ testEntry, adapters, defaultAdapter });
    const plan = resolveProofPlan({ coverageEntry, disposition: byDispositionKey.get(clause.key), adapter });
    const computed = computeProofInputs({
      cwd,
      clauseKey: clause.key,
      coverageEntry,
      testEntry,
      mutation: plan.mutation,
      commandTemplate: plan.commandTemplate,
      adapter,
    });
    if (computed.ok) {
      byKey.set(clause.key, computed.inputs);
      findings.push(...(computed.findings ?? []));
    } else {
      missing.push({ key: clause.key, code: computed.code, field: computed.field ?? null });
    }
  }

  return { byKey, missing, findings };
}

/** A runnable proof entry, or the reason the clause has no runnable plan. */
// [::TICKET::] PX-441, PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-441|PX-442) --for-spec --no-implementation-order`.
function proofEntryFor({ cwd, clause, coverageEntry, testIndex, disposition, adapters, defaultAdapter }) {
  const testEntry = mappedTestFor({ clause, testIndex, coverageEntry });
  const adapter = adapterForTest({ testEntry, adapters, defaultAdapter });
  const plan = resolveProofPlan({ coverageEntry, disposition, adapter });
  if (plan.mutation === null || plan.commandTemplate === null) {
    return { ok: false, code: 'PROOF_PLAN_MISSING', key: clause.key };
  }
  if (classifyMutationTarget({ file: plan.mutation.file }) === UNSTABLE_PROOF_TARGET) {
    return { ok: false, code: UNSTABLE_PROOF_TARGET, field: 'mutation', key: clause.key };
  }
  const computed = computeProofInputs({
    cwd,
    clauseKey: clause.key,
    coverageEntry,
    testEntry,
    mutation: plan.mutation,
    commandTemplate: plan.commandTemplate,
    adapter,
  });
  if (!computed.ok) {
    return { ok: false, code: computed.code, field: computed.field ?? null, key: clause.key };
  }
  return {
    ok: true,
    entry: {
      key: clause.key,
      test: testEntry,
      proof: coverageEntry?.proof ?? null,
      mutation: plan.mutation,
      command: plan.commandTemplate,
      inputs: computed.inputs,
      files: computed.closureFiles ?? [],
    },
  };
}

/** Build every runnable TESTABLE entry and the clauses without a plan. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function buildProofEntries({ cwd, inventory, testIndex, coverage, dispositions = [], adapters = [] }) {
  const entries = new Map((coverage?.clauses ?? []).map((entry) => [entry.key, entry]));
  const byDispositionKey = dispositionsByKeyOf(dispositions);
  const defaultAdapter = adapters[0] ?? null;
  const runnable = [];
  const missing = [];

  for (const clause of inventory?.clauses ?? []) {
    const coverageEntry = entries.get(clause.key) ?? null;
    if (coverageEntry?.applicability !== 'TESTABLE') continue;
    const planned = proofEntryFor({
      cwd,
      clause,
      coverageEntry,
      testIndex,
      disposition: byDispositionKey.get(clause.key),
      adapters,
      defaultAdapter,
    });
    if (planned.ok) runnable.push(planned.entry);
    else missing.push({ key: clause.key, code: planned.code, field: planned.field ?? null });
  }

  return { entries: runnable, missing };
}

/** Execute the stale or missing entries. */
// [::TICKET::] PX-441, PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-441|PX-442) --for-spec --no-implementation-order`.
function runProofEntries({ entries, mode = 'changed', budget = 0, timeoutMs, cwd = process.cwd(), workspaceRoots = undefined }) {
  const pool = createProofWorkspacePool({ cwd, workspaceRoots });
  try {
    return runProofs({
      clauses: entries,
      mode,
      budget,
      runProof: (entry) => {
        const workspace = pool.workspaceFor({
          mutationFiles: [entry.mutation?.file].filter((file) => typeof file === 'string' && file.length > 0),
          includeFiles: [entry.test?.file, ...(entry.files ?? [])].filter((file) => typeof file === 'string' && file.length > 0),
        });
        const result = runDetectionProof({
          clause: { key: entry.key },
          testId: entry.test.id,
          testDigest: entry.test.digest,
          mutation: entry.mutation,
          command: entry.command,
          inputs: entry.inputs,
          workspace: workspace.ok ? { ...workspace, shared: true } : workspace,
          timeoutMs,
        });
        if (result.status === SOURCE_RESTORE_FAILED && workspace.poolKey !== undefined) pool.evict(workspace.poolKey);
        return result;
      },
    });
  } finally {
    pool.cleanupAll();
  }
}

/** Count reuse, reruns and invalidation reasons for one run. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function proofCacheOf({ total, entries, run, missing }) {
  const invalidatedBy = {
    fresh: 0,
    source: 0,
    test: 0,
    command: 0,
    closure: 0,
    toolchain: 0,
    engine: 0,
    adapter: 0,
    clause: 0,
    legacy: 0,
    failed: 0,
    restore: 0,
    missing: missing.length,
    unknown: 0,
  };

  for (const entry of entries) {
    const reason = invalidationReasonOf({ proof: entry.proof, inputs: entry.inputs, inputsOk: true });
    if (reason === null) invalidatedBy.fresh += 1;
    else invalidatedBy[reason] = (invalidatedBy[reason] ?? 0) + 1;
  }

  return {
    total,
    reused: run.skipped,
    rerun: run.ran,
    missing: missing.length,
    notRun: run.notRun,
    invalidatedBy,
  };
}

module.exports = {
  adapterForTest,
  buildProofEntries,
  buildProofInputsByKey,
  dispositionsByKeyOf,
  mappedTestFor,
  proofCacheOf,
  proofEntryFor,
  resolveProofPlan,
  runProofEntries,
};
