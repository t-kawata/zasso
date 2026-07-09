#!/usr/bin/env node

/**
 * show-graph-summary-markdown.js — グラフサマリーをMarkdown形式で出力する
 *
 * グラフJSONから kind 別にグループ化したノード一覧を生成し、各ノードの
 * タイトル・要約・現在行番号（マーカーから動的解決）・エッジ関係を
 * Markdown形式で標準出力に出力する。
 *
 * CLI: show-graph-summary-markdown.js --graph=<path> --source=<path>
 *
 * 出力契約:
 *   正常時 → Markdown形式のサマリーを stdout に出力（終了コード0）
 *   異常時 → 3段テンプレートを stderr に出力（終了コード1）
 */

const fs = require('fs');
const path = require('path');

const { resolveByHeading } = require('./resolve-by-heading.js');

// ============================================================
// 定数
// ============================================================

/** エッジタイプ → 3文字略称 */
const EDGE_ABBREV = {
  depends_on: 'dep',
  implements: 'imp',
  refines: 'rfn',
  extends: 'ext',
  conflicts_with: 'cnf',
  triggers: 'trg',
  constrains: 'cns',
  supersedes: 'sup',
  references: 'ref',
  precedes: 'prc',
  part_of: 'prt',
  validates: 'vld',
};

// ============================================================
// ユーティリティ
// ============================================================

function exitWithError(summary, cause, action) {
  process.stderr.write(
    `[ERROR] ${summary}\n原因: ${cause}\n対応: ${action}\n`
  );
  process.exit(1);
}

// ============================================================
// 引数パース
// ============================================================

/** スクリプト配置ディレクトリ（相対パス） */
const SCRIPTS_DIR = '.claude/scripts/rfc-graph';

/** デフォルトの探索ホップ数 */
const DEFAULT_HOPS = 2;

function parseArguments(argv) {
  if (argv.length < 4) {
    throw new Error('引数が不足しています。\n使用法: show-graph-summary-markdown.js --graph=<path> --source=<path> [--with-cli-examples]');
  }

  const graphArg = argv[2];
  const sourceArg = argv[3];

  if (!graphArg.startsWith('--graph=')) {
    throw new Error(`最初の引数は --graph=<path> である必要があります: ${graphArg}`);
  }
  if (!sourceArg.startsWith('--source=')) {
    throw new Error(`2番目の引数は --source=<path> である必要があります: ${sourceArg}`);
  }

  const graphPath = graphArg.slice('--graph='.length);
  const sourcePath = sourceArg.slice('--source='.length);

  if (!graphPath) {
    throw new Error('--graph=<path> の <path> が空です。');
  }
  if (!sourcePath) {
    throw new Error('--source=<path> の <path> が空です。');
  }

  // オプションフラグ
  const withCliExamples = argv.slice(4).some(a => a === '--with-cli-examples');

  return { graphPath, sourcePath, withCliExamples };
}

function loadGraph(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`グラフファイルが見つかりません: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error(`JSONパースに失敗しました: ${filePath} — ${e.message}`);
  }
  if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw new Error(`グラフデータの構造が不正です: nodes または edges がありません`);
  }
  return data;
}

function loadSourceFile(filePath) {
  if (!fs.existsSync(filePath)) {
    exitWithError(
      'ソースファイルが見つかりません。',
      `${filePath} が存在しません。`,
      '--source=<path> に正しいファイルパスを指定してください。'
    );
  }
  return fs.readFileSync(filePath, 'utf8');
}

// ============================================================
// サマリー整形
// ============================================================

/**
 * summary を25字程度に要約する
 *
 * @param {string} summary
 * @returns {string}
 */
function truncateSummary(summary) {
  return summary || '';
}

/**
 * ノードのタイトルを取得する（kind が api_contract の場合はタイトルを優先）
 *
 * @param {Object} node
 * @returns {string}
 */
function formatTitle(node) {
  return node.title;
}

/**
 * エッジタイプを3文字略称に変換する
 *
 * @param {string} type
 * @returns {string}
 */
function abbreviateEdgeType(type) {
  return EDGE_ABBREV[type] || type.slice(0, 3);
}

/**
 * ノードマップ（id → node）を構築する
 *
 * @param {Object[]} nodes
 * @returns {Object<string, Object>}
 */
function buildNodeMap(nodes) {
  const map = {};
  for (const node of nodes) {
    map[node.id] = node;
  }
  return map;
}

/**
 * Markdown形式のサマリーを生成する
 *
 * @param {Object} graph — グラフデータ
 * @param {string} sourceText — ソースファイル全文（行番号動的解決用）
 * @returns {string}
 */
function generateSummary(graph, sourceText) {
  const nodeMap = buildNodeMap(graph.nodes);
  const lines = [];

  // 先頭行: 絶対パス + ノード数 + エッジ数
  lines.push(`${graph.sourceFile}  —  ${graph.nodes.length} nodes / ${graph.edges.length} edges`);
  lines.push('');

  // kind 別グループ
  const kindGroups = {};
  const KIND_ORDER = [
    'requirement', 'api_contract', 'data_model', 'state_machine',
    'architecture', 'security', 'error_policy', 'config',
    'test_policy', 'build_ci', 'rationale', 'glossary',
  ];

  for (const node of graph.nodes) {
    const kind = node.kind || 'other';
    if (!kindGroups[kind]) kindGroups[kind] = [];
    kindGroups[kind].push(node);
  }

  for (const kind of KIND_ORDER) {
    const nodes = kindGroups[kind];
    if (!nodes || nodes.length === 0) continue;
    delete kindGroups[kind];

    lines.push(`## ${kind} (${nodes.length}件)`);

    for (const node of nodes) {
      // 見出しで行位置を動的解決（レベル表示用）
      let headingLevel = '';
      if (Array.isArray(node.headingRefs) && node.headingRefs.length > 0) {
        const firstRef = node.headingRefs[0];
        if (firstRef.refId) {
          const sourceLines = (typeof sourceText === 'string') ? sourceText.split('\n') : sourceText;
          const resolved = resolveByHeading(sourceLines, firstRef.heading, firstRef.texts);
          if (resolved) {
            headingLevel = `h${firstRef.heading}`;
          }
        }
      }

      // ノード基本情報
      const summaryText = truncateSummary(node.summary);
      lines.push(`    - ${node.id}: ${formatTitle(node)}`);
      lines.push(`        * レベル: ${headingLevel || '?'}`);
      lines.push(`        * 要約: ${summaryText}`);

      // エッジ一覧
      const edgeLines = [];
      for (const edge of graph.edges) {
        if (edge.from === node.id) {
          const target = nodeMap[edge.to];
          const targetTitle = target ? formatTitle(target) : edge.to;
          const bidir = edge.attributes && edge.attributes.bidirectional;
          const arrow = bidir ? '<->' : '->';
          edgeLines.push(
            `            - [${node.id}] ${arrow} ${edge.type} ${arrow} [${edge.to}: ${targetTitle}]`
          );
        } else if (edge.to === node.id) {
          // bidirectional は from 側で出力済みのためスキップ
          if (edge.attributes && edge.attributes.bidirectional) continue;
          const source = nodeMap[edge.from];
          const sourceTitle = source ? formatTitle(source) : edge.from;
          edgeLines.push(
            `            - [${node.id}] <- ${edge.type} <- [${edge.from}: ${sourceTitle}]`
          );
        }
      }

      if (edgeLines.length > 0) {
        lines.push(`        * エッジ一覧:`);
        lines.push(...edgeLines);
      }
    }
    lines.push('');
  }

  // 未分類の kind があれば出力
  const remainingKinds = Object.keys(kindGroups).filter(k => kindGroups[k].length > 0);
  for (const kind of remainingKinds) {
    const nodes = kindGroups[kind];
    lines.push(`## ${kind} (${nodes.length}件)`);
    for (const node of nodes) {
      lines.push(`    - ${node.id}: ${formatTitle(node)}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================
// メイン
// ============================================================

/**
 * crud.js と query.js の具体的なCLI使用例を生成する（formulate連携用）
 *
 * @param {string} graphPath — グラフファイルのパス
 * @param {string} sourcePath — ソースファイルのパス
 * @param {string} [firstNodeId='N0001'] — 探索の起点とするノードID
 * @returns {string[]} CLI使用例の行配列
 */
function generateCliExamples(graphPath, sourcePath, firstNodeId) {
  const graphFileName = path.basename(graphPath);
  const sourceFileName = path.basename(sourcePath);
  const nodeId = firstNodeId || "N0001";

  return [
    "",
    "---",
    "### グラフ探索コマンド",
    "",
    "```bash",
    "# 1ホップ探索（直接接続のみ）",
    "node " + SCRIPTS_DIR + "/query.js --graph=" + graphFileName + " --source=" + sourceFileName + " --id=" + nodeId + " --hops=1",
    "",
    "# 2ホップ探索（子・孫を含む）",
    "node " + SCRIPTS_DIR + "/query.js --graph=" + graphFileName + " --source=" + sourceFileName + " --id=" + nodeId + " --hops=2",
    "",
    "# 3ホップ探索（より深い関係性まで）",
    "node " + SCRIPTS_DIR + "/query.js --graph=" + graphFileName + " --source=" + sourceFileName + " --id=" + nodeId + " --hops=3",
    "```",
  ];
}
function main() {
  let parsed;
  try {
    parsed = parseArguments(process.argv);
  } catch (e) {
    exitWithError(
      '引数のパースに失敗しました。',
      e.message,
      'show-graph-summary-markdown.js --graph=<path> --source=<path> [--with-cli-examples]'
    );
  }

  const graph = loadGraph(parsed.graphPath);
  const sourceText = loadSourceFile(parsed.sourcePath);
  const output = generateSummary(graph, sourceText);

  // --with-cli-examples が指定された場合、CLI使用例を追加出力する
  if (parsed.withCliExamples) {
    const firstNodeId = graph.nodes.length > 0 ? graph.nodes[0].id : undefined;
    const cliExamples = generateCliExamples(parsed.graphPath, parsed.sourcePath, firstNodeId);
    console.log(output + '\n' + cliExamples.join('\n'));
  } else {
    console.log(output);
  }
}

module.exports = {
  parseArguments,
  loadGraph,
  loadSourceFile,
  truncateSummary,
  abbreviateEdgeType,
  buildNodeMap,
  generateSummary,
  generateCliExamples,
  EDGE_ABBREV,
};

if (require.main === module) {
  main();
}
