---
ticket_id: 178
title: "M0: Malfeasance.json スキーマ定義と操作スクリプト群の作成"
slug: m0-malfeasancejson
status: reviewed
created_at: 2026-06-21
updated_at: 2026-06-21
related_tickets: "後続: M1 (#179), M3 (#181)"
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0178-m0-malfeasancejson/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0178-m0-malfeasancejson/review.md
plan_path: /Users/shyme/shyme/zasso/tickets/context/0178-m0-malfeasancejson/plan.md
---

# M0: Malfeasance.json スキーマ定義と操作スクリプト群の作成

## Summary

Malfeasance.json — 不完全な実装（`[::STUB::]` 未付与）を「犯罪」として記録する台帳 — の JSON Schema 定義と、それを操作する全 CRUD スクリプト（create / get / search / all / update / delete）を `.claude/scripts/tickets/` 配下に作成する。全ての操作スクリプトはスキーマ検証を必須とする。

## Background

第一級規則として「不完全な実装には全て `[::STUB::]` マーカーを付けなければならず、未付与の不完全実装は犯罪である」ことを全コマンドファイルに明記する。この規則の実効性を担保するため、犯罪を記録する台帳 Malfeasance.json とその操作スクリプト群が必要となる。

- Malfeasance.json は `.claude/commands/` 直下に配置される（formulate-tickets.md が CLAUDE.md 生成前にスクリプトで作成する — チケット M1 #179）
- 全 CRUD 操作はスクリプト経由でのみ行い、手編集は禁止する
- 各操作は入出力ともに JSON Schema に基づく検証を通過しなければならない

### 決定事項

| Q | 決定 |
|---|------|
| 操作名 | create / get / search / all / update / delete の 6 操作 |
| スクリプト言語 | JavaScript (CommonJS) — 既存のチケットスクリプト群に統一 |
| スキーマ言語 | JSON Schema (draft-07) |
| スキーマファイル | `.claude/scripts/tickets/malfeasance-schema.json` |
| スキーマ検証ライブラリ | `ajv` (npm) — バンドルせず、`require('ajv')` で参照 |
| 配置先 | `.claude/scripts/tickets/malfeasance-{create,get,search,all,update,delete}.js` |

## Scope

### 含むもの

1. **JSON Schema 定義ファイル** (`malfeasance-schema.json`)
   - Malfeasance.json のルートスキーマ（配列 or オブジェクト形式）
   - 各犯罪レコードのスキーマ（必須フィールド、型、バリデーションルール）
   - スキーマバージョン管理用の `$schema` / `$id` フィールド

2. **操作スクリプト 6 本**
   - `malfeasance-create.js` — 新規犯罪レコード作成（重複防止 + スキーマ検証）
   - `malfeasance-get.js` — 特定レコードを ID で取得
   - `malfeasance-search.js` — 条件（ステータス、ファイルパス、日付範囲等）で検索
   - `malfeasance-all.js` — 全件取得（フィルタリングオプション付き）
   - `malfeasance-update.js` — レコード更新（解決ステータス変更等 + スキーマ検証）
   - `malfeasance-delete.js` — レコード削除（復元不可、確認必須）

3. **全スクリプトでのスキーマ検証**
   - 作成・更新時：書き込み前に検証、違反時はエラーで拒否
   - 読み取り・検索時：既存データの整合性チェック、違反時は警告
   - スキーマファイル不在時はエラー終了

4. **README.md 更新**
   - `.claude/scripts/tickets/README.md` に Malfeasance 操作スクリプト群を追記

### 含まないもの

- Malfeasance.json の初回自動作成（→ M1 #179）
- 各コマンドファイル（make/plan/start/review）への統合（→ M3 #181）
- 第一級規則の文面の記述（→ M2 #180）

## Malfeasance.json スキーマ設計

### ルート構造

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "zasso://schemas/malfeasance.json",
  "type": "object",
  "required": ["version", "records"],
  "properties": {
    "version": { "type": "integer", "minimum": 1 },
    "records": {
      "type": "array",
      "items": { "$ref": "#/definitions/record" }
    }
  },
  "definitions": {
    "record": {
      "type": "object",
      "required": ["id", "file", "line", "description", "detected_at", "status"],
      "properties": {
        "id": { "type": "integer", "minimum": 1 },
        "file": { "type": "string", "minLength": 1 },
        "line": { "type": "integer", "minimum": 1 },
        "description": { "type": "string", "minLength": 1 },
        "detected_at": { "type": "string", "format": "date-time" },
        "status": { "type": "string", "enum": ["open", "resolved", "false_positive"] },
        "resolved_at": { "type": "string", "format": "date-time" },
        "resolved_by_ticket": { "type": "integer", "minimum": 1 },
        "note": { "type": "string" }
      }
    }
  }
}
```

### 犯罪レコードフィールド

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `id` | integer | ✅ | 一意の連番、自動採番 |
| `file` | string | ✅ | 犯罪が存在するファイルの相対パス |
| `line` | integer | ✅ | 犯罪コードの開始行番号 |
| `description` | string | ✅ | 犯罪の内容説明（例: "関数 hoge() に [::STUB::] 未付与"） |
| `detected_at` | string(datetime) | ✅ | 検出日時（ISO 8601） |
| `status` | string(enum) | ✅ | `open` / `resolved` / `false_positive` |
| `resolved_at` | string(datetime) | 条件付き | `status=resolved` 時に必須 |
| `resolved_by_ticket` | integer | 任意 | 解決したチケットID |
| `note` | string | 任意 | 備考 |

## スクリプト仕様

### 共通仕様

- 出力形式: 全スクリプトとも JSON を stdout（`{ "success": true, ... }` / `{ "success": false, "error": "..." }`）
- エラー終了時: `process.exit(1)` はせず、`{ success: false, error: "..." }` を出力して正常終了する（既存スクリプトに統一）
- 設定値: `_R` は `$(git rev-parse --show-toplevel)/.claude` で取得
- ファイルパス: `path.join(_R, "commands", "Malfeasance.json")`、スキーマは `path.join(_R, "scripts", "tickets", "malfeasance-schema.json")`
- スキーマ検証: `ajv` の `validate` を使用。`require('ajv')` で読み込み

### malfeasance-create.js

**引数**: argv[2]=file, argv[3]=line, argv[4]=description, argv[5]=note(optional)

**動作**:
1. Malfeasance.json が存在しなければエラー終了
2. 全レコードを読み込み、既存の同一ファイル+同一行の open レコードがあれば重複エラー
3. `id` は既存最大 + 1 を自動採番（空の場合は 1）
4. `detected_at` は現在日時（`new Date().toISOString()`）
5. `status` は `"open"` で固定
6. 新レコードを追加した全データをスキーマ検証
7. 検証通過後、ファイルに書き戻す

### malfeasance-get.js

**引数**: argv[2]=id（数値）

**動作**:
1. ファイル読み込み + スキーマ検証
2. 指定 ID のレコードを検索
3. 存在すれば `{ success: true, record: { ... } }`
4. 存在しなければ `{ success: false, error: "Record not found" }`

### malfeasance-search.js

**引数**: argv[2]=key, argv[3]=value

**対応キー**: `status`, `file`, `id`, `description`（省略時は全フィールド部分一致）

**動作**:
1. `id`: 完全一致検索（数値変換）
2. `status`: 完全一致検索
3. `file`: 部分一致検索（大文字小文字区別なし）
4. `description`: 部分一致検索（大文字小文字区別なし）
5. キー省略時は全フィールドに対して部分一致検索
6. `{ success: true, count: N, records: [...] }`

### malfeasance-all.js

**引数**: argv[2]=filter(optional) — `open` / `resolved` / `false_positive` / 省略時=全件

**動作**:
1. 全レコードを読み取り + スキーマ検証
2. 指定ステータスでフィルタリング
3. `{ success: true, count: N, records: [...] }`

### malfeasance-update.js

**引数**: argv[2]=id, argv[3]=field, argv[4]=value

**更新可能フィールド**: `status`, `resolved_at`, `resolved_by_ticket`, `note`

**動作**:
1. フィールドホワイトリストチェック（`id`, `file`, `line`, `description`, `detected_at` は変更禁止）
2. `status` を `resolved` に変更する場合、`resolved_at` が未設定なら自動設定
3. `resolved_at` 単独設定は禁止（`status` 変更時に自動）
4. 更新後の全データをスキーマ検証
5. `{ success: true, record: { ... } }` — 更新後のレコードを返す

### malfeasance-delete.js

**引数**: argv[2]=id

**動作**:
1. 対象レコードの存在確認
2. 削除前に確認（ユーザーに `y/N` を求める）
3. 削除実行後、全データのスキーマ検証
4. `{ success: true, deleted: { id, file, line } }`

## 依存・関連チケットID

| 関係 | チケット | 説明 |
|------|---------|------|
| 後続 | M1 (#179) | 本チケットのスクリプト群を使って formulate-tickets.md に作成処理を追加 |
| 後続 | M3 (#181) | 本チケットのスクリプト群を make/plan/start/review に統合 |

## 調査結果

### 現状確認（2026-06-21 実装時）

- **ajv の利用可能性**: `node -e "require('ajv')"` → ajv 未インストール。npm パッケージ管理が存在しないため、スキーマ検証はカスタムバリデータ（`validate-malfeasance.js`）で実装。
- **既存スクリプトの依存関係**: 全スクリプトとも Node.js 標準モジュール（`fs`, `path`）のみ使用。npm 依存なし。本チケットのスクリプトもこれに準拠。
- **テストフレームワーク**: 既存のテスト基盤なし。`tests/malfeasance/test-malfeasance.js` を新規作成（`child_process.spawnSync` で子プロセス実行＋出力 JSON 検証）。
- **共通ユーティリティ**: `scripts/lib/tickets.js` + `ticket-config.js` が共有ライブラリとして存在。本チケットでは新規に `scripts/lib/malfeasance-utils.js` を作成。
- **パス構造**: `__dirname` 解決で `.claude/scripts/lib/` から `.claude/` への参照には 2 階層（`../..`）必要。

## Test Plan

### ユニットテスト計画

スクリプトは JSON 入出力のため、テストは以下を網羅する：

1. **malfeasance-schema.json 自体の検証**
   - 有効な JSON Schema であること
   - 全必須フィールドが定義されていること
   - enum 値が正しいこと

2. **各操作スクリプトの単体テスト**
   - `tests/malfeasance/` 配下にテストスクリプトを作成
   - テスト用の一時 Malfeasance.json とスキーマを使用
   - 正常系: 各操作の正常完了パターン
   - 異常系: 存在しない ID、不正な引数、スキーマ違反データ
   - 境界値: 空配列、最大 ID、特殊文字を含む description

3. **スキーマ検証テスト**
   - 不正なステータス値 → 拒否
   - 必須フィールド欠落 → 拒否
   - `resolved_at` なしの `status=resolved` → 拒否
   - 不正な日付形式 → 拒否

### ユニットテスト不可能な項目（例外）

なし（全操作は JSON 入出力のみで完結し、外部依存がないため全項目をユニットテスト可能）。

## 受け入れ基準 (Acceptance Criteria)

1. [ ] `malfeasance-schema.json` が JSON Schema draft-07 に準拠している
2. [ ] 6 操作全てのスクリプトが存在し、適切な引数なしでエラーメッセージを表示する
3. [ ] 各スクリプトがスキーマ検証を実施し、違反時はエラー終了する
4. [ ] create → get → search → all → update → delete の一連の流れが正しく動作する
5. [ ] 既存の `README.md` に Malfeasance 操作スクリプト群が追記されている
6. [ ] 全スクリプトが `{ success: true/false, ... }` 形式の JSON を出力する
7. [ ] 不正なスキーマファイルへのパスでエラー終了する

## Boy Scout Rule — 翻訳可能性計画

- 既存のチケットスクリプト（create-ticket.js 等）に翻訳可能性を損なう命名があれば、関数名の改善を行う
- スクリプト内のハードコードされたパスは設定定数に抽出する
