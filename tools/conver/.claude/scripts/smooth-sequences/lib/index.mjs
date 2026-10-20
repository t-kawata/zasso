/**
 * Index one loaded workspace into the maps every check reads.
 *
 * The index is built once and never mutated: a check that rebuilt a map would be a
 * second reader of the same file, and the two could disagree about which row is the
 * first. Duplicate ids are retained in a `duplicates` list rather than overwritten,
 * because the finding must name both rows a reader has to reconcile.
 */

/** A finding shape shared by every check family. */
export function finding(checkId, className, subject, reason, extra = {}) {
  return { checkId, class: className, subject, reason, repair: extra.repair ?? '', ...extra };
}

/** Index rows by id and report duplicate ids without dropping either row. */
// [::TICKET::] PX-273, PX-274 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-273|PX-274) --for-spec --no-implementation-order`.
// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.
function indexRows(rows, label, duplicates) {
  const byId = new Map();
  const positions = new Map();
  for (const [index, row] of rows.entries()) {
    const id = row?.id;
    if (typeof id !== 'string' || id.length === 0) {
      duplicates.push(finding('S1.duplicate-id', 'deficiency', `${label}[${index}]`, `${label} row ${index} has no id`, { repair: `Give ${label} row ${index} a stable id.` }));
      continue;
    }
    if (byId.has(id)) {
      const first = positions.get(id);
      duplicates.push(finding(
        'S1.duplicate-id',
        'contradiction',
        `${label}:${id}`,
        `${label} id ${id} appears at positions ${first} and ${index}`,
        { repair: `Keep one ${label} row for ${id} and remove or rename the other.` },
      ));
      continue;
    }
    byId.set(id, row);
    positions.set(id, index);
  }
  return byId;
}

/** Build the operation-id to owning-package map from every view's owned units. */
// [::TICKET::] PX-273, PX-274 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-273|PX-274) --for-spec --no-implementation-order`.
function operationOwners(packages) {
  const owners = new Map();
  for (const pkg of packages) {
    for (const unit of pkg.view?.ownedOperationUnits ?? []) {
      if (!owners.has(unit.operationId)) owners.set(unit.operationId, new Set());
      owners.get(unit.operationId).add(pkg.id);
      for (const ownerPackageId of unit.ownerPackageIds ?? []) owners.get(unit.operationId).add(ownerPackageId);
    }
  }
  return owners;
}

/**
 * Index a loaded workspace.
 *
 * @param {object} loaded — the value `loadWorkspace` returns
 * @returns {object} the frozen index
 */
// [::TICKET::] PX-276 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-276 --for-spec --no-implementation-order`.
export function indexArtifact(loaded) {
  const duplicates = [];
  const artifact = loaded.artifact;
  const operationsById = indexRows(artifact.operations ?? [], 'operations', duplicates);
  const sequencesById = indexRows(artifact.sequences ?? [], 'sequences', duplicates);
  const stepsById = indexRows(artifact.steps ?? [], 'steps', duplicates);

  const stepsBySequence = new Map();
  const stepsByOperation = new Map();
  for (const step of artifact.steps ?? []) {
    if (!stepsBySequence.has(step.sequence)) stepsBySequence.set(step.sequence, []);
    stepsBySequence.get(step.sequence).push(step);
    if (!stepsByOperation.has(step.operation)) stepsByOperation.set(step.operation, []);
    stepsByOperation.get(step.operation).push(step);
  }

  const boundaries = loaded.treeManifest.dependencies?.boundaries ?? [];
  const boundariesById = new Map(boundaries.map((boundary) => [boundary.id, boundary]));
  const contracts = loaded.allocateManifest.contract_registry ?? [];
  const contractsByBoundary = new Map();
  const contractsByBoundaryAll = new Map();
  for (const contract of contracts) {
    if (!contractsByBoundaryAll.has(contract.boundary_id)) contractsByBoundaryAll.set(contract.boundary_id, []);
    contractsByBoundaryAll.get(contract.boundary_id).push(contract);
    if (!contractsByBoundary.has(contract.boundary_id)) contractsByBoundary.set(contract.boundary_id, contract);
  }

  const packagesById = new Map(loaded.packages.map((pkg) => [pkg.id, pkg]));
  const viewsByPackage = new Map(loaded.packages.filter((pkg) => pkg.view !== null).map((pkg) => [pkg.id, pkg.view]));
  const ownedOperationUnitsByPackage = new Map();
  const ownedOperationIdsByPackage = new Map();
  for (const pkg of loaded.packages) {
    const units = pkg.view?.ownedOperationUnits ?? [];
    ownedOperationUnitsByPackage.set(pkg.id, units);
    ownedOperationIdsByPackage.set(pkg.id, new Set(units.map((unit) => unit.operationId)));
  }

  return Object.freeze({
    artifact,
    treeManifest: loaded.treeManifest,
    allocateManifest: loaded.allocateManifest,
    packages: loaded.packages,
    schemaVersion: artifact.schema_version,
    vocabulary: loaded.vocabulary,
    operationsById,
    sequencesById,
    stepsById,
    stepsBySequence,
    stepsByOperation,
    boundariesById,
    contractsByBoundary,
    contractsByBoundaryAll,
    packagesById,
    viewsByPackage,
    ownedOperationUnitsByPackage,
    ownedOperationIdsByPackage,
    operationOwners: operationOwners(loaded.packages),
    duplicates,
  });
}
