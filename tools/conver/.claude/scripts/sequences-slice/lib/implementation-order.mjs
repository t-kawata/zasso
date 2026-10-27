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
  PREREQUISITE_NOT_BEFORE: 'PREREQUISITE_NOT_BEFORE',
  PREREQUISITE_PACKAGE_BEFORE: 'PREREQUISITE_PACKAGE_BEFORE',
  PREREQUISITE_PACKAGE_UNSPLIT: 'PREREQUISITE_PACKAGE_UNSPLIT',
  PREREQUISITE_TICKET_MISSING: 'PREREQUISITE_TICKET_MISSING',
  PREREQUISITE_TICKETS_MISSING: 'PREREQUISITE_TICKETS_MISSING',
  PREREQUISITE_NOT_DONE: 'PREREQUISITE_NOT_DONE',
  PREREQUISITE_SET_MISMATCH: 'PREREQUISITE_SET_MISMATCH',
  UNKNOWN_PACKAGE: 'UNKNOWN_PACKAGE',
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

/** The text of one typed fact array, or an empty array. */
export function factTexts(facts) {
  return (Array.isArray(facts) ? facts : [])
    .map((fact) => (typeof fact === 'string' ? fact : (fact?.text ?? fact?.factId ?? '')))
    .filter((text) => typeof text === 'string' && text.length > 0);
}

/** The owner record of one step's operation, or undefined.
 *
 * An operation two package views both claim as an implementer has no single owner. The
 * edge is skipped rather than guessed; the smooth role check already reports the conflict.
 */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function ownerOf(operationOwners, step) {
  const operationId = step?.operation ?? step?.operationId;
  if (operationId === undefined) return undefined;
  const owner = operationOwners.get(operationId);
  return owner?.ambiguous === true ? undefined : owner;
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
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function matchingBoundaryId(later, earlierOwner, laterOwner, boundaries) {
  const match = crossedBoundaries(later).find((boundaryId) => {
    const row = boundaries.get(boundaryId);
    return row !== undefined
      && row.provider_package === earlierOwner.packageId
      && row.consumer_package === laterOwner.packageId;
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
export function deriveSequencePrecedence({ artifact = null, operationOwners = new Map(), registry = [] } = {}) {
  const edges = [];
  const findings = [];
  if (artifact === null) return { edges, findings };
  const boundaries = new Map((registry ?? []).map((row) => [row?.boundary_id, row]));
  const seen = new Set();

  for (const sequence of artifact.sequences ?? []) {
    if (sequence?.outcome === 'notASequence') continue;
    const steps = orderedSteps(artifact, sequence.id);
    for (let earlierIndex = 0; earlierIndex < steps.length; earlierIndex += 1) {
      for (let laterIndex = earlierIndex + 1; laterIndex < steps.length; laterIndex += 1) {
        const earlier = steps[earlierIndex];
        const later = steps[laterIndex];
        const earlierOwner = ownerOf(operationOwners, earlier);
        const laterOwner = ownerOf(operationOwners, later);
        if (earlierOwner === undefined || laterOwner === undefined) continue;

        const dataRelation = consumesWhatEarlierProduces(earlier, later);
        const boundaryId = dataRelation ? null : matchingBoundaryId(later, earlierOwner, laterOwner, boundaries);
        if (!dataRelation && boundaryId === null) continue;

        const source = `sequence:${sequence.id}:${earlier.stepId ?? earlier.id}->${later.stepId ?? later.id}`;
        const key = `${earlierOwner.packageId}->${laterOwner.packageId}:${source}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({
          fromPackage: earlierOwner.packageId,
          toPackage: laterOwner.packageId,
          fromOperation: earlier.operation ?? earlier.operationId,
          toOperation: later.operation ?? later.operationId,
          kind: 'sequence',
          source,
          boundaryId,
        });
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
 * The union of build, boundary and sequence precedence.
 *
 * The build edges are retained as their own source so the display can still show the
 * published build order; the caller decides which order to present.
 */
export function derivePackagePrecedence({ treeManifest = null, registry = [], artifact = null, operationOwners = new Map() } = {}) {
  const sequence = deriveSequencePrecedence({ artifact, operationOwners, registry });
  return {
    edges: [
      ...deriveBuildPrecedence(treeManifest),
      ...deriveBoundaryPrecedence(registry),
      // A same-package step relation is a ticket-level prerequisite, not a package-level
      // edge; including it here would make the package order cycle on itself.
      ...sequence.edges.filter((edge) => edge.fromPackage !== edge.toPackage),
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
 * The operation → package index across a workspace's package views.
 *
 * A pure projection: the caller reads the views. Two views that both declare an operation
 * as an implementer make the owner ambiguous; the sequence edge is skipped rather than
 * guessed, and the smooth role check reports the conflict.
 */
export function ownersFromViews({ packages = [], views = {} } = {}) {
  const owners = new Map();
  const record = (operationId, packageId) => {
    if (typeof operationId !== 'string' || operationId.length === 0) return;
    const existing = owners.get(operationId);
    if (existing === undefined) owners.set(operationId, { packageId });
    else if (existing.packageId !== packageId) owners.set(operationId, { packageId, ambiguous: true });
  };
  for (const pkg of packages) {
    const view = views[pkg.id] ?? null;
    for (const unit of view?.ownedOperationUnits ?? []) record(unit?.operationId, pkg.id);
    for (const unit of view?.obligationUnits ?? []) {
      if (typeof unit?.unitId === 'string' && unit.unitId.startsWith('op-')) record(unit.unitId.slice(3), pkg.id);
    }
  }
  return owners;
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
 * consumer-side gate. Only hard graph edges and contract-backed sequence relations create
 * an entry.
 *
 * @returns {{ prerequisites: Map<string, Array<object>>, findings: Array<object> }}
 */
export function ticketPrerequisites({ tickets = [], graph = null, artifact = null, operationOwners = new Map(), registry = [], packageId = null } = {}) {
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

  const sequence = deriveSequencePrecedence({ artifact, operationOwners, registry });
  for (const edge of sequence.edges) {
    const provider = operationOwners.get(edge.fromOperation);
    const consumer = operationOwners.get(edge.toOperation);
    if (provider === undefined || consumer === undefined) continue;
    if (consumer.packageId !== packageId) continue;
    const consumerTicket = consumer.ticketKey === undefined
      ? implementingTicketOf(tickets, edge.toOperation)
      : tickets.find((ticket) => ticketKeyOf(ticket) === consumer.ticketKey);
    if (consumerTicket === undefined) continue;
    const providerTicket = provider.ticketKey !== undefined
      ? tickets.find((ticket) => ticketKeyOf(ticket) === provider.ticketKey)
      : (provider.packageId === packageId ? implementingTicketOf(tickets, edge.fromOperation) : undefined);
    if (provider.packageId === packageId) {
      if (providerTicket === undefined || providerTicket === consumerTicket) continue;
      add(consumerTicket, {
        ticket: ticketKeyOf(providerTicket),
        kind: 'implementation',
        source: edge.source,
        ...(edge.boundaryId === null ? {} : { boundary: edge.boundaryId }),
      });
    } else {
      add(consumerTicket, {
        package: provider.packageId,
        kind: 'implementation',
        source: edge.source,
        ...(edge.boundaryId === null ? {} : { boundary: edge.boundaryId }),
      });
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

/**
 * Evaluate a ticket's prerequisites against statuses read by the caller.
 *
 * A missing array is the Case B shape: there is no distribution and therefore nothing to
 * wait for. It is a skip, not a pass and not a failure.
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
      for (const candidate of statuses) {
        if (candidate?.implements !== true) continue;
        if (!COMPLETE_STATUSES.has(candidate.status)) {
          findings.push(finding(PREREQUISITE_CODES.PREREQUISITE_NOT_DONE, candidate.ticket, `prerequisite ticket ${candidate.ticket} in ${entry.package} is ${candidate.status}; it must be done or reviewed`));
        }
      }
    }
  }
  return { ok: findings.length === 0, findings };
}
