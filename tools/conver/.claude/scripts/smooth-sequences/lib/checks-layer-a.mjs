/**
 * Layer A: the structural checks that need no typed contract.
 *
 * Every check here answers a question the artifact and the manifests already carry:
 * does a reference resolve, is a status reachable, is a declared clause present, does a
 * contribution name an operation its package owns. None of them reads prose, so none of
 * them can disagree with a reader about what a sentence means.
 *
 * Every finding names the authored surface and the producer that re-derives the verdict,
 * so a reader can repair from the output without opening the report.
 */
import { readLedgerRows } from '../../sequences-slice/lib/distribution-ledger.mjs';
import { finding } from './index.mjs';
import {
  ALLOCATE_FINALIZE_COMMAND,
  repairRouteFor,
  routeForOperation,
  routeForPackage,
  routeForSpecRow,
  routeForStep,
  SEQUENCES_SLICE_COMMAND,
  SURFACE,
} from './repair-route.mjs';

const DRAWN_OUTCOMES = new Set(['direct', 'viaNeighbour', 'singleStep']);
const ACTIVE_DISPOSITION = 'active';
const V3 = 3;

/** One finding with its route already resolved. */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
function addFinding(findings, checkId, subject, entry) {
  findings.push(finding(checkId, entry.className, subject, {
    ...entry.route,
    why: entry.why,
    fix: entry.fix,
  }));
}

/** The contiguous and referential integrity of the enumeration. */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
export function checkEnumerationIntegrity(index) {
  const findings = [...index.duplicates];

  for (const step of index.artifact.steps ?? []) {
    if (!index.operationsById.has(step.operation)) {
      addFinding(findings, 'S1.step-unresolved-operation', step.id, {
        className: 'deficiency',
        route: routeForStep('S1.step-unresolved-operation', index, step),
        why: `step ${step.id} names operation ${step.operation}, which the artifact does not declare`,
        fix: `declare ${step.operation} in the specification or retarget the step to a declared operation`,
      });
    }
    const sequence = index.sequencesById.get(step.sequence);
    if (sequence === undefined || !DRAWN_OUTCOMES.has(sequence.outcome)) {
      addFinding(findings, 'S1.step-unresolved-sequence', step.id, {
        className: 'deficiency',
        route: routeForStep('S1.step-unresolved-sequence', index, step),
        why: `step ${step.id} belongs to ${step.sequence}, which is not a drawn sequence`,
        fix: `attach ${step.id} to a sequence whose outcome is direct or singleStep`,
      });
    }
  }

  for (const sequence of index.artifact.sequences ?? []) {
    if (!DRAWN_OUTCOMES.has(sequence.outcome)) continue;
    if (!index.stepsBySequence.has(sequence.id)) {
      addFinding(findings, 'S1.sequence-without-step', sequence.id, {
        className: 'omission',
        route: routeForSpecRow('S1.sequence-without-step', index, sequence.id),
        why: `sequence ${sequence.id} claims to be a sequence and carries no step`,
        fix: `add the steps of ${sequence.id} or rule the region notASequence with a ground`,
      });
    }
  }

  return findings;
}

/** The operation envelope: status graph, finality, and the declared interface mappings. */
// [::TICKET::] PX-276 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-276 --for-spec --no-implementation-order`.
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
export function checkOperationEnvelope(index) {
  const findings = [];
  const terminalStatuses = index.vocabulary.terminalStatuses === null ? null : new Set(index.vocabulary.terminalStatuses);
  const requiredInterfaces = index.vocabulary.requiredInterfaces;
  for (const operation of index.artifact.operations ?? []) {
    if (operation.disposition !== ACTIVE_DISPOSITION) continue;
    checkStatusGraph(index, operation, terminalStatuses, findings);
    checkFinality(index, operation, findings);
    checkInterfaceMappings(index, operation, requiredInterfaces, findings);
  }
  return findings;
}

/** The status graph: every named status resolves, and no terminal status leaves. */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
function checkStatusGraph(index, operation, terminalStatuses, findings) {
  const transitions = operation.allowed_status_transitions ?? {};
  const statuses = new Set(Object.keys(transitions));
  const routeFor = (checkId) => routeForOperation(checkId, index, operation);
  if (!statuses.has(operation.initial_status)) {
    addFinding(findings, 'S3.status-initial-unknown', operation.id, {
      className: 'deficiency',
      route: routeFor('S3.status-initial-unknown'),
      why: `initial status ${operation.initial_status} is not a declared status of ${operation.id}`,
      fix: `declare ${operation.initial_status} in allowed_status_transitions or correct the initial status`,
    });
  }
  for (const [source, targets] of Object.entries(transitions)) {
    for (const target of targets ?? []) {
      if (!statuses.has(target)) {
        addFinding(findings, 'S3.transition-target-unknown', operation.id, {
          className: 'deficiency',
          route: routeFor('S3.transition-target-unknown'),
          why: `transition ${source} -> ${target} names an undeclared status`,
          fix: `declare ${target} in allowed_status_transitions or remove the transition`,
        });
      }
    }
    if ((targets ?? []).length === 0) continue;
    if (terminalStatuses !== null && terminalStatuses.has(source)) {
      addFinding(findings, 'S3.transition-out-of-terminal', operation.id, {
        className: 'contradiction',
        route: routeFor('S3.transition-out-of-terminal'),
        why: `declared terminal status ${source} declares an outgoing transition`,
        fix: `remove the outgoing transition from ${source} or remove it from terminalStatuses`,
      });
    }
  }
}

/** A step that waits on an external dependency must say when it is complete. */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
function checkFinality(index, operation, findings) {
  if (operation.external_dependency_class === 'none' || operation.finality_predicate) return;
  addFinding(findings, 'S3.finality-missing-for-external', operation.id, {
    className: 'omission',
    route: routeForOperation('S3.finality-missing-for-external', index, operation),
    why: `operation ${operation.id} waits on ${operation.external_dependency_class} and declares no finality predicate`,
    fix: 'declare finality_predicate so the caller knows when the external step is complete',
  });
}

/** Every declared interface must be mapped by the operation. */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
function checkInterfaceMappings(index, operation, requiredInterfaces, findings) {
  if (requiredInterfaces === null) return;
  for (const interfaceName of requiredInterfaces) {
    if (isInterfaceMappingPresent(operation[interfaceName])) continue;
    addFinding(findings, 'S3.interface-mapping-missing', operation.id, {
      className: 'omission',
      route: routeForOperation('S3.interface-mapping-missing', index, operation),
      why: `operation ${operation.id} does not map to declared interface ${interfaceName}`,
      fix: `map ${interfaceName} on the operation or remove it from the declared interface set`,
    });
  }
}

/** Whether an operation carries a non-empty mapping for one declared interface. */
// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.
function isInterfaceMappingPresent(value) {
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (value !== null && typeof value === 'object') return Object.keys(value).length > 0;
  return false;
}

/** The boundary clauses and the two sides that carry them. */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
export function checkBoundaryClauses(index) {
  const findings = [];
  for (const boundary of index.treeManifest.dependencies?.boundaries ?? []) {
    const contract = index.contractsByBoundary.get(boundary.id);
    if (contract === undefined) {
      addFinding(findings, 'S4.boundary-contract-missing', boundary.id, {
        className: 'omission',
        route: repairRouteFor('S4.boundary-contract-missing', { locator: boundary.id }),
        why: `boundary ${boundary.id} has no contract_registry row`,
        fix: `add the ${boundary.id} contract edge to the allocate decisions`,
      });
      continue;
    }
    checkContractClauses(boundary, contract, findings);
    checkBoundarySides(index, boundary, findings);
  }
  return findings;
}

/** The contract row: source references and the clauses stage2 requires. */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
function checkContractClauses(boundary, contract, findings) {
  const allocateRoute = (checkId, locator) => repairRouteFor(checkId, { locator });
  const sourceRefs = Array.isArray(contract.source_refs) ? contract.source_refs : [];
  const sourceGround = typeof contract.source_refs_ground === 'string' ? contract.source_refs_ground.trim() : '';
  if (sourceRefs.length === 0 && sourceGround === '') {
    addFinding(findings, 'S4.contract-source-refs-missing', `${boundary.id}/source_refs`, {
      className: 'omission',
      route: allocateRoute('S4.contract-source-refs-missing', `${boundary.id}/source_refs`),
      why: `contract ${boundary.id} cites no source_refs and records no ground`,
      fix: 'cite source_refs or record a source_refs_ground in the allocate decisions',
    });
  }

  const required = new Set(boundary.stage2_contract_scope ?? []);
  const present = new Set(Object.keys(contract.clauses ?? {}));
  for (const clause of required) {
    if (!present.has(clause)) {
      addFinding(findings, 'S4.boundary-clause-missing', `${boundary.id}/${clause}`, {
        className: 'omission',
        route: allocateRoute('S4.boundary-clause-missing', `${boundary.id}/${clause}`),
        why: `stage2_contract_scope requires ${clause}, and contract_registry has no ${clause} clause`,
        fix: `add the ${clause} clause for ${boundary.id} in the allocate decisions`,
      });
    }
  }
  for (const clause of present) {
    if (!required.has(clause)) {
      addFinding(findings, 'S4.boundary-clause-extra', `${boundary.id}/${clause}`, {
        className: 'deficiency',
        route: allocateRoute('S4.boundary-clause-extra', `${boundary.id}/${clause}`),
        why: `contract_registry carries ${clause}, which stage2_contract_scope does not declare`,
        fix: `remove the ${clause} clause or declare it in stage2_contract_scope`,
      });
    }
  }
}

/** The two sides a boundary names, checked against the direction and counterpart it fixes. */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
function checkBoundarySides(index, boundary, findings) {
  // A side mismatch lives in the allocate decision, but the view is derived after the
  // decision changes; the producer names both steps so a repair cannot stop halfway.
  const boundarySideRoute = (locator, packageId) => {
    const packagePath = index.packagesById.get(packageId)?.path ?? packageId;
    return {
      ...repairRouteFor('S4.boundary-side-mismatch', { locator }),
      producer: `${ALLOCATE_FINALIZE_COMMAND} && ${SEQUENCES_SLICE_COMMAND} ${index.artifactPath} ${packagePath}`,
    };
  };
  const sides = new Map();
  for (const pkg of index.packages) {
    const units = (pkg.view?.obligationUnits ?? []).filter((unit) => unit.subject === boundary.id);
    for (const unit of units) sides.set(pkg.id, unit);
  }
  for (const [packageId, expectedDirection] of [
    [boundary.provider_package, 'provides'],
    [boundary.consumer_package, 'consumes'],
  ]) {
    const unit = sides.get(packageId);
    const locator = `${boundary.id}/${packageId}`;
    if (unit === undefined) {
      addFinding(findings, 'S4.boundary-side-mismatch', locator, {
        className: 'omission',
        route: boundarySideRoute(locator, packageId),
        why: `${packageId} carries no side of ${boundary.id}`,
        fix: `project the ${expectedDirection} side of ${boundary.id} into ${packageId} from the allocate decision, then re-project its view`,
      });
      continue;
    }
    if (unit.direction !== expectedDirection) {
      addFinding(findings, 'S4.boundary-side-mismatch', locator, {
        className: 'contradiction',
        route: boundarySideRoute(locator, packageId),
        why: `${packageId} declares ${unit.direction} for ${boundary.id}, and the registry makes it ${expectedDirection}`,
        fix: `correct the direction to ${expectedDirection} in the allocate decisions, then re-project the view`,
      });
    }
    const expectedCounterpart = packageId === boundary.provider_package ? boundary.consumer_package : boundary.provider_package;
    if (unit.counterpart !== expectedCounterpart) {
      addFinding(findings, 'S4.boundary-side-mismatch', locator, {
        className: 'contradiction',
        route: boundarySideRoute(locator, packageId),
        why: `${packageId} names counterpart ${unit.counterpart}, not ${expectedCounterpart}`,
        fix: `correct the counterpart to ${expectedCounterpart} in the allocate decisions, then re-project the view`,
      });
    }
  }
}

/** The contribution surface a v2 artifact does not carry. */
export function contributionWithheld(index) {
  if (index.schemaVersion === V3) return [];
  return [{
    layer: 'S4',
    check: 'S4.contribution',
    reason: 'v2 artifact carries no registry_contribution',
  }];
}

/** Whether a not_required declaration explains itself. */
// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.
function hasContributionGround(operation) {
  return typeof operation.registry_contribution_ground === 'string'
    && operation.registry_contribution_ground.trim() !== '';
}

/** Whether the package distribution ledger records the operation as a unit. */
// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.
function ledgerRecordsOperation(pkg, operationId) {
  return (readLedgerRows(pkg.rfc ?? '') ?? []).some((row) => row.unit === `op-${operationId}`);
}

/** Every owned active operation declares its contribution and is recorded by its owner. */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
export function checkContributionCompleteness(index) {
  if (index.schemaVersion !== V3) return [];
  const findings = [];
  for (const [packageId, units] of index.ownedOperationUnitsByPackage) {
    const pkg = index.packagesById.get(packageId);
    for (const unit of units) {
      const operation = index.operationsById.get(unit.operationId);
      if (operation === undefined || operation.disposition !== ACTIVE_DISPOSITION) continue;
      const value = operation.registry_contribution;
      if (value !== 'required' && value !== 'not_required') {
        addFinding(findings, 'S4.contribution-missing', `${packageId}/${unit.operationId}`, {
          className: 'omission',
          route: routeForOperation('S4.contribution-missing', index, operation),
          why: `operation ${unit.operationId} declares registry_contribution ${value}, which is neither required nor not_required`,
          fix: 'set registry_contribution to required or not_required',
        });
      }
      if (value === 'not_required' && !hasContributionGround(operation)) {
        addFinding(findings, 'S4.contribution-ground-missing', `${packageId}/${unit.operationId}`, {
          className: 'omission',
          route: routeForOperation('S4.contribution-ground-missing', index, operation),
          why: `operation ${unit.operationId} declares not_required with no ground`,
          fix: 'record registry_contribution_ground naming why no registry row is owed',
        });
      }
      if (pkg === undefined || !ledgerRecordsOperation(pkg, unit.operationId)) {
        addFinding(findings, 'S4.contribution-missing', `${packageId}/${unit.operationId}`, {
          className: 'omission',
          route: repairRouteFor('S4.contribution-missing', {
            surface: SURFACE.PACKAGE_RFC,
            packagesById: index.packagesById,
            packageId,
            locator: `distribution-ledger/op-${unit.operationId}`,
          }),
          why: `owned active operation ${unit.operationId} has no op-${unit.operationId} row in ${packageId}'s distribution ledger`,
          fix: `add the op-${unit.operationId} row to ${packageId}'s RFC distribution ledger or record the unit as declared-residual`,
        });
      }
    }
  }
  return findings;
}

/** The artifact, the per-package view and the package RFC agree on the unit set. */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
export function checkArtifactViewConsistency(index) {
  const findings = [];
  for (const pkg of index.packages) {
    if (pkg.view === null) {
      addFinding(findings, 'S7.view-missing', pkg.id, {
        className: 'omission',
        route: routeForPackage('S7.view-missing', index, pkg.id),
        why: `package ${pkg.id} carries no SEQUENCES.json`,
        fix: `project the view into ${pkg.path} with sequences-slice`,
      });
      continue;
    }
    checkViewIdentity(index, pkg, findings);
    checkViewUnits(index, pkg, findings);
    checkRfcBoundaries(index, pkg, findings);
  }
  return findings;
}

/** The view's own identity: the package it names is the package whose directory holds it. */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
function checkViewIdentity(index, pkg, findings) {
  if (pkg.view.packageId === pkg.id) return;
  addFinding(findings, 'S7.view-package-mismatch', pkg.id, {
    className: 'contradiction',
    route: routeForPackage('S7.view-package-mismatch', index, pkg.id),
    why: `view names ${pkg.view.packageId}, and the manifest path belongs to ${pkg.id}`,
    fix: `re-project the view from the artifact so packageId is ${pkg.id}`,
  });
}

/** Every unit the view owns or crosses resolves to a declared operation or sequence. */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
function checkViewUnits(index, pkg, findings) {
  const reportUnknown = (subject) => {
    addFinding(findings, 'S7.view-unit-mismatch', subject, {
      className: 'contradiction',
      route: routeForPackage('S7.view-unit-mismatch', index, pkg.id),
      why: `view names ${subject.slice(pkg.id.length + 1)}, which the artifact does not declare`,
      fix: 're-project the view from the artifact',
    });
  };
  for (const unit of pkg.view.ownedOperationUnits ?? []) {
    if (!index.operationsById.has(unit.operationId)) reportUnknown(`${pkg.id}/${unit.operationId}`);
  }
  if (index.schemaVersion !== 3) return;
  for (const unit of pkg.view.crossBoundarySequenceUnits ?? []) {
    if (!index.sequencesById.has(unit.sequenceId)) reportUnknown(`${pkg.id}/${unit.sequenceId}`);
  }
}

/** A carried boundary the view names must also appear in the package RFC. */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
function checkRfcBoundaries(index, pkg, findings) {
  for (const unit of pkg.view.obligationUnits ?? []) {
    const carriesDeclaredBoundary = unit.relation === 'carries' && index.boundariesById.has(unit.subject);
    if (!carriesDeclaredBoundary || pkg.rfc === null || pkg.rfc.includes(unit.subject)) continue;
    addFinding(findings, 'S7.rfc-boundary-missing', `${pkg.id}/${unit.subject}`, {
      className: 'omission',
      route: routeForPackage('S7.rfc-boundary-missing', index, pkg.id, unit.subject),
      why: `view carries ${unit.subject}, and the package RFC does not name it`,
      fix: `add the ${unit.subject} obligations to ${pkg.path}/RFC.md`,
    });
  }
}
