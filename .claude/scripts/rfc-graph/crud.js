#!/usr/bin/env node

/**
 * crud.js — グラフの唯一の書き込み経路（6サブコマンド）
 *
 * /graphify-rfc スラッシュコマンドで使用するグラフファイルのCRUD操作を提供する。
 * 全書き込み操作はスキーマ検証を通過後、一時ファイル + rename のアトミック書込を実行する。
 *
 * サブコマンド:
 *   create-nodes --file=<nodes.json>  — ノード一括追加（重複IDチェック＋スキーマ検証）
 *   list-nodes                        — 全ノード一覧JSON出力
 *   get-node --id=<nodeId>            — 単一ノード取得
 *   update-node --id=<nodeId> --file=<patch.json> — ノード更新（スキーマ検証）
 *   delete-node --id=<nodeId>         — ノード削除
 *   create-edges --file=<edges.json>  — エッジ一括追加（from/to存在検証＋スキーマ検証）
 */

const fs = require('fs');
const path = require('path');
const { validateAgainstSchema } = require('./schema/validate.js');

// ============================================================
// 定数定義
// ============================================================

/** グラフファイルパスを指定するCLI引数のプレフィックス */
const GRAPH_PATH_ARG_PREFIX = '--graph=';

/** ノードIDを指定するCLI引数のプレフィックス */
const NODE_ID_ARG_PREFIX = '--id=';

/** 入力JSONファイルを指定するCLI引数のプレフィックス */
const FILE_ARG_PREFIX = '--file=';

/** 元Markdown文書のパスを指定するCLI引数のプレフィックス */
const SOURCE_ARG_PREFIX = '--source=';

/** 認容されるサブコマンド名の配列 */
const ALLOWED_SUBCOMMANDS = [
  'create-nodes',
  'list-nodes',
  'get-node',
  'update-node',
  'delete-node',
  'create-edges',
  'delete-edges',
];

/** スキーマファイルが格納されたディレクトリへの絶対パス */
const SCHEMAS_DIR = path.resolve(__dirname, 'schema');

/** スキーマファイル名: ノード */
const NODE_SCHEMA_FILE = 'node.schema.json';

/** スキーマファイル名: エッジ */
const EDGE_SCHEMA_FILE = 'edge.schema.json';

/** スキーマファイル名: グラフ全体 */
const GRAPH_SCHEMA_FILE = 'graph.schema.json';

/** 空のグラフデータを生成する */
function createEmptyGraph(sourceFile) {
  return { sourceFile: sourceFile || '', nodes: [], edges: [] };
}

// ============================================================
// コマンドライン引数パース
// ============================================================

/**
 * コマンドライン引数をパースする
 *
 * @returns {{ graphPath: string, subcommand: string, nodeId: string|null, filePath: string|null }}
 * @throws {Error} 引数が不正な場合
 */
function parseArguments() {
  const args = process.argv.slice(2);

  // --help オプション
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    printUsage();
    process.exit(0);
  }

  // 最小引数: --graph=<path> subcommand
  if (args.length < 2) {
    throw new Error(
      '引数が不足しています。\n' +
      '  Usage: crud.js --graph=<path> <subcommand> [options]'
    );
  }

  // --graph=<path> のパース
  const graphFlag = args[0];
  if (!graphFlag.startsWith(GRAPH_PATH_ARG_PREFIX)) {
    throw new Error(
      '最初の引数は --graph=<path> である必要があります。\n' +
      `  実際の値: ${graphFlag}`
    );
  }
  const graphPath = graphFlag.slice(GRAPH_PATH_ARG_PREFIX.length);
  if (!graphPath) {
    throw new Error('--graph=<path> <path> is empty.');
  }

  const subcommand = args[1];

  // サブコマンドの検証
  if (!ALLOWED_SUBCOMMANDS.includes(subcommand)) {
    throw new Error(
      `未知のサブコマンドです: ${subcommand}`
    );
  }

  // サブコマンド固有の追加引数のパース
  let nodeId = null;
  let filePath = null;
  let sourcePath = null;

  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith(NODE_ID_ARG_PREFIX)) {
      nodeId = arg.slice(NODE_ID_ARG_PREFIX.length);
      if (!nodeId) {
        throw new Error('--id=<nodeId> <nodeId> is empty.');
      }
    } else if (arg.startsWith(FILE_ARG_PREFIX)) {
      filePath = arg.slice(FILE_ARG_PREFIX.length);
      if (!filePath) {
        throw new Error('--file=<path> <path> is empty.');
      }
    } else if (arg.startsWith(SOURCE_ARG_PREFIX)) {
      sourcePath = arg.slice(SOURCE_ARG_PREFIX.length);
      if (!sourcePath) {
        throw new Error('--source=<path> <path> is empty.');
      }
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  // サブコマンドごとの必須引数チェック
  const subcommandsRequiringFile = ['create-nodes', 'create-edges', 'update-node', 'delete-edges'];
  const subcommandsRequiringId = ['get-node', 'update-node', 'delete-node'];

  if (subcommandsRequiringFile.includes(subcommand) && !filePath) {
    throw new Error(
      `サブコマンド "${subcommand}" には --file=<path> が必要です。`
    );
  }
  if (subcommandsRequiringId.includes(subcommand) && !nodeId) {
    throw new Error(
      `サブコマンド "${subcommand}" には --id=<nodeId> が必要です。`
    );
  }

  return { graphPath, subcommand, nodeId, filePath, sourcePath };
}

// ============================================================
// グラフファイル入出力
// ============================================================

/**
 * グラフファイルを読み込む。ファイルが存在しない場合は空のグラフを生成する。
 *
 * 初回作成時（グラフ不在）は sourcePath が必須。
 * sourcePath はグラフルートの sourceFile フィールドにセットされる。
 *
 * @param {string} graphPath — グラフファイルのパス
 * @param {string|null} sourcePath — 元Markdown文書のパス（初回作成時必須）
 * @returns {Object} グラフデータ
 * @throws {Error} ファイル読み込みエラー時、または初回作成時に sourcePath 未指定
 */
function readGraph(graphPath, sourcePath) {
  if (!fs.existsSync(graphPath)) {
    if (!sourcePath) {
      throw new Error(
        '--source 未指定です。--source=</path/to/RFC-???.md> で元Markdown文書のパスを指定してください。'
      );
    }
    return createEmptyGraph(sourcePath);
  }

  const content = fs.readFileSync(graphPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * 一時ファイル + rename でアトミックにファイルを書き込む
 *
 * 書き込み途中でプロセスが異常終了した場合でも、.tmp ファイルは残るが
 * 元ファイルは破損しない。これは rename が OS レベルのアトミック操作であるため。
 *
 * @param {string} targetPath — 書き込み先ファイルのパス
 * @param {string} data — 書き込むデータ（UTF-8文字列）
 */
function atomicWrite(targetPath, data) {
  const tmpPath = targetPath + '.tmp.' + process.pid;
  fs.writeFileSync(tmpPath, data, 'utf8');
  fs.renameSync(tmpPath, targetPath);
}

// ============================================================
// スキーマ検証
// ============================================================

/**
 * データを指定されたスキーマで検証する。違反時はエラーをスローする。
 *
 * @param {Object} data — 検証対象のデータ
 * @param {string} schemaFileName — スキーマファイル名
 * @param {string} description — エラーメッセージ用のデータ説明
 * @throws {Error} スキーマ検証失敗時
 */
function validateWithSchema(data, schemaFileName, description) {
  const result = validateAgainstSchema(data, schemaFileName, SCHEMAS_DIR);
  if (!result.valid) {
    const errorDetails = result.errors.join('\n  - ');
    throw new Error(
      `${description} がスキーマ検証に失敗しました。` +
      `\n  スキーマ: ${schemaFileName}` +
      `\n  詳細:\n  - ${errorDetails}`
    );
  }
}

// ============================================================
// サブコマンド実装
// ============================================================

/**
 * create-nodes: ノードを一括追加する
 *
 * 全ノードがスキーマ検証を通過し、かつ既存ノードとのID重複がない場合のみ追加する。
 * 1件でも違反があれば一切変更せずエラー終了する。
 * headingRefs の refId は自動採番される（グラフ内の既存最大値+1から順に割り当て）。
 * ノードJSONに refId が書かれていても無視され、機械的に上書きされる。
 *
 * @param {Object} graph — グラフデータ
 * @param {Object[]} nodesData — 追加するノードの配列
 * @throws {Error} 検証失敗時
 */
function executeCreateNodes(graph, nodesData) {
  // ステップ1: 全ノードのスキーマ検証
  // headingRefs の refId は仮の値で一時的に検証通過させる
  for (const node of nodesData) {
    if (Array.isArray(node.headingRefs) && node.headingRefs.length > 0) {
      for (const range of node.headingRefs) {
        if (!range.refId || !/^REF\d{3,}$/.test(range.refId)) {
          range.refId = 'REF000';
        }
      }
    }
    validateWithSchema(node, NODE_SCHEMA_FILE, `ノード ${node.id || '(ID不明)'}`);
  }

  // ステップ2: 既存ノードとのID重複チェック
  const existingIds = new Set(graph.nodes.map((n) => n.id));
  for (const node of nodesData) {
    if (existingIds.has(node.id)) {
      throw new Error(
        `ノードID ${node.id} は既に存在します。` +
        `\n  既存ノード数: ${graph.nodes.length}件` +
        `\n  重複ID: ${node.id}`
      );
    }
    existingIds.add(node.id);
  }

  // ステップ3: refId 自動採番
  // 既存グラフ + 新規ノードの全 headingRefs から最大 refId 番号をスキャン
  let maxRefNumber = 0;
  const allNodes = [...graph.nodes, ...nodesData];
  for (const node of allNodes) {
    if (!Array.isArray(node.headingRefs)) continue;
    for (const range of node.headingRefs) {
      if (range.refId) {
        const match = range.refId.match(/^REF(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxRefNumber) maxRefNumber = num;
        }
      }
    }
  }

  // 新規ノードの headingRefs に max+1 から順に refId を割り当てる
  let nextRefNumber = maxRefNumber + 1;
  for (const node of nodesData) {
    if (!Array.isArray(node.headingRefs)) continue;
    for (const range of node.headingRefs) {
      range.refId = 'REF' + String(nextRefNumber).padStart(3, '0');
      nextRefNumber++;
    }
  }

  // ステップ4: 追加実行
  graph.nodes.push(...nodesData);
  console.log(JSON.stringify({ ok: true, created: nodesData.length, refStart: maxRefNumber + 1, refEnd: nextRefNumber - 1 }, null, 2));
}

/**
 * list-nodes: 全ノード一覧をJSON出力する
 *
 * @param {Object} graph — グラフデータ
 */
function executeListNodeIds(graph) {
  console.log(JSON.stringify(graph.nodes, null, 2));
}

/**
 * get-node: 指定されたIDのノードを取得する
 *
 * @param {Object} graph — グラフデータ
 * @param {string} nodeId — 取得するノードのID
 * @throws {Error} ノード未発見時
 */
function executeGetNode(graph, nodeId) {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) {
    throw new Error(
      `ノード ${nodeId} が見つかりません。` +
      `\n  グラフ内のノード: ${graph.nodes.map((n) => n.id).join(', ') || '(なし)'}`
    );
  }
  console.log(JSON.stringify(node, null, 2));
}

/**
 * update-node: 指定されたIDのノードを更新する
 *
 * patch の各フィールドで上書き更新する。headingRefs は配列全体の置換。
 * 更新後の完全なノードがスキーマ検証を通過することを確認する。
 *
 * @param {Object} graph — グラフデータ
 * @param {string} nodeId — 更新するノードのID
 * @param {Object} patchData — 更新内容
 * @throws {Error} 検証失敗時
 */
function executeUpdateNode(graph, nodeId, patchData) {
  const nodeIndex = graph.nodes.findIndex((n) => n.id === nodeId);
  if (nodeIndex === -1) {
    throw new Error(
      `ノード ${nodeId} が見つかりません。` +
      `\n  グラフ内のノード: ${graph.nodes.map((n) => n.id).join(', ') || '(なし)'}`
    );
  }

  // 更新後のノードを構築
  const updatedNode = { ...graph.nodes[nodeIndex], ...patchData };

  // スキーマ検証
  validateWithSchema(updatedNode, NODE_SCHEMA_FILE, `更新後のノード ${nodeId}`);

  // 更新実行
  graph.nodes[nodeIndex] = updatedNode;
  console.log(JSON.stringify({ ok: true, id: nodeId }, null, 2));
}

/**
 * delete-node: 指定されたIDのノードを削除する
 *
 * @param {Object} graph — グラフデータ
 * @param {string} nodeId — 削除するノードのID
 * @throws {Error} ノード未発見時
 */
function executeDeleteNode(graph, nodeId) {
  const nodeIndex = graph.nodes.findIndex((n) => n.id === nodeId);
  if (nodeIndex === -1) {
    throw new Error(
      `ノード ${nodeId} が見つかりません。` +
      `\n  グラフ内のノード: ${graph.nodes.map((n) => n.id).join(', ') || '(なし)'}`
    );
  }

  // 削除実行
  graph.nodes.splice(nodeIndex, 1);
  console.log(JSON.stringify({ ok: true, removed: nodeId }, null, 2));
}

/**
 * create-edges: エッジを一括追加する
 *
 * 全エッジがスキーマ検証を通過し、かつ from/to が既存ノードを参照している場合のみ追加する。
 * 1件でも違反があれば一切変更せずエラー終了する。
 *
 * @param {Object} graph — グラフデータ
 * @param {Object[]} edgesData — 追加するエッジの配列
 * @throws {Error} 検証失敗時
 */
function executeCreateEdges(graph, edgesData) {
  // ステップ1: 全エッジのスキーマ検証
  for (const edge of edgesData) {
    validateWithSchema(edge, EDGE_SCHEMA_FILE, `エッジ ${edge.from}→${edge.to}`);
  }

  // ステップ2: from/to ノード存在検証
  const existingIds = new Set(graph.nodes.map((n) => n.id));
  for (const edge of edgesData) {
    if (!existingIds.has(edge.from)) {
      throw new Error(
        `エッジの参照元ノード ${edge.from} がグラフ内に存在しません。` +
        `\n  存在するノード: ${graph.nodes.map((n) => n.id).join(', ') || '(なし)'}`
      );
    }
    if (!existingIds.has(edge.to)) {
      throw new Error(
        `エッジの参照先ノード ${edge.to} がグラフ内に存在しません。` +
        `\n  存在するノード: ${graph.nodes.map((n) => n.id).join(', ') || '(なし)'}`
      );
    }
  }

  // ステップ3: 追加実行
  graph.edges.push(...edgesData);
  console.log(JSON.stringify({ ok: true, created: edgesData.length }, null, 2));
}

/**
 * delete-edges: エッジを一括削除する
 *
 * from + to + type の組み合わせで識別し、一致するエッジを削除する。
 * 指定されたエッジが存在しなくてもエラーにはならない（冪等）。
 * 削除後は最低1本のエッジが残っているかの検証は行わない（孤立ノードは verify.js の責務）。
 *
 * @param {Object} graph — グラフデータ
 * @param {Object[]} edgesData — 削除するエッジの指定（from, to, type を含む）
 */
function executeDeleteEdges(graph, edgesData) {
  let removedCount = 0;
  for (const target of edgesData) {
    const index = graph.edges.findIndex(
      (e) => e.from === target.from && e.to === target.to && e.type === target.type
    );
    if (index !== -1) {
      graph.edges.splice(index, 1);
      removedCount++;
    }
  }
  console.log(JSON.stringify({ ok: true, removed: removedCount }, null, 2));
}

// ============================================================
// ユーティリティ
// ============================================================

/**
 * Output error info to stderr using the 3-line template and exit the process.
 *
 * @param {string} message — What happened
 * @param {string} reason — Why it happened
 * @param {string} action — Next action to take
 */
function exitWithError(message, reason, action) {
  console.error('[ERROR] ' + message);
  console.error('Cause: ' + reason);
  console.error('Action: ' + action);
  process.exit(1);
}

/**
 * Print usage information.
 */
function printUsage() {
  console.log(`
crud.js — Graph file CRUD operations

Usage:
  node crud.js --graph=<path> create-nodes --file=<nodes.json>
    Bulk-add nodes defined in nodes.json

  node crud.js --graph=<path> list-nodes
    Output all nodes as JSON

  node crud.js --graph=<path> get-node --id=<nodeId>
    Get a node by ID

  node crud.js --graph=<path> update-node --id=<nodeId> --file=<patch.json>
    Update a node by ID (overwrite with fields from patch.json)

  node crud.js --graph=<path> delete-node --id=<nodeId>
    Delete a node by ID

  node crud.js --graph=<path> create-edges --file=<edges.json>
    Bulk-add edges defined in edges.json (with from/to node existence check)

All write operations perform atomic writes after schema validation passes.
`);
}

// ============================================================
// メインエントリポイント
// ============================================================

/**
 * メイン処理: 引数パース → サブコマンドディスパッチ → 書き込み
 *
 * すべてのエラーはこの関数内で catch され、3段テンプレートで stderr に出力される。
 */
function main() {
  let parsed;
  try {
    parsed = parseArguments();
  } catch (parseError) {
    exitWithError(
      'Invalid command-line arguments.',
      parseError.message,
      'Check usage with --help.'
    );
  }

  const { graphPath, subcommand, nodeId, filePath, sourcePath } = parsed;

  try {
    // ファイル入力を必要とするサブコマンド: 入力JSONを読み込む
    let inputData = null;
    if (filePath) {
      const content = fs.readFileSync(filePath, 'utf-8');
      inputData = JSON.parse(content);
    }

    // 読み取り専用サブコマンド（グラフファイル変更なし）
    const readOnlySubcommands = ['list-nodes', 'get-node'];

    if (readOnlySubcommands.includes(subcommand)) {
      const graph = readGraph(graphPath, sourcePath);
      switch (subcommand) {
        case 'list-nodes':
          executeListNodeIds(graph);
          break;
        case 'get-node':
          executeGetNode(graph, nodeId);
          break;
      }
      return;
    }

    // 書き込みサブコマンド（グラフファイル変更あり）
    const graph = readGraph(graphPath, sourcePath);

    // グラフ全体としてのスキーマ検証（既存データの整合性確認）
    validateWithSchema(graph, GRAPH_SCHEMA_FILE, 'グラフデータ全体');

    switch (subcommand) {
      case 'create-nodes':
        executeCreateNodes(graph, inputData);
        break;
      case 'update-node':
        executeUpdateNode(graph, nodeId, inputData);
        break;
      case 'delete-node':
        executeDeleteNode(graph, nodeId);
        break;
      case 'create-edges':
        executeCreateEdges(graph, inputData);
        break;
      case 'delete-edges':
        executeDeleteEdges(graph, inputData);
        break;
    }

    // 変更後のグラフ全体としてのスキーマ検証
    validateWithSchema(graph, GRAPH_SCHEMA_FILE, '更新後のグラフデータ全体');

    // アトミック書込
    atomicWrite(graphPath, JSON.stringify(graph, null, 2));

    // 消費済みの入力ファイルを削除（使用後はゴミを残さない）
    if (filePath) {
      try { fs.unlinkSync(filePath); } catch { /* 削除できなくても処理自体は成功 */ }
    }
  } catch (operationError) {
    exitWithError(
      `Error occurred during ${subcommand} execution.`,
      operationError.message,
      'Check input data and re-run.'
    );
  }
}

if (require.main === module) {
  main();
}

// テスト用エクスポート
module.exports = {
  parseArguments,
  readGraph,
  validateWithSchema,
  executeCreateNodes,
  executeListNodeIds,
  executeGetNode,
  executeUpdateNode,
  executeDeleteNode,
  executeCreateEdges,
  executeDeleteEdges,
  atomicWrite,
  exitWithError,
  GRAPH_PATH_ARG_PREFIX,
  NODE_ID_ARG_PREFIX,
  FILE_ARG_PREFIX,
  ALLOWED_SUBCOMMANDS,
};
