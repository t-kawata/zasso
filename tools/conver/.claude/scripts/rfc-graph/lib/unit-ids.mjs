/**
 * The unit id, and the vessels that carry it from the specification to the ship layer.
 *
 * A sequence or an operation has no name past the specification until something carries it.
 * The chain is: the RFC section an operation is written into carries an anchor; the graph
 * node built from that section carries the ids; the implementation file's header names the
 * node and its ids; the ticket carries them in nodeIds; the graph is what crystalize-readme
 * reads, so the graph is the only route to the ship layer.
 *
 * Every reader here is total: a document written before the property existed yields an
 * empty list rather than throwing, because the whole corpus on disk predates it.
 */

/** The id shape a distributed unit has: op- an operation, seq- a sequence one package owns, xdir- one that crosses, ctr- a boundary side, obl- a declared surface. */
// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
export const UNIT_ID_PATTERN = '^(op|seq|xdir|ctr|obl)-.+';

/** The prefixes the pattern admits, kept beside it so a reader sees the vocabulary once. */
export const UNIT_KINDS = Object.freeze(['op', 'seq', 'xdir', 'ctr', 'obl']);

/** The RFC anchor that records which unit a section implements. */
const SECTION_ANCHOR = /<!--\s*unit:\s*([A-Za-z0-9._:-]+)\s*-->/g;

/** The header's first line, which is what makes a file a generated one. */
export const HEADER_OPENING = 'Initial Design Artifact — RFC-driven Implementation';

const HEADER_NODE_LINE = /^\s*node:\s*(N[0-9]{4})\b/m;
const HEADER_UNITS_LINE = /^\s*units:\s*(.+)$/m;

/** Whether a string is a unit id rather than a graph node id or anything else. */
// [::TICKET::] PX-258 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-258 --for-spec --no-implementation-order`.
export function isUnitId(candidate) {
  return typeof candidate === 'string' && new RegExp(UNIT_ID_PATTERN).test(candidate);
}

/**
 * The unit ids a graph node carries, or an empty list when it carries none.
 *
 * A node written before this change has no property at all; a node written after it may
 * carry an empty array, which means the same thing. Neither is an error.
 *
 * @param {{ unitIds?: unknown }} node
 * @returns {string[]}
 */
// [::TICKET::] PX-258 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-258 --for-spec --no-implementation-order`.
export function readUnitIds(node) {
  const unitIds = node?.unitIds;
  if (!Array.isArray(unitIds)) return [];
  return unitIds.filter(isUnitId);
}

/**
 * Every unit id a graph carries, deduplicated.
 *
 * @param {{ nodes?: Array<object> }} graph
 * @returns {string[]}
 */
// [::TICKET::] PX-258 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-258 --for-spec --no-implementation-order`.
export function readGraphUnitIds(graph) {
  const ids = new Set();
  for (const node of graph?.nodes ?? []) {
    for (const unitId of readUnitIds(node)) ids.add(unitId);
  }
  return [...ids];
}

/**
 * The unit anchors an RFC section carries, in the order they appear.
 *
 * The anchor is a comment rather than prose so that a reader can find every unit a package
 * implements without reading the paragraph that describes it.
 *
 * @param {string} sectionText
 * @returns {string[]}
 */
// [::TICKET::] PX-258 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-258 --for-spec --no-implementation-order`.
export function readUnitAnchors(sectionText) {
  const anchors = [];
  for (const match of String(sectionText).matchAll(SECTION_ANCHOR)) {
    if (isUnitId(match[1]) && !anchors.includes(match[1])) anchors.push(match[1]);
  }
  return anchors;
}

/**
 * A node with the section's units recorded on it.
 *
 * Returns a new node; the input is not modified. A second call with the same units adds
 * nothing, so re-running a command over an unchanged RFC produces an unchanged graph.
 *
 * @param {object} node
 * @param {string[]} unitIds
 * @returns {object}
 */
// [::TICKET::] PX-258 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-258 --for-spec --no-implementation-order`.
export function carryUnitIdsToNode(node, unitIds) {
  const merged = [...readUnitIds(node)];
  for (const unitId of unitIds) {
    if (isUnitId(unitId) && !merged.includes(unitId)) merged.push(unitId);
  }
  return { ...node, unitIds: merged };
}

/** The graph node a generated header names, or null when it names none. */
// [::TICKET::] PX-258 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-258 --for-spec --no-implementation-order`.
export function readHeaderNodeId(fileText) {
  const match = HEADER_NODE_LINE.exec(String(fileText));
  return match === null ? null : match[1];
}

/**
 * The unit ids a generated header names, or an empty list.
 *
 * An empty list is the right answer for a file with no header, for a header written before
 * the ids were carried, and for a header whose units line is empty. A reader that could not
 * tell those apart would report a loss where there was only an older document.
 *
 * @param {string} headerText
 * @returns {string[]}
 */
// [::TICKET::] PX-258 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-258 --for-spec --no-implementation-order`.
export function readHeaderUnitIds(headerText) {
  const text = String(headerText);
  if (!text.includes(HEADER_OPENING)) return [];
  const match = HEADER_UNITS_LINE.exec(text);
  if (match === null) return [];
  return match[1]
    .split(',')
    .map((entry) => entry.trim())
    .filter(isUnitId);
}

/**
 * The unit ids a tickets document carries, read at the level its consumers read.
 *
 * MEASURED: verify-consistencies.js collectTicketNodeIds iterates phases[].tickets[].nodeIds
 * and never reads a phase-level array, so the ticket level is the one a consumer sees. The
 * schema declares the property at both levels; the phase-level declaration is unused.
 *
 * @param {{ phases?: Array<{ tickets?: Array<{ nodeIds?: unknown }> }> }} tickets
 * @returns {string[]}
 */
// [::TICKET::] PX-258 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-258 --for-spec --no-implementation-order`.
export function resolveUnitIdsFromTickets(tickets) {
  const ids = new Set();
  for (const phase of tickets?.phases ?? []) {
    for (const ticket of phase.tickets ?? []) {
      if (!Array.isArray(ticket.nodeIds)) continue;
      for (const candidate of ticket.nodeIds) {
        if (isUnitId(candidate)) ids.add(candidate);
      }
    }
  }
  return [...ids];
}

/**
 * A ticket carrying its unit ids beside its graph node ids.
 *
 * The graph node ids are kept: nodeIds means both, the schema's item type is an
 * unconstrained string, and a reader that wants only one kind filters by the pattern. A
 * ticket already carrying a unit id is unchanged, so re-running adds nothing.
 *
 * @param {{ nodeIds?: unknown }} ticket
 * @param {string[]} unitIds
 * @returns {object}
 */
// [::TICKET::] PX-258 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-258 --for-spec --no-implementation-order`.
export function writeUnitIdsToTicket(ticket, unitIds) {
  const nodeIds = Array.isArray(ticket?.nodeIds) ? [...ticket.nodeIds] : [];
  for (const unitId of unitIds) {
    if (isUnitId(unitId) && !nodeIds.includes(unitId)) nodeIds.push(unitId);
  }
  return { ...ticket, nodeIds };
}
