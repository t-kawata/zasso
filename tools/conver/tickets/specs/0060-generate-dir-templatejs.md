---
ticket_id: 60
title: generate-dir-template.js — テンプレートファイル生成
slug: generate-dir-templatejs
status: draft
created_at: 2026-07-07
updated_at: 2026-07-07
---
# generate-dir-template.js — テンプレートファイル生成

## Summary

Dirs-Tree.json に基づき、実際のディレクトリとスタブファイルを生成する `generate-dir-template.js` を実装する。ディスカバリ（dry-run）→確認プロンプト→作成（第2パス）の3段階制御を持つ。`--dry-run` による予告表示、`--force` による確認スキップ、`--lang` による言語別出力に対応する。

## Background

RFC-BOUNDIFY.md §4.4「generate-dir-template.js — 実ディレクトリ/ファイル生成スクリプト」に基づく。

Boundify パイプラインの Step 4（完成確認）および Step 5（実体生成）で使用される。P17-1（純粋関数群）→P18-1（ディレクトリツリー生成）→P19-1（スキーマ検証）で構築された Dirs-Tree.json を入力として受け取り、AI が設計したディレクトリ構成を物理的なファイルシステムに出力する。

- Step 4: `--dry-run` で生成予定一覧を表示（ユーザー確認用）
- Step 5: 実際にディレクトリとファイルを作成

## Scope

1. `generate-dir-template.js` スクリプトの新規作成（配置先: `.claude/scripts/rfc-graph/`）
2. CLI 引数パース: `--dirs-tree=<path> --root-dir=<path> --lang=<lang> [--dry-run] [--force]`
3. 第1パス: `discover(tree, rootDir)` — Dirs-Tree.json のツリーを走査して生成予定アイテムの一覧を作成（ファイル作成なし）
4. 確認プロンプト（TTY のみ）: 予定アイテム一覧を表示し続行確認（`--force` でスキップ）
5. 第2パス: `create(items)` — 実際にディレクトリとファイルを作成（既存ファイルは `--force` なしでエラー）
6. 出力契約: 正常時 `{"ok":true, "created":[...]}`（終了コード0）、異常時 `{"ok":false, "error":"..."}`（終了コード1）
7. テストファイルの作成（generate-dir-template.test.js）

## Non-scope

- 既存ファイル（crud.js, verify.js, query.js 等）への一切の変更 — 唯一の例外は update-step-status.js の `--status=` フラグ追加のみ（これは P21-2 のスコープ）
- Dirs-Tree.json の生成や検証（P17-1, P18-1, P19-1 のスコープ）
- スラッシュコマンド定義（P21-2 のスコープ）
- メインスクリプト `boundify-graph-to-dirs.js` の統合（P21-1 のスコープ）
- `readline` モジュールや `process.stdin` のモック（TTY 依存のため unit test 対象外）

## Investigation

RFC-BOUNDIFY.md §4.4 より、以下の完全な実装仕様を確認した。

### 入力データ構造（Dirs-Tree.json）

```json
{
  "trees": {
    "rust": { "name": "...", "type": "directory", "children": [
      { "name": "mod.rs", "type": "file", "declarationStub": "// ..." },
      { "name": "subdir", "type": "directory", "children": [...] }
    ]},
    "go": { ... },
    "typescript": { ... }
  }
}
```

- `type`: `"directory"` または `"file"`
- `declarationStub`: ファイルに書き込む内容（省略時は空文字）
- `children`: ディレクトリの子ノード配列（file の場合は持たない）

### 既存実装パターン

- **boundify-tree.js** (P18-1): 6関数でディレクトリツリー生成。`require('path')` + CommonJS。
- **validate-dirs-tree-schema.js** (P19-1): 6検証項目。`process.exit(1)` + stderr 3段エラー。
- 全スクリプト: `#!/usr/bin/env node` + `'use strict'` + 関数ごとに JSDoc + `module.exports = { ... }`
- テスト: `node:test` + `assert/strict` + `describe/it` パターン

### 出力契約

```json
// dry-run 正常
{"ok":true, "dryRun":true, "language":"rust", "created":[{"type":"directory","path":"..."},{"type":"file","path":"..."}], "total":5}

// 実作成 正常
{"ok":true, "dryRun":false, "language":"rust", "created":[{"type":"directory","path":"...", "action":"created"}, {"type":"file","path":"...", "action":"created"}], "total":5}

// 既存ファイル上書き
{"ok":true, "dryRun":false, "language":"rust", "created":[{"type":"file","path":"...", "action":"overwritten"}], "total":1}

// キャンセル
{"ok":false, "cancelled":true, "message":"ユーザーによりキャンセルされました"}

// エラー
{"ok":false, "error":"ファイルが既に存在します: path/to/file.rs\n原因: 出力先に同名ファイルがある\n対応: --force フラグを指定して上書きするか、既存ファイルを退避してください"}
```

## Test Plan

### ユニットテスト計画

`generate-dir-template.test.js` に以下のテストを実装する。

テスト対象関数（RFC §4.4 の擬似実装を完全にユニットテスト化）：

| 関数 | テストケース |
|------|-------------|
| `main(testArgs)` | 正常系: --dry-run 出力フォーマット検証<br>正常系: 確認Y → 作成成功<br>異常系: 確認N → cancelled<br>異常系: 引数不足 → exit code 1<br>異常系: 未サポート言語 → exit code 1<br>異常系: 存在しない Dirs-Tree.json → exit code 1 |
| `discover(tree, rootDir)` | 正常系: ディレクトリ専用ツリー<br>正常系: ファイル専用ツリー<br>正常系: 混在ツリー（ネスト）<br>正常系: declarationStub あり/なし<br>正常系: discover がファイル作成しない<br>異常系: 空ツリー → created 空配列 |
| 第2パス作成 | 正常系: 新規ファイル作成<br>正常系: 新規ディレクトリ作成<br>異常系: 既存ファイル + --force なし → error<br>正常系: 既存ファイル + --force → overwritten |

モック方針:
- `fs.readFileSync`: Dirs-Tree.json の読み込みをモック
- `fs.writeFileSync`: ファイル作成を spied
- `fs.mkdirSync`: ディレクトリ作成を spied
- `fs.existsSync`: ファイル存在確認をモック
- `process.exit`: スパイしてスローに変換
- `readline.question`: 確認プロンプトの応答をモック
- `console.log` / `console.error`: 出力確認用スパイ

カバレッジ目標: 85%（`main()` の TTY 分岐はモック制御でカバー）

### ユニットテスト不可能な項目（例外）

- 実 TTY での readline 確認プロンプトの挙動: `--force` フラグでバイパス可能なため、`--force` パスでカバー。TTY 実機検証は E2E で実施。

## Boy Scout Rule — 翻訳可能性計画

本チケットで新規作成する `generate-dir-template.js` に対して、以下の翻訳可能性を確保する：

1. **関数名は動詞句**: `discover()`, `main()` でなく `runDiscoveryPhase()`, `runCreationPhase()` など処理内容を語る命名にする
2. **一関数一責務**: discover（走査のみ）、create（作成のみ）、readline確認プロンプト（確認のみ）に独立させる
3. **定数化**: サポート言語リスト、エラーメッセージテンプレートは const 定義
4. **コメントは「なぜ」**: 3段階プロセスの設計意図（表示→確認→実行による安全な操作）をコメントで説明
5. **エラー握りつぶし禁止**: 全エラーを catch して出力契約に従った JSON を返す

## Acceptance Criteria

- [ ] `generate-dir-template.js` が新規作成され、CLI 引数で動作する
- [ ] `--dry-run` でファイル作成なしに生成予定一覧を JSON 出力する
- [ ] 確認プロンプト（TTY）/ `--force` スキップの両方で動作する
- [ ] 第2パスで実際のディレクトリとファイルを作成する
- [ ] 既存ファイルに `--force` なしでエラーを出力する
- [ ] 3言語（rust/go/typescript）すべてで動作する
- [ ] 不足引数・未サポート言語で適切なエラーを出力する
- [ ] ユニットテストが全ケース PASS する（カバレッジ 85% 以上）
- [ ] 既存テスト（P17-1, P18-1, P19-1）に回帰がない
- [ ] `[::STUB::]` マーカー未付与の不完全実装がない

## Notes

### 依存関係

- P17-1（先行: Dirs-Tree.json スキーマ定義）
- P18-1（先行: ディレクトリツリー生成 — Dirs-Tree.json 構造を定義）
- P19-1（先行: Dirs-Tree.json スキーマ検証）
- P21-1（後続: boundify-graph-to-dirs.js メインスクリプト統合 — 本スクリプトを呼び出す）
- P21-2（後続: update-step-status.js フラグ拡張 + スラッシュコマンド定義）

### 配置先

- スクリプト本体: `.claude/scripts/rfc-graph/generate-dir-template.js`
- テストファイル: `.claude/scripts/rfc-graph/tests/generate-dir-template.test.js`

### 作業制約

- tools/conver/.claude/ 内に限定して作業
- 既存ファイル（crud.js, verify.js, boundify-tree.js, validate-dirs-tree-schema.js 等）への変更禁止
- P21-2 の update-step-status.js 改修（--status= フラグ）は本チケットのスコープ外

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testVerification[]`, `testExceptions[]`, `notes` フィールド
- **実装サマリ**: `changes[]`, `notes` フィールド
- **レビュー報告書**: `instrumentation`, `notes`, `rfcDiscrepancies[]` フィールド
