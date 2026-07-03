/**
 * add-px-phase.js — Tickets.json に PX フェーズ（id=-1）を追加する
 *
 * PX は「P0 に先立つ／どの formulated フェーズにも属さない独立したチケット」
 * を格納する特別なフェーズ。formulate-tickets で生成される通常のフェーズ
 * （P0, P1, ...）とは異なり、id=-1 で固定され、常に配列の先頭に挿入される。
 *
 * 使用法:
 *   node add-px-phase.js <PATH to Tickets.json>
 *
 * 既に PX フェーズが存在する場合はエラー終了（重複防止）。
 * 書き込み前にスキーマ検証を実行し、失敗時は保存しない。
 */

const fs = require("fs");
const path = require("path");
const { validateTickets } = require("../lib/validate-tickets");

function main() {
  const jp = process.argv[2];
  if (!jp) {
    console.log(
      JSON.stringify({
        success: false,
        error: "Usage: node add-px-phase.js <PATH to Tickets.json>",
      }),
    );
    process.exit(1);
  }

  const rp = path.resolve(jp);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(rp, "utf8"));
  } catch (e) {
    console.log(
      JSON.stringify({ success: false, error: "Failed to read/parse " + rp }),
    );
    process.exit(1);
  }

  // 重複チェック: id=-1 のフェーズが既に存在するか
  const existing = (data.phases || []).find(function (p) {
    return p.id === -1;
  });
  if (existing) {
    console.log(
      JSON.stringify({
        success: false,
        error: "PX phase (id=-1) already exists",
      }),
    );
    process.exit(1);
  }

  // PX フェーズを作成し先頭に挿入
  const pxPhase = {
    id: -1,
    name: "[X] 独立フェーズ（P0 に先行／独立）",
    characteristics:
      "P0より前、またはP0以降のどのフェーズにも属さない独立したチケットを格納する特別なフェーズ。",
    tickets: [],
  };
  data.phases.unshift(pxPhase);

  // スキーマ検証
  const vr = validateTickets(data);
  if (!vr.valid) {
    data.phases.shift(); // ロールバック
    console.log(
      JSON.stringify({
        success: false,
        error: "Schema validation failed",
        errors: vr.errors,
      }),
    );
    process.exit(1);
  }

  // 書き込み
  fs.writeFileSync(rp, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(
    JSON.stringify({ success: true, phaseId: -1, name: pxPhase.name }),
  );
}

if (require.main === module) main();
module.exports = { main };
