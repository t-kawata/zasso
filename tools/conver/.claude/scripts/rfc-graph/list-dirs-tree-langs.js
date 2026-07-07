#!/usr/bin/env node
/**
 * list-dirs-tree-langs.js — Dirs-Tree.json から言語一覧を出力する
 *
 * $1: Dirs-Tree.json のファイルパス
 * stdout: 言語名をスペース区切りで出力（例: "rust go typescript"）
 * 終了コード: 常に 0（エラー時は空出力）
 */
const fs = require('fs');
const path = require('path');

const filePath = process.argv[2];
if (!filePath) {
  // 引数なし → フォールバック: 全言語
  process.stdout.write('rust go typescript');
  process.exit(0);
}

try {
  const resolved = path.resolve(filePath);
  const raw = fs.readFileSync(resolved, 'utf-8');
  const dirsTree = JSON.parse(raw);
  const languages = Object.keys(dirsTree.trees || {});
  if (languages.length > 0) {
    process.stdout.write(languages.join(' '));
  } else {
    process.stdout.write('rust go typescript');
  }
} catch (_) {
  // 読み込み／パースエラー → フォールバック
  process.stdout.write('rust go typescript');
}
