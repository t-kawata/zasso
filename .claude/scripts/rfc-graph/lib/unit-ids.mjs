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
import { parseDistributionMap, resolveSections } from '../../sequences-slice/lib/distribution-map.mjs';

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

/** The four arrays a package view distributes. */
const VIEW_UNIT_ARRAYS = Object.freeze([
  'ownedOperationUnits',
  'ownedSequenceUnits',
  'crossBoundarySequenceUnits',
  'obligationUnits',
]);

/** The unit ids a set of package views distributes, deduplicated in view order. */
export function collectViewUnitIds(packages = []) {
  const ids = new Set();
  for (const pkg of Array.isArray(packages) ? packages : []) {
    const view = pkg?.view ?? pkg;
    for (const field of VIEW_UNIT_ARRAYS) {
      for (const unit of Array.isArray(view?.[field]) ? view[field] : []) {
        if (isUnitId(unit?.unitId)) ids.add(unit.unitId);
      }
    }
  }
  return [...ids];
}

/** The unit ids a distribution ledger assigns, excluding declared residuals. */
export function collectLedgerUnitIds(rows = []) {
  const ids = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.kind === 'declared-residual') continue;
    if (isUnitId(row?.unit)) ids.add(row.unit);
  }
  return [...ids];
}

/** A heading's text without the marker or surrounding whitespace. */
// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
export function normalizeHeading(text) {
  return String(text ?? '').replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * The unit anchors each heading section carries.
 *
 * The section ends at the next heading of the same or a higher level, so an anchor is
 * attributed to the paragraph that owns it rather than to the whole document.
 *
 * @param {string} rfcText
 * @returns {Array<{headingText: string|null, level: number, unitIds: string[]}>}
 */
export function readSectionUnitAnchors(rfcText) {
  const sections = [];
  let current = { headingText: null, level: 0, unitIds: [] };
  const flush = () => {
    if (current.headingText !== null || current.unitIds.length > 0) sections.push(current);
  };
  for (const line of String(rfcText).split('\n')) {
    const heading = /^(#{1,6})\s+(.*\S)\s*$/.exec(line);
    if (heading !== null) {
      flush();
      current = { headingText: heading[2].trim(), level: heading[1].length, unitIds: [] };
      continue;
    }
    for (const match of line.matchAll(new RegExp(SECTION_ANCHOR.source, 'g'))) {
      if (isUnitId(match[1]) && !current.unitIds.includes(match[1])) current.unitIds.push(match[1]);
    }
  }
  flush();
  return sections;
}

/** The units a graph would carry if every RFC anchor reached the node its heading built. */
// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
function unitsByNode(graph, rfcText) {
  const sections = readSectionUnitAnchors(rfcText);
  const nodeByHeading = new Map();
  for (const node of graph?.nodes ?? []) {
    for (const ref of node.headingRefs ?? []) {
      for (const text of ref.texts ?? []) nodeByHeading.set(normalizeHeading(text), node.id);
    }
  }
  const byNode = new Map();
  for (const section of sections) {
    if (section.headingText === null) continue;
    const nodeId = nodeByHeading.get(normalizeHeading(section.headingText));
    if (nodeId === undefined) continue;
    const units = byNode.get(nodeId) ?? [];
    for (const unitId of section.unitIds) if (!units.includes(unitId)) units.push(unitId);
    byNode.set(nodeId, units);
  }
  return byNode;
}

/**
 * A graph whose nodes carry the unit anchors written under their headings.
 *
 * The input graph is not modified. A node that already carries an id keeps it, so a
 * second run over an unchanged RFC produces the same graph.
 */
export function assignUnitIdsFromRfc(graph, rfcText) {
  const byNode = unitsByNode(graph, rfcText);
  return {
    ...graph,
    nodes: (graph?.nodes ?? []).map((node) => carryUnitIdsToNode(node, byNode.get(node.id) ?? [])),
  };
}

/** The anchors no node's heading claims, so a dropped anchor is reported rather than lost. */
export function unassignedAnchors(graph, rfcText) {
  const sections = readSectionUnitAnchors(rfcText);
  const byNode = unitsByNode(graph, rfcText);
  const assigned = new Set([...byNode.values()].flat());
  const unassigned = [];
  for (const section of sections) {
    for (const unitId of section.unitIds) {
      if (!assigned.has(unitId) && !unassigned.includes(unitId)) unassigned.push(unitId);
    }
  }
  return unassigned;
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

/**
 * The distribution map embedded in an RFC, or null when it carries none.
 *
 * Graphify may read only RFC.md, so the map has to travel inside it. This reader is the
 * one entry point the graph stage uses; a malformed block reads as absent rather than as
 * a partial map, and the caller's digest gate then refuses the stage.
 *
 * @param {string} rfcText
 * @returns {object|null}
 */
// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
export function readDistributionMap(rfcText) {
  const parsed = parseDistributionMap(rfcText);
  return parsed.ok ? parsed.map : null;
}

/**
 * Attach the map's units to the nodes whose headings the map names.
 *
 * Matching is exact: a section text or its leading dotted number must equal a node's
 * heading, never a substring. A map unit with no node and a node unit outside the map are
 * returned as findings so the caller can fail with the code the layer names.
 *
 * @param {{ nodes?: Array<object> }} graph
 * @param {object} map
 * @param {string} rfcText
 * @returns {{ graph: object, missing: string[], invented: string[] }}
 */
// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
export function assignUnitIdsFromMap(graph, map, rfcText) {
  const managed = new Set((map?.units ?? []).map((unit) => unit.unitId));
  const sectionTextsByUnit = new Map();
  const unresolvable = [];

  for (const unit of map?.units ?? []) {
    const resolution = resolveSections(rfcText, unit.sections);
    if (!resolution.ok) {
      unresolvable.push(unit.unitId);
      continue;
    }
    sectionTextsByUnit.set(unit.unitId, new Set(resolution.resolved.map((entry) => normalizeHeading(entry.text))));
  }

  const attached = new Set();
  const invented = [];
  const nodes = (graph?.nodes ?? []).map((node) => {
    const headings = new Set();
    for (const ref of node.headingRefs ?? []) {
      for (const text of ref.texts ?? []) headings.add(normalizeHeading(text));
    }
    const carried = [];
    for (const [unitId, sections] of sectionTextsByUnit) {
      if ([...sections].some((section) => headings.has(section))) {
        carried.push(unitId);
        attached.add(unitId);
      }
    }
    const existing = Array.isArray(node.unitIds) ? node.unitIds.filter(isUnitId) : [];
    for (const unitId of existing) {
      if (!managed.has(unitId) && !invented.includes(unitId)) invented.push(unitId);
    }
    return {
      ...node,
      unitIds: [...new Set([...existing.filter((unitId) => !managed.has(unitId)), ...carried])],
    };
  });

  const missing = [...managed].filter((unitId) => !attached.has(unitId) && !unresolvable.includes(unitId));
  return {
    graph: { ...graph, nodes, distributionDigest: map?.digest ?? null },
    missing: [...missing, ...unresolvable],
    invented,
  };
}
