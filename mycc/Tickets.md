# mycc — MTPLX + Claude Code Proxy 環境セットアップスクリプト群 — 実装チケット分解設計書

> **生成元:** mycc/RFC.md
> **生成日:** 2026-06-21
> **分析済みセクション:** Abstract, Motivation, Design（アーキテクチャ全体像・ディレクトリ構成・決定事項一覧）, Implementation（common.sh, doctor.sh, setup.sh, run.sh, test.js, .env リファレンス, エラーハンドリングと障害モード）, Appendix

---

## Phase 1: 基盤ロジック（Layer 0-1 — 型定義・純粋関数）

> **外部依存:** OS 標準コマンド（`printf`, `uname`, `sysctl`, `command -v`, `brew`）

### マイルストーン M0: 共通関数集の確立

> **DB:** 不使用（メモリ内完結）

#### ✅ チケット M0-1: common.sh — 色付き出力ヘルパー関数

- **参照設計書:** mycc/RFC.md (§1. common.sh)
- **依存・関連チケットID:** 先行実装必須なし（独立）。後続: M0-2, M1-1, M1-2。
- **対象不変条件 / 規範:** RFC §「全スクリプト共通ルール」: 全スクリプトは `set -euo pipefail` を冒頭に持つ。Q13（common.sh に関数切り出し）。
- **実装の背景と目的:** 全スクリプトから source される最小共通レイヤー。色付き出力によりターミナル上で情報／警告／エラーを視覚的に区別する。`die` はエラー表示後に `exit 1` する — このチケットでは I/O を伴わない出力フォーマット関数のみを実装し、後続チケットでチェック関数を追加する。単独実行は想定せず、source 専用。
- **実装スコープ:**
  - `common.sh` ファイルの作成
  - `set -euo pipefail`
  - `info()` — 緑色 `[INFO]` プレフィックス
  - `warn()` — 黄色 `[WARN]` プレフィックス
  - `error()` — 赤色 `[ERROR]` プレフィックス
  - `die()` — `error()` 表示後に `exit 1`
  - shellcheck 準拠（`# shellcheck shell=sh`）
- **テストコードによる検証:**
  1. 正常系: `info "test"` → 標準出力に `[INFO] test` が緑色で出力される
  2. 正常系: `warn "test"` → 標準出力に `[WARN] test` が黄色で出力される
  3. 異常系: `die "fatal"` → `[ERROR] fatal` が出力され、終了コード 1 で exit
  4. 境界値: 空文字列のメッセージ → 空のプレフィックスのみ出力
  5. 境界値: 改行を含む複数行メッセージ → 各行が適切に表示される
- **計装方法・観測対象:** 関数呼び出し後の標準出力キャプチャ、exit コード確認。全てのテストはサブシェル `(source common.sh && info "test")` で実行可能。

#### ✅ チケット M0-2: common.sh — 環境チェック関数群

- **参照設計書:** mycc/RFC.md (§1. common.sh — check_apple_silicon, check_brew, check_tool, check_claude, check_model, check_all)
- **依存・関連チケットID:** 先行実装必須: M0-1（info/warn/error/die が必要）。後続: M1-1, M1-2。
- **対象不変条件 / 規範:** Q4（Homebrew 不在→エラー終了＋手順表示）、Q12（不足ツールは一覧表示＋手順提示、自動インストールしない）、Q14（Claude Code 不在は手順表示のみ）、Q15（`uname -m` + `sysctl` で Apple Silicon 確認）。
- **実装の背景と目的:** common.sh にチェック関数群を追加する。これらの関数は `doctor.sh`（全前提条件チェック）と `setup.sh`（実行者前提条件チェック＋継続）の両方から使用される。各関数は「何が不足しているか」「どうインストールするか」を具体的な手順とともに表示する責務を持つ。自動インストールは一切行わない（Q12）。
- **実装スコープ:**
  - `common.sh` に以下の関数を追加:
    - `check_apple_silicon()` — `uname -m` が `arm64` かつ `sysctl -n hw.optional.arm64` が `1` でなければ `die`（非 Apple Silicon は一切サポートしない）
    - `check_brew()` — `command -v brew` がなければ `die` + Homebrew インストール手順を表示
    - `check_tool <name> <binary> [version_flag]` — 汎用ツール確認。存在しなければ `die` + `brew install <name>` 表示
    - `check_claude()` — `command -v claude` がなければ `die` + `npm install -g @anthropic-ai/claude-code` 表示
    - `check_model <dir>` — モデルディレクトリと `config.json` の存在確認。不在時は `warn` + `setup.sh` 実行を促す（`return 1`、非終了）
    - `check_all()` — 上記全チェックを逐次実行、failure 件数を集計して `return 1` または `return 0`
- **テストコードによる検証:**
  1. 正常系: `check_apple_silicon` → Apple Silicon 上で OK 表示 + exit 0
  2. 異常系: 非 Apple Silicon (Intel/VM) 上 → `die` + エラーメッセージ + exit 1（フォールバックテスト: `uname -m` をモック）
  3. 正常系: `check_brew` → Homebrew 存在時 OK 表示
  4. 異常系: `check_brew` → Homebrew 不在時に `die` + インストール手順表示
  5. 正常系: `check_tool python3.12 --version` → 存在時 OK 表示
  6. 異常系: `check_tool nonexistent` → `die` + インストール手順表示
  7. 正常系: `check_claude` → Claude Code 存在時 OK 表示
  8. 異常系: `check_claude` → Claude Code 不在時に `die` + `npm install -g ...` 表示
  9. 正常系: `check_model` → モデル存在時 OK + exit 0
  10. 異常系: `check_model` → モデル不在時 `warn` + return 1（非終了）
  11. 集約: `check_all` → 全通過時 0、一部不足時 1
- **計装方法・観測対象:** 関数の戻り値（`$?`）、標準出力キャプチャ。テストはサブシェルで実行し、関数の存在確認 `declare -f` で検証。

---

## Phase 2: 単体スクリプト実装（Layer 1-2 — 外部ツール呼び出し）

> **外部依存:** `lsof`, `kill`, `curl`, `pgrep`, `uv`, `huggingface-cli`, `git`

### マイルストーン M1: 診断・構築スクリプト

> **DB:** 不使用。すべて外部プロセス呼び出し結果に基づく処理。

#### ✅ チケット M1-1: doctor.sh — 環境診断スクリプト

- **参照設計書:** mycc/RFC.md (§2. doctor.sh — 環境診断)
- **依存・関連チケットID:** 先行実装必須: M0-1, M0-2（common.sh の全関数）。並列可能: M1-2（setup.sh とは独立したスクリプト）。
- **対象不変条件 / 規範:** RFC §2 処理フロー（全チェックを順次実行→不足時エラー終了＋手順表示）、Q4（Homebrew 不在→エラー終了）、Q12（自動インストールしない）、Q14（Claude Code 不在は手順表示のみ）。
- **実装の背景と目的:** ユーザーが最初に実行するエントリポイント。全前提条件（Apple Silicon, Homebrew, Python 3.12, Git, uv, Node.js, Claude Code, モデルファイル）を一項目ずつチェックし、不足があれば具体的なインストール手順を表示する。doctor.sh は一切の自動インストールを行わない（Q12）。モデルファイルの不在だけは非終了コードで警告に留める（download は setup.sh の責務）。
- **実装スコープ:**
  - `doctor.sh` ファイルの作成
  - `#!/usr/bin/env bash` + `set -euo pipefail`
  - `SCRIPT_DIR` / `PROJECT_ROOT` の解決
  - `source "$SCRIPT_DIR/common.sh"`
  - タイトル表示「=== mycc 環境診断 ==="
  - 各チェックの順次実行（RFC 処理フロー図通り）:
    1. `check_apple_silicon` → 不全時 exit 1
    2. `check_brew` → 不全時 exit 1
    3. `check_tool "Python 3.12" "python3.12" "--version"` → 不全時 exit 1
    4. `check_tool "Git" "git" "--version"` → 不全時 exit 1
    5. `check_tool "uv" "uv" "--version"` → 不全時 exit 1
    6. `check_tool "Node.js" "node" "--version"` → 不全時 exit 1
    7. `check_claude` → 不全時 exit 1
    8. `check_model "$MODEL_DIR"` → 不全時 警告 + 「setup.sh を実行してください」
  - 全通過時「環境は整っています」+ exit 0
  - `MODEL_DIR` は環境変数 `MODEL_DIR` を参照、未設定時はデフォルト Quality 版パス
  - 実行権限付与
- **テストコードによる検証:**
  1. 正常系: 全前提条件充足時 → 全項目 `[OK]` + 「環境は整っています」+ exit 0
  2. 異常系: Apple Silicon 以外 → Step 1 でエラー終了 + メッセージ + exit 1
  3. 異常系: Homebrew 不在 → Step 2 でエラー終了 + インストール手順表示 + exit 1
  4. 異常系: 特定ツール不足 → 該当 Step でエラー終了 + 手順表示 + exit 1
  5. 警告系: モデル不在のみ → 全ツール通過後に警告 + exit 0
  6. 境界値: `PATH` から一部バイナリ除去 → 各チェックが正しく該当 step で停止
- **計装方法・観測対象:** サブシェル実行で標準出力キャプチャ、終了コード確認。PATH の操作によるモック。各 step の出力順序とメッセージ内容の検証。

#### ✅ チケット M1-2: setup.sh — 環境構築スクリプト（冪等）

- **参照設計書:** mycc/RFC.md (§3. setup.sh — 環境構築)
- **依存・関連チケットID:** 先行実装必須: M0-1, M0-2（common.sh）。後続: M2-1（run.sh は models/ と .env が必要）。
- **対象不変条件 / 規範:** RFC §3 冪等性ルール一覧（各ステップの既存時動作）、Q2（MODEL_VARIANT 切替）、Q7（ルート .env 一元管理、proxy/.env 自動生成）、Q8（ルート直置き構造）。
- **実装の背景と目的:** 環境構築を完全自動化かつ冪等に実行するスクリプト。`common.sh` で前提条件を確認後、6つの Phase を逐次実行する。各 Phase は冪等性ルールに従い、既存リソースを破壊せず差分のみ処理する。このスクリプトが唯一 .env を生成する権限を持ち、proxy/.env の master となる。
- **実装スコープ:**
  - `setup.sh` ファイルの作成
  - `#!/usr/bin/env bash` + `set -euo pipefail`
  - `SCRIPT_DIR` / `PROJECT_ROOT` の解決
  - `source "$SCRIPT_DIR/common.sh"`
  - **Phase 1 (前提条件チェック):** `check_all` 呼び出し、不全時 `die`
  - **Phase 2 (uv プロジェクト初期化):**
    - `pyproject.toml` 既存 → スキップ
    - 新規 → `uv init --app --python 3.12`（フォールバック: `uv init && uv python pin 3.12`）
    - デフォルトの `main.py` / `hello.py` 削除
  - **Phase 3 (依存パッケージ追加):**
    - `uv add mtplx huggingface_hub hf_transfer`
    - `uv sync`（常に実行）
    - バージョン確認
  - **Phase 4 (モデルダウンロード):**
    - `MODEL_VARIANT` によるバリアント切替（quality/speed）
    - `HF_HUB_ENABLE_HF_TRANSFER=1`
    - 既存モデル＋`config.json` → スキップ（差分のみ再開）
    - `uv run huggingface-cli download` で 27B モデル DL
  - **Phase 5 (Claude Code Proxy セットアップ):**
    - 既存 `.git` → `git pull` で更新
    - 新規 → `git clone https://github.com/dbirks/claude-code-proxy.git`
    - 中途半端なディレクトリ → `rm -rf` + clone
    - `uv sync`（必要に応じて `uv python pin 3.12` → sync）
  - **Phase 6 (.env 生成):**
    - `MTPLX_PORT`, `PROXY_PORT`, `MODEL_NAME` の解決
    - ルート `.env` 生成（常に上書き）
    - proxy/.env 生成:
      - `.env.example` 存在時: キーを抽出して設定値を注入
      - 不存在時: デフォルト値で生成
    - `.gitignore` 生成（不在時のみ）
- **テストコードによる検証:**
  1. 冪等性: 2回連続実行 → 2回目も成功、既存リソースが破壊されない
  2. 正常系: 新規ディレクトリで全 Phase 実行 → 期待されるファイルが存在
  3. 異常系: Phase 1 で前提不足 → `die` + エラー表示 + exit 1
  4. 冪等性: モデルダウンロードの差分再開（`config.json` が既存時スキップ）
  5. 冪等性: uv init のスキップ（`pyproject.toml` 既存時）
  6. 冪等性: git clone → pull の更新
  7. 切り替え: `MODEL_VARIANT=speed ./setup.sh` → Speed 版パスで設定
  8. 境界値: proxy/.env の `.env.example` 不在フォールバック
  9. 境界値: 中途半端な `claude-code-proxy/` ディレクトリ（.git なし）→ クリーンアップ＋clone
- **計装方法・観測対象:** 実行後のディレクトリ状態（ファイル有無、内容、パーミッション）、環境変数の値。

---

## Phase 3: 複数プロセス管理（Layer 2-3 — 非同期ランタイム・ライフサイクル管理）

> **外部依存:** `curl`, `lsof`, `kill`, `wait`, `trap`, `mtplx` (uv run), `uvicorn` (uv run)

### マイルストーン M2: サーバー・プロキシ起動

> **注記**: Quality 版（27B フルパラメータ）は 32GB のメモリでは動作が困難なため、Speed 版（4bit 量子化）をデフォルトとする。Quality 版の使用には 64GB+ の RAM が必要。

> **DB:** 不使用。プロセス管理とネットワーク疎通確認のみ。

#### ✅ チケット M2-1: run.sh — サーバー・プロキシ起動スクリプト

- **参照設計書:** mycc/RFC.md (§4. run.sh — サーバー・プロキシ起動)
- **依存・関連チケット名:** 先行実装必須: M1-2（.env と models/ の存在が必要）。後続: M3-1（test.js は起動中のプロセスに対してテスト実行）。並列可能: M1-1（doctor.sh との依存関係なし）。
- **対象不変条件 / 規範:** Q3（ポート空き確認＋エラー表示）、Q5（バックグラウンドジョブ + trap で一括終了）、RFC §4 処理フロー（MTPLX → readiness → Proxy → readiness → 起動完了表示 → trap 待機）、RFC § エラーハンドリング障害モード #4（ポート占有）、#5（モデル不在）、#6（readiness タイムアウト）、#9（サーバーコマンド検出）。
- **実装の背景と目的:** 2 つのプロセス（MTPLX 推論サーバー、Claude Code Proxy）を正しい順序で起動し、各プロセスの readiness 確認後にユーザーに情報を表示する。Ctrl+C で両プロセスをグレースフルに終了する。プロセス管理はバックグラウンドジョブ + trap で実現する。
- **実装スコープ:**
  - `run.sh` ファイルの作成
  - `#!/usr/bin/env bash` + `set -euo pipefail`
  - `SCRIPT_DIR` / `PROJECT_ROOT` の解決
  - `.env` 読込（`set -a; source .env; set +a`）
  - `MTPLX_PORT`, `PROXY_PORT`, `MODEL_DIR` のデフォルト解決
  - `cleanup` 関数 — `kill $PID_MTPLX $PID_PROXY` + `wait`、`trap cleanup SIGINT SIGTERM EXIT`
  - `check_port` 関数 — `lsof -i :$port` で LISTEN 確認、占有時エラー＋ポート変更提案
  - モデルディレクトリ確認（不在時エラー終了）
  - `detect_serve_cmd` 関数 — `mtplx serve` / `lightning-mlx serve` の動的検出
  - **MTPLX 起動**（background）+ PID 記録:
    - `uv run $SERVE_CMD --model "$ABS_MODEL_DIR" --port "$MTPLX_PORT" --max-tokens 32768 --temp 0.6 --top-p 0.95 &`
  - **Readiness ポーリング**（最大 120 秒、2 秒間隔、`curl -sf http://127.0.0.1:${MTPLX_PORT}/v1/models`）:
    - 成功 → 経過秒数表示
    - タイムアウト → エラー終了＋対処法表示
  - **Proxy 起動**（background）+ PID 記録:
    - `cd claude-code-proxy && uv run uvicorn server:app --host 127.0.0.1 --port "$PROXY_PORT" &`
  - **Proxy Readiness ポーリング**（最大 30 秒、1 秒間隔）:
    - 成功 → 経過秒数表示
    - タイムアウト → MTPLX も kill + エラー終了
  - 起動完了表示（OpenAI / Anthropic / Claude Code の各エンドポイント）
  - `wait`（フォアグラウンド待機）
  - 実行権限付与
  - `[::STUB::] detect_serve_cmd 関数 — 動的コマンド検出（mtplx/lightning-mlx の両対応）は本チケットで完結`
- **テストコードによる検証:**
  1. 正常系: 全前提充足 → MTPLX 起動 → readiness 確認 → Proxy 起動 → readiness 確認 → 起動完了表示
  2. 異常系: `.env` 不在 → エラー終了
  3. 異常系: ポート占有（lsof で LISTEN 確認）→ エラー終了＋ポート変更提案
  4. 異常系: モデル不在 → 「setup.sh を実行してください」+ exit 1
  5. 異常系: MTPLX readiness タイムアウト → エラー終了＋「timeout」+ exit 1
  6. 異常系: Proxy readiness タイムアウト → MTPLX kill + エラー終了
  7. 正常系: Ctrl+C → cleanup 発動 → 両プロセス停止
  8. 正常系: `detect_serve_cmd` → 利用可能なサーバーコマンドを正しく検出
- **計装方法・観測対象:** プロセス生存（`kill -0`）、標準出力キャプチャ、`curl` 応答確認、trap 発動確認。テストは実際の MTPLX プロセスが不要な形でユニットテスト可能な関数（`check_port`, `detect_serve_cmd`, `cleanup`）と結合テストに分割。

---

## Phase 4: 検証スクリプト（Layer 2-4 — 非同期 HTTP + プロセス管理）

> **外部依存:** Node.js ビルトイン `http` モジュールのみ（Q16）。`child_process` の `execSync` / `pgrep`。

### マイルストーン M3: 6段階テスト

> **DB:** 不使用。HTTP API 応答テスト＋プロセス生存確認。

#### ✅ チケット M3-1: test.js — 6段階検証スクリプト

- **参照設計書:** mycc/RFC.md (§5. test.js — 検証スクリプト)
- **依存・関連チケットID:** 先行実装必須: M2-1（run.sh でプロセス起動が完了していることが前提）。実行依存: M1-2（MTPLX 起動と Proxy 起動が必要）。
- **対象不変条件 / 規範:** Q6（6段階テスト＋モデル名検証＋`--fail-fast`）、Q9（6段階＋モデル名内容検証）、Q10（test.js のみ Node.js）、Q16（Node.js ビルトイン `http` モジュールのみ）、RFC §5 テストパイプライン表（Stage 1-6 の対象・確認内容・期待値の完全一致）。
- **実装の背景と目的:** `run.sh` が起動した状態で実行する独立した検証スクリプト。6段階のテストパイプラインにより障害箇所を特定可能にする。Node.js ビルトイン `http` モジュールのみで実装し、外部 npm 依存を一切持たない（Q16）。`--fail-fast` フラグにより初回失敗で停止可能。
- **実装スコープ:**
  - `test.js` ファイルの作成
  - `#!/usr/bin/env node`
  - **設定:** `MTPLX_PORT`, `PROXY_PORT`, `MODEL_NAME`, `TIMEOUT` の環境変数解決（デフォルト値あり）
  - **コマンドライン引数:** `--fail-fast` のパース
  - **Utility 関数:**
    - `httpRequest(method, hostname, port, path, body)` — Promise ベース HTTP クライアント、タイムアウト処理
    - `findMTPLXProcess()` — `pgrep -f "mtplx serve|lightning-mlx serve"` で生存確認
    - `findProxyProcess()` — `pgrep -f "uvicorn server:app"` で生存確認
    - `printStage(n, label, ok, detail)` — テスト段階結果の整形表示
    - `summarize()` — 集計表示 + exit コード（全成功 0 / 一件以上失敗 1）
  - **テストパイプライン（6 段階）:**
    - Stage 1: MTPLX プロセス生存確認（`findMTPLXProcess`）
    - Stage 2: MTPLX `GET /v1/models` → HTTP 200 + モデル名検証
    - Stage 3: MTPLX `POST /v1/chat/completions` → HTTP 200 + `choices[0]` 存在確認
    - Stage 4: Proxy プロセス生存確認（`findProxyProcess`）
    - Stage 5: Proxy `GET /` → HTTP 200
    - Stage 6: Proxy `POST /v1/messages`（Anthropic 形式）→ HTTP 200 + `content` 存在確認
  - **集約と終了:** 全テスト結果集約、`passed/total` 表示、全成功 0 / 失敗 1
  - `[::STUB::] httpRequest 関数、findMTPLXProcess/findProxyProcess 関数、printStage/summarize 関数 — 全て本チケット内で完結`
- **テストコードによる検証:**
  1. 正常系: 全プロセス起動中 → Stage 1-6 全通過 + exit 0
  2. 異常系: MTPLX のみ未起動 → Stage 1 失敗 + (--fail-fast 時) そこで停止 + exit 1
  3. 異常系: Proxy のみ未起動 → Stage 1-3 通過、Stage 4 失敗
  4. 異常系: MTPLX 起動中だが応答なし → Stage 1 通過、Stage 2 失敗
  5. 正常系: `--fail-fast` → 初回失敗で即座に停止 + summarize 表示
  6. 正常系: `--fail-fast` なし → 全 6 段階実行後に集約
  7. 境界値: HTTP タイムアウト（`TIMEOUT=1` で起動前のサーバーにリクエスト）→ エラーハンドリング
  8. 正常系: 環境変数によるポート・モデル名の上書き（`MTPLX_PORT=9999 PROXY_PORT=9998`）
- **計装方法・観測対象:** テスト段階ごとの pass/fail カウント、標準出力の結果一覧、終了コード。HTTP タイムアウトとプロセス不在の 2 つの障害軸の組み合わせを網羅。

---

## Phase 5: 統合・ドキュメンテーション（Layer 4 — 統合・E2E）

> **外部依存:** 全外部ツール（Homebrew, Python, uv, Node.js, Claude Code, MTPLX, huggingface-cli, claude-code-proxy）

### マイルストーン M4: 統合テストと障害モード検証

> **DB:** 不使用。

#### チケット M4-1: 全スクリプト連携テストと障害モード検証

- **参照設計書:** mycc/RFC.md (§7. エラーハンドリングと障害モード, Appendix A-D)
- **依存・関連チケットID:** 先行実装必須: M0-1, M0-2, M1-1, M1-2, M2-1, M3-1（全スクリプト完成が必要）。
- **対象不変条件 / 規範:** RFC § 障害モード一覧（10種全ての症状・原因・診断方法・対策の一致）、Q11（全て標準出力、ログファイル不要）、Appendix A（使用手順概要の完全性）、Appendix C（トラブルシューティング手順の実効性）。
- **実装の背景と目的:** 各チケットで個別に実装されたスクリプト群が連携して期待通り動作することを確認する最終フェーズ。設計書に記載された 10 種の障害モード全てを実際に再現し、各スクリプトが適切なエラー表示と対策を示すことを検証する。また、ドキュメント（Appendix 含む）の完全性を確認する。このチケット自体はコードの新規作成ではなく、検証と修正を目的とする。
- **実装スコープ:**
  - **統合テスト計画の策定と実行:**
    1. `doctor.sh` → `setup.sh` → `run.sh` → `test.js` の正しい順序での実行
    2. `setup.sh` の冪等性検証（2回連続実行で同一結果）
    3. `run.sh` の稼働状態で `test.js` 全段階通過確認
    4. `run.sh` の Ctrl+C によるクリーンシャットダウン確認
  - **障害モード検証（10 種全ての再現と確認）:**
    1. 非 Apple Silicon 環境 → doctor.sh エラー終了
    2. Homebrew 未導入 → doctor.sh エラー終了＋手順表示
    3. 前提条件不足 → setup.sh Phase 1 エラー終了
    4. ポート占有 → run.sh エラー終了＋ポート変更提案
    5. モデル不在 → run.sh エラー終了
    6. MTPLX readiness タイムアウト → run.sh エラー終了＋対処法表示
    7. MTPLX 応答なし → test.js Stage 2 失敗
    8. Proxy 変換動作不良 → test.js Stage 6 失敗
    9. サーバーコマンド検出失敗 → run.sh エラー終了
    10. （観測のみ: 速度不足 — チケット外）
  - **ドキュメント検証:**
    - Appendix A 使用手順が実際に動作することを確認
    - Appendix C トラブルシューティング手順が実効的であることを確認
    - Appendix D モデルバリアント切替が動作することを確認
  - **検証で発見された不具合の修正**（チケット範囲内で行うべき修正の明確化）
- **テストコードによる検証:**
  1. E2E: `setup.sh` フル実行 → `run.sh` 起動 → `test.js --fail-fast` 全通過
  2. 冪等性: `setup.sh` 2回実行 → 差分なし
  3. 障害モード: ポート占有状態での `run.sh` → 適切なエラー
  4. 障害モード: モデル不存在での `run.sh` → 適切なエラー
  5. 障害モード: MTPLX 未起動での `test.js` → Stage 1 失敗
  6. 障害モード: Proxy 未起動での `test.js` → Stage 4 失敗
  7. 正常系: `MODEL_VARIANT=speed` → Speed 版モデルで全プロセス起動
  8. 正常系: カスタムポート（`MTPLX_PORT=9090 PROXY_PORT=9092`）→ 指定ポートで起動
- **計装方法・観測対象:** 各スクリプトの終了コード、標準出力のエラーメッセージ内容、プロセス生存状態、ポート占有状態、ファイル生成有無。障害モード再現には Docker / VM / stub によるモック環境を準備する。

---

## チケット依存関係サマリー

```
M0-1 (common.sh: 出力関数)
  └── M0-2 (common.sh: チェック関数)
        ├── M1-1 (doctor.sh)
        └── M1-2 (setup.sh)
              └── M2-1 (run.sh)
                    └── M3-1 (test.js)
                          └── M4-1 (統合テスト)
```

**並列実行可能なペア:**
- M1-1（doctor.sh）と M1-2（setup.sh）は並列可能（共通の親 M0-2 に依存する sibling）
- M1-1 / M1-2 と M2-1 は並列不可能（M1-2 が完了して .env + models/ が存在しないと M2-1 は動作しない）

**推奨実装順序:** M0-1 → M0-2 → M1-1 + M1-2（並列）→ M2-1 → M3-1 → M4-1
