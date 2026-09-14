#!/usr/bin/env node
/**
 * advisory-report.js — Shared four-axis advisory report builder (PX-166)
 *
 * /drill-rfc-down Step 2/3/4 inspection layer: the analyzers mechanically detect
 * 危険 (danger) / 漏れ (omission) / 矛盾 (contradiction) / 不足 (deficiency)
 * during the design phase and render the findings as a kind English advisory so
 * the AI, as the engineering expert, can resolve them before --approve.
 *
 * The advisory is INFORMATION ONLY — it never blocks promote. The promote gates
 * (verify.js / validate-dirs-tree-schema / validate-tickets) are unchanged.
 *
 * API:
 *   emptyAdvisory() -> { danger: [], omission: [], contradiction: [], deficiency: [] }
 *   buildAdvisoryReport(findings) -> Markdown string with the four axis sections
 *
 * Design context: tools/conver/README.md — 進化ループ / /drill-rfc-down (Step 2-4).
 */

/** The four advisory axes, in display order. */
const AXES = ['danger', 'omission', 'contradiction', 'deficiency'];

/** A fresh advisory with four empty axes. */
// [::TICKET::] PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function emptyAdvisory() {
  return { danger: [], omission: [], contradiction: [], deficiency: [] };
}

/** Capitalize the first letter of an axis name for a section header. */
// [::TICKET::] PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function axisHeader(axis) {
  return axis.charAt(0).toUpperCase() + axis.slice(1);
}

/**
 * Render findings as a Markdown advisory report. Each finding is an object with
 * a natural-language English `message`. An empty axis renders 'none'.
 * Deterministic: identical findings yield byte-identical output.
 */
// [::TICKET::] PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function buildAdvisoryReport(findings) {
  const lines = ['## Advisory Report', ''];
  for (const axis of AXES) {
    lines.push(`### ${axisHeader(axis)}`);
    const items = findings[axis] || [];
    if (items.length === 0) {
      lines.push('- none');
    } else {
      for (const item of items) lines.push(`- ${item.message}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export { AXES, emptyAdvisory, buildAdvisoryReport };
