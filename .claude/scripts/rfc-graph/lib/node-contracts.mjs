// PX-336: the per-node semantic implementation brief.
//
// The graph says where a node sits; the view says which unit it carries; the step
// sidecar says which operation-boundary contract a local step owes; the registry says
// which boundary clauses apply. This module joins those four read-only artifacts into
// one deterministic brief. It never paraphrases a fact: every line it prints is an
// existing text selected from an artifact, with the row it came from.
import { localOperationUnitIds } from './step-contracts.mjs';

/** The section labels, in the order an implementer reads them. */
export const BRIEF_SECTIONS = Object.freeze([
  'YOU ARE HERE',
  'IMPLEMENT',
  'MUST HOLD',
  'DO NOT',
  'ORDER',
  'PROOF',
]);

/** The maximum facts printed for one axis before the omission line. */
export const MAX_FACTS_PER_AXIS = 6;

/** The maximum steps printed for one unit. */
export const MAX_STEPS_PER_UNIT = 6;

/** The maximum boundary clause items printed per group. */
export const MAX_BOUNDARY_CLAUSES = 8;

/** The axis names a step contract carries. */
const FACT_AXES = Object.freeze(['pre', 'post', 'invariants']);

/** The edges that express an implementation prerequisite. */
const ORDER_EDGE_TYPES = Object.freeze(['depends_on', 'constrains', 'requires']);

/** A named failure the CLI can print without guessing. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function namedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/** The kind encoded in a unit id, or `unsupported`. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function unitKindOf(unitId) {
  if (unitId.startsWith('op-')) return 'op';
  if (unitId.startsWith('seq-')) return 'seq';
  if (unitId.startsWith('xdir-')) return 'xdir';
  if (unitId.startsWith('ctr-')) return 'ctr';
  return 'unsupported';
}

/** The operation id encoded in an `op-` unit id. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function operationIdOf(unitId) {
  return unitId.slice('op-'.length);
}

/** The sequence id encoded in a `seq-` or `xdir-` unit id. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function sequenceIdOf(unitId) {
  return unitId.slice(unitId.indexOf('-') + 1);
}

/** The boundary id encoded in a `ctr-` unit id. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function boundaryIdOf(unitId) {
  return unitId.slice('ctr-'.length);
}

/** The text of a fact, string or object. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function factText(fact) {
  if (typeof fact === 'string') return fact;
  return String(fact?.text ?? fact?.factId ?? '');
}

/** The fact array of one axis, or an empty array. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function factsOf(row, axis) {
  const facts = row?.contract?.[axis];
  return Array.isArray(facts) ? facts : [];
}

/** The step rows of one operation. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function stepRowsForOperation(stepContracts, operationId) {
  return (stepContracts.steps ?? []).filter((row) => row.operationId === operationId);
}

/** The step order the view records, keyed by step id. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function stepOrderMap(view) {
  const orders = new Map();
  for (const unit of [...(view.ownedSequenceUnits ?? []), ...(view.crossBoundarySequenceUnits ?? [])]) {
    for (const step of unit.steps ?? []) {
      orders.set(step.stepId, { order: Number(step.order ?? 0), sequenceId: unit.sequenceId, unit });
    }
  }
  return orders;
}

/** Sort step rows by their view order, then by id for a deterministic tie-break. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function sortedStepRows(rows, orders) {
  return [...rows].sort((left, right) => {
    const leftOrder = orders.get(left.stepId)?.order ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = orders.get(right.stepId)?.order ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return String(left.stepId).localeCompare(String(right.stepId));
  });
}

/** The package's own boundary units, as a set of `ctr-boundary-N` ids. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function packageBoundaryUnits(view) {
  return new Set((view.obligationUnits ?? [])
    .map((unit) => String(unit.unitId ?? ''))
    .filter((unitId) => unitId.startsWith('ctr-')));
}

/** Whether a boundary id belongs to this package's carried boundaries. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function isPackageBoundary(packageUnits, boundaryId) {
  return packageUnits.has(`ctr-${boundaryId}`);
}

/** The view record of one operation, owned or assigned. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function viewOperation(view, operationId) {
  const owned = (view.ownedOperationUnits ?? [])
    .find((unit) => unit.operationId === operationId || unit.unitId === `op-${operationId}`);
  if (owned !== undefined) return { unit: owned, obligation: owned.obligation ?? null, role: owned.roleCandidate ?? null };

  const assigned = (view.obligationUnits ?? [])
    .find((unit) => unit.unitId === `op-${operationId}` || (unit.kind === 'operation' && unit.subject === operationId));
  if (assigned !== undefined) return { unit: assigned, obligation: assigned.obligation ?? null, role: assigned.roleCandidate ?? null };

  return null;
}

/** The view record of one sequence unit. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function viewSequence(view, sequenceId) {
  return [...(view.ownedSequenceUnits ?? []), ...(view.crossBoundarySequenceUnits ?? [])]
    .find((unit) => unit.sequenceId === sequenceId) ?? null;
}

/** The view record of one carried boundary. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function viewBoundary(view, boundaryId) {
  return (view.obligationUnits ?? []).find((unit) => unit.unitId === `ctr-${boundaryId}`) ?? null;
}

/** The node that carries a unit, or undefined. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function nodeCarryingUnit(graph, unitId) {
  return graph.nodes.find((node) => (node.unitIds ?? []).includes(unitId));
}

/** Deterministic order for edge contract entries: endpoints, edge type, contract id. */
// [::TICKET::] PX-337 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-337 --for-spec --no-implementation-order`.
function compareEdgeContract(left, right) {
  const byFrom = String(left.edge.from).localeCompare(String(right.edge.from));
  if (byFrom !== 0) return byFrom;
  const byTo = String(left.edge.to).localeCompare(String(right.edge.to));
  if (byTo !== 0) return byTo;
  const byType = String(left.edge.type ?? '').localeCompare(String(right.edge.type ?? ''));
  if (byType !== 0) return byType;
  return String(left.contract.id).localeCompare(String(right.contract.id));
}

/**
 * Every contract on the edges incident to a boundary unit.
 *
 * The boundary unit can sit on several nodes, and every edge touching one of them
 * carries the same `registry:<boundaryId>` note. Reading one edge would drop the
 * other contracts, so the inventory keeps each contract with the edge that carried
 * it and lets the renderer say which one is expanded.
 */
// [::TICKET::] PX-337 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-337 --for-spec --no-implementation-order`.
function collectBoundaryContracts(graph, boundaryId) {
  const ctrUnit = `ctr-${boundaryId}`;
  const carrierNodes = graph.nodes.filter((node) => (node.unitIds ?? []).includes(ctrUnit));
  const incidentEdges = graph.edges.filter((edge) =>
    carrierNodes.some((node) => node.id === edge.from || node.id === edge.to));
  const registryEdges = incidentEdges.filter((edge) =>
    String(edge.attributes?.note ?? '').includes(`registry:${boundaryId}`));
  const candidateEdges = registryEdges.length > 0 ? registryEdges : incidentEdges;
  const edgeContracts = candidateEdges
    .flatMap((edge) => (Array.isArray(edge.contracts) ? edge.contracts : [])
      .map((contract) => ({ edge, contract })))
    .sort(compareEdgeContract);
  const projectedEntry = edgeContracts.find(({ contract }) => /^C9\d{2}$/.test(String(contract.id)))
    ?? edgeContracts[edgeContracts.length - 1]
    ?? null;
  return { incidentEdges, registryEdges, candidateEdges, edgeContracts, projectedEntry };
}

/** The registry row of one boundary, or null. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function registryBoundary(registry, boundaryId) {
  return (registry?.contract_registry ?? []).find((row) => row.boundary_id === boundaryId) ?? null;
}

/** The title of a node id, or the id itself. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function titleOf(graph, nodeId) {
  return graph.nodes.find((node) => node.id === nodeId)?.title ?? nodeId;
}

/** The graph prerequisites and unblocks of one node. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function graphOrder(graph, nodeId) {
  const prerequisites = graph.edges
    .filter((edge) => edge.from === nodeId && ORDER_EDGE_TYPES.includes(edge.type))
    .map((edge) => edge.to);
  const unblocks = graph.edges
    .filter((edge) => edge.to === nodeId && ORDER_EDGE_TYPES.includes(edge.type))
    .map((edge) => edge.from);
  return { prerequisites, unblocks };
}

/** Whether a fact is owned by a boundary this package does not carry. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function isExternalFact(fact, packageUnits) {
  const boundaryId = fact?.source?.boundaryId;
  return typeof boundaryId === 'string' && !isPackageBoundary(packageUnits, boundaryId);
}

/** Whether an axis value names a boundary this package does not carry. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function isExternalAxisValue(value, packageUnits) {
  const match = String(value).match(/^boundary:(boundary-\d+)\//);
  return match !== null && !isPackageBoundary(packageUnits, match[1]);
}

/** Deduplicate facts by their exact text, keeping only this package's obligations. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function deduplicateFacts(rows, axis, packageUnits) {
  const byText = new Map();
  for (const row of rows) {
    for (const fact of factsOf(row, axis)) {
      if (isExternalFact(fact, packageUnits)) continue;
      const text = factText(fact).trim();
      if (text.length === 0) continue;
      const entry = byText.get(text) ?? { text, steps: [] };
      if (!entry.steps.includes(row.stepId)) entry.steps.push(row.stepId);
      byText.set(text, entry);
    }
  }
  return [...byText.values()];
}

/** The foreign boundary ids whose facts appear in the local step rows. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function externalFactBoundaries(rows, packageUnits) {
  const ids = new Set();
  for (const row of rows) {
    for (const axis of FACT_AXES) {
      for (const fact of factsOf(row, axis)) {
        if (isExternalFact(fact, packageUnits)) ids.add(fact.source.boundaryId);
      }
    }
    for (const axis of ['consumes', 'produces', 'errors']) {
      for (const value of factsOf(row, axis)) {
        const match = String(factText(value)).match(/^boundary:(boundary-\d+)\//);
        if (match !== null && !isPackageBoundary(packageUnits, match[1])) ids.add(match[1]);
      }
    }
  }
  return [...ids].sort();
}

/** Render a capped fact list and state exactly how many were omitted. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function renderFactList(lines, label, entries, cap, pointer) {
  if (entries.length === 0) return;
  lines.push(`- ${label} (${entries.length}):`);
  for (const entry of entries.slice(0, cap)) {
    const source = entry.steps.length > 0 ? ` [${entry.steps.join(', ')}]` : '';
    lines.push(`  - ${entry.text}${source}`);
  }
  if (entries.length > cap) {
    lines.push(`  - showing ${cap} of ${entries.length}; full list at ${pointer}`);
  }
}

/** Render a capped string list. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function renderStringList(lines, label, values, cap, pointer) {
  if (values.length === 0) return;
  lines.push(`- ${label} (${values.length}):`);
  for (const value of values.slice(0, cap)) lines.push(`  - ${value}`);
  if (values.length > cap) {
    lines.push(`  - showing ${cap} of ${values.length}; full list at ${pointer}`);
  }
}

/** The unit ids a node carries, deduplicated and sorted by kind then id. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function sortedUnits(node) {
  const units = [...new Set(node.unitIds ?? [])];
  const rank = { op: 0, seq: 1, xdir: 1, ctr: 2, unsupported: 3 };
  return units.sort((left, right) => {
    const rankDifference = rank[unitKindOf(left)] - rank[unitKindOf(right)];
    return rankDifference !== 0 ? rankDifference : left.localeCompare(right);
  });
}

/** The local step rows across every operation unit on the node. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function localStepRowsForNode(node, stepContracts, localOperations) {
  const rows = [];
  for (const unitId of node.unitIds ?? []) {
    if (unitKindOf(unitId) !== 'op') continue;
    const operationId = operationIdOf(unitId);
    if (!localOperations.has(operationId)) continue;
    rows.push(...stepRowsForOperation(stepContracts, operationId));
  }
  return rows;
}

/** The operation section of IMPLEMENT. */
// [::TICKET::] PX-336, PX-338 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-336|PX-338) --for-spec --no-implementation-order`.
function renderOperationSection(lines, context) {
  const { graph, view, stepContracts, packageUnits, operationId, orders, limits } = context;
  const record = viewOperation(view, operationId);
  const obligation = record?.obligation ?? null;
  const rows = sortedStepRows(stepRowsForOperation(stepContracts, operationId), orders);

  lines.push(`### op-${operationId}`);
  if (record === null) {
    lines.push('- View record: UNMAPPED (no ownedOperationUnits or obligationUnits entry)');
  } else {
    const owners = (record.unit.ownerPackageIds ?? []).join(', ');
    lines.push(`- Role: ${record.role ?? 'not stated'}${owners.length > 0 ? `; owners: ${owners}` : ''}`);
    if (typeof obligation?.purpose === 'string') lines.push(`- Purpose: ${obligation.purpose}`);
    if (typeof obligation?.requiredAuthority === 'string') lines.push(`- Required authority: ${obligation.requiredAuthority}`);
    const bindings = [
      obligation?.requiresSessionBinding === true ? 'session binding' : null,
      obligation?.requiresRemoteTimeHandshake === true ? 'remote time handshake' : null,
      obligation?.requiredPreStateCheckpoint === true ? 'pre-state checkpoint' : null,
    ].filter(Boolean);
    if (bindings.length > 0) lines.push(`- Required bindings: ${bindings.join(', ')}`);
    if (typeof obligation?.idempotencyScope === 'string') lines.push(`- Idempotency: ${obligation.idempotencyScope}`);
    if (typeof obligation?.initialStatus === 'string') lines.push(`- Initial status: ${obligation.initialStatus}`);
    if (typeof obligation?.finalityPredicate === 'string') lines.push(`- Finality: ${obligation.finalityPredicate}`);
    if (typeof obligation?.cancellationRule === 'string') lines.push(`- Cancellation: ${obligation.cancellationRule}`);
    if (typeof obligation?.reversalOrRecoveryRule === 'string') lines.push(`- Reversal/recovery: ${obligation.reversalOrRecoveryRule}`);
    const results = obligation?.resultObjectClasses ?? record.unit.resultObjectClasses ?? [];
    if (results.length > 0) lines.push(`- Result objects: ${results.join(', ')}`);
    const effects = Array.isArray(obligation?.boundaryEffects) ? obligation.boundaryEffects : [];
    const local = effects.filter((effect) => isPackageBoundary(packageUnits, effect.boundary));
    const external = effects.filter((effect) => !isPackageBoundary(packageUnits, effect.boundary));
    if (local.length > 0) {
      lines.push(`- Boundary effects: ${local.map((effect) => `${effect.direction} ${effect.boundary}`).join('; ')}`);
    }
    if (external.length > 0) {
      lines.push(`- External boundary effects: ${external.map((effect) => effect.boundary).join(', ')} (not this package's; do not implement)`);
    }
  }

  if (rows.length === 0) {
    lines.push('- No step contract: no local step carries this operation. The view records a role only; the operation disposition lives in the upstream sequences artifact, which this brief does not read. Do not implement it as a Core Operation until that disposition is confirmed.');
    return;
  }

  lines.push(`- Step contracts: ${rows.length}`);
  for (const row of rows.slice(0, limits.maxStepsPerUnit)) {
    const order = orders.get(row.stepId);
    const sequence = order?.sequenceId ?? row.sequenceId ?? 'unknown sequence';
    const digest = row.digest ? `; digest ${row.digest.slice(0, 12)}` : '';
    lines.push(`  - ${row.stepId} (${sequence}${order ? `, order ${order.order}` : ''}${digest})`);
    if (typeof row.contractProse === 'string' && row.contractProse.trim().length > 0) {
      lines.push(`    prose: ${row.contractProse.trim()}`);
    }
    // The facts themselves are rendered once, in MUST HOLD; here the local/total count
    // tells the reader how much of the row is this package's obligation.
    const counts = FACT_AXES.map((axis) => {
      const local = deduplicateFacts([row], axis, packageUnits).length;
      return `${axis} ${local}/${factsOf(row, axis).length}`;
    }).join(', ');
    lines.push(`    local facts: ${counts}`);
  }
  if (rows.length > limits.maxStepsPerUnit) {
    lines.push(`  - showing ${limits.maxStepsPerUnit} of ${rows.length}; full list at the step sidecar rows named above`);
  }
}

/** The sequence section of IMPLEMENT. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function renderSequenceSection(lines, context) {
  const { graph, view, stepContracts, packageUnits, unit, localOperations, orders, limits } = context;
  const sequenceId = sequenceIdOf(unit.unitId);
  const unitRecord = viewSequence(view, sequenceId);
  lines.push(`### ${unit.unitId}`);
  if (unitRecord === null) {
    lines.push('- View record: UNMAPPED (no ownedSequenceUnits or crossBoundarySequenceUnits entry)');
    return;
  }
  lines.push(`- Owners: ${(unitRecord.ownerPackageIds ?? []).join(', ') || 'not stated'}`);
  if (typeof unitRecord.outcome === 'string') lines.push(`- Outcome: ${unitRecord.outcome}`);
  const steps = [...(unitRecord.steps ?? [])].sort((left, right) => Number(left.order ?? 0) - Number(right.order ?? 0));
  lines.push(`- Steps: ${steps.length}`);
  for (const step of steps.slice(0, limits.maxStepsPerUnit)) {
    const local = localOperations.has(step.operationId);
    const row = local ? stepContracts.steps.find((candidate) => candidate.stepId === step.stepId) : null;
    const marker = local ? 'local' : 'external';
    lines.push(`  - ${step.order ?? '?'}. ${step.stepId} — ${step.operationId} (${marker})`);
    if (local && row === null) {
      lines.push('    - CONTRACT_CHAIN_OPEN: this operation is local but no step-contract row carries it.');
    }
    if (local && row !== null && typeof row.contractProse === 'string' && row.contractProse.trim().length > 0) {
      lines.push(`    prose: ${row.contractProse.trim()}`);
    }
    if (!local) {
      lines.push('    - external: owned by another package; do not implement.');
      const crosses = factsOf(step, 'crosses');
      const interfaces = crosses.filter((boundaryId) => isPackageBoundary(packageUnits, boundaryId));
      if (interfaces.length > 0) lines.push(`    - interface: ${interfaces.join(', ')}`);
    }
  }
  if (steps.length > limits.maxStepsPerUnit) {
    lines.push(`  - showing ${limits.maxStepsPerUnit} of ${steps.length}; full list at ${unit.unitId}`);
  }
}

/** The boundary section of IMPLEMENT. */
// [::TICKET::] PX-336, PX-337 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-336|PX-337) --for-spec --no-implementation-order`.
function renderBoundarySection(lines, context) {
  const { graph, view, registry, boundaryId, limits } = context;
  const record = viewBoundary(view, boundaryId);
  const inventory = collectBoundaryContracts(graph, boundaryId);
  lines.push(`### ctr-${boundaryId}`);
  if (record === null) {
    lines.push('- View record: UNMAPPED (no obligationUnits entry)');
  } else {
    lines.push(`- Direction: ${record.direction ?? 'not stated'}; counterpart: ${record.counterpart ?? 'not stated'}`);
  }

  if (inventory.incidentEdges.length === 0) {
    lines.push('- Graph contract: MISSING (no incident boundary edge)');
  } else if (inventory.edgeContracts.length === 0) {
    lines.push('- Graph contract: MISSING (incident edges carry no contract)');
  } else {
    lines.push(`- Boundary contracts (${inventory.edgeContracts.length}):`);
    for (const { edge, contract } of inventory.edgeContracts.slice(0, limits.maxBoundaryClauses)) {
      lines.push(`  - ${contract.id} (${edge.from} -> ${edge.to})`);
    }
    if (inventory.edgeContracts.length > limits.maxBoundaryClauses) {
      lines.push(`  - showing ${limits.maxBoundaryClauses} of ${inventory.edgeContracts.length}; full list at graph edges for ${boundaryId}`);
    }
    const projected = inventory.projectedEntry;
    if (projected !== null) {
      lines.push(`- Expanded contract: ${projected.contract.id} (${projected.edge.from} -> ${projected.edge.to})`);
      lines.push(`  precondition: ${projected.contract.precondition}`);
      lines.push(`  postcondition: ${projected.contract.postcondition}`);
      lines.push(`  invariant: ${projected.contract.invariant}`);
      const notExpanded = inventory.edgeContracts
        .filter(({ contract }) => String(contract.id) !== String(projected.contract.id))
        .map(({ contract }) => String(contract.id))
        .sort();
      if (notExpanded.length > 0) lines.push(`- Not expanded: ${notExpanded.join(', ')}`);
    }
  }

  const row = registryBoundary(registry, boundaryId);
  if (row === null) {
    if (registry === null || registry === undefined) {
      lines.push('- Registry: not supplied; clauses unavailable.');
    } else {
      lines.push(`- Registry: no row for ${boundaryId}; clauses unavailable.`);
    }
    return;
  }
  lines.push(`- Registry row: consumer ${row.consumer_package ?? 'not stated'}; provider ${row.provider_package ?? 'not stated'}`);
  const clauses = row.clauses ?? {};
  const graphProjected = new Set(['preconditions', 'postconditions', 'invariants']);
  let renderedGroups = 0;
  for (const group of Object.keys(clauses)) {
    if (graphProjected.has(group)) continue;
    const raw = clauses[group];
    const values = Array.isArray(raw) ? raw.map(String) : [String(raw)];
    if (values.length === 0) continue;
    renderStringList(lines, `Registry ${group}`, values, limits.maxBoundaryClauses, `registry row ${boundaryId}`);
    renderedGroups += 1;
  }
  if (renderedGroups === 0) {
    lines.push('- Registry: row found; no clause groups beyond graph pre/post/invariant.');
  }
}

/** The unsupported-unit section of IMPLEMENT. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function renderUnsupportedSection(lines, unitId) {
  lines.push(`### ${unitId}`);
  lines.push('- UNSUPPORTED: no resolver exists for this unit kind. The brief does not guess what it means.');
}

/** Build the IMPLEMENT section body. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function renderImplement(lines, context) {
  const { node, view, stepContracts, registry, localOperations, packageUnits, orders, limits } = context;
  for (const unitId of sortedUnits(node)) {
    const kind = unitKindOf(unitId);
    if (kind === 'op') {
      renderOperationSection(lines, { ...context, operationId: operationIdOf(unitId) });
    } else if (kind === 'seq' || kind === 'xdir') {
      renderSequenceSection(lines, { ...context, unit: { unitId } });
    } else if (kind === 'ctr') {
      renderBoundarySection(lines, { ...context, boundaryId: boundaryIdOf(unitId) });
    } else {
      renderUnsupportedSection(lines, unitId);
    }
  }
  if (sortedUnits(node).length === 0) {
    lines.push('- No distributed unit is mapped to this node; it is design context only.');
  }
}

/** Build the MUST HOLD section body. */
// [::TICKET::] PX-336, PX-337 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-336|PX-337) --for-spec --no-implementation-order`.
function renderMustHold(lines, context) {
  const { node, view, stepContracts, localOperations, packageUnits, orders, limits } = context;
  const rows = sortedStepRows(localStepRowsForNode(node, stepContracts, localOperations), orders);
  if (rows.length === 0) {
    lines.push('- No local step-contract facts are available for this node.');
    return;
  }
  const contributingSteps = rows.map((row) => row.stepId).join(', ');
  for (const axis of FACT_AXES) {
    renderFactList(lines, axis, deduplicateFacts(rows, axis, packageUnits), limits.maxFactsPerAxis, contributingSteps);
  }
  for (const axis of ['consumes', 'produces', 'errors']) {
    const values = [...new Set(rows.flatMap((row) => factsOf(row, axis).map(factText))
      .filter((text) => text.length > 0 && !isExternalAxisValue(text, packageUnits)))];
    renderStringList(lines, axis, values, limits.maxFactsPerAxis, contributingSteps);
  }
  const localBoundaries = [...new Set(rows.flatMap((row) =>
    factsOf(row, 'crosses').filter((boundaryId) => isPackageBoundary(packageUnits, boundaryId))))];
  renderStringList(lines, 'crosses (local)', localBoundaries, limits.maxBoundaryClauses, contributingSteps);
}

/** Build the DO NOT section body. */
// [::TICKET::] PX-336, PX-338 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-336|PX-338) --for-spec --no-implementation-order`.
function renderDoNot(lines, context) {
  const { node, view, stepContracts, localOperations, packageUnits, orders, limits } = context;
  const items = [];
  const externalReasons = new Map();
  const addExternalReason = (boundaryId, reason) => {
    if (!externalReasons.has(boundaryId)) externalReasons.set(boundaryId, new Set());
    externalReasons.get(boundaryId).add(reason);
  };

  for (const unitId of sortedUnits(node)) {
    const kind = unitKindOf(unitId);
    if (kind === 'op') {
      const operationId = operationIdOf(unitId);
      const record = viewOperation(view, operationId);
      const rows = stepRowsForOperation(stepContracts, operationId);
      if (record?.role === 'consumer' || record?.role === 'reference') {
        items.push(`Do not reimplement ${unitId}: its role is ${record.role}; consume the provider.`);
      } else if (record?.role === 'undecided') {
        items.push(`Do not assume this package owns ${unitId}: its role is undecided; confirm the owner before implementing.`);
      }
      if (rows.length === 0) {
        items.push(`Do not implement ${operationId} as a Core Operation without confirming its disposition in the upstream sequences artifact: no step contract carries it, and this brief does not read that artifact.`);
      }
      if (rows.length > 1) {
        items.push(`${operationId} is carried by ${rows.length} steps (${rows.map((row) => row.stepId).join(', ')}); satisfy all ${rows.length} contracts, not one.`);
      }
      const effects = Array.isArray(record?.obligation?.boundaryEffects) ? record.obligation.boundaryEffects : [];
      for (const effect of effects.filter((candidate) => !isPackageBoundary(packageUnits, candidate.boundary))) {
        addExternalReason(effect.boundary, `operation ${operationId} declares it as ${effect.direction}`);
      }
    } else if (kind === 'seq' || kind === 'xdir') {
      const sequenceId = sequenceIdOf(unitId);
      const unitRecord = viewSequence(view, sequenceId);
      for (const step of unitRecord?.steps ?? []) {
        if (localOperations.has(step.operationId)) continue;
        items.push(`Do not implement foreign step ${step.stepId} (${step.operationId}): it is owned by another package.`);
        const interfaces = factsOf(step, 'crosses').filter((boundaryId) => isPackageBoundary(packageUnits, boundaryId));
        if (interfaces.length > 0) items.push(`  ${step.stepId} is an interface through ${interfaces.join(', ')}.`);
      }
    } else if (kind === 'unsupported') {
      items.push(`Do not guess the meaning of ${unitId}: its unit kind has no resolver.`);
    }
  }

  const rows = sortedStepRows(localStepRowsForNode(node, stepContracts, localOperations), orders);
  for (const boundaryId of rows.flatMap((row) =>
    factsOf(row, 'crosses').filter((candidate) => !isPackageBoundary(packageUnits, candidate)))) {
    addExternalReason(boundaryId, "it appears in a local step's crosses list");
  }
  for (const boundaryId of externalFactBoundaries(rows, packageUnits)) {
    addExternalReason(boundaryId, 'its contract facts appear in the local step rows');
  }
  for (const boundaryId of [...externalReasons.keys()].sort()) {
    items.push(`Do not implement ${boundaryId}: EXTERNAL to this package (${[...externalReasons.get(boundaryId)].join('; ')}).`);
  }

  const uniqueItems = [...new Set(items)];
  if (uniqueItems.length === 0) {
    lines.push('- No forbidden item was found for this node.');
    return;
  }
  for (const item of uniqueItems.slice(0, limits.maxStepsPerUnit * 3)) lines.push(`- ${item}`);
  if (uniqueItems.length > limits.maxStepsPerUnit * 3) {
    lines.push(`- showing ${limits.maxStepsPerUnit * 3} of ${uniqueItems.length}; full list at the units named above`);
  }
}

/** Build the ORDER section body. */
// [::TICKET::] PX-336, PX-337 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-336|PX-337) --for-spec --no-implementation-order`.
function renderOrder(lines, context) {
  const { graph, node, view, stepContracts, localOperations, orders, limits } = context;
  let linesAdded = 0;
  const carriedSequenceIds = new Set();
  for (const unitId of sortedUnits(node)) {
    const kind = unitKindOf(unitId);
    if (kind === 'op') {
      const rows = sortedStepRows(stepRowsForOperation(stepContracts, operationIdOf(unitId)), orders);
      for (const row of rows.slice(0, limits.maxStepsPerUnit)) {
        const order = orders.get(row.stepId);
        if (order === undefined) continue;
        lines.push(`- ${order.sequenceId}: step ${order.order} is ${row.stepId} (${row.operationId})`);
        linesAdded += 1;
      }
    } else if (kind === 'seq' || kind === 'xdir') {
      const sequenceId = sequenceIdOf(unitId);
      carriedSequenceIds.add(sequenceId);
      const unitRecord = viewSequence(view, sequenceId);
      if (unitRecord === null) continue;
      const chain = (unitRecord.steps ?? [])
        .sort((left, right) => Number(left.order ?? 0) - Number(right.order ?? 0))
        .slice(0, limits.maxStepsPerUnit)
        .map((step) => `${step.order ?? '?'}. ${step.operationId}${localOperations.has(step.operationId) ? '' : ' (external)'}`)
        .join(' -> ');
      lines.push(`- ${unitRecord.sequenceId}: ${chain}`);
      linesAdded += 1;
    }
  }

  // An operation can be a step of a sequence the node does not carry as a unit.
  // Showing that chain is what tells the implementer the safe order around the step.
  const contextSequenceIds = new Set();
  for (const row of localStepRowsForNode(node, stepContracts, localOperations)) {
    const sequenceId = orders.get(row.stepId)?.sequenceId ?? row.sequenceId;
    if (sequenceId && !carriedSequenceIds.has(sequenceId)) contextSequenceIds.add(sequenceId);
  }
  for (const sequenceId of [...contextSequenceIds].sort()) {
    const unitRecord = viewSequence(view, sequenceId);
    if (unitRecord === null) {
      lines.push(`- ${sequenceId}: sequence context unavailable (not carried by the package view)`);
      linesAdded += 1;
      continue;
    }
    const orderedSteps = (unitRecord.steps ?? [])
      .slice()
      .sort((left, right) => Number(left.order ?? 0) - Number(right.order ?? 0));
    const shownSteps = orderedSteps.slice(0, limits.maxStepsPerUnit);
    const chain = shownSteps
      .map((step) => `${step.order ?? '?'}. ${step.operationId}${localOperations.has(step.operationId) ? '' : ' (external)'}`)
      .join(' -> ');
    const omission = orderedSteps.length > shownSteps.length
      ? ` ... (showing ${shownSteps.length} of ${orderedSteps.length})`
      : '';
    lines.push(`- ${sequenceId} (context): ${chain}${omission}`);
    linesAdded += 1;
  }

  const order = graphOrder(graph, node.id);
  for (const prerequisite of order.prerequisites.slice(0, limits.maxStepsPerUnit)) {
    lines.push(`- Graph prerequisite: ${prerequisite} ${titleOf(graph, prerequisite)}`);
    linesAdded += 1;
  }
  for (const unblocked of order.unblocks.slice(0, limits.maxStepsPerUnit)) {
    lines.push(`- Graph unblocks: ${unblocked} ${titleOf(graph, unblocked)}`);
    linesAdded += 1;
  }
  if (linesAdded === 0) lines.push('- No sequence or graph order record is available.');
}

/** Build the PROOF section body. */
// [::TICKET::] PX-336, PX-337 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-336|PX-337) --for-spec --no-implementation-order`.
function renderProof(lines, context) {
  const { graph, node, view, stepContracts, registry, options, orders, limits } = context;
  const rows = sortedStepRows(
    (stepContracts.steps ?? []).filter((row) => (node.unitIds ?? []).includes(`op-${row.operationId}`)),
    orders,
  );
  const units = sortedUnits(node);
  const boundaryUnits = units.filter((unitId) => unitKindOf(unitId) === 'ctr');
  lines.push(`- Node: ${node.id} ${node.title}`);
  lines.push(`- Units: ${units.join(', ') || 'none'}`);
  lines.push(`- Step contracts: ${rows.length}${rows.length > 0 ? ` (${rows.map((row) => row.stepId).join(', ')})` : ''}`);
  for (const row of rows.slice(0, limits.maxStepsPerUnit)) {
    if (row.digest) lines.push(`  - ${row.stepId}: digest ${row.digest}`);
  }
  for (const unitId of boundaryUnits) {
    const inventory = collectBoundaryContracts(graph, boundaryIdOf(unitId));
    lines.push(`- Boundary contract: ${unitId} -> ${inventory.projectedEntry?.contract?.id ?? 'MISSING'}`);
  }
  if (options.sources !== null && options.sources !== undefined) {
    lines.push(`- Sources: ${options.sources}`);
  }
  if (registry === null || registry === undefined) {
    lines.push('- Registry: not supplied; registry errors/tests are unavailable.');
  }
}

/** Normalize the limits an option object may override. */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function normalizedLimits(options) {
  const positiveInteger = (value, fallback) =>
    Number.isInteger(value) && value > 0 ? value : fallback;
  return {
    maxFactsPerAxis: positiveInteger(options?.maxFactsPerAxis, MAX_FACTS_PER_AXIS),
    maxStepsPerUnit: positiveInteger(options?.maxStepsPerUnit, MAX_STEPS_PER_UNIT),
    maxBoundaryClauses: positiveInteger(options?.maxBoundaryClauses, MAX_BOUNDARY_CLAUSES),
  };
}

/**
 * Build the semantic implementation brief for one graph node.
 *
 * @param {{graph: object, view: object, stepContracts: object, registry?: object|null, nodeId: string, options?: object}} input
 * @returns {string} Markdown brief, deterministic for the same input
 */
export function buildNodeBrief(input = {}) {
  const { graph, view, stepContracts, registry = null, nodeId, options = {} } = input;
  if (graph === null || graph === undefined || !Array.isArray(graph.nodes)) {
    throw namedError('MISSING_GRAPH', 'graph is not readable');
  }
  if (view === null || view === undefined || typeof view !== 'object') {
    throw namedError('MISSING_VIEW', 'view is not readable');
  }
  if (stepContracts === null || stepContracts === undefined || !Array.isArray(stepContracts.steps)) {
    throw namedError('MISSING_STEP_CONTRACTS', 'step contract sidecar is not readable');
  }
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (node === undefined) {
    throw namedError('UNKNOWN_NODE', `node ${nodeId} does not exist`);
  }

  const limits = normalizedLimits(options);
  const localOperations = localOperationUnitIds(view);
  const packageUnits = packageBoundaryUnits(view);
  const orders = stepOrderMap(view);
  const context = { graph, view, stepContracts, registry, node, localOperations, packageUnits, orders, limits };

  const lines = [`# ${node.id} — ${node.title}`, '', node.summary ?? '', ''];

  lines.push(`## ${BRIEF_SECTIONS[0]}`);
  lines.push(`- Node: ${node.id} — ${node.title}`);
  if (node.summary) lines.push(`- Summary: ${node.summary}`);
  lines.push(`- Units: ${sortedUnits(node).join(', ') || 'none'}`);

  lines.push('', `## ${BRIEF_SECTIONS[1]}`);
  renderImplement(lines, context);

  lines.push('', `## ${BRIEF_SECTIONS[2]}`);
  renderMustHold(lines, context);

  lines.push('', `## ${BRIEF_SECTIONS[3]}`);
  renderDoNot(lines, context);

  lines.push('', `## ${BRIEF_SECTIONS[4]}`);
  renderOrder(lines, context);

  lines.push('', `## ${BRIEF_SECTIONS[5]}`);
  renderProof(lines, { ...context, options });

  return `${lines.join('\n').trimEnd()}\n`;
}

/**
 * Verify the closure between graph, view and step sidecar.
 *
 * @param {{graph: object, view: object, stepContracts: object}} input
 * @returns {{ok: boolean, findings: Array<{code: string, subject: string, message: string}>}}
 */
export function verifyNodeContracts(input = {}) {
  const { graph, view, stepContracts } = input;
  const findings = [];
  const add = (code, subject, message) => findings.push({ code, subject, message });

  if (graph === null || graph === undefined || !Array.isArray(graph.nodes)) {
    add('MISSING_GRAPH', '', 'graph is not readable');
    return { ok: false, findings };
  }
  if (view === null || view === undefined || typeof view !== 'object') {
    add('MISSING_VIEW', '', 'view is not readable');
    return { ok: false, findings };
  }
  if (stepContracts === null || stepContracts === undefined || !Array.isArray(stepContracts.steps)) {
    add('MISSING_STEP_CONTRACTS', '', 'step contract sidecar is not readable');
    return { ok: false, findings };
  }

  const localOperations = localOperationUnitIds(view);
  const unitNodes = new Map();
  for (const node of graph.nodes) {
    for (const unitId of node.unitIds ?? []) {
      if (!unitNodes.has(unitId)) unitNodes.set(unitId, []);
      unitNodes.get(unitId).push(node.id);
    }
  }

  for (const [unitId, nodes] of [...unitNodes.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const kind = unitKindOf(unitId);
    if (kind === 'unsupported') {
      add('UNSUPPORTED_UNIT_KIND', unitId, `no resolver exists for ${unitId} (nodes: ${nodes.join(', ')})`);
    }
    if (kind === 'ctr') {
      const inventory = collectBoundaryContracts(graph, boundaryIdOf(unitId));
      if (inventory.incidentEdges.length === 0) {
        add('MISSING_BOUNDARY_EDGE', unitId, `no incident edge carries the boundary contract for ${unitId}`);
      } else if (inventory.edgeContracts.length === 0) {
        add('BOUNDARY_EDGE_WITHOUT_CONTRACT', unitId, `incident edges for ${unitId} carry no contract`);
      }
    }
  }

  const viewUnits = [
    ...(view.ownedOperationUnits ?? []).map((unit) => unit.unitId ?? `op-${unit.operationId}`),
    ...(view.obligationUnits ?? []).map((unit) => unit.unitId),
    ...(view.ownedSequenceUnits ?? []).map((unit) => unit.unitId),
    ...(view.crossBoundarySequenceUnits ?? []).map((unit) => unit.unitId),
  ];
  for (const unitId of [...new Set(viewUnits)].sort()) {
    if (!unitNodes.has(unitId)) add('UNMAPPED_UNIT', unitId, `no graph node carries ${unitId}`);
  }

  for (const row of stepContracts.steps) {
    if (!localOperations.has(row.operationId)) {
      add('STEP_OPERATION_NOT_LOCAL', row.stepId, `step ${row.stepId} names ${row.operationId}, which is not a local operation`);
    }
    if (!unitNodes.has(`op-${row.operationId}`)) {
      add('CONTRACT_CHAIN_OPEN', row.stepId, `step ${row.stepId} names operation ${row.operationId} and no graph node carries op-${row.operationId}`);
    }
  }

  findings.sort((left, right) => {
    const codeOrder = left.code.localeCompare(right.code);
    return codeOrder !== 0 ? codeOrder : left.subject.localeCompare(right.subject);
  });
  return { ok: findings.length === 0, findings };
}
