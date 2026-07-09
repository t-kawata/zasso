#!/usr/bin/env node
/**
 * generate-dir-template.js — Dirs-Tree.json に基づく実ディレクトリ/ファイル生成
 *
 * --dirs-tree=<path> --root-dir=<path> --lang=<lang> [--dry-run] [--force] [--delete]
 *
 * Dirs-Tree.json に基づいて実際のディレクトリとテンプレートファイルを生成する。
 * 第1パス: 生成予定アイテムのディスカバリ（ファイル作成なし）
 * 確認プロンプト: 確認後（TTYのみ / --forceでスキップ）
 * 第2パス: 実際のファイル作成
 *
 * 各ファイルの生成時には以下の処理が自動適用される:
 *   - ヘッダーコメント: グラフ由来のメタデータ（生成元・マッピングノード・言語等）を
 *     boundify-helpers.js の generateHeaderComment() で生成し、ファイル先頭に挿入（PX-30）
 *   - 宣言スタブ: 実装がない空ファイルには kind と言語に応じた宣言スタブを挿入（PX-28）
 *   - クロスリファレンス: prose 系ノードに接続されたファイルには、接続情報を
 *     ヘッダーコメント内に埋め込み（PX-30）
 *
 * 出力契約:
 *   正常時 → {"ok":true, "created":[...]}（終了コード0）
 *   異常時 → {"ok":false, "error":"..."}（終了コード1）
 */

'use strict';

const fs = require('fs');
const path = require('path');
const helpers = require('./boundify-helpers.js');

// ============================================================
// 定数
// ============================================================

/** 対応言語の一覧 */
const SUPPORTED_LANGUAGES = Object.freeze(['rust', 'go', 'typescript']);

/** 3段テンプレートエラー — 引数不足時 */
const ERROR_MISSING_ARGS = '[ERROR] 引数が不足しています\n原因: --dirs-tree=<path> --root-dir=<path> --lang=<lang> が必要\n対応: 3つの引数を指定して再実行';

/** 3段テンプレートエラー — 未サポート言語 */
const ERROR_UNSUPPORTED_LANG = (lang) =>
  `[ERROR] サポートされていない言語です: ${lang}\n原因: rust/go/typescript のいずれかを指定\n対応: 正しい言語を指定してください`;

/** 3段テンプレートエラー — ファイル不在 */
const ERROR_FILE_NOT_FOUND = (filePath) =>
  `[ERROR] ファイルが見つかりません: ${filePath}\n原因: 指定されたパスにファイルが存在しません\n対応: 正しいパスを指定してください`;

/** 3段テンプレートエラー — JSONパース異常 */
const ERROR_PARSE_FAILED = (filePath, message) =>
  `[ERROR] JSONのパースに失敗しました: ${filePath}\n原因: ${message}\n対応: ファイルが有効なJSON形式であることを確認してください`;

/** 3段テンプレートエラー — 言語ツリー不在 */
const ERROR_LANG_TREE_NOT_FOUND = (lang) =>
  `[ERROR] 言語 ${lang} のツリーが Dirs-Tree.json に見つかりません\n原因: 該当言語のツリー定義が存在しません\n対応: Dirs-Tree.json に正しい言語ツリーが含まれているか確認してください`;

/** 3段テンプレートエラー — ファイル重複 */
const ERROR_FILE_EXISTS = (filePath) =>
  `[ERROR] ファイルが既に存在します: ${filePath}\n原因: 出力先に同名ファイルがある\n対応: --force フラグを指定して上書きするか、既存ファイルを退避してください`;

/** 3段テンプレートエラー — ファイル削除失敗 */
const ERROR_DELETE_FAILED = (filePath, message) =>
  `[ERROR] 削除に失敗しました: ${filePath}\n原因: ${message}\n対応: パーミッションやファイルの状態を確認してください`;
const ERROR_CREATE_FAILED = (filePath, message) =>
  `[ERROR] ファイル作成に失敗しました: ${filePath}\n原因: ${message}\n対応: パーミッションやディスク容量を確認してください`;

// ============================================================
// CLI引数パース
// ============================================================

/**
 * CLI引数をパースし、パース結果を返す
 *
 * @param {string[]} argv - コマンドライン引数配列
 * @returns {object} パース結果。成功時: {ok:true, dirsTreePath, rootDir, lang, isDryRun, isForce, isDelete}
 *                   失敗時: {ok:false, error:string}
 */
function parseArgs(argv) {
  const dirsTreeFlag = argv.find(a => a.startsWith('--dirs-tree='));
  const rootDirFlag = argv.find(a => a.startsWith('--root-dir='));
  const langFlag = argv.find(a => a.startsWith('--lang='));
  const isDryRun = argv.includes('--dry-run');
  const isForce = argv.includes('--force');
  const isDelete = argv.includes('--delete');

  if (!dirsTreeFlag) {
    return { ok: false, error: ERROR_MISSING_ARGS };
  }
  if (!rootDirFlag) {
    return { ok: false, error: ERROR_MISSING_ARGS };
  }
  if (!langFlag) {
    return { ok: false, error: ERROR_MISSING_ARGS };
  }

  const lang = langFlag.slice('--lang='.length);
  if (!SUPPORTED_LANGUAGES.includes(lang)) {
    return { ok: false, error: ERROR_UNSUPPORTED_LANG(lang) };
  }

  return {
    ok: true,
    dirsTreePath: path.resolve(dirsTreeFlag.slice('--dirs-tree='.length)),
    rootDir: path.resolve(rootDirFlag.slice('--root-dir='.length)),
    lang,
    isDryRun,
    isForce,
    isDelete,
  };
}

// ============================================================
// ディスカバリ — 生成予定アイテムの走査
// ============================================================

/**
 * Dirs-Tree のノードを再帰的に走査し、生成予定アイテムの一覧を返す
 *
 * @param {object} node - 走査対象のツリーノード ({name, type, children?, declarationStub?})
 * @param {string} currentPath - 現在の親ディレクトリパス
 * @param {object} [headerContext] - ヘッダーコメント生成用コンテキスト（省略時は従来通り宣言スタブのみ）
 * @param {string} headerContext.graphDirAbs - グラフファイルのディレクトリ絶対パス
 * @param {string} headerContext.graphBasename - graph.basename
 * @param {string} headerContext.dirsTreeBasename - Dirs-Tree.json のベース名
 * @param {string} headerContext.sourceBasename - 元RFCのベース名
 * @param {Array} headerContext.crossReferences - クロスリファレンス配列
 * @param {object} headerContext.nodeMetaMap - nodeId → {title, headingRef} のマップ
 * @returns {Array<{type:string, path:string, size?:number, content?:string}>}
 *   生成予定アイテムの配列（ファイル作成は行わない）
 */
function discover(node, currentPath, headerContext) {
  const fullPath = path.join(currentPath, node.name);
  const created = [];

  if (node.type === 'directory') {
    created.push({ type: 'directory', path: fullPath });
    if (node.children) {
      for (const child of node.children) {
        const childItems = discover(child, fullPath, headerContext);
        created.push(...childItems);
      }
    }
  } else if (node.type === 'file') {
    let content = '';

    // PX-30: ヘッダーコメントを先頭に追加（headerContext が提供された場合のみ）
    if (headerContext) {
      const headerPaths = helpers.resolveHeaderPaths(
        fullPath,
        headerContext.graphDirAbs,
        headerContext.graphBasename,
        headerContext.dirsTreeBasename,
        headerContext.sourceBasename
      );

      // このファイルの mappedNodeIds に関連する prose ノードに絞り込む
      const mappedNodeIdStrings = (node.mappedNodeIds || []).map(function (e) {
        return (typeof e === 'string') ? e : e.nodeId;
      });
      const mappedNodeIdsSet = new Set(mappedNodeIdStrings);
      const fileCrossRefs = (headerContext.crossReferences || []).filter(function (cr) {
        return cr.connections && cr.connections.some(function (conn) {
          return mappedNodeIdsSet.has(conn.toNodeId);
        });
      });

      const headerComment = helpers.generateHeaderComment(
        headerPaths,
        node.mappedNodeIds || [],
        mappedNodeIdStrings,
        fileCrossRefs,
        headerContext.graphBasename,
        headerContext.sourceBasename,
        headerContext.lang
      );
      content += headerComment + '\n';
    }

    // ファイル末尾にスタブマーカーを追記（実装が必要なノードIDとタイトルを明示）
    const stubEntries = (node.mappedNodeIds || []).filter(function (e) {
      return typeof e !== 'string';
    });
    if (stubEntries.length > 0) {
      content += '\n';
      for (let si = 0; si < stubEntries.length; si++) {
        const entry = stubEntries[si];
        content += '// TODO: [::STUB::] MUST implement NODE_ID=' + entry.nodeId + ': ' + (entry.title || '') + '\n';
      }
    }
    created.push({ type: 'file', path: fullPath, size: content.length, content });
  }

  return created;
}

// ============================================================
// dry-run 出力生成
// ============================================================

/**
 * dry-run モードの出力 JSON を生成する
 *
 * @param {Array} created - discover() の戻り値
 * @param {string} lang - 対象言語
 * @returns {object} dry-run 出力 JSON
 */
function runDryRun(created, lang) {
  return {
    ok: true,
    dryRun: true,
    language: lang,
    created: created.map(c => ({ type: c.type, path: c.path })),
    total: created.length,
    note: 'dry-run モードです。実際に生成するには --dry-run を外して再実行してください。',
  };
}

// ============================================================
// readline 確認プロンプト
// ============================================================

/**
 * ユーザーに確認プロンプトを表示し、続行するかどうかを返す
 *
 * TTY の場合のみプロンプトを表示する。非TTYまたは --force の場合は常に true。
 *
 * @param {Array} created - discover() の戻り値
 * @param {boolean} isForce - --force フラグ
 * @returns {Promise<boolean>} 続行する場合は true
 */
async function confirmPrompt(created) {
  if (!process.stdin.isTTY) {
    return true;
  }

  const rl = require('readline').createInterface({ input: process.stdin, output: process.stderr });
  const summary = created
    .filter(c => c.type === 'file')
    .map(c => `  ${c.path}`)
    .join('\n');
  process.stderr.write(`以下の ${created.length} アイテムを生成します:\n${summary}\n\n続行しますか？ (y/N): `);

  const answer = await new Promise(resolve => rl.question('', resolve));
  rl.close();
  return answer.toLowerCase() === 'y';
}

// ============================================================
// 第2パス — 実際のファイル/ディレクトリ作成
// ============================================================

/**
 * ディスカバリ結果に基づき、実際のディレクトリとファイルを作成する
 *
 * @param {Array} created - discover() の戻り値
 * @param {boolean} isForce - 上書きを許可する場合は true
 * @returns {Array<{type:string, path:string, action:string}>} 作成結果
 * @throws {Error} 既存ファイルがあり isForce が false の場合
 */
function createItems(created, isForce) {
  const actuallyCreated = [];

  for (const item of created) {
    if (item.type === 'directory') {
      fs.mkdirSync(item.path, { recursive: true });
      actuallyCreated.push({ type: 'directory', path: item.path, action: 'created' });
    } else if (item.type === 'file') {
      if (fs.existsSync(item.path) && !isForce) {
        throw new Error(ERROR_FILE_EXISTS(item.path));
      }
      try {
        fs.writeFileSync(item.path, item.content, 'utf-8');
      } catch (err) {
        throw new Error(ERROR_CREATE_FAILED(item.path, err.message));
      }
      actuallyCreated.push({
        type: 'file',
        path: item.path,
        action: fs.existsSync(item.path) && isForce ? 'overwritten' : 'created',
      });
    }
  }

  return actuallyCreated;
}

// ============================================================
// 削除モード — 生成されたファイル/ディレクトリの完全削除
// ============================================================

/**
 * ディスカバリ結果に基づき、生成されたファイルとディレクトリを削除する
 *
 * ファイル → 空ディレクトリの順に、逆順（末端からルート方向）で削除する。
 * これにより、削除中に親ディレクトリが非空になることを防ぐ。
 * 存在しないアイテムはスキップする（冪等性確保）。
 *
 * @param {Array} created - discover() の戻り値
 * @returns {Array<{type:string, path:string, action:string}>} 削除結果
 */
function deleteItems(created) {
  const results = [];

  // 逆順で処理（ファイル先 → ディレクトリは末端から）
  const reversed = [...created].reverse();

  for (const item of reversed) {
    if (!fs.existsSync(item.path)) {
      results.push({ type: item.type, path: item.path, action: 'not_found' });
      continue;
    }

    try {
      if (item.type === 'file') {
        fs.unlinkSync(item.path);
        results.push({ type: 'file', path: item.path, action: 'deleted' });
      } else if (item.type === 'directory') {
        // ディレクトリは空の場合のみ削除（子が先に削除されているはず）
        try {
          fs.rmdirSync(item.path);
          results.push({ type: 'directory', path: item.path, action: 'deleted' });
        } catch (dirErr) {
          if (dirErr.code === 'ENOTEMPTY' || dirErr.code === 'ENOTDIR') {
            results.push({ type: 'directory', path: item.path, action: 'skipped_not_empty' });
          } else {
            throw dirErr;
          }
        }
      }
    } catch (err) {
      throw new Error(ERROR_DELETE_FAILED(item.path, err.message));
    }
  }

  return results;
}

// ============================================================
// ヘッダーコメントコンテキスト構築 (buildHeaderContext)
// PX-30: Dirs-Tree.json から discover に渡すコンテキストを構築する
// ============================================================

/**
 * Dirs-Tree.json からヘッダーコメント生成に必要なコンテキストを構築する。
 *
 * @param {object} dirsTree - 読み込まれた Dirs-Tree.json のパース結果
 * @param {string} dirsTreePath - Dirs-Tree.json ファイルの絶対パス
 * @param {string} rootDir - ファイル生成先ルートディレクトリの絶対パス
 * @param {string} lang - 対象言語
 * @returns {object|null} ヘッダーコンテキスト、または null（構築不能時）
 */
function buildHeaderContext(dirsTree, dirsTreePath, rootDir, lang) {
  const sourceGraph = dirsTree.sourceGraph;
  const sourceFile = dirsTree.sourceFile;
  if (!sourceGraph) return null;

  const graphDirAbs = path.dirname(sourceGraph);
  const graphBasename = path.basename(sourceGraph);
  const sourceBasename = sourceFile ? path.basename(sourceFile) : 'UNKNOWN_SOURCE.md';
  const dirsTreeBasename = path.basename(dirsTreePath);

  // nodeMetaMap の構築（graph.sourceFile に含まれる node.title, node.headingRef は
  // Dirs-Tree.json には直接格納されていないため、crossReferences から収集）
  const nodeMetaMap = {};
  const crossReferences = (dirsTree.trees && dirsTree.trees[lang] && dirsTree.trees[lang].crossReferences) || [];
  for (let i = 0; i < crossReferences.length; i++) {
    const cr = crossReferences[i];
    nodeMetaMap[cr.nodeId] = { title: cr.title || '', headingRef: cr.headingRef || '' };
  }

  return {
    graphDirAbs: graphDirAbs,
    graphBasename: graphBasename,
    dirsTreeBasename: dirsTreeBasename,
    sourceBasename: sourceBasename,
    crossReferences: crossReferences,
    nodeMetaMap: nodeMetaMap,
    lang: lang,
  };
}

// ============================================================
// メインエントリポイント
// ============================================================

/**
 * メイン処理 — 引数パース → ディスカバリ → 確認 → 作成 → JSON出力
 *
 * @param {string[]} [testArgs] - テスト用の引数配列。省略時は process.argv.slice(2)
 */
async function main(testArgs) {
  const args = testArgs || process.argv.slice(2);

  const parsed = parseArgs(args);
  if (!parsed.ok) {
    console.error(parsed.error);
    process.exit(1);
    return;
  }

  const { dirsTreePath, rootDir, lang, isDryRun, isForce, isDelete } = parsed;

  let dirsTree;
  try {
    const raw = fs.readFileSync(dirsTreePath, 'utf-8');
    dirsTree = JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(ERROR_FILE_NOT_FOUND(dirsTreePath));
    } else {
      console.error(ERROR_PARSE_FAILED(dirsTreePath, err.message));
    }
    process.exit(1);
    return;
  }

  const tree = dirsTree.trees && dirsTree.trees[lang];
  if (!tree) {
    const msg = `${lang} は Dirs-Tree.json 内に定義が存在しないため、何も作成せずに正常に終了しました。`;
    console.log(msg);
    process.exit(0);
    return;
  }

  // PX-30: ヘッダーコメント生成用コンテキストの構築
  const headerContext = buildHeaderContext(dirsTree, dirsTreePath, rootDir, lang);

  // 第1パス: 生成予定アイテムのディスカバリ
  const created = discover(tree, rootDir, headerContext);

  // --delete モード: 生成されたアイテムを完全削除
  if (isDelete) {
    // dry-run モード: 削除予定一覧を表示して終了
    if (isDryRun) {
      process.stdout.write(JSON.stringify({
        ok: true,
        dryRun: true,
        deleteMode: true,
        language: lang,
        toBeDeleted: created.map(c => ({ type: c.type, path: c.path })),
        total: created.length,
        note: 'dry-run モードです。実際に削除するには --delete から --dry-run を外して再実行してください。',
      }) + '\n');
      return;
    }

    try {
      const deleteResults = deleteItems(created);
      process.stdout.write(JSON.stringify({
        ok: true,
        dryRun: false,
        deleteMode: true,
        language: lang,
        deleted: deleteResults,
        total: deleteResults.length,
      }) + '\n');
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
    return;
  }

  // dry-run モード（作成時）: 予定一覧を表示して終了
  if (isDryRun) {
    process.stdout.write(JSON.stringify(runDryRun(created, lang)) + '\n');
    return;
  }

  // 確認プロンプト（--force の場合はスキップ）
  if (!isForce) {
    const confirmed = await confirmPrompt(created);
    if (!confirmed) {
      process.stdout.write(JSON.stringify({
        ok: false,
        cancelled: true,
        message: 'ユーザーによりキャンセルされました',
      }) + '\n');
      return;
    }
  }

  // 第2パス: 実際のファイル作成
  try {
    const actuallyCreated = createItems(created, isForce);
    process.stdout.write(JSON.stringify({
      ok: true,
      dryRun: false,
      language: lang,
      created: actuallyCreated,
      total: actuallyCreated.length,
    }) + '\n');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
    return;
  }
}

// ============================================================
// エントリポイント（CLI実行時）
// ============================================================

if (require.main === module) {
  main().catch(e => {
    console.error(`[ERROR] ${e.message}`);
    process.exit(1);
  });
}

module.exports = { parseArgs, discover, runDryRun, confirmPrompt, createItems, buildHeaderContext, main };
