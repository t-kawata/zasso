/**
 * write-claude-md-template.js — CLAUDE.md テンプレート生成スクリプト
 *
 * formulate-tickets / formulate-tickets-for-next の両方から呼び出され、
 * 設計全体マップの CLAUDE.md テンプレートを生成する。
 * プレースホルダー（<...>）は呼び出し元で AI が適宜置き換える。
 *
 * 使用法:
 *   node write-claude-md-template.js <outputPath> <generatorName>
 *
 * generatorName:
 *   "formulate-tickets"         — 初回設計書用テンプレート
 *   "formulate-tickets-for-next" — 次世代RFC拡張用テンプレート
 */

const fs = require("fs");
const path = require("path");

/**
 * バリアントに応じたCLAUDE.mdテンプレートを生成する
 */
function generateContent(generatorName) {
  const isNext = generatorName === "formulate-tickets-for-next";

  const title = isNext
    ? "# <次世代RFCタイトル> — 設計全体マップ（拡張）"
    : "# <設計書タイトル> — 設計全体マップ";

  const sourceLabel = isNext ? "<NEXT_RFCパス>" : "<設計書パス>";

  const sections = [];

  sections.push(
    title,
    "",
    `> このファイルは \`/${generatorName}\` によって自動生成されました。`,
    `> **生成元:** ${sourceLabel}`,
    "> **生成日:** <現在日付>",
    "",
  );

  sections.push(
    "## 目的とスコープ",
    "",
    isNext
      ? "<次世代RFCの目的・スコープの要約>"
      : "<設計書の目的・スコープの要約>",
    "",
  );

  // formulate-tickets のみ「アーキテクチャ概要」を含む
  if (!isNext) {
    sections.push(
      "## アーキテクチャ概要",
      "",
      "<主要コンポーネントとその責務の一覧>",
      "",
    );
  }

  sections.push(
    "## 主要な型とデータ構造",
    "",
    isNext
      ? "<主要な型・トレイト・構造体とそれらの関係性>"
      : "<主要な型・トレイト・構造体とそれらの関係性>",
    "",
  );

  sections.push(
    "## モジュール／コンポーネント間の関係",
    "",
    isNext
      ? "<RFCに記述された各コンポーネント・モジュール間の依存関係と結合の一覧>"
      : "<設計書に記述された各コンポーネント・モジュール間の依存関係と結合の一覧>",
    "",
  );

  sections.push(
    "## スタブ一覧と解決計画",
    "",
    isNext
      ? "<本RFCに基づく実装で発生するスタブの一覧と、各スタブをどのチケットがどのように解決するかの対応関係>"
      : "<本設計書に基づく実装で発生するスタブ（[::STUB::]）の一覧と、各スタブをどのチケットがどのように解決するかの対応関係>",
    "",
  );

  sections.push(
    "## チケット分解の設計原則",
    "",
    "この設計書に基づく全チケットは、以下の原則に従って分解されている：",
    "",
    "- **不変条件 = I/O境界の契約**: 各チケットの完了は、公開I/O（引数→戻り値、トレイトメソッド、APIエンドポイント等）に対する契約がテストによって検証されたことをもって判断する。内部実装の詳細は完了判定に影響しない。",
    "- **I/O 境界の言語マッピング**: Layer 0（型定義）は struct/interface/type、Layer 1（純粋関数）は pub fn/func/export function 等、各層の I/O 境界は Rust/Go/TypeScript の具象言語要素に対応づけられる。詳細は上位の formulate-tickets コマンドの Step 3「I/O 境界マッピング」を参照。",
    "- **結合テスト計画**: 各チケットは出力先チケットとの I/O 結合テストを `[::STUB::]` マーカー付きで `notes` フィールドに計画として含める。これは「不変条件が I/O の連続性によって保証される」ことを担保する。",
    "",
  );

  return sections.join("\n");
}

function main() {
  const outputPath = process.argv[2];
  const generatorName = process.argv[3];

  if (!outputPath || !generatorName) {
    console.error(
      "使用法: node write-claude-md-template.js <outputPath> <generatorName>",
    );
    console.error(
      '  generatorName: "formulate-tickets" | "formulate-tickets-for-next"',
    );
    process.exit(1);
  }

  if (
    generatorName !== "formulate-tickets" &&
    generatorName !== "formulate-tickets-for-next"
  ) {
    console.error(`エラー: 不明な generatorName "${generatorName}"`);
    process.exit(1);
  }

  const resolvedPath = path.resolve(outputPath);
  const content = generateContent(generatorName);

  try {
    fs.writeFileSync(resolvedPath, content, "utf-8");
  } catch (err) {
    console.error(
      `エラー: ファイル書き込み失敗 ${resolvedPath}: ${err.message}`,
    );
    process.exit(1);
  }

  console.log(`設計全体マップを ${resolvedPath} に生成しました`);
}

if (require.main === module) main();
module.exports = { generateContent };
