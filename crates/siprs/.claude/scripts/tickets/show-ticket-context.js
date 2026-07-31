#!/usr/bin/env node

/**
 * show-ticket-context.js — make-ticket Step 1
 *
 * Investigates the state of the ticket specified by --ticket-key and outputs
 * to stdout in AI-readable Markdown format. The output includes all Ticket.json
 * fields and can serve as a spec document.
 *
 * With --for-spec flag, outputs in a format suitable for writing to a spec file
 * (omits IMPORTANT banner / Pipeline Context, prepends Implementation Order).
 *
 * CLI: show-ticket-context.js --ticket-key=<P{id}-{id}|PX-{id}>
 *       [--tickets=<Tickets.json>] [--for-spec]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { resolveTicketSpecPath } = require('../lib/tickets');
const { fromHomeRelative } = require('../lib/path-utils');

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

/**
 * Short labels for the ABC Inspection Pipeline criteria.
 * The full criteria definitions appear in the [::INSPECTION_FLAGGED::]
 * background block that add-omission-ticket.js prepends to flagged tickets.
 */
const ABC_CRITERION_LABELS = {
  A: 'Contract Translation',
  B: 'Violation Detection',
  C: 'Test Precision',
};

/** Parse command line arguments */
function parseArgs(testArgs) {
  const args = testArgs || process.argv.slice(2);
  let ticketsPath = '';
  let ticketKey = '';
  let forSpec = false;
  let noImplementationOrder = false;
  let plan = false;
  let review = false;
  for (const arg of args) {
    if (arg.startsWith('--tickets=')) {
      ticketsPath = arg.slice('--tickets='.length);
    } else if (arg.startsWith('--ticket-key=')) {
      ticketKey = arg.slice('--ticket-key='.length);
    } else if (arg === '--for-spec') {
      forSpec = true;
    } else if (arg === '--no-implementation-order') {
      noImplementationOrder = true;
    } else if (arg === '--plan') {
      plan = true;
    } else if (arg === '--review') {
      review = true;
    }
  }
  if (!ticketsPath) {
    ticketsPath = path.resolve('Tickets.json');
  } else {
    ticketsPath = path.resolve(ticketsPath);
  }
  return { ticketsPath, ticketKey, forSpec, noImplementationOrder, plan, review };
}

/** Validate that ticketKey matches P{phaseId}-{ticketId} or PX-{id} format */
function isValidTicketKey(ticketKey) {
  return /^P([Xx]|-?\d+)-(\d+)$/.test(ticketKey);
}

/** Parse ticketKey into phaseId / ticketId */
function parseTicketKey(ticketKey) {
  const pxMatch = ticketKey.match(/^PX-(\d+)$/i);
  if (pxMatch) {
    return { phaseId: -1, ticketId: parseInt(pxMatch[1], 10) };
  }
  const pMatch = ticketKey.match(/^P(-?\d+)-(\d+)$/);
  if (pMatch) {
    return { phaseId: parseInt(pMatch[1], 10), ticketId: parseInt(pMatch[2], 10) };
  }
  return null;
}

/** Find the matching ticket in Tickets.json */
function findTicket(tickets, parsed) {
  if (!parsed) return null;
  const phases = tickets.phases || [];
  for (const phase of phases) {
    if (phase.id !== parsed.phaseId && phase.phaseId !== parsed.phaseId) continue;
    return (phase.tickets || []).find(t => t.id === parsed.ticketId) || null;
  }
  return null;
}

/**
 * Resolves RFC / Graph / Dirs-Tree paths from Tickets.json metadata
 * (same logic as resolveRfcPaths in resolve-ticket-context.js)
 */
function resolveRfcPaths(rawSource, ticketsDir, resolvedPaths) {
  if (resolvedPaths && resolvedPaths.rfcPath && resolvedPaths.graphPath && resolvedPaths.dirsTreePath) {
    const rfcPath = path.resolve(ticketsDir, fromHomeRelative(resolvedPaths.rfcPath));
    const graphPath = path.resolve(ticketsDir, fromHomeRelative(resolvedPaths.graphPath));
    const dirsTreePath = path.resolve(ticketsDir, fromHomeRelative(resolvedPaths.dirsTreePath));
    if (fs.existsSync(rfcPath) && fs.existsSync(graphPath) && fs.existsSync(dirsTreePath)) {
      return { rfcPath, graphPath, dirsTreePath, rfcPathSource: 'resolvedPaths' };
    }
  }
  if (!rawSource) {
    return { rfcPath: '', graphPath: '', dirsTreePath: '', rfcPathSource: 'none' };
  }
  const resolved = path.resolve(ticketsDir, rawSource);
  if (!fs.existsSync(resolved)) {
    return { rfcPath: '', graphPath: '', dirsTreePath: '', rfcPathSource: 'not_found' };
  }
  const ext = path.extname(resolved).toLowerCase();
  if (ext === '.md') {
    const dir = path.dirname(resolved);
    const basename = path.basename(resolved, '.md');
    return {
      rfcPath: resolved,
      graphPath: path.join(dir, `${basename}-GRAPH.json`),
      dirsTreePath: path.join(dir, `${basename}-Dirs-Tree.json`),
      rfcPathSource: 'metadata.source.md',
    };
  }
  if (ext === '.json') {
    const dir = path.dirname(resolved);
    const basename = path.basename(resolved, '.json');
    const rfcBasename = basename.endsWith('-GRAPH') ? basename.slice(0, -6) : basename;
    return {
      rfcPath: path.join(dir, `${rfcBasename}.md`),
      graphPath: resolved,
      dirsTreePath: path.join(dir, `${rfcBasename}-Dirs-Tree.json`),
      rfcPathSource: 'metadata.source.json',
    };
  }
  return { rfcPath: '', graphPath: '', dirsTreePath: '', rfcPathSource: 'unknown' };
}

/**
 * Convert an absolute path to its shortest readable display form.
 *
 * Priority:
 *   1. If the path passes through a real `src` directory, keep only the part
 *      from `src` onwards (e.g. .../crates/siprs/src/runtime/command.rs
 *      → src/runtime/command.rs).
 *   2. If the path lives inside `base` (the tickets directory), use the
 *      relative form.
 *   3. If the path lives under the user's home directory, prefix it with `~`.
 *   4. Otherwise keep the absolute path unchanged.
 */
function makeRelative(absPath, base) {
  try {
    const fromSrc = keepFromSrcDir(absPath);
    if (fromSrc !== null) return fromSrc;

    const rel = path.relative(base, absPath);
    if (!rel.startsWith('..')) return rel;

    const fromHome = replaceHomeWithTilde(absPath);
    if (fromHome !== null) return fromHome;

    return absPath;
  } catch {
    return absPath;
  }
}

/**
 * Return absPath shortened to start at its `src` directory segment, or null
 * when absPath has no `src` directory that actually exists on disk.
 */
function keepFromSrcDir(absPath) {
  const segments = absPath.split(path.sep);
  const srcIndex = segments.indexOf('src');
  if (srcIndex === -1) return null;
  const srcDirPath = segments.slice(0, srcIndex + 1).join(path.sep) || path.sep;
  try {
    if (fs.statSync(srcDirPath).isDirectory()) {
      return segments.slice(srcIndex).join(path.sep);
    }
  } catch {
    // not a real src directory on disk — fall through to the other rules
  }
  return null;
}

/**
 * Return absPath with its home-directory prefix replaced by `~`, or null when
 * absPath is not inside the user's home directory.
 */
function replaceHomeWithTilde(absPath) {
  const home = os.homedir();
  if (absPath === home) return '~';
  if (absPath.startsWith(home + path.sep)) {
    return '~' + absPath.slice(home.length);
  }
  return null;
}

/**
 * Format a single targetStub as a detailed markdown block.
 * targetStubs are [::STUB::] markers that this ticket must fully implement.
 */
function formatTargetStub(stub, ticketsDir) {
  const location = makeRelative(stub.file, ticketsDir);
  const status = stub.status || 'unknown';
  const detailLines = ['### ' + (stub.id || '?') + ' — `' + location + ' — ' + status, ''];
  if (stub.markerText) detailLines.push('- **Marker**: `' + stub.markerText + '`');
  if (stub.contracts && stub.contracts.length > 0) detailLines.push('- **Contracts**: ' + stub.contracts.join(', '));
  if (stub.resolutionPlan) detailLines.push('- **Resolution Plan**: ' + stub.resolutionPlan);
  detailLines.push('');
  return detailLines.join('\n');
}

/** Build a "field: count" summary string (e.g. status or severity breakdown) */
function summarizeByField(items, field) {
  const counts = {};
  for (const item of items) {
    const value = item[field] || 'unknown';
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.entries(counts).map(function (e) { return e[0] + ': ' + e[1]; }).join(', ');
}

/**
 * Format a single foundOmission as a detailed markdown block.
 * Each omission carries a severity, a fix recommendation, and evaluations
 * (criterion / passed / reason) backed by code evidence.
 */
function formatFoundOmission(omission, index) {
  const id = 'O-' + String(index + 1).padStart(3, '0');
  const severity = omission.severity || 'unknown';
  const detailLines = ['### ' + id + ' — ' + severity, ''];
  if (omission.recommendation) detailLines.push('- **Recommendation**: ' + omission.recommendation);
  for (const evaluation of (Array.isArray(omission.evaluations) ? omission.evaluations : [])) {
    const status = evaluation.passed ? 'PASSED' : 'FAILED';
    const criterion = evaluation.criterion || '?';
    const label = ABC_CRITERION_LABELS[evaluation.criterion] ? ' (' + ABC_CRITERION_LABELS[evaluation.criterion] + ')' : '';
    detailLines.push('- **Evaluation ' + criterion + label + ' — ' + status + '**: ' + (evaluation.reason || '(no reason)'));
    for (const item of (Array.isArray(evaluation.evidence) ? evaluation.evidence : [])) {
      detailLines.push('');
      detailLines.push('Evidence (`' + item.file + '`):');
      detailLines.push('```');
      detailLines.push(item.codes || '');
      detailLines.push('```');
    }
  }
  detailLines.push('');
  return detailLines.join('\n');
}

/**
 * Format a single targetCrime as a detailed markdown block.
 * targetCrimes are unresolved crimes (orphan/stale STUB references) that this
 * ticket must resolve 100%.
 */
function formatTargetCrime(crime, ticketsDir) {
  const location = makeRelative(crime.file, ticketsDir);
  const status = crime.status || 'unknown';
  const crimeType = crime.crimeType ? ' (' + crime.crimeType + ')' : '';
  const detailLines = ['### ' + (crime.id || '?') + ' — `' + location + ' — ' + status + crimeType, ''];
  if (crime.markerText) detailLines.push('- **Marker**: `' + crime.markerText + '`');
  if (crime.contracts && crime.contracts.length > 0) detailLines.push('- **Contracts**: ' + crime.contracts.join(', '));
  if (crime.note) detailLines.push('- **Note**: ' + crime.note);
  detailLines.push('');
  return detailLines.join('\n');
}

/**
 * Parse relatedTicketIds prose into an array of { relation, ticket, description }.
 *
 * Supported comma-separated entry formats:
 *   - "P0-1 (scope), P1-1 (concurrency)"                     — hand-written in Tickets.json
 *   - "P2-1 (depends on: purpose), P2-3 (related: events)"   — hand-written, keyword prefix
 *   - "[depends_on] P1-2 (Dependency: Error type ...)"       — generator format (backward compatible)
 *
 * An explicit [relation] tag wins; otherwise a leading "keyword:" in the
 * description becomes the relation. Entries are split on top-level commas so
 * commas inside (nested) parentheses never break an entry.
 */
function parseRelatedTicketIds(raw) {
  if (!raw) return [];
  const items = [];
  const seen = new Set();

  for (const entry of splitRelatedTicketEntries(raw)) {
    // Optional [relation] tag prefix, e.g. "[depends_on] P1-2 (...)"
    const tagMatch = entry.match(/^\[(\w+)\]\s*(.*)$/);
    const taggedRelation = tagMatch ? tagMatch[1] : '';
    const body = tagMatch ? tagMatch[2] : entry;

    // Ticket key with a required parenthesized description, e.g. "P0-1 (scope)".
    // Full-width and no-space parens are accepted, e.g. "P6-2(時間窓判定)".
    // Requiring the parens keeps prose fragments (e.g. a bare "P7-1" inside an
    // I/O flow note) from leaking into the table as empty rows.
    const bodyMatch = body.match(/^(\S+?)\s*[(（]([\s\S]*)[)）]$/);
    if (!bodyMatch) continue;

    const ticket = bodyMatch[1];
    const rawDescription = (bodyMatch[2] || '').trim();

    const { relation, description } = resolveRelation(taggedRelation, rawDescription);

    const key = `${ticket}|${relation}|${description}`;
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({ relation, ticket, description });
  }
  return items;
}

/** Split comma-separated entries, ignoring commas inside (nested) parentheses. */
function splitRelatedTicketEntries(raw) {
  const entries = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '(' || ch === '（') depth++;
    else if (ch === ')' || ch === '）') depth = Math.max(0, depth - 1);
    else if ((ch === ',' || ch === '，') && depth === 0) {
      entries.push(raw.slice(start, i));
      start = i + 1;
    }
  }
  entries.push(raw.slice(start));
  return entries.map((entry) => entry.trim()).filter(Boolean);
}

/**
 * Prefer an explicit [relation] tag; otherwise a leading "keyword:" in the
 * description (e.g. "depends on:", "related:", "前提:") becomes the relation
 * and the rest of the description is kept. Without a "keyword:" prefix the
 * whole parenthesized text is the relation (e.g. "P0-1 (scope)"), and the
 * description is resolved from the target ticket's title by the renderer.
 */
function resolveRelation(taggedRelation, rawDescription) {
  if (taggedRelation) {
    return { relation: taggedRelation, description: rawDescription };
  }
  const keywordMatch = rawDescription.match(/^([^:：]+?)\s*[:：]\s*([\s\S]*)$/);
  if (keywordMatch) {
    return { relation: keywordMatch[1].trim(), description: keywordMatch[2].trim() };
  }
  return { relation: rawDescription, description: '' };
}

/** Resolve a related ticket key (e.g. "P0-1") to its title in Tickets.json. */
function resolveRelatedTicketTitle(tickets, ticketKey) {
  const parsed = parseTicketKey(ticketKey);
  if (!parsed) return '';
  const target = findTicket(tickets, parsed);
  return target ? target.title || '' : '';
}

/** Load GRAPH.json and Dirs-Tree.json */
function loadGraphAndDirs(graphPath, dirsTreePath) {
  let graphNodes = [], graphEdges = [], dirsTree = null;
  try {
    if (graphPath && fs.existsSync(graphPath)) {
      const g = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
      graphNodes = g.nodes || [];
      graphEdges = g.edges || [];
    }
  } catch (e) { /* ignore */ }
  try {
    if (dirsTreePath && fs.existsSync(dirsTreePath)) {
      dirsTree = JSON.parse(fs.readFileSync(dirsTreePath, 'utf8'));
    }
  } catch (e) { /* ignore */ }
  return { graphNodes, graphEdges, dirsTree };
}

/** Generate Markdown for node details corresponding to ticketNodeIds */
function formatGraphNodeDetails(ticketNodeIds, graphNodes) {
  const lines = [];
  lines.push('### Related Nodes');
  lines.push('');
  lines.push('| Node ID | Kind | Language | Title |');
  lines.push('|----|------|----------|-------|');
  const nodeMap = {};
  for (const n of graphNodes) nodeMap[n.id] = n;
  for (const nodeId of ticketNodeIds) {
    const node = nodeMap[nodeId];
    if (node) {
      lines.push(`| \`${node.id}\` | ${node.kind || '-'} | ${node.language || '-'} | ${node.title || '-'} |`);
    } else {
      lines.push(`| \`${nodeId}\` | — | — | — |`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

/** Generate Markdown for edge relationships involving ticketNodeIds */
function formatGraphEdgeRelationships(ticketNodeIds, graphEdges, graphNodes) {
  const lines = [];
  const nodeMap = {};
  for (const n of graphNodes) nodeMap[n.id] = n;
  const edgeTypes = ['depends_on', 'precedes', 'triggers', 'constrains', 'conflicts_with',
    'refines', 'extends', 'implements', 'supersedes', 'references', 'part_of', 'validates'];
  const ticketSet = new Set(ticketNodeIds);
  // Extract edges involving only nodes within this ticket
  const relevantEdges = graphEdges.filter(e =>
    ticketSet.has(e.from) || ticketSet.has(e.to)
  );
  if (relevantEdges.length === 0) return '';
  lines.push('### Edge Relationships');
  lines.push('');
  lines.push('| Type | From | → | To |');
  lines.push('|------|------|----|-----|');
  for (const et of edgeTypes) {
    const edgesOfType = relevantEdges.filter(e => e.type === et);
    for (const e of edgesOfType) {
      const fromNode = nodeMap[e.from];
      const toNode = nodeMap[e.to];
      const fromLabel = fromNode ? fromNode.title : e.from;
      const toLabel = toNode ? toNode.title : e.to;
      const fromMarker = ticketSet.has(e.from) ? '★' : '☆';
      const toMarker = ticketSet.has(e.to) ? '★' : '☆';
      lines.push(`| ${et} | ${fromMarker} ${fromLabel} (${e.from}) | → | ${toMarker} ${toLabel} (${e.to}) |`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

/** Walk Dirs-Tree to find file paths mapped to ticketNodeIds */
function collectFilePathsForNodes(dirsTree, ticketNodeIds) {
  const result = [];
  const ticketSet = new Set(ticketNodeIds);
  function walk(node, prefix) {
    const currentPath = prefix ? prefix + '/' + node.name : node.name;
    if (node.type === 'file') {
      const mapped = (node.mappedNodeIds || []).filter(m => ticketSet.has(m.nodeId));
      for (const m of mapped) {
        result.push({ path: currentPath, nodeId: m.nodeId, title: m.title });
      }
    }
    if (node.children) {
      for (const c of node.children) walk(c, node.type === 'directory' ? currentPath : prefix);
    }
  }
  // Walk each language tree in the trees object
  const trees = (dirsTree && dirsTree.trees) || {};
  for (const lang of Object.keys(trees)) {
    walk(trees[lang], '');
  }
  return result;
}

/** Generate Markdown for file paths corresponding to ticketNodeIds */
function formatGraphFilePaths(ticketNodeIds, dirsTree) {
  const entries = collectFilePathsForNodes(dirsTree, ticketNodeIds);
  if (entries.length === 0) return '';
  const lines = [];
  lines.push('### Implementation Target File Paths');
  lines.push('');
  lines.push('| Node ID | File Path |');
  lines.push('|---------|-----------|');
  for (const e of entries) {
    lines.push(`| \`${e.nodeId}\` | \`${e.path}\` |`);
  }
  lines.push('');
  return lines.join('\n');
}

/** Generate Markdown when ticket is not found */
function buildTicketNotFoundMarkdown(ticketKey, plan, review) {
  if (plan) {
    return [
      `# ${ticketKey}: Not Found`,
      '',
      `Ticket \`${ticketKey}\` does not exist in Tickets.json.`,
      'Please abort /plan-ticket.',
      '',
    ].join('\n');
  }
  if (review) {
    return [
      `# ${ticketKey}: Not Found`,
      '',
      `Ticket \`${ticketKey}\` does not exist in Tickets.json.`,
      'Please abort /review-ticket.',
      '',
    ].join('\n');
  }
  return [
    `# ${ticketKey}: Not Found`,
    '',
    `Ticket \`${ticketKey}\` does not exist in Tickets.json.`,
    '',
    '**If you were asked to create a ticket from a prior conversation**:',
    'Run the following command:',
    '',
    '```bash',
    `node .claude/scripts/tickets/ensure-ticket.js \\`,
    `  --ticket-key=${ticketKey} \\`,
    '  --title="(title determined from conversation)"',
    '```',
    '',
    '**If there was no prior conversation**:',
    'Respond to the user: "Cannot proceed with /make-ticket because there is no prior information to create a ticket and spec." and abort.',
    '',
  ].join('\n');
}

/** Generate Markdown for ticket information */
/**
 * Generate slug (kebab-case) from title (same logic as ensure-ticket.js)
 */
function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80);
}

// [::TICKET::] PX-72, PX-75, PX-87 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-72|PX-75|PX-87) --for-spec --no-implementation-order`.
function buildTicketMarkdown(ticketKey, ticket, tickets, ticketsDir, forSpec, noImplementationOrder) {
  const lines = [];

  // In --for-spec mode, output Implementation Order first (before YAML frontmatter)
  if (forSpec && !noImplementationOrder) {
    lines.push('# Implementation Order (TDD Red-Green-Refactor)');
    lines.push('');
    lines.push('Implementation must strictly follow the **Red → Green → Refactor** sequence. Skipping steps, reordering, or parallel execution is prohibited.');
    lines.push('');
    lines.push('## 1. Red — Fully Implement Failing Tests');
    lines.push('');
    lines.push('Before writing a single line of implementation code, write a failing test suite that achieves 100% coverage of the spec\'s **Goal, Purpose, Motivation, Constraints, Scope, Acceptance Criteria, and Invariants**. Coverage of these seven elements is mandatory; partial implementation is not acceptable.');
    lines.push('');
    lines.push('When the ticket defines **Contracts** (Precondition/Postcondition/Invariant from graph edge annotation), the Red phase must first translate each Contract into testable form — input schemas, output assertions, and invariant predicates — before implementing them as concrete test code. A Contract whose Precondition/Postcondition/Invariant cannot be expressed as a testable assertion is not yet fully specified.');
    lines.push('');
    lines.push('- Tests must cover all observable behaviors, edge cases, failure modes, and invariants. Any behavior not covered is considered undefined and fails review.');
    lines.push('- If a feature is deterministic yet fundamentally untestable, this is not a testing gap but an architectural defect. Redesign the system until it is testable before proceeding to implementation.');
    lines.push('- Confirm that all tests fail red due to the absence of implementation. Tests that pass green by accident (e.g., meaningless assertions) are invalid.');
    lines.push('');
    lines.push('## 2. Green — Implement Behavior (No Stubs, No Test Modification)');
    lines.push('');
    lines.push('Implement the **behavior** specified by the tests; do not treat passing the tests as an end in itself. Tests are a means of verifying correctness, not the goal itself.');
    lines.push('');
    lines.push('- Implementations that merely satisfy the literal wording of tests—via hardcoding, input-specific branching, or stubbed return values—are prohibited. The implementation must be a generalized, correct solution.');
    lines.push('- If it is impossible to distinguish, via testing, whether an implementation is genuine or a disguised green, this indicates a design flaw caused by insufficient coverage. Add tests until the distinction is possible before proceeding with implementation.');
    lines.push('- Modifying, deleting, or weakening tests to make an implementation pass is strictly forbidden. The implementation must conform to the tests; the reverse is never acceptable.');
    lines.push('- An implementation whose correctness cannot be proven is invalid. It is not considered complete until it (or its design) is restructured into a provably correct form.');
    lines.push('');
    lines.push('## 3. Refactor — Apply the Boy Scout Rule (Green State Only)');
    lines.push('');
    lines.push('Refactor only after all tests are green. Refactoring in a red state is prohibited.');
    lines.push('');
    lines.push('- Apply the Boy Scout Rule (leave the code cleaner than you found it; readability = translatability) to eliminate `unwrap()` calls, hardcoded values, false comments, and untested code in anything you touch.');
    lines.push('- Verify that all tests remain green before and after each refactoring step. If a refactor breaks green, roll it back immediately.');
    lines.push('');
    lines.push('## Definition of Done');
    lines.push('');
    lines.push('Implementation is considered incomplete unless all of the following are satisfied:');
    lines.push('');
    lines.push('- The tests fully and precisely specify the intended behavior.');
    lines.push('- The implementation passes all tests green, without exception.');
    lines.push('- Correctness is empirically guaranteed by the tests (not a disguised green).');
    lines.push('- No gap exists between test coverage and intended behavior.');
    lines.push('');
    lines.push('Green without red, green achieved by modifying tests, and green achieved through stubs are all violations and constitute incomplete work.');
    lines.push('');
  }

  // Omit IMPORTANT banner in --for-spec mode
  if (!forSpec) {
    lines.push('> [!IMPORTANT]');
    lines.push('> The following content is an initial ticket-level draft and shall not be treated as a complete specification. As part of the /make-ticket workflow, it must be reviewed against the actual design, related nodes, related tickets, and the implementation state of the source code, and then expanded into a detailed and accurate specification.');
    lines.push('>');
    lines.push('> The specification must fully reflect all information contained in the ticket. The existence of ticket information that is not captured in the specification is prohibited and shall be treated as a defect in the specification.\n');
  }

  // ---- Resolve pipeline information ----
  const rawSource = (tickets.metadata && tickets.metadata.source) || '';
  const resolvedPaths = (tickets.metadata && tickets.metadata.resolvedPaths) || null;
  const { rfcPath, graphPath, dirsTreePath } = resolveRfcPaths(rawSource, ticketsDir, resolvedPaths);
  const rfcExists = rfcPath ? fs.existsSync(rfcPath) : false;
  const graphExists = graphPath ? fs.existsSync(graphPath) : false;
  const dirsExists = dirsTreePath ? fs.existsSync(dirsTreePath) : false;
  const pipelineAvailable = !!(
    ticketKey && rfcPath && rfcExists && rfcPath.toLowerCase().endsWith('.md') && graphExists && dirsExists
  );

  // H1
  lines.push(`# Target ticket is ${ticketKey}: ${ticket.title}${forSpec ? '' : ` [${ticket.status || 'todo'}]`}`);
  lines.push('');

  // Compact metadata block (top of file — forSpec mode only)
  if (forSpec) {
    const parsed = parseTicketKey(ticketKey);
    const phaseId = parsed ? parsed.phaseId : '?';

    // Status + Ticket Key + Phase
    lines.push(`**Ticket Key**: ${ticketKey} · **Phase**: ${phaseId}`);
    lines.push('');

    // RFC Source + Graph (only if resolved paths are available)
    if (rfcPath) {
      const rfcRel = makeRelative(rfcPath, ticketsDir);
      // const graphRel = graphPath ? makeRelative(graphPath, ticketsDir) : '';
      // const srcLine = `**RFC Source**: \`${rfcRel}\`` + (graphRel ? `\n\n**Graph**: \`${graphRel}\`` : '');
      const srcLine = `**RFC Source**: \`${rfcRel}\``;
      lines.push(srcLine);
      lines.push('');
    }

    // Visual separator between header and body
    lines.push('---');
    lines.push('');
  }

  // RFC Reference
  if (ticket.referenceSection) {
    lines.push('## RFC Reference');
    lines.push('');
    lines.push(ticket.referenceSection);
    lines.push('');
  }

  // Background
  if (ticket.background) {
    lines.push('## Background');
    lines.push('');
    lines.push(ticket.background);
    lines.push('');
  }

  // Scope
  if (ticket.scope && ticket.scope.length > 0) {
    lines.push('## Scope');
    lines.push('');
    for (const item of ticket.scope) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }

  // Implementation Target Files
  if (ticket.default_files && ticket.default_files.length > 0) {
    lines.push('## Implementation Target Files');
    lines.push('');
    for (const f of ticket.default_files) {
      lines.push(`- \`${f}\``);
    }
    lines.push('');
  }

  // Source Paths
  if (ticket.sourcePaths && ticket.sourcePaths.length > 0) {
    lines.push('## Source Paths');
    lines.push('');
    for (const p of ticket.sourcePaths) {
      lines.push(`- \`${p}\``);
    }
    lines.push('');
  }

  const hasTargetStubs = ticket.targetStubs && Array.isArray(ticket.targetStubs) && ticket.targetStubs.length > 0;
  const hasTargetCrimes = ticket.targetCrimes && Array.isArray(ticket.targetCrimes) && ticket.targetCrimes.length > 0;
  const hasFoundOmissions = ticket.foundOmissions && Array.isArray(ticket.foundOmissions) && ticket.foundOmissions.length > 0;

  // Target status: STUBs this ticket must fully implement and crimes it must resolve.
  // Always shown when values exist (also in --for-spec mode).
  if (hasTargetStubs || hasTargetCrimes) {
    if (hasTargetStubs) {
      const summaryStr = ticket.targetStubs.length + ' items — ' + summarizeByField(ticket.targetStubs, 'status');
      lines.push('## STUBs — Must Be Fully Implemented in This Ticket' + ` (${summaryStr})`);
      lines.push('');
      for (const stub of ticket.targetStubs) {
        lines.push(formatTargetStub(stub, ticketsDir));
      }
    }
    if (hasTargetCrimes) {
      const summaryStr = ticket.targetCrimes.length + ' items — ' + summarizeByField(ticket.targetCrimes, 'status')
      lines.push('## Crimes — Must Be 100% Resolved in This Ticket' + ` (${summaryStr})`);
      lines.push('');
      for (const crime of ticket.targetCrimes) {
        lines.push(formatTargetCrime(crime, ticketsDir));
      }
    }
  }

  // Omissions found by review (find-omissions) that this ticket must resolve.
  // Always shown when values exist (also in --for-spec mode).
  if (hasFoundOmissions) {
    const summaryStr = ticket.foundOmissions.length + ' items — ' + summarizeByField(ticket.foundOmissions, 'severity');
    lines.push('## Omissions found in Prior Implementation Rounds — Must Be 100% Resolved in This Ticket' + ` (${summaryStr})`);
    lines.push('');
    let omissionIndex = 0;
    for (const omission of ticket.foundOmissions) {
      lines.push(formatFoundOmission(omission, omissionIndex));
      omissionIndex++;
    }
  }

  // Graph section (only when pipelineAvailable and nodeIds exist)
  // Triggers the first investigation action (node exploration) AI should perform in Step 4a.
  if (pipelineAvailable && ticket.nodeIds && ticket.nodeIds.length > 0) {
    lines.push('## To show related RFC graph details');
    lines.push('');
    lines.push('### Usage of query.js');
    lines.push('');
    lines.push('```');
    const graphRel = makeRelative(graphPath, ticketsDir);
    const rfcRel = makeRelative(rfcPath, ticketsDir);
    const dirsRel = makeRelative(dirsTreePath, ticketsDir);
    lines.push(`node .claude/scripts/rfc-graph/query.js --graph="${graphRel}" --source="${rfcRel}" --dirs-tree="${dirsRel}" --id=Nxxxx (NODE-ID, e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)`);
    lines.push('```');
    lines.push('');
    lines.push('### Related RFC graph NODE-IDs to check');
    lines.push('');
    lines.push(ticket.nodeIds.map(id => `\`${id}\``).join(' '));
    lines.push('');

    // Expand detailed information from GRAPH.json / Dirs-Tree.json
    const { graphNodes, graphEdges, dirsTree } = loadGraphAndDirs(graphPath, dirsTreePath);
    const nodeDetails = formatGraphNodeDetails(ticket.nodeIds, graphNodes);
    lines.push(nodeDetails);
    const edgeRelations = formatGraphEdgeRelationships(ticket.nodeIds, graphEdges, graphNodes);
    if (edgeRelations) lines.push(edgeRelations);
    const filePaths = formatGraphFilePaths(ticket.nodeIds, dirsTree);
    if (filePaths) lines.push(filePaths);
  }

  // Investigation (existing investigation results referenced after Step 4a graph exploration)
  if (ticket.investigation) {
    lines.push('## Investigation');
    lines.push('');
    lines.push(ticket.investigation);
    lines.push('');
  }

  // Acceptance Criteria
  if (ticket.acceptanceCriteria && ticket.acceptanceCriteria.length > 0) {
    lines.push('## Acceptance Criteria');
    lines.push('');
    for (const item of ticket.acceptanceCriteria) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }

  // Invariants
  if (ticket.invariants) {
    lines.push('## Invariants');
    lines.push('');
    lines.push(ticket.invariants);
    lines.push('');
  }

  // Contracts (contract-based pre/post/invariant, from graph edge annotation)
  if (Array.isArray(ticket.contracts) && ticket.contracts.length > 0) {
    lines.push('## Contracts — mandatory 100% test coverage in TDD Red phase');
    lines.push('');
    for (const c of ticket.contracts) {
      lines.push('### ' + (c.id || '?') + ' — ' + (c.sourceEdge || ''));
      lines.push('');
      lines.push('- **Precondition**: ' + (c.precondition || '(none)'));
      lines.push('- **Postcondition**: ' + (c.postcondition || '(none)'));
      lines.push('- **Invariant**: ' + (c.invariant || '(none)'));
      lines.push('');
    }
  }

  // Boy Scout Rule
  if (ticket.boyScoutPlan) {
    lines.push('## Boy Scout Rule');
    lines.push('');
    lines.push(ticket.boyScoutPlan);
    lines.push('');
  }

  // Test Plan
  lines.push('## Test Plan');
  lines.push('');
  if (ticket.testUnit && ticket.testUnit.length > 0) {
    lines.push('### Unit Tests');
    lines.push('');
    for (const v of ticket.testUnit) {
      lines.push(`- ${v}`);
    }
    lines.push('');
  }
  if (ticket.testIntegration && ticket.testIntegration.length > 0) {
    lines.push('### Integration Tests');
    lines.push('');
    for (const v of ticket.testIntegration) {
      lines.push(`- ${v}`);
    }
    lines.push('');
  }
  if (ticket.testExceptions && ticket.testExceptions.length > 0) {
    lines.push('### Exceptions');
    lines.push('');
    for (const e of ticket.testExceptions) {
      lines.push(`- ${e}`);
    }
    lines.push('');
  }

  // Plan Test Code (concrete code from plan-ticket Phase 1.5)
  if (ticket.planTestCode && ticket.planTestCode.length > 0) {
    lines.push('### Plan Test Code (concrete code)');
    lines.push('');
    for (const v of ticket.planTestCode) {
      lines.push('- ' + v);
    }
    lines.push('');
  }

  // Related Tickets
  if (ticket.relatedTicketIds) {
    const rows = parseRelatedTicketIds(ticket.relatedTicketIds);
    if (rows.length > 0) {
      lines.push('## Related Tickets');
      lines.push('');
      lines.push('| Ticket KEY | Relation | Description |');
      lines.push('|--------|----------|-------------|');
      for (const row of rows) {
        const description = row.description || resolveRelatedTicketTitle(tickets, row.ticket);
        lines.push(`| ${row.ticket} | ${row.relation} | ${description} |`);
      }
      lines.push('');
      lines.push('### To show related tickets details');
      lines.push('');
      lines.push('```');
      lines.push('node .claude/scripts/tickets/show-ticket-context.js --ticket-key=<Ticket KEY to show (e.g. P0-1)> --for-spec --no-implementation-order');
      lines.push('```');
      lines.push('');
    }
  }

  // Changes from prior implementation rounds (before/after recorded by start-ticket)
  if (ticket.changes && ticket.changes.length > 0) {
    lines.push('## Changes in Prior Implementation Rounds');
    lines.push('');
    lines.push('| Before | After | Description |');
    lines.push('|--------|-------|-------------|');
    for (const c of ticket.changes) {
      const before = c.before || '';
      const after = c.after || '';
      const desc = c.description || '';
      lines.push(`| ${before} | ${after} | ${desc} |`);
    }
    lines.push('');
  }

  // RFC Discrepancies
  if (ticket.rfcDiscrepancies && ticket.rfcDiscrepancies.length > 0) {
    lines.push('## RFC Discrepancies found in Prior Implementation Rounds');
    lines.push('');
    for (const d of ticket.rfcDiscrepancies) {
      lines.push(`- ${d}`);
    }
    lines.push('');
  }

  // Notes
  if (ticket.notes) {
    lines.push('## Notes in Prior Implementation Rounds');
    lines.push('');
    lines.push(ticket.notes);
    lines.push('');
  }

  // Pipeline Context (not output in --for-spec mode)
  if (!forSpec) {
    lines.push('## Pipeline Context');
    lines.push('');
    lines.push('| Resource | Path | Exist |');
    lines.push('|----------|------|-------|');
    if (rfcPath) lines.push(`| RFC | \`${makeRelative(rfcPath, ticketsDir)}\` | ${rfcExists} |`);
    if (graphPath) lines.push(`| Graph | \`${makeRelative(graphPath, ticketsDir)}\` | ${graphExists} |`);
    if (dirsTreePath) lines.push(`| Dirs-Tree | \`${makeRelative(dirsTreePath, ticketsDir)}\` | ${dirsExists} |`);
    // spec path: prefer ticket's specPath if available, otherwise compute deterministically using naming convention
    const specPath = ticket.specPath
      ? path.resolve(ticketsDir, ticket.specPath)
      : resolveTicketSpecPath(ticketsDir, ticketKey);
    const specExists = specPath ? fs.existsSync(specPath) : false;
    lines.push(`| Spec-File | \`${makeRelative(specPath, ticketsDir)}\` | ${specExists} |`);
    lines.push(`| Pipeline Available | **${pipelineAvailable}** | - |`);
    lines.push('');
  }

  return lines.join('\n');
}

function main() {
  const { ticketsPath, ticketKey, forSpec, noImplementationOrder, plan, review } = parseArgs();

  if (!ticketKey || !isValidTicketKey(ticketKey)) {
    console.error('Error: --ticket-key must be specified in P{phaseId}-{ticketId} format (e.g., P0-1, PX-53).');
    process.exit(EXIT_FAILURE);
  }

  if (!fs.existsSync(ticketsPath)) {
    console.error(`Error: Tickets.json not found: ${ticketsPath}`);
    process.exit(EXIT_FAILURE);
  }

  const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  const parsed = parseTicketKey(ticketKey);
  const ticket = findTicket(tickets, parsed);

  if (!ticket) {
    console.log(buildTicketNotFoundMarkdown(ticketKey, plan, review));
    process.exit(EXIT_SUCCESS);
  }

  const ticketsDir = path.dirname(ticketsPath);
  const output = buildTicketMarkdown(ticketKey, ticket, tickets, ticketsDir, forSpec, noImplementationOrder);
  console.log(output);

  // Append implementation locations from show-ticket-locations.js (read-only)
  try {
    const scriptPath = path.join(path.dirname(process.argv[1]), 'show-ticket-locations.js');
    if (fs.existsSync(scriptPath)) {
      const locations = execFileSync('node', [scriptPath, '--ticket-key', ticketKey, '--show-lines', '1'], {
        encoding: 'utf8', timeout: 15000, maxBuffer: 10 * 1024 * 1024,
      });
      console.log(locations.trim());
    }
  } catch (_) {
    // Silently skip — locations is a best-effort supplement
  }

  process.exit(EXIT_SUCCESS);
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, buildTicketNotFoundMarkdown, buildTicketMarkdown, parseRelatedTicketIds, resolveRfcPaths, makeRelative, isValidTicketKey, parseTicketKey, findTicket, main };
