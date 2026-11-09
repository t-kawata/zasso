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
const { execFileSync } = require('child_process');
const { resolveTicketSpecPath } = require('../lib/tickets');
const { fromHomeRelative, resolveStoredPath, toHomeRelative, toHomeRelativeText } = require('../lib/path-utils');
const { CONTRACT_AXES, OPERATION_OBLIGATION_FIELDS, crossedBoundaryIds } = require('./lib/contract-facts');
const { findAllocateManifest } = require('../lib/package-artifacts');
const {
  flattenTicketDocument,
  publicTicketKey,
  stepOwnerLabel,
  viewSequenceUnit,
} = require('./lib/step-owner');

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
// [::TICKET::] PX-231 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-231 --for-spec --no-implementation-order`.
function makeRelative(absPath, base) {
  try {
    const fromSrc = keepFromSrcDir(absPath);
    if (fromSrc !== null) return fromSrc;

    const rel = path.relative(base, absPath);
    if (!rel.startsWith('..')) return rel;

    const fromHome = homeRelativeOrNull(absPath);
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
 * Return absPath with its home-directory prefix replaced by `~`, or null when the
 * path is not inside the user's home directory.
 *
 * The conversion itself belongs to path-utils, which the whole repository shares. What
 * stays here is the one thing that helper does not answer: whether it applied at all. It
 * returns its input unchanged when the path lies outside the home directory, so comparing
 * the result with the input is what tells the two cases apart — and having one converter
 * rather than a second copy of the rule beside it is what stops the two from drifting.
 */
// [::TICKET::] PX-231 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-231 --for-spec --no-implementation-order`.
function homeRelativeOrNull(absPath) {
  const converted = toHomeRelative(absPath);
  return converted === absPath ? null : converted;
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
// [::TICKET::] PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-341 --for-spec --no-implementation-order`.
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
    `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/ensure-ticket.js" \\`,
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

/** One obligation value element as text; a structured row keeps its fields instead of collapsing. */
function renderObligationElement(element) {
  if (element === null || element === undefined) return '';
  if (typeof element === 'object') return JSON.stringify(element);
  return String(element);
}

/**
 * Render one obligation value as a single Markdown fragment, or null when it carries nothing.
 *
 * An obligation row may be structured: `boundaryEffects` is a list of
 * {boundary, direction} records. Joining the raw array would print "[object Object]"
 * and erase the only contract the implementer can plan against.
 */
// [::TICKET::] PX-72, PX-75, PX-87, PX-231, PX-318 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-72|PX-75|PX-87|PX-231|PX-318) --for-spec --no-implementation-order`.
// [::TICKET::] PX-321 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-321 --for-spec --no-implementation-order`.
// [::TICKET::] PX-326 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-326 --for-spec --no-implementation-order`.
function renderObligationValue(value) {
  if (Array.isArray(value)) {
    const rendered = value.map(renderObligationElement).filter((text) => text.length > 0);
    return rendered.length > 0 ? rendered.join('; ') : null;
  }
  if (value !== null && typeof value === 'object') {
    return Object.keys(value).length > 0 ? JSON.stringify(value) : null;
  }
  if (typeof value === 'string') return value.trim().length > 0 ? value : null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

/** The prose of one typed fact array, or an empty string. */
// [::TICKET::] PX-321, PX-322 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-321|PX-322) --for-spec --no-implementation-order`.
function renderFactText(facts) {
  return (Array.isArray(facts) ? facts : [])
    .map((fact) => (typeof fact === 'string' ? fact : (fact?.text ?? fact?.factId ?? '')))
    .filter((text) => typeof text === 'string' && text.length > 0)
    .join('; ');
}

/** The four axes the prose pre/post/invariant labels do not cover. */
// [::TICKET::] PX-322 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-322 --for-spec --no-implementation-order`.
const EXTRA_CONTRACT_AXES = CONTRACT_AXES;

/** One contract axis as a Markdown line, or null when the axis is empty. */
// [::TICKET::] PX-322 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-322 --for-spec --no-implementation-order`.
// [::TICKET::] PX-326 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-326 --for-spec --no-implementation-order`.
function renderContractAxis(contract, axis) {
  const text = renderFactText(contract?.[axis]);
  return text.length > 0 ? `${axis}: ${text}` : null;
}

/** The typed axes of one Work Share step, in the vocabulary the delivery gate reads. */
// [::TICKET::] PX-330 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-330 --for-spec --no-implementation-order`.
function renderStepAxes(step) {
  const parts = EXTRA_CONTRACT_AXES
    .map((axis) => {
      const text = renderFactText(step?.contract?.[axis]);
      return text.length > 0 ? `${axis}=${text}` : null;
    })
    .filter((part) => part !== null);
  return parts.length > 0 ? parts.join('; ') : '(none)';
}

/** The contract a ticket carries for one boundary, or undefined. */
// [::TICKET::] PX-331 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-331 --for-spec --no-implementation-order`.
function ticketBoundaryContract(ticket, boundaryId) {
  return (Array.isArray(ticket?.contracts) ? ticket.contracts : []).find((candidate) => candidate?.boundaryId === boundaryId
    || candidate?.registryContractId === `contract-${boundaryId}`
    || candidate?.id === `contract-${boundaryId}`);
}

/** The Work Share block: own work, shared work, carried boundaries and crossed boundaries. */
// [::TICKET::] PX-324, PX-325 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-324|PX-325) --for-spec --no-implementation-order`.
// [::TICKET::] PX-326 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-326 --for-spec --no-implementation-order`.
// [::TICKET::] PX-330 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-330 --for-spec --no-implementation-order`.
// [::TICKET::] PX-331 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-331 --for-spec --no-implementation-order`.
function renderWorkShare(ticket, { ticketsDocument = null, view = null, registry = [] } = {}) {
  const units = Array.isArray(ticket?.distribution?.units) ? ticket.distribution.units : [];
  const sequenceUnits = units.filter((unit) => unit?.kind === 'sequence'
    || unit?.kind === 'cross-boundary-sequence'
    || String(unit?.unitId ?? '').startsWith('seq-')
    || String(unit?.unitId ?? '').startsWith('xdir-'));
  const boundaryUnits = units.filter((unit) => String(unit?.unitId ?? '').startsWith('ctr-'));
  if (sequenceUnits.length === 0 && boundaryUnits.length === 0) return null;

  const lines = ['### Work Share', ''];
  for (const unit of sequenceUnits) {
    const unitInView = viewSequenceUnit(view, unit);
    const steps = Array.isArray(unitInView?.steps) && unitInView.steps.length > 0
      ? unitInView.steps
      : (Array.isArray(unit?.obligation?.steps) ? unit.obligation.steps : []);
    lines.push(`#### Sequence ${unit.sequenceId ?? unit.unitId} — outcome: ${unit.obligation?.outcome ?? 'unknown'}`);
    lines.push('');
    // The contract id is the key Gate S scans for in the Red test files. It is generated
    // by the ticket merge, so the brief is the only place the implementer can read it
    // without opening raw Tickets.json.
    lines.push('| step | operation | owner | contract | precondition | postcondition | invariant | axes |');
    lines.push('|---|---|---|---|---|---|---|---|');
    for (const step of steps) {
      const owner = stepOwnerLabel({ step, unit, ticket, ticketsDocument, view });
      const contract = (Array.isArray(ticket.contracts) ? ticket.contracts : [])
        .find((candidate) => candidate?.stepId === step?.stepId);
      const precondition = renderFactText(step?.contract?.pre) || '(none)';
      const postcondition = renderFactText(step?.contract?.post) || '(none)';
      const invariant = renderFactText(step?.contract?.invariants) || '(none)';
      lines.push(`| ${step.stepId ?? '?'} | op-${step.operationId ?? step.operation ?? '?'} | ${owner} | ${contract?.id ?? '(none)'} | ${precondition} | ${postcondition} | ${invariant} | ${renderStepAxes(step)} |`);
    }
    if (unitInView === null) {
      lines.push('');
      lines.push(view === null || view === undefined
        ? '- other steps: not available (the package view is unreadable)'
        : '- other steps: not available (this sequence unit is not step-bearing in the package view)');
    }
    lines.push('');
  }

  const carriedBoundaryIds = new Set();
  for (const unit of boundaryUnits) {
    const boundaryId = String(unit.unitId).replace(/^ctr-/, '');
    carriedBoundaryIds.add(boundaryId);
    const contract = ticketBoundaryContract(ticket, boundaryId);
    lines.push(`#### Boundary ${boundaryId}`);
    lines.push('');
    lines.push(`- direction: ${unit.obligation?.direction ?? 'unknown'}`);
    lines.push(`- counterpart: ${unit.obligation?.counterpart ?? 'unknown'}`);
    if (contract === undefined) {
      lines.push('- contract: MISSING (the ticket carries the ctr unit without its registry projection)');
    } else {
      lines.push(`- contract id: ${contract.id ?? `contract-${boundaryId}`}`);
      lines.push(`- precondition: ${contract.precondition || '(none)'}`);
      lines.push(`- postcondition: ${contract.postcondition || '(none)'}`);
      lines.push(`- invariant: ${contract.invariant || '(none)'}`);
    }
    lines.push('');
  }

  // A boundary crossed by a local step is part of the ticket's division interface even
  // when another ticket owns the ctr node. The registry row supplies the direction; the
  // merged contract supplies the clauses the implementer must satisfy.
  const crossedIds = new Set();
  for (const unit of sequenceUnits) {
    for (const step of Array.isArray(unit?.obligation?.steps) ? unit.obligation.steps : []) {
      for (const boundaryId of crossedBoundaryIds(step?.contract?.crosses)) crossedIds.add(boundaryId);
    }
  }
  for (const boundaryId of [...crossedIds].sort()) {
    if (carriedBoundaryIds.has(boundaryId)) continue;
    const registryRow = (Array.isArray(registry) ? registry : [])
      .find((candidate) => candidate?.boundary_id === boundaryId) ?? null;
    const contract = ticketBoundaryContract(ticket, boundaryId);
    lines.push(`#### Crossed boundary ${boundaryId}`);
    lines.push('');
    if (registryRow !== null) {
      lines.push(`- provider: ${registryRow.provider_package ?? 'unknown'}`);
      lines.push(`- consumer: ${registryRow.consumer_package ?? 'unknown'}`);
    }
    if (contract === undefined) {
      lines.push('- contract: MISSING (the ticket crosses this boundary without its registry projection)');
    } else {
      lines.push(`- contract id: ${contract.id ?? `contract-${boundaryId}`}`);
      lines.push(`- precondition: ${contract.precondition || '(none)'}`);
      lines.push(`- postcondition: ${contract.postcondition || '(none)'}`);
      lines.push(`- invariant: ${contract.invariant || '(none)'}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** The source and boundary a prerequisite entry names, as one prose suffix. */
function prerequisiteDetail(entry) {
  const parts = [];
  if (typeof entry?.source === 'string' && entry.source.length > 0) parts.push(`source ${entry.source}`);
  if (typeof entry?.boundary === 'string' && entry.boundary.length > 0) parts.push(`boundary ${entry.boundary}`);
  return parts.length === 0 ? '' : ` — ${parts.join(' — ')}`;
}

/**
 * The implementation prerequisites as a section, or null when the ticket carries none.
 *
 * A same-package prerequisite names a ticket whose status is in this document. A
 * cross-package prerequisite names a package whose Tickets.json the entry gate reads, so
 * this display says the gate checked it rather than inventing a status it cannot see.
 */
function renderImplementationPrerequisites(ticket, tickets) {
  const entries = Array.isArray(ticket?.prerequisites) ? ticket.prerequisites : [];
  if (entries.length === 0) return null;
  const statusOf = new Map(
    flattenTicketDocument(tickets).map((candidate) => [publicTicketKey(candidate), candidate.status]),
  );
  const lines = ['## Implementation Prerequisites', ''];
  for (const entry of entries) {
    if (typeof entry?.ticket === 'string') {
      lines.push(`- ${entry.ticket} — status ${statusOf.get(entry.ticket) ?? 'unknown'}${prerequisiteDetail(entry)}`);
      continue;
    }
    if (typeof entry?.package === 'string') {
      lines.push(`- package ${entry.package} — status checked by the entry gate${prerequisiteDetail(entry)}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

/** The distribution units of a ticket as a spec section, or null when the ticket has none. */
// [::TICKET::] PX-321, PX-322, PX-324 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-321|PX-322|PX-324) --for-spec --no-implementation-order`.
/**
 * The formula obligations this ticket implements.
 *
 * A reader must see the original specification quotation, the implementation anchor and
 * the test that proves the realization. The section is absent on a ticket written before
 * the formula ledger existed, which is not an error.
 */
// [::TICKET::] PX-362 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-362) --for-spec --no-implementation-order`.
function renderFormulaObligations(ticket) {
  const obligations = Array.isArray(ticket.formulaObligations) ? ticket.formulaObligations : [];
  if (obligations.length === 0) return null;

  const lines = ['## Formula Obligations', ''];
  for (const obligation of obligations) {
    lines.push(`### ${obligation.id ?? '?'} — ${obligation.design?.class ?? 'class undeclared'}`);
    lines.push('');
    lines.push(`- Body: \`${obligation.body ?? ''}\``);
    lines.push(`- Original specification: \`${obligation.origin?.path ?? '?'}:L${obligation.origin?.line ?? '?'}\`${obligation.origin?.segment ? ` (segment ${obligation.origin.segment})` : ''}`);
    if (obligation.origin?.quote) lines.push(`- Quote: ${obligation.origin.quote}`);
    lines.push(`- Implementation: \`${obligation.implementation?.path ?? '?'}#${obligation.implementation?.symbol ?? '?'}\` (${obligation.implementation?.kind ?? '?'})`);
    lines.push(`- Design: ${obligation.design?.how ?? '?'}`);
    if (obligation.design?.types?.length > 0) lines.push(`- Types: ${obligation.design.types.join(', ')}`);
    if (obligation.design?.errors?.length > 0) lines.push(`- Errors: ${obligation.design.errors.join(', ')}`);
    if (obligation.design?.edgeCases?.length > 0) lines.push(`- Edge cases: ${obligation.design.edgeCases.join(', ')}`);
    if (obligation.theory?.symbols?.length > 0) {
      lines.push(`- Theory symbols: ${obligation.theory.symbols.map((entry) => `${entry.symbol ?? '?'} = ${entry.definition ?? '?'}`).join('; ')}`);
    }
    if (obligation.theory?.norms?.length > 0) lines.push(`- Normative lines: ${obligation.theory.norms.join('; ')}`);
    lines.push(`- Tests: ${(obligation.tests ?? []).join('; ')}`);
    lines.push(`- Digest: \`${obligation.digest ?? '?'}\``);
    lines.push('');
  }
  return lines.join('\n');
}

// [::TICKET::] PX-362 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-362) --for-spec --no-implementation-order`.
function renderDistributionObligations(ticket, options = {}) {  const units = Array.isArray(ticket?.distribution?.units) ? ticket.distribution.units : [];
  if (units.length === 0) return null;
  const lines = ['## Distribution Obligations', ''];
  for (const unit of units) {
    lines.push(`### ${unit.unitId ?? '?'} — ${unit.kind ?? 'unit'} (${unit.role ?? 'role undeclared'})`);
    lines.push('');
    const placement = unit.placement ?? {};
    if (placement.nodeIds !== undefined || placement.paths !== undefined) {
      lines.push(`- placement: ${(placement.nodeIds ?? []).join(', ') || '(none)'} -> ${(placement.paths ?? []).join(', ') || '(none)'}`);
    }
    lines.push(`- obligation: ${unit.obligation?.mode ?? 'unknown'}`);
    if (unit.obligation?.outcome !== undefined && unit.obligation?.outcome !== null) {
      lines.push(`- outcome: ${unit.obligation.outcome}`);
    }
    if (unit.obligation?.mode === 'reference') {
      const providers = renderObligationValue(unit.obligation.providers);
      if (providers !== null) lines.push(`- providers: ${providers}`);
      // The durable key survives phase renumbering; the numeric id is its phase-local fallback.
      const implementer = renderObligationValue(unit.obligation.implementerTicketKey)
        ?? renderObligationValue(unit.obligation.implementerTicketId);
      if (implementer !== null) lines.push(`- implementer ticket: ${implementer}`);
    }
    if (unit.obligation?.mode === 'implement') {
      for (const field of OPERATION_OBLIGATION_FIELDS) {
        const rendered = renderObligationValue(unit.obligation[field]);
        if (rendered !== null) lines.push(`- ${field}: ${rendered}`);
      }
    }
    if (unit.obligation?.mode === 'obligation') {
      for (const field of ['relation', 'subject', 'direction', 'counterpart']) {
        const rendered = renderObligationValue(unit.obligation[field]);
        if (rendered !== null) lines.push(`- ${field}: ${rendered}`);
      }
      const coverage = unit.obligation.coverage;
      if (coverage !== null && typeof coverage === 'object') {
        for (const field of ['column', 'operationSet', 'carried', 'total', 'uncoveredSpellings']) {
          const rendered = renderObligationValue(coverage[field]);
          if (rendered !== null) lines.push(`- coverage.${field}: ${rendered}`);
        }
      }
    }
    if (Array.isArray(unit.obligation?.steps) && unit.obligation.steps.length > 0) {
      lines.push('- sequence steps:');
      for (const step of unit.obligation.steps) {
        const location = typeof step.line === 'number' && step.line > 0 ? ` line ${step.line}` : '';
        const statement = ['subject', 'predicate', 'object']
          .map((field) => (step[field] ? `${field}=${step[field]}` : null))
          .filter(Boolean)
          .join(', ');
        const statementText = statement.length > 0 ? ` [${statement}]` : '';
        lines.push(`  - ${step.stepId} (op-${step.operationId}, order ${step.order ?? 0})${location}${step.quote ? ` "${step.quote}"` : ''}${statementText}`);
        const precondition = renderFactText(step.contract?.pre);
        const postcondition = renderFactText(step.contract?.post);
        const invariant = renderFactText(step.contract?.invariants);
        if (precondition) lines.push(`    - precondition: ${precondition}`);
        if (postcondition) lines.push(`    - postcondition: ${postcondition}`);
        if (invariant) lines.push(`    - invariant: ${invariant}`);
        for (const axis of EXTRA_CONTRACT_AXES) {
          const rendered = renderContractAxis(step.contract, axis);
          if (rendered !== null) lines.push(`    - ${rendered}`);
        }
        if (typeof step.contractProse === 'string' && step.contractProse.length > 0) {
          lines.push(`    - contractProse: ${step.contractProse}`);
        }
      }
    }
    if (Array.isArray(unit.specRefs) && unit.specRefs.length > 0) {
      lines.push('- spec references:');
      for (const ref of unit.specRefs) {
        lines.push(`  - ${ref.path || '(no path)'}:${ref.line}${ref.quote ? ` "${ref.quote}"` : ''}`);
      }
    }
    lines.push('');
  }
  const workShare = renderWorkShare(ticket, options);
  if (workShare !== null) {
    lines.push(workShare);
    lines.push('');
  }
  return lines.join('\n');
}

/** The one-line provenance banner shown below the ticket title. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function renderCondensationBanner(ticket, ticketKey) {
  const condensed = ticket?.condensedFrom;
  const absorbed = Array.isArray(condensed?.tickets) ? condensed.tickets : [];
  if (absorbed.length === 0) return null;
  const names = absorbed.map((entry) => `${entry.key} "${entry.title}"`).join(', ');
  if (ticketKey === condensed.originKey) {
    return `Condensed from: ${names} — full absorbed records follow under "## Condensed From".`;
  }
  return `Inherited condensation ledger from ${condensed.originKey}: ${names} — full absorbed records follow under "## Condensed From".`;
}

/** Demote Markdown headings inside an absorbed record so it cannot open a top-level section. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function demoteMarkdownHeadings(text, levels = 3) {
  return text.replace(/^(#{1,6})\s/gm, (match, hashes) => `${'#'.repeat(Math.min(6, hashes.length + levels))} `);
}

/** Append one prose field of an absorbed record. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function appendCondensedProse(lines, heading, value) {
  if (typeof value !== 'string' || value.trim().length === 0) return;
  lines.push(`#### ${heading}`);
  lines.push('');
  lines.push(demoteMarkdownHeadings(value));
  lines.push('');
}

/** Append one list field of an absorbed record. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function appendCondensedList(lines, heading, values) {
  if (!Array.isArray(values) || values.length === 0) return;
  lines.push(`#### ${heading}`);
  lines.push('');
  for (const value of values) lines.push(`- ${value}`);
  lines.push('');
}

/** Append the contracts of an absorbed record. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function appendCondensedContracts(lines, contracts) {
  if (!Array.isArray(contracts) || contracts.length === 0) return;
  lines.push('#### Contracts');
  lines.push('');
  for (const contract of contracts) {
    lines.push(`- ${contract.id}: precondition=${contract.precondition}; postcondition=${contract.postcondition}; invariant=${contract.invariant}`);
  }
  lines.push('');
}

/** Fields of an absorbed record already rendered in the standard order. */
const CONDENSED_STANDARD_FIELDS = Object.freeze([
  'id', 'phaseId', 'key', 'status', 'title', 'condensedFrom',
  'background', 'scope', 'invariants', 'notes', 'investigation', 'boyScoutPlan',
  'referenceSection', 'testUnit', 'testIntegration', 'testExceptions',
  'contracts', 'acceptanceCriteria', 'changes',
]);

/** Whether a value carries information for the generic renderer. */
// [::TICKET::] PX-396, PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-396|PX-398) --for-spec --no-implementation-order`.
function hasRenderableValue(value) {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

/** Turn a field name into a Title Case heading. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function titleCaseField(field) {
  return field
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

/**
 * Render one generic field at the given heading level.
 *
 * @param {string[]} lines
 * @param {string} field
 * @param {*} value
 * @param {number} level — heading depth
 */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function appendGenericValue(lines, field, value, level) {
  if (!hasRenderableValue(value)) return;
  lines.push(`${'#'.repeat(level)} ${titleCaseField(field)}`);
  lines.push('');
  if (typeof value === 'string') {
    lines.push(demoteMarkdownHeadings(value));
  } else if (Array.isArray(value)) {
    for (const item of value) lines.push(`- ${typeof item === 'string' ? item : JSON.stringify(item)}`);
  } else {
    lines.push('```json');
    lines.push(JSON.stringify(value, null, 2));
    lines.push('```');
  }
  lines.push('');
}

/**
 * Top-level ticket fields the standard section set already renders.
 *
 * A field outside this list has no home in the standard Markdown, so it is
 * rendered under "## Additional Fields" rather than staying invisible.
 */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
const RENDERED_TOP_LEVEL_FIELDS = Object.freeze([
  'id', 'phaseId', 'status', 'title', 'specPath', 'nodeIds',
  'referenceSection', 'background', 'scope', 'default_files', 'sourcePaths',
  'targetStubs', 'targetCrimes', 'foundOmissions',
  'investigation', 'acceptanceCriteria', 'invariants', 'contracts', 'boyScoutPlan',
  'testUnit', 'testIntegration', 'testExceptions', 'planTestCode',
  'relatedTicketIds', 'changes', 'referenceUrls', 'rfcDiscrepancies', 'notes',
  'distribution', 'formulaObligations', 'prerequisites', 'condensedFrom',
]);

/**
 * Render every non-empty top-level field the standard sections do not name.
 *
 * @param {string[]} lines
 * @param {object} ticket
 */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function appendAdditionalTopLevelFields(lines, ticket) {
  const additional = Object.entries(ticket || {}).filter(([field, value]) => (
    !RENDERED_TOP_LEVEL_FIELDS.includes(field) && hasRenderableValue(value)
  ));
  if (additional.length === 0) return;

  lines.push('## Additional Fields');
  lines.push('');
  for (const [field, value] of additional) appendGenericValue(lines, field, value, 3);
}

/** Render a field the absorbed-record standard order does not name. */
// [::TICKET::] PX-396, PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-396|PX-398) --for-spec --no-implementation-order`.
function appendCondensedValue(lines, field, value) {
  appendGenericValue(lines, field, value, 4);
}

/**
 * The full absorbed records, in the original implementation order.
 *
 * Each record repeats the standard field order one heading level deeper, so a
 * reader can follow one absorbed ticket top to bottom without the survivor's
 * sections and the absorbed sections being mistaken for each other. A field the
 * standard order does not name is rendered afterwards, so no information in the
 * ledger can stay invisible.
 */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function renderCondensedFrom(ticket) {
  const absorbed = ticket?.condensedFrom?.tickets;
  if (!Array.isArray(absorbed) || absorbed.length === 0) return null;
  const lines = ['## Condensed From', ''];
  for (const entry of absorbed) {
    lines.push(`### ${entry.key}: ${entry.title} [${entry.status || 'todo'}]`);
    lines.push('');
    const record = entry.record ?? {};
    appendCondensedProse(lines, 'Background', record.background);
    appendCondensedList(lines, 'Scope', record.scope);
    appendCondensedProse(lines, 'Invariants', record.invariants);
    appendCondensedProse(lines, 'Notes', record.notes);
    appendCondensedProse(lines, 'Investigation', record.investigation);
    appendCondensedProse(lines, 'Boy Scout Rule', record.boyScoutPlan);
    appendCondensedProse(lines, 'RFC Reference', record.referenceSection);
    appendCondensedList(lines, 'Test Plan', [...(record.testUnit ?? []), ...(record.testIntegration ?? []), ...(record.testExceptions ?? [])]);
    appendCondensedContracts(lines, record.contracts);
    appendCondensedList(lines, 'Acceptance Criteria', record.acceptanceCriteria);
    appendCondensedList(lines, 'Changes', (record.changes ?? []).map((change) => change.description ?? JSON.stringify(change)));
    for (const [field, value] of Object.entries(record)) {
      if (CONDENSED_STANDARD_FIELDS.includes(field)) continue;
      appendCondensedValue(lines, field, value);
    }
  }
  return lines.join('\n');
}

// [::TICKET::] PX-321, PX-322, PX-324, PX-341, PX-362, PX-396, PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-321|PX-322|PX-324|PX-341|PX-362|PX-396|PX-398) --for-spec --no-implementation-order`.
function buildTicketMarkdown(ticketKey, ticket, tickets, ticketsDir, forSpec, noImplementationOrder, options = {}) {
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

  const condensationBanner = renderCondensationBanner(ticket, ticketKey);
  if (condensationBanner !== null) {
    lines.push(condensationBanner);
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
    lines.push(`node "$(git rev-parse --show-toplevel)/.claude/scripts/rfc-graph/query.js" --graph="${graphRel}" --source="${rfcRel}" --dirs-tree="${dirsRel}" --id=Nxxxx (NODE-ID, e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)`);
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
  const edgeContracts = Array.isArray(ticket.contracts)
    ? ticket.contracts.filter((contract) => typeof contract.stepId !== 'string')
    : [];
  if (edgeContracts.length > 0) {
    lines.push('## Contracts — mandatory 100% test coverage in TDD Red phase');
    lines.push('');
    for (const c of edgeContracts) {
      lines.push('### ' + (c.id || '?') + ' — ' + (c.sourceEdge || ''));
      lines.push('');
      lines.push('- **Precondition**: ' + (c.precondition || '(none)'));
      lines.push('- **Postcondition**: ' + (c.postcondition || '(none)'));
      lines.push('- **Invariant**: ' + (c.invariant || '(none)'));
      lines.push('');
    }
  }

  // Operation-boundary contracts (from the artifact step, merged through the sidecar)
  const stepContracts = Array.isArray(ticket.contracts)
    ? ticket.contracts.filter((contract) => typeof contract.stepId === 'string')
    : [];
  if (stepContracts.length > 0) {
    lines.push('## Operation-Boundary Contracts — mandatory 100% test coverage in TDD Red phase');
    lines.push('');
    for (const c of stepContracts) {
      // The generated C5xx id is the identity Gate S checks in Red test annotations.
      lines.push('### ' + (c.id || '?') + ' — ' + c.stepId + ' — sequence ' + (c.sequenceId || '?') + ' — operation ' + (c.operationId || '?'));
      lines.push('');
      if (typeof c.id === 'string' && c.id.length > 0) {
        lines.push('- **Red annotation**: `@verifies ' + c.id + '`');
      }
      lines.push('- **Precondition**: ' + (c.precondition || '(none)'));
      lines.push('- **Postcondition**: ' + (c.postcondition || '(none)'));
      lines.push('- **Invariant**: ' + (c.invariant || '(none)'));
      for (const axis of EXTRA_CONTRACT_AXES) {
        const rendered = renderContractAxis(c.contract, axis);
        if (rendered !== null) lines.push(`- **${axis}**: ${renderFactText(c.contract?.[axis])}`);
      }
      lines.push('- **Contract prose**: ' + (c.contractProse || '(none)'));
      lines.push('');
    }
  }

  // Distribution obligations (the machine-readable work a ticket owes)
  const distributionObligations = renderDistributionObligations(ticket, options);
  if (distributionObligations !== null) {
    lines.push(distributionObligations);
    lines.push('');
  }

  // Formula obligations (the specification mathematics this ticket realizes)
  const formulaObligations = renderFormulaObligations(ticket);
  if (formulaObligations !== null) {
    lines.push(formulaObligations);
    lines.push('');
  }

  // Implementation prerequisites (the per-ticket order split derived and the entry gate checks)
  const implementationPrerequisites = renderImplementationPrerequisites(ticket, tickets);
  if (implementationPrerequisites !== null) {
    lines.push(implementationPrerequisites);
    lines.push('');
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
      lines.push('node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=<Ticket KEY to show (e.g. P0-1)> --for-spec --no-implementation-order');
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

  // Reference URLs
  // [::TICKET::] PX-72, PX-75, PX-87 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-72|PX-75|PX-87) --for-spec --no-implementation-order`.
  if (ticket.referenceUrls && ticket.referenceUrls.length > 0) {
    lines.push('## Reference URLs');
    lines.push('');
    for (const u of ticket.referenceUrls) {
      lines.push(`- ${u}`);
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

  const condensedRecords = renderCondensedFrom(ticket);
  if (condensedRecords !== null) {
    lines.push(condensedRecords);
    lines.push('');
  }

  appendAdditionalTopLevelFields(lines, ticket);

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
    // A record stores the path home-relative, so it is expanded before it is resolved:
    // resolving first discards the base whenever the stored value is absolute, which is
    // how a record written on one machine came to point at that machine on every other.
    const specPath = ticket.specPath
      ? resolveStoredPath(ticket.specPath, ticketsDir)
      : resolveTicketSpecPath(ticketsDir, ticketKey);
    const specExists = specPath ? fs.existsSync(specPath) : false;
    lines.push(`| Spec-File | \`${makeRelative(specPath, ticketsDir)}\` | ${specExists} |`);
    lines.push(`| Pipeline Available | **${pipelineAvailable}** | - |`);
    lines.push('');
  }

  // A spec is a committed artefact: a home path that reached a ticket field as
  // prose is rendered as ~/ here, so a regenerated spec never names the machine.
  return toHomeRelativeText(lines.join('\n'));
}

// [::TICKET::] PX-324 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-324 --for-spec --no-implementation-order`.
// [::TICKET::] PX-331 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-331 --for-spec --no-implementation-order`.
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
  const viewPath = path.join(ticketsDir, 'SEQUENCES.json');
  let view = null;
  try {
    if (fs.existsSync(viewPath)) view = JSON.parse(fs.readFileSync(viewPath, 'utf8'));
  } catch {
    view = null;
  }
  // The registry is the only source of a crossed boundary's clauses. A missing or
  // unreadable manifest leaves the list empty; the renderer then prints MISSING rather
  // than inventing a contract, and the delivery gate refuses the ticket.
  let registry = [];
  try {
    const allocatePath = findAllocateManifest(ticketsDir);
    if (allocatePath !== null) {
      const allocate = JSON.parse(fs.readFileSync(allocatePath, 'utf8'));
      registry = Array.isArray(allocate?.contract_registry) ? allocate.contract_registry : [];
    }
  } catch {
    registry = [];
  }
  const output = buildTicketMarkdown(ticketKey, ticket, tickets, ticketsDir, forSpec, noImplementationOrder, { view, ticketsDocument: tickets, registry });
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

module.exports = {
  parseArgs,
  buildTicketNotFoundMarkdown,
  buildTicketMarkdown,
  renderCondensationBanner,
  renderCondensedFrom,
  parseRelatedTicketIds,
  resolveRfcPaths,
  makeRelative,
  isValidTicketKey,
  parseTicketKey,
  findTicket,
  renderDistributionObligations,
  renderFormulaObligations,
  renderImplementationPrerequisites,
  renderWorkShare,
  stepOwnerLabel,
  publicTicketKey,
  viewSequenceUnit,
  renderObligationValue,
  renderFactText,
  renderContractAxis,
  EXTRA_CONTRACT_AXES,
  OPERATION_OBLIGATION_FIELDS,
  RENDERED_TOP_LEVEL_FIELDS,
  titleCaseField,
  appendGenericValue,
  appendAdditionalTopLevelFields,
  main,
};
