#!/usr/bin/env node

/**
 * check-phase-names-summaries.js — 全フェーズの name/summary 書き込み完了チェック
 *
 * Tickets.json の全フェーズに name と summary が空でなく設定されているか確認する。
 * split-to-tickets.md Step 4.2 の完了判定に使用する。
 *
 * 使用法:
 *   node check-phase-names-summaries.js <Tickets.json>
 *
 * 終了コード:
 *   0 = 全フェーズ完了
 *   1 = 未書き込みのフェーズあり
 *   2 = 引数エラー
 */

'use strict';

const fs = require('fs');
const path = require('path');

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('[ERROR] Usage: node check-phase-names-summaries.js <Tickets.json>');
    process.exit(2);
  }

  let ticketsData;
  try {
    ticketsData = JSON.parse(fs.readFileSync(path.resolve(args[0]), 'utf8'));
  } catch (e) {
    console.error('[ERROR] Failed to read Tickets.json: ' + e.message);
    process.exit(2);
  }

  const phases = ticketsData.phases || [];
  const missingPhases = [];

  for (const phase of phases) {
    const issues = [];
    if (!phase.name || typeof phase.name !== 'string' || phase.name.trim().length === 0) {
      issues.push('name is empty');
    }
    if (!phase.summary || typeof phase.summary !== 'string' || phase.summary.trim().length === 0) {
      issues.push('summary is empty');
    }
    if (issues.length > 0) {
      missingPhases.push({ phaseId: phase.id, name: phase.name, issues: issues });
    }
  }

  if (missingPhases.length > 0) {
    console.error('[FAIL] The following phases have missing name or summary:');
    for (const mp of missingPhases) {
      console.error('  P' + mp.phaseId + ' (' + (mp.name || '(unnamed)') + '): ' + mp.issues.join(', '));
    }
    process.exit(1);
  }

  console.log('[OK] All ' + phases.length + ' phases have name/summary set.');
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = {};
