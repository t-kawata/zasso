/**
 * Layer A: the structural checks that need no typed contract.
 *
 * Every check here answers a question the artifact and the manifests already carry:
 * does a reference resolve, is a status reachable, is a declared clause present, does a
 * contribution name an operation its package owns. None of them reads prose, so none of
 * them can disagree with a reader about what a sentence means.
 */
import { finding } from './index.mjs';

const DRAWN_OUTCOMES = new Set(['direct', 'viaNeighbour', 'singleStep']);
const ACTIVE_DISPOSITION = 'active';

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

/** The operation envelope: status graph, finality, and the three interface mappings. */
export function checkOperationEnvelope(index) {
  const findings = [];
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
      if (isTerminalName(source) && (targets ?? []).length > 0) {
        findings.push(finding('S3.transition-out-of-terminal', 'contradiction', operation.id, `terminal status ${source} declares an outgoing transition`, {
          repair: `Remove the outgoing transition from ${source} or stop calling it terminal.`,
        }));
      }
    }
    if (operation.external_dependency_class !== 'none' && !operation.finality_predicate) {
      findings.push(finding('S3.finality-missing-for-external', 'omission', operation.id, `operation ${operation.id} waits on ${operation.external_dependency_class} and declares no finality predicate`, {
        repair: 'Declare finality_predicate so the caller knows when the external step is complete.',
      }));
    }
    const objectRegistry = new Set((index.artifact.objects ?? [])
      .map((entry) => (typeof entry === 'string' ? entry : entry?.id))
      .filter(Boolean));
    if (objectRegistry.size > 0) {
      for (const objectClass of operation.result_object_classes ?? []) {
        if (!objectRegistry.has(objectClass)) {
          findings.push(finding('S3.result-object-unknown', 'deficiency', operation.id, `operation ${operation.id} names result object ${objectClass}, which the object registry does not declare`, {
            repair: `Declare ${objectClass} in the object registry or correct the result class.`,
          }));
        }
      }
    }
    if (!operation.rest || !operation.websocket || !operation.cli) {
      findings.push(finding('S3.interface-mapping-missing', 'omission', operation.id, `operation ${operation.id} does not map to REST, WebSocket and CLI`, {
        repair: 'Declare rest, websocket and cli for the operation.',
      }));
    }
  }
  return findings;
}

/** Whether a status name is one the protocol treats as terminal. */
// [::TICKET::] PX-273, PX-274 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-273|PX-274) --for-spec --no-implementation-order`.
function isTerminalName(name) {
  return name === 'finalized' || name === 'rejected' || name === 'cancelled' || name === 'expired' || name === 'failed';
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

/** Every owned active operation is contributed, and no contribution is unowned. */
export function checkContributionCompleteness(index) {
  const findings = [];
  for (const [packageId, units] of index.ownedOperationUnitsByPackage) {
    const rows = index.contributedOperationKindsByPackage.get(packageId) ?? new Set();
    for (const unit of units) {
      const operation = index.operationsById.get(unit.operationId);
      if (operation === undefined || operation.disposition !== ACTIVE_DISPOSITION) continue;
      if (rows.has(unit.operationId)) continue;
      if (operation.registry_contribution === 'not_required' && typeof operation.registry_contribution_ground === 'string' && operation.registry_contribution_ground.trim() !== '') continue;
      findings.push(finding('S4.contribution-missing', 'omission', `${packageId}/${unit.operationId}`, `owned active operation ${unit.operationId} has no contribution row and no grounded not_required`, {
        repair: `Add ${unit.operationId} to ${packageId}'s CONTRIBUTED_ROWS or record a grounded registry_contribution=not_required.`,
      }));
    }
  }
  // A contribution is unowned only when another package owns the operation. When no
  // package owns it, the contribution is the only ownership record the workspace holds,
  // and flagging it would demand a repair the ownership join cannot express.
  const allOwnedOperationIds = new Set(
    [...index.ownedOperationIdsByPackage.values()].flatMap((ids) => [...ids]),
  );
  for (const [packageId, kinds] of index.contributedOperationKindsByPackage) {
    const owned = index.ownedOperationIdsByPackage.get(packageId) ?? new Set();
    for (const kind of kinds) {
      if (!owned.has(kind) && allOwnedOperationIds.has(kind)) {
        findings.push(finding('S4.contribution-unowned', 'contradiction', `${packageId}/${kind}`, `${packageId} contributes ${kind}, which another package owns and its own operation units do not name`, {
          repair: `Remove ${kind} from ${packageId}'s contribution or transfer ownership of the operation.`,
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
      if (unit.unitId?.startsWith('ctr-boundary-') && pkg.rfc !== null && !pkg.rfc.includes(unit.subject)) {
        findings.push(finding('S7.rfc-boundary-missing', 'omission', `${pkg.id}/${unit.subject}`, `view carries ${unit.subject}, and the package RFC does not name it`, {
          repair: `Add the ${unit.subject} obligations to ${pkg.path}/RFC.md.`,
        }));
      }
    }
  }
  return findings;
}
