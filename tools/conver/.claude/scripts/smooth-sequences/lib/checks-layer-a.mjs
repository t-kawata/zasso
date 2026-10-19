/**
 * Layer A: the structural checks that need no typed contract.
 *
 * Every check here answers a question the artifact and the manifests already carry:
 * does a reference resolve, is a status reachable, is a declared clause present, does a
 * contribution name an operation its package owns. None of them reads prose, so none of
 * them can disagree with a reader about what a sentence means.
 */
import { readLedgerRows } from '../../sequences-slice/lib/distribution-ledger.mjs';
import { finding } from './index.mjs';

const DRAWN_OUTCOMES = new Set(['direct', 'viaNeighbour', 'singleStep']);
const ACTIVE_DISPOSITION = 'active';
const V3 = 3;

/** The contiguous and referential integrity of the enumeration. */
export function checkEnumerationIntegrity(index) {
  const findings = [...index.duplicates];

  for (const step of index.artifact.steps ?? []) {
    if (!index.operationsById.has(step.operation)) {
      findings.push(finding('S1.step-unresolved-operation', 'deficiency', step.id, `step ${step.id} names operation ${step.operation}, which the artifact does not declare`, {
        repair: `Declare ${step.operation} in the artifact or correct the step to name a declared operation.`,
      }));
    }
    const sequence = index.sequencesById.get(step.sequence);
    if (sequence === undefined || !DRAWN_OUTCOMES.has(sequence.outcome)) {
      findings.push(finding('S1.step-unresolved-sequence', 'deficiency', step.id, `step ${step.id} belongs to ${step.sequence}, which is not a drawn sequence`, {
        repair: `Attach ${step.id} to a sequence whose outcome is direct or singleStep.`,
      }));
    }
  }

  for (const sequence of index.artifact.sequences ?? []) {
    if (!DRAWN_OUTCOMES.has(sequence.outcome)) continue;
    if (!index.stepsBySequence.has(sequence.id)) {
      findings.push(finding('S1.sequence-without-step', 'omission', sequence.id, `sequence ${sequence.id} claims to be a sequence and carries no step`, {
        repair: `Add the steps of ${sequence.id} or rule the region notASequence with a ground.`,
      }));
    }
  }

  return findings;
}

/** The operation envelope: status graph, finality, and the declared interface mappings. */
export function checkOperationEnvelope(index) {
  const findings = [];
  const terminalStatuses = index.rules.terminalStatuses === null ? null : new Set(index.rules.terminalStatuses);
  const requiredInterfaces = index.rules.requiredInterfaces;
  for (const operation of index.artifact.operations ?? []) {
    if (operation.disposition !== ACTIVE_DISPOSITION) continue;
    const transitions = operation.allowed_status_transitions ?? {};
    const statuses = new Set(Object.keys(transitions));
    if (!statuses.has(operation.initial_status)) {
      findings.push(finding('S3.status-initial-unknown', 'deficiency', operation.id, `initial status ${operation.initial_status} is not a declared status of ${operation.id}`, {
        repair: `Add ${operation.initial_status} to allowed_status_transitions or correct the initial status.`,
      }));
    }
    for (const [source, targets] of Object.entries(transitions)) {
      for (const target of targets ?? []) {
        if (!statuses.has(target)) {
          findings.push(finding('S3.transition-target-unknown', 'deficiency', operation.id, `transition ${source} -> ${target} names an undeclared status`, {
            repair: `Declare ${target} in allowed_status_transitions or remove the transition.`,
          }));
        }
      }
      if ((targets ?? []).length === 0) continue;
      if (terminalStatuses !== null && terminalStatuses.has(source)) {
        findings.push(finding('S3.transition-out-of-terminal', 'contradiction', operation.id, `declared terminal status ${source} declares an outgoing transition`, {
          repair: `Remove the outgoing transition from ${source} or remove it from terminalStatuses.`,
        }));
      }
    }
    if (operation.external_dependency_class !== 'none' && !operation.finality_predicate) {
      findings.push(finding('S3.finality-missing-for-external', 'omission', operation.id, `operation ${operation.id} waits on ${operation.external_dependency_class} and declares no finality predicate`, {
        repair: 'Declare finality_predicate so the caller knows when the external step is complete.',
      }));
    }
    if (requiredInterfaces !== null) {
      for (const interfaceName of requiredInterfaces) {
        if (!isInterfaceMappingPresent(operation[interfaceName])) {
          findings.push(finding('S3.interface-mapping-missing', 'omission', operation.id, `operation ${operation.id} does not map to declared interface ${interfaceName}`, {
            repair: `Declare ${interfaceName} for the operation or remove it from requiredInterfaces.`,
          }));
        }
      }
    }
  }
  return findings;
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
export function checkBoundaryClauses(index) {
  const findings = [];
  for (const boundary of index.treeManifest.dependencies?.boundaries ?? []) {
    const contract = index.contractsByBoundary.get(boundary.id);
    if (contract === undefined) {
      findings.push(finding('S4.boundary-contract-missing', 'omission', boundary.id, `boundary ${boundary.id} has no contract_registry row`, {
        repair: `Add contract-boundary for ${boundary.id} to WORKSPACIFY-ALLOCATE-MANIFEST.json.`,
      }));
      continue;
    }
    const sourceRefs = Array.isArray(contract.source_refs) ? contract.source_refs : [];
    const sourceGround = typeof contract.source_refs_ground === 'string' ? contract.source_refs_ground.trim() : '';
    if (sourceRefs.length === 0 && sourceGround === '') {
      findings.push(finding('S4.contract-source-refs-missing', 'omission', `${boundary.id}/source_refs`, `contract ${boundary.id} cites no source_refs and records no ground`, {
        repair: `Add source_refs to the contract or record a source_refs_ground naming why the specification has no section for it.`,
      }));
    }

    const required = new Set(boundary.stage2_contract_scope ?? []);
    const present = new Set(Object.keys(contract.clauses ?? {}));
    for (const clause of required) {
      if (!present.has(clause)) {
        findings.push(finding('S4.boundary-clause-missing', 'omission', `${boundary.id}/${clause}`, `stage2_contract_scope requires ${clause}, and contract_registry has no ${clause} clause`, {
          repair: `Add the ${clause} clause to contract-boundary for ${boundary.id}.`,
        }));
      }
    }
    for (const clause of present) {
      if (!required.has(clause)) {
        findings.push(finding('S4.boundary-clause-extra', 'deficiency', `${boundary.id}/${clause}`, `contract_registry carries ${clause}, which stage2_contract_scope does not declare`, {
          repair: `Declare ${clause} in stage2_contract_scope or remove the clause.`,
        }));
      }
    }

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
      if (unit === undefined) {
        findings.push(finding('S4.boundary-side-mismatch', 'omission', `${boundary.id}/${packageId}`, `${packageId} carries no side of ${boundary.id}`, {
          repair: `Project the ${expectedDirection} side of ${boundary.id} into ${packageId}'s SEQUENCES.json.`,
        }));
        continue;
      }
      if (unit.direction !== expectedDirection) {
        findings.push(finding('S4.boundary-side-mismatch', 'contradiction', `${boundary.id}/${packageId}`, `${packageId} declares ${unit.direction} for ${boundary.id}, and the registry makes it ${expectedDirection}`, {
          repair: `Correct the direction to ${expectedDirection}.`,
        }));
      }
      const expectedCounterpart = packageId === boundary.provider_package ? boundary.consumer_package : boundary.provider_package;
      if (unit.counterpart !== expectedCounterpart) {
        findings.push(finding('S4.boundary-side-mismatch', 'contradiction', `${boundary.id}/${packageId}`, `${packageId} names counterpart ${unit.counterpart}, not ${expectedCounterpart}`, {
          repair: `Correct the counterpart to ${expectedCounterpart}.`,
        }));
      }
    }
  }
  return findings;
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
        findings.push(finding('S4.contribution-missing', 'omission', `${packageId}/${unit.operationId}`, `operation ${unit.operationId} declares registry_contribution ${value}, which is neither required nor not_required`, {
          repair: 'Set registry_contribution to required or not_required.',
        }));
      }
      if (value === 'not_required' && !hasContributionGround(operation)) {
        findings.push(finding('S4.contribution-ground-missing', 'omission', `${packageId}/${unit.operationId}`, `operation ${unit.operationId} declares not_required with no ground`, {
          repair: 'Record registry_contribution_ground naming why no registry row is owed.',
        }));
      }
      if (pkg === undefined || !ledgerRecordsOperation(pkg, unit.operationId)) {
        findings.push(finding('S4.contribution-missing', 'omission', `${packageId}/${unit.operationId}`, `owned active operation ${unit.operationId} has no op-${unit.operationId} row in ${packageId}'s distribution ledger`, {
          repair: `Add the op-${unit.operationId} row to ${packageId}'s RFC distribution ledger, or record the unit as declared-residual with a ground.`,
        }));
      }
    }
  }
  return findings;
}

/** The artifact, the per-package view and the package RFC agree on the unit set. */
export function checkArtifactViewConsistency(index) {
  const findings = [];
  for (const pkg of index.packages) {
    if (pkg.view === null) {
      findings.push(finding('S7.view-missing', 'omission', pkg.id, `package ${pkg.id} carries no SEQUENCES.json`, {
        repair: `Project the view into ${pkg.path} with sequences-slice.`,
      }));
      continue;
    }
    if (pkg.view.packageId !== pkg.id) {
      findings.push(finding('S7.view-package-mismatch', 'contradiction', pkg.id, `view names ${pkg.view.packageId}, and the manifest path belongs to ${pkg.id}`, {
        repair: `Rewrite the view's packageId to ${pkg.id}.`,
      }));
    }
    for (const unit of pkg.view.ownedOperationUnits ?? []) {
      if (!index.operationsById.has(unit.operationId)) {
        findings.push(finding('S7.view-unit-mismatch', 'contradiction', `${pkg.id}/${unit.operationId}`, `view owns ${unit.operationId}, which the artifact does not declare`, {
          repair: 'Re-project the view from the artifact.',
        }));
      }
    }
    if (index.schemaVersion === 3) {
      for (const unit of pkg.view.crossBoundarySequenceUnits ?? []) {
        if (!index.sequencesById.has(unit.sequenceId)) {
          findings.push(finding('S7.view-unit-mismatch', 'contradiction', `${pkg.id}/${unit.sequenceId}`, `view crosses ${unit.sequenceId}, which the artifact does not declare`, {
            repair: 'Re-project the view from the artifact.',
          }));
        }
      }
    }
    for (const unit of pkg.view.obligationUnits ?? []) {
      const carriesDeclaredBoundary = unit.relation === 'carries' && index.boundariesById.has(unit.subject);
      if (carriesDeclaredBoundary && pkg.rfc !== null && !pkg.rfc.includes(unit.subject)) {
        findings.push(finding('S7.rfc-boundary-missing', 'omission', `${pkg.id}/${unit.subject}`, `view carries ${unit.subject}, and the package RFC does not name it`, {
          repair: `Add the ${unit.subject} obligations to ${pkg.path}/RFC.md.`,
        }));
      }
    }
  }
  return findings;
}
