#!/usr/bin/env node

/**
 * phasify-helpers.js — phasify コアアルゴリズムの純粋関数群
 *
 * Phase 2〜4 の実装を提供する。Phase 1（SCC縮約）は boundify-helpers.js の
 * tarjanSCC() を流用する。
 *
 * 全関数は外部I/Oを持たない純粋関数として設計される。
 *
 * @module phasify-helpers
 */

'use strict';

// ============================================================
// 重みテーブル（エッジ種別 → 逆順実装コスト）
// ============================================================

/** 重み ∞：絶対制約（逆順禁止） */
const WEIGHT_INFINITY = Object.freeze({
  depends_on: Infinity,
  implements: Infinity,
  constrains: Infinity,
});

/** 重み 2：強推奨（逆順でも構造的変更で対応可能） */
const WEIGHT_STRONG = Object.freeze({
  precedes: 2,
});

/** 重み 1：弱推奨（逆順でもモックで代替可能） */
const WEIGHT_WEAK = Object.freeze({
  triggers: 1,
});

/** 重み 0：制約なし */
const WEIGHT_NONE = Object.freeze({
  refines: 0,
  references: 0,
  extends: 0,
  conflicts_with: 0,
  supersedes: 0,
  validates: 0,
  part_of: 0,
});

/**
 * 全エッジ種別の重みマップ（統合テーブル）
 * キー: エッジ種別, 値: 重み（Infinity / 2 / 1 / 0）
 */
const WEIGHT_MAP = Object.freeze(
  Object.assign(
    {},
    WEIGHT_INFINITY,
    WEIGHT_STRONG,
    WEIGHT_WEAK,
    WEIGHT_NONE,
  )
);

/**
 * 重み ∞ のエッジ種別セット（高速判定用）
 */
const HARD_EDGE_TYPES = new Set(
  Object.keys(WEIGHT_INFINITY)
);

/**
 * 重み > 0 のエッジ種別セット（Soft制約判定用）
 */
const SOFT_EDGE_TYPES = new Set(
  Object.keys(WEIGHT_STRONG).concat(Object.keys(WEIGHT_WEAK))
);

/**
 * エッジ種別から重みを取得する。
 * 未知の種別は 0 として扱う。
 *
 * @param {string} edgeType — エッジ種別
 * @returns {number} 重み（0, 1, 2, Infinity）
 */
function getWeight(edgeType) {
  const weight = WEIGHT_MAP[edgeType];
  return weight !== undefined ? weight : 0;
}

/**
 * エッジがハード制約（重み ∞）か判定する。
 *
 * @param {string} edgeType — エッジ種別
 * @returns {boolean}
 */
function isHard(edgeType) {
  return HARD_EDGE_TYPES.has(edgeType);
}

// ============================================================
// Phase 2: Kahn トポロジカルソート
// ============================================================

/**
 * 重み付き有向グラフに対してトポロジカルソートを実行する。
 *
 * 重み ∞ のエッジのみを「絶対制約」として扱い、トポロジカルソートを実行する。
 * 循環（DAGでない）場合はエラー情報を返す。
 *
 * @param {string[]} nodeIds — 全ノードIDの配列
 * @param {Array<{from:string, to:string, type:string}>} edges — エッジ配列
 * @param {Function} weightFn — エッジ種別→重みの関数（デフォルト: getWeight）
 * @returns {{ success: boolean, order: string[], cycle?: string[], error?: string }}
 *   success: true なら order が有効。false なら cycle に循環ノードが格納される。
 */
function kahnTopologicalSort(nodeIds, edges, weightFn) {
  const wFn = weightFn || getWeight;
  const nodeSet = new Set(nodeIds);
  const inDegree = {};
  const adjacency = {};

  // 全ノードの初期化
  for (const nid of nodeIds) {
    inDegree[nid] = 0;
    adjacency[nid] = [];
  }

  // 重み ∞ のエッジのみでグラフを構築
  for (const edge of edges) {
    if (!nodeSet.has(edge.from) || !nodeSet.has(edge.to)) continue;
    if (wFn(edge.type) === Infinity) {
      // エッジ u→v (depends_on) は「uはvに依存する」。
      // 依存先vを先に実装するため制約方向は v→u とする。
      adjacency[edge.to].push(edge.from);
      inDegree[edge.from] = (inDegree[edge.from] || 0) + 1;
    }
  }

  // 入次数 0 のノードをキューに追加
  const queue = [];
  for (const nid of nodeIds) {
    if (inDegree[nid] === 0) queue.push(nid);
  }

  const order = [];
  while (queue.length > 0) {
    // 安定ソートのため入力順を維持（shift で先頭から）
    const nid = queue.shift();
    order.push(nid);

    for (const neighbor of (adjacency[nid] || [])) {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) {
        queue.push(neighbor);
      }
    }
  }

  // 未処理のノード（循環成分）を検出
  const visited = new Set(order);
  const unprocessed = nodeIds.filter(id => !visited.has(id));

  if (unprocessed.length > 0) {
    // 循環成分を抽出（簡易的なトレース）
    const inCycle = new Set(unprocessed);
    // 循環成分から到達可能なノードも含める
    let changed = true;
    while (changed) {
      changed = false;
      for (const edge of edges) {
        if (inCycle.has(edge.from) && !inCycle.has(edge.to) && wFn(edge.type) === Infinity) {
          inCycle.add(edge.to);
          changed = true;
        }
        if (!inCycle.has(edge.from) && inCycle.has(edge.to) && wFn(edge.type) === Infinity) {
          inCycle.add(edge.from);
          changed = true;
        }
      }
    }
    return {
      success: false,
      order: [],
      cycle: [...inCycle],
      error: '循環依存を検出しました: [' + [...inCycle].join(', ') + ']',
    };
  }

  return { success: true, order };
}

// ============================================================
// Phase 3: Soft制約違反コスト計算
// ============================================================

/**
 * Soft制約（重み 1 または 2）の違反コストを計算する。
 *
 * トポロジカルソート順序 order において、Softエッジ e = (u→v) が
 * order[u] > order[v] の場合に違反とみなし、w(type(e)) のコストを加算する。
 *
 * @param {string[]} order — トポロジカルソート順序
 * @param {Array<{from:string, to:string, type:string}>} edges — 全エッジ
 * @param {Function} weightFn — エッジ種別→重みの関数
 * @returns {{ totalCost: number, violations: Array<{from:string, to:string, type:string, cost:number}> }}
 */
function computeSoftViolations(order, edges, weightFn) {
  const wFn = weightFn || getWeight;
  const position = {};
  for (let i = 0; i < order.length; i++) {
    position[order[i]] = i;
  }

  let totalCost = 0;
  const violations = [];

  for (const edge of edges) {
    const weight = wFn(edge.type);
    if (weight <= 0 || weight === Infinity) continue; // Soft のみ対象
    if (!SOFT_EDGE_TYPES.has(edge.type)) continue;

    const posU = position[edge.from];
    const posV = position[edge.to];
    if (posU === undefined || posV === undefined) continue;

    // 違反: u が v より後ろにある
    if (posU > posV) {
      totalCost += weight;
      violations.push({
        from: edge.from,
        to: edge.type,
        type: edge.type,
        cost: weight,
      });
    }
  }

  return { totalCost, violations };
}

// ============================================================
// Phase 4: フェーズ合併と離散化
// ============================================================

/**
 * トポロジカルソート順序をフェーズに分割する。
 *
 * 各フェーズは最低 minSize ノードを含むことを保証する。
 * ただし、hardEdges（重み∞のエッジ）がある場合、from と to が
 * 同一フェーズに含まれないように分割する。
 * 総ノード数が minSize 未満の場合は全ノードが1フェーズとなる（警告は呼び出し元で処理）。
 *
 * @param {string[]} sortedNodes — トポロジカルソート済みのノードID配列
 * @param {number} minSize — 1フェーズあたりの最小ノード数（デフォルト: 10）
 * @param {Array<{from:string, to:string}>} [hardEdges] — 重み∞のエッジ配列（省略時は制約なし）
 * @returns {Array<{id: number, nodeIds: string[]}>} フェーズ配列
 */
function mergePhases(sortedNodes, minSize, hardEdges) {
  const size = minSize || 10;
  if (!sortedNodes || sortedNodes.length === 0) return [];

  // ハードエッジの to→from（到達元）マップを構築
  // 「キー（ノード）には、どのノードからのdepends_onが張られているか」
  const incomingHard = {};
  if (hardEdges) {
    for (const edge of hardEdges) {
      if (!incomingHard[edge.to]) incomingHard[edge.to] = new Set();
      incomingHard[edge.to].add(edge.from);
    }
  }

  const phases = [];
  let currentPhase = [];
  let phaseId = 0;

  for (let i = 0; i < sortedNodes.length; i++) {
    const nid = sortedNodes[i];

    // サイズ制限に達したら、その時点でフェーズを閉じて良いか判定
    if (currentPhase.length >= size) {
      // 現在地から最大 size 個先までスキャンし、いずれかのノードが
      // 現在のフェーズに属するノードからの depends_on の対象か確認
      let dependentInLookahead = false;
      if (hardEdges) {
        const lookaheadLimit = Math.min(i + size, sortedNodes.length);
        for (let j = i; j < lookaheadLimit; j++) {
          const lookaheadNode = sortedNodes[j];
          const fromNodes = incomingHard[lookaheadNode];
          if (fromNodes) {
            for (const fromNode of fromNodes) {
              if (currentPhase.includes(fromNode)) {
                dependentInLookahead = true;
                break;
              }
            }
          }
          if (dependentInLookahead) break;
        }
      }

      if (!dependentInLookahead) {
        // 安全に閉じられる
        phases.push({ id: phaseId, name: 'P' + phaseId, nodeIds: currentPhase });
        currentPhase = [];
        phaseId++;
      }
    }

    currentPhase.push(nid);
  }

  // 残りのノードを直前のフェーズに合併（存在する場合）
  if (currentPhase.length > 0) {
    if (phases.length > 0) {
      const lastPhase = phases[phases.length - 1];
      lastPhase.nodeIds = lastPhase.nodeIds.concat(currentPhase);
    } else {
      phases.push({ id: 0, name: 'P0', nodeIds: currentPhase });
    }
  }

  return phases;
}

// ============================================================
// Phase 5 補助: SCC縮約結果の展開
// ============================================================

/**
 * SCC縮約結果から、同じSCCに属するノードを同一フェーズに割り当てるための
 * 情報を構築する。
 *
 * @param {Array<{cycle: string[]}>} sccResult — tarjanSCC の戻り値
 * @returns {{ sccMap: object, sccIds: Set<string> }}
 *   sccMap: ノードID → SCC代表ノードID（SCC内の最初のノード）
 *   sccIds: マルチノードSCCに含まれる全ノードIDのセット
 */
function buildSccConstraint(sccResult) {
  const sccMap = {};
  const sccIds = new Set();

  if (!sccResult) return { sccMap, sccIds };

  for (const entry of sccResult) {
    if (entry.cycle && entry.cycle.length > 1) {
      const representative = entry.cycle[0];
      for (const nid of entry.cycle) {
        sccMap[nid] = representative;
        sccIds.add(nid);
      }
    }
  }

  return { sccMap, sccIds };
}

/**
 * SCC制約を考慮したノード配列を構築する。
 * 同一SCCのノードは隣接するよう reorder される。
 *
 * @param {string[]} sortedNodes — トポロジカルソート順序
 * @param {object} sccMap — ノードID→SCC代表ノードIDのマップ
 * @returns {string[]} SCC制約適用後のノード順序
 */
function applySccToOrder(sortedNodes, sccMap) {
  const groups = {};
  const groupOrder = [];

  for (const nid of sortedNodes) {
    const rep = sccMap[nid] || nid;
    if (!groups[rep]) {
      groups[rep] = [];
      groupOrder.push(rep);
    }
    groups[rep].push(nid);
  }

  const result = [];
  for (const rep of groupOrder) {
    for (const nid of (groups[rep] || [])) {
      result.push(nid);
    }
  }
  return result;
}

// ============================================================
// ハード制約の事後調整
// ============================================================

/**
 * mergePhases の出力に対して、depends_on の両端点が同一フェーズに
 * 含まれないよう事後調整する。
 *
 * トポロジカルソートが「正しい順序」を保証しているため、
 * フェーズを分割しても新たな順序違反は発生しない。
 * これは数学的に安全な操作である。
 *
 * @param {Array<{id:number, name:string, nodeIds:string[]}>} phases — mergePhases の出力
 * @param {Array<{from:string, to:string}>} hardEdges — 重み∞のエッジ配列
 * @returns {Array<{id:number, name:string, nodeIds:string[]}>} 調整後のフェーズ
 */
function enforceHardConstraints(phases, hardEdges) {
  if (!hardEdges || hardEdges.length === 0) return phases;
  if (!phases || phases.length === 0) return phases;

  let maxPhaseId = 0;
  for (let pi = 0; pi < phases.length; pi++) {
    if (phases[pi].id > maxPhaseId) maxPhaseId = phases[pi].id;
  }

  let changed = true;
  while (changed) {
    changed = false;

    // 現在のノード→フェーズID マップを構築
    const nodePhase = {};
    for (let pi = 0; pi < phases.length; pi++) {
      const phase = phases[pi];
      for (let ni = 0; ni < phase.nodeIds.length; ni++) {
        nodePhase[phase.nodeIds[ni]] = phase.id;
      }
    }

    // 違反を検出
    for (let ei = 0; ei < hardEdges.length; ei++) {
      const edge = hardEdges[ei];
      const phaseU = nodePhase[edge.from];
      const phaseV = nodePhase[edge.to];
      if (phaseU === undefined || phaseV === undefined) continue;

      // depends_on(u→v): u(依存元)はv(依存先)に依存 → vを先に実装
      // 違反: 依存先vのフェーズ位置 >= 依存元uのフェーズ位置
      // フェーズIDではなく配列インデックスで比較（ID＝≠順序のため）
      const idxU = phases.findIndex(function(p) { return p.id === phaseU; });
      const idxV = phases.findIndex(function(p) { return p.id === phaseV; });
      if (idxU === -1 || idxV === -1) continue;
      if (idxV >= idxU) {
        // 違反を解消するためフェーズを分割
        const vPhaseIndex = phases.findIndex(function(p) { return p.id === phaseV; });
        if (vPhaseIndex === -1) continue;
        const vPhase = phases[vPhaseIndex];

        const splitIdx = vPhase.nodeIds.indexOf(edge.to);
        if (splitIdx > 0) {
          // 通常ケース: edge.to の位置で分割 → to以降を新フェーズに
          const movedNodes = vPhase.nodeIds.splice(splitIdx);
          maxPhaseId++;
          const newPhase = { id: maxPhaseId, name: 'P' + maxPhaseId, nodeIds: movedNodes };
          phases.splice(vPhaseIndex + 1, 0, newPhase);
          changed = true;
          break;
        }

        // splitIdx === 0: edge.toがフェーズ先頭にある。
        // edge.from が同一フェーズ内なら、fromの位置で分割する。
        if (phaseU === phaseV) {
          const fromIdx = vPhase.nodeIds.indexOf(edge.from);
          if (fromIdx > 0) {
            const movedNodes = vPhase.nodeIds.splice(fromIdx);
            maxPhaseId++;
            const newPhase = { id: maxPhaseId, name: 'P' + maxPhaseId, nodeIds: movedNodes };
            phases.splice(vPhaseIndex + 1, 0, newPhase);
            changed = true;
            break;
          }
        }
        // 分割不能 — この違反は保留
      }
    }
  }

  // 空になったフェーズを削除
  for (let pi = phases.length - 1; pi >= 0; pi--) {
    if (phases[pi].nodeIds.length === 0) {
      phases.splice(pi, 1);
    }
  }

  return phases;
}

// ============================================================
// 事後フェーズ統合 — 下限未満の小フェーズを前後に統合
// ============================================================

/**
 * enforceHardConstraints で分割された小さなフェーズ（下限10未満）を
 * 前後のフェーズに安全に統合する。
 *
 * depends_on 制約を尊重し、統合によって新たな違反が発生しないことを保証する。
 *
 * @param {Array<{id:number, name:string, nodeIds:string[]}>} phases — フェーズ配列
 * @param {Array<{from:string, to:string}>} hardEdges — 重み∞のエッジ配列
 * @param {number} minSize — 下限サイズ
 * @returns {Array<{id:number, name:string, nodeIds:string[]}>} 統合後のフェーズ
 */
function consolidatePhases(phases, hardEdges, minSize) {
  if (!phases || phases.length <= 1) return phases;
  const size = minSize || 10;

  // depends_on の node→{froms,tos} マップ
  const depsFrom = {}; // node → このノードに依存するノード群
  const depsTo = {};   // node → このノードが依存するノード群
  for (const e of (hardEdges || [])) {
    if (!depsFrom[e.to]) depsFrom[e.to] = new Set();
    depsFrom[e.to].add(e.from);
    if (!depsTo[e.from]) depsTo[e.from] = new Set();
    depsTo[e.from].add(e.to);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < phases.length; i++) {
      if (phases[i].nodeIds.length >= size) continue;

      // 前のフェーズとの統合を試みる
      if (i > 0) {
        const prevPhase = phases[i - 1];
        const currPhase = phases[i];
        // currPhase のノードが prevPhase に depends_on していないか確認
        let canMergePrev = true;
        for (const nid of currPhase.nodeIds) {
          const targets = depsTo[nid];
          if (targets) {
            for (const target of targets) {
              if (prevPhase.nodeIds.includes(target)) {
                canMergePrev = false;
                break;
              }
            }
          }
          if (!canMergePrev) break;
        }
        if (canMergePrev) {
          prevPhase.nodeIds = prevPhase.nodeIds.concat(currPhase.nodeIds);
          phases.splice(i, 1);
          changed = true;
          break;
        }
      }

      // 後のフェーズとの統合を試みる
      if (i < phases.length - 1) {
        const nextPhase = phases[i + 1];
        const currPhase = phases[i];
        // nextPhase のノードが currPhase に depends_on していないか確認
        let canMergeNext = true;
        for (const nid of nextPhase.nodeIds) {
          const targets = depsTo[nid];
          if (targets) {
            for (const target of targets) {
              if (currPhase.nodeIds.includes(target)) {
                canMergeNext = false;
                break;
              }
            }
          }
          if (!canMergeNext) break;
        }
        if (canMergeNext) {
          currPhase.nodeIds = currPhase.nodeIds.concat(nextPhase.nodeIds);
          phases.splice(i + 1, 1);
          changed = true;
          break;
        }
      }
    }
  }

  return phases;
}

// ============================================================
// フェーズIDの再割り当て
// ============================================================

/**
 * フェーズIDを配列順に0から振り直す。
 *
 * enforceHardConstraints により分割されたフェーズはIDが飛び飛びになる。
 * 配列順＝正しい実装順序であるため、IDを0からの連番に再割り当てする。
 * この関数はフェーズの配列順序を一切変更しない。
 *
 * @param {Array<{id:number, name:string, nodeIds:string[]}>} phases — フェーズ配列
 * @returns {Array<{id:number, name:string, nodeIds:string[]}>} ID振り直し後のフェーズ配列
 */
function reassignPhaseIds(phases) {
  if (!phases) return phases;
  for (let i = 0; i < phases.length; i++) {
    phases[i].id = i;
    phases[i].name = 'P' + i;
    // nodeIds を昇順ソート（フェーズ内の実装順序に意味はなく、
    // RFCセクション順に並べた方が可読性が高いため）
    if (phases[i].nodeIds) {
      phases[i].nodeIds.sort();
    }
  }
  return phases;
}

// ============================================================
// ディレクトリ制約適用
// ============================================================

/**
 * ディレクトリ間依存方向をトポロジカル順序に反映する。
 *
 * 依存方向 (fromDir→toDir) に対して、fromDir に属する全ノードが
 * toDir に属する全ノードより前に配置されるよう調整する。
 * 違反がある場合、toDir のノード群を fromDir のノード群より後ろに移動する。
 *
 * @param {string[]} order — 現在の順序
 * @param {Array<{from:string, to:string}>} depDirs — 依存方向配列
 * @param {object} nodeToDirMap — ノードID→ディレクトリパス のマップ
 * @returns {string[]} 調整後の順序（違反がない場合は元の順序をそのまま返す）
 */
function applyDirectoryConstraints(order, depDirs, nodeToDirMap) {
  if (!depDirs || depDirs.length === 0) return order;

  for (const dep of depDirs) {
    const fromDir = dep.from;
    const toDir = dep.to;
    const fromNodes = order.filter(function(nid) {
      return nodeToDirMap[nid] === fromDir;
    });
    const toNodes = order.filter(function(nid) {
      return nodeToDirMap[nid] === toDir;
    });
    if (fromNodes.length === 0 || toNodes.length === 0) continue;

    const lastFromPos = Math.max.apply(null, fromNodes.map(function(nid) {
      return order.indexOf(nid);
    }));
    const firstToPos = Math.min.apply(null, toNodes.map(function(nid) {
      return order.indexOf(nid);
    }));
    if (lastFromPos < firstToPos) continue;

    // 違反: toNodes を fromNodes の後ろに移動
    const ordered = [];
    const moved = new Set(toNodes);
    for (let i = 0; i < order.length; i++) {
      const nid = order[i];
      if (!moved.has(nid)) ordered.push(nid);
    }
    for (const nid of order) {
      if (moved.has(nid)) ordered.push(nid);
    }
    return ordered;
  }

  return order;
}

// ============================================================
// Tickets.json 書き込み形式への変換
// ============================================================

/**
 * フェーズ配列を Tickets.json の phasse 形式に変換する。
 * 既存の Tickets.json の phases 配列をマージする必要がある場合、
 * 別途呼び出し元で処理する。
 *
 * @param {Array<{id: number, name: string, nodeIds: string[]}>} phases — mergePhases の出力
 * @returns {Array} Tickets.json 互換の phase オブジェクト配列
 */
function phasesToTicketsFormat(phases) {
  return phases.map(function(phase) {
    return {
      id: phase.id,
      name: phase.name,
      tickets: [],
      nodeIds: phase.nodeIds,
    };
  });
}

module.exports = {
  // 重みテーブル
  WEIGHT_MAP,
  WEIGHT_INFINITY,
  WEIGHT_STRONG,
  WEIGHT_WEAK,
  WEIGHT_NONE,
  HARD_EDGE_TYPES,
  SOFT_EDGE_TYPES,
  getWeight,
  isHard,
  // Phase 2
  kahnTopologicalSort,
  // Phase 3
  computeSoftViolations,
  // Phase 4
  mergePhases,
  // ハード制約事後調整
  enforceHardConstraints,
  consolidatePhases,
  reassignPhaseIds,
  // ディレクトリ制約
  applyDirectoryConstraints,
  // Phase 5 補助
  buildSccConstraint,
  applySccToOrder,
  phasesToTicketsFormat,
};
