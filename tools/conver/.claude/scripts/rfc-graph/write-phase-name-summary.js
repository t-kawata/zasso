#!/usr/bin/env node

/**
 * write-phase-name-summary.js — Writes the name/summary of a phase
 *
 * Used in split-to-tickets.md Step 4.2. Writes name and summary to the
 * specified phase in Tickets.json. name/summary are received as JSON from stdin.
 *
 * Usage:
 *   echo '{"name":"認証基盤","summary":"認証トークン生成・検証・Session管理"}' | \
 *     node write-phase-name-summary.js <Tickets.json> <phaseId>
 *
 * Exit codes:
 *   0 = success
 *   1 = data error
 *   2 = argument error
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Main entry point.
 */
function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('[ERROR] 使用法: echo \'{"name":"...","summary":"..."}\' | node write-phase-name-summary.js <Tickets.json> <phaseId>');
    process.exit(2);
  }

  const ticketsPath = path.resolve(args[0]);
  const phaseId = args[1];

  // Read JSON from stdin
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

    // Read Tickets.json
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

    // Write back
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
