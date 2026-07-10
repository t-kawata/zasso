---
ticket_id: 77
title: フェーズ名・サマリー書き込みスクリプト群 — show-all-nodes-title-summary.js + write-phase-name-summary.js
slug: show-all-nodes-title-summaryjs-write-phase-name-summaryjs
status: draft
created_at: 2026-07-10
updated_at: 2026-07-10
---
# フェーズ名・サマリー書き込みスクリプト群 — show-all-nodes-title-summary.js + write-phase-name-summary.js

## Summary

split-to-tickets.md Step 4.2 の実装。phasify によって Tickets.json に書き込まれた全フェーズに対して、一言一句名前（name）とサマリー（summary）を付与するための2つのスクリプトとスキーマ拡張を実装する。

## Background

Step 4.1 の phasify スクリプトはフェーズに nodeIds を割り当てるが、名前（name）はプレースホルダの "P0", "P1"... のままであり、サマリー（summary）は空である。Step 5 以降でチケット定義を行うために、各フェーズが「どのようなノード群を含み、何を実装するフェーズなのか」を人間とAIが把握できるようにする必要がある。

以下の3段階で実現する：
1. `show-all-nodes-title-summary.js` がフェーズ内の全ノードの title/summary を GRAPH.json から抽出し表示
2. AI がその情報をもとにフェーズ名とサマリーを生成
3. `write-phase-name-summary.js` が Tickets.json に name/summary を書き込む

## Scope

1. **tickets-schema.json 拡張**: phase 定義に `summary`（string, required には含めない）を追加
2. **`show-all-nodes-title-summary.js` 新規作成**:
   - 引数: `<Tickets.json> <GRAPH.json> <phaseId>`（例: `P0`）
   - 処理: Tickets.json の該当フェーズの nodeIds を取得 → GRAPH.json から各ノードの title, summary を抽出
   - 出力形式:
     ```
     N0001: [§1 目的 — 本crateの責務定義] RustからPJSUAを安全に...
     N0002: [§1a M20実装優先度マップ] M20追補の全実装項目を...
     ```
   - 異常系: 存在しない phaseId → エラーメッセージ + exit 1
   - 異常系: 空の nodeIds → 空出力 + exit 0
3. **`write-phase-name-summary.js` 新規作成**:
   - 引数: `<Tickets.json> <phaseId>`（stdin から JSON で name/summary を受け取る）
   - 処理: Tickets.json の該当フェーズに name, summary を書き込む
   - 入力例: `{"name":"認証基盤","summary":"認証トークン生成・検証・Session管理"}`
   - 異常系: 存在しない phaseId → エラーメッセージ + exit 1
   - 異常系: name/summary が空 → エラーメッセージ + exit 1
4. **完了確認スクリプト（既存 validate-phasify.js 拡張または新規）**: 全フェーズに name/summary が埋まっているか確認

## Non-scope

- split-to-tickets.md 自体の編集（ユーザー担当）
- name/summary の内容をAIが生成するロジック（スクリプトの外部でAIが判断する）
- phasify コアアルゴリズムの改変

## Investigation

### tickets-schema.json 現状の phase 定義

`tickets-schema.json` の `definitions.phase.properties` に `summary` は存在しない。`nodeIds` と同様、required には含めず追加する。

```json
"summary": {
  "type": "string",
  "description": "このフェーズの実装サマリー（フェーズ内のノード群が何を実装するかの説明）"
}
```

### 既存スクリプトの引数パターン

既存の phasify 関連スクリプトは全て `.clade/scripts/rfc-graph/` 配下。引数パターンは以下の通り：

| スクリプト | 引数形式 |
|-----------|---------|
| validate-phasify.js | `--tickets=<PATH> --graph=<PATH> --dirs-tree=<PATH>` |
| phasify-graph-and-dirs-files-tree.js | `<GRAPH.json> <Dirs-Tree.json> [--dry-run] [--verbose]` |
| update-ticket.js (tickets系) | `<PATH to Tickets.json> <ticketKey>`（stdin: JSON） |

`show-all-nodes-title-summary.js` は `--tickets=<PATH> --graph=<PATH> --phase=<phaseId>` 形式を採用する（validate-phasify.js のパターンに準拠）。
`write-phase-name-summary.js` は `<Tickets.json> <phaseId>` + stdin JSON を採用する（update-ticket.js のパターンに準拠）。

### 実データサンプル

176ノードの実データで P0 の nodeIds = [N0001, N0002, N0003, N0004, N0007, N0008, N0009] の場合、期待される出力：

```
N0001: [§1 目的 — 本crateの責務定義] RustからPJSUAを安全かつ非同期に利用しSIP音声通話機能を提供するcrateの目的を定義。映像機能は対象外。
N0002: [§1a M20実装優先度マップ] M20追補の全実装項目をP0/P1/P2/P3優先度で整理。
...
```

## Test Plan

### ユニットテスト計画

1. **show-all-nodes-title-summary テスト**:
   - 正常系: 実在する phaseId + 該当ノード全ての title/summary が出力される
   - 異常系1: 存在しない phaseId → exit 1 + エラーメッセージ
   - 異常系2: 空の nodeIds → exit 0 + 空出力
   - 異常系3: 存在しないノードIDが nodeIds に含まれる → エラーメッセージ + exit 1
   - 境界値: 単一ノードのみのフェーズ

2. **write-phase-name-summary テスト**:
   - 正常系: stdin から name/summary を受け取り、該当フェーズに書き込まれる
   - 異常系1: 存在しない phaseId → exit 1
   - 異常系2: name/summary が空 → exit 1
   - 異常系3: 不正な JSON が stdin → exit 1

3. **スキーマ互換性テスト**:
   - summary なしの既存 Tickets.json が検証を通る
   - summary ありの Tickets.json が検証を通る
   - validate-tickets.js で読み込み可能

### ユニットテスト不可能な項目（例外）

- なし（全処理はファイルI/OとJSON操作のみ）

## Boy Scout Rule — 翻訳可能性計画

- `showAllNodesTitleSummary()`: 関数名は動詞句。1責務＝表示
- `writePhaseNameSummary()`: 関数名は動詞句。1責務＝書き込み
- 引数パースは `parseArguments()` で分離
- エラーは throw ではなく具体的なメッセージ付きで process.exit

## Acceptance Criteria

- [ ] tickets-schema.json の phase に `summary` が追加（required には含めず互換性維持）
- [ ] `show-all-nodes-title-summary.js` が指定フェーズの全ノード title/summary を表示する
- [ ] `write-phase-name-summary.js` が指定フェーズに name/summary を書き込む
- [ ] 全異常系で適切なエラーメッセージ + exit 1
- [ ] 全テスト PASS（既存128テスト + 新規テスト）
- [ ] 実データ（176ノード）で正常動作確認
