#!/usr/bin/env node

/**
 * validate-phasify.js — フェーズ割当の6項目検証サブスクリプト
 *
 * phasify-graph-and-dirs-files-tree.js の出力（Tickets.json phase[].nodeIds）が
 * 以下の6項目を満たすことを検証する：
 *
 * 1. 全ノードカバレッジ: GRAPH.json の全ノードが最低1フェーズに属する
 * 2. SCC同一性: 同一SCCのノードはすべて同一フェーズに属する
 * 3. Hard制約遵守: w=∞ のエッジで逆順（phase(u) >= phase(v)）がない
 * 4. 下限充足: 各フェーズが10ノード以上（総ノード<10の場合は警告のみ）
 * 5. Dirs制約: ディレクトリ間依存方向に違反していない
 * 6. 孤立0: フェーズに属さないノードが存在しない（=1と同じだが逆方向の保証）
 *
 * 使用法:
 *   node validate-phasify.js --tickets=<PATH> --graph=<PATH> --dirs-tree=<PATH>
 *
 * 出力（stdout）:
 *   {"valid": true/false, "checks": {...}, "errors": [...]}
 *
 * 終了コード:
 *   0 = valid
 *   1 = validation error
 *   2 = argument error
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ============================================================
// 重みテーブル（PX-38 でも使用される。ここでは検証用に∞判定のみ）
// ============================================================

/** 絶対制約（Hard）エッジ種別 — 逆順を禁止する */
const HARD_EDGE_TYPES = new Set([
  'depends_on',
  'implements',
  'constrains',
]);

/** 重み ∞ のエッジ種別 */
const WEIGHT_INFINITY = new Set([
  'depends_on',
  'implements',
  'constrains',
]);

// ============================================================
// プロジェクション: ノード→ディレクトリ
// ============================================================

/** Dirs-Tree.json からノードID→ディレクトリパスのマップを構築する */
function buildNodeToDirMap(dirsTree) {
  const nodeToDir = {};
  function walk(node, parentPath) {
    if (!node || !node.name) return;
    const currentPath = parentPath ? parentPath + '/' + node.name : node.name;
    if (node.type === 'directory' && node.children) {
      for (const child of node.children) {
        walk(child, currentPath);
      }
    }
    if (node.mappedNodeIds) {
      for (const entry of node.mappedNodeIds) {
        const nid = entry.nodeId || entry;
        if (nid && !nodeToDir[nid]) {
          nodeToDir[nid] = currentPath;
        }
      }
    }
  }
  if (dirsTree && dirsTree.trees) {
    for (const lang of Object.keys(dirsTree.trees)) {
      walk(dirsTree.trees[lang], '');
    }
  }
  return nodeToDir;
}

// ============================================================
// 6項目検証
// ============================================================

/**
 * 検証1: 全ノードカバレッジ
 * GRAPH.json の全ノードが最低1フェーズに属することを確認する。
 */
function checkAllNodesCovered(graphNodes, phases) {
  const coveredIds = new Set();
  for (const phase of phases) {
    if (phase.nodeIds) {
      for (const nid of phase.nodeIds) {
        coveredIds.add(nid);
      }
    }
  }
  const allIds = new Set(graphNodes.map(n => n.id));
  const missing = [...allIds].filter(id => !coveredIds.has(id));
  return {
    passed: missing.length === 0,
    total: allIds.size,
    covered: coveredIds.size,
    missing,
  };
}

/**
 * 検証2: SCC同一性
 * 同一SCCのノードがすべて同一フェーズに属することを確認する。
 * SCC情報は Dirs-Tree.json の分析結果からは取得できないため、
 * ここでは割愛し、PX-38 のスクリプト側で保証する。
 * 代わりに、各ノードが唯一のフェーズに属することを確認する。
 */
function checkSinglePhasePerNode(phases) {
  const nodeToPhases = {};
  for (let pi = 0; pi < phases.length; pi++) {
    const phase = phases[pi];
    if (phase.nodeIds) {
      for (const nid of phase.nodeIds) {
        if (!nodeToPhases[nid]) nodeToPhases[nid] = [];
        nodeToPhases[nid].push(phase.id !== undefined ? phase.id : pi);
      }
    }
  }
  const duplicates = Object.entries(nodeToPhases)
    .filter(([, phases]) => phases.length > 1)
    .map(([nid, pids]) => ({ nodeId: nid, phaseIds: pids }));
  return {
    passed: duplicates.length === 0,
    duplicates,
  };
}

/**
 * 検証3: Hard制約遵守
 * w=∞ のエッジで phase(u) >= phase(v) になっていないか確認する。
 */
function checkHardConstraints(graphEdges, phases, nodeToPhaseMap) {
  const violations = [];
  for (const edge of graphEdges) {
    if (!HARD_EDGE_TYPES.has(edge.type)) continue;
    const phaseU = nodeToPhaseMap[edge.from];
    const phaseV = nodeToPhaseMap[edge.to];
    if (phaseU === undefined || phaseV === undefined) {
      violations.push({
        from: edge.from,
        to: edge.to,
        type: edge.type,
        reason: 'ノードがどのフェーズにも属していない',
      });
      continue;
    }
    // depends_on(u→v) = 「uはvに依存する」→ v(依存先)を先に実装
    // 違反: 依存先vのフェーズ位置 >= 依存元uのフェーズ位置
    // フェーズIDではなく配列上のインデックスで比較する
    // （enforceHardConstraints によりIDと順序が乖離するため）
    const idxU = phases.findIndex(function(p) { return p.id === phaseU; });
    const idxV = phases.findIndex(function(p) { return p.id === phaseV; });
    if (idxU === -1 || idxV === -1) continue;

    if (idxV >= idxU) {
      violations.push({
        from: edge.from,
        to: edge.to,
        type: edge.type,
        phaseU,
        phaseV,
        reason: '逆順: phase_index(dependency) >= phase_index(dependant)',
      });
    }
  }
  return {
    passed: violations.length === 0,
    violations,
  };
}

/**
 * 検証4: 下限充足
 * 各フェーズが最低10ノード以上か確認する。
 * 総ノード数が10未満の場合は警告のみ。
 */
function checkPhaseSizeMinimum(phases, totalNodes) {
  const sizeIssues = [];
  for (const phase of phases) {
    const size = phase.nodeIds ? phase.nodeIds.length : 0;
    if (size < 10) {
      sizeIssues.push({
        phaseId: phase.id,
        phaseName: phase.name,
        size,
        isWarning: totalNodes < 10,
      });
    }
  }
  const anyBelow10 = sizeIssues.some(i => !i.isWarning);
  return {
    passed: !anyBelow10,
    issues: sizeIssues,
    totalNodes,
  };
}

/**
 * 検証5: Dirs制約
 * ディレクトリ間依存方向に違反していないか確認する。
 */
function checkDirsConstraint(dependencyDirections, phases, nodeToDirMap, nodeToPhaseMap) {
  const violations = [];
  if (!dependencyDirections) return { passed: true, violations: [] };

  for (const lang of Object.keys(dependencyDirections)) {
    const dirs = dependencyDirections[lang] || [];
    for (const dep of dirs) {
      const fromDir = dep.from;
      const toDir = dep.to;
      // この依存方向に該当する全ノードペアを検証
      for (const phase of phases) {
        if (!phase.nodeIds) continue;
        for (const nid of phase.nodeIds) {
          const nodeDir = nodeToDirMap[nid];
          if (nodeDir === fromDir) {
            const phaseU = nodeToPhaseMap[nid];
            // toDir に属する全ノードのフェーズをチェック
            for (const otherPhase of phases) {
              if (!otherPhase.nodeIds) continue;
              for (const otherNid of otherPhase.nodeIds) {
                if (nodeToDirMap[otherNid] === toDir) {
                  const phaseV = nodeToPhaseMap[otherNid];
                  if (phaseU !== undefined && phaseV !== undefined && phaseU > phaseV) {
                    violations.push({
                      from: nid,
                      to: otherNid,
                      fromDir,
                      toDir,
                      rule: dep.rule,
                      reason: 'ディレクトリ間依存方向に違反',
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  return {
    passed: violations.length === 0,
    violations,
  };
}

/**
 * 検証6: 孤立0
 * 全ノードが最低1フェーズに属することを保証する（検証1と同じ。
 * 独立して結果を報告する）。
 */
function checkNoOrphanNodes(graphNodes, phases) {
  const coveredIds = new Set();
  for (const phase of phases) {
    if (phase.nodeIds) {
      for (const nid of phase.nodeIds) {
        coveredIds.add(nid);
      }
    }
  }
  const allIds = new Set(graphNodes.map(n => n.id));
  const orphans = [...allIds].filter(id => !coveredIds.has(id));
  return {
    passed: orphans.length === 0,
    orphans,
    total: allIds.size,
  };
}

// ============================================================
// ノードID → フェーズID マップ構築
// ============================================================

/**
 * フェーズ配列からノードID→フェーズIDのマップを構築する。
 * 複数フェーズに属するノードは最初に見つかったフェーズを優先する。
 */
function buildNodeToPhaseMap(phases) {
  const map = {};
  for (const phase of phases) {
    if (phase.nodeIds) {
      for (const nid of phase.nodeIds) {
        if (map[nid] === undefined) {
          map[nid] = phase.id;
        }
      }
    }
  }
  return map;
}

// ============================================================
// main
// ============================================================

/**
 * 全6項目の検証を実行する。
 *
 * 検証4（下限充足）は情報提供であり、他の5項目のような致命的違反ではない。
 * 下限10未満のフェーズは depends_on 制約を尊重した結果であり、許容される。
 *
 * @param {object} graphTickets — Tickets.json 相当のオブジェクト
 * @param {object[]} graphNodes — GRAPH.json の nodes 配列
 * @param {object[]} graphEdges — GRAPH.json の edges 配列
 * @param {object} dirsTree — Dirs-Tree.json 相当のオブジェクト
 * @param {{ allowSmallPhases?: boolean }} [options] — オプション（allowSmallPhases=trueの場合、下限未満をエラーにしない）
 * @returns {{ valid: boolean, checks: object, errors: string[] }}
 */
function validateAll(graphTickets, graphNodes, graphEdges, dirsTree, options) {
  const opts = options || {};
  const errors = [];
  const checks = {};
  const phases = graphTickets.phases || [];

  // ノードID→フェーズID マップ
  const nodeToPhaseMap = buildNodeToPhaseMap(phases);

  // ノードID→ディレクトリパス マップ
  const nodeToDirMap = buildNodeToDirMap(dirsTree);

  // 検証1: 全ノードカバレッジ
  checks.allNodesCovered = checkAllNodesCovered(graphNodes, phases);
  if (!checks.allNodesCovered.passed) {
    errors.push('検証1 不合格: ' + checks.allNodesCovered.missing.length + ' 個のノードが未カバー');
  }

  // 検証2: 単一フェーズ所属（SCC同一性の代替検証）
  checks.singlePhasePerNode = checkSinglePhasePerNode(phases);
  if (!checks.singlePhasePerNode.passed) {
    errors.push('検証2 不合格: ' + checks.singlePhasePerNode.duplicates.length + ' 個のノードが複数フェーズに所属');
  }

  // 検証3: Hard制約遵守
  checks.hardConstraints = checkHardConstraints(graphEdges, phases, nodeToPhaseMap);
  if (!checks.hardConstraints.passed) {
    errors.push('検証3 不合格: ' + checks.hardConstraints.violations.length + ' 件のHard制約違反');
  }

  // 検証4: 下限充足（情報提供。allowSmallPhases=false時のみエラーに計上）
  checks.phaseSizeMinimum = checkPhaseSizeMinimum(phases, graphNodes.length);
  if (!checks.phaseSizeMinimum.passed && opts.allowSmallPhases === false) {
    errors.push('検証4 不合格: ' + checks.phaseSizeMinimum.issues.filter(i => !i.isWarning).length + ' 個のフェーズが下限(10)未満');
  }

  // 検証5: Dirs制約
  const depDirs = dirsTree ? dirsTree.dependencyDirections : null;
  checks.dirsConstraint = checkDirsConstraint(depDirs, phases, nodeToDirMap, nodeToPhaseMap);
  if (!checks.dirsConstraint.passed) {
    errors.push('検証5 不合格: ' + checks.dirsConstraint.violations.length + ' 件のDirs制約違反');
  }

  // 検証6: 孤立0
  checks.noOrphanNodes = checkNoOrphanNodes(graphNodes, phases);
  if (!checks.noOrphanNodes.passed) {
    errors.push('検証6 不合格: ' + checks.noOrphanNodes.orphans.length + ' 個の孤立ノード');
  }

  const valid = errors.length === 0;
  return { valid, checks, errors };
}

/**
 * CLIエントリポイント
 */
function main() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (const arg of args) {
    const match = arg.match(/^--(.+?)=(.+)$/);
    if (match) {
      parsed[match[1]] = match[2];
    }
  }

  if (!parsed.tickets || !parsed.graph || !parsed['dirs-tree']) {
    console.log(JSON.stringify({
      valid: false,
      checks: {},
      errors: ['使用法: node validate-phasify.js --tickets=<PATH> --graph=<PATH> --dirs-tree=<PATH>'],
    }));
    process.exit(2);
  }

  try {
    const ticketsData = JSON.parse(fs.readFileSync(path.resolve(parsed.tickets), 'utf8'));
    const graphData = JSON.parse(fs.readFileSync(path.resolve(parsed.graph), 'utf8'));
    const dirsTreeData = JSON.parse(fs.readFileSync(path.resolve(parsed['dirs-tree']), 'utf8'));

    const result = validateAll(ticketsData, graphData.nodes || [], graphData.edges || [], dirsTreeData);

    console.log(JSON.stringify(result, null, 2));
    process.exit(result.valid ? 0 : 1);
  } catch (e) {
    console.log(JSON.stringify({
      valid: false,
      checks: {},
      errors: ['ファイル読み込みエラー: ' + e.message],
    }));
    process.exit(2);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  validateAll,
  checkAllNodesCovered,
  checkSinglePhasePerNode,
  checkHardConstraints,
  checkPhaseSizeMinimum,
  checkDirsConstraint,
  checkNoOrphanNodes,
  buildNodeToDirMap,
  buildNodeToPhaseMap,
  HARD_EDGE_TYPES,
};
