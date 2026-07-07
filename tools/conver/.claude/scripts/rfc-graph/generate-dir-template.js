#!/usr/bin/env node
/**
 * generate-dir-template.js — Dirs-Tree.json に基づく実ディレクトリ/ファイル生成
 *
 * --dirs-tree=<path> --root-dir=<path> --lang=<lang> [--dry-run] [--force]
 *
 * Dirs-Tree.json に基づいて実際のディレクトリとテンプレートファイルを生成する。
 * 第1パス: 生成予定アイテムのディスカバリ（ファイル作成なし）
 * 確認プロンプト: 確認後（TTYのみ / --forceでスキップ）
 * 第2パス: 実際のファイル作成
 *
 * 出力契約:
 *   正常時 → {"ok":true, "created":[...]}（終了コード0）
 *   異常時 → {"ok":false, "error":"..."}（終了コード1）
 */

'use strict';

const fs = require('fs');
const path = require('path');

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

/** 3段テンプレートエラー — ファイル作成失敗 */
const ERROR_CREATE_FAILED = (filePath, message) =>
  `[ERROR] ファイル作成に失敗しました: ${filePath}\n原因: ${message}\n対応: パーミッションやディスク容量を確認してください`;

// ============================================================
// CLI引数パース
// ============================================================

/**
 * CLI引数をパースし、パース結果を返す
 *
 * @param {string[]} argv - コマンドライン引数配列
 * @returns {object} パース結果。成功時: {ok:true, dirsTreePath, rootDir, lang, isDryRun, isForce}
 *                   失敗時: {ok:false, error:string}
 */
function parseArgs(argv) {
  const dirsTreeFlag = argv.find(a => a.startsWith('--dirs-tree='));
  const rootDirFlag = argv.find(a => a.startsWith('--root-dir='));
  const langFlag = argv.find(a => a.startsWith('--lang='));
  const isDryRun = argv.includes('--dry-run');
  const isForce = argv.includes('--force');

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
 * @returns {Array<{type:string, path:string, size?:number, content?:string}>}
 *   生成予定アイテムの配列（ファイル作成は行わない）
 */
function discover(node, currentPath) {
  const fullPath = path.join(currentPath, node.name);
  const created = [];

  if (node.type === 'directory') {
    created.push({ type: 'directory', path: fullPath });
    if (node.children) {
      for (const child of node.children) {
        const childItems = discover(child, fullPath);
        created.push(...childItems);
      }
    }
  } else if (node.type === 'file') {
    let content = '';
    if (node.declarationStub) {
      content += node.declarationStub + '\n\n';
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

  const { dirsTreePath, rootDir, lang, isDryRun, isForce } = parsed;

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
    console.error(ERROR_LANG_TREE_NOT_FOUND(lang));
    process.exit(1);
    return;
  }

  // 第1パス: 生成予定アイテムのディスカバリ
  const created = discover(tree, rootDir);

  // dry-run モード: 予定一覧を表示して終了
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

module.exports = { parseArgs, discover, runDryRun, confirmPrompt, createItems, main };
