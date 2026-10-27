// PX-323 @verifies C001 C002 C003 C004 C005 C006 C008
//
// The build order and the implementation order are different questions.
//
// The stage-1 tree DAG orders packages by the dependencies the seed declares; a consumer
// is placed after its providers. That is a build/dependency order. It cannot see whether a
// step in one package needs the implementation of an earlier step in another package,
// because those facts live in the artifact's sequences, the step contracts and the
// boundary registry. This module derives that second order and the ticket-level
// prerequisites it implies. It is pure: every caller supplies the parsed documents.

/** The named findings this module can report. */
export const PREREQUISITE_CODES = Object.freeze({
  IMPLEMENTATION_ORDER_CYCLE: 'IMPLEMENTATION_ORDER_CYCLE',
  MISSING_IMPLEMENTER: 'MISSING_IMPLEMENTER',
  MISSING_PACKAGE_VIEW: 'MISSING_PACKAGE_VIEW',
  OWNER_ROLE_UNDECIDED: 'OWNER_ROLE_UNDECIDED',
  PREREQUISITE_NOT_BEFORE: 'PREREQUISITE_NOT_BEFORE',
  PREREQUISITE_PACKAGE_BEFORE: 'PREREQUISITE_PACKAGE_BEFORE',
  PREREQUISITE_PACKAGE_UNSPLIT: 'PREREQUISITE_PACKAGE_UNSPLIT',
  PREREQUISITE_TICKET_MISSING: 'PREREQUISITE_TICKET_MISSING',
  PREREQUISITE_TICKETS_MISSING: 'PREREQUISITE_TICKETS_MISSING',
  PREREQUISITE_NOT_DONE: 'PREREQUISITE_NOT_DONE',
  PREREQUISITE_ORDER_STALE: 'PREREQUISITE_ORDER_STALE',
  PREREQUISITE_SET_MISMATCH: 'PREREQUISITE_SET_MISMATCH',
  STALE_IMPLEMENTATION_ORDER: 'STALE_IMPLEMENTATION_ORDER',
  UNKNOWN_PACKAGE: 'UNKNOWN_PACKAGE',
});

/** The two roles a package ledger may declare for an operation. */
export const OPERATION_ROLE = Object.freeze({
  IMPLEMENTER: 'implementer',
  CONSUMER: 'consumer',
});

/** The graph edge types that state a hard implementation direction. */
export const HARD_EDGE_TYPES = Object.freeze({
  depends_on: 'provider-is-to',
  precedes: 'provider-is-from',
  triggers: 'provider-is-from',
  implements: 'provider-is-to',
});

/** A ticket status that means the implementation is complete. */
export const COMPLETE_STATUSES = Object.freeze(new Set(['done', 'reviewed']));

const PX_PHASE_ID = -1;

/** One finding with a stable code and a human-readable message. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function finding(code, subject, message) {
  return { code, subject: subject ?? null, message };
}

/** A ticket's public key, matching the project's ticket identity rule. */
export function ticketKeyOf(ticket) {
  const phaseId = ticket?.phaseId ?? PX_PHASE_ID;
  return phaseId === PX_PHASE_ID ? `PX-${ticket.id}` : `P${phaseId}-${ticket.id}`;
}

/**
 * The operation ids the artifact marks as an implementation obligation.
 *
 * Only an active operation that is not a declared residual owes an owner. The null answer
 * keeps every pre-disposition artifact on its old behavior: filtering to an empty set
 * would erase the order for a workspace whose operations predate the field.
 *
 * @param {{ operations?: Array<{ id?: string, disposition?: string }> }|null} artifact
 * @param {{ residualUnitIds?: Set<string>|null }} [options] — the units the package maps
 *   declare as residuals; a residual is distributed by a declaration, not an implementer.
 * @returns {Set<string>|null}
 */
// [::TICKET::] PX-328 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-328 --for-spec --no-implementation-order`.
export function activeOperationIdsOf(artifact, { residualUnitIds = null } = {}) {
  const operations = Array.isArray(artifact?.operations) ? artifact.operations : [];
  if (!operations.some((operation) => typeof operation?.disposition === 'string')) return null;
  const active = new Set();
  for (const operation of operations) {
    if (operation?.disposition !== 'active' || typeof operation?.id !== 'string') continue;
    if (residualUnitIds !== null && residualUnitIds !== undefined && residualUnitIds.has(`op-${operation.id}`)) continue;
    active.add(operation.id);
  }
  return active;
}

/** Whether one operation is an implementation obligation under the supplied active set. */
// [::TICKET::] PX-328 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-328 --for-spec --no-implementation-order`.
function isActiveOperation(activeOperationIds, operationId) {
  return activeOperationIds === null || activeOperationIds === undefined || activeOperationIds.has(operationId);
}

/** The text of one typed fact array, or an empty array. */
export function factTexts(facts) {
  return (Array.isArray(facts) ? facts : [])
    .map((fact) => (typeof fact === 'string' ? fact : (fact?.text ?? fact?.factId ?? '')))
    .filter((text) => typeof text === 'string' && text.length > 0);
}

/** The role each operation unit carries in one package view. */
export function rolesFromView(view, roles = new Map()) {
  for (const unit of view?.ownedOperationUnits ?? []) {
    if (typeof unit?.unitId !== 'string') continue;
    if (unit.roleCandidate === OPERATION_ROLE.IMPLEMENTER || unit.roleCandidate === OPERATION_ROLE.CONSUMER) {
      roles.set(unit.unitId, unit.roleCandidate);
    }
  }
  return roles;
}

/** The role each operation unit carries in a ticket document or ticket list. */
export function rolesFromTickets(tickets = [], roles = new Map()) {
  for (const ticket of tickets) {
    for (const unit of ticket?.distribution?.units ?? []) {
      if (unit?.kind !== 'operation' || typeof unit.unitId !== 'string') continue;
      const declared = unit.role === OPERATION_ROLE.IMPLEMENTER || unit.role === OPERATION_ROLE.CONSUMER
        ? unit.role
        : (unit.obligation?.mode === 'implement' ? OPERATION_ROLE.IMPLEMENTER : null);
      if (declared === OPERATION_ROLE.IMPLEMENTER) {
        roles.set(unit.unitId, OPERATION_ROLE.IMPLEMENTER);
      } else if (declared === OPERATION_ROLE.CONSUMER && roles.get(unit.unitId) !== OPERATION_ROLE.IMPLEMENTER) {
        roles.set(unit.unitId, OPERATION_ROLE.CONSUMER);
      }
    }
  }
  return roles;
}

// [::TICKET::] PX-330 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-330 --for-spec --no-implementation-order`.
/**
 * Resolve the claims of every operation to its implementers.
 *
 * A view that lists a unit is a candidate, not an owner. The implementer role is the
 * authority; a sole candidate without a declared role is accepted only for a view written
 * before roles existed. Zero implementers is a finding, never a silent skip.
 */
export function resolveOperationClaims(claims) {
  const owners = new Map();
  const findings = [];
  for (const [operationId, entries] of claims) {
    const implementers = entries.filter((entry) => entry.role === OPERATION_ROLE.IMPLEMENTER);
    const implementerPackageIds = [...new Set(implementers.map((entry) => entry.packageId))].sort();
    // A consumer package is a candidate for the reference relation. The relation is
    // classified against the boundary registry before it becomes a package edge, because
    // a consumer role can be an ownership fact rather than an implementation direction.
    const consumerPackageIds = [...new Set(
      entries
        .filter((entry) => entry.role === OPERATION_ROLE.CONSUMER)
        .map((entry) => entry.packageId),
    )].sort();
    if (implementerPackageIds.length > 0) {
      const localTicket = implementers.find((entry) => typeof entry.ticketKey === 'string');
      owners.set(operationId, {
        packageId: implementerPackageIds[0],
        implementerPackageIds,
        consumerPackageIds,
        ...(localTicket === undefined ? {} : { ticketKey: localTicket.ticketKey }),
      });
      continue;
    }
    if (entries.length === 1 && entries[0].role !== OPERATION_ROLE.CONSUMER) {
      owners.set(operationId, {
        packageId: entries[0].packageId,
        implementerPackageIds: [entries[0].packageId],
        consumerPackageIds,
        ...(typeof entries[0].ticketKey === 'string' ? { ticketKey: entries[0].ticketKey } : {}),
      });
      continue;
    }
    owners.set(operationId, {
      ambiguous: true,
      missingImplementer: true,
      implementerPackageIds: [],
      consumerPackageIds,
    });
    findings.push(finding(
      PREREQUISITE_CODES.OWNER_ROLE_UNDECIDED,
      operationId,
      `operation ${operationId} has no implementer among ${entries.map((entry) => entry.packageId).join(', ')}`,
    ));
  }
  return { owners, findings };
}

/** Add one ownership candidate to the claim table. */
export function addOperationClaim(claims, { operationId, packageId, role = null, ticketKey = undefined }) {
  if (typeof operationId !== 'string' || operationId.length === 0) return claims;
  const entries = claims.get(operationId) ?? [];
  if (!entries.some((entry) => entry.packageId === packageId)) {
    entries.push({ packageId, role, ...(ticketKey === undefined ? {} : { ticketKey }) });
    claims.set(operationId, entries);
  }
  return claims;
}

/** The owner record of one step's operation, or undefined.
 *
 * An operation with no resolved implementer has no owner. The caller reports the finding;
 * this helper must not turn the absence into a guess.
 */
// [::TICKET::] PX-325 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-325 --for-spec --no-implementation-order`.
function ownerOf(operationOwners, step) {
  const operationId = step?.operation ?? step?.operationId;
  if (operationId === undefined) return undefined;
  const owner = operationOwners.get(operationId);
  return owner?.ambiguous === true || owner?.missingImplementer === true ? undefined : owner;
}

/** The boundary id a crossed fact names, or null. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function boundaryIdOf(fact) {
  if (typeof fact === 'string') return fact.startsWith('boundary:') ? fact.slice('boundary:'.length).split('/')[0] : fact;
  return fact?.boundaryId ?? fact?.boundary ?? null;
}

/** The crossed boundary ids a step names. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function crossedBoundaries(step) {
  return factTexts(step?.contract?.crosses).map(boundaryIdOf).filter(Boolean);
}

/** The ordered steps of one sequence. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function orderedSteps(artifact, sequenceId) {
  return (artifact?.steps ?? [])
    .filter((step) => step?.sequence === sequenceId)
    .slice()
    .sort((left, right) => (left.order ?? left.line ?? 0) - (right.order ?? right.line ?? 0));
}

/** Whether the earlier step produces a fact the later step consumes. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function consumesWhatEarlierProduces(earlier, later) {
  const produced = new Set(factTexts(earlier?.contract?.produces));
  return factTexts(later?.contract?.consumes).some((fact) => produced.has(fact));
}

/** The boundary id of the crossed boundary a later step depends on, or null. */
// [::TICKET::] PX-323, PX-325 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-323|PX-325) --for-spec --no-implementation-order`.
function matchingBoundaryId(later, earlierPackages, laterPackages, boundaries) {
  const match = crossedBoundaries(later).find((boundaryId) => {
    const row = boundaries.get(boundaryId);
    return row !== undefined
      && earlierPackages.includes(row.provider_package)
      && laterPackages.includes(row.consumer_package);
  });
  return match ?? null;
}

/**
 * The package-level precedence the artifact states.
 *
 * Only two facts create an edge: a consumed/produced fact pair, or a crossed boundary whose
 * registry provider is the earlier step's package. Narrative sequence order alone creates
 * no edge, because a procedure can list independent steps in a readable order.
 *
 * @returns {{ edges: Array<object>, findings: Array<object> }}
 */
// [::TICKET::] PX-323, PX-328 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-323|PX-328) --for-spec --no-implementation-order`.
export function deriveSequencePrecedence({ artifact = null, operationOwners = new Map(), registry = [], activeOperationIds = null } = {}) {
  const edges = [];
  const findings = [];
  if (artifact === null) return { edges, findings };
  const boundaries = new Map((registry ?? []).map((row) => [row?.boundary_id, row]));
  const seen = new Set();
  const reported = new Set();

  const reportMissingOwner = (step, sequence, side) => {
    const operationId = step?.operation ?? step?.operationId ?? '?';
    const subject = `${sequence.id}:${step?.stepId ?? step?.id ?? '?'}:${side}`;
    if (reported.has(subject)) return;
    reported.add(subject);
    findings.push(finding(
      PREREQUISITE_CODES.MISSING_IMPLEMENTER,
      operationId,
      `${side} step ${step?.stepId ?? step?.id ?? '?'} of sequence ${sequence.id} has no implementer`,
    ));
  };

  for (const sequence of artifact.sequences ?? []) {
    if (sequence?.outcome === 'notASequence') continue;
    // A non-active operation is not an implementation obligation, so neither it nor its
    // step can create a prerequisite; smooth applies the same active disposition filter.
    const steps = orderedSteps(artifact, sequence.id)
      .filter((step) => isActiveOperation(activeOperationIds, step?.operation ?? step?.operationId));
    for (let earlierIndex = 0; earlierIndex < steps.length; earlierIndex += 1) {
      for (let laterIndex = earlierIndex + 1; laterIndex < steps.length; laterIndex += 1) {
        const earlier = steps[earlierIndex];
        const later = steps[laterIndex];
        const earlierOwner = ownerOf(operationOwners, earlier);
        const laterOwner = ownerOf(operationOwners, later);
        if (earlierOwner === undefined) reportMissingOwner(earlier, sequence, 'earlier');
        if (laterOwner === undefined) reportMissingOwner(later, sequence, 'later');
        if (earlierOwner === undefined || laterOwner === undefined) continue;

        const earlierPackages = earlierOwner.implementerPackageIds ?? [earlierOwner.packageId];
        const laterPackages = laterOwner.implementerPackageIds ?? [laterOwner.packageId];
        const dataRelation = consumesWhatEarlierProduces(earlier, later);
        const boundaryId = dataRelation ? null : matchingBoundaryId(later, earlierPackages, laterPackages, boundaries);
        if (!dataRelation && boundaryId === null) continue;

        const source = `sequence:${sequence.id}:${earlier.stepId ?? earlier.id}->${later.stepId ?? later.id}`;
        for (const fromPackage of earlierPackages) {
          for (const toPackage of laterPackages) {
            // A same-package relation is a ticket-level prerequisite, not a package edge.
            // derivePackagePrecedence filters it out of the package order; the ticket
            // derivation must still see it.
            const key = `${fromPackage}->${toPackage}:${source}`;
            if (seen.has(key)) continue;
            seen.add(key);
            edges.push({
              fromPackage,
              toPackage,
              fromOperation: earlier.operation ?? earlier.operationId,
              toOperation: later.operation ?? later.operationId,
              kind: 'sequence',
              source,
              boundaryId,
            });
          }
        }
      }
    }
  }
  return { edges, findings };
}

/** The provider-first edges the stage-1 tree DAG declares. */
export function deriveBuildPrecedence(treeManifest) {
  const canonical = treeManifest?.dependencies?.dag?.canonical_edges ?? [];
  return canonical
    .filter((edge) => typeof edge?.from === 'string' && typeof edge?.to === 'string')
    .map((edge) => ({
      fromPackage: edge.to,
      toPackage: edge.from,
      kind: 'build',
      source: `build:${edge.from}->${edge.to}`,
    }));
}

/** The provider-first edges the boundary registry declares. */
export function deriveBoundaryPrecedence(registry = []) {
  return (registry ?? [])
    .filter((row) => typeof row?.provider_package === 'string' && typeof row?.consumer_package === 'string')
    .map((row) => ({
      fromPackage: row.provider_package,
      toPackage: row.consumer_package,
      kind: 'boundary',
      source: `boundary:${row.boundary_id}`,
      boundaryId: row.boundary_id,
    }));
}

/**
 * Whether a boundary already carries the relation between a reference's implementer and
 * consumer.
 *
 * A reference role can be an ownership fact: the consumer package may own the operation's
 * result classes while the implementer consumes a boundary the consumer provides. Turning
 * that role into an implementation prerequisite would invert the boundary direction and
 * close a cycle. The operation's crossed boundaries are the authority. When no step states
 * a crossed boundary, a direct registry row between the packages is the only interface
 * evidence the operation carries.
 *
 * @returns {{ covered: boolean, boundaries: string[] }}
 */
// [::TICKET::] PX-330 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-330 --for-spec --no-implementation-order`.
export function collectReferenceBoundaryEvidence({ artifact = null, registry = [], operationId = null, providerPackage = null, consumerPackage = null } = {}) {
  if (typeof providerPackage !== 'string' || typeof consumerPackage !== 'string') {
    return { covered: false, boundaries: [] };
  }
  const registryRowsForPair = (registry ?? []).filter((row) => (
    (row?.provider_package === providerPackage && row?.consumer_package === consumerPackage)
    || (row?.provider_package === consumerPackage && row?.consumer_package === providerPackage)
  ));
  if (registryRowsForPair.length === 0) return { covered: false, boundaries: [] };

  const steps = (artifact?.steps ?? []).filter(
    (step) => operationId !== null && (step.operation ?? step.operationId) === operationId,
  );
  const crossedBoundaries = new Set(
    steps
      .flatMap((step) => step?.contract?.crosses ?? [])
      .map((fact) => boundaryIdOf(fact))
      .filter((boundaryId) => typeof boundaryId === 'string' && boundaryId.length > 0),
  );
  if (crossedBoundaries.size > 0) {
    const connecting = registryRowsForPair.filter((row) => crossedBoundaries.has(row.boundary_id));
    return connecting.length > 0
      ? { covered: true, boundaries: connecting.map((row) => row.boundary_id) }
      : { covered: false, boundaries: [] };
  }
  return { covered: true, boundaries: registryRowsForPair.map((row) => row.boundary_id) };
}

/** The provider-first edges a reference unit declares when no boundary carries it. */
// [::TICKET::] PX-330 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-330 --for-spec --no-implementation-order`.
export function deriveReferencePackagePrecedence({ artifact = null, registry = [], operationOwners = new Map() } = {}) {
  const edges = [];
  const seen = new Set();
  for (const [operationId, owner] of operationOwners ?? []) {
    if (owner?.ambiguous === true || owner?.missingImplementer === true) continue;
    const providers = owner.implementerPackageIds ?? [];
    for (const fromPackage of providers) {
      for (const toPackage of owner.consumerPackageIds ?? []) {
        if (fromPackage === toPackage) continue;
        const evidence = collectReferenceBoundaryEvidence({
          artifact,
          registry,
          operationId,
          providerPackage: fromPackage,
          consumerPackage: toPackage,
        });
        if (evidence.covered) continue;
        const source = `operation:${operationId}:reference`;
        const edgeKey = `${fromPackage}->${toPackage}:${source}`;
        if (seen.has(edgeKey)) continue;
        seen.add(edgeKey);
        edges.push({
          fromPackage,
          toPackage,
          fromOperation: operationId,
          toOperation: operationId,
          kind: 'reference',
          source,
          boundaryId: null,
        });
      }
    }
  }
  return edges.sort((left, right) => (
    `${left.fromPackage}->${left.toPackage}:${left.source}`
      .localeCompare(`${right.fromPackage}->${right.toPackage}:${right.source}`)
  ));
}

/**
 * The union of build, boundary, sequence and uncovered-reference precedence.
 *
 * The build edges are retained as their own source so the display can still show the
 * published build order; the caller decides which order to present. A reference whose
 * operation crosses a boundary connecting the two packages is carried by that boundary;
 * only a reference with no connecting boundary adds an implementation edge.
 */
// [::TICKET::] PX-323, PX-328 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-323|PX-328) --for-spec --no-implementation-order`.
// [::TICKET::] PX-330 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-330 --for-spec --no-implementation-order`.
export function derivePackagePrecedence({ treeManifest = null, registry = [], artifact = null, operationOwners = new Map(), activeOperationIds = null } = {}) {
  const sequence = deriveSequencePrecedence({ artifact, operationOwners, registry, activeOperationIds });
  return {
    edges: [
      ...deriveBuildPrecedence(treeManifest),
      ...deriveBoundaryPrecedence(registry),
      // A same-package step relation is a ticket-level prerequisite, not a package-level
      // edge; including it here would make the package order cycle on itself.
      ...sequence.edges.filter((edge) => edge.fromPackage !== edge.toPackage),
      ...deriveReferencePackagePrecedence({ artifact, registry, operationOwners }),
    ],
    findings: sequence.findings,
  };
}

/**
 * A deterministic topological order.
 *
 * Edges point from the prerequisite to the dependent. Levels are sorted, so two runs over
 * the same inputs produce the same serial order.
 *
 * @returns {{ ok: boolean, serial: string[], levels: string[][], findings: Array<object> }}
 */
export function topologicalOrder({ nodes = [], edges = [] } = {}) {
  const nodeSet = new Set(nodes);
  const findings = [];
  for (const edge of edges) {
    for (const endpoint of [edge.from, edge.to]) {
      if (!nodeSet.has(endpoint)) {
        nodeSet.add(endpoint);
        findings.push(finding(PREREQUISITE_CODES.UNKNOWN_PACKAGE, endpoint, `edge ${edge.source ?? ''} names ${endpoint}, which is not a declared node`));
      }
    }
  }
  const orderedNodes = [...nodeSet].sort();
  const indegree = new Map(orderedNodes.map((node) => [node, 0]));
  const dependents = new Map(orderedNodes.map((node) => [node, []]));
  for (const edge of edges) {
    if (edge.from === edge.to) continue;
    dependents.get(edge.from).push(edge.to);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }
  for (const values of dependents.values()) values.sort();

  const levels = [];
  const remaining = new Set(orderedNodes);
  while (remaining.size > 0) {
    const level = [...remaining].filter((node) => (indegree.get(node) ?? 0) === 0).sort();
    if (level.length === 0) {
      findings.push(finding(
        PREREQUISITE_CODES.IMPLEMENTATION_ORDER_CYCLE,
        null,
        `the prerequisite graph has a cycle through ${[...remaining].sort().join(', ')}`,
      ));
      return { ok: false, serial: levels.flat(), levels, findings };
    }
    levels.push(level);
    for (const node of level) {
      remaining.delete(node);
      for (const dependent of dependents.get(node) ?? []) {
        indegree.set(dependent, (indegree.get(dependent) ?? 0) - 1);
      }
    }
  }
  return { ok: findings.length === 0, serial: levels.flat(), levels, findings };
}

/**
 * The operation → implementer index across a workspace's package views.
 *
 * A view that lists a unit is a candidate, not an owner. The role declared by the package
 * ledger (or, for a sole legacy owner, the view candidate) decides. A candidate with no
 * implementer is a finding; the caller must fail rather than derive an unsafe order.
 *
 * @returns {{ owners: Map<string, object>, findings: Array<object> }}
 */
// [::TICKET::] PX-328 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-328 --for-spec --no-implementation-order`.
export function ownersFromViewsDetailed({ packages = [], views = {}, roles = {}, activeOperationIds = null } = {}) {
  const claims = new Map();
  const record = (unit, packageId, packageRoles) => {
    const operationId = unit?.operationId ?? (typeof unit?.unitId === 'string' && unit.unitId.startsWith('op-') ? unit.unitId.slice(3) : null);
    if (typeof operationId !== 'string' || operationId.length === 0) return;
    if (!isActiveOperation(activeOperationIds, operationId)) return;
    const role = packageRoles.get(unit.unitId) ?? unit.roleCandidate ?? null;
    addOperationClaim(claims, { operationId, packageId, role });
  };
  for (const pkg of packages) {
    const view = views[pkg.id] ?? null;
    if (view === null) continue;
    const packageRoles = roles[pkg.id] ?? rolesFromView(view);
    for (const unit of view.ownedOperationUnits ?? []) record(unit, pkg.id, packageRoles);
    for (const unit of view.obligationUnits ?? []) record(unit, pkg.id, packageRoles);
  }
  return resolveOperationClaims(claims);
}

/** The operation → implementer index, without the findings. */
export function ownersFromViews(input = {}) {
  return ownersFromViewsDetailed(input).owners;
}

/** The map a ticket's node ids give to the ticket that owns them. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function ticketByNodeOf(tickets) {
  const byNode = new Map();
  for (const ticket of tickets) {
    for (const nodeId of Array.isArray(ticket?.nodeIds) ? ticket.nodeIds : []) {
      if (!byNode.has(nodeId)) byNode.set(nodeId, ticket);
    }
  }
  return byNode;
}

/** The ticket that implements an operation, when the caller did not supply one. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function implementingTicketOf(tickets, operationId) {
  const unitId = `op-${operationId}`;
  return tickets.find((ticket) => (ticket?.distribution?.units ?? []).some((unit) => unit?.unitId === unitId
    && unit?.kind === 'operation'
    && unit?.obligation?.mode === 'implement'));
}

/** A stable key for one prerequisite entry. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function prerequisiteKey(entry) {
  return [entry.ticket ?? '', entry.package ?? '', entry.kind, entry.source, entry.boundary ?? ''].join('|');
}

/**
 * The implementation prerequisites each ticket carries.
 *
 * A same-package prerequisite names the ticket that must be implemented first. A
 * cross-package prerequisite names the package; the package's Tickets.json is read by the
 * consumer-side gate. Hard graph edges, contract-backed sequence relations, build edges,
 * boundary rows and reference units all create an entry.
 *
 * @returns {{ prerequisites: Map<string, Array<object>>, findings: Array<object> }}
 */
// [::TICKET::] PX-323, PX-328 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-323|PX-328) --for-spec --no-implementation-order`.
// [::TICKET::] PX-330 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-330 --for-spec --no-implementation-order`.
export function ticketPrerequisites({
  tickets = [],
  graph = null,
  artifact = null,
  operationOwners = new Map(),
  registry = [],
  packageId = null,
  treeManifest = null,
  activeOperationIds = null,
} = {}) {
  const prerequisites = new Map();
  const findings = [];
  const hasDistribution = tickets.some((ticket) => (ticket?.distribution?.units ?? []).length > 0);
  if (!hasDistribution) return { prerequisites, findings };

  const byNode = ticketByNodeOf(tickets);
  const add = (consumerTicket, entry) => {
    const key = ticketKeyOf(consumerTicket);
    const entries = prerequisites.get(key) ?? [];
    const entryKey = prerequisiteKey(entry);
    if (!entries.some((candidate) => prerequisiteKey(candidate) === entryKey)) entries.push(entry);
    prerequisites.set(key, entries);
  };

  /** The operation id an `op-*` distribution unit names, or null for another unit kind. */
  // [::TICKET::] PX-329 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-329 --for-spec --no-implementation-order`.
  const operationIdOfUnit = (unit) => (typeof unit?.unitId === 'string' && unit.unitId.startsWith('op-')
    ? unit.unitId.slice('op-'.length)
    : null);

  /**
   * Whether an existing entry already names the same provider.
   *
   * A graph, sequence, build or boundary source can already declare the dependency. The
   * reference unit adds the missing edge only when the provider is not yet named, so the
   * prerequisite set keeps one entry per provider instead of one per source.
   */
  // [::TICKET::] PX-329 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-329 --for-spec --no-implementation-order`.
  const namesSameProvider = (entry, candidate) => (
    (typeof candidate.ticket === 'string' && entry.ticket === candidate.ticket)
    || (typeof candidate.package === 'string' && entry.package === candidate.package)
  );

  /** Add a reference-derived provider only when no source already names it. */
  // [::TICKET::] PX-329 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-329 --for-spec --no-implementation-order`.
  const addProviderOnce = (consumerTicket, entry) => {
    const key = ticketKeyOf(consumerTicket);
    const entries = prerequisites.get(key) ?? [];
    if (entries.some((candidate) => namesSameProvider(candidate, entry))) return;
    add(consumerTicket, entry);
  };

  for (const edge of graph?.edges ?? []) {
    const direction = HARD_EDGE_TYPES[edge?.type];
    if (direction === undefined) continue;
    if (edge?.attributes?.strength === 'soft') continue;
    const providerNode = direction === 'provider-is-from' ? edge.from : edge.to;
    const consumerNode = direction === 'provider-is-from' ? edge.to : edge.from;
    const providerTicket = byNode.get(providerNode);
    const consumerTicket = byNode.get(consumerNode);
    if (providerTicket === undefined || consumerTicket === undefined) continue;
    if (providerTicket === consumerTicket) continue;
    add(consumerTicket, {
      ticket: ticketKeyOf(providerTicket),
      kind: 'implementation',
      source: `graph:${edge.type}:${edge.from}->${edge.to}`,
    });
  }

  const sequence = deriveSequencePrecedence({ artifact, operationOwners, registry, activeOperationIds });
  findings.push(...sequence.findings);
  for (const edge of sequence.edges) {
    const provider = operationOwners.get(edge.fromOperation);
    const consumer = operationOwners.get(edge.toOperation);
    if (provider === undefined || consumer === undefined) continue;
    if (provider.ambiguous === true || consumer.ambiguous === true) continue;
    // An operation may be implemented by several packages. The edge reaches every one
    // of them, not only the first sorted package id.
    const consumerPackages = consumer.implementerPackageIds ?? [consumer.packageId];
    if (!consumerPackages.includes(packageId)) continue;
    const consumerTicket = consumer.ticketKey === undefined
      ? implementingTicketOf(tickets, edge.toOperation)
      : tickets.find((ticket) => ticketKeyOf(ticket) === consumer.ticketKey);
    if (consumerTicket === undefined) {
      findings.push(finding(PREREQUISITE_CODES.MISSING_IMPLEMENTER, edge.toOperation, `consumer operation ${edge.toOperation} reaches no ticket`));
      continue;
    }

    const providerPackages = provider.implementerPackageIds ?? [provider.packageId];
    for (const providerPackage of providerPackages) {
      if (providerPackage === packageId) {
        const providerTicket = provider.ticketKey !== undefined
          ? tickets.find((ticket) => ticketKeyOf(ticket) === provider.ticketKey)
          : implementingTicketOf(tickets, edge.fromOperation);
        if (providerTicket === undefined) {
          findings.push(finding(PREREQUISITE_CODES.MISSING_IMPLEMENTER, edge.fromOperation, `provider operation ${edge.fromOperation} reaches no ticket`));
          continue;
        }
        if (providerTicket === consumerTicket) continue;
        add(consumerTicket, {
          ticket: ticketKeyOf(providerTicket),
          kind: 'implementation',
          source: edge.source,
          ...(edge.boundaryId === null ? {} : { boundary: edge.boundaryId }),
        });
      } else {
        add(consumerTicket, {
          package: providerPackage,
          kind: 'implementation',
          source: edge.source,
          ...(edge.boundaryId === null ? {} : { boundary: edge.boundaryId }),
        });
      }
    }
  }

  // A build edge says this package depends on the provider package. Every ticket in the
  // consumer package waits for the provider package's implementation; the package entry
  // is the unit the make gate can check before the provider is split.
  for (const edge of treeManifest?.dependencies?.dag?.canonical_edges ?? []) {
    if (edge?.from !== packageId || edge?.to === packageId) continue;
    for (const ticket of tickets) {
      add(ticket, { package: edge.to, kind: 'implementation', source: `build:${edge.from}->${edge.to}` });
    }
  }

  // A boundary registry row declares a provider/consumer direction. It is a package-level
  // prerequisite even when no step crosses it: the consumer cannot integrate without the
  // provider's implementation.
  for (const row of registry ?? []) {
    if (row?.consumer_package !== packageId || row?.provider_package === packageId) continue;
    for (const ticket of tickets) {
      add(ticket, {
        package: row.provider_package,
        kind: 'implementation',
        source: `boundary:${row.boundary_id}`,
        boundary: row.boundary_id,
      });
    }
  }

  // A reference operation unit names the ticket or package that implements the operation.
  // That is an implementation dependency even when no graph edge, sequence relation or
  // boundary row declares it: the consumer's integration test cannot run against an
  // implementation that does not exist. Deriving it here keeps the split attachment, the
  // order gate and the make/plan/start/review entry gate on one rule.
  for (const ticket of tickets) {
    const consumerKey = ticketKeyOf(ticket);
    for (const unit of ticket?.distribution?.units ?? []) {
      if (unit?.obligation?.mode !== 'reference') continue;
      if (typeof unit?.unitId !== 'string' || unit.unitId.length === 0) continue;
      const operationId = operationIdOfUnit(unit);
      if (operationId !== null && !isActiveOperation(activeOperationIds, operationId)) continue;

      // The durable key is the identity consolidation remaps; the numeric id is the
      // phase-local fallback for a record written before the key existed.
      const implementerKey = typeof unit.obligation.implementerTicketKey === 'string'
        && unit.obligation.implementerTicketKey.length > 0
        ? unit.obligation.implementerTicketKey
        : (typeof unit.obligation.implementerTicketId === 'number'
          ? ticketKeyOf({ phaseId: ticket.phaseId, id: unit.obligation.implementerTicketId })
          : null);
      if (implementerKey !== null) {
        // A ticket that names itself owes nothing to itself; the entry would also make the
        // canonical prerequisite comparison unstable across phases.
        if (implementerKey === consumerKey) continue;
        addProviderOnce(ticket, {
          ticket: implementerKey,
          kind: 'implementation',
          source: `reference:${unit.unitId}`,
        });
        continue;
      }

      // The provider list is a record of the implementer packages. When the owner table
      // knows the implementers, a package that merely consumes the same operation is not
      // a provider; keeping it would demand an order edge that does not exist. A boundary
      // that connects the two packages carries the reference instead, so it adds no
      // implementation prerequisite in either direction.
      const knownImplementers = operationId === null
        ? null
        : (ownerOf(operationOwners, { operation: operationId })?.implementerPackageIds ?? null);
      const declaredProviders = (Array.isArray(unit.obligation.providers) ? unit.obligation.providers : [])
        .filter((provider) => typeof provider === 'string' && provider.length > 0);
      const externalProviders = declaredProviders.filter((provider) => provider !== packageId);
      const classifiedProviders = externalProviders.map((provider) => ({
        provider,
        evidence: collectReferenceBoundaryEvidence({
          artifact,
          registry,
          operationId,
          providerPackage: provider,
          consumerPackage: packageId,
        }),
      }));
      const uncoveredImplementers = classifiedProviders
        .filter((entry) => entry.evidence.covered === false)
        .filter((entry) => knownImplementers === null || knownImplementers.includes(entry.provider));
      for (const { provider } of uncoveredImplementers) {
        addProviderOnce(ticket, {
          package: provider,
          kind: 'implementation',
          source: `reference:${unit.unitId}`,
        });
      }
      const boundaryCarried = classifiedProviders.some((entry) => entry.evidence.covered);
      if (uncoveredImplementers.length === 0 && !boundaryCarried) {
        // A reference with no provider and no boundary would be a satisfied prerequisite
        // by silence. It is a distribution defect, and the split must stop rather than
        // emit an incomplete set.
        findings.push(finding(
          PREREQUISITE_CODES.MISSING_IMPLEMENTER,
          unit.unitId,
          `reference unit ${unit.unitId} names no implementer ticket, external provider package or connecting boundary`,
        ));
      }
    }
  }

  for (const entries of prerequisites.values()) {
    entries.sort((left, right) => `${left.kind}|${left.ticket ?? left.package}|${left.source}`.localeCompare(`${right.kind}|${right.ticket ?? right.package}|${right.source}`));
  }
  return { prerequisites, findings };
}

/**
 * Check that every prerequisite is placed before the ticket that needs it.
 *
 * The placement is the flattened (phase, ticket) order. A cross-package prerequisite must
 * be in an earlier package level and must already have a Tickets.json; an unsplit package
 * is a named failure, not an assumption.
 */
export function checkPlacement({ tickets = [], packageId = null, packageOrder = {}, packageTickets = {} } = {}) {
  const findings = [];
  const indexOfTicket = new Map(tickets.map((ticket, index) => [ticketKeyOf(ticket), index]));
  const currentLevel = packageOrder[packageId];
  for (const ticket of tickets) {
    for (const entry of Array.isArray(ticket?.prerequisites) ? ticket.prerequisites : []) {
      if (entry?.kind !== 'implementation') continue;
      if (typeof entry.ticket === 'string') {
        const prerequisiteIndex = indexOfTicket.get(entry.ticket);
        if (prerequisiteIndex === undefined) {
          findings.push(finding(PREREQUISITE_CODES.PREREQUISITE_TICKET_MISSING, entry.ticket, `ticket ${ticketKeyOf(ticket)} needs ${entry.ticket}, which is not in this Tickets.json`));
          continue;
        }
        if (prerequisiteIndex >= indexOfTicket.get(ticketKeyOf(ticket))) {
          findings.push(finding(PREREQUISITE_CODES.PREREQUISITE_NOT_BEFORE, ticketKeyOf(ticket), `prerequisite ${entry.ticket} (${entry.source}) is placed at or after ${ticketKeyOf(ticket)}`));
        }
        continue;
      }
      if (typeof entry.package === 'string') {
        const prerequisiteTickets = packageTickets[entry.package];
        if (prerequisiteTickets === undefined || prerequisiteTickets === null) {
          findings.push(finding(PREREQUISITE_CODES.PREREQUISITE_PACKAGE_UNSPLIT, entry.package, `prerequisite package ${entry.package} has no readable Tickets.json`));
          continue;
        }
        const prerequisiteLevel = packageOrder[entry.package];
        if (prerequisiteLevel === undefined || currentLevel === undefined || prerequisiteLevel >= currentLevel) {
          findings.push(finding(PREREQUISITE_CODES.PREREQUISITE_PACKAGE_BEFORE, entry.package, `prerequisite package ${entry.package} (level ${prerequisiteLevel ?? 'unknown'}) is not before ${packageId} (level ${currentLevel ?? 'unknown'})`));
        }
      }
    }
  }
  return { ok: findings.length === 0, findings };
}

// [::TICKET::] PX-330 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-330 --for-spec --no-implementation-order`.
/**
 * Evaluate a ticket's prerequisites against statuses read by the caller.
 *
 * A missing array is the Case B shape: there is no distribution and therefore nothing to
 * wait for. It is a skip, not a pass and not a failure. A provider package that predates
 * the distribution is evaluated through its own tickets, so its absence of work units is
 * not mistaken for an absence of implementation.
 */
export function evaluatePrerequisites({ prerequisites, samePackageStatuses = new Map(), packageStatuses = new Map() } = {}) {
  if (!Array.isArray(prerequisites) || prerequisites.length === 0) {
    return { ok: true, skipped: 'no-prerequisites', findings: [] };
  }
  const findings = [];
  for (const entry of prerequisites) {
    if (entry?.kind !== 'implementation') continue;
    if (typeof entry.ticket === 'string') {
      const status = samePackageStatuses.get(entry.ticket);
      if (status === undefined) {
        findings.push(finding(PREREQUISITE_CODES.PREREQUISITE_TICKET_MISSING, entry.ticket, `prerequisite ticket ${entry.ticket} (${entry.source}) is not in this Tickets.json`));
      } else if (!COMPLETE_STATUSES.has(status)) {
        findings.push(finding(PREREQUISITE_CODES.PREREQUISITE_NOT_DONE, entry.ticket, `prerequisite ticket ${entry.ticket} is ${status}; it must be done or reviewed`));
      }
      continue;
    }
    if (typeof entry.package === 'string') {
      const statuses = packageStatuses.get(entry.package);
      if (statuses === undefined || statuses === null) {
        findings.push(finding(PREREQUISITE_CODES.PREREQUISITE_TICKETS_MISSING, entry.package, `prerequisite package ${entry.package} has no readable Tickets.json`));
        continue;
      }
      // A package written before the distribution has no work-carrying ticket. It is
      // still a real prerequisite, so its own tickets decide completion; treating the
      // absence of distribution as an absence of work would block every such provider.
      const workCandidates = statuses.filter((candidate) => candidate?.carriesWork === true || candidate?.implements === true);
      const candidates = workCandidates.length > 0 ? workCandidates : statuses;
      let checked = false;
      for (const candidate of candidates) {
        if (candidate === null || candidate === undefined) continue;
        checked = true;
        if (!COMPLETE_STATUSES.has(candidate.status)) {
          findings.push(finding(PREREQUISITE_CODES.PREREQUISITE_NOT_DONE, candidate.ticket, `prerequisite ticket ${candidate.ticket} in ${entry.package} is ${candidate.status}; it must be done or reviewed`));
        }
      }
      if (!checked) {
        findings.push(finding(PREREQUISITE_CODES.PREREQUISITE_TICKETS_MISSING, entry.package, `prerequisite package ${entry.package} has no ticket carrying distribution work`));
      }
    }
  }
  return { ok: findings.length === 0, findings };
}
