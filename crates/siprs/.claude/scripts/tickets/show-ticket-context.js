#!/usr/bin/env node

/**
 * show-ticket-context.js — make-ticket の Step 1
 *
 * --ticket-key で指定されたチケットの状態を調査し、AI が読みやすい
 * Markdown 形式で stdout に出力する。Tickets.json の全フィールドを
 * 表示するため、出力自体が spec 文書として成立する。
 *
 * --write-spec フラグを指定すると、spec ファイルへの書き出しに適した
 * 形式で出力する（IMPORTANT バナー / Pipeline Context を省略し、
 * Universal Testing Rules を前置する）。
 *
 * CLI: show-ticket-context.js --ticket-key=<P{id}-{id}|PX-{id}>
 *       [--tickets=<Tickets.json>] [--write-spec]
 */

const fs = require('fs');
const path = require('path');

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

/** コマンドライン引数をパースする */
function parseArgs(testArgs) {
  const args = testArgs || process.argv.slice(2);
  let ticketsPath = '';
  let ticketKey = '';
  let writeSpec = false;
  for (const arg of args) {
    if (arg.startsWith('--tickets=')) {
      ticketsPath = arg.slice('--tickets='.length);
    } else if (arg.startsWith('--ticket-key=')) {
      ticketKey = arg.slice('--ticket-key='.length);
    } else if (arg === '--write-spec') {
      writeSpec = true;
    }
  }
  if (!ticketsPath) {
    ticketsPath = path.resolve('Tickets.json');
  } else {
    ticketsPath = path.resolve(ticketsPath);
  }
  return { ticketsPath, ticketKey, writeSpec };
}

/** ticketKey が P{phaseId}-{ticketId} または PX-{id} 形式か検証する */
function isValidTicketKey(ticketKey) {
  return /^P([Xx]|-?\d+)-(\d+)$/.test(ticketKey);
}

/** ticketKey をパースして phaseId / ticketId を返す */
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

/** Tickets.json から該当チケットを検索する */
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
 * Tickets.json の metadata から RFC / Graph / Dirs-Tree のパスを解決する
 * （resolve-ticket-context.js の resolveRfcPaths と同一ロジック）
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

/** 絶対パスを ticketsDir からの相対パスに変換する（短縮できない場合は絶対パスのまま） */
function makeRelative(absPath, base) {
  try {
    const rel = path.relative(base, absPath);
    return rel.startsWith('..') ? absPath : rel;
  } catch {
    return absPath;
  }
}

/** relatedTicketIds 文字列をパースして { relation, ticket, description } の配列に変換する */
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

/** チケット不在時の Markdown を生成する */
function buildTicketNotFoundMarkdown(ticketKey) {
  return [
    `# ${ticketKey}: Not Found`,
    '',
    `チケット \`${ticketKey}\` は Tickets.json に存在しません。`,
    '',
    '**事前に会話からチケット化を依頼された場合**:',
    '以下のコマンドを実行してください。',
    '',
    '```bash',
    `node .claude/scripts/tickets/ensure-ticket-and-spec.js \\`,
    `  --ticket-key=${ticketKey} \\`,
    '  --title="（会話から確定したタイトル）"',
    '```',
    '',
    '**事前の会話がない場合**:',
    '「ticket & spec 化する事前情報が無いため /make-ticket を中断します。」とユーザに回答して中断してください。',
    '',
  ].join('\n');
}

/** チケット情報の Markdown を生成する */
function buildTicketMarkdown(ticketKey, ticket, tickets, ticketsDir, writeSpec) {
  const lines = [];

  // --write-spec モードでは IMPORTANT バナーを出力しない
  if (!writeSpec) {
    lines.push('> [!IMPORTANT]');
    lines.push('> The following content is an initial ticket-level draft and shall not be treated as a complete specification. As part of the /make-ticket workflow, it must be reviewed against the actual design, related nodes, related tickets, and the implementation state of the source code, and then expanded into a detailed and accurate specification.');
    lines.push('>');
    lines.push('> The specification must fully reflect all information contained in the ticket. The existence of ticket information that is not captured in the specification is prohibited and shall be treated as a defect in the specification.\n');
  }

  // --write-spec モードでは冒頭に Universal Testing Rules を前置する
  if (writeSpec) {
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

  // H1: タイトル + ステータスバッジ
  const statusBadge = ticket.status ? ` [${ticket.status}]` : '';
  lines.push(`# ${ticketKey}: ${ticket.title}${statusBadge}`);
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

  // Investigation
  if (ticket.investigation) {
    lines.push('## Investigation');
    lines.push('');
    lines.push(ticket.investigation);
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

  // ---- パイプライン情報の解決 ----
  const rawSource = (tickets.metadata && tickets.metadata.source) || '';
  const resolvedPaths = (tickets.metadata && tickets.metadata.resolvedPaths) || null;
  const { rfcPath, graphPath, dirsTreePath } = resolveRfcPaths(rawSource, ticketsDir, resolvedPaths);
  const rfcExists = rfcPath ? fs.existsSync(rfcPath) : false;
  const graphExists = graphPath ? fs.existsSync(graphPath) : false;
  const dirsExists = dirsTreePath ? fs.existsSync(dirsTreePath) : false;
  const pipelineAvailable = !!(
    ticketKey && rfcPath && rfcExists && rfcPath.toLowerCase().endsWith('.md') && graphExists && dirsExists
  );

  // Graph セクション（pipelineAvailable かつ nodeIds が存在する場合のみ）
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
  }

  // Invariants
  if (ticket.invariants) {
    lines.push('## Invariants');
    lines.push('');
    lines.push(ticket.invariants);
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
      lines.push('| Ticket | Relation | Description |');
      lines.push('|--------|----------|-------------|');
      for (const row of rows) {
        lines.push(`| ${row.ticket} | ${row.relation} | ${row.description} |`);
      }
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

  // Pipeline Context（--write-spec モードでは出力しない）
  if (!writeSpec) {
    lines.push('## Pipeline Context');
    lines.push('');
    lines.push('| Resource | Path | Exist |');
    lines.push('|----------|------|-------|');
    if (rfcPath) lines.push(`| RFC | \`${makeRelative(rfcPath, ticketsDir)}\` | ${rfcExists} |`);
    if (graphPath) lines.push(`| Graph | \`${makeRelative(graphPath, ticketsDir)}\` | ${graphExists} |`);
    if (dirsTreePath) lines.push(`| Dirs-Tree | \`${makeRelative(dirsTreePath, ticketsDir)}\` | ${dirsExists} |`);
    const specPath = ticket.specPath ? path.resolve(ticketsDir, ticket.specPath) : '';
    const specExists = specPath ? fs.existsSync(specPath) : false;
    if (specPath) lines.push(`| Spec-File | \`${makeRelative(specPath, ticketsDir)}\` | ${specExists} |`);
    lines.push(`| Pipeline Available | **${pipelineAvailable}** | - |`);
    lines.push('');
  }

  return lines.join('\n');
}

function main() {
  const { ticketsPath, ticketKey, writeSpec } = parseArgs();

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
    console.log(buildTicketNotFoundMarkdown(ticketKey));
    process.exit(EXIT_SUCCESS);
  }

  const ticketsDir = path.dirname(ticketsPath);
  const output = buildTicketMarkdown(ticketKey, ticket, tickets, ticketsDir, writeSpec);
  console.log(output);
  process.exit(EXIT_SUCCESS);
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, buildTicketNotFoundMarkdown, buildTicketMarkdown, parseRelatedTicketIds, resolveRfcPaths, isValidTicketKey, parseTicketKey, findTicket, main };
