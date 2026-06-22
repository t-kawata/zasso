---
ticket_id: 173
title: M0-1: common.sh — 色付き出力ヘルパー関数
slug: m0-1-commonsh
status: reviewed
created_at: 2026-06-21
updated_at: 2026-06-21
project: mycc
dependencies: {"predecessor": [], "successor": ["M0-2: common.sh — 環境チェック関数群", "M1-1: doctor.sh — 環境診断スクリプト", "M1-2: setup.sh — 環境構築スクリプト"]}
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0173-m0-1-commonsh/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0173-m0-1-commonsh/review.md
---
# M0-1: common.sh — 色付き出力ヘルパー関数

## Summary

全スクリプト（`doctor.sh`, `setup.sh`, `run.sh`）から `source` される最小共通レイヤー `common.sh` を作成する。ターミナル上で情報／警告／エラーを色分け表示する4つの関数（`info`, `warn`, `error`, `die`）を `set -euo pipefail` と共に提供する。

## Background

本プロジェクト（mycc）は Apple Silicon Mac 上で MTPLX + Claude Code Proxy を用いて Qwen3.6-27B をローカル実行するためのスクリプト群である。これら全スクリプトは共通の基盤レイヤーとして `common.sh` を `source` する（RFC §「アーキテクチャ全体像」）。

なぜ共通レイヤーが必要か：

1. **視覚的区別**: ターミナル出力において情報（緑）、警告（黄）、エラー（赤）を即座に判別できる必要がある。スクリプトごとに color 実装が分散するとメンテナンス不能になる。
2. **エラー終了の統一**: `die()` はエラーメッセージ表示後に `exit 1` する統一されたパターンを提供する。各スクリプトが独自に `echo`＋`exit` を実装すると終了動作にばらつきが生じる。
3. **堅牢性の基底**: `set -euo pipefail` を全スクリプト共通で有効にするためのエントリポイントとして機能する（RFC Q13: common.sh に関数切り出し）。

このチケットでは I/O を伴わない純粋な出力フォーマット関数のみを実装する。環境チェック関数（`check_apple_silicon`, `check_brew` 等）は後続チケット M0-2 で追加する。

**参照:**
- RFC.md §1. common.sh — 色付き出力ヘルパー関数
- CLAUDE.md — 依存関係グラフ Layer 1（純粋関数・独立ロジック）、決定事項一覧

## Scope

- `mycc/common.sh` ファイルの新規作成
- `set -euo pipefail` の宣言（スクリプト冒頭）
- **`info()`** — 緑色 `[INFO]` プレフィックス付きでメッセージを標準出力に表示
- **`warn()`** — 黄色 `[WARN]` プレフィックス付きでメッセージを標準出力に表示
- **`error()`** — 赤色 `[ERROR]` プレフィックス付きでメッセージを標準出力に表示
- **`die()`** — `error()` でメッセージ表示後、終了コード 1 で `exit`
- `# shellcheck shell=sh` 準拠（POSIX sh 互換、bashism を回避）
- ANSI エスケープコードは名前付き定数で管理（`COLOR_GREEN`, `COLOR_YELLOW`, `COLOR_RED`, `COLOR_RESET`）

## Non-scope

- **`check_*` 関数群**（`check_apple_silicon`, `check_brew`, `check_tool`, `check_claude`, `check_model`, `check_all`）: チケット M0-2 で実装。本チケットでは空のプレースホルダも作成しない。
- **単独実行**: `common.sh` は `source` 専用。単独実行時のガード（`return 0`）は含めない。
- **ログファイル出力**: 全出力は標準出力のみ。ファイルへのリダイレクトは呼び出し元が行う。
- **色なしモード（`--no-color`）**: 需要が確認されるまでオプションを追加しない。現時点では常に色付き。
- **doctor.sh / setup.sh / run.sh**: 本チケットでは common.sh のみを作成。他スクリプトは後続チケットで実装。

## Investigation

### 既存コードベースの状態

`mycc/` ディレクトリには現在 `common.sh` は存在しない。全スクリプトはこれから新規作成される。

### 設計上の確認事項

**ANSI エスケープコードの選択:**
- 色制御には ANSI エスケープシーケンス（`\033[32m` 等）を使用する。`tput` は POSIX 互換だが、出力が複数行にわたるケースでサブシェルを要するため、一貫性の観点からエスケープコード直書きを採用する。
- カラーコードは名前付き定数に抽出し、マジックナンバーを排除する。

**`set -euo pipefail` の影響:**
- `set -e`: コマンド失敗時に即座に exit。`error()` 内で `echo` 等の基本コマンドが失敗することは考えにくいが、`die()` 内の `exit 1` と `set -e` の相互作用に注意する。
- `set -u`: 未定義変数の参照をエラーにする。関数内の変数はすべて初期化済みであることを確認する。
- `set -o pipefail`: パイプラインの途中でエラーが発生した場合も捕捉する。本チケットの関数群はパイプを使用しないため影響なし。

### スタブの確認

`mycc/` ディレクトリに既存のソースコードが存在しないため、スタブ（`[::STUB::]`）の解決対象はなし。

## Test Plan

### ユニットテスト計画

テスト対象関数: `info()`, `warn()`, `error()`, `die()`

全てのテストはサブシェル `(source mycc/common.sh && <関数> <引数>)` で実行可能。外部依存なし。

| # | 分類 | テストケース | 入力 | 期待結果 |
|---|------|-------------|------|---------|
| 1 | 正常系 | info 標準メッセージ | `info "starting server"` | 標準出力に `[INFO] starting server` が緑色（`\033[32m`）で出力される |
| 2 | 正常系 | warn 標準メッセージ | `warn "disk 80% full"` | 標準出力に `[WARN] disk 80% full` が黄色（`\033[33m`）で出力される |
| 3 | 正常系 | error 標準メッセージ | `error "connection failed"` | 標準出力に `[ERROR] connection failed` が赤色（`\033[31m`）で出力される |
| 4 | 異常系 | die エラー終了 | `die "fatal error"` | 標準出力に `[ERROR] fatal error` が赤色で出力され、終了コード 1 で exit |
| 5 | 境界値 | 空文字列メッセージ | `info ""` | 標準出力に `[INFO] `（空のメッセージ、プレフィックスのみ）が出力される |
| 6 | 境界値 | 複数行メッセージ | `info "line1\nline2"` | 各行が `[INFO] line1`、`line2` のように表示される（またはエスケープされる） |
| 7 | 正常系 | 関数の存在確認 | `declare -f info warn error die` | 4関数すべてが定義済みとして返る |
| 8 | 正常系 | die が error を呼ぶことの確認 | `die "msg"` の出力内に `[ERROR] msg` が含まれる | 終了コード 1 + `[ERROR]` プレフィックス |

**カバレッジ目標**: 80%（クリティカルパス: 100% — die() の終了コードのみ必達）

### ユニットテスト不可能な項目（例外）

- 該当なし。全ての関数は標準出力 + 終了コードのみで検証可能。

## Boy Scout Rule — 翻訳可能性計画

本チケットは新規作成のため、既存コードの改善は発生しない。新規コードにおいて以下の翻訳可能性基準を満たす：

1. **関数名は動詞句・動作を明示**: `info`, `warn`, `error`, `die` — いずれも英語の動詞として読める。日本語訳では「情報表示」「警告表示」「エラー表示」「エラー終了」と逐語訳可能。

2. **一関数一責務**:
   - `info()`: 情報表示のみ — 副作用なし
   - `warn()`: 警告表示のみ — 副作用なし
   - `error()`: エラー表示のみ — 副作用なし
   - `die()`: エラー表示 → exit 1 — この2つを同一関数にまとめるのは「エラー終了」という一つの責務として正当（`error()` をラップして `exit` するユースケースが毎回出現するため）

3. **マジックナンバー排除**: ANSI エスケープコードは名前付き定数（`COLOR_GREEN`, `COLOR_YELLOW`, `COLOR_RED`, `COLOR_RESET`）として宣言する。

4. **コメントは「なぜ」を説明**: 各関数には日本語で目的と制約を記述する。コード自体が「何を」やっているかは関数名＋処理で自明にする。

## Acceptance Criteria

- [ ] `info`, `warn`, `error`, `die` の4関数が実装され、期待通りの色付きプレフィックスを出力する
- [ ] `die()` が呼び出された際、エラーメッセージ表示後に終了コード 1 で exit する
- [ ] 空文字列や複数行メッセージに対して適切に動作する
- [ ] `set -euo pipefail` が冒頭で宣言されている
- [ ] `# shellcheck shell=sh` 準拠（POSIX sh 互換）
- [ ] ANSI エスケープコードが名前付き定数で管理されている
- [ ] 全てのテストケースがサブシェル `(source common.sh && <関数>)` で通過する
- [ ] 翻訳可能性基準（関数名・一責務・定数化）を満たしている

## Notes

<!--
注: このコメントは人間向けの説明である。AI は以下の手順に従うこと。

- plan_path: /plan-ticket が plan.md を作成後に frontmatter に更新する
- implementation_path: /start-ticket が implementation.md を作成後に frontmatter に更新する
- review_report_path: /review-ticket が review.md を作成後に frontmatter に更新する

各コマンドのワークフロー手順が frontmatter 更新の正しい手順である。
-->

### 成果物

- 計画: context/0173-m0-1-commonsh/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0173-m0-1-commonsh/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0173-m0-1-commonsh/review.md（未作成、/review-ticket 全チェック通過後に作成）
