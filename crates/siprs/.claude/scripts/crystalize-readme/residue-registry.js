#!/usr/bin/env node

/**
 * residue-registry.js — stable, deduplicated, lifecycle-tracked residue.
 *
 * Residue remains in README. This registry is the machine record: it gives each
 * root cause a stable id, prevents the same cause from becoming several
 * tickets, and distinguishes new, persisting and resolved.
 */

const { createHash } = require('crypto');
const { splitSections } = require('./validate-marker-grammar.js');

const ID_PREFIX = 'RSD-';
const ID_LENGTH = 12;
const ACTIVE_STATES = new Set(['new', 'persisting']);

/** The usage-section residue marker rendered by loop-drive-readme.js. */
const MARKER_README_RESIDUE = '<::README-RESIDUE::>';

/** The invisible machine comment that links a README residue to its registry record. */
const RESIDUE_COMMENT_SOURCE = '<!--\\s*crystalize-residue:\\s*id=(RSD-[0-9a-f]{12})\\s+level=(\\S+)\\s+layer=(\\S+)\\s+element=(\\S+)\\s*-->';
const RESIDUE_COMMENT_GLOBAL = new RegExp(RESIDUE_COMMENT_SOURCE, 'g');
const RESIDUE_COMMENT_TEST = new RegExp(RESIDUE_COMMENT_SOURCE);

/** The over-detection advisory never blocks convergence. */
const OVER_DETECTION_ADVISORY = 'POSSIBLE_OVER_DETECTION';
const OVER_DETECTION_MINIMUM = 3;
const OVER_DETECTION_RATIO = 0.25;

/**
 * Compute the stable id from the residue's root-cause identity.
 *
 * @param {{level: string, layer: string, element: string, scope?: string}} record
 * @returns {string} RSD-<12 hex>
 */
// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function residueId(record) {
  const identity = [record.level, record.layer, record.element, record.scope || ''].join('|');
  return `${ID_PREFIX}${createHash('sha256').update(identity).digest('hex').slice(0, ID_LENGTH)}`;
}

/**
 * Reject a residue that a ticket cannot act on.
 *
 * @param {object} record
 * @throws {Error} When evidence or reinforcement is missing
 */
// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function validateResidue(record) {
  if (!record || typeof record !== 'object') throw new Error('residue must be an object');
  for (const field of ['level', 'layer', 'element']) {
    if (typeof record[field] !== 'string' || record[field].trim() === '') {
      throw new Error(`residue.${field} is required`);
    }
  }
  if (!Array.isArray(record.evidence) || record.evidence.length === 0) {
    throw new Error('residue.evidence requires at least one concrete item');
  }
  for (const item of record.evidence) {
    if (!item || typeof item.kind !== 'string' || typeof item.ref !== 'string') {
      throw new Error('residue.evidence items require kind and ref');
    }
  }
  if (!record.reinforcement || typeof record.reinforcement.design !== 'string'
    || record.reinforcement.design.trim() === ''
    || typeof record.reinforcement.acceptance !== 'string'
    || record.reinforcement.acceptance.trim() === '') {
    throw new Error('residue.reinforcement requires design and acceptance');
  }
}

/**
 * Register one residue against the existing registry.
 *
 * @param {object} record — {level, layer, element, scope?, evidence, reinforcement, sectionIds?, evidenceDigest?}
 * @param {Array<object>} registry — existing records
 * @returns {{record: object, registry: Array<object>}}
 */
// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function registerResidue(record, registry = []) {
  validateResidue(record);
  const id = residueId(record);
  const existing = registry.find((entry) => entry.id === id);
  const sectionIds = Array.from(new Set([
    ...(existing ? existing.sectionIds || [] : []),
    ...(record.sectionIds || []),
  ])).sort();

  if (existing && existing.state === 'resolved'
    && existing.evidenceDigest === record.evidenceDigest) {
    return { record: existing, registry };
  }

  const next = {
    ...existing,
    ...record,
    id,
    sectionIds,
    state: existing ? 'persisting' : 'new',
    firstRun: existing ? existing.firstRun : 1,
    lastRun: existing ? (existing.lastRun || 1) + 1 : 1,
  };

  const nextRegistry = existing
    ? registry.map((entry) => (entry.id === id ? next : entry))
    : [...registry, next];

  return { record: next, registry: nextRegistry };
}

/**
 * Reconcile the registry with the current section states.
 *
 * @param {Array<object>} registry
 * @param {Array<{id: string, state: string}>} sections
 * @returns {{registry: Array<object>, resolved: string[]}}
 */
// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function reconcileResidues(registry, sections) {
  const stateById = new Map(sections.map((section) => [section.id, section.state]));
  const resolved = [];

  const next = registry.map((record) => {
    const sectionStates = (record.sectionIds || []).map((id) => stateById.get(id));
    if (sectionStates.length > 0 && sectionStates.every((state) => state === 'complete')) {
      resolved.push(record.id);
      return { ...record, state: 'resolved' };
    }
    if (sectionStates.some((state) => state === 'residue' || state === undefined)) {
      return { ...record, state: 'persisting' };
    }
    return record;
  });

  return { registry: next, resolved };
}

/**
 * Read the README residue markers and prose-only residue sections.
 *
 * A machine comment is written by loop-drive-readme.js after
 * `<::README-RESIDUE::>`. A section carrying the marker without the comment is a
 * legacy prose residue: readable, but it cannot be deduplicated or resolved.
 *
 * @param {string} text — README markdown
 * @returns {{markers: Array<{id: string, level: string, layer: string, element: string}>, proseSections: string[]}}
 */
// [::TICKET::] PX-452, PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-452|PX-451) --for-spec --no-implementation-order`.
function scanReadmeResidues(text) {
  const source = String(text || '');
  const markers = [...source.matchAll(RESIDUE_COMMENT_GLOBAL)].map((match) => ({
    id: match[1],
    level: match[2],
    layer: match[3],
    element: match[4],
  }));
  const proseSections = [];
  for (const section of splitSections(source)) {
    const body = section.body.join('\n');
    if (body.includes(MARKER_README_RESIDUE) && !RESIDUE_COMMENT_TEST.test(body)) {
      proseSections.push(section.headingText);
    }
  }
  return { markers, proseSections };
}

/**
 * Validate the registry and its README rendering.
 *
 * When a README is supplied, every marker must have a registry record, every
 * active record must have a marker, and a resolved record must not reappear.
 * A prose-only residue is reported: it bypassed the stable-id lifecycle.
 *
 * @param {Array<object>} registry
 * @param {string} readmeText
 * @returns {{ok: boolean, errors: string[]}}
 */
// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function validateRegistry(registry, readmeText = '') {
  const errors = [];
  const seen = new Set();
  const scan = readmeText ? scanReadmeResidues(readmeText) : { markers: [], proseSections: [] };
  const markerIds = new Set(scan.markers.map((marker) => marker.id));
  const registryIds = new Set(registry.map((record) => record && record.id).filter(Boolean));

  for (const marker of scan.markers) {
    if (!registryIds.has(marker.id)) {
      errors.push(`unregistered residue in README: ${marker.id}`);
    }
  }
  for (const heading of scan.proseSections) {
    errors.push(`prose residue has no registry record: ${heading}`);
  }

  for (const record of registry) {
    try {
      validateResidue(record);
    } catch (error) {
      errors.push(`${record.id || '(no id)'}: ${error.message}`);
      continue;
    }
    if (seen.has(record.id)) errors.push(`duplicate residue id: ${record.id}`);
    seen.add(record.id);
    if (readmeText && record.state === 'resolved' && markerIds.has(record.id)) {
      errors.push(`resolved residue still appears in README: ${record.id}`);
    }
    if (readmeText && ACTIVE_STATES.has(record.state) && !markerIds.has(record.id)) {
      errors.push(`active residue has no README marker: ${record.id}`);
    }
    if (ACTIVE_STATES.has(record.state) && (record.sectionIds || []).length === 0) {
      errors.push(`active residue has no section: ${record.id}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Report POSSIBLE_OVER_DETECTION when many new residues appear while the package
 * evidence is unchanged. The advisory is a signal to consolidate or waive; it
 * never blocks convergence and disappears as soon as the evidence changes.
 *
 * @param {{registry?: Array<object>, sections?: Array<object>, evidenceDigest?: string|null,
 *   previousEvidenceDigest?: string|null}} input
 * @returns {{advisory: string|null, newCount: number, threshold: number, message?: string}}
 */
// [::TICKET::] PX-452, PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-452|PX-451) --for-spec --no-implementation-order`.
function detectOverDetection({
  registry = [],
  sections = [],
  evidenceDigest = null,
  previousEvidenceDigest = null,
} = {}) {
  const newCount = registry.filter((record) => record && record.state === 'new').length;
  const threshold = Math.max(OVER_DETECTION_MINIMUM, OVER_DETECTION_RATIO * sections.length);
  const unchanged = Boolean(evidenceDigest) && evidenceDigest === previousEvidenceDigest;
  if (!unchanged || newCount <= threshold) {
    return { advisory: null, newCount, threshold };
  }
  return {
    advisory: OVER_DETECTION_ADVISORY,
    newCount,
    threshold,
    message: `${OVER_DETECTION_ADVISORY}: ${newCount} new residues with unchanged evidence (threshold ${threshold}); consolidate or waive with a recorded reason.`,
  };
}

if (require.main === module) {
  const fs = require('fs');
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  if (input.mode === 'reconcile') {
    process.stdout.write(`${JSON.stringify(reconcileResidues(input.registry || [], input.sections || []), null, 2)}\n`);
  } else if (input.mode === 'check') {
    process.stdout.write(`${JSON.stringify(validateRegistry(input.registry || [], input.readme || ''), null, 2)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(registerResidue(input.record || {}, input.registry || []), null, 2)}\n`);
  }
}

module.exports = {
  ID_PREFIX,
  OVER_DETECTION_ADVISORY,
  MARKER_README_RESIDUE,
  residueId,
  validateResidue,
  registerResidue,
  reconcileResidues,
  scanReadmeResidues,
  validateRegistry,
  detectOverDetection,
};
