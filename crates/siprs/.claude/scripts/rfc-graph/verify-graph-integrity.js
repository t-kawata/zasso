#!/usr/bin/env node
/**
 * verify-graph-integrity.js — グラフ整合性の5軸チェック
 *
 * --graph-after=<path> --graph-before=<path> --source=<path>
 *
 * graphify 〜 boundify の接合部において、グラフデータが修正前後で
 * 壊れていないことを検証する。以下の5軸をチェック：
 *
 * 1. nodes構成: nodes の ID 集合が変化していないか
 * 2. edges構成: edges 配列が変化していないか
 * 3. headingRefs解決性: 全 headingRefs が解決可能か
 * 4. 孤立ノード: 1本もエッジを持たないノードがないか
 * 5. 未カバー見出し: ソースの見出しが全ノードの headingRefs に含まれているか
 *
 * 出力契約:
 *   正常時 → {ok: true}
 *   異常時 → {ok: false, errors: [...], remedies: [...]}
 *             remedies は AI が次に取るべき行動の自然言語指示
 */
'use strict';

const fs = require('fs');
const path = require('path');

// verify.js の検証関数を直接利用
let verify;
try {
  verify = require('./verify.js');
} catch (_) {
  // fallback: verify.js がモジュールエクスポートしていない場合に備える
}

// ============================================================
// エラーメッセージテンプレート
// ============================================================

/** 3要素テンプレート: [問題] / [原因] / [修正方法] */
function formatError(problem, cause, remedy) {
  return `[ERROR] ${problem}\n原因: ${cause}\n対応: ${remedy}`;
}

// ============================================================
// 引数パース
// ============================================================

/**
 * CLI引数をパースする
 */
function parseArgs(argv) {
  const afterFlag = argv.find(a => a.startsWith('--graph-after='));
  const beforeFlag = argv.find(a => a.startsWith('--graph-before='));
  const sourceFlag = argv.find(a => a.startsWith('--source='));

  return {
    graphAfter: afterFlag ? path.resolve(afterFlag.slice('--graph-after='.length)) : null,
    graphBefore: beforeFlag ? path.resolve(beforeFlag.slice('--graph-before='.length)) : null,
    sourcePath: sourceFlag ? path.resolve(sourceFlag.slice('--source='.length)) : null,
  };
}

// ============================================================
// グラフ読み込み
// ============================================================

function loadGraph(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

// ============================================================
// チェック1: nodes構成
// ============================================================

/**
 * 修正前後で nodes の ID 集合が一致しているか検証する
 */
function checkNodesIntegrity(graphAfter, graphBefore) {
  const errors = [];
  const remedies = [];

  if (!graphAfter || !graphBefore) return { errors, remedies };

  const afterIds = new Set((graphAfter.nodes || []).map(n => n.id));
  const beforeIds = new Set((graphBefore.nodes || []).map(n => n.id));

  const added = [...afterIds].filter(id => !beforeIds.has(id));
  const removed = [...beforeIds].filter(id => !afterIds.has(id));

  if (added.length > 0) {
    errors.push(formatError(
      `${added.length}件のノードが増加しています`,
      `追加されたノードID: ${added.join(', ')}`,
      `crud.js delete-node で追加分を削除するか、graphify に戻ってノード定義を見直してください。`
    ));
    remedies.push(`crud.js --graph="${process.argv[2]}" delete-node --id=${added.join(',')} で余分なノードを削除するか、グラフを再生成してください。`);
  }

  if (removed.length > 0) {
    errors.push(formatError(
      `${removed.length}件のノードが削除されています`,
      `削除されたノードID: ${removed.join(', ')}`,
      `欠落したノードを crud.js create-nodes で再追加するか、graphify に戻ってグラフを再生成してください。`
    ));
    remedies.push(`crud.js create-nodes で不足ノードを追加するか、グラフを再生成してください。`);
  }

  return { errors, remedies };
}

// ============================================================
// チェック2: edges構成
// ============================================================

/**
 * 修正前後で edges が一致しているか検証する
 * エッジは from+to+type のタプルで比較する。
 */
function checkEdgesIntegrity(graphAfter, graphBefore) {
  const errors = [];
  const remedies = [];

  if (!graphAfter || !graphBefore) return { errors, remedies };

  const edgeKey = e => `${e.from}->${e.to}(${e.type})`;
  const afterEdges = new Set((graphAfter.edges || []).map(edgeKey));
  const beforeEdges = new Set((graphBefore.edges || []).map(edgeKey));

  const added = [...afterEdges].filter(k => !beforeEdges.has(k));
  const removed = [...beforeEdges].filter(k => !afterEdges.has(k));

  if (added.length > 0) {
    errors.push(formatError(
      `${added.length}本のエッジが増加しています`,
      `追加されたエッジ: ${added.join(', ')}`,
      `crud.js delete-edges で追加分を削除するか、グラフを再生成してください。`
    ));
    remedies.push(`余分なエッジを削除してから再実行してください。`);
  }

  if (removed.length > 0) {
    errors.push(formatError(
      `${removed.length}本のエッジが削除されています`,
      `削除されたエッジ: ${removed.join(', ')}`,
      `crud.js create-edges で不足エッジを再追加するか、グラフを再生成してください。`
    ));
    remedies.push(`crud.js create-edges --file=... で不足エッジを追加してから再実行してください。`);
  }

  return { errors, remedies };
}

// ============================================================
// チェック3-5: verify.js の関数を利用
// ============================================================

/**
 * verify.js の 3軸検証（headingRefs解決性、孤立ノード、未カバー見出し）を
 * 子プロセスとして実行し、結果を返す。
 *
 * verify.js の関数は内部でファイルI/Oを行うため、安全のため子プロセス実行する。
 */
function checkWithVerifyjs(graphPath, sourcePath) {
  const errors = [];
  const remedies = [];

  if (!sourcePath || !graphPath) return { errors, remedies };

  const { execSync } = require('child_process');
  const verifyScript = path.join(__dirname, 'verify.js');

  try {
    const stdout = execSync(
      `node "${verifyScript}" --graph="${graphPath}" --source="${sourcePath}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const result = JSON.parse(stdout.trim());
    if (!result.ok) {
      // verify.js のエラーをそのまま伝播
      if (result.errors) {
        for (const err of result.errors) {
          errors.push(err);
        }
      }
      // 全般的な remedy
      remedies.push(
        `verify.js のエラーを解消してください。未カバー見出しがあればノードの headingRefs を拡張し、孤立ノードがあればエッジを追加し、解決不能な headingRefs があれば texts トークンを修正してください。その後、再実行してください。`
      );
    }
  } catch (err) {
    // verify.js が異常終了した場合もエラーとする
    errors.push(formatError(
      'verify.js による検証が失敗しました',
      err.stderr ? err.stderr.trim() : err.message,
      'verify.js のエラー出力を確認して原因を修正してください。'
    ));
    remedies.push(`verify.js のエラーを確認し、修正後に再実行してください。`);
  }

  return { errors, remedies };
}

// ============================================================
// メイン
// ============================================================

/**
 * 5軸チェックを実行し、結果を返す
 *
 * @param {string[]} [testArgs] — テスト用の引数配列
 */
function main(testArgs) {
  const args = testArgs || process.argv.slice(2);
  const { graphAfter, graphBefore, sourcePath } = parseArgs(args);

  // 最低限 graphAfter は必須
  if (!graphAfter && !sourcePath) {
    console.error('[ERROR] 引数が不足しています\n原因: --graph-after=<path> または --source=<path> が必要\n対応: 両方の引数を指定して再実行してください。');
    process.exit(1);
  }

  const allErrors = [];
  const allRemedies = [];
  const graphAfterData = graphAfter ? loadGraph(graphAfter) : null;
  const graphBeforeData = graphBefore ? loadGraph(graphBefore) : null;

  // 軸1: nodes構成
  const nodesResult = checkNodesIntegrity(graphAfterData, graphBeforeData);
  allErrors.push(...nodesResult.errors);
  allRemedies.push(...nodesResult.remedies);

  // 軸2: edges構成
  const edgesResult = checkEdgesIntegrity(graphAfterData, graphBeforeData);
  allErrors.push(...edgesResult.errors);
  allRemedies.push(...edgesResult.remedies);

  // 軸3-5: verify.js 経由（headingRefs解決性、孤立ノード、未カバー見出し）
  if (graphAfter && sourcePath) {
    const verifyResult = checkWithVerifyjs(graphAfter, sourcePath);
    allErrors.push(...verifyResult.errors);
    allRemedies.push(...verifyResult.remedies);
  }

  // 重複除去
  const uniqueRemedies = [...new Set(allRemedies)];

  if (allErrors.length === 0) {
    process.stdout.write(JSON.stringify({ ok: true }) + '\n');
  } else {
    process.stdout.write(JSON.stringify({
      ok: false,
      errors: allErrors,
      remedies: uniqueRemedies,
    }, null, 2) + '\n');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, parseArgs, checkNodesIntegrity, checkEdgesIntegrity, checkWithVerifyjs };
