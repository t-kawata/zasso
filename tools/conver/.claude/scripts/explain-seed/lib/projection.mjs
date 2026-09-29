/**
 * Project one package's position, obligations and owned semantics out of the manifests.
 *
 * Everything the renderer prints comes from here, and everything here comes from the two
 * manifests, the seed, and the answers a neighbour has already written down. Nothing is
 * inferred: a reference that does not resolve is raised rather than dropped, because a
 * document that silently omits a record the package claims to own is worse than no document
 * — the AI would take the omission for an absence.
 *
 * `settledElsewhere` is the one field that does not come from the manifests. It is handed in
 * rather than read here so this module keeps doing no I/O of its own, and it is carried
 * unexamined: deciding whether a neighbour's answer is readable is `neighbour-decisions.mjs`'s
 * question, and this module only says where the answer lands.
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

/** Every boundary record this package is a party to, whichever end it is. */
export function boundariesTouching({ packageId, treeManifest }) {
  return (treeManifest.dependencies?.boundaries ?? []).filter(
    (boundary) => boundary.provider_package === packageId || boundary.consumer_package === packageId,
  );
}

/** The package at the other end of one boundary, from this package's side. */
export function counterpartPackageOf({ boundary, packageId }) {
  return boundary.provider_package === packageId ? boundary.consumer_package : boundary.provider_package;
}

/** Every boundary this package is a party to, each naming the package at its other end. */
// [::TICKET::] PX-225 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-225 --for-spec --no-implementation-order`.
export function boundaryPairs({ packageId, treeManifest }) {
  return boundariesTouching({ packageId, treeManifest }).map((boundary) => ({
    id: boundary.id,
    counterpart: counterpartPackageOf({ boundary, packageId }),
  }));
}

/** Where every package in the workspace lives, keyed by id. */
// [::TICKET::] PX-225 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-225 --for-spec --no-implementation-order`.
export function packagePaths(treeManifest) {
  return Object.fromEntries((treeManifest.workspace?.packages ?? []).map((entry) => [entry.id, entry.path]));
}

/** The boundaries that touch this package, split by direction. */
// [::TICKET::] PX-221, PX-222, PX-225 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-222|PX-225) --for-spec --no-implementation-order`.
function collectBoundaries({ packageId, treeManifest }) {
  const described = (boundary) => ({
    id: boundary.id,
    reason_code: boundary.dependency_reason_code ?? null,
    contract_scope: boundary.stage2_contract_scope ?? [],
    counterpart: counterpartPackageOf({ boundary, packageId }),
  });
  const touching = boundariesTouching({ packageId, treeManifest });
  return {
    provided: touching.filter((boundary) => boundary.provider_package === packageId).map(described),
    consumed: touching.filter((boundary) => boundary.consumer_package === packageId).map(described),
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

/**
 * Where the package sits in the implementation order.
 *
 * `level` is the one-based level the placement line prints, kept as it was so an existing
 * reader of that line is not moved. `order` is the published order itself, as the ordering
 * authority reports it, and it is where the serial and parallel relations come from: the seed's
 * injected `before` and `after` are the neighbouring levels, not the edges, so they are not
 * carried here at all. A level difference is not an ordering, and a fact that says otherwise
 * under a name that sounds like dependency is the defect this projection stops repeating.
 */
// [::TICKET::] PX-221, PX-222, PX-224 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-222|PX-224) --for-spec --no-implementation-order`.
function collectPosition({ identity, packageId, allocateManifest, orderFacts }) {
  const injected = identity.implementation_order ?? {};
  const levels = allocateManifest.implementation_order?.levels ?? [];
  const publishedLevel = levels.findIndex((levelPackages) => levelPackages.includes(packageId));
  return {
    wave: injected.wave ?? null,
    serial_index: injected.serial_index ?? null,
    level: publishedLevel < 0 ? null : publishedLevel + 1,
    order: orderFacts,
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
export function projectPackage({ identity, workspace, contractEdges = [], orderFacts, settledElsewhere = [] }) {
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
    position: collectPosition({ identity, packageId, allocateManifest: workspace.allocateManifest, orderFacts }),
    pathOf: packagePaths(treeManifest),
    boundaries,
    forbidden_edges: collectForbiddenEdges({ packageId, treeManifest }),
    contracts: collectContracts({ packageId, allocateManifest: workspace.allocateManifest }),
    owned,
    obligations: collectObligations({ packageId, packageRecord, treeManifest }),
    grill: collectGrillMaterial({ packageId, allocateManifest: workspace.allocateManifest, boundaries }),
    settledElsewhere,
    seed_edges: collectSeedEdges({ packageId, contractEdges }),
  };
}
