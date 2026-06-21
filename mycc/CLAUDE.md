# mycc — MTPLX + Claude Code Proxy 環境セットアップスクリプト群 — 設計全体マップ

> このファイルは `/formulate-tickets` によって自動生成されました。
> **生成元:** mycc/RFC.md
> **生成日:** 2026-06-21

## 目的とスコープ

Apple Silicon Mac (M2 以降, 32GB RAM 推奨) 上で MTPLX (MLX-based 推論エンジン) と Claude Code Proxy を用いて Qwen3.6-27B をローカル実行するための環境構築・起動・検証スクリプト群 (`common.sh`, `doctor.sh`, `setup.sh`, `run.sh`, `test.js`) を提供する。全スクリプトは `mycc/` ディレクトリをプロジェクトルートとし、Python 依存は `uv` で一元管理する。

## アーキテクチャ概要

```
mycc/ (プロジェクトルート)
├── common.sh       — 共通関数集（color helpers, チェック関数）
├── doctor.sh       — 環境診断（source common.sh）
├── setup.sh        — 環境構築（source common.sh, 冪等）
├── run.sh          — プロセス起動（MTPLX → Proxy）
├── test.js         — 6段階検証（Node.js built-in http）
├── .env            — 環境変数 master（proxy/.env は setup.sh が自動生成）
├── .gitignore      — models/ .venv/ claude-code-proxy/ node_modules/
├── pyproject.toml  — uv プロジェクト定義（setup.sh が生成）
├── .python-version — Python 3.12 固定
├── models/         — ダウンロードモデル（git 管理外）
└── claude-code-proxy/ — upstream clone（git 管理外）
```

### 主要コンポーネントと責務

| コンポーネント | 責務 | 言語 | 外部依存 |
|---|---|---|---|
| `common.sh` | 色付き出力、Apple Silicon/Homebrew/ツール/モデル確認 | Shell | stdlib only |
| `doctor.sh` | 全前提条件を一項目ずつチェック、不足時は手順表示 | Shell | common.sh |
| `setup.sh` | uv init → 依存追加 → モデルDL → proxy clone → .env 生成（冪等） | Shell | common.sh, uv, huggingface-cli, git |
| `run.sh` | MTPLX 起動 → readiness polling → Proxy 起動 → trap 停止 | Shell | .env, mtplx, uvicorn |
| `test.js` | 6段階テスト（プロセス生存 → API応答 → proxy変換） | Node.js | http module only |
| `.env` | 全設定の master（MTPLX_PORT, PROXY_PORT, MODEL_VARIANT 等） | Config | — |

## 主要な決定事項

| ID | 決定 | 内容 |
|----|------|------|
| Q1 | ルート | mycc/ をプロジェクトルート、models/ は git 管理外 |
| Q2 | モデル | Quality 版デフォルト、`MODEL_VARIANT=speed` で切替 |
| Q3 | ポート | `MTPLX_PORT` / `PROXY_PORT` 環境変数、占有時エラー表示 |
| Q4 | エラー | 不足ツールは一覧表示＋手順提示（自動インストールしない） |
| Q5 | プロセス管理 | バックグラウンドジョブ + `trap` で一括終了 |
| Q6 | テスト | 6段階テスト＋モデル名検証＋`--fail-fast` |
| Q7 | .env | ルート `.env` 一元管理、proxy/.env は setup.sh が自動生成 |
| Q8 | 配置 | ルート直置き（scripts サブディレクトリなし） |
| Q11 | ログ | 全て標準出力、ログファイル不要 |
| Q16 | test.js | Node.js ビルトイン `http` モジュールのみ |

## 依存関係グラフ（5層モデル）

```
Layer 0（型定義/設定）:
  .gitignore, .python-version, 環境変数定義, 関数シグネチャ

Layer 1（純粋関数・独立ロジック）:
  common.sh の全関数（info/warn/error/die, check_* 群）
      ↑ 依存なし（独立）

Layer 2（外部ツール呼び出し）:
  doctor.sh ──source──→ common.sh
  setup.sh  ──source──→ common.sh
                     ──→ 外部依存: uv, huggingface-cli, git
  test.js   ──→ Node.js built-in http のみ

Layer 3（ライフサイクル管理）:
  run.sh ──source──→ .env
       ──→ 外部依存: mtplx, uvicorn (uv run経由)
       ──→ readiness polling, trap cleanup

Layer 4（統合・E2E）:
  全スクリプト連携テスト
  障害モード検証（10種類）
```

**実装順序**: Layer 0 → Layer 1 → Layer 2 → Layer 3 → Layer 4

## スタブ一覧と解決計画

本設計書に基づく実装では、以下のスタブが発生する：

| スタブ | 内容 | 解決チケット | 解決方法 |
|--------|------|-------------|---------|
| `[::STUB::] detect_serve_cmd` | MTPLX サーバーコマンドの動的検出（mtplx serve / lightning-mlx serve） | M2-1 | run.sh 内で実装。動的コマンド検出ロジックは本チケットで完結 |
| `[::STUB::] check_port` | lsof によるポート空き確認 | M2-1 | run.sh 内で実装 |
| `[::STUB::] MTPLX readiness polling` | curl + ループ + タイムアウト | M2-1 | run.sh 内の readiness ポーリングループで実装 |
| `[::STUB::] Proxy readiness polling` | curl + ループ + タイムアウト | M2-1 | run.sh 内の readiness ポーリングループで実装 |
| `[::STUB::] cleanup trap` | SIGINT/SIGTERM/EXIT による一括停止 | M2-1 | run.sh の trap + cleanup 関数で実装 |
| `[::STUB::] httpRequest utility` | Node.js 汎用 HTTP リクエスト関数 | M3-1 | test.js 内で実装 |
| `[::STUB::] findMTPLXProcess / findProxyProcess` | pgrep によるプロセス検出 | M3-1 | test.js 内で実装 |
| `[::STUB::] printStage / summarize` | テスト結果整形・集約 | M3-1 | test.js 内で実装 |
