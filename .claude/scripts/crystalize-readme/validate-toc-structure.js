#!/usr/bin/env node

/**
 * validate-toc-structure.js — deterministic TOC structure gate.
 *
 * The AI may choose headings. It may not choose a tree that a reader cannot
 * follow: a child without its parent, a duplicate heading, a missing Examples
 * section, or a silent retirement of a complete section is refused.
 */

const { REQUIRED_FAMILIES, matchesFamily } = require('./derive-toc.js');

const TRAILING_SECTION_TITLE = 'Examples (implementation samples) spec and design';
const ID_PATTERN = /^H[1-9][0-9]*(-[1-9][0-9]*)*$/;
const MAX_DEPTH = 6;

// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function normalize(text) {
  return String(text).trim().toLowerCase();
}

// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function parentOf(id) {
  const dash = id.lastIndexOf('-');
  return dash === -1 ? null : id.slice(0, dash);
}

/**
 * Validate a TOC.
 *
 * @param {{nodes: Array<object>, priorNodes?: Array<object>,
 *   priorSections?: Array<object>, waivers?: Array<object>, retirements?: Array<object>}} input
 * @returns {{valid: boolean, errors: string[], warnings: string[], waivers: Array<object>}}
 */
// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function validateTocStructure(input = {}) {
  const {
    nodes = [],
    priorNodes = [],
    priorSections = [],
    waivers = [],
    retirements = [],
  } = input;
  const errors = [];
  const warnings = [];

  if (!Array.isArray(nodes) || nodes.length === 0) {
    return { valid: false, errors: ['the TOC is empty'], warnings, waivers };
  }

  const positions = new Map();
  const headings = new Set();

  nodes.forEach((node, index) => {
    if (typeof node.id !== 'string' || !ID_PATTERN.test(node.id)) {
      errors.push(`invalid heading id: ${node.id}`);
    } else {
      const depth = node.id.split('-').length;
      if (depth > MAX_DEPTH) errors.push(`heading id is too deep: ${node.id}`);
      if (node.level !== undefined && node.level !== depth) {
        errors.push(`heading level mismatch: ${node.id} level ${node.level} (expected ${depth})`);
      }
      const parent = parentOf(node.id);
      if (parent !== null) {
        if (!positions.has(parent)) {
          errors.push(`parent ${parent} of ${node.id} is missing`);
        } else if (positions.get(parent) > index) {
          errors.push(`parent ${parent} of ${node.id} appears after the child`);
        }
      }
    }
    if (typeof node.heading !== 'string' || node.heading.trim() === '') {
      errors.push(`empty heading at ${node.id}`);
    } else if (headings.has(normalize(node.heading))) {
      errors.push(`duplicate heading: ${node.heading}`);
    } else {
      headings.add(normalize(node.heading));
    }
    positions.set(node.id, index);
  });

  if (normalize(nodes[nodes.length - 1].heading) !== normalize(TRAILING_SECTION_TITLE)) {
    errors.push(`the last heading must be "${TRAILING_SECTION_TITLE}"`);
  }

  const currentIds = new Set(nodes.map((node) => node.id));
  const priorById = new Map(priorNodes.map((node) => [node.id, node]));
  const sectionById = new Map(priorSections.map((section) => [section.id, section]));
  const retirementIds = new Set(retirements.map((retirement) => retirement.id));

  for (const prior of priorNodes) {
    if (currentIds.has(prior.id)) continue;
    const section = sectionById.get(prior.id);
    if (section && section.state === 'complete') {
      const retirement = retirements.find((entry) => entry.id === prior.id);
      if (!retirement || !retirement.reason || !retirement.evidence) {
        errors.push(`complete heading ${prior.id} was retired without reason and evidence`);
      }
    }
  }

  const validWaivers = waivers.filter((waiver) => waiver
    && typeof waiver.family === 'string' && waiver.family.trim() !== ''
    && typeof waiver.reason === 'string' && waiver.reason.trim() !== ''
    && typeof waiver.evidence === 'string' && waiver.evidence.trim() !== '');
  const waiverFamilies = new Set(validWaivers.map((waiver) => waiver.family));

  for (const family of REQUIRED_FAMILIES) {
    const present = nodes.some((node) => matchesFamily(node.heading, family));
    if (!present && !waiverFamilies.has(family.key)) {
      errors.push(`missing required family: ${family.key} (no waiver)`);
    }
  }

  if (!nodes.some((node) => normalize(node.heading).includes('language')) && !waiverFamilies.has('language')) {
    warnings.push('no language usage section and no waiver');
  }
  if (!nodes.some((node) => normalize(node.heading).includes('interface')) && !waiverFamilies.has('interface')) {
    warnings.push('no interface section and no waiver');
  }

  return { valid: errors.length === 0, errors, warnings, waivers };
}

if (require.main === module) {
  const fs = require('fs');
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  process.stdout.write(`${JSON.stringify(validateTocStructure(input), null, 2)}\n`);
  process.exit(validateTocStructure(input).valid ? 0 : 1);
}

module.exports = {
  TRAILING_SECTION_TITLE,
  ID_PATTERN,
  MAX_DEPTH,
  validateTocStructure,
};
