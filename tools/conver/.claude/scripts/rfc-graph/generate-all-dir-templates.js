#!/usr/bin/env node
/**
 * generate-all-dir-templates.js — Dirs-Tree.json 内の全言語に対して一括生成/削除
 *
 * --dirs-tree=<path> [--dry-run] [--delete]
 *
 * Dirs-Tree.json に定義された全言語のディレクトリ/ファイルを一括生成する。
 * --delete を指定すると生成物を完全削除する（--dry-run で予定確認可能）。
 *
 * 出力契約:
 *   正常時 → JSON 配列（言語ごとの結果）を stdout に出力、終了コード 0
 *   異常時 → stderr にエラー、終了コード 1
 */
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = __dirname;
const GENERATE_SCRIPT = path.join(SCRIPT_DIR, 'generate-dir-template.js');

// ============================================================
// 引数パース
// ============================================================

const args = process.argv.slice(2);
const dirsTreeFlag = args.find(a => a.startsWith('--dirs-tree='));
const isDryRun = args.includes('--dry-run');
const isDelete = args.includes('--delete');

if (!dirsTreeFlag) {
  console.error('[ERROR] --dirs-tree=<path> が必要です');
  process.exit(1);
}

const dirsTreePath = path.resolve(dirsTreeFlag.slice('--dirs-tree='.length));

// ============================================================
// Dirs-Tree.json 読み込み
// ============================================================

let dirsTree;
try {
  dirsTree = JSON.parse(fs.readFileSync(dirsTreePath, 'utf-8'));
} catch (err) {
  console.error(`[ERROR] Dirs-Tree.json の読み込みに失敗: ${err.message}`);
  process.exit(1);
}

const languages = Object.keys(dirsTree.trees || {});
if (languages.length === 0) {
  console.log(JSON.stringify({ ok: true, skipped: true, message: 'Dirs-Tree.json に言語定義がありません', languages: [] }));
  process.exit(0);
}

// ============================================================
// 言語別に generate-dir-template.js を実行
// ============================================================

const results = [];

for (const lang of languages) {
  const actionLabel = isDelete ? '削除' : '生成';
  console.error(`[${lang}] ${actionLabel}を開始します...`);

  const cmdArgs = [
    `--dirs-tree="${dirsTreePath}"`,
    '--root-dir="."',
    `--lang="${lang}"`,
  ];

  if (isDryRun) cmdArgs.push('--dry-run');
  if (isDelete) cmdArgs.push('--delete');

  try {
    const stdout = execSync(`node "${GENERATE_SCRIPT}" ${cmdArgs.join(' ')}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const result = JSON.parse(stdout.trim());
    results.push({ language: lang, ok: true, ...result });
    console.error(`[${lang}] ${actionLabel}完了`);
  } catch (err) {
    const stderr = err.stderr || '';
    const stdout = err.stdout || '';
    let parsed = null;
    try { parsed = JSON.parse(stdout.trim()); } catch (_) { /* ignore */ }
    results.push({
      language: lang,
      ok: false,
      error: stderr.trim() || err.message,
      ...(parsed || {}),
    });
    console.error(`[${lang}] ${actionLabel}失敗: ${stderr.trim() || err.message}`);
  }
}

// ============================================================
// 結果出力
// ============================================================

const overallOk = results.every(r => r.ok);
console.log(JSON.stringify({
  ok: overallOk,
  dryRun: isDryRun,
  deleteMode: isDelete,
  results,
  total: results.length,
  succeeded: results.filter(r => r.ok).length,
  failed: results.filter(r => !r.ok).length,
}, null, 2));

if (!overallOk) {
  process.exit(1);
}