#!/usr/bin/env node

/**
 * show-ticket-context.js — make-ticket Step 1
 *
 * Investigates the state of the ticket specified by --ticket-key and outputs
 * to stdout in AI-readable Markdown format. The output includes all Ticket.json
 * fields and can serve as a spec document.
 *
 * With --for-spec flag, outputs in a format suitable for writing to a spec file
 * (omits IMPORTANT banner / Pipeline Context, prepends Universal Testing Rules).
 *
 * CLI: show-ticket-context.js --ticket-key=<P{id}-{id}|PX-{id}>
 *       [--tickets=<Tickets.json>] [--for-spec]
 */

const fs = require('fs');
const path = require('path');
const { resolveTicketSpecPath } = require('../lib/tickets');

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

/** Parse command line arguments */
function parseArgs(testArgs) {
  const args = testArgs || process.argv.slice(2);
  let ticketsPath = '';
  let ticketKey = '';
  let forSpec = false;
  let noTestRules = false;
  let plan = false;
  let review = false;
  for (const arg of args) {
    if (arg.startsWith('--tickets=')) {
      ticketsPath = arg.slice('--tickets='.length);
    } else if (arg.startsWith('--ticket-key=')) {
      ticketKey = arg.slice('--ticket-key='.length);
    } else if (arg === '--for-spec') {
      forSpec = true;
    } else if (arg === '--no-test-rules') {
      noTestRules = true;
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
  return { ticketsPath, ticketKey, forSpec, noTestRules, plan, review };
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
    const rfcPath = path.resolve(ticketsDir, resolvedPaths.rfcPath);
    const graphPath = path.resolve(ticketsDir, resolvedPaths.graphPath);
    const dirsTreePath = path.resolve(ticketsDir, resolvedPaths.dirsTreePath);
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

/** Convert absolute path to relative from ticketsDir (keep absolute if can't shorten) */
function makeRelative(absPath, base) {
  try {
    const rel = path.relative(base, absPath);
    return rel.startsWith('..') ? absPath : rel;
  } catch {
    return absPath;
  }
}

/** Parse relatedTicketIds string into an array of { relation, ticket, description } */
function parseRelatedTicketIds(raw) {
  if (!raw) return [];
  const items = [];
  const seen = new Set();
  const regex = /\[(\w+)\]\s+(\S+)\s+\(([^)]*)\)/g;
  let m;
  while ((m = regex.exec(raw)) !== null) {
    const key = `${m[2]}|${m[1]}`;
    if (!seen.has(key)) {
      seen.add(key);
      items.push({ relation: m[1], ticket: m[2], description: m[3] });
    }
  }
  return items;
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
  lines.push('### Implementation File Paths');
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
      `チケット \`${ticketKey}\` は Tickets.json に存在しません。`,
      '/plan-ticket を中断してください。',
      '',
    ].join('\n');
  }
  if (review) {
    return [
      `# ${ticketKey}: Not Found`,
      '',
      `チケット \`${ticketKey}\` は Tickets.json に存在しません。`,
      '/review-ticket を中断してください。',
      '',
    ].join('\n');
  }
  return [
    `# ${ticketKey}: Not Found`,
    '',
    `チケット \`${ticketKey}\` は Tickets.json に存在しません。`,
    '',
    '**事前に会話からチケット化を依頼された場合**:',
    '以下のコマンドを実行してください。',
    '',
    '```bash',
    `node .claude/scripts/tickets/ensure-ticket.js \\`,
    `  --ticket-key=${ticketKey} \\`,
    '  --title="（会話から確定したタイトル）"',
    '```',
    '',
    '**事前の会話がない場合**:',
    '「ticket & spec 化する事前情報が無いため /make-ticket を中断します。」とユーザに回答して中断してください。',
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

function buildTicketMarkdown(ticketKey, ticket, tickets, ticketsDir, forSpec, noTestRules) {
  const lines = [];

  // In --for-spec mode, output Universal Testing Rules first (before YAML frontmatter)
  if (forSpec && !noTestRules) {
    lines.push('**Universal Testing Rules**');
    lines.push('');
    lines.push('Write all code under the following non-negotiable rules:');
    lines.push('');
    lines.push('1. Tests must be comprehensive and exhaustive for all observable behavior, including edge cases, failure modes, and invariants. Any behavior not covered by tests is considered undefined and unacceptable.');
    lines.push('');
    lines.push('2. Do not write or accept any implementation whose correctness cannot be fully validated through tests. If correctness cannot be proven via tests, the implementation is invalid and must be redesigned.');
    lines.push('');
    lines.push('3. If a feature cannot be completely and deterministically tested, treat this as a design failure. Refactor the architecture until full testability is achieved.');
    lines.push('');
    lines.push('4. Tests are not a scoreboard and must never be treated as a goal in themselves. Passing tests does not imply correctness unless the tests fully capture the intended behavior.');
    lines.push('');
    lines.push('5. It is strictly forbidden to modify or weaken tests to make an implementation pass. The implementation must conform to the tests, not the other way around.');
    lines.push('');
    lines.push('6. Implementation is considered complete only when:');
    lines.push('   - The tests fully and precisely specify the intended behavior.');
    lines.push('   - The implementation passes all tests without exception.');
    lines.push('   - The implementation\'s correctness is demonstrably guaranteed by those tests.');
    lines.push('');
    lines.push('7. Any gap between test coverage and intended behavior is a critical defect. Resolve such gaps before considering the work complete.');
    lines.push('');
  }

  // Omit IMPORTANT banner in --for-spec mode
  if (!forSpec) {
    lines.push('> [!IMPORTANT]');
    lines.push('> The following content is an initial ticket-level draft and shall not be treated as a complete specification. As part of the /make-ticket workflow, it must be reviewed against the actual design, related nodes, related tickets, and the implementation state of the source code, and then expanded into a detailed and accurate specification.');
    lines.push('>');
    lines.push('> The specification must fully reflect all information contained in the ticket. The existence of ticket information that is not captured in the specification is prohibited and shall be treated as a defect in the specification.\n');
  }

  // H1: Title + status badge
  const statusBadge = ticket.status || 'todo';
  lines.push(`# ${ticketKey}: ${ticket.title} [${statusBadge}]`);
  lines.push('');

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

  // Changes (implementation before/after recorded by start-ticket)
  if (ticket.changes && ticket.changes.length > 0) {
    lines.push('## Changes');
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
    lines.push('## RFC Discrepancies');
    lines.push('');
    for (const d of ticket.rfcDiscrepancies) {
      lines.push(`- ${d}`);
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
        lines.push(`| ${row.ticket} | ${row.relation} | ${row.description} |`);
      }
      lines.push('');
      lines.push('### To show related tickets details');
      lines.push('');
      lines.push('```');
      lines.push('node .claude/scripts/tickets/show-ticket-context.js --ticket-key=<Ticket KEY to show (e.g. P0-1)> --for-spec --no-test-rules');
      lines.push('```');
      lines.push('');
    }
  }

  // Notes
  if (ticket.notes) {
    lines.push('## Notes');
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
  const { ticketsPath, ticketKey, forSpec, noTestRules, plan, review } = parseArgs();

  if (!ticketKey || !isValidTicketKey(ticketKey)) {
    console.error('Error: --ticket-key は P{phaseId}-{ticketId} 形式（例: P0-1, PX-53）で指定してください。');
    process.exit(EXIT_FAILURE);
  }

  if (!fs.existsSync(ticketsPath)) {
    console.error(`Error: Tickets.json が見つかりません: ${ticketsPath}`);
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
  const output = buildTicketMarkdown(ticketKey, ticket, tickets, ticketsDir, forSpec, noTestRules);
  console.log(output);
  process.exit(EXIT_SUCCESS);
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, buildTicketNotFoundMarkdown, buildTicketMarkdown, parseRelatedTicketIds, resolveRfcPaths, isValidTicketKey, parseTicketKey, findTicket, main };
