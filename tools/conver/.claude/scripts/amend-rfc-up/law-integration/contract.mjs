// [::TICKET::] PX-423 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-423 --for-spec --no-implementation-order`.
/**
 * PX-423 — the fixed integration contract.
 *
 * One canonical line per host file. The line is deliberately skill-agnostic:
 * every installed `skills/*-law` owns its own trigger and exact CLI in
 * `SKILL.md`, while the host files carry one constant dispatch and gate line.
 * This is the smallest text that survives repeated `/build-law-skill` runs.
 */

import { normalizeLf } from '../law-verify/source.mjs';

export const INTEGRATION_MARKER = '<!-- law-skill:checkpoint -->';
export const MAX_CHECKPOINT_LENGTH = 240;

export const PIPELINE_COMMANDS = Object.freeze([
  'make-ticket',
  'plan-ticket',
  'start-ticket',
  'review-ticket',
  'resolve-ticket',
]);

export const INTEGRATION_CODES = Object.freeze([
  'INTEGRATION_MISSING',
  'INTEGRATION_DRIFT',
  'INTEGRATION_DUPLICATE',
  'INTEGRATION_LOCATION',
  'INTEGRATION_CLI_LEAK',
  'INTEGRATION_SKILL_INVALID',
  'INTEGRATION_NO_SKILL',
  'INTEGRATION_WRITE_FAILED',
]);

export const CANONICAL_LINES = Object.freeze({
  claude: `${INTEGRATION_MARKER} Only when a \`skills/*-law\` trigger matches: apply; completion \`gate\` 0 + \`attest\` ok; built/changed: v2 \`dev\` + \`installed\`, every required check \`machine_verified\`, record \`closure\`. No match → skip.`,
  'make-ticket': `${INTEGRATION_MARKER} Law skill built/changed: record \`Law:\` scope; apply each \`skills/*-law\` per \`SKILL.md\`; v2 \`dev\` + \`installed\`; every required check \`machine_verified\`; record \`closure\`.`,
  'plan-ticket': `${INTEGRATION_MARKER} Law skill built/changed: plan phases from each \`skills/*-law\` \`SKILL.md\`; check set 18; v2 \`dev\` + \`installed\`; every required check \`machine_verified\`; record \`closure\`.`,
  'start-ticket': `${INTEGRATION_MARKER} Law skill built/changed: apply each \`skills/*-law\`; \`gate\`; \`attest\`; v2 \`dev\` + \`installed\`; every required check \`machine_verified\`; record \`closure\`.`,
  'review-ticket': `${INTEGRATION_MARKER} Law skill built/changed: regenerate manifest; \`gate\`; \`attest\`; re-run v2 \`dev\` + \`installed\`; every required check \`machine_verified\`; compare \`closure\`.`,
  'resolve-ticket': `${INTEGRATION_MARKER} Law skill built/changed: repair \`gate\` findings; fill \`attest\`; no status change; v2 \`dev\` + \`installed\`; every required check \`machine_verified\`; record \`closure\`.`,
});

export const LAW_SECTION_PATTERNS = Object.freeze({
  claude: /^### Rust interface law \(conditional\)$/,
  'make-ticket': /^### .*Rust interface law/,
  'plan-ticket': /^### .*Rust interface law/,
  'start-ticket': /^### .*Rust interface law/,
  'review-ticket': /^### .*Rust interface law/,
  'resolve-ticket': /^### .*Rust interface law/,
});

export const FILE_KEYS = Object.freeze(['claude', ...PIPELINE_COMMANDS]);

/**
 * Find the law section that owns the integration line.
 *
 * The end is the next level-2 or level-3 heading: the marker must stay inside
 * the section that explains the law step, never in an unrelated appendix.
 *
 * @param {string[]} lines
 * @param {RegExp} pattern
 * @returns {{start:number,end:number}|null}
 */
export function findLawSection(lines, pattern) {
  const start = lines.findIndex((line) => pattern.test(line.trim()));
  if (start < 0) return null;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^#{2,3}\s/.test(lines[index])) return { start, end: index };
  }
  return { start, end: lines.length };
}

/**
 * Marker line indexes inside a law section.
 *
 * @param {string[]} lines
 * @param {{start:number,end:number}} section
 * @returns {number[]}
 */
export function checkpointIndexes(lines, section) {
  const indexes = [];
  for (let index = section.start + 1; index < section.end; index += 1) {
    if (lines[index].trimStart().startsWith(INTEGRATION_MARKER)) indexes.push(index);
  }
  return indexes;
}

/**
 * Marker line indexes anywhere outside the law section.
 *
 * @param {string[]} lines
 * @param {{start:number,end:number}} section
 * @returns {number[]}
 */
export function outsideCheckpointIndexes(lines, section) {
  const indexes = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trimStart().startsWith(INTEGRATION_MARKER)
      && (index <= section.start || index >= section.end)) {
      indexes.push(index);
    }
  }
  return indexes;
}

/**
 * The first content line after the heading, ignoring blank lines.
 *
 * @param {string[]} lines
 * @param {{start:number,end:number}} section
 * @returns {number}
 */
export function anchorIndex(lines, section) {
  for (let index = section.start + 1; index < section.end; index += 1) {
    if (lines[index].trim() !== '') return index;
  }
  return section.end;
}

/**
 * Whether a line is the exact canonical line and fits the boundary.
 *
 * @param {string} line
 * @returns {boolean}
 */
export function isValidCheckpointLine(line) {
  if (line.length > MAX_CHECKPOINT_LENGTH) return false;
  if (!line.startsWith(INTEGRATION_MARKER)) return false;
  if (/--(?:root|source-root|path-alias)/.test(line)) return false;
  return ['dev', 'installed', 'machine_verified', 'closure'].every((term) => line.includes(term));
}

export function canonicalLineFor(key) {
  return CANONICAL_LINES[key] ?? null;
}

export function normalizeHostText(text) {
  return normalizeLf(text);
}
