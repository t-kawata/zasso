#!/usr/bin/env node

/**
 * dump-ticket-graph-commands.js — Tickets.json nodeIDs→specコマンド追記
 *
 * Tickets.json の各チケットに設定された nodeIDs フィールドを読み取り、
 * 対応する query.js コマンドを生成して spec ファイルに追記する。
 *
 * CLI: dump-ticket-graph-commands.js --tickets=<path> --graph=<path> --source=<path>
 *
 * グラフファイルが存在しない場合は「グラフファイルがありません」メッセージを
 * 追記する。nodeIDs がないチケットはスキップする。
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// 定数定義
// ============================================================

/** Tickets.json のパスを指定するCLI引数のプレフィックス */
const TICKETS_PATH_ARG_PREFIX = '--tickets=';

/** グラフファイルパスを指定するCLI引数のプレフィックス */
const GRAPH_PATH_ARG_PREFIX = '--graph=';

/** ソースファイルパスを指定するCLI引数のプレフィックス */
const SOURCE_PATH_ARG_PREFIX = '--source=';

/** 正常終了コード */
const EXIT_SUCCESS = 0;

/** 異常終了コード */
const EXIT_FAILURE = 1;

/** スクリプトディレクトリへの相対パス */
const SCRIPTS_DIR = '.claude/scripts/rfc-graph';

/** デフォルトの探索ホップ数 */
const DEFAULT_HOPS = 3;

/** グラフ不在時のメッセージ */
const NO_GRAPH_MESSAGE = 'グラフファイルがありません。/graphify-rfc を先に実行してグラフを生成してください。';

/** セクション見出し */
const SECTION_HEADING = '### RFC設計グラフ構造探索コマンド';

// ============================================================
// コマンドライン引数パース
// ============================================================

/**
 * コマンドライン引数をパースする
 *
 * @param {string[]} [testArgs] — テスト用の引数配列（省略時は process.argv から取得）
 * @returns {{ ticketsPath: string, graphPath: string, sourcePath: string }}
 * @throws {Error} 引数が不正な場合
 */
function parseArguments(testArgs) {
  const args = testArgs || process.argv.slice(2);

  // --help オプション
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    printUsage();
    process.exit(EXIT_SUCCESS);
  }

  // 3つの引数が必須
  if (args.length < 3) {
    throw new Error(
      '引数が不足しています。\n' +
      '  Usage: dump-ticket-graph-commands.js --tickets=<path> --graph=<path> --source=<path>'
    );
  }

  // --tickets=<path> のパース
  const ticketsFlag = args[0];
  if (!ticketsFlag.startsWith(TICKETS_PATH_ARG_PREFIX)) {
    throw new Error(
      '最初の引数は --tickets=<path> である必要があります。\n' +
      `  実際の値: ${ticketsFlag}`
    );
  }
  const ticketsPath = ticketsFlag.slice(TICKETS_PATH_ARG_PREFIX.length);
  if (!ticketsPath) {
    throw new Error('--tickets=<path> の <path> が空です。');
  }

  // --graph=<path> のパース
  const graphFlag = args[1];
  if (!graphFlag.startsWith(GRAPH_PATH_ARG_PREFIX)) {
    throw new Error(
      '2番目の引数は --graph=<path> である必要があります。\n' +
      `  実際の値: ${graphFlag}`
    );
  }
  const graphPath = graphFlag.slice(GRAPH_PATH_ARG_PREFIX.length);
  if (!graphPath) {
    throw new Error('--graph=<path> の <path> が空です。');
  }

  // --source=<path> のパース
  const sourceFlag = args[2];
  if (!sourceFlag.startsWith(SOURCE_PATH_ARG_PREFIX)) {
    throw new Error(
      '3番目の引数は --source=<path> である必要があります。\n' +
      `  実際の値: ${sourceFlag}`
    );
  }
  const sourcePath = sourceFlag.slice(SOURCE_PATH_ARG_PREFIX.length);
  if (!sourcePath) {
    throw new Error('--source=<path> の <path> が空です。');
  }

  // 余剰引数のチェック
  if (args.length > 3) {
    throw new Error(
      '余剰な引数があります。\n' +
      '  Usage: dump-ticket-graph-commands.js --tickets=<path> --graph=<path> --source=<path>'
    );
  }

  return { ticketsPath, graphPath, sourcePath };
}

// ============================================================
// ファイル読み込み
// ============================================================

/**
 * Tickets.json を読み込む
 *
 * @param {string} ticketsPath — Tickets.json のパス
 * @returns {Object} パース済みTickets.jsonデータ
 * @throws {Error} ファイル読み込みまたはJSONパースに失敗した場合
 */
function loadTickets(ticketsPath) {
  if (!fs.existsSync(ticketsPath)) {
    throw new Error(
      `Tickets.json が見つかりません: ${ticketsPath}`
    );
  }

  let raw;
  try {
    raw = fs.readFileSync(ticketsPath, 'utf8');
  } catch (readError) {
    throw new Error(
      `Tickets.json の読み込みに失敗しました: ${readError.message}`
    );
  }

  let tickets;
  try {
    tickets = JSON.parse(raw);
  } catch (parseError) {
    throw new Error(
      `Tickets.json のJSONパースに失敗しました: ${parseError.message}`
    );
  }

  return tickets;
}

// ============================================================
// データ収集（純粋関数）
// ============================================================

/**
 * 全チケットから nodeIDs フィールドを収集する
 *
 * 各チケットに nodeIDs フィールドが存在し、かつ空でない配列の場合のみ収集する。
 * nodeIDs がないチケットや空配列のチケットはスキップする。
 *
 * @param {Object} tickets — Tickets.json のデータ（{ phases: [...], tickets: [...] } 形式）
 * @returns {Array<{ ticketKey: string, nodeIds: string[] }>} 各チケットの nodeIDs
 */
function collectNodeIds(tickets) {
  const result = [];

  // phases 配列内の tickets 配列を走査する
  const phases = tickets.phases || [];
  for (const phase of phases) {
    const phaseTickets = phase.tickets || [];
    for (const ticket of phaseTickets) {
      const nodeIds = ticket.nodeIDs;
      if (Array.isArray(nodeIds) && nodeIds.length > 0) {
        const ticketKey = `P${phase.phaseId}-${ticket.id}`;
        result.push({ ticketKey, nodeIds });
      }
    }
  }

  return result;
}

/**
 * グラフファイルの存在確認とノードIDの存在検証を行う
 *
 * @param {string} graphPath — グラフファイルのパス
 * @returns {boolean} グラフファイルが存在するか
 */
function graphExists(graphPath) {
  return fs.existsSync(graphPath);
}

/**
 * query.js コマンドを生成する
 *
 * @param {string} nodeId — ノードID
 * @param {Object} nodeTitleMap — ノードIDとタイトルのマッピング
 * @param {string} graphPath — グラフファイルのパス
 * @param {string} sourcePath — ソースファイルのパス
 * @returns {string} query.js コマンド文字列
 */
function generateCommand(nodeId, nodeTitleMap, graphPath, sourcePath) {
  const title = nodeTitleMap[nodeId] || '';
  const titleSuffix = title ? ` (${title})` : '';
  const graphFileName = path.basename(graphPath);
  const sourceFileName = path.basename(sourcePath);

  return `- ${nodeId}${titleSuffix} → \`node ${SCRIPTS_DIR}/query.js --graph=${graphFileName} --source=${sourceFileName} --id=${nodeId} --hops=${DEFAULT_HOPS}\``;
}

/**
 * グラフファイルからノードIDとタイトルのマッピングを読み取る
 *
 * @param {Object} graph — パース済みグラフデータ
 * @returns {Object<string, string>} ノードIDをキー、タイトルを値とするマッピング
 */
function buildNodeTitleMap(graph) {
  const map = {};
  if (Array.isArray(graph.nodes)) {
    for (const node of graph.nodes) {
      map[node.id] = node.title || '';
    }
  }
  return map;
}

/**
 * 「RFC設計グラフ構造探索コマンド」セクションの内容を生成する
 *
 * @param {Array<{ ticketKey: string, nodeIds: string[], commands: string[] }>} results — 各チケットの生成結果
 * @param {string} graphFileName — グラフファイル名
 * @returns {string} セクション全体の文字列
 */
function formatSection(results, graphFileName) {
  const lines = [SECTION_HEADING, '', `グラフファイル: ${graphFileName}`, ''];

  for (const result of results) {
    lines.push(`チケット ${result.ticketKey} に統合されたノード:`);
    for (const command of result.commands) {
      lines.push(command);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * グラフ不在時のメッセージセクションを生成する
 *
 * @returns {string} セクション全体の文字列
 */
function formatNoGraphSection() {
  return [
    SECTION_HEADING,
    '',
    NO_GRAPH_MESSAGE,
    '',
  ].join('\n');
}

// ============================================================
// ファイル書き込み
// ============================================================

/**
 * spec ファイルのパスをチケットキーから導出する
 *
 * @param {string} ticketKey — チケットキー（例: P0-1）
 * @returns {string|null} spec ファイルのパス（見つからない場合は null）
 */
function resolveSpecPath(ticketKey) {
  // spec ディレクトリの候補
  const specDirs = [
    'tickets/specs',
  ];

  // 実際に存在するディレクトリを探す
  let specDir = null;
  for (const dir of specDirs) {
    if (fs.existsSync(dir)) {
      specDir = dir;
      break;
    }
  }

  if (!specDir) {
    return null;
  }

  // spec ディレクトリ内のファイルを検索
  let files;
  try {
    files = fs.readdirSync(specDir);
  } catch {
    return null;
  }

  // チケット番号（例: P0-1 → 0-1 を含む）でマッチするファイルを探す
  // spec ファイル名の先頭4桁がチケット番号に対応
  // P0-1 → 0001, P0-2 → 0002 ...
  // ただし ticket.ticket の id フィールドが整数 ID
  // 単純に ticketKey（P0-1）の形式から spec ファイル内の frontmatter で検索するのは難しい
  // → 一致しない場合は null を返し、spec なしとして扱う
  return null;
}

/**
 * spec ファイルにセクションを追記する
 *
 * @param {string} specPath — spec ファイルのパス
 * @param {string} section — 追記するセクション文字列
 */
function appendToSpec(specPath, section) {
  const existingContent = fs.readFileSync(specPath, 'utf8');
  const newContent = existingContent.trimEnd() + '\n\n' + section + '\n';
  fs.writeFileSync(specPath, newContent, 'utf8');
}

// ============================================================
// ヘルプ表示
// ============================================================

/**
 * 使用方法を表示する
 */
function printUsage() {
  console.log(
    'dump-ticket-graph-commands.js — Tickets.json nodeIDs→specコマンド追記\n' +
    '\n' +
    'Usage:\n' +
    '  dump-ticket-graph-commands.js --tickets=<path> --graph=<path> --source=<path>\n' +
    '\n' +
    'Options:\n' +
    '  --tickets=<path>  Tickets.json のパス\n' +
    '  --graph=<path>    グラフファイルのパス\n' +
    '  --source=<path>   ソースファイルのパス\n' +
    '  --help, -h        このヘルプを表示\n' +
    '\n' +
    'Exit codes:\n' +
    '  0  正常終了\n' +
    '  1  引数エラーまたはファイル読み込みエラー\n'
  );
}

// ============================================================
// エントリポイント
// ============================================================

/**
 * main — CLIエントリポイント
 *
 * 1. 引数パース
 * 2. Tickets.json 読み込み
 * 3. nodeIDs 収集
 * 4. グラフ存在確認
 * 5. コマンド生成（グラフ存在時）または不在メッセージ生成
 * 6. 結果を標準出力に出力
 *
 * 全エラーは3段テンプレートで stderr に出力し、終了コード1で終了する。
 * ファイル変更は一切行わない（標準出力に結果を出力するのみ）。
 */
function main() {
  let ticketsPath, graphPath, sourcePath;

  try {
    const parsed = parseArguments();
    ticketsPath = parsed.ticketsPath;
    graphPath = parsed.graphPath;
    sourcePath = parsed.sourcePath;
  } catch (parseError) {
    process.stderr.write(
      `[ERROR] 引数のパースに失敗しました。\n` +
      `原因: ${parseError.message}\n` +
      `対応: 正しい引数で再実行してください。\n`
    );
    process.exit(EXIT_FAILURE);
  }

  let tickets;
  try {
    tickets = loadTickets(ticketsPath);
  } catch (ticketsError) {
    process.stderr.write(
      `[ERROR] Tickets.json の読み込みに失敗しました。\n` +
      `原因: ${ticketsError.message}\n` +
      `対応: --tickets=<path> に正しい Tickets.json を指定してください。\n`
    );
    process.exit(EXIT_FAILURE);
  }

  const nodeIdEntries = collectNodeIds(tickets);

  // nodeIDs がない場合は何も出力せず正常終了
  if (nodeIdEntries.length === 0) {
    process.exit(EXIT_SUCCESS);
  }

  const graphFileName = path.basename(graphPath);
  const graphFileExists = graphExists(graphPath);

  if (graphFileExists) {
    // グラフが存在する場合：ノード情報を読み取り、コマンド生成
    let graph;
    try {
      const raw = fs.readFileSync(graphPath, 'utf8');
      graph = JSON.parse(raw);
    } catch (graphError) {
      process.stderr.write(
        `[ERROR] グラフファイルの読み込みに失敗しました。\n` +
        `原因: ${graphError.message}\n` +
        `対応: --graph=<path> に正しいグラフファイルを指定してください。\n`
      );
      process.exit(EXIT_FAILURE);
    }

    const nodeTitleMap = buildNodeTitleMap(graph);

    // 各チケットのエントリについてコマンド生成
    const results = [];
    for (const entry of nodeIdEntries) {
      const commands = entry.nodeIds.map(nodeId =>
        generateCommand(nodeId, nodeTitleMap, graphPath, sourcePath)
      );
      results.push({
        ticketKey: entry.ticketKey,
        nodeIds: entry.nodeIds,
        commands,
      });
    }

    const section = formatSection(results, graphFileName);
    console.log(section);

    // 各チケットの spec があれば追記
    const writtenSpecs = [];
    for (const entry of nodeIdEntries) {
      const specPath = resolveSpecPath(entry.ticketKey);
      if (specPath) {
        try {
          const sectionForTicket = formatSection(
            [results.find(r => r.ticketKey === entry.ticketKey)],
            graphFileName
          );
          appendToSpec(specPath, sectionForTicket);
          writtenSpecs.push(entry.ticketKey);
        } catch {
          // spec がなければスキップ（エラーにしない）
        }
      }
    }

    if (writtenSpecs.length > 0) {
      console.error(`spec に追記しました: ${writtenSpecs.join(', ')}`);
    }
  } else {
    // グラフが存在しない場合：不在メッセージを出力
    const section = formatNoGraphSection();
    console.log(section);
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
  collectNodeIds,
  generateCommand,
  buildNodeTitleMap,
  formatSection,
  formatNoGraphSection,
  appendToSpec,
  resolveSpecPath,
  printUsage,
};
