#!/usr/bin/env node

/**
 * write-phase-name-summary.js — フェーズの name/summary を書き込む
 *
 * split-to-tickets.md Step 4.2 で使用する。Tickets.json の指定フェーズに
 * name と summary を書き込む。name/summary は stdin から JSON で受け取る。
 *
 * 使用法:
 *   echo '{"name":"認証基盤","summary":"認証トークン生成・検証・Session管理"}' | \
 *     node write-phase-name-summary.js <Tickets.json> <phaseId>
 *
 * 終了コード:
 *   0 = 成功
 *   1 = データエラー
 *   2 = 引数エラー
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * メイン処理。
 */
function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('[ERROR] 使用法: echo \'{"name":"...","summary":"..."}\' | node write-phase-name-summary.js <Tickets.json> <phaseId>');
    process.exit(2);
  }

  const ticketsPath = path.resolve(args[0]);
  const phaseId = args[1];

  // stdin から JSON を読み取る
  let inputData = '';
  const stdin = process.stdin;
  stdin.setEncoding('utf8');
  stdin.on('data', function(chunk) { inputData += chunk; });
  stdin.on('end', function() {
    if (!inputData.trim()) {
      console.error('[ERROR] stdin からデータを受け取れませんでした。name/summary を JSON で渡してください。');
      process.exit(1);
    }

    let data;
    try {
      data = JSON.parse(inputData);
    } catch (e) {
      console.error('[ERROR] JSON パースエラー: ' + e.message);
      process.exit(1);
    }

    const name = data.name;
    const summary = data.summary;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      console.error('[ERROR] name が空、または文字列ではありません。');
      process.exit(1);
    }
    if (!summary || typeof summary !== 'string' || summary.trim().length === 0) {
      console.error('[ERROR] summary が空、または文字列ではありません。');
      process.exit(1);
    }

    // Tickets.json を読み込み
    let ticketsData;
    try {
      ticketsData = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
    } catch (e) {
      console.error('[ERROR] Tickets.json の読み込みに失敗しました: ' + e.message);
      process.exit(1);
    }

    const phases = ticketsData.phases || [];
    const phaseIndex = phases.findIndex(function(p) {
      return p.name === phaseId || 'P' + p.id === phaseId || String(p.id) === phaseId.replace('P', '');
    });

    if (phaseIndex === -1) {
      console.error('[ERROR] フェーズが見つかりません: ' + phaseId);
      process.exit(1);
    }

    // 書き込み
    phases[phaseIndex].name = name.trim();
    phases[phaseIndex].summary = summary.trim();

    fs.writeFileSync(ticketsPath, JSON.stringify(ticketsData, null, 2) + '\n', 'utf8');
    console.log(JSON.stringify({ success: true, phaseId: phaseId, name: name.trim() }));
  });
}

if (require.main === module) {
  main();
}

module.exports = {};
