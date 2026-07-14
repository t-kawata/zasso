---
ticket_id: 47
title: update-step-status.js — GRAPHIFY-Status.json管理（5サブコマンド）
slug: update-step-statusjs-graphify-statusjson
status: draft
created_at: 2026-07-06
updated_at: 2026-07-06
ticket_key: P13-1
reference: RFC-GRAPHIFY.md (§3.5, §4.5)
---
# update-step-status.js — GRAPHIFY-Status.json管理（5サブコマンド）

## Summary

`/graphify-rfc` コマンドの進行状態を管理する GRAPHIFY-Status.json の読み書きを行うスクリプト `update-step-status.js` を実装する。5つのサブコマンド（start-step / end-step / fail-step / reset-to-step / status）と、ファイル書き込みのアトミック性保証（atomicWrite）を提供する。

## Background

graphify-rfc は5つのStepで構成され、各Stepの開始/終了/エラー時に `update-step-status.js` が `<basename>-GRAPHIFY-Status.json` ファイルを更新する。このファイルがないとどのStepまで進行したかが追跡不能になるため、すべてのStep制御の基盤となるスクリプトである。

**GRAPHIFY-Status.json スキーマ（RFC-GRAPHIFY.md §3.5）**:

```json
{
  "sourceFile": "/path/to/RFC-GRAPHIFY.md",
  "graphFile": "/path/to/RFC-GRAPHIFY-GRAPH.json",
  "currentStep": 1,
  "steps": {
    "1": "pending",
    "2": "pending",
    "3": "pending",
    "4": "pending",
    "5": "pending"
  }
}
```

各Stepの status は4値：`pending`（未着手） / `running`（実行中） / `done`（完了） / `error`（異常終了）。

**5サブコマンド（RFC-GRAPHIFY.md §3.5 および §4.5 に詳細）**:

| サブコマンド | 動作 | currentStepへの影響 |
|-------------|------|-------------------|
| `start-step <N>` | steps[N] = 'running' | currentStep = N |
| `end-step <N>` | steps[N] = 'done' | currentStep = N + 1 |
| `fail-step <N>` | steps[N] = 'error' | 変更なし |
| `reset-to-step <N>` | Nより後の全Stepをpending | currentStep = N |
| `status` | 現在のJSONをstdoutに出力 | なし |

## Scope

### 作成するファイル

1. **`.claude/scripts/rfc-graph/update-step-status.js`** — メインスクリプト
   - CLI引数パース（`--graphify-status=<path>` + サブコマンド + Step番号）
   - 5サブコマンドの分岐処理
   - `atomicWrite()` — 一時ファイル + rename のアトミック書込関数
   - エラー時の3段テンプレート出力（RFC-GRAPHIFY.md §3.8）
   - `--help` オプションによる使用方法表示

2. **`tests/rfc-graph/update-step-status.test.cjs`** — テストファイル
   - 全5サブコマンドの正常系テスト
   - 異常系テスト（未知のサブコマンド / 存在しないStep番号）
   - 境界値テスト（Step 0 / Step 6 / 負の値）
   - atomicWrite のアトミック性テスト

### 5サブコマンドの動作詳細

**start-step <N>**:
- `status.steps[N]` を `'running'` に設定
- `status.currentStep` を `N` に設定
- 該当Stepが既に `'done'` または `'error'` の場合は上書きする（再実行対応）

**end-step <N>**:
- `status.steps[N]` を `'done'` に設定
- `status.currentStep` を `N + 1` に設定（次のStepへ進む）
- Step 5 の完了時は `currentStep` が 6 になる（全Step完了を示す）

**fail-step <N>**:
- `status.steps[N]` を `'error'` に設定
- `status.currentStep` は変更しない（現在位置を維持して再開可能にする）

**reset-to-step <N>**:
- N より大きい全Step（N+1 〜 5）を `'pending'` に戻す
- N 自身のステータスは変更しない（N に復帰して再実行）
- `status.currentStep` を `N` に設定

**status**:
- GRAPHIFY-Status.json の内容を `JSON.stringify(result, null, 2)` で整形して stdout に出力
- 終了コード 0 で終了

### atomicWrite 関数

全書き込み操作は以下の手順でアトミック性を保証する：

```javascript
const tmpPath = targetPath + '.tmp.' + process.pid;
fs.writeFileSync(tmpPath, data, 'utf8');
fs.renameSync(tmpPath, targetPath); // OSレベルのアトミック置換
```

書き込み途中のプロセス異常終了でも、元ファイルが破損することはない。

### 使用例（graphify-rfc.md からの呼び出し）

```bash
# Step 1 開始
node .claude/scripts/rfc-graph/update-step-status.js \
  --graphify-status="$(dirname "$1")/$(basename "$1" .md)-GRAPHIFY-Status.json" \
  start-step 1
```

## Non-scope

- `crud.js` の実装（P13-2）— 本チケットでは扱わない
- `verify.js` の実装（P14-1）— 本チケットでは扱わない
- `embed-markers.js` の実装（P14-1）— 本チケットでは扱わない
- `query.js` の実装（P15-1）— 本チケットでは扱わない
- JSON Schema の定義や検証（P12-1 完了済み）— 本チケットでは扱わない
- GRAPHIFY-Status.json 自体の JSON Schema 定義 — 本チケットではスキーマの簡易構造チェックのみ実装
- `graphify-rfc.md` スラッシュコマンドの実装（P16-1）— 本チケットでは扱わない
- `load-rfc-graph.js` / `dump-ticket-graph-commands.js` の実装（P16-2以降）— 本チケットでは扱わない
- 既存の `conver.js` 関連ファイル（src/ / dist/ / node_modules/）— 一切変更しない

## Investigation

### 設計根拠（RFC-GRAPHIFY.md からの抜粋）

**RFC §3.5 GRAPHIFY-Status.json スキーマ**（L202-L238）:
- JSON 構造は sourceFile / graphFile / currentStep / steps の4フィールド
- steps は文字列キー "1"〜"5" のオブジェクト、値は "pending" | "running" | "done" | "error"
- 5サブコマンドの動作詳細は L221-L238 で定義

**RFC §3.8 エラー処理プロトコル**（L296-L328）:
- エラー時は終了コード 1 で終了
- 3段テンプレート（[ERROR]何が起きたか / 原因 / 対応）を stderr に出力
- ファイル書き込みは atomicWrite（一時ファイル + rename）でアトミック性保証

**RFC §4.5 update-step-status.js 実装詳細**（L581-L626）:
- 実装コードの具体例が記載されている
- デフォルトの switch-case で unknown subcommand をエラー終了
- atomicWrite() 呼び出しで最終書き込み

### 既存コード調査

**P12-1（完了済み）**:
- `validate.js` に `validateAgainstSchema()` が実装済み
- 3つのJSON Schema（node.schema.json / edge.schema.json / graph.schema.json）が完備
- テスト 57件完了

**既存のスクリプトパターン**:
- `.claude/scripts/` 配下の全スクリプトは CommonJS（require/module.exports）
- エラー時は stderr に日本語3段テンプレートで出力する統一プロトコル
- 全てのファイル出力は atomicWrite パターンを採用

### 依存関係

| 外部依存 | バージョン | 用途 |
|---------|-----------|------|
| `fs` | Node.js 標準 | ファイル読み書き（atomicWrite） |
| `path` | Node.js 標準 | パス解決 |
| `process` | Node.js 標準 | pid取得、exit制御、argvパース |

新しい npm パッケージは一切不要。Node.js 組み込みモジュールのみで完結する。

## Test Plan

### ユニットテスト計画

**テストファイル**: `tests/rfc-graph/update-step-status.test.cjs`

テストフレームワーク: Node.js 標準の `node:test` + `node:assert`（既存 validate.test.cjs と統一）

**正常系（7ケース）**:

| # | テストケース | 内容 |
|---|-------------|------|
| 1 | start-step 1 | steps["1"]=running, currentStep=1 |
| 2 | end-step 1 | steps["1"]=done, currentStep=2 |
| 3 | fail-step 2 | steps["2"]=error, currentStep 不変 |
| 4 | reset-to-step 2 | steps["3"]〜steps["5"]=pending, currentStep=2 |
| 5 | status | JSON整形出力 |
| 6 | start-step 5（最終Step） | steps["5"]=running, currentStep=5 |
| 7 | end-step 5（全完了） | steps["5"]=done, currentStep=6 |

**異常系（5ケース）**:

| # | テストケース | 内容 |
|---|-------------|------|
| 8 | 未知のサブコマンド | エラー終了 + 3段テンプレート |
| 9 | Step 0（範囲未満） | エラー終了 |
| 10 | Step 6（範囲超過） | エラー終了 |
| 11 | 負のStep番号 | エラー終了 |
| 12 | Step番号なし | エラー終了（argv不足） |

**atomicWrite テスト（3ケース）**:

| # | テストケース | 内容 |
|---|-------------|------|
| 13 | 正常書き込み | 一時ファイル作成→rename確認 |
| 14 | 書き込み後の中間ファイル削除確認 | .tmp.pid ファイルが残っていない |
| 15 | 大きなJSONデータの書き込み | 1000行以上のデータでも正常動作 |

**モック**: テストは一時ディレクトリを作成して実際のファイルI/Oを行う（fs モック不要）。

**カバレッジ目標**: 90%以上（クリティカルパス — 全5サブコマンドが対象）。

### ユニットテスト不可能な項目（例外）

なし。全動作は一時ディレクトリ上のファイルI/Oでテスト可能。

## Boy Scout Rule — 翻訳可能性計画

### 関数設計方針

本スクリプトは新規作成のため、以下の方針で翻訳可能性を確保する：

1. **関数名は動詞句**:
   - `parseArguments()` — 引数をパースする
   - `executeStartStep()` — start-step を実行する
   - `executeEndStep()` — end-step を実行する
   - `executeFailStep()` — fail-step を実行する
   - `executeResetToStep()` — reset-to-step を実行する
   - `executeStatus()` — status を出力する
   - `atomicWrite()` — アトミック書き込みを実行する
   - `validateStepNumber()` — Step番号を検証する

2. **一関数一責務**: サブコマンドごとに関数を分割し、switch-case はディスパッチのみ

3. **ハードコード値の定数化**:
   - `MIN_STEP = 1`, `MAX_STEP = 5`
   - `ALLOWED_SUBCOMMANDS = ['start-step', 'end-step', 'fail-step', 'reset-to-step', 'status']`
   - `STATUS_PENDING = 'pending'`, `STATUS_RUNNING = 'running'`, `STATUS_DONE = 'done'`, `STATUS_ERROR = 'error'`

4. **コメントは「なぜ」を説明**: 3段テンプレートの理由、atomicWriteの必要性、currentStep 変更ポリシーをコメントで補完

## Acceptance Criteria

- [ ] `.claude/scripts/rfc-graph/update-step-status.js` が作成されている
- [ ] 5サブコマンド（start-step / end-step / fail-step / reset-to-step / status）が全て動作する
- [ ] `--graphify-status=<path>` でステータスファイルパスを指定できる
- [ ] 異常系（未知サブコマンド / 不正Step番号）で3段テンプレートを stderr に出力し終了コード 1 で終了する
- [ ] `atomicWrite()` が一時ファイル＋rename パターンでアトミック性を保証する
- [ ] `status` サブコマンドで整形JSONを stdout に出力する
- [ ] `--help` オプションで使用方法を表示する
- [ ] `tests/rfc-graph/update-step-status.test.cjs` に15テストケース以上が実装され全件パスしている
- [ ] カバレッジ目標（90%以上）を達成している
- [ ] 翻訳可能性（関数名が動詞句、一関数一責務、ハードコード値の定数化）を満たしている
- [ ] `console.log` / デバッグ出力が残っていない
- [ ] `[::STUB::]` 未付与の不完全実装がない

## Notes

### 依存関係

- **先行実装必須**: P12-1（JSON Schema + validate.js）— 完了済み、本チケットは利用しないが crud.js（P13-2）が依存するため順序を維持
- **並行実装可能**: P13-2（crud.js）— update-step-status.js と crud.js に相互依存はない
- **呼び出し元**: P16-1（graphify-rfc.md スラッシュコマンド）から本スクリプトが呼び出される

### 実装時の注意点

- GRAPHIFY-Status.json が存在しない場合はエラーとせず、デフォルト状態で初期化してからコマンドを実行する（初回実行対応）
- `reset-to-step <N>` で N 自身のステータスは変更しない（N の内容を保持したまま、N 以降をリセット）
- CRLF / LF の混在を考慮し、JSON 改行コードは OS デフォルトに従う

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testUnit[]`, `testExceptions[]`, `notes` フィールド
- **実装サマリ**: `changes[]`, `notes` フィールド
- **レビュー報告書**: `instrumentation`, `notes`, `rfcDiscrepancies[]` フィールド
