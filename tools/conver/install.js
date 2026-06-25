#!/usr/bin/env node
// install.js — .claude ディレクトリのインストーラ
//
// 使用法:
//   install.js -t /path/to/target/.claude          # 上書きは1件ずつ確認
//   install.js -y -t /path/to/target/.claude        # 全て上書きを自動承認
//
// このスクリプトは __dirname で自身の位置を特定するため、
// どのカレントディレクトリから実行されても正しく動作する。

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SOURCE_DIR_NAME = '.claude';
const EXCLUDE_PATTERNS = ['.DS_Store'];

/**
 * コマンドライン引数を解析する。
 * @param {string[]} argv - process.argv
 * @returns {{ targetDir: string, overwriteAll: boolean } | null}
 *   解析成功時はオプションオブジェクト、失敗時は null
 */
function parseArgs(argv) {
  const args = argv.slice(2);
  let targetDir = null;
  let overwriteAll = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-t' || arg === '--target') {
      i++;
      if (i >= args.length) {
        console.error('エラー: -t の後にターゲットパスを指定してください。');
        return null;
      }
      targetDir = path.resolve(args[i]);
    } else if (arg === '-y') {
      overwriteAll = true;
    } else {
      console.error('エラー: 未知のオプションです: ' + arg);
      return null;
    }
  }

  if (!targetDir) {
    console.error('エラー: 必須オプション -t が指定されていません。');
    return null;
  }

  return { targetDir, overwriteAll };
}

/**
 * 使用方法を表示する。
 */
function showUsage() {
  console.log('使用法:');
  console.log('  install.js -t /path/to/target/.claude');
  console.log('  install.js -y -t /path/to/target/.claude');
  console.log('');
  console.log('オプション:');
  console.log('  -t, --target <path>   インストール先ディレクトリ（必須）');
  console.log('  -y                    全ての上書きを自動承認');
}

/**
 * 指定ディレクトリ以下から全ファイルを再帰収集し、起点からの相対パスを返す。
 * @param {string} dirPath - 収集起点ディレクトリ
 * @param {string} baseDir - 相対パスの基準ディレクトリ
 * @returns {string[]} baseDir からの相対パスの配列
 */
function collectFilesWithRelative(dirPath, baseDir) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (EXCLUDE_PATTERNS.includes(entry.name)) {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const subFiles = collectFilesWithRelative(fullPath, baseDir);
      files.push(...subFiles);
    } else {
      files.push(path.relative(baseDir, fullPath));
    }
  }

  return files;
}

/**
 * 1ファイルの上書きについてユーザーに確認する。
 * @param {string} relativePath - 確認対象の相対パス
 * @param {boolean} overwriteAll - -y フラグで全自動承認
 * @returns {Promise<boolean>} 上書きする場合は true
 */
function promptOverwrite(relativePath, overwriteAll) {
  if (overwriteAll) {
    return Promise.resolve(true);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${relativePath} は既に存在します。上書きしますか？ [y/n] `, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}

/**
 * 1ファイルをコピーする（必要に応じてプロンプト表示）。
 * @param {string} sourcePath - コピー元の絶対パス
 * @param {string} targetPath - コピー先の絶対パス
 * @param {string} relativePath - 表示用の相対パス
 * @param {boolean} overwriteAll - -y フラグ
 * @returns {Promise<'copied' | 'skipped' | 'overwritten'>} コピー結果
 */
async function copyFileWithPrompt(sourcePath, targetPath, relativePath, overwriteAll) {
  const targetExists = fs.existsSync(targetPath);

  if (targetExists) {
    const shouldOverwrite = await promptOverwrite(relativePath, overwriteAll);
    if (!shouldOverwrite) {
      return 'skipped';
    }
    fs.cpSync(sourcePath, targetPath);
    return 'overwritten';
  }

  const targetDir = path.dirname(targetPath);
  fs.mkdirSync(targetDir, { recursive: true });
  fs.cpSync(sourcePath, targetPath);
  return 'copied';
}

/**
 * インストールのサマリーを表示する。
 */
function showSummary(stats) {
  console.log('');
  console.log(`インストール完了: 合計 ${stats.total} ファイル`);
  console.log(`  新規コピー: ${stats.copied}`);
  console.log(`  上書き:     ${stats.overwritten}`);
  console.log(`  スキップ:   ${stats.skipped}`);
}

/**
 * メイン処理 — 全体の流れを制御する。
 */
async function main() {
  const options = parseArgs(process.argv);
  if (!options) {
    showUsage();
    process.exit(1);
  }

  const { targetDir, overwriteAll } = options;
  const scriptDir = __dirname;
  const sourceClaudeDir = path.join(scriptDir, SOURCE_DIR_NAME);

  // ソース .claude の存在確認
  if (!fs.existsSync(sourceClaudeDir)) {
    console.error(`エラー: ${sourceClaudeDir} が見つかりません。`);
    console.error('install.js と同じディレクトリに .claude ディレクトリが存在する必要があります。');
    process.exit(1);
  }

  // ファイル一覧を収集
  const files = collectFilesWithRelative(sourceClaudeDir, sourceClaudeDir);
  if (files.length === 0) {
    console.log('コピーするファイルがありません。');
    return;
  }

  console.log(`インストールを開始します: ${sourceClaudeDir} → ${targetDir}`);
  console.log(`対象ファイル数: ${files.length}`);
  console.log('');

  const stats = { total: files.length, copied: 0, overwritten: 0, skipped: 0 };

  for (const relativePath of files) {
    const sourcePath = path.join(sourceClaudeDir, relativePath);
    const targetPath = path.join(targetDir, relativePath);

    const result = await copyFileWithPrompt(sourcePath, targetPath, relativePath, overwriteAll);
    stats[result]++;
  }

  showSummary(stats);
}

main().catch((err) => {
  console.error('予期しないエラーが発生しました:', err.message);
  process.exit(1);
});
