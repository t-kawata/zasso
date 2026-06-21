# RFC: mycc — MTPLX + Claude Code Proxy 環境セットアップスクリプト群

**Status**: Draft  
**Date**: 2026-06-21  
**Target**: Apple Silicon Mac (M2 以降, 32GB RAM 推奨)

---

## Abstract

本 RFC は、Apple Silicon Mac 上で MTPLX (MLX-based 推論エンジン) と Claude Code Proxy を用いて Qwen3.6-27B をローカル実行するための環境構築・起動・検証スクリプト群 (`common.sh`, `doctor.sh`, `setup.sh`, `run.sh`, `test.js`) の設計を定義する。全スクリプトは `mycc/` ディレクトリをプロジェクトルートとし、Python 依存は `uv` で一元管理する。モデルファイルは `setup.sh` により自動ダウンロードされ、git 管理外とする。

---

## Motivation

Claude Code をローカルの LLM で動作させるには、(1) Apple Silicon 上で推論を実行する MTPLX サーバーと、(2) OpenAI 互換 API を Anthropic 互換 API に変換する Claude Code Proxy の 2 つのプロセスが必要である。これらを手動でセットアップする手順は既に確立されているが、以下の課題がある：

- **再現性の欠如**: 手動セットアップは手順の省略や環境差分による失敗が頻発する
- **障害箇所の特定困難**: サーバー・プロキシ・クライアントの 3 層構成で問題発生時にどの層が原因か特定しにくい
- **前提条件の不透明さ**: Homebrew / Python / uv / Node.js / Claude Code の過不足状態が不明なまま作業を始めてしまう

本スクリプト群はこれらの課題を解決する。`doctor.sh` が全前提条件を可視化し、`setup.sh` が冪等に環境を構築し、`run.sh` が 2 プロセスを起動し、`test.js` が 6 段階のテストで障害箇所を特定する。

---

## Design

### アーキテクチャ全体像

```
┌──────────────────────────────────────────────────────┐
│  mycc/ (プロジェクトルート)                            │
│                                                      │
│  ┌──────────────┐    ┌──────────────────────────┐    │
│  │  doctor.sh    │    │  common.sh               │    │
│  │  (環境診断)   │───▶│  (チェック関数集)        │    │
│  └──────────────┘    └──────────────────────────┘    │
│                           ▲                          │
│  ┌──────────────┐         │                          │
│  │  setup.sh    │─────────┘                          │
│  │  (環境構築)  │   source common.sh                  │
│  └──────────────┘  不全時エラー終了                     │
│                                                      │
│  ┌──────────────┐                                    │
│  │  run.sh      │  ┌──────────────┐                  │
│  │  (プロセス起動)│─▶│  MTPLX :8080 │──┐              │
│  └──────────────┘  └──────────────┘  │               │
│       ▲                              │               │
│  ┌────┴──────┐    ┌──────────────┐  │               │
│  │  test.js  │    │  Proxy :8082 │◀─┘               │
│  │  (検証)   │───▶│  (Anthropic  │                   │
│  └───────────┘    │   互換変換)   │                   │
│                   └──────────────┘                   │
│                                                      │
│  .env (環境変数) ──▶ setup.sh が proxy/.env を生成     │
│  .gitignore (models/, claude-code-proxy/, .venv/)     │
└──────────────────────────────────────────────────────┘
```

### ディレクトリ構成

```
mycc/
├── common.sh           # チェック関数集（doctor.sh, setup.sh から source）
├── doctor.sh           # 環境診断スクリプト（実行可能）
├── setup.sh            # 環境構築スクリプト（実行可能、冪等）
├── run.sh              # 起動スクリプト（実行可能）
├── test.js             # 検証スクリプト（Node.js、実行可能）
├── .env                # 環境変数定義（ルート管理、proxy/.env は自動生成）
├── .gitignore          # models/, claude-code-proxy/, .venv/ を除外
├── pyproject.toml      # uv プロジェクト定義
├── uv.lock             # uv ロックファイル
├── .python-version     # Python 3.12 固定
├── .venv/              # uv 仮想環境（git 管理外）
├── models/             # ダウンロードモデル（git 管理外）
│   └── Qwen3.6-27B-MTPLX-Optimized-Quality/
└── claude-code-proxy/  # upstream clone（git 管理外）
    ├── .env            # setup.sh が生成
    └── .venv/          # proxy 用仮想環境
```

### .gitignore 定義

```gitignore
# mycc/.gitignore
models/
.venv/
claude-code-proxy/
node_modules/
```

### 決定事項一覧

| ID | 決定 | 内容 |
|----|------|------|
| Q1 | A | mycc/ をプロジェクトルート、models/ は setup.sh がダウンロードし git 管理外 |
| Q2 | C | Quality 版デフォルト、`MODEL_VARIANT=speed` で Speed 版に切替 |
| Q3 | B | `MTPLX_PORT` / `PROXY_PORT` 環境変数で指定、占有時はエラー表示 |
| Q4 | A | Homebrew 不在 → エラー終了＋手順表示 |
| Q5 | A | バックグラウンドジョブ + `trap` で一括終了 |
| Q6 | C | 6 段階テスト＋モデル名検証＋`--fail-fast` |
| Q7 | B | ルート `.env` 一元管理、`setup.sh` が proxy/.env を自動生成 |
| Q8 | A | ルート直置き構造（scripts 用サブディレクトリは作らない） |
| Q9 | C | 6 段階＋モデル名内容検証（test.js） |
| Q10 | C | test.js のみ Node.js、他は shell |
| Q11 | — | 全て標準出力、ログファイル不要 |
| Q12 | B | 不足ツールは一覧表示＋手順提示、自動インストールしない |
| Q13 | C | common.sh に関数切り出し、setup.sh 冒頭でチェック→不全時エラー終了 |
| Q14 | B | Claude Code 不在は手順表示のみ（自動インストールしない） |
| Q15 | A | `uname -m` + `sysctl` で Apple Silicon 確認、非対応時エラー終了 |
| Q16 | A | test.js は Node.js ビルトイン `http` モジュールのみ |

---

## Implementation

### 1. common.sh — 共通チェック関数

#### 責務

全スクリプトから source される共通関数集。単独実行は想定しない。

#### 関数一覧

| 関数 | シグネチャ | 動作 |
|------|-----------|------|
| `info` | `info <メッセージ>` | 緑色で情報表示 |
| `warn` | `warn <メッセージ>` | 黄色で警告表示 |
| `error` | `error <メッセージ>` | 赤色でエラー表示、非ゼロ終了 |
| `die` | `die <メッセージ>` | エラー表示＋`exit 1` |
| `check_apple_silicon` | `check_apple_silicon` | `uname -m` と `sysctl -n hw.optional.arm64` で Apple Silicon 確認 |
| `check_brew` | `check_brew` | `brew --version` で Homebrew 確認 |
| `check_tool` | `check_tool <name> <binary> [version_flag]` | ツールの存在確認 |
| `check_claude` | `check_claude` | `claude --version` で Claude Code 確認 |
| `check_model` | `check_model <dir>` | モデルディレクトリと設定ファイルの存在確認 |
| `check_all` | `check_all` | 全チェックを逐次実行、結果を集約して返す |

```bash
# common.sh — 共通関数集
# shellcheck shell=sh
# Usage: source common.sh（単独実行不可）

set -euo pipefail

# Color output helpers
info()  { printf '\033[0;32m[INFO]\033[0m %s\n' "$*"; }
warn()  { printf '\033[0;33m[WARN]\033[0m %s\n' "$*"; }
error() { printf '\033[0;31m[ERROR]\033[0m %s\n' "$*"; }
die()   { error "$*"; exit 1; }

# Apple Silicon ハードウェア確認
# uname -m は Rosetta でも arm64 を返すため、sysctl でハードウェアレベル確認
check_apple_silicon() {
  local arch hw_opt
  arch=$(uname -m)
  hw_opt=$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)
  if [ "$arch" != "arm64" ] || [ "$hw_opt" != "1" ]; then
    die "この環境は Apple Silicon ではありません（arch=$arch, arm64_optional=$hw_opt）。MTPLX は Apple Silicon (M シリーズ) でのみ動作します。"
  fi
  info "Apple Silicon: OK ($arch)"
}

# Homebrew 確認
check_brew() {
  if ! command -v brew &>/dev/null; then
    die "Homebrew がインストールされていません。
  インストール手順:
    /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"
  インストール後、brew doctor で正常を確認してから再実行してください。"
  fi
  info "Homebrew: OK ($(brew --version | head -1))"
}

# 汎用ツール確認
# Usage: check_tool <表示名> <バイナリ名> [バージョンフラグ]
check_tool() {
  local name="$1" binary="$2" flag="${3:---version}"
  if ! command -v "$binary" &>/dev/null; then
    die "$name がインストールされていません。
  インストール手順:
    brew install $name"
  fi
  local ver
  ver=$("$binary" $flag 2>&1 | head -1)
  info "$name: OK ($ver)"
}

# Claude Code 確認
check_claude() {
  if ! command -v claude &>/dev/null; then
    die "Claude Code がインストールされていません。
  インストール手順:
    npm install -g @anthropic-ai/claude-code"
  fi
  info "Claude Code: OK ($(claude --version 2>&1 | head -1))"
}

# モデルファイル確認
# Usage: check_model <モデルディレクトリ>
check_model() {
  local model_dir="$1"
  if [ ! -d "$model_dir" ] || [ -z "$(ls -A "$model_dir" 2>/dev/null)" ]; then
    warn "モデルファイルが見つかりません: $model_dir
  setup.sh を実行してモデルをダウンロードしてください:
    ./setup.sh"
    return 1
  fi
  # config.json の存在で最低限の整合性確認
  if [ ! -f "$model_dir/config.json" ]; then
    warn "モデルディレクトリは存在しますが config.json が見つかりません。ダウンロードが不完全な可能性があります。"
    return 1
  fi
  info "モデル: OK ($(basename "$model_dir"))"
}

# 全チェック実行
# 戻り値: 0=全通過, 1=一部不足
check_all() {
  local failures=0

  check_apple_silicon || { failures=$((failures + 1)); }
  check_brew          || { failures=$((failures + 1)); }
  check_tool "Python 3.12" "python3.12" "--version"        || { failures=$((failures + 1)); }
  check_tool "Git" "git" "--version"                         || { failures=$((failures + 1)); }
  check_tool "uv" "uv" "--version"                           || { failures=$((failures + 1)); }
  check_tool "Node.js" "node" "--version"                    || { failures=$((failures + 1)); }
  check_claude                                                || { failures=$((failures + 1)); }

  if [ $failures -gt 0 ]; then
    error "前提条件を満たしていません（${failures} 件の不足）。上記の手順に従ってインストールしてから再実行してください。"
    return 1
  fi
  info "全前提条件を満たしています。"
}
```

### 2. doctor.sh — 環境診断

#### 責務

全前提条件を一項目ずつチェックし、不足があれば具体的なインストール手順を表示する。自動インストールは一切行わない。

#### 処理フロー

```text
START
  ├── source common.sh
  ├── check_apple_silicon → arm64? → NO → エラー終了 + 「Apple Silicon 以外では動作しません」
  ├── check_brew → brew 存在? → NO → エラー終了 + インストール手順表示
  ├── check_tool python3.12 → 存在? → NO → エラー終了 + brew install python@3.12
  ├── check_tool git → 存在? → NO → エラー終了 + brew install git
  ├── check_tool uv → 存在? → NO → エラー終了 + brew install uv
  ├── check_tool node → 存在? → NO → エラー終了 + brew install node
  ├── check_claude → 存在? → NO → エラー終了 + npm install -g @anthropic-ai/claude-code
  ├── check_model → 存在? → NO → 警告 + 「setup.sh を実行してください」
  └── 全通過 → 「環境は整っています」+ 終了コード 0
END
```

```bash
#!/usr/bin/env bash
# doctor.sh — 環境診断スクリプト
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

echo "=== mycc 環境診断 ==="
echo ""

# Apple Silicon 確認（最優先、ここで弾く）
check_apple_silicon || exit 1
echo ""

# Homebrew 確認
check_brew || exit 1
echo ""

# 各ツール確認
check_tool "Python 3.12" "python3.12" "--version" || exit 1
check_tool "Git" "git" "--version" || exit 1
check_tool "uv" "uv" "--version" || exit 1
check_tool "Node.js" "node" "--version" || exit 1
echo ""

# Claude Code 確認
check_claude || exit 1
echo ""

# モデル確認（任意：無くても終了コードは変えない）
MODEL_DIR="${MODEL_DIR:-$PROJECT_ROOT/models/Qwen3.6-27B-MTPLX-Optimized-Quality}"
check_model "$MODEL_DIR" || echo "  → setup.sh を実行してモデルをダウンロードしてください"
echo ""

echo "=== 診断完了 ==="
```

### 3. setup.sh — 環境構築

#### 責務

`common.sh` を source して前提条件を確認後、uv プロジェクトの作成、依存パッケージの追加、モデルのダウンロード、Claude Code Proxy のクローンとセットアップ、`.env` の生成を冪等に実行する。前提条件を満たしていない場合はエラー終了する。

#### 冪等性ルール

| ステップ | 既存時の動作 |
|---------|------------|
| `uv init` | `pyproject.toml` が既存 → スキップ |
| `uv add` | 既存依存 → スキップ（`uv sync` で更新） |
| `uv sync` | 常に実行（ロックファイル更新） |
| `huggingface-cli download` | 既存ディレクトリ → `--local-dir` が差分のみ再開 |
| `git clone` | 既存ディレクトリ → `git pull` で更新 |
| `.env` 作成 | 常に上書き（ルート設定が最新であることを保証） |
| proxy/.env 生成 | 常に上書き |

```bash
#!/usr/bin/env bash
# setup.sh — 環境構築スクリプト（冪等）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

echo "=== mycc 環境セットアップ ==="

# --------------------------------------------------
# Phase 1: 前提条件チェック
# --------------------------------------------------
echo "[Phase 1/6] 前提条件チェック"
if ! check_all; then
  die "前提条件を満たしていません。doctor.sh を実行して不足を確認してください。"
fi

# --------------------------------------------------
# Phase 2: uv プロジェクト初期化
# --------------------------------------------------
echo "[Phase 2/6] uv プロジェクト初期化"
cd "$PROJECT_ROOT"

if [ -f pyproject.toml ]; then
  info "pyproject.toml は既存です（スキップ）"
else
  # uv init --app --python 3.12 が使えない古い uv の場合に備えてフォールバック
  if uv init --app --python 3.12 2>/dev/null; then
    info "uv init --app --python 3.12: OK"
  else
    info "フォールバック: uv init --app && uv python pin 3.12"
    uv init --app
    uv python pin 3.12
  fi
  # デフォルトの main.py/hello.py を削除（CLI アプリではなく依存管理のみ）
  rm -f main.py hello.py
fi

# --------------------------------------------------
# Phase 3: 依存パッケージ追加
# --------------------------------------------------
echo "[Phase 3/6] 依存パッケージ追加"
uv add mtplx huggingface_hub hf_transfer
uv sync
info "依存パッケージ: OK ($(uv run python -c 'import mtplx; print("mtplx", mtplx.__version__)' 2>/dev/null || echo "mtplx 確認済み"))"

# --------------------------------------------------
# Phase 4: モデルダウンロード
# --------------------------------------------------
echo "[Phase 4/6] モデルダウンロード"

MODEL_VARIANT="${MODEL_VARIANT:-quality}"
case "$MODEL_VARIANT" in
  quality)
    MODEL_REPO="Youssofal/Qwen3.6-27B-MTPLX-Optimized-Quality"
    MODEL_DIR_NAME="Qwen3.6-27B-MTPLX-Optimized-Quality"
    ;;
  speed)
    MODEL_REPO="Youssofal/Qwen3.6-27B-MTPLX-Optimized-Speed"
    MODEL_DIR_NAME="Qwen3.6-27B-MTPLX-Optimized-Speed"
    ;;
  *)
    die "未知の MODEL_VARIANT 値です: $MODEL_VARIANT（quality または speed を指定してください）"
    ;;
esac

MODEL_DIR="$PROJECT_ROOT/models/$MODEL_DIR_NAME"
export HF_HUB_ENABLE_HF_TRANSFER=1

if [ -d "$MODEL_DIR" ] && [ -f "$MODEL_DIR/config.json" ]; then
  info "モデルは既にダウンロードされています: $MODEL_DIR"
else
  info "モデルをダウンロードします: $MODEL_REPO"
  info "（27B モデルのため 10〜30 分かかる場合があります）"
  uv run huggingface-cli download \
    "$MODEL_REPO" \
    --local-dir "$MODEL_DIR"
  info "モデルダウンロード完了: $MODEL_DIR"
fi

# --------------------------------------------------
# Phase 5: Claude Code Proxy セットアップ
# --------------------------------------------------
echo "[Phase 5/6] Claude Code Proxy セットアップ"

PROXY_DIR="$PROJECT_ROOT/claude-code-proxy"
if [ -d "$PROXY_DIR/.git" ]; then
  info "claude-code-proxy は既に clone されています（更新）"
  cd "$PROXY_DIR" && git pull
else
  if [ -d "$PROXY_DIR" ]; then
    # .git は無いがディレクトリが存在 → クリーンアップして再 clone
    rm -rf "$PROXY_DIR"
  fi
  cd "$PROJECT_ROOT"
  git clone https://github.com/dbirks/claude-code-proxy.git
fi

cd "$PROXY_DIR"
uv sync 2>/dev/null || {
  # 必要に応じて Python バージョン固定
  uv python pin 3.12
  uv sync
}
info "proxy 依存: OK"

# --------------------------------------------------
# Phase 6: .env 生成
# --------------------------------------------------
echo "[Phase 6/6] 環境変数ファイル生成"

cd "$PROJECT_ROOT"

# ルート .env
MTPLX_PORT="${MTPLX_PORT:-8080}"
PROXY_PORT="${PROXY_PORT:-8082}"
MODEL_NAME="${MODEL_DIR_NAME:-Qwen3.6-27B-MTPLX-Optimized-Quality}"

cat > .env <<ENVEOF
# mycc 環境設定 — このファイルが master です
# setup.sh を再実行すると proxy/.env が再生成されます

MTPLX_PORT=${MTPLX_PORT}
PROXY_PORT=${PROXY_PORT}
MODEL_VARIANT=${MODEL_VARIANT:-quality}
MODEL_DIR=./models/${MODEL_DIR_NAME}
MODEL_NAME=${MODEL_NAME}
OPENAI_BASE_URL=http://127.0.0.1:${MTPLX_PORT}/v1
OPENAI_API_KEY=sk-mtplx-local
ANTHROPIC_BASE_URL=http://127.0.0.1:${PROXY_PORT}
ANTHROPIC_API_KEY=local-test-key
ENVEOF
info "ルート .env 生成完了"

# Proxy 用 .env — .env.example から変数名を動的判別
cd "$PROXY_DIR"
if [ -f .env.example ]; then
  # .env.example から主要なキーを抽出して設定
  {
    echo "# このファイルは setup.sh が自動生成しました"
    echo "# ルート .env を編集して setup.sh を再実行してください"
    echo ""
    grep -E '^[A-Z_]+=' .env.example 2>/dev/null | while IFS='=' read -r key default; do
      case "$key" in
        OPENAI_API_KEY) echo "${key}=sk-mtplx-local" ;;
        OPENAI_BASE_URL) echo "${key}=http://127.0.0.1:${MTPLX_PORT}/v1" ;;
        MODEL|OPENAI_MODEL|DEFAULT_MODEL) echo "${key}=${MODEL_NAME}" ;;
        PROXY_PORT) echo "${key}=${PROXY_PORT}" ;;
        HOST) echo "${key}=127.0.0.1" ;;
        *) echo "${key}=${default}" ;;
      esac
    done
  } > .env
  info "proxy/.env 生成完了（${PROXY_DIR}/.env）"
else
  warn ".env.example が見つかりません。proxy/.env を手動で設定してください。"
  cat > .env <<ENVEOF
OPENAI_API_KEY=sk-mtplx-local
OPENAI_BASE_URL=http://127.0.0.1:${MTPLX_PORT}/v1
MODEL=${MODEL_NAME}
PROXY_PORT=${PROXY_PORT}
HOST=127.0.0.1
ENVEOF
  info "proxy/.env をデフォルト値で生成しました"
fi

# .gitignore 生成（存在しなければ）
cd "$PROJECT_ROOT"
if [ ! -f .gitignore ]; then
  cat > .gitignore <<'GIEOF'
models/
.venv/
claude-code-proxy/
node_modules/
GIEOF
  info ".gitignore 生成完了"
fi

echo ""
echo "=== セットアップ完了 ==="
echo "次のコマンドで起動できます:"
echo "  ./run.sh"
echo "別のターミナルでテスト:"
echo "  ./test.js"
```

### 4. run.sh — サーバー・プロキシ起動

#### 責務

MTPLX 推論サーバーと Claude Code Proxy をこの順に起動する。各プロセスの readiness を確認してから次に進む。Ctrl+C で両プロセスを一括停止する。

#### プロセス管理

```text
run.sh
  ├── source .env（環境変数読込）
  ├── ポート確認（lsof で MTPLX_PORT と PROXY_PORT の空き確認）
  ├── モデル存在確認（不在ならエラー終了）
  │
  ├── [1] MTPLX サーバー起動（background）
  │     uv run mtplx serve ... --port $MTPLX_PORT &
  │     PID_MTPLX=$!
  │
  ├── [2] Readiness ポーリング
  │     until curl -s http://127.0.0.1:$MTPLX_PORT/v1/models; do
  │       sleep 2（最大 120 秒でタイムアウト）
  │     done
  │
  ├── [3] Proxy 起動（background）
  │     cd claude-code-proxy
  │     uv run uvicorn server:app --host 127.0.0.1 --port $PROXY_PORT &
  │     PID_PROXY=$!
  │
  ├── [4] Proxy Readiness 確認
  │     until curl -s http://127.0.0.1:$PROXY_PORT; do
  │       sleep 1（最大 30 秒でタイムアウト）
  │     done
  │
  ├── [5] 起動完了表示
  │     OpenAI:  http://127.0.0.1:$MTPLX_PORT/v1
  │     Anthropic: http://127.0.0.1:$PROXY_PORT
  │     Claude Code: ANTHROPIC_BASE_URL=http://127.0.0.1:$PROXY_PORT claude
  │
  └── [trap] SIGINT/SIGTERM/EXIT → kill $PID_MTPLX $PID_PROXY; wait
```

```bash
#!/usr/bin/env bash
# run.sh — MTPLX サーバー + Claude Code Proxy 起動
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

# .env 読込
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  source "$PROJECT_ROOT/.env"
  set +a
else
  echo "[ERROR] .env が見つかりません。setup.sh を先に実行してください。"
  exit 1
fi

MTPLX_PORT="${MTPLX_PORT:-8080}"
PROXY_PORT="${PROXY_PORT:-8082}"
MODEL_DIR="${MODEL_DIR:-./models/Qwen3.6-27B-MTPLX-Optimized-Quality}"

# クリーンアップ関数
cleanup() {
  echo ""
  echo "=== シャットダウン ==="
  [ -n "${PID_MTPLX:-}" ] && kill "$PID_MTPLX" 2>/dev/null && echo "MTPLX 停止"
  [ -n "${PID_PROXY:-}" ] && kill "$PID_PROXY" 2>/dev/null && echo "Proxy 停止"
  wait 2>/dev/null
  echo "全プロセス停止完了"
}
trap cleanup SIGINT SIGTERM EXIT

# ポート空き確認
check_port() {
  local port="$1" name="$2"
  if lsof -i ":$port" -P -n 2>/dev/null | grep -q LISTEN; then
    echo "[ERROR] ポート $port は既に使用中です（$name）。"
    echo "  lsof -i :$port で占有プロセスを確認し、解放してから再実行してください。"
    echo "  または .env の ${name}_PORT を変更してください。"
    exit 1
  fi
}

check_port "$MTPLX_PORT" "MTPLX"
check_port "$PROXY_PORT" "PROXY"

# モデル確認
ABS_MODEL_DIR="$PROJECT_ROOT/models/$(basename "$MODEL_DIR")"
if [ ! -d "$ABS_MODEL_DIR" ] || [ ! -f "$ABS_MODEL_DIR/config.json" ]; then
  echo "[ERROR] モデルディレクトリが見つかりません: $ABS_MODEL_DIR"
  echo "  ./setup.sh を実行してモデルをダウンロードしてください。"
  exit 1
fi

# MTPLX サーバーコマンド探索
detect_serve_cmd() {
  if uv run mtplx --help 2>/dev/null | grep -q "serve"; then
    echo "mtplx serve"
  elif uv run lightning-mlx --help 2>/dev/null | grep -q "serve"; then
    echo "lightning-mlx serve"
  else
    echo "[ERROR] MTPLX サーバーコマンドが見つかりません。"
    echo "  uv run mtplx --help または uv run lightning-mlx --help で確認してください。"
    exit 1
  fi
}

# --------------------------------------------------
# MTPLX サーバー起動
# --------------------------------------------------
echo "=== MTPLX 推論サーバー起動 ==="
cd "$PROJECT_ROOT"

SERVE_CMD=$(detect_serve_cmd)
info "サーバーコマンド: $SERVE_CMD"

# shellcheck disable=SC2086
uv run $SERVE_CMD \
  --model "$ABS_MODEL_DIR" \
  --port "$MTPLX_PORT" \
  --max-tokens 32768 \
  --temp 0.6 \
  --top-p 0.95 &
PID_MTPLX=$!

# Readiness ポーリング（最大 120 秒）
echo "MTPLX 起動待機中..."
TIMEOUT=120
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
  if curl -sf "http://127.0.0.1:${MTPLX_PORT}/v1/models" >/dev/null 2>&1; then
    echo "MTPLX サーバー準備完了 (${ELAPSED}s)"
    break
  fi
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done
if [ $ELAPSED -ge $TIMEOUT ]; then
  echo "[ERROR] MTPLX サーバーが ${TIMEOUT} 秒以内に起動しませんでした。"
  echo "  logs を確認してください: M2 32GB ではモデルロードに時間がかかる場合があります。"
  exit 1
fi

# --------------------------------------------------
# Claude Code Proxy 起動
# --------------------------------------------------
echo "=== Claude Code Proxy 起動 ==="
cd "$PROJECT_ROOT/claude-code-proxy"

if [ ! -f .env ]; then
  echo "[ERROR] claude-code-proxy/.env が見つかりません。setup.sh を実行してください。"
  exit 1
fi

uv run uvicorn server:app --host 127.0.0.1 --port "$PROXY_PORT" &
PID_PROXY=$!

# Readiness ポーリング（最大 30 秒）
echo "Proxy 起動待機中..."
TIMEOUT=30
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
  if curl -sf "http://127.0.0.1:${PROXY_PORT}" >/dev/null 2>&1; then
    echo "Proxy 準備完了 (${ELAPSED}s)"
    break
  fi
  sleep 1
  ELAPSED=$((ELAPSED + 1))
done
if [ $ELAPSED -ge $TIMEOUT ]; then
  echo "[ERROR] Proxy が ${TIMEOUT} 秒以内に起動しませんでした。"
  kill "$PID_MTPLX" 2>/dev/null
  exit 1
fi

# --------------------------------------------------
# 起動完了表示
# --------------------------------------------------
echo ""
echo "=========================================="
echo "  全プロセス起動完了"
echo "=========================================="
echo ""
echo "  OpenAI 互換（MTPLX）: http://127.0.0.1:${MTPLX_PORT}/v1"
echo "  Anthropic 互換（Proxy）: http://127.0.0.1:${PROXY_PORT}"
echo ""
echo "  別ターミナルで Claude Code を使用:"
echo "    export ANTHROPIC_BASE_URL=http://127.0.0.1:${PROXY_PORT}"
echo "    export ANTHROPIC_API_KEY=local-test-key"
echo "    claude"
echo ""
echo "  別ターミナルでテスト:"
echo "    ./test.js"
echo ""
echo "  停止方法: Ctrl+C"
echo "=========================================="

# フォアグラウンドで待機
wait
```

### 5. test.js — 検証スクリプト

#### 責務

`run.sh` が起動した状態で、6 段階のテストパイプラインを実行する。各段階の結果を個別に表示し、障害箇所を特定可能にする。`--fail-fast` フラグで初回失敗時に停止する。

#### テストパイプライン（6 段階）

| Stage | 対象 | 確認内容 | 期待値 |
|-------|------|---------|--------|
| 1 | MTPLX プロセス | `kill -0` で生存確認 | プロセス生存 |
| 2 | MTPLX /v1/models | GET /v1/models | HTTP 200 + 期待モデル名が response に含まれる |
| 3 | MTPLX /v1/chat/completions | POST 最小リクエスト | HTTP 200 + `choices[0]` が存在 |
| 4 | Proxy プロセス | `kill -0` で生存確認 | プロセス生存 |
| 5 | Proxy / | GET / | HTTP 200 |
| 6 | Proxy /v1/messages | POST Anthropic 形式リクエスト | HTTP 200 + `content` が存在 |

```javascript
#!/usr/bin/env node
// test.js — 6 段階検証スクリプト
// run.sh が起動した状態で実行すること

const http = require('http');

// === Configuration ===
const MTPLX_PORT = parseInt(process.env.MTPLX_PORT || '8080', 10);
const PROXY_PORT = parseInt(process.env.PROXY_PORT || '8082', 10);
const MODEL_NAME = process.env.MODEL_NAME || 'Qwen3.6-27B-MTPLX-Optimized-Quality';
const TIMEOUT = 10000; // 各リクエスト 10 秒タイムアウト
const FAIL_FAST = process.argv.includes('--fail-fast');

let passed = 0;
let failed = 0;

// === Utility ===
function httpRequest(method, hostname, port, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname, port, path, method,
      timeout: TIMEOUT,
      headers: body ? { 'Content-Type': 'application/json' } : {},
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch { /* not JSON */ }
        resolve({ status: res.statusCode, body: data, json: parsed });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function findMTPLXProcess() {
  // pgrep で mtplx または lightning-mlx プロセスを探す
  const { execSync } = require('child_process');
  try {
    const out = execSync('pgrep -f "mtplx serve\\|lightning-mlx serve"', { stdio: 'pipe', timeout: 5000 });
    return out.toString().trim().length > 0;
  } catch {
    return false;
  }
}

function findProxyProcess() {
  const { execSync } = require('child_process');
  try {
    const out = execSync('pgrep -f "uvicorn server:app"', { stdio: 'pipe', timeout: 5000 });
    return out.toString().trim().length > 0;
  } catch {
    return false;
  }
}

function printStage(n, label, ok, detail = '') {
  const mark = ok ? '✅' : '❌';
  console.log(`Stage ${n}: ${mark} ${label}`);
  if (detail) console.log(`         ${detail}`);
}

function summarize() {
  const total = passed + failed;
  console.log('');
  console.log('='.repeat(50));
  console.log(`テスト結果: ${passed}/${total} passed`);
  if (failed === 0) {
    console.log('✅ 全テスト通過 — MTPLX + Proxy 正常動作');
  } else {
    console.log(`❌ ${failed} 件のテスト失敗`);
  }
  console.log('='.repeat(50));
  process.exit(failed > 0 ? 1 : 0);
}

// === Main ===
async function main() {
  console.log('=== mycc テストスクリプト ===');
  console.log(`MTPLX: 127.0.0.1:${MTPLX_PORT}  Proxy: 127.0.0.1:${PROXY_PORT}`);
  console.log(`モデル: ${MODEL_NAME}`);
  console.log(`Fail-Fast: ${FAIL_FAST ? 'ON' : 'OFF'}`);
  console.log('');

  // Stage 1: MTPLX プロセス生存確認
  const mtplxAlive = findMTPLXProcess();
  printStage(1, 'MTPLX プロセス生存確認', mtplxAlive,
    mtplxAlive ? 'プロセス稼働中' : 'プロセスが見つかりません — run.sh を起動してください');
  if (mtplxAlive) { passed++; } else { failed++; if (FAIL_FAST) { summarize(); return; } }

  // Stage 2: /v1/models (OpenAI 互換)
  try {
    const res = await httpRequest('GET', '127.0.0.1', MTPLX_PORT, '/v1/models');
    const modelFound = res.json && JSON.stringify(res.json).includes(MODEL_NAME);
    printStage(2, `GET /v1/models (${res.status})`, res.status === 200 && modelFound,
      res.status === 200
        ? (modelFound ? `モデル "${MODEL_NAME}" 確認` : `モデル名 "${MODEL_NAME}" が応答に含まれていません`)
        : `HTTP ${res.status} — MTPLX が期待通り応答していません`);
    if (res.status === 200 && modelFound) { passed++; } else { failed++; if (FAIL_FAST) { summarize(); return; } }
  } catch (e) {
    printStage(2, 'GET /v1/models', false, `接続エラー: ${e.message}`);
    failed++; if (FAIL_FAST) { summarize(); return; }
  }

  // Stage 3: /v1/chat/completions (OpenAI 互換)
  try {
    const payload = {
      model: MODEL_NAME,
      messages: [{ role: 'user', content: 'Say "hello" in one word.' }],
      max_tokens: 16,
      temperature: 0.6,
    };
    const res = await httpRequest('POST', '127.0.0.1', MTPLX_PORT, '/v1/chat/completions', payload);
    const hasChoices = res.json && res.json.choices && res.json.choices.length > 0;
    printStage(3, 'POST /v1/chat/completions', res.status === 200 && hasChoices,
      res.status === 200
        ? (hasChoices ? `応答: "${(res.json.choices[0].message?.content || '').slice(0, 50)}..."` : 'choices[] が空です')
        : `HTTP ${res.status}`);
    if (res.status === 200 && hasChoices) { passed++; } else { failed++; if (FAIL_FAST) { summarize(); return; } }
  } catch (e) {
    printStage(3, 'POST /v1/chat/completions', false, `接続エラー: ${e.message}`);
    failed++; if (FAIL_FAST) { summarize(); return; }
  }

  // Stage 4: Proxy プロセス生存確認
  const proxyAlive = findProxyProcess();
  printStage(4, 'Proxy プロセス生存確認', proxyAlive,
    proxyAlive ? 'プロセス稼働中' : 'プロセスが見つかりません');
  if (proxyAlive) { passed++; } else { failed++; if (FAIL_FAST) { summarize(); return; } }

  // Stage 5: GET / (Proxy)
  try {
    const res = await httpRequest('GET', '127.0.0.1', PROXY_PORT, '/');
    printStage(5, 'GET Proxy /', res.status === 200, `HTTP ${res.status}`);
    if (res.status === 200) { passed++; } else { failed++; if (FAIL_FAST) { summarize(); return; } }
  } catch (e) {
    printStage(5, 'GET Proxy /', false, `接続エラー: ${e.message}`);
    failed++; if (FAIL_FAST) { summarize(); return; }
  }

  // Stage 6: POST /v1/messages (Anthropic 互換 — proxy 経由)
  try {
    const payload = {
      model: MODEL_NAME,
      max_tokens: 16,
      messages: [{ role: 'user', content: 'Say "hello" in one word.' }],
    };
    const res = await httpRequest('POST', '127.0.0.1', PROXY_PORT, '/v1/messages', payload);
    const hasContent = res.json && res.json.content && res.json.content.length > 0;
    printStage(6, 'POST /v1/messages (Anthropic)', res.status === 200 && hasContent,
      res.status === 200
        ? (hasContent ? '応答あり' : 'content が空です')
        : `HTTP ${res.status}`);
    if (res.status === 200 && hasContent) { passed++; } else { failed++; if (FAIL_FAST) { summarize(); return; } }
  } catch (e) {
    printStage(6, 'POST /v1/messages (Anthropic)', false, `接続エラー: ${e.message}`);
    failed++; if (FAIL_FAST) { summarize(); return; }
  }

  summarize();
}

main().catch((e) => {
  console.error('予期しないエラー:', e);
  process.exit(1);
});
```

### 6. .env リファレンス

ルート `.env` は全設定の master である。`setup.sh` を再実行すると `proxy/.env` がこのファイルから再生成される。

| 変数名 | デフォルト値 | 説明 |
|--------|------------|------|
| `MTPLX_PORT` | `8080` | MTPLX 推論サーバーのポート番号 |
| `PROXY_PORT` | `8082` | Claude Code Proxy のポート番号 |
| `MODEL_VARIANT` | `quality` | モデルバリアント（`quality` / `speed`） |
| `MODEL_DIR` | `./models/Qwen3.6-27B-MTPLX-Optimized-Quality` | モデルディレクトリ（派生値） |
| `MODEL_NAME` | `Qwen3.6-27B-MTPLX-Optimized-Quality` | モデル識別名（派生値） |
| `OPENAI_BASE_URL` | `http://127.0.0.1:8080/v1` | MTPLX の API エンドポイント（派生値） |
| `OPENAI_API_KEY` | `sk-mtplx-local` | MTPLX の API 認証キー |
| `ANTHROPIC_BASE_URL` | `http://127.0.0.1:8082` | Claude Code から見た Proxy エンドポイント（派生値） |
| `ANTHROPIC_API_KEY` | `local-test-key` | Claude Code から見た Proxy 認証キー |

`.env` 使用方法：

```bash
# スクリプト内での .env 読込（run.sh 参照）
set -a
source .env
set +a

# 環境変数の上書き（一時的なポート変更など）
MTPLX_PORT=9090 ./run.sh

# Claude Code 起動（別ターミナル）
export ANTHROPIC_BASE_URL=http://127.0.0.1:8082
export ANTHROPIC_API_KEY=local-test-key
claude
```

### 7. エラーハンドリングと障害モード

#### 障害モード一覧

| # | 症状 | 原因 | 診断方法 | 対策 |
|---|------|------|---------|------|
| 1 | `doctor.sh` が「Apple Silicon ではありません」 | Intel Mac または VM | `uname -m` + `sysctl -n hw.optional.arm64` | Apple Silicon Mac に移行 |
| 2 | `doctor.sh` が「Homebrew がありません」 | Homebrew 未導入 | `brew --version` | 表示されたインストールコマンドを実行 |
| 3 | `setup.sh` が Phase 1 でエラー終了 | 前提条件不足 | `./doctor.sh` で不足を確認 | 表示された手順でツールをインストール |
| 4 | `run.sh` が「ポート使用中」 | 既存プロセスがポート占有 | `lsof -i :8080` または `lsof -i :8082` | `.env` でポート変更、または占有プロセス停止 |
| 5 | `run.sh` が「モデルが見つかりません」 | モデル未ダウンロード | `ls -la models/` | `./setup.sh` を実行 |
| 6 | `run.sh` MTPLX readiness タイムアウト | モデルロード時間超過、または M2 32GB でメモリ不足 | MTPLX の stderr 出力を確認 | `--max-tokens` を 16384 に下げる、他のアプリを閉じる |
| 7 | `test.js` Stage 2 失敗 | MTPLX が応答しない | `curl http://127.0.0.1:8080/v1/models` | run.sh の起動順序と readiness を確認 |
| 8 | `test.js` Stage 6 失敗 | Proxy 経由の変換が動作しない | `curl http://127.0.0.1:8082/v1/messages ...` | proxy/.env のモデル名と OPENAI_BASE_URL を確認 |
| 9 | `mtplx serve` コマンドが見つからない | 配布形態変更 | `uv run mtplx --help` | `lightning-mlx serve` を試行、または upstream の README を確認 |
| 10 | 期待した速度が出ない | M2 32GB では M5 Max より低速 | 同一プロンプトで mlx-optiq と比較 | Quality 版で安定性優先、必要なら Speed 版に変更 |

#### 全スクリプト共通ルール

```bash
# 全スクリプトが従うルール：
# 1. 冒頭に set -euo pipefail
# 2. エラー時は die() 関数で原因と対策を表示して exit 1
# 3. 成功時は終了コード 0
# 4. 全て標準出力に結果を表示（ログファイルは作成しない）
# 5. サブシェル (cd dir && cmd) で cwd を汚染しない
```

---

## Appendix

### A. 使用手順概要

```bash
# 1. 環境診断（必須ツールの過不足確認）
./doctor.sh

# 2. 環境セットアップ（前提チェック→uv init→依存追加→モデルDL→proxy clone→.env生成）
./setup.sh

# 3. 起動（MTPLX サーバー + Proxy、Ctrl+C で停止）
./run.sh

# 4. 検証（別ターミナルで、run.sh 起動中に実行）
./test.js
# または全テスト実行後に結果確認:
./test.js --fail-fast
# 初回失敗で停止するモード
```

### B. uv scripts によるショートカット（参考）

`pyproject.toml` に以下を追加することで起動が簡略化できる（uv バージョンにより対応状況が異なる）：

```toml
[tool.uv.scripts]
serve-quality = "mtplx serve --model ./models/Qwen3.6-27B-MTPLX-Optimized-Quality --port 8080 --max-tokens 32768 --temp 0.6 --top-p 0.95"
serve-speed = "mtplx serve --model ./models/Qwen3.6-27B-MTPLX-Optimized-Speed --port 8080 --max-tokens 32768 --temp 0.6 --top-p 0.95"
inspect = "mtplx inspect ./models/Qwen3.6-27B-MTPLX-Optimized-Quality"

# 使用例:
# uv run serve-quality
# uv run inspect
```

### C. トラブルシューティング: 最短確認手順

```bash
# どこで問題が起きているか特定する
echo "1. MTPLX サーバープロセス"
pgrep -f "mtplx.*serve" && echo "OK" || echo "NOT RUNNING"

echo "2. MTPLX API 応答"
curl -sf http://127.0.0.1:8080/v1/models && echo "OK" || echo "NOT RESPONDING"

echo "3. Proxy プロセス"
pgrep -f "uvicorn.*server:app" && echo "OK" || echo "NOT RUNNING"

echo "4. Proxy API 応答"
curl -sf http://127.0.0.1:8082 && echo "OK" || echo "NOT RESPONDING"

echo "5. Proxy 経由 Anthropic 互換"
curl -sf -X POST http://127.0.0.1:8082/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: local-test-key" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"Qwen3.6-27B-MTPLX-Optimized-Quality","max_tokens":16,"messages":[{"role":"user","content":"hi"}]}' \
  && echo "OK" || echo "NOT RESPONDING"
```

### D. モデルバリアント切替

```bash
# Speed 版に切り替える場合
MODEL_VARIANT=speed ./setup.sh

# 切り替え後の起動
./run.sh
```

---

*End of RFC*
