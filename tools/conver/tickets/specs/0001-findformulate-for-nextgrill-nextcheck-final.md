---
ticket_id: 1
title: 開発パイプライン拡張 — find/formulate-for-next/grill-next/check-final 追加
slug: findformulate-for-nextgrill-nextcheck-final
status: draft
created_at: 2026-06-25
updated_at: 2026-06-25
---

# 開発パイプライン拡張 — find/formulate-for-next/grill-next/check-final 追加

## Summary

二層ループ開発パイプラインに「外側ループ」の4つのスラッシュコマンドと、それを支える OMISSIONS JSON スキーマ・バリデータ・スクリプト群を追加する。

現状のパイプラインは内側ループ（make→plan→start→review→resolve→find）のみ完備しており、外側ループ（grill→formulate→[内側]→find→formulate-for-next→grill(次)）のうち find を除く formulate-for-next、grill-next、check-final が未実装である。また find が出力する OMISSIONS JSON のスキーマ・バリデータ・番号採番スクリプトも存在しない。

## Background

二層ループ開発パイプラインの全体構造：

- **外側ループ**: RFC 設計 → チケット分解 → [内側ループ] → 漏れ発見 → チケット拡張 → 次RFC のサイクル
- **内側ループ**: ACP クライアントが自動実行する make→plan→start→review→resolve→find

現在、内側ループのコマンド群（7ファイル）と formulate、grill のコマンド（2ファイル）は実装済みだが、外側ループを循環させるために必要な以下のコマンドが欠落している：

1. `/find-omissions-for-next-rfc` — コマンドファイルのみ存在せず（find は内側ループでACP実行されるが、その omission スキーマが未定義）
2. `/formulate-tickets-for-next` — 未作成
3. `/grill-me-for-next-rfc-ja` — 未作成
4. `/check-final` — 未作成
5. OMISSIONS JSON スキーマ — 未作成
6. OMISSIONS バリデータ — 未作成
7. OMISSIONS 番号採番スクリプト — 未作成

これらを実装し、二層ループが循環可能な状態にする。

## Scope

### 新規作成ファイル（10ファイル）

| # | ファイルパス | 種別 | 説明 |
|---|-------------|------|------|
| 1 | `.claude/commands/find-omissions-for-next-rfc.md` | command | find コマンド定義（ACP自動実行） |
| 2 | `.claude/commands/formulate-tickets-for-next.md` | command | formulate-for-next コマンド定義（人間実行） |
| 3 | `.claude/commands/grill-me-for-next-rfc-ja.md` | command | grill-next コマンド定義（人間実行） |
| 4 | `.claude/commands/check-final.md` | command | check-final コマンド定義（人間実行） |
| 5 | `.claude/scripts/tickets/omissions-schema.json` | schema | OMISSIONS JSON Schema（draft-07） |
| 6 | `.claude/scripts/lib/validate-omissions.js` | script | OMISSIONS スキーマ検証（手書き、ajv非依存） |
| 7 | `.claude/scripts/tickets/next-omissions-number.js` | script | 既存 OMISSIONS から次番号を採番（001〜） |
| 8 | `.claude/scripts/tickets/list-omissions.js` | script | OMISSIONS 一覧表示 |

### 既存ファイルの変更（1ファイル）

| # | ファイルパス | 変更内容 |
|---|-------------|----------|
| 9 | `test.sh` | 新スクリプトのテスト追加 |

### スクリプト流用（既存、変更不要）

| スクリプト | 流用元コマンド | 流用先コマンド |
|-----------|---------------|---------------|
| `grill-me-for-rfc/init.js` | `/grill-me-for-rfc` | `/grill-me-for-next-rfc-ja`（OMISSIONS パスを research-path に） |
| `grill-me-for-rfc/update-tree.js` | 同上 | 同上 |
| `grill-me-for-rfc/update-status.js` | 同上 | 同上 |
| `grill-me-for-rfc/check-all-schema.js` | 同上 | 同上 |
| `grill-me-for-rfc/session-status.js` | 同上 | 同上 |
| `grill-me-for-rfc/generate-checklist.js` | 同上 | 同上 |
| `grill-me-for-rfc/list-files.js` | 同上 | 同上 |
| `grill-me-for-rfc/tree-query.js` | 同上 | 同上 |
| `grill-me-for-rfc/validate-question-format.js` | 同上 | 同上 |
| `add-phase.js`, `add-ticket.js`, `bulk-add-tickets.js` | `/formulate-tickets` | `/formulate-tickets-for-next` |

## Non-scope

- 既存のコマンドファイル（gril/formulate/make/plan/start/review/resolve）の内容変更
- 既存の ticket CRUD スクリプトの変更
- 既存の grill スクリプトの変更
- ACP クライアントそのものの実装
- READMD.md の更新（既に別途完了済み）

## Investigation

### 既存コマンドファイルのパターン分析

コマンドファイルは `.claude/commands/` 配下に7ファイル存在する。ファイルサイズの分布：

| ファイル | 行数 | 特性 |
|---------|------|------|
| resolve-ticket.md | 124 | 最小。シンプルなワークフロー |
| plan-ticket.md | 169 | 中規模 |
| make-ticket.md | 211 | 分岐（新規/深掘り）あり |
| review-ticket.md | 242 | レビュー手順が詳細 |
| start-ticket.md | 244 | 実装手順が詳細 |
| grill-me-for-rfc-ja.md | 289 | フロントマター + 概要 + プロセス + スクリプト一覧 |
| formulate-tickets.md | 299 | 最大。スキーマ定義とCRUD操作が詳細 |

全コマンドに共通する構造：
1. YAML frontmatter（`description`）
2. 第一級規則の注意喚起
3. 役割説明
4. 引数の解釈
5. 使用スクリプト一覧（テーブル）
6. ワークフロー（Step 形式）
7. 各スクリプト呼び出しの Bash コードブロック

### 共通パターン：JSON stdout プロトコル

全スクリプトは JSON を stdout に出力する。成功時：
```json
{"success":true, ...}
```
エラー時：
```json
{"success":false, "error":"..."}
```

### 既存のスキーマ検証パターン

`lib/validate-tickets.js`（89行）は手書きバリデータ。以下のパターン：
- `errors` 配列に収集
- `{valid: false, errors: [...]}` または `{valid: true}` を返す
- モジュールとしても CLI としても動作
- `ajv` 等の外部依存なし

### スクリプトのモジュール方式

- ticket 系スクリプト（`scripts/tickets/`）：**CommonJS**（`require`/`module.exports`）
- grill 系スクリプト（`scripts/grill-me-for-rfc/`）：**ESM**（`import`/`export`）

新規スクリプトは ticket 系に追加するため CommonJS に統一する。

### test.sh の構造

`test.sh`（存在確認：34行のテスト関数定義 + 各テスト）：
- `pass`/`fail` 関数
- `assert_json_field` 関数
- `TMPDIR` で一時作業
- テスト実行後に `exit $FAILED`

### Tickets.json の現状

本チケット作成時に以下を作成済み：
- `Tickets.json`（スケルトン、PX-1 に本チケット登録）
- `tickets/specs/0001-*.md`（本 spec ファイル）

### OMISSIONS ファイル命名規則

`OMISSIONS-<0埋め3桁>.json`（例: `OMISSIONS-001.json`）

### 該当ファイルの行数

参照すべき既存実装：
- `lib/validate-tickets.js`（89行）— バリデータのテンプレート
- `tickets/tickets-schema.json`（60行）— スキーマ定義のテンプレート
- `tickets/all-tickets.js` — 一覧表示のテンプレート（list-omissions.js の参考）
- `.claude/commands/resolve-ticket.md`（124行）— 最小コマンドのテンプレート

## Test Plan

### ユニットテスト計画

新規スクリプト3本に対してテストを追加する：

#### next-omissions-number.js のテスト

| ケース | 内容 |
|--------|------|
| 正常系 | 空ディレクトリ → `{"success":true,"nextNumber":1}` |
| 正常系 | OMISSIONS-001.json のみ → `{"success":true,"nextNumber":2}` |
| 正常系 | OMISSIONS-001.json, OMISSIONS-003.json → `{"success":true,"nextNumber":4}` |
| 異常系 | 存在しないディレクトリ → `{"success":false,"error":"..."}` |

#### validate-omissions.js のテスト

| ケース | 内容 |
|--------|------|
| 正常系 | 完全な OMISSIONS JSON → `{valid:true}` |
| 異常系 | parentRfcPath 欠落 → エラー検出 |
| 異常系 | generatedAt 不正形式 → エラー検出 |
| 異常系 | omissions 配列要素の id が O-XXX 形式違反 → エラー検出 |
| 異常系 | omission.type が enum 外 → エラー検出 |
| 異常系 | omission.description 空文字 → エラー検出 |

#### list-omissions.js のテスト

| ケース | 内容 |
|--------|------|
| 正常系 | 1件の omission → チェックリスト表示 |

### test.sh への追加

`test.sh` の末尾に新規テストセクションを追加。既存のテスト関数に倣い、以下の構造：

```bash
# ============================================================
# OMISSIONS スクリプトテスト
# ============================================================
test_next_omissions_number() {
  local tmpdir="$1"
  # 空ディレクトリ
  local result=$(node .claude/scripts/tickets/next-omissions-number.js "$tmpdir")
  assert_json_field "$result" "success" "true"
  assert_json_field "$result" "nextNumber" "1"
  # 既存ファイルあり
  echo '{}' > "$tmpdir/OMISSIONS-001.json"
  ...
}
```

### ユニットテスト不可能な項目（例外）

- コマンドファイル（`.md`）の動作確認は Claude Code のスラッシュコマンド実行が必要なため、スクリプトによる自動テスト不可。手動で各コマンドを実行して検証する。
- grill-next の既存スクリプト流用部分は、流用元のテストが既に test.sh に存在することを確認する。

## ファイル別実装仕様

### 1. `.claude/scripts/tickets/omissions-schema.json`

JSON Schema draft-07。以下の構造：

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "zasso://schemas/omissions.json",
  "type": "object",
  "required": ["parentRfcPath", "generatedAt", "omissions"],
  "properties": {
    "parentRfcPath": { "type": "string", "minLength": 1 },
    "parentRfcTitle": { "type": "string" },
    "generatedAt": { "type": "string", "pattern": "^\d{4}-\d{2}-\d{2}$" },
    "summary": { "type": "string" },
    "omissions": { "type": "array", "items": { "$ref": "#/definitions/omission" } }
  },
  "definitions": {
    "omission": {
      "type": "object",
      "required": ["id", "type", "description"],
      "properties": {
        "id": { "type": "string", "pattern": "^O-\d{3}$" },
        "type": { "type": "string", "enum": [
          "missing_implementation", "incomplete_implementation",
          "design_deviation", "bug", "stub_remaining",
          "test_missing", "inconsistency"
        ] },
        "severity": { "type": "string", "enum": ["critical", "high", "medium", "low"] },
        "rfcSection": { "type": "string" },
        "description": { "type": "string", "minLength": 1 },
        "details": { "type": "string" },
        "affectedFiles": { "type": "array", "items": { "type": "string" } },
        "suggestedResolution": { "type": "string" },
        "resolvedInNextRfc": { "type": "boolean" }
      }
    }
  }
}
```

### 2. `.claude/scripts/lib/validate-omissions.js`

`validate-tickets.js` と同パターンの手書きバリデータ。CommonJS。

- 引数なしCLI → stdin から JSON 読み取り
- 引数ありCLI → ファイルパスとして読み取り
- `require` された場合は `exports.validate(data)` としても利用可能

検証項目：
- ルートの必須フィールド（parentRfcPath, generatedAt, omissions）
- generatedAt の YYYY-MM-DD 形式
- omissions 配列の各要素
  - id: O-XXX 形式
  - type: enum 値のいずれか
  - description: 空文字禁止
  - severity: 指定されていれば enum 値

### 3. `.claude/scripts/tickets/next-omissions-number.js`

引数：ディレクトリパス

既存の `OMISSIONS-<3桁>.json` ファイルを走査し、最大番号+1 を返す。1件もなければ 1 を返す。

出力：
```json
{"success":true,"nextNumber":1}
```

参考実装：`all-tickets.js` のファイル走査パターン。

### 4. `.claude/scripts/tickets/list-omissions.js`

引数：OMISSIONS JSON ファイルパス

チェックリスト形式で表示：

```
O-001 [missing_implementation] §3.2: Xxxトレイトが未実装
O-002 [bug] §5.1: Yyy関数のエッジケースでパニック
```

参考実装：`list-phases-and-tickets.js` の出力パターン。

### 5. `.claude/commands/find-omissions-for-next-rfc.md`

ACP クライアントが自動実行する find コマンド。最小構成（resolve-ticket.md 相当の124行程度）。

構造（既存の resolve-ticket.md をテンプレートに）：
- YAML frontmatter（description）
- 第一級規則注意喚起
- 役割説明
- 引数の解釈（RFCファイルパス必須）
- 使用スクリプト一覧（omissions-schema.json, validate-omissions.js, next-omissions-number.js, list-omissions.js）
- ワークフロー（6ステップ程度）

### 6. `.claude/commands/formulate-tickets-for-next.md`

`formulate-tickets.md` をベースに「拡張・追加」に特化。

`formulate-tickets` との差異：
- 入力：RFC ではなく OMISSIONS-XXX.json
- 既存の Tickets.json を上書きせず追加のみ
- 各チケットに親参照（parentOmissionId）を付与
- 既存フェーズの確認 → 不足フェーズのみ追加

### 7. `.claude/commands/grill-me-for-next-rfc-ja.md`

`grill-me-for-rfc-ja.md` をベースに「次RFC用」に特化。

既存 grill との差異：
- 引数：OMISSIONSパス + NEXT_RFCパス
- Step 0 で OMISSIONS の parentRfcPath を読み取り親RFCを把握
- 既存 grill スクリプトを init.js に OMISSIONS パスを research-path として渡して流用
- NEXT_RFC のフロントマターに親RFCパスとOMISSIONSパスを記述

### 8. `.claude/commands/check-final.md`

終了条件チェックゲート。

- 引数：最上位親RFCパス
- 3条件をチェックし PASS/FAIL を返す
- 条件1：Tickets.json 全チケット reviewed 確認
- 条件2：最新 OMISSIONS の軽微性判断
- 条件3：全RFC/全OMISSIONS 走査

### 9. test.sh（変更）

新規スクリプト3本のテストを追加。既存のテストパターンに従う。

## Boy Scout Rule — 翻訳可能性計画

本チケットで新規作成するコードについて：

- スクリプトの関数名は動詞句（`validateOmissions`, `findNextNumber`, `listOmissions`）
- 変数名はドメイン概念（`omissionsDir`, `parentRfcPath`, `omissionType`）
- 一関数一責務を徹底（バリデータ、番号採番、一覧表示は別ファイル）
- ハードコード値は名前付き定数（`OMISSION_ID_RE = /^O-\d{3}$/` 等）
- エラーは JSON 形式で返し、握りつぶさない

既存コードの翻訳可能性問題はスコープ外（既存ファイルは変更しない）。

## Acceptance Criteria

- [ ] `omissions-schema.json` が正しい JSON Schema draft-07 形式である
- [ ] `validate-omissions.js` が正常な OMISSIONS JSON を `valid: true` と判定する
- [ ] `validate-omissions.js` が異常な OMISSIONS JSON をエラー検出する
- [ ] `next-omissions-number.js` が空ディレクトリで 1 を返す
- [ ] `next-omissions-number.js` が既存ファイルから正しく次番号を採番する
- [ ] `list-omissions.js` がチェックリスト形式で表示する
- [ ] 4つのコマンドファイルが既存のコマンドファイルと同じ構造パターンに従っている
- [ ] `test.sh` の新規テストが全て PASS する
- [ ] 既存テストに影響がない（`test.sh` 全体が PASS する）
- [ ] `formulate-tickets-for-next` が既存 Tickets.json を上書きせず追加のみ行うことがコマンド定義に明記されている
- [ ] `grill-me-for-next-rfc-ja` の次RFCに親RFCパスとOMISSIONSパスの記述が明記されている
- [ ] `check-final` が3条件のチェック項目を明記している

## Notes

- このチケットは PX-1（独立フェーズ）として登録。他のチケットとの依存関係なし。
- 実装順序：スキーマ → バリデータ → 番号採番 → 一覧表示 → find コマンド → formulate-for-next コマンド → grill-next コマンド → check-final コマンド → test.sh
- grill-next の既存スクリプト流用は、既存スクリプトの --help 的な動作確認で十分。スクリプト本体の修正は不要。
- 各コマンドファイル作成後は、実際に Claude Code 上で `/formulate-tickets-for-next` 等を手動実行して動作確認が必要。
