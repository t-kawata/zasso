#!/usr/bin/env node
/**
 * verify-graph-integrity.js — 5-axis graph integrity check
 *
 * --graph-after=<path> --graph-before=<path> --source=<path>
 *
 * Verifies that the graph data has not been corrupted after modification
 * at the boundary between graphify and boundify. Checks the following 5 axes:
 *
 * 1. nodes integrity: whether the set of node IDs has changed
 * 2. edges integrity: whether the edges array has changed
 * 3. headingRefs resolvability: whether all headingRefs are resolvable
 * 4. orphan nodes: whether any node has zero edges
 * 5. uncovered headings: whether all source headings are covered by node headingRefs
 *
 * Output contract:
 *   On success → {ok: true}
 *   On error → {ok: false, errors: [...], remedies: [...]}
 *             remedies is a natural-language instruction for the next AI action
 */
'use strict';

const fs = require('fs');
const path = require('path');

// Use verify.js validation functions directly
let verify;
try {
  verify = require('./verify.js');
} catch (_) {
  // fallback: in case verify.js does not export modules
}

// ============================================================
// Error message template
// ============================================================

/** 3-element template: [problem] / [cause] / [remedy] */
function formatError(problem, cause, remedy) {
  return `[ERROR] ${problem}\n原因: ${cause}\n対応: ${remedy}`;
}

// ============================================================
// Argument parsing
// ============================================================

/**
 * Parse CLI arguments
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
// Graph loading
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
// Check 1: nodes integrity
// ============================================================

/**
 * Verify that the set of node IDs matches before and after modification
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
// Check 2: edges integrity
// ============================================================

/**
 * Verify that edges match before and after modification
 * Edges are compared as from+to+type tuples.
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
// Checks 3-5: use verify.js functions
// ============================================================

/**
 * Run verify.js's 3-axis checks (headingRefs resolvability, orphan nodes, uncovered headings)
 * as a child process and return the results.
 *
 * verify.js functions perform file I/O internally, so run them as a child process for safety.
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
      // Propagate verify.js errors as-is
      if (result.errors) {
        for (const err of result.errors) {
          errors.push(err);
        }
      }
      // General remedy
      remedies.push(
        `verify.js のエラーを解消してください。未カバー見出しがあればノードの headingRefs を拡張し、孤立ノードがあればエッジを追加し、解決不能な headingRefs があれば texts トークンを修正してください。その後、再実行してください。`
      );
    }
  } catch (err) {
    // Treat verify.js abnormal termination as an error too
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
// Main
// ============================================================

/**
 * Run all 5 checks and return results
 *
 * @param {string[]} [testArgs] — argument array for testing
 */
function main(testArgs) {
  const args = testArgs || process.argv.slice(2);
  const { graphAfter, graphBefore, sourcePath } = parseArgs(args);

  // At minimum, graphAfter is required
  if (!graphAfter && !sourcePath) {
    console.error('[ERROR] 引数が不足しています\n原因: --graph-after=<path> または --source=<path> が必要\n対応: 両方の引数を指定して再実行してください。');
    process.exit(1);
  }

  const allErrors = [];
  const allRemedies = [];
  const graphAfterData = graphAfter ? loadGraph(graphAfter) : null;
  const graphBeforeData = graphBefore ? loadGraph(graphBefore) : null;

  // Axis 1: nodes integrity
  const nodesResult = checkNodesIntegrity(graphAfterData, graphBeforeData);
  allErrors.push(...nodesResult.errors);
  allRemedies.push(...nodesResult.remedies);

  // Axis 2: edges integrity
  const edgesResult = checkEdgesIntegrity(graphAfterData, graphBeforeData);
  allErrors.push(...edgesResult.errors);
  allRemedies.push(...edgesResult.remedies);

  // Axes 3-5: via verify.js (headingRefs resolvability, orphan nodes, uncovered headings)
  if (graphAfter && sourcePath) {
    const verifyResult = checkWithVerifyjs(graphAfter, sourcePath);
    allErrors.push(...verifyResult.errors);
    allRemedies.push(...verifyResult.remedies);
  }

  // Deduplication
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
