'use strict';

/**
 * render.js — Markdown is a pure function of the JSON ledger.
 *
 * The JSON keeps every candidate. The Markdown view caps the visible list and
 * states the remainder, so a long ledger never hides records from the machine
 * view and never pretends the displayed list is complete.
 */

const criteria = require('./criteria.js');

const IMPACT_RANK = Object.freeze({ high: 0, medium: 1, low: 2 });
const UNKNOWN_IMPACT_RANK = 3;

// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function rankImpact(impact) {
  return Object.hasOwn(IMPACT_RANK, impact) ? IMPACT_RANK[impact] : UNKNOWN_IMPACT_RANK;
}

// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function compareCandidates(left, right) {
  const byImpact = rankImpact(left.impact) - rankImpact(right.impact);
  if (byImpact !== 0) return byImpact;
  return String(left.id).localeCompare(String(right.id));
}

/** Count candidates per primary criterion, sorted by name for deterministic output. */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function summarize(candidates) {
  const counts = new Map();
  for (const candidate of candidates) {
    const key = candidate.primaryCriterion;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => left[0].localeCompare(right[0]));
}

/** A fence longer than any backtick run in the text, so content cannot close it. */
// [::TICKET::] PX-458 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-458 --for-spec --no-implementation-order`.
function fenceFor(text) {
  const runs = String(text).match(/`+/g) || [];
  const longestRun = runs.reduce((longest, run) => Math.max(longest, run.length), 0);
  return '`'.repeat(Math.max(3, longestRun + 1));
}

// [::TICKET::] PX-457, PX-458 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-457|PX-458) --for-spec --no-implementation-order`.
function renderCandidate(candidate) {
  const patch = candidate.evidence.patch;
  const fence = fenceFor(patch);
  return [
    `### ${candidate.id} — ${candidate.primaryCriterion} — ${candidate.location.file}:${candidate.location.lineStart}`,
    '',
    `- Status: ${candidate.status}`,
    `- Generalization: ${candidate.generalization}`,
    `- Impact: ${candidate.impact} / Confidence: ${candidate.confidence} / Risk: ${candidate.riskLevel}`,
    `- Symptom: ${candidate.symptom}`,
    `- Remedy: ${candidate.remedy}`,
    `- Generality: ${candidate.scope}`,
    `- Risk: ${candidate.risk}`,
    `- Verification: ${candidate.verification}`,
    ...(candidate.note ? [`- Note: ${candidate.note}`] : []),
    '',
    '#### Patch',
    '',
    `${fence}diff`,
    patch,
    fence,
    '',
  ];
}

/**
 * Render the Markdown sidecar.
 *
 * @param {object} ledger
 * @returns {string}
 */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function renderMarkdown(ledger) {
  const candidates = Array.isArray(ledger.candidates) ? ledger.candidates : [];
  const sorted = [...candidates].sort(compareCandidates);
  const shown = sorted.slice(0, criteria.DISPLAY_LIMIT);
  const remainder = sorted.length - shown.length;

  const lines = [
    '# conver update candidates',
    '',
    'Generated from CONVER-UPDATE-CANDIDATES.json. Do not edit by hand.',
    '',
    `- schemaVersion: ${ledger.schemaVersion}`,
    `- criteriaVersion: ${ledger.criteriaVersion}`,
    `- workspace: ${ledger.workspace}`,
    `- claudeDir: ${ledger.claudeDir}`,
    `- upstreamRef: ${ledger.upstreamRef}`,
    '',
    '## Summary',
    '',
    '| criterion | count |',
    '|---|---|',
    ...summarize(candidates).map(([criterion, count]) => `| ${criterion} | ${count} |`),
    '',
    '## Candidates',
    '',
  ];

  for (const candidate of shown) {
    lines.push(...renderCandidate(candidate));
  }

  if (remainder > 0) {
    lines.push(`- …and ${remainder} more candidates`, '');
  }

  return lines.join('\n') + '\n';
}

/**
 * Render the candidate contract as Markdown.
 *
 * @param {object} description — schema.describeSchema()
 * @returns {string}
 */
// [::TICKET::] PX-458 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-458 --for-spec --no-implementation-order`.
function renderSchemaMarkdown(description) {
  const lines = [
    `# candidate schema — criteriaVersion ${description.criteriaVersion}`,
    '',
    `schemaVersion: ${description.schemaVersion}`,
    '',
    '## Gates',
    ...description.gates.map((gate) => `- ${gate.id}: ${gate.rule}`),
    '',
    '## Exclusions',
    ...description.exclusions.map((exclusion) => `- ${exclusion.id}: ${exclusion.rule}`),
    '',
    '## Value categories',
    ...description.categories.map((category) => `- ${category}`),
    '',
    '## Candidate fields',
    `- required: ${description.required.join(', ')}`,
    `- location: ${description.locationRequired.join(', ')}`,
    `- evidence: ${description.evidenceRequired.join(', ')}`,
    `- computed by create (do not supply): ${description.computed.join(', ')}`,
    `- update whitelist: ${description.updateWhitelist.join(', ')}`,
    '',
    '## Enums',
    ...Object.entries(description.enums).map(([field, values]) => `- ${field}: ${values.join(' | ')}`),
    '',
  ];
  return lines.join('\n') + '\n';
}

module.exports = {
  renderMarkdown,
  renderSchemaMarkdown,
  fenceFor,
  rankImpact,
  compareCandidates,
};
