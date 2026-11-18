#!/usr/bin/env node
'use strict';

/**
 * PX-407 — apply scan findings to the omission ticket pipeline.
 *
 * Only a must-fix finding with a resolvable source ticket becomes a ticket. One
 * stable key creates at most one ticket. An unsourced observation enters the
 * improvement backlog; a design-surface finding enters the design-amendment
 * queue. Report-only mode writes nothing.
 */

const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { inferTicketKey, toOmissionTicket } = require('./omission-gap-scan.js');
const { FINDING_CLASS } = require('./lib/omission-convergence.js');
const { writeTemporaryThenRename } = require('./lib/atomic-write.js');
const { isCompletedStatus } = require('./lib/ticket-status.js');
const { findTicketRecord, resolveRootTicketKey } = require('./add-omission-ticket.js');
const { atomsOfImplementation } = require('./lib/omission-work-unit.js');
const { minimumContiguousPartition } = require('./lib/ticket-partition.js');
const { WORKLOAD_COMPONENTS, parseWorkBudget } = require('./lib/ticket-workload.js');

const INDEX_FILE_NAME = 'OMISSION-TICKET-INDEX.json';
const BACKLOG_FILE_NAME = 'OMISSION-IMPROVEMENT-BACKLOG.json';
const DESIGN_QUEUE_FILE_NAME = 'DESIGN-AMENDMENT-QUEUE.json';
const DESIGN_SURFACES = new Set(['graph-node', 'graph-edge', 'dirs-tree', 'sequence-step', 'boundary']);

/** Read a JSON file or a default. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** Write a JSON file atomically enough for the loop. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function writeJson(filePath, value) {
  writeTemporaryThenRename(filePath, JSON.stringify(value, null, 2) + '\n');
}

/** The source ticket a finding names. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function sourceTicketOf(finding) {
  return finding.ticketKey ?? inferTicketKey(finding.assetId);
}

/** Create one omission ticket through the existing CLI. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function createOmissionTicket({ cwd, ticketsPath, ticket, omissionsFilePath }) {
  const cli = path.join(__dirname, 'add-omission-ticket.js');
  execFileSync(process.execPath, [cli, '--tmp-omissions=' + omissionsFilePath, '--tickets=' + ticketsPath], {
    cwd,
    input: JSON.stringify(ticket) + '\n',
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/** A collision-free omissions file in the package root. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function resolveOmissionsFile(cwd) {
  return path.join(cwd, '_tmp-omissions-px407-' + process.pid + '.json');
}

/**
 * Apply a scan report.
 *
 * @returns {{createdTickets:number, ticketedKeys:string[], backlog:object[], designQueue:object[], state:object}}
 */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function applyFindings({ cwd, ticketsPath = null, report, state = null, reportOnly = false }) {
  const tickets = ticketsPath || path.join(cwd, 'Tickets.json');
  const indexPath = path.join(cwd, INDEX_FILE_NAME);
  const index = state ?? readJson(indexPath, { version: 1, tickets: {}, createdThisRound: 0 });
  index.tickets = index.tickets ?? {};

  if (reportOnly) {
    return { createdTickets: 0, ticketedKeys: Object.keys(index.tickets), backlog: [], designQueue: [], state: index };
  }

  const backlog = [];
  const designQueue = [];
  const ticketedKeys = [];
  let createdTickets = 0;
  const omissionsFilePath = resolveOmissionsFile(cwd);

  for (const finding of report?.findings ?? []) {
    if (finding.class !== FINDING_CLASS.MUST_FIX) {
      backlog.push({ stableKey: finding.stableKey, surface: finding.surface, assetId: finding.assetId, problem: finding.problem });
      continue;
    }
    if (index.tickets[finding.stableKey]) {
      ticketedKeys.push(finding.stableKey);
      continue;
    }
    const sourceTicket = sourceTicketOf(finding);
    if (!sourceTicket) {
      if (DESIGN_SURFACES.has(finding.surface)) designQueue.push({ stableKey: finding.stableKey, surface: finding.surface, assetId: finding.assetId, problem: finding.problem, route: 'design-amendment' });
      else backlog.push({ stableKey: finding.stableKey, surface: finding.surface, assetId: finding.assetId, problem: finding.problem });
      continue;
    }
    createOmissionTicket({ cwd, ticketsPath: tickets, ticket: toOmissionTicket({ ...finding, ticketKey: sourceTicket }), omissionsFilePath });
    index.tickets[finding.stableKey] = { sourceTicket, createdAt: new Date().toISOString() };
    ticketedKeys.push(finding.stableKey);
    createdTickets += 1;
  }

  index.createdThisRound = createdTickets;
  writeJson(indexPath, index);
  writeJson(path.join(cwd, BACKLOG_FILE_NAME), { version: 1, at: new Date().toISOString(), findings: backlog });
  writeJson(path.join(cwd, DESIGN_QUEUE_FILE_NAME), { version: 1, at: new Date().toISOString(), findings: designQueue });
  return { createdTickets, ticketedKeys, backlog, designQueue, state: index };
}

/** The key of one ticket record. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function ticketKeyOfRecord(phaseId, ticketId) {
  return phaseId === -1 ? 'PX-' + String(ticketId) : 'P' + String(phaseId) + '-' + String(ticketId);
}

/** Flatten the ticket document with each record's key. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function flattenTicketRecords(ticketsData) {
  return (ticketsData?.phases ?? []).flatMap((phase) => (phase.tickets ?? []).map((ticket) => ({
    key: ticketKeyOfRecord(phase.id, ticket.id),
    phaseId: phase.id,
    ticket,
  })));
}

/** The next real phase id. The PX phase is not an omission phase. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function nextOmissionPhaseId(phases) {
  const real = phases.filter((phase) => phase.id >= 0).map((phase) => phase.id);
  return real.length === 0 ? 0 : Math.max(...real) + 1;
}

/** Every key in a clone chain, including the ticket itself. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function cloneChainKeys({ ticketKey, ticketsData }) {
  const seen = new Set();
  let current = ticketKey;
  for (;;) {
    if (seen.has(current)) return seen;
    seen.add(current);
    const ticket = findTicketRecord(ticketsData, current);
    const next = ticket?.originalTicketKey ?? ticket?.origin?.sourceTicket ?? null;
    if (typeof next !== 'string' || next.length === 0 || next === current) return seen;
    current = next;
  }
}

/** Whether an open ticket owns the clause's contract. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function ownsContract(ticket, contractId) {
  if (typeof contractId !== 'string' || contractId.length === 0) return false;
  return (ticket?.contracts ?? []).some((contract) => String(contract.id) === contractId);
}

/**
 * Plan the minimal ticket set for one remainder, without writing.
 *
 * One open owner per canonical group is reused. A completed owner is never
 * reopened; an unproved clause under it becomes a remediation ticket whose
 * rootTicketKey points at the completed owner. At most one omission phase is
 * created, and a second identical call creates nothing.
 *
 * @param {{remainder:object[], ticketsData:object, phases:object[]}} input
 * @returns {{created:object[], reused:string[], reusedTickets:number, phasesCreated:number, backlog:object[], ticketsData:object, phases:object[]}}
 */
// [::TICKET::] PX-437, PX-442, PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-437|PX-442|PX-443) --for-spec --no-implementation-order`.
/** A schema-valid contract for a legacy entry without an inventory. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-443 --for-spec --no-implementation-order`.
function legacyContractOf(entry, ownerTicket) {
  const ownerContracts = Array.isArray(ownerTicket?.contracts) ? ownerTicket.contracts : [];
  const projected = ownerContracts.find((contract) => contract?.id === entry.contractId);
  if (projected !== undefined) return projected;
  const id = 'contract-omission-' + String(entry.contractId ?? 'unknown').replace(/[^A-Za-z0-9_.-]/g, '-');
  return {
    id,
    sourceEdge: 'omission:' + String(entry.group ?? 'group'),
    precondition: 'The measured clause is present in the source ticket',
    postcondition: 'The clause is proved by a fresh test',
    invariant: 'No detected clause is dropped',
  };
}

// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-443 --for-spec --no-implementation-order`.
function planLegacyTickets({ remainder, ticketsData, phases = null }) {
  const workingPhases = (phases ?? ticketsData?.phases ?? []).map((phase) => ({ ...phase, tickets: [...(phase.tickets ?? [])] }));
  const workingData = { ...(ticketsData ?? {}), phases: workingPhases };
  // Only tickets that existed before this plan can own a group. A ticket
  // created below must not be matched by key: a new phase can reuse a key that
  // an entry still names as its completed owner.
  const existingRecords = flattenTicketRecords(workingData);
  const groupOwner = new Map();
  const created = [];
  const reused = [];
  const backlog = [];
  // One plan call creates at most one omission phase. Recomputing the next id
  // per ticket would place every ticket in its own phase.
  const omissionPhaseId = nextOmissionPhaseId(workingPhases);

  for (const entry of remainder ?? []) {
    if (typeof entry?.key !== 'string' || entry.key.length === 0) {
      backlog.push(entry);
      continue;
    }
    const group = typeof entry.group === 'string' && entry.group.length > 0 ? entry.group : entry.key;
    if (groupOwner.has(group)) {
      if (!reused.includes(groupOwner.get(group))) reused.push(groupOwner.get(group));
      continue;
    }
    const owner = typeof entry.owner === 'string' && entry.owner.length > 0 ? entry.owner : null;
    const openOwner = existingRecords.find((record) => {
      if (isCompletedStatus(record.ticket.status)) return false;
      if (record.ticket.omissionStableKey === group) return true;
      // A remediation ticket belongs to exactly one group. It must not satisfy
      // the owner match for a different group that names the same owner: a new
      // phase can reuse the owner's key.
      const isRemediation = typeof record.ticket.omissionStableKey === 'string';
      if (!isRemediation && owner !== null && (record.key === owner || resolveRootTicketKey({ ticketKey: record.key, ticketsData: workingData }) === owner || cloneChainKeys({ ticketKey: record.key, ticketsData: workingData }).has(owner))) return true;
      return ownsContract(record.ticket, entry.contractId);
    });
    if (openOwner !== undefined) {
      groupOwner.set(group, openOwner.key);
      if (!reused.includes(openOwner.key)) reused.push(openOwner.key);
      continue;
    }

    const rootKey = owner === null ? null : resolveRootTicketKey({ ticketKey: owner, ticketsData: workingData });
    const ownerTicket = owner === null ? null : findTicketRecord(workingData, owner);
    let phase = workingPhases.find((candidate) => candidate.id === omissionPhaseId);
    if (phase === undefined) {
      phase = { id: omissionPhaseId, name: 'Omissions: canonical clause coverage', characteristics: '', tickets: [] };
      workingPhases.push(phase);
    }
    const nextId = phase.tickets.length === 0 ? 1 : Math.max(...phase.tickets.map((ticket) => ticket.id)) + 1;
    const ticket = {
      id: nextId,
      phaseId: omissionPhaseId,
      status: 'todo',
      title: 'Omission: ' + group,
      contracts: [legacyContractOf(entry, ownerTicket)],
      testUnit: [],
      testIntegration: [],
      acceptanceCriteria: [],
      omissionStableKey: group,
      rootTicketKey: rootKey,
      origin: { kind: 'omission', sourceTicket: rootKey },
    };
    phase.tickets.push(ticket);
    groupOwner.set(group, ticketKeyOfRecord(omissionPhaseId, nextId));
    created.push(ticket);
  }

  const phasesCreated = created.length > 0 ? 1 : 0;
  return {
    created,
    reused,
    reusedTickets: reused.length,
    phasesCreated,
    backlog,
    ticketsData: { ...workingData, phases: workingPhases },
    phases: workingPhases,
  };
}

const DEFAULT_BUDGET_FILE = path.join(__dirname, 'ticket-work-budget.json');

/** The calibrated budget, or a named refusal. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-443 --for-spec --no-implementation-order`.
function resolvePlanBudget(budget) {
  if (budget !== null && typeof budget === 'object' && !Array.isArray(budget)) return budget;
  const parsed = parseWorkBudget(readJson(DEFAULT_BUDGET_FILE, null));
  if (!parsed.valid) {
    const error = new Error('WORK_BUDGET_INVALID: ' + parsed.errors.join('; '));
    error.code = 'WORK_BUDGET_INVALID';
    throw error;
  }
  return parsed.budget;
}

/** A stable identity for the atoms one ticket covers. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-443 --for-spec --no-implementation-order`.
function omissionUnitKeyOf(atoms) {
  const digest = createHash('sha256')
    .update(atoms.map((atom) => atom.key).sort().join('\n'))
    .digest('hex')
    .slice(0, 16);
  return 'omission-unit:' + digest;
}

/** Union contracts by id; different clauses for one id are a defect. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-443 --for-spec --no-implementation-order`.
function mergeContractList(atoms) {
  const byId = new Map();
  for (const atom of atoms) {
    const serialized = JSON.stringify(atom.contract);
    const existing = byId.get(atom.contract.id);
    if (existing !== undefined && existing !== serialized) {
      const error = new Error('DUPLICATE_CONTRACT_ID: ' + atom.contract.id);
      error.code = 'DUPLICATE_CONTRACT_ID';
      throw error;
    }
    byId.set(atom.contract.id, serialized);
  }
  return [...byId.values()]
    .map((serialized) => JSON.parse(serialized))
    .sort((left, right) => left.id.localeCompare(right.id));
}

/** Group atoms into the ticket's omission payload. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-443 --for-spec --no-implementation-order`.
function omissionUnitsOf(atoms) {
  const byGroup = new Map();
  for (const atom of atoms) {
    const existing = byGroup.get(atom.group);
    if (existing === undefined) {
      byGroup.set(atom.group, {
        group: atom.group,
        contractId: atom.contractId,
        blockingClass: atom.blockingClass,
        clauses: [atom.key],
        rootTicketKey: atom.owner ?? null,
      });
      continue;
    }
    existing.clauses.push(atom.key);
    if (existing.rootTicketKey !== (atom.owner ?? null)) existing.rootTicketKey = null;
  }
  return [...byGroup.values()]
    .map((unit) => ({ ...unit, clauses: [...new Set(unit.clauses)].sort() }))
    .sort((left, right) => left.group.localeCompare(right.group));
}

/** Materialize one partition group as a ticket. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-443 --for-spec --no-implementation-order`.
function materializeOmissionTicket({ atoms, unitKey, phaseId, id }) {
  const stableKeys = [...new Set(atoms.map((atom) => atom.group))].sort();
  const owners = [...new Set(atoms.map((atom) => atom.owner).filter((owner) => typeof owner === 'string'))];
  const rootTicketKey = owners.length === 1 ? owners[0] : null;
  return {
    id,
    phaseId,
    status: 'todo',
    title: 'Omission remediation: ' + stableKeys.length + ' contract(s)',
    contracts: mergeContractList(atoms),
    testUnit: [...new Set(atoms.map((atom) => atom.plannedTest.id))],
    testIntegration: [],
    testExceptions: [],
    acceptanceCriteria: [],
    nodeIds: [],
    default_files: [],
    omissionUnitKey: unitKey,
    omissionUnitKeys: [unitKey],
    omissionStableKeys: stableKeys,
    omissionUnits: omissionUnitsOf(atoms),
    rootTicketKey,
    origin: { kind: 'omission', sourceTicket: rootTicketKey },
  };
}

/** Plan the contiguous partition minimum for measured implementation work. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-443 --for-spec --no-implementation-order`.
function planWorkUnitTickets({ remainder, inventory, ticketsData, phases = null, budget = null, context = {} }) {
  const workingPhases = (phases ?? ticketsData?.phases ?? []).map((phase) => ({ ...phase, tickets: [...(phase.tickets ?? [])] }));
  const workingData = { ...(ticketsData ?? {}), phases: workingPhases };
  const existingRecords = flattenTicketRecords(workingData);
  const { atoms, repairs, classifications, unprojectable } = atomsOfImplementation(remainder, inventory);
  const sortedAtoms = [...atoms].sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
  const budgetValue = resolvePlanBudget(budget);
  const pseudoTickets = sortedAtoms.map((atom, index) => ({
    id: index + 1,
    phaseId: -1,
    status: 'todo',
    nodeIds: [],
    default_files: [],
    testUnit: [atom.plannedTest.id],
    testIntegration: [],
  }));
  const partition = minimumContiguousPartition(pseudoTickets, context ?? {}, budgetValue, {
    components: WORKLOAD_COMPONENTS,
    mergeStatusPolicy: 'todo',
  });

  const omissionPhaseId = nextOmissionPhaseId(workingPhases);
  const created = [];
  const reused = [];
  let phase = null;

  for (const group of partition.groups) {
    const members = sortedAtoms.slice(group.start, group.end);
    const unitKey = omissionUnitKeyOf(members);
    const openOwner = existingRecords.find((record) => !isCompletedStatus(record.ticket.status)
      && (record.ticket.omissionUnitKeys ?? []).includes(unitKey));
    if (openOwner !== undefined) {
      if (!reused.includes(openOwner.key)) reused.push(openOwner.key);
      continue;
    }
    if (phase === null) {
      phase = { id: omissionPhaseId, name: 'Omissions: canonical clause coverage', characteristics: '', tickets: [] };
      workingPhases.push(phase);
    }
    const nextId = phase.tickets.length === 0 ? 1 : Math.max(...phase.tickets.map((ticket) => ticket.id)) + 1;
    const ticket = materializeOmissionTicket({ atoms: members, unitKey, phaseId: omissionPhaseId, id: nextId });
    phase.tickets.push(ticket);
    created.push(ticket);
  }

  return {
    created,
    reused,
    reusedTickets: reused.length,
    phasesCreated: created.length > 0 ? 1 : 0,
    backlog: [],
    repairs,
    classifications,
    unprojectable,
    ticketsData: { ...workingData, phases: workingPhases },
    phases: workingPhases,
  };
}

/**
 * Plan omission tickets.
 *
 * Measured classes route through the work-unit partition. A caller that has no
 * inventory keeps the legacy per-entry path; the find gate refuses a legacy plan.
 */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-443 --for-spec --no-implementation-order`.
function planOmissionTickets({ remainder, inventory = null, ticketsData, phases = null, budget = null, context = {} }) {
  const measured = inventory !== null
    && Array.isArray(remainder)
    && remainder.every((entry) => typeof entry?.blockingClass === 'string');
  if (!measured) {
    return { ...planLegacyTickets({ remainder, ticketsData, phases }), repairs: [], classifications: [], unprojectable: [] };
  }
  return planWorkUnitTickets({ remainder, inventory, ticketsData, phases, budget, context });
}

/** CLI entry point. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  const cwdArg = args.find((argument) => argument.startsWith('--cwd='));
  const reportArg = args.find((argument) => argument.startsWith('--report='));
  const cwd = path.resolve(cwdArg ? cwdArg.slice('--cwd='.length) : process.cwd());
  const reportPath = reportArg ? path.resolve(cwd, reportArg.slice('--report='.length)) : path.join(cwd, 'OMISSION-GAP-SCAN.json');
  const report = readJson(reportPath, null);
  if (report === null) {
    console.log(JSON.stringify({ ok: false, code: 'REPORT_MISSING', path: reportPath }));
    process.exit(1);
  }
  const result = applyFindings({ cwd, report, reportOnly: args.includes('--report-only') });
  console.log(JSON.stringify({ ok: true, createdTickets: result.createdTickets, backlog: result.backlog.length, designQueue: result.designQueue.length }));
}

if (require.main === module) main();
module.exports = { BACKLOG_FILE_NAME, DESIGN_QUEUE_FILE_NAME, INDEX_FILE_NAME, applyFindings, flattenTicketRecords, planOmissionTickets, sourceTicketOf };
