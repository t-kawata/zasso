/**
 * Project one package's position, obligations and owned semantics out of the manifests.
 *
 * Everything the renderer prints comes from here, and everything here comes from the two
 * manifests and the seed. Nothing is inferred: a reference that does not resolve is raised
 * rather than dropped, because a document that silently omits a record the package claims
 * to own is worse than no document — the AI would take the omission for an absence.
 */
import { ExplainSeedError } from './errors.mjs';
import { requireField } from './seed-document.mjs';

/**
 * The inventory buckets a package may own, and the word the document calls each one.
 *
 * The labels are English and stay English: they are the tool's own words, printed into a
 * document written for a machine and an AI. The document addressed to a person renders its
 * own labels, so that neither document's wording can drift into the other.
 */
const OWNED_CATEGORIES = [
  { key: 'objects', category: 'object', label: 'object' },
  { key: 'claims', category: 'claim', label: 'claim' },
  { key: 'invariants', category: 'invariant', label: 'invariant' },
  { key: 'error_codes', category: 'error-code', label: 'error code' },
  { key: 'required_tests', category: 'test-requirement', label: 'required test' },
  { key: 'state_machines', category: 'state-machine', label: 'state machine' },
];

/** Every inventory record of a manifest, keyed by id. */
// [::TICKET::] PX-221, PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-222) --for-spec --no-implementation-order`.
function indexInventory(treeManifest) {
  const inventory = treeManifest.inventory ?? {};
  const buckets = ['objects', 'claims', 'invariants', 'error_codes', 'required_tests', 'state_machines', 'terms'];
  const index = new Map();
  for (const bucket of buckets) {
    for (const record of inventory[bucket] ?? []) index.set(record.id, record);
  }
  for (const candidate of treeManifest.requirements?.normative_candidates ?? []) index.set(candidate.id, candidate);
  return index;
}

/** The specification text a record's first source range names. */
// [::TICKET::] PX-221, PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-222) --for-spec --no-implementation-order`.
function quoteRecord(record, specText) {
  const reference = (record.source_refs ?? [])[0];
  if (reference === undefined) return null;
  return {
    line_start: reference.line_start ?? null,
    line_end: reference.line_end ?? null,
    text: specText.slice(reference.byte_start ?? 0, reference.byte_end ?? 0),
  };
}

/** Every record the package owns, with the specification text each one came from. */
// [::TICKET::] PX-221, PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-222) --for-spec --no-implementation-order`.
function collectOwnedRecords({ packageRecord, inventory, specText }) {
  const declared = packageRecord.owns ?? {};
  const owned = [];

  for (const { key, category, label } of OWNED_CATEGORIES) {
    for (const id of declared[key] ?? []) {
      const record = inventory.get(id);
      if (record === undefined) {
        throw new ExplainSeedError(
          `the stage-one manifest declares ${packageRecord.id} owns ${id} but holds no such record`,
          { field: `inventory.${key}` },
        );
      }
      owned.push({
        id,
        category,
        label,
        canonical_name: record.canonical_name ?? id,
        classification: record.classification ?? null,
        review_status: record.review_status ?? record.normalization_status ?? null,
        quotation: quoteRecord(record, specText),
      });
    }
  }
  return owned;
}

/** The boundaries that touch this package, split by direction. */
// [::TICKET::] PX-221, PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-222) --for-spec --no-implementation-order`.
function collectBoundaries({ packageId, treeManifest }) {
  const boundaries = treeManifest.dependencies?.boundaries ?? [];
  const described = (boundary) => ({
    id: boundary.id,
    reason_code: boundary.dependency_reason_code ?? null,
    contract_scope: boundary.stage2_contract_scope ?? [],
    counterpart: boundary.provider_package === packageId ? boundary.consumer_package : boundary.provider_package,
  });
  return {
    provided: boundaries.filter((boundary) => boundary.provider_package === packageId).map(described),
    consumed: boundaries.filter((boundary) => boundary.consumer_package === packageId).map(described),
  };
}

/** The forbidden edges that touch this package, in the direction they forbid. */
// [::TICKET::] PX-221, PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-222) --for-spec --no-implementation-order`.
function collectForbiddenEdges({ packageId, treeManifest }) {
  return (treeManifest.dependencies?.forbidden_edges ?? [])
    .filter((edge) => edge.from === packageId || edge.to === packageId)
    .map((edge) => ({
      from: edge.from,
      to: edge.to,
      reason: edge.reason ?? null,
      reason_code: edge.reasonCode ?? null,
      alternative: edge.alternative ?? null,
    }));
}

/** The coupling contracts this package is party to, with the clauses stage two settled. */
// [::TICKET::] PX-221, PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-222) --for-spec --no-implementation-order`.
function collectContracts({ packageId, allocateManifest }) {
  return (allocateManifest.contract_registry ?? [])
    .filter((contract) => contract.provider_package === packageId || contract.consumer_package === packageId)
    .map((contract) => ({
      contract_id: contract.contract_id,
      boundary_id: contract.boundary_id,
      connection_kind: contract.connection_kind ?? null,
      // Which side of the contract this package is on, as a token rather than a phrase:
      // the facts document prints it and the explanation translates it, so neither
      // document's wording can leak into the other.
      direction: contract.provider_package === packageId ? 'provides' : 'consumes',
      counterpart: contract.provider_package === packageId ? contract.consumer_package : contract.provider_package,
      clauses: Object.entries(contract.clauses ?? {}).map(([name, text]) => ({ name, text })),
    }));
}

/** The questions the grill must settle, and the residual record behind each one. */
// [::TICKET::] PX-221, PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-222) --for-spec --no-implementation-order`.
function collectGrillMaterial({ packageId, allocateManifest, boundaries }) {
  const handoff = allocateManifest.handoff_summary ?? {};
  const questions = (handoff.grill_questions ?? []).filter((entry) => entry.package_id === packageId);
  const unresolved = (handoff.unresolved ?? []).filter((entry) => entry.package_id === packageId);
  const risky = new Set(handoff.risky_boundaries ?? []);
  const touching = [...(boundaries.provided ?? []), ...(boundaries.consumed ?? [])].map((boundary) => boundary.id);
  const risks = touching.filter((boundaryId) => risky.has(boundaryId)).map((boundaryId) => {
    const unresolvedTopic = unresolved.find((entry) => entry.boundary_id === boundaryId);
    return { id: boundaryId, topic: unresolvedTopic?.topic ?? null };
  });

  return {
    questions: questions.map((entry) => {
      const residual = unresolved.find((candidate) => candidate.residual_id === entry.residual_id) ?? null;
      return {
        residual_id: entry.residual_id,
        question: entry.question,
        topic: residual?.topic ?? null,
        why_unresolved: residual?.why_unresolved ?? null,
      };
    }),
    risky_boundaries: risks,
  };
}

/** What the package must implement beyond its own semantics. */
// [::TICKET::] PX-221, PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-222) --for-spec --no-implementation-order`.
function collectObligations({ packageId, packageRecord, treeManifest }) {
  const ports = (treeManifest.adapters?.ports ?? [])
    .filter((port) => (port.implementedBy ?? []).includes(packageId))
    .map((port) => ({ id: port.id, capability: port.capability, provides: port.provides ?? [] }));
  const conformance = (treeManifest.conformance?.test_obligations ?? [])
    .filter((obligation) => obligation.package === packageId)
    .map((obligation) => obligation.obligation);
  const databasePolicy =
    packageRecord.kind === 'adapter' && treeManifest.adapters?.database_policy?.applicable
      ? treeManifest.adapters.database_policy
      : null;
  return { ports, conformance, database_policy: databasePolicy };
}

/** Where the package sits in the implementation order. */
// [::TICKET::] PX-221, PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-222) --for-spec --no-implementation-order`.
function collectPosition({ identity, packageId, allocateManifest }) {
  const order = identity.implementation_order ?? {};
  const levels = allocateManifest.implementation_order?.levels ?? [];
  const level = levels.findIndex((levelPackages) => levelPackages.includes(packageId));
  return {
    wave: order.wave ?? null,
    serial_index: order.serial_index ?? null,
    level: level < 0 ? null : level + 1,
    before: order.before ?? [],
    after: order.after ?? [],
    parallel_with: order.parallel_with ?? [],
  };
}

/** The coupling edges the seed itself records, which the grill reads alongside the registry. */
// [::TICKET::] PX-221, PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-222) --for-spec --no-implementation-order`.
function collectSeedEdges({ packageId, contractEdges }) {
  return contractEdges
    .filter((edge) => edge.provider_package === packageId || edge.consumer_package === packageId)
    .map((edge) => ({
      contract_id: edge.contract_id,
      boundary_id: edge.boundary_id,
      direction: edge.direction ?? null,
      connection_kind: edge.connection_kind ?? null,
      counterpart: edge.provider_package === packageId ? edge.consumer_package : edge.provider_package,
      clauses: Object.entries(edge.clauses ?? {}).map(([name, text]) => ({ name, text })),
    }));
}

/** The whole projection the renderer needs for one package. */
export function projectPackage({ identity, workspace, contractEdges = [] }) {
  const packageId = requireField(identity, 'package.id');
  const treeManifest = workspace.treeManifest;
  const packages = treeManifest.workspace?.packages ?? [];
  const packageRecord = packages.find((candidate) => candidate.id === packageId);

  if (packageRecord === undefined) {
    throw new ExplainSeedError(`the stage-one manifest holds no package ${packageId}`, {
      field: 'workspace.packages',
    });
  }

  const inventory = indexInventory(treeManifest);
  const boundaries = collectBoundaries({ packageId, treeManifest });
  const owned = collectOwnedRecords({ packageRecord, inventory, specText: workspace.specText });

  return {
    identity: {
      id: packageId,
      name: packageRecord.name,
      path: packageRecord.path,
      layer: packageRecord.layer,
      kind: packageRecord.kind,
      responsibilities: packageRecord.responsibilities ?? identity.package.responsibilities ?? [],
    },
    totals: {
      packages: packages.length,
      layers: [...new Set(packages.map((candidate) => candidate.layer))].length,
      boundaries: (treeManifest.dependencies?.boundaries ?? []).length,
      contracts: (workspace.allocateManifest.contract_registry ?? []).length,
    },
    position: collectPosition({ identity, packageId, allocateManifest: workspace.allocateManifest }),
    boundaries,
    forbidden_edges: collectForbiddenEdges({ packageId, treeManifest }),
    contracts: collectContracts({ packageId, allocateManifest: workspace.allocateManifest }),
    owned,
    obligations: collectObligations({ packageId, packageRecord, treeManifest }),
    grill: collectGrillMaterial({ packageId, allocateManifest: workspace.allocateManifest, boundaries }),
    seed_edges: collectSeedEdges({ packageId, contractEdges }),
  };
}
