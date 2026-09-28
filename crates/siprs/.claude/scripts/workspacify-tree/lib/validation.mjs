// [::TICKET::] PX-177, PX-192, PX-200, PX-202 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-177|PX-180|PX-181|PX-183|PX-186|PX-192) --for-spec --no-implementation-order`.
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
import { checkDependencyMatrix } from './dependencies.mjs';
import { validatePackageCatalog, validateWorkspaceTree } from './workspace-model.mjs';
import { findOverSplitRisks } from './boundary-review.mjs';
import { checkPortAdapterBoundary } from './adapters.mjs';
import { detectAliasCycles } from './alias-normalization.mjs';
import { checkDatabasePolicy } from './database-policy.mjs';
import { assertSourceTraceability } from './traceability.mjs';
import { GATE_STATUS } from './errors.mjs';
import { validateSpecDefects } from './spec-defects.mjs';
import { validateDependencyReviews } from './dependency-review.mjs';

/** Ordered gate ids for parent-gating. */
const GATE_ORDER = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5'];

/**
 * Run the whole gate pipeline.
 *
 * @param {object} input - { structure, inventory, workspace, dependencies, adapters, decisions }
 * @returns {{ gates: Array<object>, finalAudit: object, status: string }}
 */
export function runGatePipeline(input = {}) {
  const { structure, inventory, workspace, dependencies, adapters, decisions, review } = input;
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
  const treeReport = evaluateTree(workspaceData, packages);
  const boundaryResolution = evaluateBoundaryResolution(dependenciesData, packages);
  const boundaryCoverage = evaluateBoundaryCoverage(dependenciesData);
  const responsibilityResult = validatePackageResponsibilities(packages);
  const specDefectReport = validateSpecDefects({
    candidates: structure?.spec_pulse?.candidates ?? [],
    specDefects: decisionsData.spec_defects ?? [],
    residualQuestions: decisionsData.residual_questions ?? [],
  });
  // The dependency review is computed once from the decisions and handed to the
  // pipeline, so the gate judges exactly the candidates the manifest publishes.
  const dependencyReviewReport = validateDependencyReviews({
    candidates: review?.candidates ?? [],
    reviews: decisionsData.dependency_reviews ?? [],
    normalEdges: dependenciesData.normalEdges ?? [],
    boundaries: dependenciesData.boundaries ?? [],
  });
  const referenceResolution = evaluateReferenceResolution(packages, decisionsData, inventoryData);
  const traceabilityReport = evaluateTraceability(inventoryData);
  const semanticApproval = evaluateSemanticApproval(decisionsData);
  const dagResult = evaluateDag(dependenciesData, workspaceData.packages);
  const dbResult = evaluateDatabase(adapters, packages);
  const portBoundary = checkPortAdapterBoundary({ ports: adapters?.ports ?? [], packages });
  const aliasCycles = detectAliasCycles(aliasPairsFrom(inventoryData.normalization_decisions));
  const approvalCount = (decisionsData.approvals ?? []).length;
  const objectClaimCollisions = inventoryData.object_claim_collisions ?? [];
  const approvedDecisionIds = new Set((decisionsData.approvals ?? []).map((approval) => approval.decisionId));
  // A collision is a question, not a defect: the same name can legitimately be both
  // an object and a claim. It is resolved by an approval that names its key, and
  // until one does, the gate refuses rather than permit it to pass unexamined.
  const unresolvedCollisions = objectClaimCollisions.filter(
    (collision) => !approvedDecisionIds.has(collision.normalized_key),
  );

  const checks = [
    { id: 'G0', status: GATE_STATUS.PASS, counts: {}, reasons: ['input lock passed'] },
    structureResult,
    {
      id: 'G2',
      status: reviewRequiredCount > 0 || !traceabilityReport.complete || !semanticApproval.approved ? GATE_STATUS.REVIEW_REQUIRED : GATE_STATUS.PASS,
      counts: { review_required_count: reviewRequiredCount, unresolved_count: unresolvedCandidates.length, missing_source_traceability_count: traceabilityReport.missing.length, semantic_approval_missing: semanticApproval.approved ? 0 : 1 },
      reasons: []
        .concat(reviewRequiredCount > 0 ? [`${reviewRequiredCount} candidate(s) still require review`] : [])
        .concat(traceabilityReport.errors)
        .concat(semanticApproval.approved ? [] : [semanticApproval.reason]),
    },
    {
      id: 'G3',
      status:
        catalogErrors.length === 0 &&
        ownershipResult.isClean &&
        boundaryRisks.length === 0 &&
        responsibilityResult.ok &&
        specDefectReport.ok &&
        dependencyReviewReport.ok &&
        treeReport.consistent &&
        boundaryResolution.unresolved === 0 &&
        boundaryCoverage.uncoveredEdges === 0 &&
        boundaryCoverage.orphanBoundaries === 0 &&
        referenceResolution.unknownOwns === 0 &&
        referenceResolution.unknownOwnership === 0 &&
        portBoundary.violations.length === 0 &&
        portBoundary.missingPorts.length === 0 &&
        unresolvedCollisions.length === 0 &&
        aliasCycles.length === 0
          ? GATE_STATUS.PASS
          : GATE_STATUS.REVIEW_REQUIRED,
      counts: {
        ...ownershipResult.counts,
        boundary_risk_count: boundaryRisks.length,
        missing_responsibilities_count: responsibilityResult.missing_responsibilities_count,
        spec_defect_count: specDefectReport.errors.length,
        residual_question_count: (decisionsData.residual_questions ?? []).length,
        dependency_review_count: dependencyReviewReport.errors.length,
        unresolved_review_count: (decisionsData.dependency_reviews ?? []).filter((entry) => entry?.decision === 'residual').length,
        tree_catalog_mismatch_count: treeReport.errors.length,
        unresolved_boundary_count: boundaryResolution.unresolved,
        uncovered_edge_count: boundaryCoverage.uncoveredEdges,
        orphan_boundary_count: boundaryCoverage.orphanBoundaries,
        unknown_owns_reference_count: referenceResolution.unknownOwns,
        unknown_ownership_reference_count: referenceResolution.unknownOwnership,
        unattached_adapter_count: portBoundary.violations.length,
        missing_port_count: portBoundary.missingPorts.length,
        object_claim_collision_count: objectClaimCollisions.length,
        unresolved_object_claim_collision_count: unresolvedCollisions.length,
        alias_cycle_count: aliasCycles.length,
      },
      reasons: catalogErrors
        .map((error) => error.message)
        .concat(responsibilityResult.errors)
        .concat(ownershipResult.details)
        .concat(specDefectReport.errors)
        .concat(dependencyReviewReport.errors)
        .concat(boundaryRisks.map((risk) => risk.detail))
        .concat(treeReport.errors)
        .concat(boundaryResolution.errors)
        .concat(boundaryCoverage.errors)
        .concat(referenceResolution.errors)
        .concat(portBoundary.violations.map((violation) => `${violation.packageId} is an adapter that no port implements through, so it is reached outside the boundary`))
        .concat(portBoundary.missingPorts.map((capability) => `capability ${capability} is declared as an external implementation but no port provides it`))
        .concat(unresolvedCollisions.map((collision) => `object and claim candidates share the normalized key ${collision.normalized_key}, which no approval resolves`))
        .concat(aliasCycles.map((cycle) => `alias cycle: ${cycle.path.join(' -> ')}`)),
    },
    {
      id: 'G4',
      status:
        dagResult.report.cycle_count === 0 &&
        dagResult.report.unknown_dependency_count === 0 &&
        dagResult.report.forbidden_edge_count === 0 &&
        dagResult.matrix.missingReasonCode.length === 0 &&
        dagResult.matrix.misspelledReasonCodeField.length === 0 &&
        dagResult.matrix.undeclared.length === 0 &&
        dagResult.matrix.missingAlternative.length === 0
          ? GATE_STATUS.PASS
          : GATE_STATUS.FAIL,
      counts: {
        ...dagResult.report,
        declared_forbidden_edge_count: dagResult.report.declared_forbidden_edge_count ?? 0,
        missing_reason_code_count: dagResult.matrix.missingReasonCode.length,
        misspelled_reason_code_field_count: dagResult.matrix.misspelledReasonCodeField.length,
      },
      reasons: []
        .concat(dagResult.report.cycles?.map((cycle) => `cycle: ${cycle.path.join(' -> ')}`) ?? [])
        .concat(dagResult.report.forbidden_edge_reasons ?? [])
        .concat(dagResult.matrix.missingReasonCode.map((edge) => (edge.reasonCode === null || edge.reasonCode === undefined
          ? `normal edge ${edge.from}->${edge.to} declares no reasonCode the machine can read`
          : `normal edge ${edge.from}->${edge.to} states the unknown reasonCode "${edge.reasonCode}"`)))
        .concat(dagResult.matrix.misspelledReasonCodeField.map((edge) => edge.detail))
        .concat(dagResult.matrix.undeclared.map((edge) => `dependency edge ${edge.from}->${edge.to} names a package outside the catalog`))
        .concat(dagResult.matrix.missingAlternative.map((edge) => `forbidden edge ${edge.from}->${edge.to} declares no alternative route`)),
    },
    {
      id: 'G5',
      status:
        dbResult.raw_sql_count === 0 &&
        dbResult.db_type_leak_count === 0 &&
        dbResult.migration_atomicity_misuse_count === 0
          ? GATE_STATUS.PASS
          : GATE_STATUS.FAIL,
      counts: {
        raw_sql_count: dbResult.raw_sql_count,
        db_type_leak_count: dbResult.db_type_leak_count,
        migration_atomicity_misuse_count: dbResult.migration_atomicity_misuse_count,
        approval_count: approvalCount,
      },
      reasons: dbResult.details,
    },
  ];

  const gates = applyParentGating(checks);
  const finalAudit = buildFinalAudit({ gates, ownershipResult, dagResult, dbResult, reviewRequiredCount, unresolvedCandidates, responsibilityResult });
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
    invariants: inventoryData.invariants ?? [],
    stateMachines: inventoryData.stateMachines ?? [],
    errorCodes: inventoryData.errorCodes ?? [],
    requiredTests: inventoryData.requiredTests ?? [],
    packages,
  });
  const clean =
    result.orphan_object_count === 0 &&
    result.orphan_claim_count === 0 &&
    result.owner_collision_count === 0 &&
    result.invalid_owner_layer_count === 0 &&
    result.unallocated_count === 0 &&
    // A catalogue and a table that disagree is a defect of its own: the item would be
    // published with no owner while every other count reads zero.
    result.ownership_disagreement_count === 0;
  const counts = {
    orphan_object_count: result.orphan_object_count,
    orphan_claim_count: result.orphan_claim_count,
    owner_collision_count: result.owner_collision_count,
    invalid_owner_layer_count: result.invalid_owner_layer_count,
    unallocated_count: result.unallocated_count,
    ownership_disagreement_count: result.ownership_disagreement_count,
  };
  return { counts, isClean: clean, details: result.details };
}

function evaluateTree(workspaceData, packages) {
  const tree = workspaceData.tree;
  if (packages.length > 0 && (!tree || tree.length === 0)) {
    return { consistent: false, errors: ['a workspace tree is required when packages are declared'] };
  }
  if (!tree || tree.length === 0) {
    return { consistent: true, errors: [] };
  }
  const report = validateWorkspaceTree({ tree, packages });
  return { consistent: report.consistent, errors: report.errors };
}

function evaluateBoundaryCoverage(dependenciesData) {
  const edgeKeys = new Set((dependenciesData.normalEdges ?? []).map((edge) => `${edge.from}->${edge.to}`));
  const boundaryKeys = new Set((dependenciesData.boundaries ?? []).map((boundary) => `${boundary.consumer}->${boundary.provider}`));
  const errors = [];
  let uncoveredEdges = 0;
  let orphanBoundaries = 0;
  for (const key of edgeKeys) {
    if (!boundaryKeys.has(key)) {
      errors.push(`normal edge "${key}" has no contract boundary`);
      uncoveredEdges++;
    }
  }
  for (const key of boundaryKeys) {
    if (!edgeKeys.has(key)) {
      errors.push(`contract boundary "${key}" has no corresponding normal edge`);
      orphanBoundaries++;
    }
  }
  return { uncoveredEdges, orphanBoundaries, errors };
}

function evaluateBoundaryResolution(dependenciesData, packages) {
  const packageIds = new Set(packages.map((pkg) => pkg.id));
  const boundaries = dependenciesData.boundaries ?? [];
  const errors = [];
  let unresolved = 0;
  for (const boundary of boundaries) {
    if (!packageIds.has(boundary.consumer)) {
      errors.push(`boundary consumer "${boundary.consumer}" is not in the package catalog`);
      unresolved++;
    }
    if (!packageIds.has(boundary.provider)) {
      errors.push(`boundary provider "${boundary.provider}" is not in the package catalog`);
      unresolved++;
    }
  }
  return { unresolved, errors };
}

function evaluateTraceability(inventoryData) {
  const listKeys = ['objects', 'claims', 'terms', 'invariants', 'stateMachines', 'errorCodes', 'requiredTests'];
  const candidates = [];
  for (const key of listKeys) {
    for (const candidate of inventoryData[key] ?? []) candidates.push(candidate);
  }
  const report = assertSourceTraceability(candidates);
  return { complete: report.ok, missing: report.missing, errors: report.missing.map((id) => `candidate ${id} has no source traceability`) };
}

function evaluateSemanticApproval(decisionsData) {
  const semanticReview = decisionsData.semantic_review;
  if (!semanticReview || semanticReview.status !== 'APPROVED' || typeof semanticReview.approver !== 'string' || semanticReview.approver.length === 0) {
    return { approved: false, reason: 'semantic design has not been explicitly approved: add semantic_review { status: "APPROVED", statement, approver } to the decision input' };
  }
  return { approved: true };
}

function evaluateReferenceResolution(packages, decisionsData, inventoryData) {
  const inventoryIds = new Set();
  const keys = ['objects', 'claims', 'invariants', 'stateMachines', 'errorCodes', 'requiredTests'];
  for (const key of keys) {
    for (const candidate of inventoryData[key] ?? []) {
      inventoryIds.add(candidate.id);
    }
  }
  const ownsKeys = ['objects', 'claims', 'invariants', 'state_machines', 'error_codes', 'required_tests'];
  const errors = [];
  let unknownOwns = 0;
  let unknownOwnership = 0;
  for (const pkg of packages ?? []) {
    const owns = pkg.owns ?? {};
    for (const ownsKey of ownsKeys) {
      for (const ownedId of owns[ownsKey] ?? []) {
        if (!inventoryIds.has(ownedId)) {
          errors.push(`owns.${ownsKey} ${ownedId} of package ${pkg.id} does not resolve to any inventory item`);
          unknownOwns++;
        }
      }
    }
  }
  for (const entry of decisionsData.ownership ?? []) {
    if (!inventoryIds.has(entry.objectId)) {
      errors.push(`ownership entry objectId ${entry.objectId} does not resolve to any inventory item`);
      unknownOwnership++;
    }
  }
  return { unknownOwns, unknownOwnership, errors };
}

/**
 * Validate that every package declares what it is responsible for.
 *
 * Responsibilities are the source of the seed's "role in the whole system", so a
 * package without them cannot be handed to the directory loop: the count alone is
 * reported for diagnosis, and the messages name each offending package.
 *
 * @param {Array<object>} packages - package descriptors
 * @returns {{ ok: boolean, errors: string[], missing_responsibilities_count: number }}
 */
export function validatePackageResponsibilities(packages) {
  const offending = (packages ?? []).filter((pkg) => !Array.isArray(pkg.responsibilities) || pkg.responsibilities.length === 0);
  return {
    ok: offending.length === 0,
    errors: offending.map((pkg) => `package ${pkg.id} declares no responsibilities`),
    missing_responsibilities_count: offending.length,
  };
}

function evaluateDag(dependenciesData, packages) {
  const normalEdges = dependenciesData.normalEdges ?? dependenciesData.edges ?? [];
  const forbiddenEdges = dependenciesData.forbiddenEdges ?? [];
  const report = runDagChecks({ packages: packages ?? [], edges: normalEdges, forbiddenEdges });
  // The vocabulary and endpoint check lives in its own module and was never called:
  // G4 now runs it, so an edge the machine cannot read a reason code from is refused.
  const matrix = checkDependencyMatrix({ packages: packages ?? [], normalEdges, forbiddenEdges });
  return { report, matrix };
}

/**
 * Evaluate the database policy, returning one key set on both of its exits.
 *
 * The G5 predicate reads all three counts, so an exit that omitted one would make
 * the comparison `undefined === 0` and turn a legitimate `applicable: false` run
 * into a FAIL. Both exits therefore answer with the same three names, and
 * `checkDatabasePolicy` already answers with them on its own early return.
 *
 * @param {object|undefined} adapters - the pipeline adapters, possibly absent
 * @param {Array<object>} packages - the package catalog
 * @returns {{ raw_sql_count: number, db_type_leak_count: number,
 *             migration_atomicity_misuse_count: number, details: Array<string> }}
 */
// [::TICKET::] PX-217 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-217 --for-spec --no-implementation-order`.
function evaluateDatabase(adapters, packages) {
  const adapterPolicy = adapters?.databasePolicy;
  if (!adapterPolicy) {
    return { raw_sql_count: 0, db_type_leak_count: 0, migration_atomicity_misuse_count: 0, details: [] };
  }
  const result = checkDatabasePolicy({ databasePolicy: adapterPolicy, packages });
  return result;
}

/**
 * The alias map the manifest publishes, read as name -> alias edges.
 *
 * The pairs come from the published `normalization_decisions` rather than from a
 * second normalization pass, so the map the gate walks is the map the artifact
 * carries: a manifest that publishes a cycle cannot be judged as though it did not.
 *
 * A decision that maps a name to itself is not an alias edge. Normalization emits
 * one when two candidates carry the same canonical name, which is a duplicate it has
 * already merged; walking it would report that duplicate as a one-step cycle and
 * refuse a sound run. `harvestObjectCandidates` groups by exact name, so the pipeline
 * produces none today, and they are excluded here so that the word "cycle" cannot
 * come to mean "duplicate".
 *
 * @param {Array<object>} normalizationDecisions - `{ from, to }` merge records
 * @returns {Array<{ name: string, alias: string }>}
 */
// [::TICKET::] PX-217 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-217 --for-spec --no-implementation-order`.
function aliasPairsFrom(normalizationDecisions) {
  return (normalizationDecisions ?? [])
    .filter((decision) => decision.from !== decision.to)
    .map((decision) => ({ name: decision.from, alias: decision.to }));
}

// [::TICKET::] PX-217 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-217 --for-spec --no-implementation-order`.
function countReviewRequired(inventoryData) {
  let count = 0;
  const listKeys = ['objects', 'claims', 'terms', 'invariants', 'stateMachines', 'errorCodes', 'requiredTests'];
  for (const listKey of listKeys) {
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

// [::TICKET::] PX-217 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-217 --for-spec --no-implementation-order`.
function buildFinalAudit(aggregate) {
  const { gates, ownershipResult, dagResult, dbResult, reviewRequiredCount, unresolvedCandidates, responsibilityResult } = aggregate;
  const passed = gates.every((gate) => gate.status === GATE_STATUS.PASS);
  const report = dagResult.report;
  // The G3 record is read once: two counts transcribed from two lookups is two
  // chances for the report to disagree with the gate it reports on.
  const g3Counts = gates.find((gate) => gate.id === 'G3')?.counts ?? {};
  return {
    status: passed ? GATE_STATUS.PASS : GATE_STATUS.REVIEW_REQUIRED,
    orphan_object_count: ownershipResult.counts.orphan_object_count,
    orphan_claim_count: ownershipResult.counts.orphan_claim_count,
    owner_collision_count: ownershipResult.counts.owner_collision_count,
    unallocated_count: ownershipResult.counts.unallocated_count ?? 0,
    unknown_dependency_count: report.unknown_dependency_count,
    forbidden_dependency_count: report.forbidden_edge_count,
    layer_violation_count: report.layer_violation_count,
    cycle_count: report.cycle_count,
    review_required_count: reviewRequiredCount,
    unresolved_count: unresolvedCandidates.length,
    missing_responsibilities_count: responsibilityResult.missing_responsibilities_count,
    ownership_disagreement_count: g3Counts.ownership_disagreement_count ?? 0,
    spec_defect_count: g3Counts.spec_defect_count ?? 0,
    residual_question_count: g3Counts.residual_question_count ?? 0,
    dependency_review_count: g3Counts.dependency_review_count ?? 0,
    unresolved_review_count: g3Counts.unresolved_review_count ?? 0,
    raw_sql_count: dbResult.raw_sql_count,
    db_type_leak_count: dbResult.db_type_leak_count,
    migration_atomicity_misuse_count: dbResult.migration_atomicity_misuse_count,
    unattached_adapter_count: g3Counts.unattached_adapter_count ?? 0,
    missing_port_count: g3Counts.missing_port_count ?? 0,
    object_claim_collision_count: g3Counts.object_claim_collision_count ?? 0,
    unresolved_object_claim_collision_count: g3Counts.unresolved_object_claim_collision_count ?? 0,
    alias_cycle_count: g3Counts.alias_cycle_count ?? 0,
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
