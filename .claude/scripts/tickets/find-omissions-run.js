#!/usr/bin/env node
'use strict';

/**
 * PX-437 — non-interactive /find-omissions full flow.
 *
 * Inventory -> test index -> coverage -> proofs -> ordered gate -> minimal
 * ticket/repair plan -> machine report. Exit 0 means complete, exit 10 means
 * work or repair remains. A project condition never produces another exit.
 */

const fs = require('node:fs');
const path = require('node:path');

const { writeTemporaryThenRename } = require('./lib/atomic-write.js');
const { loadConfiguration } = require('./build-contract-inventory.js');
const { buildInventory } = require('./lib/inventory.js');
const { buildTestIndex, resolveAdapters } = require('./build-test-index.js');
const { coverageDigestOf, scanClauseCoverage } = require('./lib/coverage-map.js');
const { runDetectionGate } = require('./omission-detection-gate.js');
const { planOmissionTickets } = require('./apply-omission-findings.js');
const { isCompletedStatus } = require('./lib/ticket-status.js');
const { acquirePackageLock, releasePackageLock } = require('./lib/package-lock.js');
const { requireSupportedVersion } = require('./lib/versioned-json.js');
const { reconcileLegacy } = require('./lib/legacy-reconcile.js');
const { repairKeyOf, runRepairLadder } = require('./lib/repair-ladder.js');
const { DISPOSITIONS_FILE_NAME, loadDispositions } = require('./lib/dispositions.js');
const {
  buildProofEntries,
  buildProofInputsByKey,
  proofCacheOf,
  runProofEntries,
} = require('./lib/proof-plan.js');
const { invalidationReasonOf } = require('./lib/proof-inputs.js');

const INVENTORY_FILE_NAME = 'CONTRACT-INVENTORY.json';
const INDEX_FILE_NAME = 'TEST-INDEX.json';
const COVERAGE_FILE_NAME = 'CONTRACT-COVERAGE.json';
const REPAIRS_FILE_NAME = 'OMISSION-REPAIRS.json';
const WORKLIST_FILE_NAME = 'OMISSION-CLASSIFICATION-WORKLIST.json';
const CONVERGENCE_V3_FILE_NAME = 'OMISSION-CONVERGENCE-V3.json';
const MAX_V3_RUNS = 10;
const EMPTY_COVERAGE = Object.freeze({ version: 1, inventoryDigest: null, testIndexDigest: null, clauses: [] });

/** Read `--name=value` from the argument list. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function argumentValue(args, name) {
  const prefix = '--' + name + '=';
  const match = args.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

/** Read JSON or a fallback. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** The key of one ticket record. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function ticketKeyOfRecord(phaseId, ticketId) {
  return phaseId === -1 ? 'PX-' + String(ticketId) : 'P' + String(phaseId) + '-' + String(ticketId);
}

/** Count tickets that are still work. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function openTicketCount(ticketsData) {
  return (ticketsData?.phases ?? []).flatMap((phase) => phase.tickets ?? [])
    .filter((ticket) => !isCompletedStatus(ticket.status)).length;
}

/** The canonical keys of the open tickets. */
// [::TICKET::] PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-440 --for-spec --no-implementation-order`.
function openTicketKeysOf(ticketsData) {
  return new Set((ticketsData?.phases ?? []).flatMap((phase) => (phase.tickets ?? [])
    .filter((ticket) => !isCompletedStatus(ticket.status))
    .map((ticket) => ticketKeyOfRecord(phase.id, ticket.id))));
}

/** The clauses a person or AI must disposition before coverage can be measured. */
// [::TICKET::] PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-440 --for-spec --no-implementation-order`.
function buildClassificationWorklist({ inventory, coverage }) {
  const inventoryByKey = new Map((inventory?.clauses ?? []).map((clause) => [clause.key, clause]));
  const clauses = (coverage?.clauses ?? [])
    .filter((clause) => clause.status === 'UNCLASSIFIED')
    .map((clause) => {
      const source = inventoryByKey.get(clause.key) ?? {};
      return {
        key: clause.key,
        contractId: source.contractId ?? null,
        element: source.element ?? null,
        text: source.text ?? null,
        source: source.source ?? [],
        owners: source.owners ?? [],
      };
    })
    .sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
  return { version: 1, inventoryDigest: inventory?.digest ?? null, clauses };
}

/** The remainder entries the ticket planner consumes. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function remainderEntriesOf({ inventory, coverage }) {
  const inventoryByKey = new Map((inventory?.clauses ?? []).map((clause) => [clause.key, clause]));
  return (coverage?.clauses ?? [])
    .filter((clause) => clause.applicability === 'TESTABLE' && clause.status !== 'PROVEN')
    .map((clause) => {
      const source = inventoryByKey.get(clause.key) ?? {};
      return {
        key: clause.key,
        contractId: source.contractId ?? null,
        element: source.element ?? null,
        group: [inventory?.scope ?? 'package', source.contractId ?? 'unknown'].join('|'),
        owner: (source.owners ?? [])[0] ?? null,
      };
    });
}

/** Build the machine report. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function reportOf({ gate, plan, ticketsData, repairs, reportOnly }) {
  const complete = gate.complete;
  return {
    coverageComplete: complete,
    remainder: gate.counts.remainder,
    debt: gate.counts.debt,
    notApplicable: gate.counts.clauses.notApplicable,
    createdTickets: reportOnly ? 0 : plan.created.length,
    reusedTickets: plan.reusedTickets,
    plannedCreated: plan.created.length,
    phasesCreated: reportOnly ? 0 : plan.phasesCreated,
    openTickets: openTicketCount(ticketsData),
    blockers: gate.gates.filter((entry) => !entry.ok).map((entry) => ({ gate: entry.name, problem: entry.problem ?? null })),
    repairs,
    reportOnly,
  };
}

/** Add or replace one repair record in the ledger. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function upsertRepairRecord(records, record) {
  const remaining = (records ?? []).filter((entry) => entry.repairKey !== record.repairKey);
  return [...remaining, record].sort((left, right) => (left.repairKey < right.repairKey ? -1 : left.repairKey > right.repairKey ? 1 : 0));
}

/** Append one repair ticket, idempotent by repairKey. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function appendRepairTicket({ cwd, record, reportOnly }) {
  if (reportOnly) return record.ticketKey ?? '(planned)';
  const ticketsPath = path.join(cwd, 'Tickets.json');
  const ticketsData = readJson(ticketsPath, { phases: [] });
  const records = (ticketsData.phases ?? []).flatMap((phase) => (phase.tickets ?? []).map((ticket) => ({ phase, ticket })));
  const existing = records.find((entry) => entry.ticket.repairKey === record.repairKey);
  if (existing !== undefined) return ticketKeyOfRecord(existing.phase.id, existing.ticket.id);

  const phases = ticketsData.phases ?? [];
  const realIds = phases.filter((phase) => phase.id >= 0).map((phase) => phase.id);
  const phaseId = realIds.length === 0 ? 0 : Math.max(...realIds) + 1;
  let phase = phases.find((candidate) => candidate.id === phaseId);
  if (phase === undefined) {
    phase = { id: phaseId, name: 'Repairs', characteristics: '', tickets: [] };
    phases.push(phase);
  }
  const id = phase.tickets.length === 0 ? 1 : Math.max(...phase.tickets.map((ticket) => ticket.id)) + 1;
  phase.tickets.push({
    id,
    phaseId,
    status: 'todo',
    title: 'Repair: ' + record.kind,
    repairKey: record.repairKey,
    contracts: [],
    testUnit: [],
    testIntegration: [],
    acceptanceCriteria: [],
  });
  writeTemporaryThenRename(ticketsPath, JSON.stringify(ticketsData, null, 2) + '\n');
  return ticketKeyOfRecord(phaseId, id);
}

/**
 * Run the repair ladder for the first failed gate.
 *
 * A blocker is a work item: an automatic repair or one deduplicated repair
 * ticket. It is never a process failure.
 */
// [::TICKET::] PX-437, PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-437|PX-440) --for-spec --no-implementation-order`.
function applyRepairLadder({ cwd, gate, reportOnly, worklist = null }) {
  const blockerGate = (gate.gates ?? []).find((entry) => !entry.ok);
  if (blockerGate === undefined) return null;
  const unclassified = blockerGate.name === 'coverage' && (worklist?.clauses?.length ?? 0) > 0;
  const blocker = unclassified
    ? { kind: 'unclassified-clause', artifact: WORKLIST_FILE_NAME, error: worklist.clauses.length + ' unclassified clause(s)' }
    : { kind: blockerGate.name, artifact: 'gate', error: blockerGate.problem ?? blockerGate.name };
  const ledgerPath = path.join(cwd, REPAIRS_FILE_NAME);
  const ledger = readJson(ledgerPath, { version: 1, records: [] });
  const repairKey = repairKeyOf(blocker);
  const previous = (ledger.records ?? []).find((entry) => entry.repairKey === repairKey) ?? null;

  const record = runRepairLadder({
    blocker,
    previous,
    io: {
      readState: () => previous,
      writeState: (next) => {
        if (reportOnly) return;
        ledger.records = upsertRepairRecord(ledger.records, next);
        writeTemporaryThenRename(ledgerPath, JSON.stringify(ledger, null, 2) + '\n');
      },
      stateDigest: () => 'gate:' + blockerGate.name,
      rediscoverConfig: () => ({ ok: false }),
      synthesizeAdapter: () => ({ ok: false }),
      synthesizeRunner: () => ({ ok: false }),
      repairArtifact: () => ({ ok: false }),
      repairClause: () => ({ ok: false }),
      createRepairTicket: () => ({ ok: true, ticketKey: appendRepairTicket({ cwd, record: { repairKey, kind: blocker.kind }, reportOnly }) }),
      createDiagnosticTicket: () => ({ ok: true, ticketKey: appendRepairTicket({ cwd, record: { repairKey, kind: blocker.kind }, reportOnly }) }),
    },
  });
  if (reportOnly) {
    // A prediction must be byte-identical across runs; the recorded instants
    // belong to the committed repair ledger, not to the report-only projection.
    const { createdAt, verifiedAt, ...prediction } = record;
    return prediction;
  }
  return record;
}

/** CLI entry point. */
// [::TICKET::] PX-437, PX-440, PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-437|PX-440|PX-441) --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  const cwd = path.resolve(argumentValue(args, 'cwd') ?? process.cwd());
  const configPath = argumentValue(args, 'config');
  const reportOnly = args.includes('--report-only');

  const lock = acquirePackageLock({ cwd });
  if (!lock.acquired) {
    process.stdout.write(JSON.stringify({ ok: false, code: 'LOCKED', holder: lock.holder, coverageComplete: false, remainder: null }) + '\n');
    process.exit(10);
    return;
  }

  let exitCode = 10;
  try {
    const configuration = loadConfiguration({ cwd, configPath: configPath ? path.resolve(cwd, configPath) : null });
    const inventory = buildInventory({ adapter: configuration.adapter, sources: configuration.sources });
    const adapters = resolveAdapters({ cwd, configPath: configPath ? path.resolve(cwd, configPath) : null });
    const testIndex = buildTestIndex({ cwd, adapters });
    const ticketsPath = path.join(cwd, 'Tickets.json');
    const ticketsData = readJson(ticketsPath, { phases: [] });
    const loaded = loadDispositions({
      cwd,
      clauseKeys: new Set((inventory.clauses ?? []).map((clause) => clause.key)),
      openTicketKeys: openTicketKeysOf(ticketsData),
    });
    const dispositions = [...loaded.byKey.values()];

    const coveragePath = path.join(cwd, COVERAGE_FILE_NAME);
    const existingCoverage = readJson(coveragePath, null);
    if (existingCoverage !== null) requireSupportedVersion(existingCoverage, [1], coveragePath);

    const initialCoverage = existingCoverage ?? EMPTY_COVERAGE;
    const initialInputs = buildProofInputsByKey({
      cwd,
      inventory,
      testIndex,
      coverage: initialCoverage,
      dispositions,
      adapters,
    });
    let scan = scanClauseCoverage({
      inventory,
      testIndex,
      coverage: initialCoverage,
      dispositions,
      proofInputsByKey: initialInputs.byKey,
    });
    let currentInputs = initialInputs.byKey;
    const proofPlan = buildProofEntries({ cwd, inventory, testIndex, coverage: scan.coverage, dispositions, adapters });
    const requestedProofMode = argumentValue(args, 'proofs') === 'all'
      ? 'all'
      : argumentValue(args, 'proofs') === 'none' ? 'none' : 'changed';
    const proofTimeoutMs = Number.parseInt(argumentValue(args, 'proof-timeout-ms') ?? '30000', 10);
    const proofBudget = Number.parseInt(argumentValue(args, 'proof-budget') ?? '0', 10);
    const freshProofCount = proofPlan.entries
      .filter((entry) => invalidationReasonOf({ proof: entry.proof, inputs: entry.inputs, inputsOk: true }) === null).length;
    const proofRun = reportOnly || requestedProofMode === 'none'
      ? {
          mode: 'changed',
          ran: 0,
          skipped: freshProofCount,
          notRun: proofPlan.entries.length - freshProofCount,
          results: [],
        }
      : runProofEntries({ entries: proofPlan.entries, mode: requestedProofMode, budget: proofBudget, timeoutMs: proofTimeoutMs });
    if (!reportOnly && proofRun.results.length > 0) {
      const proofByKey = new Map(scan.coverage.clauses.map((clause) => [clause.key, clause]));
      for (const result of proofRun.results) {
        const clause = proofByKey.get(result.clauseKey);
        if (clause !== undefined) clause.proof = result;
      }
      const refreshed = buildProofInputsByKey({
        cwd,
        inventory,
        testIndex,
        coverage: scan.coverage,
        dispositions,
        adapters,
      });
      currentInputs = refreshed.byKey;
      scan = scanClauseCoverage({
        inventory,
        testIndex,
        coverage: scan.coverage,
        dispositions,
        proofInputsByKey: currentInputs,
      });
    }
    const proofCache = proofCacheOf({
      total: proofPlan.entries.length + proofPlan.missing.length,
      entries: proofPlan.entries,
      run: proofRun,
      missing: proofPlan.missing,
    });
    const worklist = buildClassificationWorklist({ inventory, coverage: scan.coverage });
    const repairs = readJson(path.join(cwd, REPAIRS_FILE_NAME), { version: 1, records: [] }).records ?? [];
    const legacyBaseline = readJson(path.join(cwd, 'OMISSION-CONVERGENCE.json'), { baseline: [] }).baseline ?? [];
    const legacyJudgments = readJson(path.join(cwd, 'OMISSION-JUDGMENT-LEDGER.json'), { judgments: [] }).judgments ?? [];
    const legacy = reconcileLegacy({
      legacyStableKeys: legacyBaseline,
      inventory,
      coverage: scan.coverage,
      judgments: legacyJudgments,
    });

    if (!reportOnly) {
      writeTemporaryThenRename(path.join(cwd, INVENTORY_FILE_NAME), JSON.stringify(inventory, null, 2) + '\n');
      writeTemporaryThenRename(path.join(cwd, INDEX_FILE_NAME), JSON.stringify(testIndex, null, 2) + '\n');
      writeTemporaryThenRename(coveragePath, JSON.stringify(scan.coverage, null, 2) + '\n');
      if (worklist.clauses.length > 0) {
        writeTemporaryThenRename(path.join(cwd, WORKLIST_FILE_NAME), JSON.stringify(worklist, null, 2) + '\n');
      }
    }

    const plan = planOmissionTickets({
      remainder: remainderEntriesOf({ inventory, coverage: scan.coverage }),
      ticketsData,
      phases: ticketsData.phases ?? [],
    });
    const v3StatePath = path.join(cwd, CONVERGENCE_V3_FILE_NAME);
    const v3State = readJson(v3StatePath, { version: 1, runs: [] });
    const previousRun = (v3State.runs ?? []).length > 0 ? v3State.runs[v3State.runs.length - 1] : null;
    const previousDebt = previousRun?.debt ?? scan.remainder.debt;
    const gate = runDetectionGate({
      cwd,
      v3Artifacts: { inventory, testIndex, coverage: scan.coverage, dispositionFindings: loaded.findings },
      proofInputsByKey: currentInputs,
      repairs,
      openTickets: openTicketCount(ticketsData),
      dispositions,
      convergenceState: { debtBefore: previousDebt, newTickets: plan.created.length, previous: previousRun },
    });
    if (!reportOnly) {
      const runs = [...(v3State.runs ?? []), {
        inventoryDigest: inventory.digest ?? null,
        coverageDigest: coverageDigestOf(scan.coverage),
        remainder: scan.remainder.remainder,
        debt: scan.remainder.debt,
        proofCache: { reused: proofCache.reused, rerun: proofCache.rerun, missing: proofCache.missing },
        at: new Date().toISOString(),
      }].slice(-MAX_V3_RUNS);
      writeTemporaryThenRename(v3StatePath, JSON.stringify({ version: 1, runs }, null, 2) + '\n');
    }

    if (!reportOnly && plan.created.length > 0) {
      writeTemporaryThenRename(ticketsPath, JSON.stringify(plan.ticketsData, null, 2) + '\n');
    }

    let repairRecords = repairs;
    // A changed measurement is re-measured, not repaired: the next identical
    // run is the fixed-point check. Creating a repair ticket here would make
    // every real change leave an open item that blocks the run that confirms it.
    const firstFailedGate = (gate.gates ?? []).find((entry) => !entry.ok);
    const convergenceOnly = firstFailedGate?.name === 'convergence';
    if (!gate.complete && !convergenceOnly && plan.created.length === 0 && plan.reusedTickets === 0) {
      const repair = applyRepairLadder({ cwd, gate, reportOnly, worklist });
      if (repair !== null) repairRecords = upsertRepairRecord(repairs, repair);
    }

    const report = reportOf({ gate, plan, ticketsData: reportOnly ? ticketsData : plan.ticketsData, repairs: repairRecords, reportOnly });
    report.worklist = { unclassified: worklist.clauses.length, path: worklist.clauses.length > 0 ? WORKLIST_FILE_NAME : null };
    report.proofCache = proofCache;
    report.dispositions = {
      ledger: loaded.exists ? DISPOSITIONS_FILE_NAME : null,
      valid: dispositions.length,
      invalid: loaded.findings.length,
    };
    report.legacy = {
      mapped: Object.keys(legacy.mapping).length,
      ambiguous: legacy.ambiguous.length,
      unmapped: legacy.unmapped.length,
      debt: legacy.legacyDebt.length,
      passWithoutProof: legacy.legacyPassWithoutProof.length,
      ticketsChanged: legacy.ticketsChanged,
    };
    process.stdout.write(JSON.stringify(report) + '\n');
    const pendingRepairs = (report.repairs ?? []).filter((record) => record.status !== 'completed').length;
    const complete = gate.complete && report.createdTickets === 0 && report.openTickets === 0 && pendingRepairs === 0;
    exitCode = complete ? 0 : 10;
  } catch (error) {
    process.stdout.write(JSON.stringify({
      coverageComplete: false,
      remainder: null,
      code: 'INTERNAL_DEFECT',
      problem: error instanceof Error ? error.message : String(error),
    }) + '\n');
    exitCode = 10;
  } finally {
    releasePackageLock({ cwd });
  }
  process.exit(exitCode);
}

if (require.main === module) main();

module.exports = {
  COVERAGE_FILE_NAME,
  INVENTORY_FILE_NAME,
  INDEX_FILE_NAME,
  REPAIRS_FILE_NAME,
  WORKLIST_FILE_NAME,
  buildClassificationWorklist,
  openTicketCount,
  openTicketKeysOf,
  remainderEntriesOf,
  reportOf,
  ticketKeyOfRecord,
};
