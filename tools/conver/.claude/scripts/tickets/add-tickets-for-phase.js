#!/usr/bin/env node

/**
 * add-tickets-for-phase.js — フェーズ単位のチケット追加＋nodeIds過不足検証
 *
 * split-to-tickets パイプラインの Step 5-2 で使用する。
 * bulkAddTickets() を呼び出してチケットを追加した後、当該フェーズの全 nodeIds が
 * 追加された tickets[].nodeIds の和集合と一致することを検証する。
 *
 * 第2引数で受け取った Dirs-Tree.json から各チケットの nodeIds 経由で
 * ファイルパスを機械的に解決し、default_files を自動設定する。
 * これにより AI がファイルパスを手書きする必要がなくなる。
 *
 * 検証が通らなければ書き込みは行われず（ロールバック）、exit 1 で終了する。
 *
 * Usage:
 *   echo '<tickets-array-json>' | node add-tickets-for-phase.js \
 *     <Tickets.json のパス> \
 *     <Dirs-Tree.json のパス> \
 *     <P{id}>
 */

const fs = require("fs");
const path = require("path");
const { bulkAddTickets } = require("./bulk-add-tickets.js");
const { buildNodeToDirMap } = require("../rfc-graph/validate-phasify.js");

// ============================================================
// 定数定義
// ============================================================

/** 正常終了コード */
const EXIT_SUCCESS = 0;

/** 異常終了コード */
const EXIT_FAILURE = 1;

// ============================================================
// default_files 自動解決
// ============================================================

/**
 * 各チケットの nodeIds から Dirs-Tree 解決済みマップを使って default_files を自動設定する。
 *
 * 重複するファイルパス（異なる nodeId が同じファイルを指す）は排除され、ソートされる。
 * nodeIds が空のチケットや nodeToDirMap に該当がない場合は default_files を設定しない。
 *
 * @param {Object[]} tickets — チケットデータの配列（各要素に nodeIds が必須）
 * @param {Object} nodeToDirMap — buildNodeToDirMap() の戻り値（{ nodeId: filePath, ... }）
 */
function resolveDefaultFiles(tickets, nodeToDirMap) {
  for (const ticket of tickets) {
    const paths = new Set();
    if (Array.isArray(ticket.nodeIds)) {
      for (const nodeId of ticket.nodeIds) {
        const resolvedPath = nodeToDirMap[nodeId];
        if (resolvedPath) {
          paths.add(resolvedPath);
        }
      }
    }
    if (paths.size > 0) {
      ticket.default_files = Array.from(paths).sort();
    }
  }
}

// ============================================================
// referenceSection 自動解決（GRAPH.json の § マーカーから機械生成）
// ============================================================

/** § セクションマーカーの正規表現（例: §1, §1a, §2.1, §27a） */
const SECTION_PATTERN = /§[0-9]+(?:\.[0-9]+)?[a-z]?/;

/**
 * チケットの nodeIds から GRAPH.json のノード title の § マーカーを抽出し、
 * referenceSection を機械生成する。
 *
 * 出力例: "RFC-ROOT.md (§1, §1a, §2, §4.1)"
 * § マーカーがない場合は空文字列を返す。
 *
 * @param {string[]} nodeIds — チケットに属するノードID配列
 * @param {Object[]} graphNodes — GRAPH.json の nodes 配列（各要素に id と title）
 * @param {string} sourceFile — GRAPH.json の sourceFile（RFCファイルパス、拡張子除去）
 * @returns {string} 生成された referenceSection
 */
function resolveReferenceSection(nodeIds, graphNodes, sourceFile) {
  const sections = new Set();
  for (const nodeId of (nodeIds || [])) {
    const node = graphNodes.find(function(n) { return n.id === nodeId; });
    if (!node) continue;
    const match = node.title.match(SECTION_PATTERN);
    if (match) sections.add(match[0]);
  }
  if (sections.size === 0) return '';
  const sorted = Array.from(sections).sort(function(a, b) {
    // 数値部で比較: §1a → 1, §2.1 → 2.1, §10 → 10
    const anum = parseFloat(a.replace(/[^0-9.]/g, '')) || 0;
    const bnum = parseFloat(b.replace(/[^0-9.]/g, '')) || 0;
    if (anum !== bnum) return anum - bnum;
    // 同一数値の接尾辞比較: §1 < §1a
    const asuf = a.match(/[a-z]$/) ? a.slice(-1) : '';
    const bsuf = b.match(/[a-z]$/) ? b.slice(-1) : '';
    return asuf.localeCompare(bsuf);
  });
  const basename = sourceFile.replace(/\.md$/, '');
  return basename + ' (' + sorted.join(', ') + ')';
}

// ============================================================
// nodeIds過不足検証
// ============================================================

/**
 * フェーズの全 nodeIds が tickets[].nodeIds の和集合と一致するか検証する。
 *
 * @param {Object} phase — フェーズオブジェクト（nodeIds と tickets を持つ）
 * @returns {{
 *   valid: boolean,
 *   missingNodeIds: string[],
 *   extraNodeIds: string[],
 *   ticketsWithoutNodeIds: number
 * }}
 */
function verifyNodeCoverage(phase) {
  const phaseNodeIds = new Set(phase.nodeIds || []);
  const coveredNodeIds = new Set();
  let ticketsWithoutNodeIds = 0;

  for (const ticket of (phase.tickets || [])) {
    if (Array.isArray(ticket.nodeIds) && ticket.nodeIds.length > 0) {
      for (const nodeId of ticket.nodeIds) {
        coveredNodeIds.add(nodeId);
      }
    } else {
      ticketsWithoutNodeIds++;
    }
  }

  // 不足しているノードID（フェーズにあってチケットにない）
  const missingNodeIds = [];
  for (const nodeId of phaseNodeIds) {
    if (!coveredNodeIds.has(nodeId)) {
      missingNodeIds.push(nodeId);
    }
  }

  // 余分なノードID（チケットにあってフェーズにない）
  const extraNodeIds = [];
  for (const nodeId of coveredNodeIds) {
    if (!phaseNodeIds.has(nodeId)) {
      extraNodeIds.push(nodeId);
    }
  }

  const valid = missingNodeIds.length === 0;

  return { valid, missingNodeIds, extraNodeIds, ticketsWithoutNodeIds };
}

// ============================================================
// メイン処理
// ============================================================

/**
 * CLI引数をパースして各パスとフェーズ指定子を取得する。
 *
 * @param {string[]} argv — process.argv（通常は process.argv をそのまま渡す）
 * @returns {{ ticketsJsonPath: string|null, dirsTreePath: string|null, phaseArg: string|null, error: string|null }}
 */
function parseCliArguments(argv) {
  const ticketsJsonPath = argv[2] || null;
  const dirsTreePath = argv[3] || null;
  const phaseArg = argv[4] || null;
  const graphPath = argv[5] || null;

  if (!ticketsJsonPath || !dirsTreePath || !phaseArg) {
    return {
      ticketsJsonPath: null,
      dirsTreePath: null,
      phaseArg: null,
      graphPath: null,
      error:
        "Usage: echo '<tickets-array-json>' | node add-tickets-for-phase.js <Tickets.json> <Dirs-Tree.json> <P{id}> [GRAPH.json]",
    };
  }

  return { ticketsJsonPath, dirsTreePath, phaseArg, graphPath, error: null };
}

function main() {
  const parsed = parseCliArguments(process.argv);
  if (parsed.error) {
    console.error(parsed.error);
    process.exit(EXIT_FAILURE);
  }

  const { ticketsJsonPath, dirsTreePath, phaseArg, graphPath } = parsed;

  // 1. stdin からチケット配列を読み込み
  let ticketsInput;
  try {
    ticketsInput = JSON.parse(fs.readFileSync("/dev/stdin", "utf8"));
  } catch (err) {
    console.error("stdin のJSONパースに失敗しました: " + err.message);
    process.exit(EXIT_FAILURE);
  }

  if (!Array.isArray(ticketsInput)) {
    console.error("stdin はJSON配列でなければなりません。");
    process.exit(EXIT_FAILURE);
  }

  // 2. 各チケットの nodeIds を検証
  const ticketsWithoutNodeIds = ticketsInput.filter(function (t) {
    return !Array.isArray(t.nodeIds) || t.nodeIds.length === 0;
  });
  if (ticketsWithoutNodeIds.length > 0) {
    console.error(
      "nodeIds が未指定のチケットが " +
        ticketsWithoutNodeIds.length +
        " 件あります。各チケットに nodeIds 配列を指定してください。"
    );
    for (const t of ticketsWithoutNodeIds) {
      console.error("  - タイトル: " + (t.title || "(未設定)"));
    }
    process.exit(EXIT_FAILURE);
  }

  // 3. Dirs-Tree.json から default_files を自動解決
  let dirsTreeData;
  try {
    dirsTreeData = JSON.parse(
      fs.readFileSync(path.resolve(dirsTreePath), "utf8")
    );
  } catch (err) {
    console.error(
      "Dirs-Tree.json の読み込みに失敗しました: " +
        dirsTreePath +
        " (" +
        err.message +
        ")"
    );
    process.exit(EXIT_FAILURE);
  }
  const nodeToDirMap = buildNodeToDirMap(dirsTreeData);
  resolveDefaultFiles(ticketsInput, nodeToDirMap);

  // 3b. GRAPH.json から referenceSection を自動生成
  if (graphPath) {
    try {
      const resolvedGraphPath = path.resolve(graphPath);
      if (fs.existsSync(resolvedGraphPath)) {
        const graphData = JSON.parse(fs.readFileSync(resolvedGraphPath, 'utf8'));
        const graphNodes = graphData.nodes || [];
        const sourceFile = graphData.sourceFile || '';
        for (const ticket of ticketsInput) {
          const refSection = resolveReferenceSection(ticket.nodeIds, graphNodes, sourceFile);
          if (refSection) {
            ticket.referenceSection = refSection;
          }
        }
      } else {
        console.warn('[WARN] GRAPH.json が見つかりません: ' + resolvedGraphPath);
      }
    } catch (e) {
      console.warn('[WARN] GRAPH.json の読み込みに失敗しました: ' + e.message);
    }
  }

  // 4. Tickets.json を読み込み、フェーズを解決
  const resolvedPath = path.resolve(ticketsJsonPath);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  } catch (err) {
    console.error("Tickets.json の読み込みに失敗しました: " + err.message);
    process.exit(EXIT_FAILURE);
  }

  // フェーズ解決（add-ticket.js と同じロジック）
  let phase = null;
  if (phaseArg === "PX") {
    phase = data.phases.find(function (p) { return p.id === -1; });
  } else {
    const matchResult = phaseArg.match(/^P(-?\d+)$/);
    if (matchResult) {
      const phaseId = parseInt(matchResult[1], 10);
      phase = data.phases.find(function (p) { return p.id === phaseId; });
    }
  }

  if (!phase) {
    console.error("フェーズ " + phaseArg + " が見つかりません。");
    process.exit(EXIT_FAILURE);
  }

  // フェーズに nodeIds が存在するか確認
  if (!Array.isArray(phase.nodeIds) || phase.nodeIds.length === 0) {
    console.error(
      "フェーズ " +
        phaseArg +
        " には nodeIds がありません（nodeIds が空または未定義です）。"
    );
    process.exit(EXIT_FAILURE);
  }

  // 5. bulkAddTickets を実行（単一バッチとして）
  const batch = [
    {
      phaseId: phase.id,
      tickets: ticketsInput,
    },
  ];

  const addResult = bulkAddTickets(data, batch);
  if (!addResult.success) {
    console.error("チケット追加に失敗しました: " + JSON.stringify(addResult));
    process.exit(EXIT_FAILURE);
  }

  // 6. nodeIds 過不足検証
  const coverageResult = verifyNodeCoverage(phase);

  if (!coverageResult.valid) {
    console.error("nodeIds 過不足検証に失敗しました。");
    if (coverageResult.missingNodeIds.length > 0) {
      console.error(
        "不足ノード: [" + coverageResult.missingNodeIds.join(", ") + "]"
      );
    }
    if (coverageResult.extraNodeIds.length > 0) {
      console.error(
        "余剰ノード（フェーズ外）: [" + coverageResult.extraNodeIds.join(", ") + "]"
      );
    }
    process.exit(EXIT_FAILURE);
  }

  // 7. 検証成功 → ファイルに書き込み
  fs.writeFileSync(resolvedPath, JSON.stringify(data, null, 2) + "\n", "utf8");

  // 8. 結果出力
  const output = {
    success: true,
    phaseKey: phaseArg,
    added: addResult.added,
    tickets: addResult.tickets,
    missingNodeIds: coverageResult.missingNodeIds,
    extraNodeIds: coverageResult.extraNodeIds,
    defaultFilesResolved: true,
  };
  console.log(JSON.stringify(output, null, 2));
}

if (require.main === module) main();
module.exports = { verifyNodeCoverage, resolveDefaultFiles, resolveReferenceSection, parseCliArguments };
