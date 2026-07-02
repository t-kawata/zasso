/**
 * write-claude-md.js — CLAUDE.md 生成スクリプト
 *
 * 設計書の分析結果から設計全体マップの CLAUDE.md を生成する。
 * 単一行の値は CLI 引数、複数行の値は stdin から受け取ることで、
 * JSON の複数行問題を回避する。
 *
 * 使用法:
 *   node write-claude-md.js <outputPath> <generatorName> <title> <sourcePath> <<'BODY'
 *   <本文 — 目的・アーキテクチャ・型定義・依存関係・スタブの各セクション>
 *   BODY
 *
 * generatorName:
 *   "formulate-tickets"         — 初回設計書用
 *   "formulate-tickets-for-next" — 次世代RFC拡張用
 *
 * title:      設計書のタイトル（単一行）
 * sourcePath: 設計書のファイルパス（単一行）
 * stdin:      各セクションを生マークダウンで記述した本文
 *             （セクションのヘッダー（##）を含む）
 *
 * スクリプトが自動生成するもの:
 *   - 先頭行（"# <title> — 設計全体マップ"）
 *   - ヘッダーブロック（generated-by, source, date）
 *   - 末尾の固定セクション「チケット分解の設計原則」
 *
 * stdin の本文には以下を含める（ヘッダー含む、アーキテクチャ概要は
 * formulate-tickets の場合のみ含める）:
 *   ## 目的とスコープ
 *   ## アーキテクチャ概要（formulate-tickets のみ）
 *   ## 主要な型とデータ構造
 *   ## モジュール／コンポーネント間の関係
 *   ## スタブ一覧と解決計画
 */

const fs = require("fs");
const path = require("path");

/** チケット分解の設計原則（常に固定、スクリプトが末尾に付加） */
const DESIGN_PRINCIPLES = [
  "## チケット分解の設計原則",
  "",
  "この設計書に基づく全チケットは、以下の原則に従って分解されている：",
  "",
  "- **不変条件 = I/O境界の契約**: 各チケットの完了は、公開I/O（引数→戻り値、トレイトメソッド、APIエンドポイント等）に対する契約がテストによって検証されたことをもって判断する。内部実装の詳細は完了判定に影響しない。",
  "- **I/O 境界の言語マッピング**: Layer 0（型定義）は struct/interface/type、Layer 1（純粋関数）は pub fn/func/export function 等、各層の I/O 境界は Rust/Go/TypeScript の具象言語要素に対応づけられる。詳細は上位の formulate-tickets コマンドの Step 3「I/O 境界マッピング」を参照。",
  "- **結合テスト計画**: 各チケットは出力先チケットとの I/O 結合テストを `[::STUB::]` マーカー付きで `notes` フィールドに計画として含める。これは「不変条件が I/O の連続性によって保証される」ことを担保する。",
  "",
];

/**
 * ヘッダー（タイトル + メタブロック）を生成する
 */
function generateHeader(title, sourcePath, generatorName) {
  const isNext = generatorName === "formulate-tickets-for-next";
  const today = new Date().toISOString().slice(0, 10);
  const titleSuffix = isNext ? "（拡張）" : "";

  return [
    `# ${title} — 設計全体マップ${titleSuffix}`,
    "",
    `> このファイルは \`/${generatorName}\` によって自動生成されました。`,
    `> **生成元:** ${sourcePath}`,
    `> **生成日:** ${today}`,
    "",
  ].join("\n");
}

function main() {
  const outputPath = process.argv[2];
  const generatorName = process.argv[3];
  const title = process.argv[4];
  const sourcePath = process.argv[5];

  if (!outputPath || !generatorName || !title || !sourcePath) {
    console.error(
      "使用法: node write-claude-md.js <outputPath> <generatorName> <title> <sourcePath> <<'BODY'",
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

  // stdin から本文（複数行マークダウン）を読み込む
  let body = "";
  const stdin = process.stdin;
  stdin.setEncoding("utf-8");

  stdin.on("data", (chunk) => {
    body += chunk;
  });

  stdin.on("end", () => {
    const trimmedBody = body.trim();
    if (!trimmedBody) {
      console.error("エラー: stdin から本文が読み取れませんでした");
      process.exit(1);
    }

    const resolvedPath = path.resolve(outputPath);

    // ヘッダー生成
    const header = generateHeader(title, sourcePath, generatorName);

    // 固定フッター
    const footer = DESIGN_PRINCIPLES.join("\n");

    // 結合
    const content = [header, trimmedBody, "", footer].join("\n");

    try {
      fs.writeFileSync(resolvedPath, content, "utf-8");
    } catch (err) {
      console.error(
        `エラー: ファイル書き込み失敗 ${resolvedPath}: ${err.message}`,
      );
      process.exit(1);
    }

    console.log(`設計全体マップを ${resolvedPath} に生成しました`);
  });

  stdin.on("error", (err) => {
    console.error(`エラー: stdin 読み込み失敗 — ${err.message}`);
    process.exit(1);
  });
}

if (require.main === module) main();
module.exports = { generateHeader, DESIGN_PRINCIPLES };
