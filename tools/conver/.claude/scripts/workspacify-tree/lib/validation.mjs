// [::TICKET::] PX-177 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-177 --for-spec --no-implementation-order`.
/**
 * Gate pipeline orchestration (§3).
 *
 * runGatePipeline executes the gate checks in dependency order (G0..G5) and
 * aggregates the outcome into a final audit. A parent gate that fails blocks
 * its children, and a COMPLETE status is only reachable when every gate
 * passes and no review/unresolved item remains.
 */
import { runOwnershipChecks } from './ownership.mjs';
import { runDagChecks } from './dag.mjs';
import { validatePackageCatalog } from './workspace-model.mjs';
import { findOverSplitRisks } from './boundary-review.mjs';
import { checkDatabasePolicy } from './database-policy.mjs';
import { GATE_STATUS } from './errors.mjs';

/** Ordered gate ids for parent-gating. */
const GATE_ORDER = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5'];

/**
 * Run the whole gate pipeline.
 *
 * @param {object} input - { structure, inventory, workspace, dependencies, adapters, decisions }
 * @returns {{ gates: Array<object>, finalAudit: object, status: string }}
 */
export function runGatePipeline(input = {}) {
  const { structure, inventory, workspace, dependencies, adapters, decisions } = input;
  const inventoryData = inventory ?? {};
  const workspaceData = workspace ?? {};
  const dependenciesData = dependencies ?? {};
  const decisionsData = decisions ?? {};
  const packages = workspaceData.packages ?? [];

  const unresolvedCandidates = inventoryData.unresolved_candidates ?? [];
  const reviewRequiredCount = countReviewRequired(inventoryData) + unresolvedCandidates.length;

  const structureResult = evaluateStructure(structure);
  const ownershipResult = evaluateOwnership(inventoryData, packages);
  const catalogErrors = validatePackageCatalog(packages);
  const boundaryRisks = findOverSplitRisks(packages);
  const dagResult = evaluateDag(dependenciesData, workspaceData.packages);
  const dbResult = evaluateDatabase(adapters, packages);
  const approvalCount = (decisionsData.approvals ?? []).length;

  const checks = [
    { id: 'G0', status: GATE_STATUS.PASS, counts: {}, reasons: ['input lock passed'] },
    structureResult,
    {
      id: 'G2',
      status: reviewRequiredCount > 0 ? GATE_STATUS.REVIEW_REQUIRED : GATE_STATUS.PASS,
      counts: { review_required_count: reviewRequiredCount, unresolved_count: unresolvedCandidates.length },
      reasons: reviewRequiredCount > 0 ? [`${reviewRequiredCount} candidate(s) still require review`] : [],
    },
    {
      id: 'G3',
      status: catalogErrors.length === 0 && ownershipResult.isClean && boundaryRisks.length === 0 ? GATE_STATUS.PASS : GATE_STATUS.REVIEW_REQUIRED,
      counts: { ...ownershipResult.counts, boundary_risk_count: boundaryRisks.length },
      reasons: catalogErrors.map((error) => error.message).concat(boundaryRisks.map((risk) => risk.detail)),
    },
    {
      id: 'G4',
      status: dagResult.report.cycle_count === 0 && dagResult.report.unknown_dependency_count === 0 ? GATE_STATUS.PASS : GATE_STATUS.FAIL,
      counts: dagResult.report,
      reasons: dagResult.report.cycles?.map((cycle) => `cycle: ${cycle.path.join(' -> ')}`) ?? [],
    },
    {
      id: 'G5',
      status: dbResult.raw_sql_count === 0 && dbResult.db_type_leak_count === 0 && approvalCount >= 0 ? GATE_STATUS.PASS : GATE_STATUS.FAIL,
      counts: { raw_sql_count: dbResult.raw_sql_count, db_type_leak_count: dbResult.db_type_leak_count, approval_count: approvalCount },
      reasons: dbResult.details,
    },
  ];

  const gates = applyParentGating(checks);
  const finalAudit = buildFinalAudit({ gates, ownershipResult, dagResult, dbResult, reviewRequiredCount, unresolvedCandidates });
  const status = decideStatus(gates, unresolvedCandidates, reviewRequiredCount, dagResult.report.cycle_count);
  return { gates, finalAudit, status };
}

function evaluateStructure(structure) {
  const reconstruction = structure?.reconstruction;
  const passed = reconstruction?.status === 'PASS';
  return {
    id: 'G1',
    status: passed ? GATE_STATUS.PASS : GATE_STATUS.FAIL,
    counts: { reconstruction_status: reconstruction?.status ?? 'MISSING' },
    reasons: passed ? [] : ['structure reconstruction did not PASS'],
  };
}

function evaluateOwnership(inventoryData, packages) {
  const result = runOwnershipChecks({
    objects: inventoryData.objects ?? [],
    claims: inventoryData.claims ?? [],
    packages,
  });
  const clean = result.orphan_object_count === 0 && result.orphan_claim_count === 0 && result.owner_collision_count === 0 && result.invalid_owner_layer_count === 0;
  const counts = {
    orphan_object_count: result.orphan_object_count,
    orphan_claim_count: result.orphan_claim_count,
    owner_collision_count: result.owner_collision_count,
    invalid_owner_layer_count: result.invalid_owner_layer_count,
  };
  return { counts, isClean: clean, details: result.details };
}

function evaluateDag(dependenciesData, packages) {
  const report = runDagChecks({
    packages: packages ?? [],
    edges: dependenciesData.normalEdges ?? dependenciesData.edges ?? [],
    forbiddenEdges: dependenciesData.forbiddenEdges ?? [],
  });
  return { report };
}

function evaluateDatabase(adapters, packages) {
  const adapterPolicy = adapters?.databasePolicy;
  if (!adapterPolicy) {
    return { raw_sql_count: 0, db_type_leak_count: 0, details: [] };
  }
  const result = checkDatabasePolicy({ databasePolicy: adapterPolicy, packages });
  return result;
}

function countReviewRequired(inventoryData) {
  let count = 0;
  for (const listKey of ['objects', 'claims', 'requirements']) {
    for (const candidate of inventoryData[listKey] ?? []) {
      const status = candidate.normalization_status ?? candidate.review_status;
      if (status === 'REVIEW_REQUIRED') {
        count++;
      }
    }
  }
  return count;
}

function applyParentGating(checks) {
  const gates = [];
  let blocked = false;
  for (const gate of checks) {
    const effectiveStatus = blocked ? GATE_STATUS.BLOCKED : gate.status;
    if (gate.status !== GATE_STATUS.PASS) {
      blocked = true;
    }
    gates.push({ id: gate.id, status: effectiveStatus, counts: gate.counts, reasons: gate.reasons });
  }
  return gates;
}

function buildFinalAudit(aggregate) {
  const { gates, ownershipResult, dagResult, dbResult, reviewRequiredCount, unresolvedCandidates } = aggregate;
  const passed = gates.every((gate) => gate.status === GATE_STATUS.PASS);
  const report = dagResult.report;
  return {
    status: passed ? GATE_STATUS.PASS : GATE_STATUS.REVIEW_REQUIRED,
    orphan_object_count: ownershipResult.counts.orphan_object_count,
    orphan_claim_count: ownershipResult.counts.orphan_claim_count,
    owner_collision_count: ownershipResult.counts.owner_collision_count,
    unknown_dependency_count: report.unknown_dependency_count,
    forbidden_dependency_count: report.forbidden_edge_count,
    layer_violation_count: report.layer_violation_count,
    cycle_count: report.cycle_count,
    review_required_count: reviewRequiredCount,
    unresolved_count: unresolvedCandidates.length,
    raw_sql_count: dbResult.raw_sql_count,
    db_type_leak_count: dbResult.db_type_leak_count,
  };
}

function decideStatus(gates, unresolvedCandidates, reviewRequiredCount, cycleCount) {
  const allPass = gates.every((gate) => gate.status === GATE_STATUS.PASS);
  if (allPass && unresolvedCandidates.length === 0 && reviewRequiredCount === 0 && cycleCount === 0) {
    return GATE_STATUS.COMPLETE;
  }
  if (gates.some((gate) => gate.status === GATE_STATUS.FAIL)) {
    return GATE_STATUS.FAIL;
  }
  return GATE_STATUS.REVIEW_REQUIRED;
}
