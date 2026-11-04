#!/usr/bin/env node
'use strict';

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';

function usage() {
  console.log(`
Usage:
  delete-claude-jsonls.js [-y] -t <directory> [--dry-run]

Options:
  -t, --target <directory>  対象プロジェクトのパス
  -y, --yes                対話確認をスキップ
  --dry-run                削除対象の表示のみ
  -h, --help               ヘルプ

Examples:
  delete-claude-jsonls.js -t ~/shyme/gaia
  delete-claude-jsonls.js -y -t ~/shyme/gaia
  delete-claude-jsonls.js -t ~/shyme/gaia --dry-run
`.trim());
}

function parseArgs(args) {
  let target;
  let dryRun = false;
  let yes = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '-t':
      case '--target':
        if (target !== undefined) {
          throw new Error('対象の指定は1回だけにしてください。');
        }
        if (!args[i + 1] || args[i + 1].startsWith('-')) {
          throw new Error(`${arg} にパスを指定してください。`);
        }
        target = args[++i];
        break;

      case '-y':
      case '--yes':
        yes = true;
        break;

      case '--dry-run':
        dryRun = true;
        break;

      case '-h':
      case '--help':
        usage();
        process.exit(0);
        break;

      default:
        throw new Error(`不明な引数: ${arg}`);
    }
  }

  if (!target) {
    throw new Error('-t <directory> を指定してください。');
  }

  return { target, dryRun, yes };
}

function expandHome(value) {
  if (value === '~') {
    return os.homedir();
  }
  if (value.startsWith('~/')) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

// シンボリックリンクはたどらない。
async function collectJsonls(directory, files) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);

    if (entry.isSymbolicLink()) continue;

    if (entry.isDirectory()) {
      await collectJsonls(filePath, files);
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      const stat = await fs.lstat(filePath);

      if (stat.isFile()) {
        files.push({
          path: filePath,
          dev: stat.dev,
          ino: stat.ino,
          size: stat.size,
          mtimeMs: stat.mtimeMs,
          ctimeMs: stat.ctimeMs,
        });
      }
    }
  }
}

async function main() {
  const { target, dryRun, yes } = parseArgs(process.argv.slice(2));

  // 元のディレクトリが消えていても、過去のログを指定できる。
  const targetPath = path.resolve(expandHome(target));

  if (targetPath === path.parse(targetPath).root) {
    throw new Error('ルートディレクトリは指定できません。');
  }

  const projectsPath = path.join(os.homedir(), '.claude', 'projects');
  const projectKey = targetPath.replace(/[\\/]/g, '-');

  let entries;
  try {
    entries = await fs.readdir(projectsPath, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(`ログディレクトリがありません: ${projectsPath}`);
      return;
    }
    throw error;
  }

  // 名前の完全一致、または「対象名-」で始まるディレクトリを選ぶ。
  // 例: gaia-backup のような兄弟名も一致するため一覧を確認すること。
  const projects = entries
    .filter(entry =>
      entry.isDirectory() &&
      (
        entry.name === projectKey ||
        entry.name.startsWith(`${projectKey}-`)
      )
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  if (projects.length === 0) {
    console.log(`対象プロジェクトがありません: ${projectKey}`);
    return;
  }

  const files = [];

  console.log(`対象パス: ${targetPath}`);
  console.log(`保存先:   ${projectsPath}`);
  console.log('\n対象プロジェクト:');

  for (const project of projects) {
    console.log(`  ${project.name}`);
    await collectJsonls(path.join(projectsPath, project.name), files);
  }

  if (files.length === 0) {
    console.log('\n削除対象の .jsonl はありません。');
    return;
  }

  console.log('\n削除対象ファイル:');
  for (const file of files) {
    console.log(`  ${path.relative(projectsPath, file.path)}`);
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  console.log(`\nプロジェクト数: ${projects.length}`);
  console.log(`ファイル数:     ${files.length}`);
  console.log(`合計サイズ:     ${(totalBytes / 1024 / 1024).toFixed(2)} MiB`);

  if (dryRun) {
    console.log('\n--dry-run: 削除していません。');
    return;
  }

  console.log('\nClaude Code を終了してから実行してください。');
  console.log('会話履歴も削除されます。この操作は取り消せません。');

  if (!yes) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error(
        '削除には対話端末での確認、または -y / --yes が必要です。'
      );
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    let answer;
    try {
      answer = await rl.question('\n削除する場合は yes と入力: ');
    } finally {
      rl.close();
    }

    if (answer.trim() !== 'yes') {
      console.log('キャンセルしました。');
      return;
    }
  } else {
    console.log('\n-y / --yes: 対話確認をスキップします。');
  }

  // 一覧作成後に変更・置換されたファイルがあれば削除開始前に中止。
  // 検査後の同時書き込みを防ぐロックではないため、Claude Code は終了する。
  for (const file of files) {
    const stat = await fs.lstat(file.path);

    if (
      !stat.isFile() ||
      stat.dev !== file.dev ||
      stat.ino !== file.ino ||
      stat.size !== file.size ||
      stat.mtimeMs !== file.mtimeMs ||
      stat.ctimeMs !== file.ctimeMs
    ) {
      throw new Error(
        `ファイルが変更されました。削除を中止します: ${file.path}`
      );
    }
  }

  let deleted = 0;
  let failed = 0;

  for (const file of files) {
    try {
      await fs.unlink(file.path);
      deleted++;
    } catch (error) {
      failed++;
      console.error(`削除失敗: ${file.path}: ${error.message}`);
    }
  }

  console.log(`\n削除完了: ${deleted} ファイル / 失敗: ${failed} ファイル`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(`エラー: ${error.message}`);
  process.exitCode = 1;
});
