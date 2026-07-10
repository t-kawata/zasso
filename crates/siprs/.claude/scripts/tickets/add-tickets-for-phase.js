#!/usr/bin/env node

/**
 * add-tickets-for-phase.js — フェーズ単位のチケット追加＋nodeIds過不足検証
 *
 * split-to-tickets パイプラインの Step 5-2 で使用する。
 * bulkAddTickets() を呼び出してチケットを追加した後、当該フェーズの全 nodeIds が
 * 追加された tickets[].nodeIds の和集合と一致することを検証する。
 *
 * 検証が通らなければ書き込みは行われず（ロールバック）、exit 1 で終了する。
 *
 * Usage:
 *   echo '<tickets-array-json>' | node add-tickets-for-phase.js \
 *     <Tickets.json のパス> \
 *     <P{id}>
 */

const fs = require("fs");
const path = require("path");
const { bulkAddTickets } = require("./bulk-add-tickets.js");

// ============================================================
// 定数定義
// ============================================================

/** 正常終了コード */
const EXIT_SUCCESS = 0;

/** 異常終了コード */
const EXIT_FAILURE = 1;

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

function main() {
  const ticketsJsonPath = process.argv[2];
  const phaseArg = process.argv[3];

  // 引数チェック
  if (!ticketsJsonPath || !phaseArg) {
    console.error(
      "Usage: echo '<tickets-array-json>' | node add-tickets-for-phase.js <Tickets.json> <P{id}>"
    );
    process.exit(EXIT_FAILURE);
  }

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

  // 3. Tickets.json を読み込み、フェーズを解決
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

  // 4. bulkAddTickets を実行（単一バッチとして）
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

  // 5. nodeIds 過不足検証
  const coverageResult = verifyNodeCoverage(phase);

  if (!coverageResult.valid) {
    // 検証失敗 → 変更を破棄（data はまだ書き込まれていないので何もしない）
    console.error(
      "nodeIds 過不足検証に失敗しました。"
    );
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

  // 6. 検証成功 → ファイルに書き込み
  fs.writeFileSync(resolvedPath, JSON.stringify(data, null, 2) + "\n", "utf8");

  // 7. 結果出力
  const output = {
    success: true,
    phaseKey: phaseArg,
    added: addResult.added,
    tickets: addResult.tickets,
    missingNodeIds: coverageResult.missingNodeIds,
    extraNodeIds: coverageResult.extraNodeIds,
  };
  console.log(JSON.stringify(output, null, 2));
}

if (require.main === module) main();
module.exports = { verifyNodeCoverage };
