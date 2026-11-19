#!/usr/bin/env node

/**
 * plan-refine.js — decide which sections a refine run may preserve.
 *
 * A section is preserved only when it was complete and its evidence digest is
 * unchanged. A residue is always re-analyzed: the implementation may have
 * changed even when the surrounding evidence digest did not. A new section is
 * always marked new.
 */

const fs = require('fs');
const { splitSections } = require('./validate-marker-grammar.js');

/** CLI flag: prior README from which preserve bodies are extracted. */
const FLAG_README = '--readme=';

// [::TICKET::] PX-452, PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-452|PX-451) --for-spec --no-implementation-order`.
function normalizeHeading(heading) {
  return String(heading || '').trim().toLowerCase();
}

/**
 * Map each prior heading to its body, excluding the heading line itself.
 *
 * @param {string} readmeText
 * @returns {Map<string,string>}
 */
// [::TICKET::] PX-452, PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-452|PX-451) --for-spec --no-implementation-order`.
function bodyByHeading(readmeText) {
  const bodies = new Map();
  for (const section of splitSections(String(readmeText || ''))) {
    const body = section.body.join('\n').replace(/^\n+/, '').trimEnd();
    if (body !== '') bodies.set(normalizeHeading(section.headingText), body);
  }
  return bodies;
}

/**
 * Build the per-section refine plan.
 *
 * @param {Object} input
 * @param {Array<{id: string, heading: string, state: string, evidenceDigest?: string}>} [input.priorSections]
 * @param {Array<{id: string, heading: string, level: number}>} [input.priorNodes]
 * @param {Object<string,string>} [input.currentEvidence]
 * @param {Array<{id: string, heading: string, level: number}>} [input.currentNodes]
 * @param {string} [input.priorReadmeText] — prior README used to carry a body forward
 * @returns {{nodes: Array<object>, summary: object}}
 */
// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function planRefine(input = {}) {
  const {
    priorSections = [],
    priorNodes = [],
    currentEvidence = {},
    currentNodes = null,
    priorReadmeText = null,
  } = input;
  const priorById = new Map(priorSections.map((section) => [section.id, section]));
  const nodes = currentNodes || priorNodes;
  const priorBodies = priorReadmeText === null ? null : bodyByHeading(priorReadmeText);

  const planned = nodes.map((node) => {
    const prior = priorById.get(node.id);
    if (!prior) {
      return { ...node, action: 'new' };
    }
    if (prior.state === 'residue') {
      return { ...node, action: 'reanalyze', reason: 'residue is never preserved' };
    }
    const digest = currentEvidence[node.id];
    if (prior.state === 'complete' && prior.evidenceDigest && digest === prior.evidenceDigest) {
      if (priorBodies !== null) {
        const body = priorBodies.get(normalizeHeading(prior.heading || node.heading));
        if (body === undefined) {
          return { ...node, action: 'reanalyze', reason: 'prior body not found' };
        }
        return { ...node, action: 'preserve', evidenceDigest: digest, body };
      }
      return { ...node, action: 'preserve', evidenceDigest: digest };
    }
    return { ...node, action: 'reanalyze', reason: 'evidence changed or digest missing' };
  });

  const summary = planned.reduce((counts, node) => {
    counts[node.action] = (counts[node.action] || 0) + 1;
    return counts;
  }, {});

  return { nodes: planned, summary };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let readmePath = null;
  for (const arg of args) {
    if (arg.startsWith(FLAG_README)) readmePath = arg.slice(FLAG_README.length);
    else {
      console.error(`[ERROR] Unknown argument: ${arg}`);
      console.error('Cause: only --readme=<path> is accepted');
      console.error('Action: Pass --readme=<prior README> or omit it, and provide the plan input on stdin.');
      process.exit(2);
    }
  }
  try {
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    if (readmePath !== null) {
      input.priorReadmeText = fs.readFileSync(readmePath, 'utf8');
    }
    process.stdout.write(`${JSON.stringify(planRefine(input), null, 2)}\n`);
  } catch (error) {
    console.error('[ERROR] Refine planning failed.');
    console.error(`Cause: ${error.message}`);
    console.error('Action: Provide readable stdin JSON and a readable --readme path.');
    process.exit(1);
  }
}

module.exports = {
  bodyByHeading,
  planRefine,
  FLAG_README,
};
