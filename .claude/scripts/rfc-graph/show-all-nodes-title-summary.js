#!/usr/bin/env node

/**
 * show-all-nodes-title-summary.js — フェーズ内全ノードの title/summary を表示
 *
 * split-to-tickets.md Step 4.2 で使用する。Tickets.json の指定フェーズの nodeIds
 * から、GRAPH.json の該当ノードの title と summary を抽出して表示する。
 * 出力は AI がフェーズ名とサマリーを生成するための参照情報として使用される。
 *
 * 使用法:
 *   node show-all-nodes-title-summary.js --tickets=<PATH> --graph=<PATH> --phase=<phaseId>
 *
 * 出力形式:
 *   N0001: [§1 目的 — 本crateの責務定義] RustからPJSUAを安全に...
 *   N0002: [§1a M20実装優先度マップ] M20追補の全実装項目を...
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
 * CLI引数をパースする。
 */
function parseArguments(argv) {
  const parsed = {};
  for (const arg of argv) {
    const match = arg.match(/^--(.+?)=(.+)$/);
    if (match) {
      parsed[match[1]] = match[2];
    }
  }
  if (!parsed.tickets || !parsed.graph || !parsed.phase) {
    console.error('[ERROR] Usage: node show-all-nodes-title-summary.js --tickets=<PATH> --graph=<PATH> --phase=<phaseId>');
    process.exit(2);
  }
  return parsed;
}

/**
 * 指定フェーズの nodeIds を取得する。
 */
function getPhaseNodeIds(ticketsData, phaseId) {
  const phases = ticketsData.phases || [];
  const phase = phases.find(function(p) {
    return p.name === phaseId || 'P' + p.id === phaseId || String(p.id) === phaseId.replace('P', '');
  });
  if (!phase) {
    console.error('[ERROR] Phase not found: ' + phaseId);
    process.exit(1);
  }
  return phase.nodeIds || [];
}

/**
 * メイン処理。
 */
function main() {
  const args = parseArguments(process.argv.slice(2));

  const ticketsData = JSON.parse(fs.readFileSync(path.resolve(args.tickets), 'utf8'));
  const graphData = JSON.parse(fs.readFileSync(path.resolve(args.graph), 'utf8'));
  const nodes = graphData.nodes || [];
  const nodeMap = {};
  for (const node of nodes) {
    nodeMap[node.id] = node;
  }

  const nodeIds = getPhaseNodeIds(ticketsData, args.phase);
  if (nodeIds.length === 0) {
    return; // 空出力、exit 0
  }

  for (const nid of nodeIds) {
    const node = nodeMap[nid];
    if (!node) {
      console.error('[ERROR] Node not found in GRAPH.json: ' + nid);
      process.exit(1);
    }
    const title = node.title || '(タイトルなし)';
    const summary = node.summary || '(サマリーなし)';
    console.log(nid + ': [' + title + '] ' + summary);
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseArguments, getPhaseNodeIds };
