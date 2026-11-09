'use strict';

/**
 * ticket-partition — the deterministic contiguous partition of an ordered ticket array.
 *
 * The split produces tickets in implementation order. Condensation may merge only a
 * contiguous range of that order, because a non-contiguous merge could place a
 * prerequisite at or after its dependent. The partition is a dynamic program over the
 * ordered array: the fewest contiguous groups whose component sums stay within the
 * work budget, with a single over-budget ticket allowed as an irreducible group.
 *
 * The merge itself is mechanical. Authored prose is preserved verbatim under
 * provenance headings; tests, contracts, node ids and files are unioned. Derived
 * fields are deleted here and recomputed by the caller from the graph, Dirs-Tree and
 * sequence view, so no stale value from an absorbed ticket survives.
 */

const { createHash } = require('node:crypto');

const { WORKLOAD_COMPONENTS, workloadOfTicket } = require('./ticket-workload.js');

/** Status ranks from least to most advanced. `remanded` is handled separately. */
const STATUS_RANKS = Object.freeze({
  todo: 0,
  made: 1,
  planned: 2,
  done: 3,
  reviewed: 4,
});

/** Statuses that `--preserve-completed` keeps in their own group. */
const COMPLETED_STATUSES = Object.freeze(['done', 'reviewed']);

/** The provenance heading written before an absorbed ticket's prose. */
const ABSORBED_HEADING = '### From';

/** Fields that are deleted on the survivor and recomputed by the caller. */
const RECOMPUTED_FIELDS = Object.freeze([
  'distribution',
  'prerequisites',
  'mergeAttempts',
]);

/** The public key of a ticket, matching the ticket scripts. */
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function ticketKeyOf(ticket) {
  return ticket?.phaseId === -1 ? `PX-${ticket?.id}` : `P${ticket?.phaseId}-${ticket?.id}`;
}

/** The component-wise sum of two workload vectors. */
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function addWorkloads(left, right, components = WORKLOAD_COMPONENTS) {
  const total = {};
  for (const component of components) {
    total[component] = (left?.[component] ?? 0) + (right?.[component] ?? 0);
  }
  return total;
}

/** The component-wise sum of a range, using prefix sums. */
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function measureRangeWorkload(prefix, start, end, components = WORKLOAD_COMPONENTS) {
  const total = {};
  for (const component of components) {
    total[component] = prefix[end][component] - prefix[start][component];
  }
  return total;
}

/** Whether every component of a workload is within the budget. */
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function fitsBudget(workload, budget, components = WORKLOAD_COMPONENTS) {
  return components.every((component) => (workload?.[component] ?? 0) <= budget[component]);
}

/** The components a workload exceeds. */
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function overBudgetComponents(workload, budget, components = WORKLOAD_COMPONENTS) {
  return components.filter((component) => (workload?.[component] ?? 0) > budget[component]);
}

/** Whether a ticket's status is complete for `--preserve-completed`. */
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function isCompleted(ticket) {
  return COMPLETED_STATUSES.includes(ticket?.status);
}

/**
 * Partition an ordered ticket array into the fewest contiguous budget-fitting groups.
 *
 * @param {Array<object>} tickets — tickets in implementation order
 * @param {{ graph?: object, dirsTree?: object, view?: object, nodeToFileMap?: object }} context
 * @param {Record<string, number>} budget — per-component ceilings
 * @param {{ components?: string[], preserveCompleted?: boolean }} [options]
 * @returns {{ count: number, groups: Array<object>, forcedBoundaries: Array<object>, irreducible: Array<object>, skippedGroups: Array<object>, workloads: Array<object> }}
 */
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function minimumContiguousPartition(tickets, context, budget, options = {}) {
  const components = options.components ?? WORKLOAD_COMPONENTS;
  const preserveCompleted = options.preserveCompleted === true;
  const workloads = tickets.map((ticket) => workloadOfTicket(ticket, context));
  const count = tickets.length;
  if (count === 0) {
    return { count: 0, groups: [], forcedBoundaries: [], irreducible: [], skippedGroups: [], workloads };
  }

  const locked = tickets.map((ticket) => preserveCompleted && isCompleted(ticket));
  const lockedPrefix = [0];
  for (const entry of locked) lockedPrefix.push(lockedPrefix[lockedPrefix.length - 1] + (entry ? 1 : 0));

  // A group's workload is measured on the ticket the merge would produce: node ids,
  // files and test families are set-valued, so summing per-ticket counts overcounts
  // an overlap. The cache keeps the dynamic program at O(n^2) workload computations.
  const workloadCache = new Map();
  const workloadOfRange = (start, end) => {
    const cacheKey = `${start}:${end}`;
    const cached = workloadCache.get(cacheKey);
    if (cached !== undefined) return cached;
    const members = tickets.slice(start, end);
    const synthetic = {
      nodeIds: unionValues(...members.map((ticket) => ticket.nodeIds ?? [])),
      default_files: unionValues(...members.map((ticket) => ticket.default_files ?? [])),
      testUnit: unionValues(...members.map((ticket) => ticket.testUnit ?? [])),
      testIntegration: unionValues(...members.map((ticket) => ticket.testIntegration ?? [])),
    };
    const workload = workloadOfTicket(synthetic, context);
    workloadCache.set(cacheKey, workload);
    return workload;
  };

  const best = new Array(count + 1).fill(Number.POSITIVE_INFINITY);
  const from = new Array(count + 1).fill(-1);
  best[0] = 0;

  for (let end = 1; end <= count; end += 1) {
    for (let start = end - 1; start >= 0; start -= 1) {
      const groupSize = end - start;
      const hasLocked = lockedPrefix[end] - lockedPrefix[start] > 0;
      if (hasLocked && groupSize > 1) break;
      const workload = workloadOfRange(start, end);
      const fits = fitsBudget(workload, budget, components);
      if (!fits && groupSize > 1) break;
      if (best[start] + 1 < best[end]) {
        best[end] = best[start] + 1;
        from[end] = start;
      }
    }
  }

  const ranges = [];
  for (let end = count; end > 0; end = from[end]) {
    ranges.push([from[end], end]);
  }
  ranges.reverse();

  const groups = ranges.map(([start, end]) => {
    const workload = workloadOfRange(start, end);
    const over = overBudgetComponents(workload, budget, components);
    return {
      start,
      end,
      members: tickets.slice(start, end).map(ticketKeyOf),
      workload,
      locked: locked.slice(start, end).every(Boolean),
      irreducible: end - start === 1 && over.length > 0,
      overBudget: over,
    };
  });

  const forcedBoundaries = [];
  for (let index = 1; index < groups.length; index += 1) {
    const left = groups[index - 1];
    const right = groups[index];
    const merged = workloadOfRange(left.start, right.end);
    const over = overBudgetComponents(merged, budget, components);
    forcedBoundaries.push({
      left: left.members,
      right: right.members,
      components: over,
      merged,
      reason: over.length > 0 ? 'budget' : (left.locked && right.locked ? 'preserve-completed' : 'unknown'),
    });
  }

  const irreducible = groups.filter((group) => group.irreducible);
  const skippedGroups = groups.filter((group) => group.locked);
  return { count: groups.length, groups, forcedBoundaries, irreducible, skippedGroups, workloads };
}

/** The least advanced status in a group; `remanded` outranks every other status. */
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function leastAdvancedStatus(statuses) {
  const values = (statuses ?? []).filter((status) => typeof status === 'string' && status.length > 0);
  if (values.length === 0) return 'todo';
  if (values.includes('remanded')) return 'remanded';
  let result = 'todo';
  let rank = Number.POSITIVE_INFINITY;
  for (const status of values) {
    const candidate = STATUS_RANKS[status] ?? 0;
    if (candidate < rank) {
      rank = candidate;
      result = status;
    }
  }
  return result;
}

/** Join distinct titles in order. */
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function mergeTitles(titles) {
  return [...new Set((titles ?? []).filter((title) => typeof title === 'string' && title.length > 0))].join(' / ');
}

/** Append an absorbed ticket's prose under a provenance heading. */
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function preserveProseSection(current, key, title, text) {
  if (typeof text !== 'string' || text.trim().length === 0) return current;
  const heading = `${ABSORBED_HEADING} ${key}: ${title}`;
  return `${current}\n\n${heading}\n${text}`;
}

/** Union arrays by value, preserving first-seen order. */
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function unionValues(...arrays) {
  const result = [];
  const seen = new Set();
  for (const array of arrays) {
    for (const value of array ?? []) {
      if (seen.has(value)) continue;
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

/** A canonical JSON string with sorted object keys, for a stable digest. */
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** The digest of a partition, used for idempotency and audit. */
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function partitionDigest(plan) {
  const groups = (plan?.groups ?? []).map((group) => ({
    start: group.start,
    end: group.end,
    members: group.members,
    workload: group.workload,
  }));
  return createHash('sha256').update(stableStringify(groups)).digest('hex');
}

/** Throw a named merge defect. */
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function mergeDefect(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

/** Union contract arrays by id; identical clauses collapse, different clauses fail. */
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function mergeContractsForGroup(members) {
  const byId = new Map();
  for (const ticket of members) {
    for (const contract of ticket?.contracts ?? []) {
      const id = contract?.id;
      if (typeof id !== 'string' || id.length === 0) {
        throw mergeDefect('CONTRACT_ID_MISSING', `${ticketKeyOf(ticket)} carries a contract without an id`);
      }
      const serialized = stableStringify(contract);
      const existing = byId.get(id);
      if (existing !== undefined && existing !== serialized) {
        throw mergeDefect('DUPLICATE_CONTRACT_ID', `contract ${id} has different clauses in the merged group`);
      }
      if (existing === undefined) byId.set(id, serialized);
    }
  }
  return [...byId.values()].map((serialized) => JSON.parse(serialized));
}

/** Union formula obligations by id. */
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function mergeFormulaObligations(members) {
  const byId = new Map();
  for (const ticket of members) {
    for (const obligation of ticket?.formulaObligations ?? []) {
      const id = obligation?.id;
      if (typeof id === 'string' && !byId.has(id)) byId.set(id, obligation);
    }
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

/** The survivor ticket of a merged group and the tickets it absorbed. */
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function mergeTicketGroup(tickets, group, options = {}) {
  const start = group?.start ?? 0;
  const end = group?.end ?? tickets.length;
  const members = tickets.slice(start, end);
  if (members.length === 0) {
    throw mergeDefect('EMPTY_GROUP', 'a merge group must contain at least one ticket');
  }
  const survivor = members[0];
  const absorbed = members.slice(1);
  const survivorKey = ticketKeyOf(survivor);

  const merged = { ...survivor };
  merged.title = mergeTitles(members.map((ticket) => ticket.title));
  merged.nodeIds = unionValues(...members.map((ticket) => ticket.nodeIds ?? []));
  merged.default_files = unionValues(...members.map((ticket) => ticket.default_files ?? []));
  merged.testUnit = unionValues(...members.map((ticket) => ticket.testUnit ?? []));
  merged.testIntegration = unionValues(...members.map((ticket) => ticket.testIntegration ?? []));
  merged.testExceptions = unionValues(...members.map((ticket) => ticket.testExceptions ?? []));
  merged.acceptanceCriteria = unionValues(...members.map((ticket) => ticket.acceptanceCriteria ?? []));
  merged.contracts = options.rebuildContracts === true ? [] : mergeContractsForGroup(members);
  merged.formulaObligations = mergeFormulaObligations(members);

  let background = survivor.background ?? '';
  let notes = survivor.notes ?? '';
  let invariants = survivor.invariants ?? '';
  const scope = [...(survivor.scope ?? [])];
  const related = [survivor.relatedTicketIds ?? ''];
  for (const ticket of absorbed) {
    const key = ticketKeyOf(ticket);
    background = preserveProseSection(background, key, ticket.title, ticket.background);
    notes = preserveProseSection(notes, key, ticket.title, ticket.notes);
    invariants = preserveProseSection(invariants, key, ticket.title, ticket.invariants);
    if ((ticket.scope ?? []).length > 0) {
      scope.push(`**From ${key}: ${ticket.title}**`, ...ticket.scope);
    }
    related.push(ticket.relatedTicketIds ?? '');
  }
  merged.background = background;
  merged.notes = notes;
  merged.invariants = invariants;
  merged.scope = scope;
  merged.relatedTicketIds = related.filter((entry) => entry.length > 0).join(' ');

  merged.status = leastAdvancedStatus(members.map((ticket) => ticket.status));
  merged.round = Math.max(...members.map((ticket) => Number(ticket.round) || 0));
  if (merged.status === 'todo') {
    delete merged.startedAt;
    delete merged.completedAt;
  } else if (merged.status === 'reviewed') {
    merged.completedAt = members.map((ticket) => ticket.completedAt).filter(Boolean).sort().at(-1);
  }

  merged.changes = [
    ...(survivor.changes ?? []),
    ...absorbed.flatMap((ticket) => ticket.changes ?? []),
    {
      before: members.map(ticketKeyOf).join(', '),
      after: survivorKey,
      description: `Condensed ${members.length} tickets into ${survivorKey}`,
    },
  ];
  merged.condensedFrom = {
    planDigest: options.planDigest ?? null,
    condensedAt: options.condensedAt ?? new Date().toISOString().slice(0, 10),
    tickets: absorbed.map((ticket) => ({
      key: ticketKeyOf(ticket),
      id: ticket.id,
      status: ticket.status,
      title: ticket.title,
    })),
  };

  for (const field of RECOMPUTED_FIELDS) delete merged[field];

  return {
    ticket: merged,
    absorbed: absorbed.map((ticket) => ({
      key: ticketKeyOf(ticket),
      id: ticket.id,
      status: ticket.status,
      title: ticket.title,
    })),
  };
}

/** Condense one phase and return the plan, the merged tickets and the digest. */
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function condensePlan(phase, context, budget, options = {}) {
  const tickets = Array.isArray(phase?.tickets) ? phase.tickets : [];
  const partition = minimumContiguousPartition(tickets, context, budget, options);
  const digest = partitionDigest(partition);
  const mergedTickets = options.merge === false
    ? []
    : partition.groups.map((group) => mergeTicketGroup(tickets, group, { ...options, planDigest: digest }).ticket);
  if (mergedTickets.length === 1) {
    delete mergedTickets[0].splitReason;
  } else {
    for (let index = 1; index < mergedTickets.length; index += 1) {
      if (partition.groups[index].locked) continue;
      mergedTickets[index].splitReason = 'budget';
    }
  }
  return {
    phaseId: phase?.id,
    before: tickets.length,
    after: partition.count,
    groups: partition.groups,
    forcedBoundaries: partition.forcedBoundaries,
    irreducible: partition.irreducible,
    skippedGroups: partition.skippedGroups,
    digest,
    tickets: mergedTickets,
  };
}

module.exports = {
  STATUS_RANKS,
  COMPLETED_STATUSES,
  ABSORBED_HEADING,
  RECOMPUTED_FIELDS,
  ticketKeyOf,
  addWorkloads,
  measureRangeWorkload,
  fitsBudget,
  overBudgetComponents,
  isCompleted,
  minimumContiguousPartition,
  leastAdvancedStatus,
  mergeTitles,
  preserveProseSection,
  stableStringify,
  partitionDigest,
  mergeContractsForGroup,
  mergeFormulaObligations,
  mergeTicketGroup,
  condensePlan,
};
