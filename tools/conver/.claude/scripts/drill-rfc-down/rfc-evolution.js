#!/usr/bin/env node
/**
 * rfc-evolution.js <mode> <rfc-path> — /drill-rfc-down evolution safety guard
 *
 * Guards the RFC append-only contract and extracts the evolution delta so
 * Steps 2-4 can reflect the change mechanically.
 *
 * Modes:
 *   capture <rfc-path>   - Snapshot the RFC (sha256 + line count + lines) to
 *                          <rfcDir>/drills/baseline.json (deterministic path).
 *   verify  <rfc-path>   - Read the baseline, verify the append-only ordered-
 *                          subsequence gate, extract the delta into
 *                          <rfcDir>/drills/delta.json, and report well-formedness
 *                          violations + contradiction candidates. Exit 1 on any
 *                          violation. Contradiction sources are resolved from
 *                          ./Tickets.json in the cwd (not checked if absent).
 *   clean   <rfc-path>   - Remove the baseline.json snapshot.
 *
 * Exit codes: 0 = success, 1 = failure/violation.
 *
 * Design context: tools/conver/README.md — 進化ループ / /drill-rfc-down (Step 1-2/1-11/1-12).
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import preflight from './preflight.cjs';

const SESSION_DIR_NAME = 'drills';
const BASELINE_FILE = 'baseline.json';
const DELTA_FILE = 'delta.json';
const TICKETS_FILENAME = 'Tickets.json';

const TBD_PATTERN = /\bTBD\b|\bTODO\b|\bFIXME\b|\bHACK\b|\bXXX\b/i;
const IO_STUB_PATTERN = /\[::IO-INFO-STUB::\]/;
const HEADING_PATTERN = /^#{1,6}\s+/;
const IO_BOUNDARY_PATTERN = /graphify-rfc \+ boundify-graph|I\/O 境界|I\/O boundary/i;
const TOKEN_PATTERN = /[a-zA-Z0-9_]{4,}/g;

/** Derive the session directory from the RFC path (deterministic). */
// [::TICKET::] PX-158, PX-159 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-158|PX-159) --for-spec --no-implementation-order`.
function resolveSessionDir(rfcPath) {
  const rfcDir = path.dirname(path.resolve(rfcPath));
  return { rfcDir, sessionDir: path.join(rfcDir, SESSION_DIR_NAME) };
}

/** Snapshot the RFC content into baseline.json under the session directory. */
// [::TICKET::] PX-158, PX-159 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-158|PX-159) --for-spec --no-implementation-order`.
function captureSnapshot(rfcPath) {
  const { sessionDir } = resolveSessionDir(rfcPath);
  fs.mkdirSync(sessionDir, { recursive: true });
  const content = fs.readFileSync(rfcPath, 'utf8');
  const snapshot = {
    hash: crypto.createHash('sha256').update(content).digest('hex'),
    lineCount: content.split('\n').length,
    lines: content.split('\n'),
    capturedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(sessionDir, BASELINE_FILE), JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
  return snapshot;
}

/**
 * Greedy ordered-subsequence alignment between baseline and current lines.
 * Returns the added line ranges (current lines not matched) and the baseline
 * lines that could not be matched (deleted/modified/reordered).
 */
// [::TICKET::] PX-158, PX-159 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-158|PX-159) --for-spec --no-implementation-order`.
function alignLines(baselineLines, currentLines) {
  const addedRanges = [];
  const missingBaseline = [];
  let i = 0;
  let rangeStart = -1;
  for (let j = 0; j < currentLines.length; j++) {
    if (i < baselineLines.length && currentLines[j] === baselineLines[i]) {
      if (rangeStart !== -1) {
        addedRanges.push([rangeStart, j]);
        rangeStart = -1;
      }
      i++;
    } else if (rangeStart === -1) {
      rangeStart = j;
    }
  }
  if (rangeStart !== -1) addedRanges.push([rangeStart, currentLines.length]);
  for (let k = i; k < baselineLines.length; k++) missingBaseline.push(baselineLines[k]);
  return { addedRanges, missingBaseline };
}

/** Append-only gate: baseline must form an ordered subsequence of current lines. */
// [::TICKET::] PX-158, PX-159 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-158|PX-159) --for-spec --no-implementation-order`.
function verifyAppendOnly(baselineLines, currentLines) {
  const { missingBaseline } = alignLines(baselineLines, currentLines);
  return { ok: missingBaseline.length === 0, missingBaseline };
}

/** Group the added line ranges into sections at markdown heading boundaries. */
// [::TICKET::] PX-158, PX-159 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-158|PX-159) --for-spec --no-implementation-order`.
function extractDelta(baselineLines, currentLines) {
  const { addedRanges } = alignLines(baselineLines, currentLines);
  const sections = [];
  for (const [start, end] of addedRanges) {
    let currentSection = null;
    for (let j = start; j < end; j++) {
      const line = currentLines[j];
      if (HEADING_PATTERN.test(line)) {
        if (currentSection) sections.push(currentSection);
        currentSection = { heading: line.trim(), startLine: j + 1, lines: [line] };
      } else if (currentSection) {
        currentSection.lines.push(line);
      } else {
        currentSection = { heading: null, startLine: j + 1, lines: [line] };
      }
    }
    if (currentSection) sections.push(currentSection);
  }
  const addedLineCount = addedRanges.reduce((acc, [s, e]) => acc + (e - s), 0);
  return { sections, addedLineCount };
}

/** Well-formedness gate for the extracted delta and the whole RFC. */
// [::TICKET::] PX-158, PX-159 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-158|PX-159) --for-spec --no-implementation-order`.
function validateWellFormed(delta, currentContent) {
  const violations = [];
  const addedText = delta.sections.flatMap((s) => s.lines).join('\n');
  if (TBD_PATTERN.test(addedText)) violations.push('Forbidden TBD marker found in added content');
  if (IO_STUB_PATTERN.test(currentContent)) violations.push('Remaining [::IO-INFO-STUB::] marker in RFC');
  if (delta.addedLineCount === 0) violations.push('No evolution delta detected (RFC unchanged)');
  if (delta.addedLineCount > 0 && !IO_BOUNDARY_PATTERN.test(addedText)) {
    violations.push('Added content lacks I/O boundary reference info');
  }
  return violations;
}

/** Tokenize a string into significant (length >= 4) lowercase tokens. */
// [::TICKET::] PX-158, PX-159 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-158|PX-159) --for-spec --no-implementation-order`.
function tokenize(text) {
  return new Set((String(text).toLowerCase().match(TOKEN_PATTERN) || []));
}

/**
 * Detect candidate contradictions between new section headings and existing
 * GRAPH nodes, Dirs-Tree names, and ticket titles (deterministic token overlap;
 * the AI makes the final judgment).
 */
// [::TICKET::] PX-158, PX-159 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-158|PX-159) --for-spec --no-implementation-order`.
function detectContradictionCandidates(delta, graph, dirsTree, tickets) {
  const candidates = [];
  for (const section of delta.sections) {
    if (!section.heading) continue;
    const sectionTokens = tokenize(section.heading);
    if (graph && Array.isArray(graph.nodes)) {
      for (const node of graph.nodes) {
        const titleTokens = tokenize(`${node.title} ${node.summary || ''} ${node.slug || ''}`);
        const overlap = [...sectionTokens].filter((t) => titleTokens.has(t));
        if (overlap.length > 0) candidates.push({ kind: 'graph', target: node.id, context: node.title, matchedBy: overlap.slice(0, 5) });
      }
    }
    if (dirsTree && Array.isArray(dirsTree.trees)) {
      for (const tree of dirsTree.trees) {
        const nameTokens = tokenize(tree.name || '');
        const overlap = [...sectionTokens].filter((t) => nameTokens.has(t));
        if (overlap.length > 0) candidates.push({ kind: 'dirsTree', target: tree.name, context: tree.name, matchedBy: overlap.slice(0, 5) });
      }
    }
    if (tickets && Array.isArray(tickets.phases)) {
      for (const phase of tickets.phases) {
        for (const ticket of phase.tickets || []) {
          const titleTokens = tokenize(ticket.title || '');
          const overlap = [...sectionTokens].filter((t) => titleTokens.has(t));
          if (overlap.length > 0) candidates.push({ kind: 'ticket', target: ticket.id, context: ticket.title, matchedBy: overlap.slice(0, 5) });
        }
      }
    }
  }
  return candidates;
}

/**
 * Resolve contradiction sources (Tickets.json -> GRAPH / Dirs-Tree) from the
 * given cwd. Returns nulls when Tickets.json is absent or unresolvable.
 */
// [::TICKET::] PX-158, PX-159 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-158|PX-159) --for-spec --no-implementation-order`.
function loadContradictionSources(cwd) {
  const ticketsPath = path.join(path.resolve(cwd), TICKETS_FILENAME);
  if (!fs.existsSync(ticketsPath)) return { tickets: null, graph: null, dirsTree: null };
  let tickets;
  try {
    tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  } catch {
    return { tickets: null, graph: null, dirsTree: null };
  }
  const ticketsDir = path.dirname(ticketsPath);
  const { graphPath, dirsTreePath } = preflight.resolvePipelinePaths(tickets, ticketsDir);
  let graph = null;
  let dirsTree = null;
  if (graphPath && fs.existsSync(graphPath)) {
    try { graph = JSON.parse(fs.readFileSync(graphPath, 'utf8')); } catch { /* keep null */ }
  }
  if (dirsTreePath && fs.existsSync(dirsTreePath)) {
    try { dirsTree = JSON.parse(fs.readFileSync(dirsTreePath, 'utf8')); } catch { /* keep null */ }
  }
  return { tickets, graph, dirsTree };
}

/** Recursively collect resolved DesignTree nodes. */
// [::TICKET::] PX-158 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-158 --for-spec --no-implementation-order`.
function collectResolved(nodes, acc) {
  for (const node of nodes || []) {
    if (node.status === 'resolved') acc.push({ id: node.id, title: node.title });
    collectResolved(node.children, acc);
  }
  return acc;
}

/**
 * Load the resolved DesignTree nodes from the session directory as an
 * omission-check aid for the AI expert judgment. Returns null when the tree
 * is absent or unreadable.
 */
// [::TICKET::] PX-158 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-158 --for-spec --no-implementation-order`.
function loadResolvedDesignTreeNodes(sessionDir) {
  const treePath = path.join(sessionDir, 'DesignTree.json');
  if (!fs.existsSync(treePath)) return null;
  try {
    const tree = JSON.parse(fs.readFileSync(treePath, 'utf8'));
    return collectResolved(tree.nodes || [], []);
  } catch {
    return null;
  }
}

/**
 * Format the verification report as Markdown.
 *
 * The report is an AI-judgment aid: it surfaces the full added delta content,
 * the DesignTree resolved nodes (omission check), and the contradiction-match
 * context. It does NOT decide danger/omission/contradiction/deficiency — the
 * AI engineering-expert makes that non-deterministic judgment.
 */
// [::TICKET::] PX-158, PX-159 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-158|PX-159) --for-spec --no-implementation-order`.
function formatDeltaReport({ appendOnly, delta, violations, contradiction, resolvedNodes }) {
  const lines = [
    '## /drill-rfc-down Evolution Verification',
    '',
    `- Append-only: ${appendOnly ? '✅' : '❌'}`,
    `- Added lines: ${delta.addedLineCount}`,
    '',
  ];
  if (violations.length > 0) {
    lines.push('### Violations');
    for (const violation of violations) lines.push(`- ❌ ${violation}`);
    lines.push('');
  }
  lines.push('### Evolution delta sections (AI judgment aid: full added content)');
  if (delta.sections.length === 0) {
    lines.push('- (none)');
  } else {
    for (const section of delta.sections) {
      lines.push(`- **${section.heading || '(preamble)'}** (line ${section.startLine})`);
      for (const line of section.lines) lines.push(`  ${line}`);
    }
  }
  lines.push('');
  if (resolvedNodes !== null) {
    lines.push('### DesignTree resolved nodes (omission-check aid)');
    if (resolvedNodes.length === 0) {
      lines.push('- (none)');
    } else {
      for (const node of resolvedNodes) lines.push(`- ${node.id}: ${node.title}`);
    }
    lines.push('');
  }
  if (contradiction.checked) {
    lines.push('### Contradiction candidates');
    if (contradiction.candidates.length === 0) {
      lines.push('- none');
    } else {
      for (const candidate of contradiction.candidates) {
        const context = candidate.context ? ` "${candidate.context}"` : '';
        lines.push(`- ${candidate.kind} ${candidate.target}${context} matched by: ${candidate.matchedBy.join(', ')}`);
      }
    }
  } else {
    lines.push('Contradiction detection: not checked (no Tickets.json resolved in cwd).');
  }
  return lines.join('\n');
}

// [::TICKET::] PX-158, PX-159 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-158|PX-159) --for-spec --no-implementation-order`.
function main() {
  const [,, mode, rfcPath] = process.argv;
  if (!mode || !rfcPath) {
    console.error('Usage: rfc-evolution.js <capture|verify|clean> <rfc-path>');
    process.exit(1);
  }
  const resolvedRfcPath = path.resolve(rfcPath);
  if (!fs.existsSync(resolvedRfcPath)) {
    console.error(`[ERROR] rfc-evolution: RFC not found: ${resolvedRfcPath}`);
    process.exit(1);
  }
  const { sessionDir } = resolveSessionDir(resolvedRfcPath);
  const baselinePath = path.join(sessionDir, BASELINE_FILE);

  if (mode === 'capture') {
    captureSnapshot(resolvedRfcPath);
    process.stdout.write(JSON.stringify({ ok: true, mode: 'capture', baselinePath }) + '\n');
    process.exit(0);
  }

  if (mode === 'clean') {
    if (fs.existsSync(baselinePath)) fs.rmSync(baselinePath);
    process.stdout.write(JSON.stringify({ ok: true, mode: 'clean' }) + '\n');
    process.exit(0);
  }

  if (mode === 'verify') {
    if (!fs.existsSync(baselinePath)) {
      console.error('[ERROR] rfc-evolution: baseline.json not found. Run capture first.');
      process.exit(1);
    }
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    const currentContent = fs.readFileSync(resolvedRfcPath, 'utf8');
    const currentLines = currentContent.split('\n');

    const appendOnly = verifyAppendOnly(baseline.lines, currentLines);
    const delta = extractDelta(baseline.lines, currentLines);
    const wellFormedViolations = appendOnly.ok ? validateWellFormed(delta, currentContent) : [];

    const { tickets, graph, dirsTree } = loadContradictionSources(process.cwd());
    const contradictionChecked = tickets !== null;
    const candidates = contradictionChecked ? detectContradictionCandidates(delta, graph, dirsTree, tickets) : [];
    const resolvedNodes = loadResolvedDesignTreeNodes(sessionDir);

    const violations = appendOnly.ok
      ? wellFormedViolations
      : ['Append-only violation: baseline lines were deleted, modified, or reordered.'];

    const report = formatDeltaReport({
      appendOnly: appendOnly.ok,
      delta,
      violations,
      contradiction: { checked: contradictionChecked, candidates },
      resolvedNodes,
    });

    if (appendOnly.ok && violations.length === 0) {
      fs.writeFileSync(path.join(sessionDir, DELTA_FILE), JSON.stringify({
        sourceFile: resolvedRfcPath,
        generatedAt: new Date().toISOString(),
        appendOnly: true,
        sections: delta.sections,
        addedLineCount: delta.addedLineCount,
        contradictionCandidates: candidates,
      }, null, 2) + '\n', 'utf8');
      process.stdout.write(report + '\n');
      process.exit(0);
    }

    process.stdout.write(report + '\n');
    process.exit(1);
  }

  console.error(`Unknown mode: ${mode}`);
  process.exit(1);
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main();
}

export {
  resolveSessionDir,
  captureSnapshot,
  alignLines,
  verifyAppendOnly,
  extractDelta,
  validateWellFormed,
  detectContradictionCandidates,
  loadContradictionSources,
  collectResolved,
  loadResolvedDesignTreeNodes,
  formatDeltaReport,
  main,
};
