---
ticket_id: 179
title: "M1: formulate-tickets.md への Malfeasance.json 作成処理の追加"
slug: m1-formulate-ticketsmd-malfeasancejson
status: reviewed
created_at: 2026-06-21
updated_at: 2026-06-21
related_tickets: "依存: M0 (#178) — スクリプト群完成後に実装可能"
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0179-m1-formulate-ticketsmd-malfeasancejson/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0179-m1-formulate-ticketsmd-malfeasancejson/review.md
plan_path: /Users/shyme/shyme/zasso/tickets/context/0179-m1-formulate-ticketsmd-malfeasancejson/plan.md
---

# M1: formulate-tickets.md への Malfeasance.json 作成処理の追加

## Summary

`.claude/commands/formulate-tickets.md` に、CLAUDE.md が生成されるより前に Malfeasance.json をスクリプトで新規作成する処理を追加する。

## Background

formulate-tickets.md は CLAUDE.md を生成する直前に実行されるプロセスである。Malfeasance.json は CLAUDE.md と同じディレクトリ（プロジェクトルート）に配置する必要がある。したがって、formulate-tickets.md の処理フロー内で、CLAUDE.md 生成の直前に Malfeasance.json の初期作成処理を組み込む。

- Malfeasance.json の初回作成は `malfeasance-create.js` ではなく、専用の初期化スクリプトまたは formulate-tickets.md 内の直接処理で行う
- すでに Malfeasance.json が存在する場合は上書きせず、存在確認後にスキップする
- 作成後は `malfeasance-schema.json` によるスキーマ検証を通過することを確認する

### 決定事項

| Q | 決定 |
|---|------|
| 初期化方法 | formulate-tickets.md 内で `ensure-malfeasance.js` スクリプトを呼び出す |
| スクリプト | `.claude/scripts/tickets/ensure-malfeasance.js` を新規作成 |
| スキップ条件 | 既に Malfeasance.json が存在する場合は何もしない |
| 配置場所 | `.claude/commands/Malfeasance.json` |
| CLAUDE.md 生成との順序 | ensure-malfeasance.js → CLAUDE.md 生成（formulate-tickets.md の該当箇所以降） |

## Scope

### 含むもの

1. **`ensure-malfeasance.js` の新規作成**
   - Malfeasance.json が存在しなければ、空のレコード配列を持つ初期 JSON を作成
   - 作成後、`malfeasance-schema.json` でスキーマ検証を実施
   - スキーマ検証通過後、ファイルに書き出す
   - 出力: `{ success: true, action: "created" | "skipped", path: "..." }`

2. **`formulate-tickets.md` の修正**
   - CLAUDE.md 生成処理の直前に `ensure-malfeasance.js` を呼び出す記述を追加
   - 当該処理の位置を明確に示すコメント／セクション見出しを追加

3. **README.md の更新**
   - `.claude/scripts/tickets/README.md` に `ensure-malfeasance.js` を追記

### 含まないもの

- 犯罪レコードの操作ロジック（→ M0 #178 の各スクリプトで提供）
- 各コマンドファイル（make/plan/start/review）への統合（→ M3 #181）
- 第一級規則の文面の記述（→ M2 #180）

## ensure-malfeasance.js 仕様

```text
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/ensure-malfeasance.js"
```

**出力**:
```json
{ "success": true, "action": "created", "path": "/path/to/.claude/commands/Malfeasance.json" }
```

または（既存時スキップ）:
```json
{ "success": true, "action": "skipped", "path": "/path/to/.claude/commands/Malfeasance.json" }
```

**エラー**:
```json
{ "success": false, "error": "Schema file not found: ..." }
```

**初期内容**:
```json
{
  "version": 1,
  "records": []
}
```

## 依存・関連チケットID

| 関係 | チケット | 説明 |
|------|---------|------|
| 依存 | M0 (#178) | 本チケットは M0 のスキーマ定義とスクリプト群完成後に実装可能 |
| 並列可能 | M2 (#180) | 第一級規則の文面記述とは依存関係なし |
| 後続 | M3 (#181) | 本チケットで作成される Malfeasance.json を各コマンドで利用 |

## 調査結果

### formulate-tickets.md 現状調査（2026-06-21 実装時）

- **CLAUDE.md 生成位置**: formulate-tickets.md の Step 2 にて `cat <<'CLAUDE_EOF'` で設計マップ CLAUDE.md を生成（プロジェクトルートの CLAUDE.md とは別物）
- **Malfeasance.json 挿入位置**: Step 0（引数パース、line 36-45）直後、Step 1（設計書検証、line 47-）の前。`fi` の直後が最適。
- **ensure-malfeasance.js**: Step 0.5 として追加。`_R` は既存のコマンド例に合わせ `$(git rev-parse --show-toplevel)/.claude` で取得。
- **既存 Malfeasance.json**: 存在しない状態が正常。ensure-malfeasance.js は不在時のみ作成し、既存時はスキップする。

## Test Plan

### ユニットテスト計画

1. **ensure-malfeasance.js のテスト**
   - Malfeasance.json が存在しない場合 → 新規作成される
   - Malfeasance.json が既に存在する場合 → スキップされる（上書きしない）
   - スキーマファイルが存在しない場合 → エラー終了する
   - 作成された JSON がスキーマ検証を通過する

2. **formulate-tickets.md のテスト**
   - 修正箇所が「CLAUDE.md 生成より前」であることを確認（目視レビュー）
   - スクリプト呼び出しのコマンド例が正確であることを確認

### ユニットテスト不可能な項目（例外）

- formulate-tickets.md の記述自体は動作確認の対象外（Markdown ファイルのため、内容の正確性は目視レビューで担保する）

## 受け入れ基準 (Acceptance Criteria)

1. [ ] `ensure-malfeasance.js` が存在し、単体で実行可能である
2. [ ] Malfeasance.json 不在時に新規作成され、スキーマ検証を通過する
3. [ ] Malfeasance.json 既存時は上書きされない
4. [ ] formulate-tickets.md 内で、CLAUDE.md 生成より前にスクリプト呼び出しが明記されている
5. [ ] README.md に `ensure-malfeasance.js` が追記されている

## Boy Scout Rule — 翻訳可能性計画

- formulate-tickets.md 内の既存記述で翻訳可能性を損なう箇所があれば改善する
