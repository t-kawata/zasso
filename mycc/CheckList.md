# RFC 要件チェックリスト

> **⚠️ このファイルはスクリプトにより自動生成された雛形です。**
> AIが目視チェックし、補足事項・プロジェクト固有の制約を追記してから使用すること。

生成日時: 2026-06-21T03:32:08.263Z
DesignTree バージョン: 1

---

## 全体チェック

- [x] RFC全体にTBD / TODO / スタブ / 委譲 が0件であること
- [x] 全セクションにコードスニペットが含まれていること
- [x] DesignTreeの全ノードがRFCのいずれかのセクションに対応していること

---

## §1 アーキテクチャ全体像とプロジェクト構成 ✅

- [x] セクション全体が完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

### §1.1 mycc/ のディレクトリ構成（.gitignore で models/ 除外） ✅

- [x] **mycc/ のディレクトリ構成（.gitignore で models/ 除外）** が設計として完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §1.2 環境変数設計（MTPLX_PORT, PROXY_PORT, MODEL_VARIANT 等） ✅

- [x] **環境変数設計（MTPLX_PORT, PROXY_PORT, MODEL_VARIANT 等）** が設計として完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


---

## §2 doctor.sh — 環境チェック・自動インストール ✅

- [x] セクション全体が完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

### §2.1 チェック項目一覧（brew, python3.12, git, uv, node, claude, huggingface-cli） ✅

- [x] **チェック項目一覧（brew, python3.12, git, uv, node, claude, huggingface-cli）** が設計として完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §2.2 モデル不在チェックと自動ダウンロード ✅

- [x] **モデル不在チェックと自動ダウンロード** が設計として完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §2.3 Q12=B: 不足ツールの自動インストールは行わず、一覧表示と手順提示のみ ✅

- [x] **Q12=B: 不足ツールの自動インストールは行わず、一覧表示と手順提示のみ** が設計として完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §2.4 Q13=C: common.sh に関数切り出し、doctor.sh と setup.sh 両方から source ✅

- [x] **Q13=C: common.sh に関数切り出し、doctor.sh と setup.sh 両方から source** が設計として完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §2.5 Q14=B: Claude Code 不在時は手動インストール手順表示のみ ✅

- [x] **Q14=B: Claude Code 不在時は手動インストール手順表示のみ** が設計として完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §2.6 Q15=A: Apple Silicon チェック（uname -m）で arm64 以外はエラー終了 ✅

- [x] **Q15=A: Apple Silicon チェック（uname -m）で arm64 以外はエラー終了** が設計として完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


---

## §3 setup.sh — 環境構築・モデル配置 ✅

- [x] セクション全体が完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

### §3.1 uv init / uv add / uv sync の自動実行 ✅

- [x] **uv init / uv add / uv sync の自動実行** が設計として完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §3.2 claude-code-proxy の clone, uv sync, .env 自動生成 ✅

- [x] **claude-code-proxy の clone, uv sync, .env 自動生成** が設計として完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §3.3 Q13=C: setup.sh 冒頭で common.sh を source しチェック実行、不全時はエラー終了＋明確なメッセージ ✅

- [x] **Q13=C: setup.sh 冒頭で common.sh を source しチェック実行、不全時はエラー終了＋明確なメッセージ** が設計として完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


---

## §4 run.sh — サーバー・プロキシ起動 ✅

- [x] セクション全体が完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §5 test.js — 両エンドポイント検証（Node.js 実装） ✅

- [x] セクション全体が完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

### §5.1 テスト段階定義（ヘルスチェック→OpenAI→Proxy→Anthropic の4段階以上） ✅

- [x] **テスト段階定義（ヘルスチェック→OpenAI→Proxy→Anthropic の4段階以上）** が設計として完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §5.2 Q16=A: Node.js ビルトイン http モジュールのみで test.js 実装（.sh ではなく .js） ✅

- [x] **Q16=A: Node.js ビルトイン http モジュールのみで test.js 実装（.sh ではなく .js）** が設計として完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


---

## §6 エラーハンドリング・ログ・セーフガード ✅

- [x] セクション全体が完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

### §6.1 既知の障害モードと診断メッセージ ✅

- [x] **既知の障害モードと診断メッセージ** が設計として完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


---

---

## AI補足: プロジェクト固有の制約・注意事項

### 言語制約
- [x] Python は可能な限り使用せず、shell / Node.js で実装すること
- [x] shell で実装不可能な処理のみ Node.js を使用し、test.js 以外は shell で記述すること（Q10=C）

### 実行環境制約
- [x] macOS Apple Silicon（arm64）のみを対象とすること（G1）
- [x] Apple Silicon チェックは `uname -m` に加え `sysctl -n hw.optional.arm64` でも確認すること
- [x] Homebrew が存在しない場合はエラー終了し、インストール手順を表示すること（Q4=A）

### スクリプト設計
- [x] 全スクリプトの冒頭に `set -euo pipefail` を記述すること
- [x] エラー時は常に非ゼロ終了コードを返すこと
- [x] 各スクリプトは `chmod +x` で実行可能にすること
- [x] Node.js スクリプト（test.js）の shebang は `#!/usr/bin/env node` とすること
- [x] Makefile に依存せず、単独で実行可能なスクリプトとすること

### setup.sh 詳細要件
- [x] 冪等性を保つこと：2回目実行時は既存ステップをスキップする（G2）
- [x] `uv init --app --python 3.12` が使えない場合は `uv init --app && uv python pin 3.12` にフォールバックすること（G6）
- [x] `mtplx serve` が使えない場合は `lightning-mlx serve` を試行すること（G5）
- [x] claude-code-proxy の .env はルート .env から自動生成し、変数名は .env.example から自動判別すること（G7）

### run.sh 詳細要件
- [x] MTPLX サーバー起動後、`/v1/models` へのポーリングで readiness を確認してから proxy を起動すること（G3）
- [x] ポーリングの最大待機時間は 120 秒とし、タイムアウト時はエラー終了すること
- [x] `trap` で SIGINT/SIGTERM を捕捉し、子プロセスを確実に停止すること

### test.js 詳細要件
- [x] 以下の 6 段階のテストパイプラインを実装すること（Q9=C）:
  1. MTPLX プロセス生存確認（kill -0）
  2. GET /v1/models → HTTP 200 + 期待モデル名が含まれること
  3. POST /v1/chat/completions → HTTP 200 + choices[] が存在すること
  4. Proxy プロセス生存確認（kill -0）
  5. GET proxy → HTTP 200
  6. POST proxy /v1/messages → HTTP 200 + content が存在すること
- [x] `--fail-fast` フラグで最初の失敗時に停止するオプションを持つこと（Q6=C）
- [x] 各段階に 10 秒のタイムアウトを設定すること

### 環境変数設計（G4）
- [x] ルート `.env` に以下の変数を定義すること:
  | 変数名 | デフォルト値 | 説明 |
  |--------|------------|------|
  | `MTPLX_PORT` | 8080 | MTPLX サーバーのポート |
  | `PROXY_PORT` | 8082 | Claude Code proxy のポート |
  | `MODEL_VARIANT` | quality | quality または speed |
  | `MODEL_DIR` | ./models/Qwen3.6-27B-MTPLX-Optimized-Quality | モデルディレクトリ（派生） |
  | `MODEL_NAME` | Qwen3.6-27B-MTPLX-Optimized-Quality | モデル名（派生） |
  | `OPENAI_BASE_URL` | http://127.0.0.1:8080/v1 | MTPLX の API エンドポイント（派生） |
  | `OPENAI_API_KEY` | sk-mtplx-local | MTPLX の API キー |
  | `ANTHROPIC_BASE_URL` | http://127.0.0.1:8082 | Proxy のエンドポイント（派生） |
  | `ANTHROPIC_API_KEY` | local-test-key | Proxy の API キー |

### ログ出力
- [x] 全て標準出力のみとし、ログファイルは作成しないこと（Q11）