#!/usr/bin/env node
/**
 * insert-io-boundary-template.js <rfc-file>
 *
 * RFC ファイルに「グラフ分割のための参考情報 — RFC設計書が示す I/O 境界の手がかり」
 * セクションをテンプレートとして追記する。
 *
 * テンプレート内の RFC 固有記述が必要な箇所には
 *   <!-- [::IO-INFO-STUB::] ここに記述すべき内容の説明 -->
 * 形式のマーカーを挿入する。AI がこのマーカーを手がかりに内容を記入する。
 *
 * 既に同名セクションが存在する場合は何もせず正常終了する（二重挿入防止）。
 */
import fs from "node:fs";
import path from "node:path";

const RFC_PATH = process.argv[2];
if (!RFC_PATH) {
  console.error("Usage: insert-io-boundary-template.js <rfc-file>");
  process.exit(1);
}

const resolvedPath = path.resolve(RFC_PATH);
if (!fs.existsSync(resolvedPath)) {
  console.error(`Error: RFC file not found: ${resolvedPath}`);
  process.exit(1);
}

const content = fs.readFileSync(resolvedPath, "utf-8");

// 既存セクションの有無を確認（二重挿入防止）
const sectionPattern = /graphify-rfc + boundify-graph-to-dirss*のための参考情報/;
if (sectionPattern.test(content)) {
  console.log("I/O boundary reference section already exists. Skipping.");
  process.exit(0);
}

// 次のセクション番号を決定（RFC が持つ最大セクション番号 + 1）
const sectionNumbers = content.match(/^## (\d+)\./gm);
let nextNumber = 1;
if (sectionNumbers && sectionNumbers.length > 0) {
  const maxNum = Math.max(...sectionNumbers.map((s) => parseInt(s.match(/\d+/)[0], 10)));
  nextNumber = maxNum + 1;
}

const sn = nextNumber;

const template = `\n\n## ${sn}. graphify-rfc + boundify-graph-to-dirs のための参考情報 — RFC設計書が示す I/O 境界の手がかり

本セクションは、後日 \`/graphify-rfc + boundify-graph-to-dirs\`（RFC分割）、\`/formulate-tickets\`（チケット策定）、\`/formulate-tickets-for-next\`（次フェーズチケット策定）を実行する際に、安全な I/O 境界や実装スコープの判断材料を得るための手がかりとして、RFC 設計書自体が自然な切断面を参考情報として示すものである。「これが正しい分割である」と決めつけるものではなく、設計の記述の中に現れる境界の候補を書き留めておくことで、実際の分割作業の一助とすることを目的とする。

### ${sn}.1 観測された自然な I/O 境界

<!-- [::IO-INFO-STUB::] この RFC の設計記述を俯瞰し、責務分離が自然に境界を形成している箇所を B1, B2, ... の形式で一覧表にしてください。各境界について「境界の種類」「切断面（左側/上流 → 右側/下流）」「該当セクション」「備考」を記述します。 -->

### ${sn}.2 境界の属性

<!-- [::IO-INFO-STUB::] 上記の各 I/O 境界について、「同期/非同期」「データ形式」「分割後の結合手段」「テスト独立性」の属性を表にまとめてください。 -->

### ${sn}.3 分割時に注意が必要な依存関係

<!-- [::IO-INFO-STUB::] この RFC の設計において、循環依存または暗黙的な依存関係で分割時に追加の考慮が必要となる箇所を列挙してください。各項目は「何が」「どのように」「なぜ注意が必要か」を具体的に説明します。 -->

### ${sn}.4 テスト分割への参考

<!-- [::IO-INFO-STUB::] 上記 I/O 境界で分割する場合のテストスコープの切り方を記述してください。各境界で分割した場合にどのテストが独立し、どのテストが結合が必要になるかを考察します。 -->

### ${sn}.5 分割後のファイル構成（一案）

<!-- [::IO-INFO-STUB::] 上記 I/O 境界で分割した場合のディレクトリ・ファイル構成の一案をコードブロックで示してください。実際のプロジェクト構造に即した形で記述します。 -->

### ${sn}.6 参考: 本セクションの目的と限界

- 本セクションは RFC の設計記述から**事後的に観測された**境界を書き留めたものであり、境界を**事前に設計した**ものではない。
- 実際の分割判断は、実装が進みコードとテストが蓄積された後、\`/graphify-rfc + boundify-graph-to-dirs\` 実行時に行う。
- ここに書かれた境界の候補は参考情報であり、分割時に新たな発見があればそちらを優先してよい。
`;

fs.writeFileSync(resolvedPath, content + template, "utf-8");
console.log(JSON.stringify({
  ok: true,
  section: `${sn}`,
  rfcPath: resolvedPath,
  note: "Template inserted with [::IO-INFO-STUB::] markers. AI must replace them with actual content before completion declaration.",
}));
