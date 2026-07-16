#!/usr/bin/env node

/**
 * dump-node-context-to-spec.js — 設計コンテキストの spec 自動書き込み
 *
 * チケットの nodeIds を起点に、GRAPH.json（ノード詳細・エッジ関係性）と
 * Dirs-Tree.json（実装先ファイルパス）の情報を機械的に spec ファイルに書き込む。
 *
 * CLI:
 *   dump-node-context-to-spec.js \
 *     --tickets=<path> --graph=<path> --dirs-tree=<path> --ticket-key=<key>
 *     [--ticket-key=<key2> ...]
 *
 * 出力ブロック:
 *   Block 1: ノード詳細（id, kind, language, slug, title, summary, headingRefs）
 *   Block 2: エッジ関係性（エッジ種別グループ + ★/☆ 区別）
 *   Block 3: 実装ファイルパス（default_files + 関連ノードのファイルパス）
 */

const fs = require('fs');
const path = require('path');
const { resolveSpecPath } = require('../lib/resolve-spec-path');

// ============================================================
// 定数定義
// ============================================================

/** Tickets.json パスを指定するCLI引数のプレフィックス */
const TICKETS_ARG_PREFIX = '--tickets=';

/** グラフファイルパスを指定するCLI引数のプレフィックス */
const GRAPH_ARG_PREFIX = '--graph=';

/** ディレクトリツリーパスを指定するCLI引数のプレフィックス */
const DIRS_TREE_ARG_PREFIX = '--dirs-tree=';

/** チケットキーを指定するCLI引数のプレフィックス */
const TICKET_KEY_ARG_PREFIX = '--ticket-key=';

/** 正常終了コード */
const EXIT_SUCCESS = 0;

/** 異常終了コード */
const EXIT_FAILURE = 1;

/** 設計コンテキストの最上位見出し */
const SECTION_HEADING = '### 設計コンテキスト';

/** エッジ種別の優先順位（実装影響度順） */
const EDGE_PRIORITY = [
  'depends_on',
  'precedes',
  'triggers',
  'constrains',
  'conflicts_with',
  'refines',
  'extends',
  'implements',
  'supersedes',
  'references',
  'part_of',
  'validates',
];

/** チケット内ノードの凡例 */
const IN_TICKET_MARK = '★';
/** チケット外ノードの凡例 */
const OUT_TICKET_MARK = '☆';

// ============================================================
// CLI引数パース
// ============================================================

/**
 * コマンドライン引数をパースする
 *
 * @param {string[]} [testArgs] — テスト用引数配列（省略時は process.argv.slice(2)）
 * @returns {{ ticketsPath: string, graphPath: string, dirsTreePath: string, ticketKeys: string[] }}
 * @throws {Error} 引数が不正な場合
 */
function parseArguments(testArgs) {
  const args = testArgs || process.argv.slice(2);

  // --help オプション
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    printUsage();
    process.exit(EXIT_SUCCESS);
  }

  // 最低3つの引数が必要（--tickets, --graph, --dirs-tree）
  if (args.length < 3) {
    throw new Error(
      '引数が不足しています。\n' +
      '  Usage: dump-node-context-to-spec.js --tickets=<path> --graph=<path> --dirs-tree=<path> --ticket-key=<key>'
    );
  }

  let ticketsPath = '';
  let graphPath = '';
  let dirsTreePath = '';
  const ticketKeys = [];

  for (const arg of args) {
    if (arg.startsWith(TICKETS_ARG_PREFIX)) {
      ticketsPath = arg.slice(TICKETS_ARG_PREFIX.length);
    } else if (arg.startsWith(GRAPH_ARG_PREFIX)) {
      graphPath = arg.slice(GRAPH_ARG_PREFIX.length);
    } else if (arg.startsWith(DIRS_TREE_ARG_PREFIX)) {
      dirsTreePath = arg.slice(DIRS_TREE_ARG_PREFIX.length);
    } else if (arg.startsWith(TICKET_KEY_ARG_PREFIX)) {
      ticketKeys.push(arg.slice(TICKET_KEY_ARG_PREFIX.length));
    }
  }

  if (!ticketsPath) {
    throw new Error('--tickets=<path> is not specified.');
  }
  if (!graphPath) {
    throw new Error('--graph=<path> is not specified.');
  }
  if (!dirsTreePath) {
    throw new Error('--dirs-tree=<path> is not specified.');
  }
  if (ticketKeys.length === 0) {
    throw new Error('--ticket-key=<key> is not specified (need at least 1).');
  }

  return { ticketsPath, graphPath, dirsTreePath, ticketKeys };
}

// ============================================================
// ファイル読み込み
// ============================================================

/**
 * JSON ファイルを読み込む
 *
 * @param {string} filePath — JSON ファイルのパス
 * @returns {Object} パース済みJSONデータ
 * @throws {Error} ファイル不在またはJSON不正
 */
function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

/**
 * Tickets.json を読み込む
 *
 * @param {string} ticketsPath — Tickets.json のパス
 * @returns {Object} パース済みデータ
 */
function loadTickets(ticketsPath) {
  return loadJson(ticketsPath);
}

/**
 * GRAPH.json を読み込む
 *
 * @param {string} graphPath — GRAPH.json のパス
 * @returns {Object} パース済みデータ
 */
function loadGraph(graphPath) {
  return loadJson(graphPath);
}

/**
 * Dirs-Tree.json を読み込む
 *
 * @param {string} dirsTreePath — Dirs-Tree.json のパス
 * @returns {Object} パース済みデータ
 */
function loadDirsTree(dirsTreePath) {
  return loadJson(dirsTreePath);
}

// ============================================================
// データ収集（純粋関数）
// ============================================================

/**
 * Tickets.json から特定チケットの nodeIds を取得する
 *
 * @param {Object} tickets — パース済みTickets.json
 * @param {string} ticketKey — チケットキー（"P{phaseId}-{ticketId}" または "PX-{ticketId}"）
 * @returns {{ nodeIds: string[], defaultFiles: string[], title: string } | null}
 *   見つからない場合は null
 */
function collectTicketNodes(tickets, ticketKey) {
  // ticketKey のパース
  const match = ticketKey.match(/^P(-?\d+)-(\d+)$/);
  if (!match) {
    return null;
  }
  const phaseId = parseInt(match[1], 10);
  const ticketId = parseInt(match[2], 10);

  const phases = tickets.phases || [];
  for (const phase of phases) {
    if (phase.id !== phaseId && phase.phaseId !== phaseId) {
      continue;
    }
    const phaseTickets = phase.tickets || [];
    for (const ticket of phaseTickets) {
      if (ticket.id === ticketId) {
        return {
          nodeIds: ticket.nodeIDs || ticket.nodeIds || [],
          defaultFiles: ticket.default_files || [],
          title: ticket.title || '',
        };
      }
    }
  }
  return null;
}

/**
 * GRAPH.json から指定された nodeIds のノード詳細を収集する
 *
 * @param {Object} graph — パース済みGRAPH.json
 * @param {string[]} nodeIds — 収集対象のノードID配列
 * @returns {Array} ノード詳細オブジェクトの配列
 */
function collectNodeDetails(graph, nodeIds) {
  const nodeSet = new Set(nodeIds);
  return (graph.nodes || []).filter(n => nodeSet.has(n.id));
}

/**
 * GRAPH.json から指定された nodeIds を含む全エッジを収集する
 *
 * @param {Object} graph — パース済みGRAPH.json
 * @param {string[]} nodeIds — 自チケットのノードID配列
 * @returns {Array<{ from: string, to: string, type: string, fromInTicket: boolean, toInTicket: boolean }>}
 */
function collectEdges(graph, nodeIds) {
  const nodeSet = new Set(nodeIds);
  return (graph.edges || []).filter(e => nodeSet.has(e.from) || nodeSet.has(e.to)).map(e => ({
    from: e.from,
    to: e.to,
    type: e.type,
    fromInTicket: nodeSet.has(e.from),
    toInTicket: nodeSet.has(e.to),
  }));
}

/**
 * Dirs-Tree.json から nodeId → filePath の逆引きマップを構築する
 *
 * 全ツリーを再帰的に走査し、mappedNodeIds を持つノードからマップを構築する。
 *
 * @param {Object} dirsTree — パース済みDirs-Tree.json
 * @returns {Object<string, string>} nodeId → filePath のマッピング
 */
function buildNodeIdToPathMap(dirsTree) {
  const map = {};
  const trees = dirsTree.trees || {};

  for (const lang of Object.keys(trees)) {
    traverseTree(trees[lang], '', map);
  }

  return map;
}

/**
 * ツリーノードを再帰的に走査し nodeId → filePath マップに追加する
 *
 * @param {Object} node — ツリーノード
 * @param {string} parentPath — 親ディレクトリからの累積パス
 * @param {Object<string, string>} map — 書き込み先マップ
 */
function traverseTree(node, parentPath, map) {
  const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;

  if (Array.isArray(node.mappedNodeIds)) {
    for (const nodeId of node.mappedNodeIds) {
      if (!map[nodeId]) {
        map[nodeId] = currentPath;
      }
    }
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      traverseTree(child, currentPath, map);
    }
  }
}

// ============================================================
// グラフノードのタイトル解決ヘルパー
// ============================================================

/**
 * ノードIDからタイトルを解決する
 *
 * @param {string} nodeId — ノードID
 * @param {Array} nodes — GRAPH.json の nodes 配列
 * @returns {string} ノードのタイトル（見つからない場合は nodeId 自身）
 */
function resolveNodeTitle(nodeId, nodes) {
  const found = nodes.find(n => n.id === nodeId);
  return found ? found.title : nodeId;
}

// ============================================================
// フォーマット（純粋関数）
// ============================================================

/**
 * Block 1: ノード詳細のMarkdownを生成する
 *
 * @param {Array} nodes — ノード詳細配列
 * @param {string} ticketTitle — チケットタイトル
 * @returns {string} Markdownセクション文字列
 */
function formatNodeDetailsBlock(nodes, ticketTitle) {
  if (!nodes.length) {
    return '';
  }

  const lines = [
    `#### 設計コンテキスト: ノード詳細`,
    ``,
    `チケット「${ticketTitle}」に統合されたグラフノード（${nodes.length}件）:`,
    ``,
    `| ID | kind | language | slug | title | 要約 |`,
    `|----|------|----------|------|-------|------|`,
  ];

  for (const node of nodes) {
    const summary = (node.summary || '').slice(0, 50);
    lines.push(`| ${node.id} | ${node.kind || '-'} | ${node.language || '-'} | ${node.slug || '-'} | ${node.title || '-'} | ${summary} |`);
  }

  lines.push('', '##### headingRefs（RFC参照位置）', '');
  lines.push(`| ID | 見出しレベル | 見出しテキスト |`);
  lines.push(`|----|-------------|---------------|`);

  for (const node of nodes) {
    if (Array.isArray(node.headingRefs)) {
      for (const ref of node.headingRefs) {
        const texts = (ref.texts || []).join(', ');
        lines.push(`| ${node.id} | ${ref.heading || '-'} | ${texts} |`);
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Block 2: エッジ関係性のMarkdownを生成する
 *
 * @param {Array} edges — エッジ配列（collectEdges の出力）
 * @param {Array} nodes — 全ノード配列（タイトル解決用）
 * @returns {string} Markdownセクション文字列
 */
function formatEdgeRelationsBlock(edges, nodes) {
  if (!edges.length) {
    return '';
  }

  // エッジ種別ごとにグループ化
  const groups = {};
  for (const e of edges) {
    if (!groups[e.type]) {
      groups[e.type] = [];
    }
    groups[e.type].push(e);
  }

  const lines = [
    `#### 設計コンテキスト: ノード間関係性（エッジ）`,
    ``,
    `凡例: ${IN_TICKET_MARK} = 自チケット内ノード、${OUT_TICKET_MARK} = 他チケット/フェーズのノード`,
    ``,
  ];

  // エッジ種別優先度順に出力
  for (const edgeType of EDGE_PRIORITY) {
    const group = groups[edgeType];
    if (!group || !group.length) continue;

    const typeLabel = edgeType.replace(/_/g, ' ');
    lines.push(`##### ${edgeType}（${typeLabel}）`);
    lines.push(`| From | → | To |`);
    lines.push(`|------|---|----|`);

    for (const e of group) {
      const fromMark = e.fromInTicket ? IN_TICKET_MARK : OUT_TICKET_MARK;
      const toMark = e.toInTicket ? IN_TICKET_MARK : OUT_TICKET_MARK;
      const fromTitle = resolveNodeTitle(e.from, nodes).slice(0, 50);
      const toTitle = resolveNodeTitle(e.to, nodes).slice(0, 50);
      lines.push(`| ${fromMark} ${e.from} (${fromTitle}) | → | ${toMark} ${e.to} (${toTitle}) |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Block 3: 実装ファイルパスのMarkdownを生成する
 *
 * @param {Array} nodes — ノード詳細配列
 * @param {Array} edges — エッジ配列
 * @param {Object} dirsTree — パース済みDirs-Tree.json
 * @param {{ defaultFiles: string[], title: string }} ticketInfo — チケット情報
 * @returns {string} Markdownセクション文字列
 */
function formatFilePathsBlock(nodes, edges, dirsTree, ticketInfo) {
  const nodeIdToPath = buildNodeIdToPathMap(dirsTree);
  const lines = [
    `#### 設計コンテキスト: 実装ファイルパス`,
    ``,
  ];

  // default_files が存在する場合のみ出力
  const defaultFiles = ticketInfo.defaultFiles || [];
  if (defaultFiles.length > 0) {
    lines.push(`##### 本チケットの実装先（default_files）`);
    for (const df of defaultFiles) {
      // このファイルにマッピングされる nodeId を特定
      const mappedNodeIds = nodes.filter(n => {
        const pathForNode = nodeIdToPath[n.id];
        return pathForNode && df.includes(pathForNode);
      }).map(n => n.id);
      const suffix = mappedNodeIds.length ? ` (${mappedNodeIds.join(', ')})` : '';
      lines.push(`- \`${df}\`${suffix}`);
    }
    lines.push('');
  }

  // 関連ノードのファイルパス
  const relatedPaths = [];
  const seenPaths = new Set();

  for (const e of edges) {
    // 自チケット外のノードを対象に
    const externalNodeIds = [];
    if (!e.fromInTicket) externalNodeIds.push(e.from);
    if (!e.toInTicket) externalNodeIds.push(e.to);

    for (const extId of externalNodeIds) {
      const filePath = nodeIdToPath[extId];
      if (filePath && !seenPaths.has(filePath)) {
        seenPaths.add(filePath);
        relatedPaths.push({
          nodeId: extId,
          filePath: filePath,
          relation: e.type,
          title: resolveNodeTitle(extId, nodes),
        });
      }
    }
  }

  if (relatedPaths.length > 0) {
    lines.push(`##### 関連ノードの実装先（エッジ接続先）`);
    lines.push(`| ノード | ファイルパス | 関係 |`);
    lines.push(`|--------|-------------|------|`);
    for (const rp of relatedPaths) {
      lines.push(`| ${rp.nodeId} (${rp.title.slice(0, 30)}) | \`${rp.filePath}\` | ${rp.relation} |`);
    }
    lines.push('');
  }

  // 定型案内文
  lines.push(`##### 実装ファイル冒頭コメントの活用`);
  lines.push(``);
  lines.push(`上記の各実装ファイルを開くと、ファイル先頭に \`Initial Design Artifact — RFC-driven Implementation\``);
  lines.push(`コメントブロックが埋め込まれている。このブロックには query.js 探索コマンドや`);
  lines.push(`エッジ関係のクロスリファレンスが含まれている。実装中にノード間の関係性を`);
  lines.push(`再確認したい場合は、このコメントブロック内のコマンドを直接利用すること。`);
  lines.push(``);

  return lines.join('\n');
}

/**
 * 3ブロックを結合し、最上位見出しを付与する
 *
 * @param {string} block1 — ノード詳細ブロック
 * @param {string} block2 — エッジ関係ブロック
 * @param {string} block3 — ファイルパスブロック
 * @param {string} graphFileName — グラフファイル名
 * @returns {string} 完全なセクション文字列
 */
function combineBlocks(block1, block2, block3, graphFileName) {
  const parts = [SECTION_HEADING, '', `グラフファイル: ${graphFileName}`, ''];

  if (block1) parts.push(block1);
  if (block2) parts.push(block2);
  if (block3) parts.push(block3);

  return parts.join('\n');
}

// ============================================================
// ファイル書き込み（冪等）
// ============================================================

/**
 * spec ファイルにセクションを追記する（冪等）
 *
 * 既に同一のセクション見出しが spec ファイル内に存在する場合は追記をスキップする。
 *
 * @param {string} specPath — spec ファイルのパス
 * @param {string} section — 追記するセクション文字列
 * @returns {boolean} 追記した場合は true、スキップした場合は false
 */
function appendToSpec(specPath, section) {
  if (!fs.existsSync(specPath)) {
    return false;
  }
  const existingContent = fs.readFileSync(specPath, 'utf8');

  // 冪等性: 既に同一セクション見出しが存在する場合はスキップ
  const sectionHeading = section.split('\n')[0].trim();
  if (existingContent.includes(sectionHeading)) {
    return false;
  }

  const newContent = existingContent.trimEnd() + '\n\n' + section + '\n';
  fs.writeFileSync(specPath, newContent, 'utf8');
  return true;
}

// ============================================================
// ヘルプ表示
// ============================================================

/**
 * 使用方法を表示する
 */
function printUsage() {
  console.log(
    'dump-node-context-to-spec.js — Auto-write design context to spec\n' +
    '\n' +
    'Usage:\n' +
    '  dump-node-context-to-spec.js --tickets=<path> --graph=<path> --dirs-tree=<path> --ticket-key=<key>\n' +
    '    [--ticket-key=<key2> ...]\n' +
    '\n' +
    'Options:\n' +
    '  --tickets=<path>      Path to Tickets.json\n' +
    '  --graph=<path>        Path to GRAPH.json\n' +
    '  --dirs-tree=<path>    Path to Dirs-Tree.json\n' +
    '  --ticket-key=<key>    Ticket key (repeatable). At least one required\n' +
    '\n' +
    'Output blocks:\n' +
    '  Block 1: Node details (id/kind/language/slug/title/summary/headingRefs)\n' +
    '  Block 2: Edge relationships (type groups + ★/☆ distinction)\n' +
    '  Block 3: Implementation file paths (default_files + Dirs-Tree resolution)\n' +
    '\n' +
    'Exit codes:\n' +
    '  0  Success\n' +
    '  1  Argument error or file read error\n'
  );
}

// ============================================================
// エントリポイント
// ============================================================

/**
 * main — CLIエントリポイント
 *
 * 1. 引数パース
 * 2. Tickets.json / GRAPH.json / Dirs-Tree.json 読み込み
 * 3. 各 --ticket-key について:
 *    a. nodeIds 収集
 *    b. ノード詳細収集 + Block 1 生成
 *    c. エッジ収集 + Block 2 生成
 *    d. ファイルパス収集 + Block 3 生成
 *    e. ブロック結合
 *    f. spec パス解決 + 追記
 *
 * 全エラーは3段テンプレートで stderr に出力し、終了コード1で終了する。
 */
function main() {
  let ticketsPath, graphPath, dirsTreePath, ticketKeys;

  try {
    const parsed = parseArguments();
    ticketsPath = parsed.ticketsPath;
    graphPath = parsed.graphPath;
    dirsTreePath = parsed.dirsTreePath;
    ticketKeys = parsed.ticketKeys;
  } catch (parseError) {
    process.stderr.write(
      `[ERROR] 引数のパースに失敗しました。\n` +
      `原因: ${parseError.message}\n` +
      `対応: 正しい引数で再実行してください。\n`
    );
    process.exit(EXIT_FAILURE);
  }

  // ファイル読み込み
  let tickets, graph, dirsTree;
  try {
    tickets = loadTickets(ticketsPath);
    graph = loadGraph(graphPath);
    dirsTree = loadDirsTree(dirsTreePath);
  } catch (loadError) {
    process.stderr.write(
      `[ERROR] ファイルの読み込みに失敗しました。\n` +
      `原因: ${loadError.message}\n` +
      `対応: 各ファイルパスが正しいか確認してください。\n`
    );
    process.exit(EXIT_FAILURE);
  }

  const graphFileName = path.basename(graphPath);
  const allNodes = graph.nodes || [];

  for (const ticketKey of ticketKeys) {
    // チケット情報 + nodeIds の収集
    const ticketInfo = collectTicketNodes(tickets, ticketKey);
    if (!ticketInfo) {
      process.stderr.write(
        `[ERROR] チケット ${ticketKey} が見つかりません。\n` +
        `原因: Tickets.json に該当するチケットが存在しません。\n` +
        `対応: 正しいチケットキーを指定してください。\n`
      );
      process.exit(EXIT_FAILURE);
    }

    const nodeIds = ticketInfo.nodeIds;
    if (!nodeIds.length) {
      // nodeIds が空のチケットはスキップ（エラーにしない）
      continue;
    }

    // データ収集
    const nodes = collectNodeDetails(graph, nodeIds);
    const edges = collectEdges(graph, nodeIds);

    // ブロック生成（純粋関数）
    const block1 = formatNodeDetailsBlock(nodes, ticketInfo.title);
    const block2 = formatEdgeRelationsBlock(edges, allNodes);
    const block3 = formatFilePathsBlock(nodes, edges, dirsTree, ticketInfo);

    // 結合
    const section = combineBlocks(block1, block2, block3, graphFileName);
    console.log(section); // stdout に出力

    // spec ファイルに追記
    const specPath = resolveSpecPath(ticketKey, ticketsPath);
    if (specPath) {
      const appended = appendToSpec(specPath, section);
      if (appended) {
        console.error(`Appended to spec: ${specPath}`);
      }
    }
  }

  process.exit(EXIT_SUCCESS);
}

// CLIとして実行された場合のみ main を呼び出す
if (require.main === module) {
  main();
}

module.exports = {
  parseArguments,
  loadTickets,
  loadGraph,
  loadDirsTree,
  collectTicketNodes,
  collectNodeDetails,
  collectEdges,
  buildNodeIdToPathMap,
  formatNodeDetailsBlock,
  formatEdgeRelationsBlock,
  formatFilePathsBlock,
  combineBlocks,
  appendToSpec,
  printUsage,
};
