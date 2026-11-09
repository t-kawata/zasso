'use strict';

/**
 * condense-tickets — deterministic ticket condensation for an existing Tickets.json.
 *
 * The command is a thin entry point; the split final gate calls the same functions in
 * this module, so the two paths cannot diverge. The apply path is mechanical:
 * partition, merge, recompute derived fields, archive, write atomically, verify, and
 * restore the archive on any failure. A second identical apply writes nothing.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const {
  WORKLOAD_COMPONENTS,
  parseWorkBudget,
  collectPartitionFindings,
} = require('./lib/ticket-workload.js');
const {
  condensePlan,
  partitionDigest,
  ticketKeyOf,
  LEDGER_RECORD_FIELD,
} = require('./lib/ticket-partition.js');
const {
  attachPrerequisites,
  writeTicketDistributionAggregate,
  refreshTicketDistributionDigests,
  writeJsonAtomically,
  resolveReferenceSection,
} = require('./add-tickets-for-phase.js');
const { mergeContracts, registryForPackage } = require('./merge-contracts-to-tickets.js');
const { mergeFormulasToTickets } = require('./merge-formulas-to-tickets.js');
const { generateRelatedTicketIds } = require('./generate-related-ticket-ids.js');
const { remapTicketKeyReferences } = require('./consolidate-phase-tickets.js');
const { validateTickets } = require('../lib/validate-tickets.js');
const { buildNodeToFileMap } = require('../rfc-graph/validate-phasify.js');
const {
  findAllocateManifest,
  findSingleSiblingPath,
  TREE_MANIFEST_NAME,
} = require('../lib/package-artifacts.js');

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const EXIT_ARG_ERROR = 2;
const DEFAULT_BUDGET_PATH = path.join(__dirname, 'ticket-work-budget.json');
const ARCHIVE_PREFIX = 'Tickets.pre-condense-';
const EXCLUDED_SEGMENTS = new Set(['node_modules', '.git']);
const SKIP_UNSPLIT = 'unsplit';
const SKIP_MISSING_DIRECTORY = 'missing-directory';

// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function readJson(filePath) {
  if (typeof filePath !== 'string' || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function readText(filePath) {
  return typeof filePath === 'string' && fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function isExcludedRelative(relativePath) {
  const parts = relativePath.split(path.sep);
  if (parts.some((part) => EXCLUDED_SEGMENTS.has(part))) return true;
  return relativePath.includes(`${path.sep}tests${path.sep}fixtures${path.sep}`)
    || relativePath.startsWith(`tests${path.sep}fixtures${path.sep}`);
}

/** Package in a workspace with a readable ledger but no distribution artifacts. */
// [::TICKET::] PX-395 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-395 --for-spec --no-implementation-order`.
function readableTicketsDocument(directory) {
  try {
    return readJson(path.join(directory, 'Tickets.json'));
  } catch {
    return null;
  }
}

/** Root ledger that aggregates a workspace instead of naming one package. */
// [::TICKET::] PX-395 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-395 --for-spec --no-implementation-order`.
function isRootAggregate(root) {
  const hasLedger = fs.existsSync(path.join(root, 'Tickets.json'));
  const hasDistribution = fs.existsSync(path.join(root, 'RFC-GRAPH.json'))
    && fs.existsSync(path.join(root, 'RFC-Dirs-Tree.json'));
  return hasLedger && !hasDistribution;
}

/** Depth-first walk of the directories below a root, skipping excluded trees. */
// [::TICKET::] PX-395 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-395 --for-spec --no-implementation-order`.
function walkDirectories(root, visit) {
  const resolvedRoot = path.resolve(root);
  const walk = (directory) => {
    const relative = path.relative(resolvedRoot, directory);
    if (relative.length > 0 && isExcludedRelative(relative)) return;
    visit(directory, relative);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (EXCLUDED_SEGMENTS.has(entry.name)) continue;
      walk(path.join(directory, entry.name));
    }
  };
  walk(resolvedRoot);
}

/** Ledgers below the root that no manifest row names. */
// [::TICKET::] PX-395 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-395 --for-spec --no-implementation-order`.
function collectUnlistedPackages(root, manifestDirectories) {
  const unlisted = [];
  walkDirectories(root, (directory, relative) => {
    const ledgerPresent = fs.existsSync(path.join(directory, 'Tickets.json'));
    const isManifestPackage = manifestDirectories.has(path.resolve(directory));
    const isWorkspaceAggregate = relative.length === 0 && isRootAggregate(root);
    if (ledgerPresent && !isManifestPackage && !isWorkspaceAggregate) unlisted.push(directory);
  });
  return unlisted.sort();
}

/** Package directories that hold Tickets.json, RFC-GRAPH.json and RFC-Dirs-Tree.json. */
// [::TICKET::] PX-394, PX-395 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-394|PX-395) --for-spec --no-implementation-order`.
function discoverFilesystemPackages(root) {
  const found = [];
  walkDirectories(root, (directory, relative) => {
    if (relative.length === 0) return;
    if (!fs.existsSync(path.join(directory, 'Tickets.json'))) return;
    if (!fs.existsSync(path.join(directory, 'RFC-GRAPH.json'))) return;
    if (!fs.existsSync(path.join(directory, 'RFC-Dirs-Tree.json'))) return;
    found.push(directory);
  });
  return found.sort();
}

/** The package list a manifest workspace declares, with its skipped and unlisted rows. */
// [::TICKET::] PX-395 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-395 --for-spec --no-implementation-order`.
function discoverManifestPackages(root) {
  const resolvedRoot = path.resolve(root);
  const manifestPath = path.join(resolvedRoot, TREE_MANIFEST_NAME);
  let manifest = null;
  try {
    manifest = readJson(manifestPath);
  } catch {
    manifest = null;
  }
  if (manifest === null || !Array.isArray(manifest?.workspace?.packages)) {
    const error = new Error(`tree manifest is unreadable: ${manifestPath}`);
    error.code = 'MISSING_TREE_MANIFEST';
    throw error;
  }
  const targets = [];
  const skipped = [];
  const manifestDirectories = new Set();
  for (const row of manifest.workspace.packages) {
    if (typeof row?.path !== 'string') continue;
    const directory = path.resolve(resolvedRoot, row.path);
    if (manifestDirectories.has(directory)) continue;
    manifestDirectories.add(directory);
    if (!fs.existsSync(directory)) {
      skipped.push({ path: directory, reason: SKIP_MISSING_DIRECTORY });
      continue;
    }
    if (readableTicketsDocument(directory) === null) {
      skipped.push({ path: directory, reason: SKIP_UNSPLIT });
      continue;
    }
    targets.push(directory);
  }
  return {
    targets,
    skipped,
    unlisted: collectUnlistedPackages(resolvedRoot, manifestDirectories),
  };
}

/**
 * The workspace target set: manifest rows when the workspace declares them,
 * the legacy artifact walk otherwise.
 */
// [::TICKET::] PX-395 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-395 --for-spec --no-implementation-order`.
function discoverWorkspacePackages(root) {
  const resolvedRoot = path.resolve(root);
  if (fs.existsSync(path.join(resolvedRoot, TREE_MANIFEST_NAME))) {
    return { source: 'manifest', ...discoverManifestPackages(resolvedRoot) };
  }
  return {
    source: 'filesystem',
    targets: discoverFilesystemPackages(resolvedRoot),
    skipped: [],
    unlisted: [],
  };
}

/** PX-394 name for the filesystem walk; kept so existing callers cannot drift. */
const discoverPackages = discoverFilesystemPackages;

/** The budget document supplied as an option, a path, or the shipped default. */
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function resolveBudget(options = {}) {
  if (options.budget !== undefined && options.budget !== null) {
    return {
      budget: options.budget,
      components: options.components ?? WORKLOAD_COMPONENTS,
      mode: options.mode ?? 'v2',
      policy: options.policy ?? 'contiguous-minimum',
      path: null,
    };
  }
  const budgetPath = options.budgetPath ?? DEFAULT_BUDGET_PATH;
  const parsed = parseWorkBudget(readJson(budgetPath));
  if (!parsed.valid) {
    const error = new Error(parsed.errors.join('; '));
    error.code = 'WORK_BUDGET_INVALID';
    throw error;
  }
  return { budget: parsed.budget, components: parsed.components, mode: parsed.mode, policy: parsed.policy ?? 'merge-evidence', path: budgetPath };
}

/** Load the artifacts a package's condensation reads. */
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
async function loadArtifacts(options = {}) {
  const ticketsPath = path.resolve(options.ticketsPath ?? path.join(options.cwd ?? process.cwd(), 'Tickets.json'));
  const directory = path.dirname(ticketsPath);
  const graphPath = options.graphPath ?? path.join(directory, 'RFC-GRAPH.json');
  const dirsTreePath = options.dirsTreePath ?? path.join(directory, 'RFC-Dirs-Tree.json');
  const viewPath = options.viewPath ?? path.join(directory, 'SEQUENCES.json');
  const allocatePath = findAllocateManifest(directory);
  const workspaceRoot = allocatePath === null ? null : path.dirname(allocatePath);
  const registryRows = allocatePath === null ? [] : (readJson(allocatePath)?.contract_registry ?? []);
  const artifactPath = options.artifactPath
    ?? (workspaceRoot === null ? null : findSingleSiblingPath(workspaceRoot, '-sequences.json'));
  const rfcPath = path.join(directory, 'RFC.md');
  const map = readText(rfcPath) === null
    ? null
    : (await import('../rfc-graph/lib/unit-ids.mjs')).readDistributionMap(readText(rfcPath));
  return {
    ticketsPath,
    directory,
    workspaceRoot,
    graph: readJson(graphPath),
    dirsTree: readJson(dirsTreePath),
    view: readJson(viewPath),
    map,
    artifactPath,
    stepSidecar: readJson(path.join(directory, 'RFC-STEP-CONTRACTS.json')),
    formulaSidecarPath: fs.existsSync(path.join(directory, 'RFC-FORMULAS.json')) ? path.join(directory, 'RFC-FORMULAS.json') : null,
    registry: registryRows,
    ticketsDocument: readJson(ticketsPath),
    ...resolveBudget(options),
  };
}

/** The context the workload and partition read. */
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function buildWorkloadContext(artifacts) {
  return {
    graph: artifacts.graph,
    dirsTree: artifacts.dirsTree,
    view: artifacts.view,
    nodeToFileMap: artifacts.dirsTree === null ? {} : buildNodeToFileMap(artifacts.dirsTree),
  };
}

/** Build the condensation plan without writing anything. */
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function buildPlan(artifacts, options = {}) {
  if (artifacts.ticketsDocument === null || artifacts.ticketsDocument === undefined) {
    const error = new Error('Tickets.json is unreadable');
    error.code = 'TICKETS_MISSING';
    throw error;
  }
  const context = buildWorkloadContext(artifacts);
  const skipped = context.graph === null || context.dirsTree === null || context.view === null
    ? 'no-distribution'
    : null;
  const phases = (artifacts.ticketsDocument.phases ?? []).map((phase) => (
    condensePlan(phase, context, artifacts.budget, {
      components: artifacts.components,
      preserveCompleted: artifacts.preserveCompleted === true,
      merge: options.merge !== false,
      rebuildContracts: options.rebuildContracts === true,
    })
  ));
  const totalBefore = phases.reduce((total, phase) => total + phase.before, 0);
  const totalAfter = phases.reduce((total, phase) => total + phase.after, 0);
  const digest = createHash('sha256')
    .update(phases.map((phase) => phase.digest).join(':'))
    .digest('hex');
  return { phases, totalBefore, totalAfter, digest, skipped };
}

/** A sequence unit carries an ordered step subset. */
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function isSequenceKind(kind) {
  return kind === 'sequence' || kind === 'cross-boundary-sequence';
}

/** Union two step lists by stepId, preserving the declared order. */
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function unionSteps(left, right) {
  const byId = new Map();
  for (const step of [...(left ?? []), ...(right ?? [])]) {
    if (typeof step?.stepId === 'string') byId.set(step.stepId, step);
  }
  return [...byId.values()].sort((first, second) => (first.order ?? 0) - (second.order ?? 0));
}

/** Merge two records of the same unit from two adjacent tickets. */
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function mergeUnitRecord(existing, incoming) {
  if (isSequenceKind(existing.kind) && isSequenceKind(incoming.kind)) {
    const left = existing.obligation ?? {};
    const right = incoming.obligation ?? {};
    const steps = unionSteps(left.steps, right.steps);
    const mode = left.mode === 'steps' || right.mode === 'steps' || steps.length > 0 ? 'steps' : (left.mode ?? right.mode ?? 'flow');
    existing.obligation = {
      mode,
      outcome: left.outcome ?? right.outcome ?? null,
      ...(mode === 'steps' ? { steps } : {}),
    };
    if (incoming.role === 'implementer') existing.role = 'implementer';
    return;
  }
  if (existing.kind === 'operation' && incoming.kind === 'operation') {
    // One operation has one implementer. If the absorbed ticket implemented it and the
    // survivor referenced it, the survivor takes over the implementation.
    if (incoming.obligation?.mode === 'implement' && existing.obligation?.mode !== 'implement') {
      existing.obligation = JSON.parse(JSON.stringify(incoming.obligation));
      existing.role = 'implementer';
    } else if (incoming.role === 'implementer') {
      existing.role = 'implementer';
    }
    return;
  }
  if (existing.obligation === undefined || existing.obligation === null) {
    existing.obligation = incoming.obligation === undefined || incoming.obligation === null
      ? existing.obligation
      : JSON.parse(JSON.stringify(incoming.obligation));
  }
}

/**
 * The distribution of a merged group, built from the split-time per-ticket records.
 *
 * Re-deriving from the current view would let a newer view overwrite a role or step
 * assignment the existing split recorded. Condensation owns the ticket boundary, not
 * the distribution; it therefore unions the records and lets the coverage gates prove
 * the result.
 */
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function mergeGroupDistribution(originalTicketsByKey, group) {
  const members = group.members
    .map((key) => originalTicketsByKey.get(key))
    .filter((ticket) => ticket !== undefined);
  if (members.length === 0) return null;
  const source = members.find((ticket) => ticket.distribution !== undefined)?.distribution;
  if (source === undefined || source === null) return null;
  const unitById = new Map();
  for (const ticket of members) {
    for (const unit of ticket.distribution?.units ?? []) {
      const cloned = JSON.parse(JSON.stringify(unit));
      const existing = unitById.get(cloned.unitId);
      if (existing === undefined) unitById.set(cloned.unitId, cloned);
      else mergeUnitRecord(existing, cloned);
    }
  }
  return {
    sourceMapDigest: source.sourceMapDigest ?? null,
    sourceViewDigest: source.sourceViewDigest ?? null,
    units: [...unitById.values()].sort((first, second) => first.unitId.localeCompare(second.unitId)),
    digest: null,
  };
}

/** Attach the merged distribution to each planned survivor. */
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function applyGroupDistributions(plan, originalTicketsByKey) {
  for (const phasePlan of plan.phases ?? []) {
    for (let index = 0; index < phasePlan.groups.length; index += 1) {
      const distribution = mergeGroupDistribution(originalTicketsByKey, phasePlan.groups[index]);
      if (distribution !== null) phasePlan.tickets[index].distribution = distribution;
    }
  }
}

/** Every absorbed key mapped to the survivor that now owns it. */
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function buildKeyMap(plan) {
  const keyMap = new Map();
  for (const phasePlan of plan.phases ?? []) {
    for (const group of phasePlan.groups ?? []) {
      const survivor = group.members[0];
      for (const member of group.members.slice(1)) keyMap.set(member, survivor);
    }
  }
  return keyMap;
}

/** Every absorbed contract id paired with the survivor that absorbed it. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function collectLedgerContractIds(document) {
  const entries = [];
  for (const entry of collectLedgerTickets(document)) {
    for (const contract of entry[LEDGER_RECORD_FIELD]?.contracts ?? []) {
      entries.push({ contractId: contract.id, ownerKey: entry.originKey });
    }
  }
  return entries;
}

/** Every ledger record carried by the document. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function collectLedgerTickets(document) {
  const entries = [];
  for (const phase of document.phases ?? []) {
    for (const ticket of phase.tickets ?? []) {
      for (const entry of ticket.condensedFrom?.tickets ?? []) entries.push(entry);
    }
  }
  return entries;
}

/** How many absorbed records the document carries. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function countLedgerRecords(document) {
  return collectLedgerTickets(document).length;
}

/**
 * Audit contract ownership across the package.
 *
 * A contract absent from the survivor is not a loss when another ticket in the
 * same package owns it. Only an id owned nowhere is `CONTRACT_NOT_REBUILT`.
 */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function auditContractOwnership(tickets, absorbedContractIds) {
  const owned = new Set();
  for (const ticket of tickets) {
    for (const contract of ticket.contracts ?? []) owned.add(contract.id);
  }
  return absorbedContractIds
    .map((entry) => (typeof entry === 'string' ? { contractId: entry, ownerKey: null } : entry))
    .filter((entry) => !owned.has(entry.contractId))
    .map((entry) => ({ code: 'CONTRACT_NOT_REBUILT', contractId: entry.contractId, ownerKey: entry.ownerKey }));
}

/**
 * Re-attach a missing contract from the absorbed ticket's ledger record.
 *
 * The graph and sidecar remain the authority for derived contracts. This repair
 * only restores a clause the merge dropped; the package gates still prove the
 * reconstructed document before it is written.
 */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function repairContractsFromLedger(tickets, findings, ledgerTickets) {
  const contractById = new Map();
  const ownerByContractId = new Map();
  for (const entry of ledgerTickets) {
    for (const contract of entry[LEDGER_RECORD_FIELD]?.contracts ?? []) {
      if (!contractById.has(contract.id)) contractById.set(contract.id, contract);
      if (!ownerByContractId.has(contract.id)) ownerByContractId.set(contract.id, entry.originKey);
    }
  }
  const ticketByKey = new Map(tickets.map((ticket) => [ticketKeyOf(ticket), ticket]));
  const remaining = [];
  for (const finding of findings) {
    const contract = contractById.get(finding.contractId);
    const ownerKey = finding.ownerKey ?? ownerByContractId.get(finding.contractId);
    const owner = ownerKey === null || ownerKey === undefined ? undefined : ticketByKey.get(ownerKey);
    if (contract === undefined || owner === undefined) {
      remaining.push(finding);
      continue;
    }
    owner.contracts = owner.contracts ?? [];
    if (!owner.contracts.some((entry) => entry.id === contract.id)) {
      owner.contracts.push(JSON.parse(JSON.stringify(contract)));
    }
  }
  return remaining;
}

/** Prove every survivor carries a complete ledger record. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function auditLedgerCompleteness(document) {
  const findings = [];
  for (const phase of document.phases ?? []) {
    for (const ticket of phase.tickets ?? []) {
      const condensed = ticket.condensedFrom;
      if (condensed === undefined || condensed === null) continue;
      const ticketKey = ticketKeyOf(ticket);
      if (typeof condensed.originKey !== 'string' || condensed.originKey.length === 0) {
        findings.push({ code: 'CONDENSE_LEDGER_INVALID', ticketKey, detail: 'originKey is missing' });
      }
      for (const entry of condensed.tickets ?? []) {
        if (entry[LEDGER_RECORD_FIELD] === undefined || entry[LEDGER_RECORD_FIELD] === null) {
          findings.push({ code: 'CONDENSE_LEDGER_INVALID', ticketKey, detail: `${entry.key} has no record` });
        }
      }
    }
  }
  return findings;
}

/** Recompute every derived field after the partition changed. */
// [::TICKET::] PX-394, PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-394|PX-396) --for-spec --no-implementation-order`.
async function rehydrate(artifacts, document, decisions = {}) {
  const hasDistribution = artifacts.graph !== null && artifacts.dirsTree !== null && artifacts.view !== null;
  if ((decisions.keyMap ?? new Map()).size > 0) {
    document.phases = remapTicketKeyReferences(document, decisions.keyMap).phases;
  }

  const allTickets = (document.phases ?? []).flatMap((phase) => (phase.tickets ?? []).map((ticket) => {
    ticket.phaseId = phase.id;
    return ticket;
  }));

  if (artifacts.graph !== null) {
    mergeContracts(allTickets, artifacts.graph, registryForPackage(artifacts.registry, artifacts.view), artifacts.stepSidecar);
    const relatedMap = generateRelatedTicketIds(allTickets, artifacts.graph.edges ?? []);
    for (const ticket of allTickets) {
      const related = relatedMap.get(`${ticket.phaseId}:${ticket.id}`);
      if (related) ticket.relatedTicketIds = related;
      else delete ticket.relatedTicketIds;
      const reference = resolveReferenceSection(ticket.nodeIds, artifacts.graph.nodes ?? [], artifacts.graph.sourceFile ?? 'RFC.md');
      // referenceSection is authored evidence. The graph may fill an absent field,
      // but it never overwrites or deletes a value a ticket already carries.
      const hasAuthoredReference = typeof ticket.referenceSection === 'string' && ticket.referenceSection.trim().length > 0;
      if (!hasAuthoredReference && reference.length > 0) ticket.referenceSection = reference;
      else if (!hasAuthoredReference) delete ticket.referenceSection;
    }
  }

  if (artifacts.formulaSidecarPath !== null) {
    const formulaResult = mergeFormulasToTickets({
      cwd: artifacts.directory,
      ticketsDocument: document,
      sidecarPath: artifacts.formulaSidecarPath,
      write: false,
    });
    if (formulaResult.ok === false) {
      const error = new Error(formulaResult.findings.map((entry) => `${entry.code}: ${entry.message}`).join('; '));
      error.code = 'FORMULA_MERGE_FAILED';
      throw error;
    }
  }

  if (hasDistribution) {
    attachPrerequisites({
      ticketsDocument: document,
      graphData: artifacts.graph,
      view: artifacts.view,
      packageDirectory: artifacts.directory,
      map: artifacts.map,
    });
    writeTicketDistributionAggregate(document);
    refreshTicketDistributionDigests(document.phases ?? []);
  }
}

/** The version-3 partition findings for every phase of a document. */
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function partitionFindingsForDocument(artifacts, document) {
  if (artifacts.graph === null || artifacts.dirsTree === null || artifacts.view === null) return [];
  const context = buildWorkloadContext(artifacts);
  const findings = [];
  for (const phase of document.phases ?? []) {
    findings.push(...collectPartitionFindings(phase, artifacts.budget, context, {
      components: artifacts.components,
      preserveCompleted: artifacts.preserveCompleted !== false,
    }));
  }
  return findings;
}

/** Run the post-write gates for a package. */
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function runGates(artifacts, document) {
  const partitionFindings = partitionFindingsForDocument(artifacts, document);
  if (partitionFindings.length > 0) {
    const error = new Error(partitionFindings.map((entry) => `${entry.code}: ${entry.message}`).join('; '));
    error.code = 'CONDENSE_GATE_FAILED';
    throw error;
  }
  const scripts = [
    ['tickets/verify-all-ticket-coverage.js', [artifacts.ticketsPath]],
    ['tickets/verify-ticket-closure.js', [`--tickets=${artifacts.ticketsPath}`]],
  ];
  if (artifacts.artifactPath !== null) {
    scripts.push([
      'sequences-slice/verify-chain.mjs',
      ['--stage=split', `--package=${artifacts.directory}`, `--artifact=${artifacts.artifactPath}`, '--require-tickets'],
    ]);
  }
  scripts.push(['sequences-slice/verify-implementation-order.mjs', [`--package=${artifacts.directory}`, '--write']]);
  for (const [relative, args] of scripts) {
    const result = spawnSync(process.execPath, [path.join(__dirname, '..', resolveScriptRoot(relative), path.basename(relative)), ...args], { encoding: 'utf8' });
    if (result.status !== 0) {
      const error = new Error(`${relative}: ${(result.stderr || result.stdout || '').trim()}`);
      error.code = 'CONDENSE_GATE_FAILED';
      throw error;
    }
  }
}

// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function resolveScriptRoot(relative) {
  return relative.split('/')[0];
}

/** Undo a failed apply from the archive. */
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function restoreArchive(archivePath, ticketsPath) {
  if (!fs.existsSync(archivePath)) return;
  fs.copyFileSync(archivePath, ticketsPath);
}

/**
 * Apply the plan.
 *
 * @param {object} options — { ticketsPath, cwd, budget, verify, preserveCompleted, ...artifact overrides }
 * @returns {Promise<object>}
 */
// [::TICKET::] PX-394, PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-394|PX-396) --for-spec --no-implementation-order`.
async function applyPlan(options = {}) {
  const artifacts = await loadArtifacts(options);
  artifacts.preserveCompleted = options.preserveCompleted !== false;
  const plan = buildPlan(artifacts, { merge: true, rebuildContracts: artifacts.graph !== null });
  if (plan.totalBefore === plan.totalAfter) {
    return {
      ok: true,
      noChange: true,
      before: plan.totalBefore,
      after: plan.totalAfter,
      digest: plan.digest,
      skipped: plan.skipped,
      ledgerRecords: countLedgerRecords(artifacts.ticketsDocument),
      repaired: 0,
    };
  }

  const originalBytes = fs.readFileSync(artifacts.ticketsPath, 'utf8');
  const document = JSON.parse(originalBytes);
  const originalTicketsByKey = new Map();
  for (const phase of artifacts.ticketsDocument.phases ?? []) {
    for (const ticket of phase.tickets ?? []) originalTicketsByKey.set(ticketKeyOf({ ...ticket, phaseId: phase.id }), ticket);
  }
  const keyMap = buildKeyMap(plan);
  applyGroupDistributions(plan, originalTicketsByKey);
  document.phases = (document.phases ?? []).map((phase) => {
    const phasePlan = plan.phases.find((candidate) => candidate.phaseId === phase.id);
    return { ...phase, tickets: phasePlan === undefined ? phase.tickets : phasePlan.tickets };
  });

  try {
    await rehydrate(artifacts, document, { keyMap });
  } catch (error) {
    return { ok: false, code: error.code ?? 'CONDENSE_REHYDRATE_FAILED', error: error.message };
  }

  const allTickets = [];
  for (const phase of document.phases ?? []) {
    for (const ticket of phase.tickets ?? []) {
      ticket.phaseId = phase.id;
      allTickets.push(ticket);
    }
  }
  const ledgerTickets = collectLedgerTickets(document);
  const absorbedContracts = collectLedgerContractIds(document);
  const contractFindings = auditContractOwnership(allTickets, absorbedContracts);
  const remainingFindings = repairContractsFromLedger(allTickets, contractFindings, ledgerTickets);
  if (remainingFindings.length > 0) {
    return { ok: false, code: 'CONTRACT_NOT_REBUILT', findings: remainingFindings };
  }

  const validation = validateTickets(document);
  if (!validation.valid) {
    return { ok: false, code: 'CONDENSE_VALIDATION_FAILED', errors: validation.errors };
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archivePath = path.join(artifacts.directory, `${ARCHIVE_PREFIX}${stamp}.json`);
  fs.copyFileSync(artifacts.ticketsPath, archivePath);
  writeJsonAtomically(artifacts.ticketsPath, document);

  try {
    if (typeof options.verify === 'function') {
      const verdict = await options.verify({ artifacts, document });
      if (verdict !== undefined && verdict !== null && verdict.ok === false) {
        throw Object.assign(new Error('verification returned not ok'), { code: verdict.code ?? 'CONDENSE_GATE_FAILED' });
      }
    } else {
      runGates(artifacts, document);
    }
  } catch (error) {
    restoreArchive(archivePath, artifacts.ticketsPath);
    return { ok: false, code: error.code ?? 'CONDENSE_GATE_FAILED', error: error.message };
  }

  return {
    ok: true,
    noChange: false,
    before: plan.totalBefore,
    after: plan.totalAfter,
    digest: plan.digest,
    archivePath,
    skipped: plan.skipped,
    ledgerRecords: ledgerTickets.length,
    repaired: contractFindings.length - remainingFindings.length,
  };
}

/** The read-only gate used by the split final step. */
// [::TICKET::] PX-394, PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-394|PX-396) --for-spec --no-implementation-order`.
async function gateTickets(options = {}) {
  const artifacts = await loadArtifacts(options);
  artifacts.preserveCompleted = options.preserveCompleted !== false;
  const plan = buildPlan(artifacts, { merge: false });
  if (plan.totalBefore !== plan.totalAfter) {
    const findings = plan.phases
      .filter((phase) => phase.before !== phase.after)
      .map((phase) => `P${phase.phaseId}: ${phase.before} -> ${phase.after}`);
    return { ok: false, code: 'CONDENSE_REQUIRED', findings, plan };
  }
  const partitionFindings = partitionFindingsForDocument(artifacts, artifacts.ticketsDocument);
  if (partitionFindings.length > 0) {
    return {
      ok: false,
      code: 'CONDENSE_REQUIRED',
      findings: partitionFindings.map((entry) => `${entry.code}: ${entry.message}`),
      plan,
    };
  }
  const ledgerFindings = auditLedgerCompleteness(artifacts.ticketsDocument);
  if (ledgerFindings.length > 0) {
    return {
      ok: false,
      code: 'CONDENSE_LEDGER_INVALID',
      findings: ledgerFindings.map((entry) => `${entry.code}: ${entry.ticketKey} ${entry.detail}`),
      plan,
    };
  }
  const allTickets = (artifacts.ticketsDocument.phases ?? [])
    .flatMap((phase) => (phase.tickets ?? []));
  const contractFindings = auditContractOwnership(allTickets, collectLedgerContractIds(artifacts.ticketsDocument));
  if (contractFindings.length > 0) {
    return {
      ok: false,
      code: 'CONTRACT_NOT_REBUILT',
      findings: contractFindings.map((entry) => `${entry.code}: ${entry.contractId}`),
      plan,
    };
  }
  return { ok: true, plan };
}

/** Render a plan as Markdown. */
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function renderPlan(plan, label) {
  const lines = [`# Condense plan: ${label}`, '', `Tickets: ${plan.totalBefore} -> ${plan.totalAfter}`, ''];
  for (const phase of plan.phases) {
    lines.push(`## P${phase.phaseId}: ${phase.before} -> ${phase.after}`);
    for (const group of phase.groups) {
      const members = group.members.join(', ');
      lines.push(`- [${members}] budget=${JSON.stringify(group.workload)}${group.irreducible ? ' irreducible' : ''}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    plan: args.includes('--plan'),
    apply: args.includes('--apply'),
    gate: args.includes('--gate'),
    workspace: null,
    ticketsPath: null,
    budgetPath: null,
    out: null,
    preserveCompleted: !args.includes('--no-preserve-completed'),
  };
  for (const arg of args) {
    if (arg.startsWith('--workspace=')) options.workspace = arg.slice('--workspace='.length);
    else if (arg.startsWith('--tickets=')) options.ticketsPath = arg.slice('--tickets='.length);
    else if (arg.startsWith('--budget=')) options.budgetPath = arg.slice('--budget='.length);
    else if (arg.startsWith('--out=')) options.out = arg.slice('--out='.length);
  }
  return options;
}

/** Run one package action and return a typed result entry. */
// [::TICKET::] PX-395 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-395 --for-spec --no-implementation-order`.
async function runPackageAction(packageOptions, directory) {
  if (packageOptions.plan) {
    const artifacts = await loadArtifacts(packageOptions);
    return { kind: 'plan', directory, plan: buildPlan(artifacts, { merge: false }) };
  }
  if (packageOptions.gate) {
    const result = await gateTickets(packageOptions);
    if (!result.ok) throw Object.assign(new Error(result.findings.join('; ')), { code: result.code });
    return { kind: 'gate', directory, result };
  }
  const result = await applyPlan(packageOptions);
  if (!result.ok) throw Object.assign(new Error(result.error ?? result.code), { code: result.code });
  return { kind: 'apply', directory, result };
}

/** Regenerate the workspace implementation order once. */
// [::TICKET::] PX-395 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-395 --for-spec --no-implementation-order`.
function runWorkspaceOrderWriter(workspaceRoot) {
  const script = path.join(__dirname, '..', 'sequences-slice', 'verify-implementation-order.mjs');
  const result = spawnSync(process.execPath, [script, `--workspace=${workspaceRoot}`, '--write'], { encoding: 'utf8' });
  if (result.status !== 0) {
    return {
      ok: false,
      code: 'WORKSPACE_ORDER_FAILED',
      message: (result.stderr || result.stdout || '').trim(),
    };
  }
  return { ok: true };
}

/**
 * Run every manifest package.
 *
 * A package failure is carried into the summary instead of throwing, so one broken
 * package never suppresses the remaining targets or their independent archives.
 */
// [::TICKET::] PX-395, PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-395|PX-396) --for-spec --no-implementation-order`.
async function runWorkspace(options) {
  const workspaceRoot = path.resolve(options.workspace);
  const discovery = discoverWorkspacePackages(workspaceRoot);
  const summary = {
    source: discovery.source,
    targetCount: discovery.targets.length,
    applied: 0,
    noChange: 0,
    repaired: 0,
    ledgerRecords: 0,
    failed: [],
    skipped: discovery.skipped,
    unlisted: discovery.unlisted,
    results: [],
    orderWritten: false,
  };
  for (const directory of discovery.targets) {
    const packageOptions = { ...options, ticketsPath: path.join(directory, 'Tickets.json') };
    try {
      const entry = await runPackageAction(packageOptions, directory);
      summary.results.push(entry);
      if (entry.kind === 'apply') {
        if (entry.result.noChange) summary.noChange += 1;
        else summary.applied += 1;
        summary.repaired += entry.result.repaired ?? 0;
        summary.ledgerRecords += entry.result.ledgerRecords ?? 0;
      }
    } catch (error) {
      summary.failed.push({
        directory,
        code: error.code ?? 'CONDENSE_FAILED',
        error: error.message,
      });
    }
  }
  if (options.apply && summary.applied > 0) {
    const writeWorkspaceOrder = options.writeWorkspaceOrder ?? runWorkspaceOrderWriter;
    const verdict = writeWorkspaceOrder(workspaceRoot);
    if (verdict.ok === false) {
      summary.failed.push({
        directory: workspaceRoot,
        code: verdict.code ?? 'WORKSPACE_ORDER_FAILED',
        error: verdict.message ?? '',
      });
    } else {
      summary.orderWritten = true;
    }
  }
  return summary;
}

/** One Markdown block per package result. */
// [::TICKET::] PX-395 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-395 --for-spec --no-implementation-order`.
function renderWorkspaceEntry(entry) {
  if (entry.kind === 'plan') return renderPlan(entry.plan, entry.directory).trimEnd();
  if (entry.kind === 'gate') return `gate ${entry.directory}: GATE_OK`;
  const result = entry.result;
  const suffix = result.noChange ? ' NO_CHANGE' : '';
  return `condense ${entry.directory}: ${result.before} -> ${result.after}${suffix}`;
}

/** The workspace report: discovery counts, package results, skips, unlisted, failures. */
// [::TICKET::] PX-395, PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-395|PX-396) --for-spec --no-implementation-order`.
function renderWorkspaceReport(summary, workspaceRoot) {
  const lines = [
    `workspace ${workspaceRoot}: source=${summary.source} targets=${summary.targetCount} skipped=${summary.skipped.length} unlisted=${summary.unlisted.length}`,
  ];
  for (const entry of summary.results) lines.push(renderWorkspaceEntry(entry));
  for (const entry of summary.skipped) lines.push(`skipped ${entry.path}: ${entry.reason}`);
  for (const directory of summary.unlisted) lines.push(`unlisted ${directory}`);
  for (const failure of summary.failed) lines.push(`FAILED ${failure.directory} ${failure.code}: ${failure.error}`);
  lines.push(`workspace summary: applied=${summary.applied} noChange=${summary.noChange} repaired=${summary.repaired} ledgerRecords=${summary.ledgerRecords} failed=${summary.failed.length} skipped=${summary.skipped.length} unlisted=${summary.unlisted.length}`);
  return `${lines.join('\n')}\n`;
}

// [::TICKET::] PX-394, PX-395 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-394|PX-395) --for-spec --no-implementation-order`.
async function main(argv = process.argv) {
  const options = parseArgs(argv);
  if (options.workspace !== null) {
    const summary = await runWorkspace(options);
    process.stdout.write(renderWorkspaceReport(summary, path.resolve(options.workspace)));
    return summary.failed.length > 0 ? EXIT_FAILURE : EXIT_SUCCESS;
  }
  const packageOptions = { ...options };
  if (options.plan) {
    const artifacts = await loadArtifacts(packageOptions);
    const plan = buildPlan(artifacts, { merge: false });
    const markdown = renderPlan(plan, artifacts.directory);
    if (options.out !== null) fs.writeFileSync(options.out, markdown);
    else process.stdout.write(markdown);
    return EXIT_SUCCESS;
  }
  if (options.gate) {
    const result = await gateTickets(packageOptions);
    if (!result.ok) {
      process.stderr.write(`${result.code}: ${result.findings.join('; ')}\n`);
      return EXIT_FAILURE;
    }
    return EXIT_SUCCESS;
  }
  if (options.apply) {
    const result = await applyPlan(packageOptions);
    if (!result.ok) {
      process.stderr.write(`${result.code}: ${result.error ?? JSON.stringify(result.errors ?? [])}\n`);
      return EXIT_FAILURE;
    }
    process.stdout.write(`condense: ${result.before} -> ${result.after}${result.noChange ? ' NO_CHANGE' : ''}\n`);
    return EXIT_SUCCESS;
  }
  process.stderr.write('Usage: condense-tickets.js --plan|--apply|--gate [--tickets=<Tickets.json>] [--workspace=<root>]\n');
  return EXIT_ARG_ERROR;
}

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((error) => {
    process.stderr.write(`${error.code ?? 'CONDENSE_FAILED'}: ${error.message}\n`);
    process.exit(EXIT_FAILURE);
  });
}

module.exports = {
  discoverPackages,
  discoverFilesystemPackages,
  discoverManifestPackages,
  discoverWorkspacePackages,
  loadArtifacts,
  buildPlan,
  applyPlan,
  gateTickets,
  rehydrate,
  auditContractOwnership,
  repairContractsFromLedger,
  auditLedgerCompleteness,
  collectLedgerTickets,
  collectLedgerContractIds,
  countLedgerRecords,
  renderPlan,
  renderWorkspaceReport,
  runGates,
  runWorkspace,
  runWorkspaceOrderWriter,
  parseArgs,
};
