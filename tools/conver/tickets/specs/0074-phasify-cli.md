---
ticket_id: 74
title: phasify基盤整備 — スキーマ改修・CLI骨格・テンプレート移植
slug: phasify-cli
status: draft
created_at: 2026-07-10
updated_at: 2026-07-10
---
# phasify基盤整備 — スキーマ改修・CLI骨格・テンプレート移植

## Summary

split-to-tickets.md の Step 4 で使用する `phasify-graph-and-dirs-files-tree.js` の基盤部分を実装する。具体的には：(1) Tickets.json の phase スキーマに `nodeIds` フィールドを追加するスキーマ改修、(2) `write-tickets-json-template.js` の移植による Tickets.json 新規生成機能、(3) スクリプトの CLI 骨格（引数パース、--dry-run フラグ）、(4) 検証サブスクリプト（`validate-phasify.js`）の作成。

## Background

split-to-tickets パイプラインの Step 4（フェーズ設計）は、graphify で生成されたグラフノードを boundify のディレクトリ構造情報を手がかりに実装フェーズにグルーピングする。この処理を実行するスクリプト `phasify-graph-and-dirs-files-tree.js` が必要である。本チケットはそのスクリプトの「土台」部分——データ構造定義・I/O・検証——を担当し、コアアルゴリズム（SCC分解・重み付きトポロジカルソート・フェーズ合併）は PX-38 に分離する。

現在 Tickets.json の phase スキーマには `nodeIds` フィールドが存在しない。フェーズにどのグラフノードが割り当てられたかを記録するため、このフィールドを追加する必要がある。また、formulate-tickets.md に存在する `write-tickets-json-template.js` による Tickets.json スケルトン生成機能を移植し、phasify が独立して Tickets.json を生成できるようにする。

## Scope

1. **tickets-schema.json 改修**: phase オブジェクトに `nodeIds` プロパティ（`type: array, items: { type: string }`）を追加する。`required` には含めず、既存 Tickets.json との互換性を維持する。
2. **`write-tickets-json-template.js` 移植**: formulate-tickets.md の `write-tickets-json-template.js` の機能（空の Tickets.json スケルトン生成 + スキーマ検証）を分析し、必要なら phasify 用にラップするか、そのまま流用できることを確認する。Tickets.json が存在しない場合に phasify から呼び出せるようにする。
3. **`phasify-graph-and-dirs-files-tree.js` CLI骨格**:
   - 引数パース: `<GRAPH.json> <Dirs-Tree.json> [--dry-run]`
   - Tickets.json パス導出: `dirname(GRAPH.json)` = `dirname(Dirs-Tree.json)` から自動決定
   - Dirs-Tree.json 未存在時: エラー終了 + boundify 促しメッセージ
   - Tickets.json 未存在時: `write-tickets-json-template.js` で新規生成
   - `--dry-run`: 標準出力のみ（Tickets.json への書き込みなし）
   - `--verbose`: 処理経過の詳細表示
4. **`validate-phasify.js` 検証サブスクリプト作成**: Phase 6項目検証（全ノードカバレッジ、SCC同一性、Hard制約遵守、下限充足、Dirs制約、孤立0）
5. **既存スクリプトへの影響ゼロ確認**: 改修後のスキーマで既存の tickets 系スクリプト（add-ticket.js, list-phases-and-tickets.js 等）が正常動作することを確認するテストコードを作成する。

## Non-scope

- コアアルゴリズム（SCC分解、重み付きトポロジカルソート、フェーズ合併）— PX-38
- split-to-tickets.md の編集（ユーザー担当）
- 実ファイル（ソースコード）の生成・変更（generate-dir-template.js 等の役割）

## Investigation

### tickets-schema.json 現状

`tickets-schema.json` の phase 定義（`definitions.phase`）は以下の構造：

```json
"phase": {
  "type": "object",
  "required": ["id", "name", "tickets"],
  "properties": {
    "id": { "type": "integer", "minimum": -1 },
    "name": { "type": "string", "minLength": 1 },
    "externalDependencies": { "type": "string" },
    "characteristics": { "type": "string" },
    "tickets": {
      "type": "array",
      "items": { "$ref": "#/definitions/ticket" }
    }
  }
}
```

`nodeIds` フィールドは存在しない。追加のみ行い、既存フィールドは一切変更しない。

### write-tickets-json-template.js 現状

`/Users/kawata/shyme/zasso/tools/conver/.claude/scripts/tickets/write-tickets-json-template.js` は以下の機能を持つ：

- 引数: `<PATH to Tickets.json> '<metadata-json>'`
- 機能: `{title, metadata: {source, generatedAt, analyzedSections}, phases: []}` のスケルトンを書き出し
- 書き出し後に `validate-tickets.js` でスキーマ検証を自動実行
- 使用法: `formulate-tickets.md` Step 10 で参照されている

phasify からは、Tickets.json が存在しない場合に同様のスケルトン生成が必要。write-tickets-json-template.js を直接呼び出すか、内部で同じ validate-tickets.js を使用するラッパーを実装する。

### validate-tickets.js パス

```
/Users/kawata/shyme/zasso/tools/conver/.claude/scripts/lib/validate-tickets.js
```

require パスは `../lib/validate-tickets`（tickets スクリプトからの相対）。

### Tickets.json 現状

既存の Tickets.json は PX フェーズ（PX-1〜PX-38）と P0〜P21 の各フェーズを持ち、176ノードの GRAPH.json に対応している。PX-37, PX-38 は既に登録済み（本 spec 作成時に追加）。

### 実データ統計

- GRAPH.json: 176ノード、207エッジ（part_of: 113, depends_on: 52, refines: 15, references: 15, precedes: 7, triggers: 3, extends: 2）
- 全12 kind（architecture: 45, api_contract: 28, rationale: 24, config: 17, test_policy: 12, build_ci: 12, data_model: 9, requirement: 8, security: 8, error_policy: 6, state_machine: 6, glossary: 1）
- Dirs-Tree.json: dependencyDirections 2件（config→security, tests→error）。循環依存なし
- 176 ÷ 10 = 17.6 → 最低18フェーズ（ノード数の絶対値下限として十分）

## Test Plan

### ユニットテスト計画

1. **`validate-phasify.js` 単体テスト**:
   - 正常系: 全176ノードが正しくカバーされたフェーズ配列を渡した場合 → `valid: true`
   - 異常系1: ノードが1つもカバーされていない場合 → `valid: false`
   - 異常系2: SCC 同一性違反（同一 SCC のノードが別フェーズにある）→ `valid: false`
   - 異常系3: Hard制約違反（w=∞ エッジで逆順）→ `valid: false`
   - 異常系4: フェーズ下限10未満 → `valid: false`
   - 異常系5: ディレクトリ間依存方向違反 → `valid: false`
   - 境界値: 総ノード数9（下限未満）→ エラーではなく警告？

2. **CLI 引数パーステスト**:
   - 正常系: 正しい2引数 + `--dry-run` → 正しくパースされる
   - 異常系: 引数不足（0または1）→ エラーメッセージ + exit 1
   - 異常系: Dirs-Tree.json 未存在 → boundify 促しメッセージ + exit 1
   - 異常系: 不明なフラグ → エラーメッセージ + exit 1

3. **スキーマ改修の互換性テスト**:
   - 既存の Tickets.json を読み込み → スキーマ検証パス（nodeIds なしでもOK）
   - `nodeIds` を追加した Tickets.json を読み込み → スキーマ検証パス
   - 既存の tickets 系 CRUD スクリプトで読み書きできることを確認

4. **`write-tickets-json-template.js` 移植テスト**:
   - テンプレート生成 + スキーマ検証が通ること
   - 生成された Tickets.json に PX フェーズを add-px-phase.js で追加できること

### ユニットテスト不可能な項目（例外）

- `--dry-run` の「書き込みが実際に行われないこと」の確認は、テストファイルシステム上で検証可能（書き込み後ファイルがないことを fs.existsSync で確認）。特記事項なし。
- Dirs-Tree.json のファイル未存在確認は、テスト用に存在しないパスを渡すことで検証可能。特記事項なし。

## Boy Scout Rule — 翻訳可能性計画

- `phasify-graph-and-dirs-files-tree.js` の CLI 骨格:
  - `parseArguments()`: 関数名は動詞句。引数パースとバリデーションを関数境界で分割
  - `resolveTicketsPath()`: 「Tickets.json パスを解決する」という1責務
  - `ensureTicketsJsonExists()`: 存在確認と新規生成の責務を明確に分離
  - エラー握りつぶし禁止: すべてのエラーは throw または Err を返し、呼び出し元で処理
- ハードコード値禁止: 重みテーブル（∞/2/1/0）は PX-38 担当だが、共通参照する定数は `boundify-helpers.js` または phasify 内の定数として宣言
- 関数は25行以内を目標、50行を上限とする

## Acceptance Criteria

- [ ] tickets-schema.json の phase に `nodeIds` が追加され、既存 Tickets.json との互換性が維持されている
- [ ] `phasify-graph-and-dirs-files-tree.js` が引数パース + Dirs-Tree.json 存在確認 + Tickets.json 自動生成を行う
- [ ] `--dry-run` フラグで標準出力のみ（Tickets.json 書き込みなし）が動作する
- [ ] `validate-phasify.js` が6項目の検証を実装し、すべての異常系を検出する
- [ ] 既存の tickets 系 CRUD スクリプトが改修後も正常動作する
- [ ] `write-tickets-json-template.js` の移植が完了し、Tickets.json 未存在時に新規生成できる
