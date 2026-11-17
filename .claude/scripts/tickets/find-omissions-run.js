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
const { scanClauseCoverage } = require('./lib/coverage-map.js');
const { runDetectionGate } = require('./omission-detection-gate.js');
const { planOmissionTickets } = require('./apply-omission-findings.js');
const { isCompletedStatus } = require('./lib/ticket-status.js');
const { acquirePackageLock, releasePackageLock } = require('./lib/package-lock.js');
const { requireSupportedVersion } = require('./lib/versioned-json.js');
const { reconcileLegacy } = require('./lib/legacy-reconcile.js');
const { repairKeyOf, runRepairLadder } = require('./lib/repair-ladder.js');

const COVERAGE_FILE_NAME = 'CONTRACT-COVERAGE.json';
const REPAIRS_FILE_NAME = 'OMISSION-REPAIRS.json';

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
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function applyRepairLadder({ cwd, gate, reportOnly }) {
  const blockerGate = (gate.gates ?? []).find((entry) => !entry.ok);
  if (blockerGate === undefined) return null;
  const blocker = {
    kind: blockerGate.name,
    artifact: 'gate',
    error: blockerGate.problem ?? blockerGate.name,
  };
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
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
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
    const testIndex = buildTestIndex({ cwd, adapters: resolveAdapters({ cwd, configPath: configPath ? path.resolve(cwd, configPath) : null }) });
    const coveragePath = path.join(cwd, COVERAGE_FILE_NAME);
    const existingCoverage = readJson(coveragePath, null);
    if (existingCoverage !== null) requireSupportedVersion(existingCoverage, [1], coveragePath);

    const scan = scanClauseCoverage({
      inventory,
      testIndex,
      coverage: existingCoverage ?? { version: 1, inventoryDigest: null, testIndexDigest: null, clauses: [] },
    });
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
      writeTemporaryThenRename(coveragePath, JSON.stringify(scan.coverage, null, 2) + '\n');
    }

    const gate = runDetectionGate({
      cwd,
      v3Artifacts: { inventory, testIndex, coverage: scan.coverage },
      repairs,
    });
    const ticketsPath = path.join(cwd, 'Tickets.json');
    const ticketsData = readJson(ticketsPath, { phases: [] });
    const plan = planOmissionTickets({
      remainder: remainderEntriesOf({ inventory, coverage: scan.coverage }),
      ticketsData,
      phases: ticketsData.phases ?? [],
    });

    if (!reportOnly && plan.created.length > 0) {
      writeTemporaryThenRename(ticketsPath, JSON.stringify(plan.ticketsData, null, 2) + '\n');
    }

    let repairRecords = repairs;
    if (!gate.complete && plan.created.length === 0 && plan.reusedTickets === 0) {
      const repair = applyRepairLadder({ cwd, gate, reportOnly });
      if (repair !== null) repairRecords = upsertRepairRecord(repairs, repair);
    }

    const report = reportOf({ gate, plan, ticketsData: reportOnly ? ticketsData : plan.ticketsData, repairs: repairRecords, reportOnly });
    report.legacy = {
      mapped: Object.keys(legacy.mapping).length,
      ambiguous: legacy.ambiguous.length,
      unmapped: legacy.unmapped.length,
      debt: legacy.legacyDebt.length,
      passWithoutProof: legacy.legacyPassWithoutProof.length,
      ticketsChanged: legacy.ticketsChanged,
    };
    process.stdout.write(JSON.stringify(report) + '\n');
    const complete = gate.complete && report.createdTickets === 0 && report.openTickets === 0 && repairs.length === 0;
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
  REPAIRS_FILE_NAME,
  openTicketCount,
  remainderEntriesOf,
  reportOf,
  ticketKeyOfRecord,
};
