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

// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function renderCandidate(candidate) {
  const patch = candidate.evidence.patch;
  const backtickRuns = String(patch).match(/`+/g) || [];
  const longestRun = backtickRuns.reduce((longest, run) => Math.max(longest, run.length), 0);
  const fence = '`'.repeat(Math.max(3, longestRun + 1));
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

module.exports = {
  renderMarkdown,
  rankImpact,
  compareCandidates,
};
