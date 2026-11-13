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
const { ticketKeyOf, remapLiveReferences } = require('./ticket-identity-renumber.js');
const {
  STATUS_RANKS,
  COMPLETED_STATUSES,
  TODO_STATUS,
  isCompletedStatus,
  isMergeableStatus,
} = require('./ticket-status.js');

const LEDGER_RECORD_FIELD = 'record';
const LEDGER_ORIGIN_FIELD = 'originKey';
const MERGE_STATUS_POLICY_TODO = 'todo';
const MERGE_STATUS_POLICY_NON_COMPLETED = 'non-completed';

/** Fields that are recomputed after the partition changes. */
const RECOMPUTED_FIELDS = Object.freeze([
  'distribution',
  'prerequisites',
  'mergeAttempts',
]);

/**
 * Fields the ledger does not copy verbatim.
 *
 * The record is the recovery source, so it copies every field, including the
 * nested `condensedFrom` history. The survivor still recomputes derived fields;
 * the pre-merge value stays in the record.
 */
const LEDGER_EXCLUDED_FIELDS = Object.freeze([]);

/** Set-valued fields unioned into the survivor. */
const MACHINE_ARRAY_FIELDS = Object.freeze([
  'nodeIds',
  'default_files',
  'testUnit',
  'testIntegration',
  'testExceptions',
  'acceptanceCriteria',
  'planTestCode',
  'sourcePaths',
  'referenceUrls',
  'rfcDiscrepancies',
  'targetStubs',
  'targetCrimes',
  'foundOmissions',
  'stubs',
]);

/** Array fields whose elements are objects and therefore deduplicated structurally. */
const OBJECT_MACHINE_FIELDS = Object.freeze([
  'targetStubs',
  'targetCrimes',
  'foundOmissions',
  'stubs',
]);

/** String fields unioned into the survivor. */
const MACHINE_STRING_FIELDS = Object.freeze([
  'referenceSection',
  'relatedTicketIds',
]);

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

/** Whether a ticket's status is complete for the legacy `--preserve-completed` policy. */
// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function isCompleted(ticket) {
  return isCompletedStatus(ticket?.status);
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
// [::TICKET::] PX-415, PX-416, PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416|PX-394) --for-spec --no-implementation-order`.
function minimumContiguousPartition(tickets, context, budget, options = {}) {
  const components = options.components ?? WORKLOAD_COMPONENTS;
  const preserveCompleted = options.preserveCompleted === true;
  const mergeStatusPolicy = options.mergeStatusPolicy ?? MERGE_STATUS_POLICY_TODO;
  const workloads = tickets.map((ticket) => workloadOfTicket(ticket, context));
  const count = tickets.length;
  if (count === 0) {
    return { count: 0, groups: [], forcedBoundaries: [], irreducible: [], skippedGroups: [], workloads };
  }

  const locked = tickets.map((ticket) => (
    mergeStatusPolicy === MERGE_STATUS_POLICY_NON_COMPLETED
      ? preserveCompleted && isCompleted(ticket)
      : !isMergeableStatus(ticket?.status)
  ));
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
// [::TICKET::] PX-415, PX-416, PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416|PX-394) --for-spec --no-implementation-order`.
function leastAdvancedStatus(statuses) {
  const values = (statuses ?? []).filter((status) => typeof status === 'string' && status.length > 0);
  if (values.length === 0) return TODO_STATUS;
  if (values.includes('remanded')) return 'remanded';
  let result = TODO_STATUS;
  let rank = Number.POSITIVE_INFINITY;
  for (const status of values) {
    const candidate = isCompletedStatus(status) ? 4 : (STATUS_RANKS[status] ?? 0);
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

/** Clone a JSON value without sharing the source object. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/**
 * The absorbed ticket as the ledger stores it.
 *
 * Every field not owned by another merge rule is copied verbatim. The rule is
 * field-name agnostic on purpose: a field added to tickets later must not need a
 * new branch here, or it would be silently dropped until someone noticed.
 */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function collectPreservedRecord(ticket) {
  const record = {};
  for (const [field, value] of Object.entries(ticket)) {
    if (value === undefined) continue;
    if (LEDGER_EXCLUDED_FIELDS.includes(field)) continue;
    record[field] = cloneJson(value);
  }
  return record;
}

/**
 * Rewrite absorbed ticket keys to the survivor that now owns them.
 *
 * The shared replacer is single-pass, so a permutation cannot rewrite a produced key
 * a second time.
 */
// [::TICKET::] PX-396, PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-396|PX-402) --for-spec --no-implementation-order`.
function remapTicketReferences(value, keyMap) {
  if (!(keyMap instanceof Map) || keyMap.size === 0) return value;
  return remapLiveReferences(value, keyMap);
}

/** Union arrays of objects by their structural value, preserving first-seen order. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function unionRecords(arrays) {
  const byValue = new Map();
  for (const array of arrays) {
    for (const value of array ?? []) {
      const key = stableStringify(value);
      if (byValue.has(key)) continue;
      byValue.set(key, cloneJson(value));
    }
  }
  return [...byValue.values()];
}

/** Union one set-valued machine field across the merge members. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function unionMachineField(field, members) {
  const arrays = members.map((ticket) => ticket[field]).filter(Array.isArray);
  if (arrays.length === 0) return undefined;
  return OBJECT_MACHINE_FIELDS.includes(field) ? unionRecords(arrays) : unionValues(...arrays);
}

/** Union one string-valued machine field across the merge members. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function unionMachineString(field, members) {
  const values = members
    .map((ticket) => ticket[field])
    .filter((value) => typeof value === 'string' && value.length > 0);
  if (values.length === 0) return undefined;
  const distinct = unionValues(values);
  return field === 'relatedTicketIds' ? distinct.join(' ') : distinct.join(' | ');
}

/** Union the free-form unlisted-file reason without changing its shape. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function unionUnlistedFileReason(members) {
  const values = members
    .map((ticket) => ticket.unlistedFileReason)
    .filter((value) => value !== undefined && value !== null && value !== '');
  if (values.length === 0) return undefined;
  const flattened = values.flatMap((value) => (Array.isArray(value) ? value : [value]));
  const distinct = unionValues(flattened);
  return values.every((value) => typeof value === 'string') ? distinct.join(' | ') : distinct;
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

/** Union formula obligations by id; different clauses for one id are a defect. */
// [::TICKET::] PX-415, PX-416, PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416|PX-394) --for-spec --no-implementation-order`.
function mergeFormulaObligations(members) {
  const byId = new Map();
  for (const ticket of members) {
    for (const obligation of ticket?.formulaObligations ?? []) {
      const id = obligation?.id;
      if (typeof id !== 'string') continue;
      const serialized = stableStringify(obligation);
      const existing = byId.get(id);
      if (existing !== undefined && existing !== serialized) {
        throw mergeDefect('FORMULA_OBLIGATION_CONFLICT', `formula ${id} has different clauses in the merged group`);
      }
      if (existing === undefined) byId.set(id, serialized);
    }
  }
  return [...byId.values()]
    .map((serialized) => JSON.parse(serialized))
    .sort((left, right) => left.id.localeCompare(right.id));
}

/** Every historical ledger entry carried by an absorbed ticket, flattened. */
// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function flattenNestedLedger(ticket, generation) {
  const nested = ticket?.condensedFrom?.tickets;
  if (!Array.isArray(nested)) return [];
  const entries = [];
  for (const entry of nested) {
    const entryGeneration = entry?.generation ?? generation;
    entries.push({ ...cloneJson(entry), generation: entryGeneration });
    const inner = entry?.record?.condensedFrom?.tickets;
    if (Array.isArray(inner)) {
      for (const innerEntry of inner) {
        entries.push({ ...cloneJson(innerEntry), generation: innerEntry?.generation ?? entryGeneration });
      }
    }
  }
  return entries;
}

/** The survivor ticket of a merged group and the tickets it absorbed. */
// [::TICKET::] PX-415, PX-416, PX-394, PX-396, PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416|PX-394|PX-396|PX-402) --for-spec --no-implementation-order`.
function mergeTicketGroup(tickets, group, options = {}) {
  const start = group?.start ?? 0;
  const end = group?.end ?? tickets.length;
  const members = tickets.slice(start, end);
  if (members.length === 0) {
    throw mergeDefect('EMPTY_GROUP', 'a merge group must contain at least one ticket');
  }
  if (options.mergeStatusPolicy !== MERGE_STATUS_POLICY_NON_COMPLETED) {
    const blocked = members.filter((ticket) => !isMergeableStatus(ticket?.status));
    if (blocked.length > 0) {
      throw mergeDefect(
        'NON_TODO_MERGE_GROUP',
        `a merge group must contain only todo tickets; found ${blocked.map((ticket) => `${ticketKeyOf(ticket)}:${ticket.status}`).join(', ')}`,
      );
    }
  }
  const survivor = members[0];
  const absorbed = members.slice(1);
  const survivorKey = ticketKeyOf(survivor);
  const keyMap = options.keyMap instanceof Map && options.keyMap.size > 0
    ? options.keyMap
    : new Map(absorbed.map((ticket) => [ticketKeyOf(ticket), survivorKey]));

  const merged = { ...survivor };
  merged.title = mergeTitles(members.map((ticket) => ticket.title));

  for (const field of MACHINE_ARRAY_FIELDS) {
    const value = unionMachineField(field, members);
    if (value === undefined) delete merged[field];
    else merged[field] = remapTicketReferences(value, keyMap);
  }
  for (const field of MACHINE_STRING_FIELDS) {
    const value = unionMachineString(field, members);
    if (value === undefined) delete merged[field];
    else merged[field] = remapTicketReferences(value, keyMap);
  }
  const unlistedFileReason = unionUnlistedFileReason(members);
  if (unlistedFileReason === undefined) delete merged.unlistedFileReason;
  else merged.unlistedFileReason = remapTicketReferences(unlistedFileReason, keyMap);

  merged.contracts = options.rebuildContracts === true
    ? []
    : remapTicketReferences(mergeContractsForGroup(members), keyMap);
  // `contracts` is optional but, when present, the schema rejects an empty array.
  // A merge that leaves no clause must remove the field, not write [].
  if (Array.isArray(merged.contracts) && merged.contracts.length === 0) delete merged.contracts;
  merged.formulaObligations = remapTicketReferences(mergeFormulaObligations(members), keyMap);

  merged.status = leastAdvancedStatus(members.map((ticket) => ticket.status));
  merged.round = Math.max(...members.map((ticket) => Number(ticket.round) || 0));
  if (merged.status === 'todo') {
    delete merged.startedAt;
    delete merged.completedAt;
  } else if (merged.status === 'reviewed') {
    merged.completedAt = members.map((ticket) => ticket.completedAt).filter(Boolean).sort().at(-1);
  }

  const generation = options.generation ?? 0;
  // The ledger is cumulative. A survivor that already absorbed tickets keeps those
  // records when it absorbs more, so a later renumber can still resolve every old key.
  const priorLedgerEntries = Array.isArray(survivor.condensedFrom?.tickets)
    ? survivor.condensedFrom.tickets
    : [];
  merged.changes = [
    ...(survivor.changes ?? []),
    ...absorbed.flatMap((ticket) => ticket.changes ?? []),
    {
      before: members.map(ticketKeyOf).join(', '),
      after: survivorKey,
      description: `Condensed ${members.length} tickets into ${survivorKey}`,
      generation,
    },
  ];
  merged.condensedFrom = {
    originKey: survivorKey,
    generation,
    planDigest: options.planDigest ?? null,
    condensedAt: options.condensedAt ?? new Date().toISOString().slice(0, 10),
    tickets: [
      ...priorLedgerEntries,
      ...absorbed.flatMap((ticket) => [
        {
          key: ticketKeyOf(ticket),
          id: ticket.id,
          status: ticket.status,
          title: ticket.title,
          [LEDGER_ORIGIN_FIELD]: survivorKey,
          [LEDGER_RECORD_FIELD]: collectPreservedRecord(ticket),
          generation,
        },
        ...flattenNestedLedger(ticket, generation),
      ]),
    ],
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
// [::TICKET::] PX-415, PX-416, PX-394, PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416|PX-394|PX-396) --for-spec --no-implementation-order`.
function condensePlan(phase, context, budget, options = {}) {
  const tickets = Array.isArray(phase?.tickets) ? phase.tickets : [];
  const partition = minimumContiguousPartition(tickets, context, budget, options);
  const digest = partitionDigest(partition);
  const keyMap = new Map();
  for (const group of partition.groups) {
    for (const member of group.members.slice(1)) keyMap.set(member, group.members[0]);
  }
  // A one-member group is not a merge. Rebuilding it would advance its
  // condensedFrom generation and rewrite history on every no-op run; the
  // original ticket already carries the correct record.
  const mergedTickets = options.merge === false
    ? []
    : partition.groups.map((group) => {
      const members = tickets.slice(group.start, group.end);
      if (members.length === 1) return JSON.parse(JSON.stringify(members[0]));
      return mergeTicketGroup(tickets, group, { ...options, planDigest: digest, keyMap }).ticket;
    });
  if (mergedTickets.length !== 1) {
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
  RECOMPUTED_FIELDS,
  LEDGER_EXCLUDED_FIELDS,
  MACHINE_ARRAY_FIELDS,
  MACHINE_STRING_FIELDS,
  LEDGER_RECORD_FIELD,
  LEDGER_ORIGIN_FIELD,
  ticketKeyOf,
  addWorkloads,
  measureRangeWorkload,
  fitsBudget,
  overBudgetComponents,
  isCompleted,
  minimumContiguousPartition,
  leastAdvancedStatus,
  mergeTitles,
  collectPreservedRecord,
  remapTicketReferences,
  unionMachineField,
  unionMachineString,
  stableStringify,
  partitionDigest,
  mergeContractsForGroup,
  mergeFormulaObligations,
  mergeTicketGroup,
  condensePlan,
};
