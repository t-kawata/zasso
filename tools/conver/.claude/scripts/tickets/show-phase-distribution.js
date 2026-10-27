#!/usr/bin/env node
/**
 * show-phase-distribution — the machine-readable distribution a split judgment must obey.
 *
 * The split AI may decide which nodes form a ticket, but it may not invent the sequence
 * steps, the operation roles or the boundary clauses it is grouping. This script prints
 * that material before the AI judges, so the judgment is constrained by the same ledger
 * the verifiers read afterwards.
 *
 * Usage:
 *   node show-phase-distribution.js --tickets=<Tickets.json> --phase=P0 [--view=<SEQUENCES.json>] [--graph=<GRAPH.json>] [--dirs-tree=<Dirs-Tree.json>] [--registry=<ALLOCATE-MANIFEST.json>] [--artifact=<root *-sequences.json>]
 */
const fs = require('fs');
const path = require('path');

const { collectViewUnits } = require('../sequences-slice/lib/distribution-map.mjs');
const { boundaryClauseDigest } = require('../sequences-slice/lib/boundary-contract.mjs');
const { findAllocateManifest } = require('../lib/package-artifacts');
const {
  OPERATION_OBLIGATION_FIELDS,
  renderObligationValue,
} = require('./show-ticket-context.js');

// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function argumentFor(argv, name) {
  const inline = argv.find((entry) => entry.startsWith(`--${name}=`));
  if (inline !== undefined) return inline.slice(`--${name}=`.length);
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? null : argv[index + 1] ?? null;
}

// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function readJson(filePath) {
  return filePath !== null && fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : null;
}

// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function readRegistry(filePath) {
  const document = readJson(filePath);
  if (document === null) return [];
  return Array.isArray(document) ? document : document.contract_registry ?? [];
}

// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function formatSteps(record) {
  return (record?.steps ?? [])
    .slice()
    .sort((left, right) => (left.order ?? left.line ?? 0) - (right.order ?? right.line ?? 0))
    .map((step) => `${step.stepId ?? step.id}(${step.operationId ?? step.operation ?? '?'})`)
    .join(' -> ') || '(no steps)';
}

// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function formatClauses(row) {
  const clauses = row?.clauses ?? {};
  return [
    `precondition: ${(clauses.preconditions ?? []).join(' | ') || '(none)'}`,
    `postcondition: ${(clauses.postconditions ?? []).join(' | ') || '(none)'}`,
    `invariant: ${(clauses.invariants ?? []).join(' | ') || '(none)'}`,
    `digest: ${boundaryClauseDigest(row)}`,
  ].join('; ');
}

/** The phase node ids a phase names, or every graph node when the phase names none. */
// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function phaseNodes(phase, graph) {
  const named = new Set(Array.isArray(phase?.nodeIds) ? phase.nodeIds : []);
  return (graph?.nodes ?? []).filter((node) => named.size === 0 || named.has(node.id));
}

/**
 * Render one phase distribution.
 *
 * @param {{ phase: object, view: object, graph: object, dirsTree?: object, registry?: Array<object>, artifact?: object|null }} input
 * @returns {string}
 */
// [::TICKET::] PX-312, PX-313, PX-315, PX-321, PX-322 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313|PX-315|PX-321|PX-322) --for-spec --no-implementation-order`.
function renderPhaseDistribution({ phase, view, graph, dirsTree = null, registry = [], artifact = null } = {}) {
  const lines = [];
  const phaseLabel = phase?.id === undefined ? 'PX' : `P${phase.id}`;
  lines.push(`# Phase ${phaseLabel}: ${phase?.name ?? ''}`.trim());
  if (phase?.summary) lines.push('', phase.summary);
  lines.push('', '## Nodes');
  for (const node of phaseNodes(phase, graph)) {
    const paths = (dirsTree?.distribution?.units ?? {});
    const nodePaths = [...new Set((node.unitIds ?? []).flatMap((unitId) => paths[unitId]?.paths ?? []))];
    lines.push(`- ${node.id}: units=${(node.unitIds ?? []).join(',') || '(none)'} paths=${nodePaths.join(',') || '(unmapped)'}`);
  }

  const units = collectViewUnits(view);
  // The 5-1 judgment groups one phase. Printing every package unit would let a sequence
  // owned by a later phase look like work this phase must place.
  const phaseUnitIds = new Set(phaseNodes(phase, graph).flatMap((node) => node.unitIds ?? []));
  const touchesPhase = (record, unitId) => phaseUnitIds.has(unitId)
    || (record.steps ?? []).some((step) => phaseUnitIds.has(`op-${step.operationId}`));
  const artifactSteps = new Map();
  for (const step of artifact?.steps ?? []) {
    const steps = artifactSteps.get(step.sequence) ?? [];
    steps.push(step);
    artifactSteps.set(step.sequence, steps);
  }

  lines.push('', '## Sequences');
  for (const [unitId, unit] of units) {
    if (unit.kind !== 'sequence' && unit.kind !== 'cross-boundary-sequence') continue;
    const record = unit.record;
    if (!touchesPhase(record, unitId)) continue;
    const steps = formatSteps(record);
    const artifactForSequence = artifactSteps.get(record.sequenceId ?? record.subject ?? '') ?? [];
    const missing = record.steps === undefined || record.steps.length === 0
      ? artifactForSequence.map((step) => step.id)
      : [];
    lines.push(`- ${unitId}: sequence=${record.sequenceId ?? record.subject ?? '?'} outcome=${record.outcome ?? '?'} steps=${steps}`);
    if (missing.length > 0) lines.push(`  - missing artifact steps: ${missing.join(', ')}`);
  }

  lines.push('', '## Operations');
  for (const [unitId, unit] of units) {
    if (unit.kind !== 'operation') continue;
    if (!phaseUnitIds.has(unitId)) continue;
    const record = unit.record;
    lines.push(`- ${unitId}: role=${record.roleCandidate ?? 'undecided'} owner=${(record.ownerPackageIds ?? []).join(',') || '?'} obligation=${record.obligation?.kind ?? 'none'}`);
    for (const field of OPERATION_OBLIGATION_FIELDS) {
      if (field === 'kind') continue;
      const rendered = renderObligationValue(record.obligation?.[field]);
      if (rendered !== null) lines.push(`  - ${field}: ${rendered}`);
    }
  }

  lines.push('', '## Boundaries');
  for (const row of registry ?? []) {
    const ctrUnit = `ctr-${row.boundary_id}`;
    if (!units.has(ctrUnit) && phaseNodes(phase, graph).every((node) => !(node.unitIds ?? []).includes(ctrUnit))) continue;
    lines.push(`- ${row.boundary_id}: provider=${row.provider_package} consumer=${row.consumer_package}`);
    lines.push(`  - ${formatClauses(row)}`);
  }

  lines.push('', '## Grouping invariants');
  lines.push('- A sequence step\'s operation is implemented by exactly one ticket.');
  lines.push('- Do not separate an operation from the sequence steps it implements.');
  lines.push('- A ticket carrying a ctr unit carries that boundary registry contract; never invent or edit a clause.');
  lines.push('- A ticket may carry a step-bearing sequence unit from another phase; the local step placement must follow the artifact order.');
  lines.push("- Cross-package build order is not asserted: another package's ticket placement is not visible here.");

  return `${lines.join('\n')}\n`;
}

// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function findPhase(tickets, phaseArg) {
  const phases = tickets?.phases ?? [];
  const match = phases.find((phase) => phase.id === -1 && phaseArg === 'PX')
    ?? phases.find((phase) => `P${phase.id}` === phaseArg);
  return match ?? null;
}

// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function main(argv = process.argv.slice(2)) {
  const ticketsPath = argumentFor(argv, 'tickets');
  const phaseArg = argumentFor(argv, 'phase');
  if (ticketsPath === null || phaseArg === null) {
    console.error('[ERROR] --tickets=<Tickets.json> and --phase=P0 are required');
    return 2;
  }
  const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  const phase = findPhase(tickets, phaseArg);
  if (phase === null) {
    console.error(`[ERROR] phase ${phaseArg} not found`);
    return 2;
  }
  const directory = path.dirname(path.resolve(ticketsPath));
  const viewPath = argumentFor(argv, 'view') ?? path.join(directory, 'SEQUENCES.json');
  const graphPath = argumentFor(argv, 'graph') ?? path.join(directory, 'RFC-GRAPH.json');
  const dirsPath = argumentFor(argv, 'dirs-tree') ?? path.join(directory, 'RFC-Dirs-Tree.json');
  const registryPath = argumentFor(argv, 'registry')
    ?? findAllocateManifest(directory)
    ?? path.join(directory, 'WORKSPACIFY-ALLOCATE-MANIFEST.json');
  const artifactPath = argumentFor(argv, 'artifact');
  process.stdout.write(renderPhaseDistribution({
    phase,
    view: readJson(viewPath),
    graph: readJson(graphPath),
    dirsTree: readJson(dirsPath),
    registry: readRegistry(registryPath),
    artifact: readJson(artifactPath),
  }));
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { renderPhaseDistribution, findPhase };
