#!/usr/bin/env node

/**
 * check-phase-names-summaries.js — Verify all phases have name/summary set
 *
 * Checks that all phases in Tickets.json have non-empty name and summary fields.
 * Used as the completion check for split-to-tickets.md Step 4.2.
 *
 * Usage:
 *   node check-phase-names-summaries.js <Tickets.json>
 *
 * Exit codes:
 *   0 = All phases complete
 *   1 = Some phases missing name/summary
 *   2 = Argument error
 */

'use strict';

const fs = require('fs');
const path = require('path');

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('[ERROR] 使用法: node check-phase-names-summaries.js <Tickets.json>');
    process.exit(2);
  }

  let ticketsData;
  try {
    ticketsData = JSON.parse(fs.readFileSync(path.resolve(args[0]), 'utf8'));
  } catch (e) {
    console.error('[ERROR] Tickets.json の読み込みに失敗しました: ' + e.message);
    process.exit(2);
  }

  const phases = ticketsData.phases || [];
  const missingPhases = [];

  for (const phase of phases) {
    const issues = [];
    if (!phase.name || typeof phase.name !== 'string' || phase.name.trim().length === 0) {
      issues.push('name が空');
    }
    if (!phase.summary || typeof phase.summary !== 'string' || phase.summary.trim().length === 0) {
      issues.push('summary が空');
    }
    if (issues.length > 0) {
      missingPhases.push({ phaseId: phase.id, name: phase.name, issues: issues });
    }
  }

  if (missingPhases.length > 0) {
    console.error('[FAIL] 以下のフェーズに name または summary の未書き込みがあります:');
    for (const mp of missingPhases) {
      console.error('  P' + mp.phaseId + ' (' + (mp.name || '(名前なし)') + '): ' + mp.issues.join(', '));
    }
    process.exit(1);
  }

  console.log('[OK] 全 ' + phases.length + ' フェーズの name/summary が設定済みです。');
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = {};
