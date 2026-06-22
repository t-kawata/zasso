---
ticket_id: 176
title: M1-2: setup.sh — 環境構築スクリプト（冪等）
slug: m1-2-setupsh
status: reviewed
created_at: 2026-06-21
updated_at: 2026-06-21
plan_path: 
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0176-m1-2-setupsh/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0176-m1-2-setupsh/review.md
---

# M1-2: setup.sh — 環境構築スクリプト（冪等）

## Summary

Apple Silicon Mac 上で MTPLX + Claude Code Proxy の環境を完全自動化かつ冪等に構築する `setup.sh` を実装する。`common.sh` で前提条件を確認後、6 つの Phase（uv プロジェクト初期化 → 依存追加 → モデル DL → Proxy クローン → .env 生成）を逐次実行する。各 Phase は冪等性ルールに従い、既存リソースを破壊せず差分のみ処理する。このスクリプトが唯一 `.env` を生成する権限を持ち、`proxy/.env` の master となる。

## Background

Claude Code をローカルの LLM（MTPLX + Qwen3.6-27B）で動作させるには、(1) uv プロジェクトの作成、(2) mtplx / huggingface_hub 等の依存追加、(3) 27B モデルのダウンロード、(4) Claude Code Proxy のクローンとセットアップ、(5) `.env` と `proxy/.env` の生成が必要である。これらの手順を手動で行うと以下問題が発生する：

- **再現性の欠如**: 手順の省略や環境差分による失敗が頻発する
- **冪等性の欠如**: 再実行時に既存リソースを破壊するリスクがある
- **.env の不整合**: ルート `.env` と `proxy/.env` の値がずれる

本チケットは `setup.sh` を実装し、環境構築を完全自動化する。`doctor.sh` で確認された前提条件を元に、安全かつ冪等に処理を進める。

## Scope

### 実装範囲

- `mycc/setup.sh` ファイルの新規作成（`#!/usr/bin/env bash` + `set -euo pipefail`）
- `SCRIPT_DIR` / `PROJECT_ROOT` の解決と `source common.sh`
- **Phase 1 (前提条件チェック)**: `check_all` 呼び出し、不全時 `die`
- **Phase 2 (uv プロジェクト初期化)**:
  - `pyproject.toml` 既存 → スキップ
  - 新規 → `uv init --app --python 3.12`（フォールバック: `uv init && uv python pin 3.12`）
  - デフォルトの `main.py` / `hello.py` 削除
- **Phase 3 (依存パッケージ追加)**:
  - `uv add mtplx huggingface_hub hf_transfer`
  - `uv sync`（常に実行）
  - バージョン確認（`uv run python -c 'import mtplx; print(mtplx.__version__)'`）
- **Phase 4 (モデルダウンロード)**:
  - `MODEL_VARIANT` によるバリアント切替（quality/speed）
  - `HF_HUB_ENABLE_HF_TRANSFER=1` 設定
  - 既存モデル + `config.json` 存在 → スキップ（差分のみ再開）
  - `uv run huggingface-cli download --local-dir` で 27B モデル DL
- **Phase 5 (Claude Code Proxy セットアップ)**:
  - 既存 `.git` → `git pull` で更新
  - 新規 → `git clone https://github.com/dbirks/claude-code-proxy.git`
  - 中途半端なディレクトリ（.git なし）→ `rm -rf` + clone
  - `uv sync`（必要に応じて `uv python pin 3.12` → sync）
- **Phase 6 (.env 生成)**:
  - `MTPLX_PORT` / `PROXY_PORT` / `MODEL_NAME` の解決（デフォルト値使用）
  - ルート `.env` 生成（常に上書き）
  - proxy/.env 生成:
    - `.env.example` 存在時: キーを抽出して設定値を注入
    - 不存在時: デフォルト値で生成
  - `.gitignore` 生成（不在時のみ）

### 非スコープ

- ツールの自動インストール（Q4 ポリシー: 不足時はエラー終了 + 手順表示のみ）
- モデル検証（内容のチェックは test.js の責務）
- プロセス起動（run.sh の責務）
- 環境診断（doctor.sh の責務）
- 共通関数の修正（common.sh は既存の reviewed チケットで完了）
- Node.js や npm パッケージのインストール

## Investigation

### 関連ソースコード調査

**Tickets.md (M1-2 セクション, L110-L158)**:
- 各 Phase の冪等性ルール、エラーハンドリング、境界値ケースが定義されている
- テストケース 9 項目が列挙済み

**RFC.md (§3. setup.sh, L302-L508)**:
- 完全な実装コード（全 200 行強）が既に設計されている
- 冪等性ルール一覧（7 項目）が表で定義されている
- 各 Phase の実装詳細は全てコードとして確定済み

**依存関係 (特になし)**:
- M0-1 (173): common.sh color helpers — reviewed 済み
- M0-2 (174): common.sh 環境チェック関数群 — reviewed 済み
- M1-1 (175): doctor.sh — reviewed 済み
- 既存の `mycc/` ディレクトリに `common.sh` と `doctor.sh` が配置済み

### スタブ調査

`mycc/` ディレクトリ内に `[::STUB::]` マーカーは存在しない。setup.sh の実装は RFC.md で完全にコード定義されており、スタブの必要はない。

### 関連決定事項（RFC.md より）

| ID | 決定 | 内容 |
|----|------|------|
| Q1 | ルート | mycc/ をプロジェクトルート、models/ は git 管理外 |
| Q2 | モデル | Quality 版デフォルト、`MODEL_VARIANT=speed` で切替 |
| Q3 | ポート | `MTPLX_PORT` / `PROXY_PORT` 環境変数 |
| Q7 | .env | ルート `.env` 一元管理、proxy/.env は setup.sh が自動生成 |
| Q8 | 配置 | ルート直置き構造（scripts サブディレクトリなし） |
| Q11 | ログ | 全て標準出力、ログファイル不要 |
| Q12 | エラー | 不足ツールはエラー終了 + 手順提示（自動インストールしない） |

## Test Plan

### ユニットテスト計画

setup.sh はシェルスクリプト（Bash）であり、ネットワーク依存・外部リポジトリ依存を含む。テストを以下の方針で設計する。

**基本方針: モック（外部コマンドの代替バイナリ）は原則禁止。**
代わりに以下の技法を適用する：

| 技法 | 説明 | 適用対象 |
|------|------|---------|
| **実コマンドの使用** | doctor.sh で存在が保証されるツール（`uv`, `git`）は実際に実行する | Phase 2 (uv init), Phase 5 (git clone) |
| **PATH 操作** | テスト内で `PATH` を制御し、特定コマンドの存在/不在を切り替える。ただし「モック」ではなく「テンポラリな実行環境の構成」と位置づける | Phase 1 (check_all), Phase 4 (huggingface-cli) |
| **ローカルリポジトリ** | git clone のテストは、一時ディレクトリにローカル git レポジトリを作成して行う（ネットワーク非依存） | Phase 5 (git clone/pull 分岐) |
| **ファイルシステム操作** | 一時ディレクトリで pyproject.toml の有無、モデルディレクトリの有無、.env の内容を制御する | Phase 2/4/6 の冪等性テスト |

**各 Phase のテスト方法:**

| Phase | テスト方法 | モックの有無 |
|-------|-----------|-------------|
| 1 (前提条件) | `check_all` を実実行。一部ツールの不在シナリオは PATH 操作で制御（実コマンドを隠蔽することで不在をシミュレート） | PATH 操作のみ |
| 2 (uv init) | `pyproject.toml` の有無をファイル操作で制御。`uv init` は実コマンドを実行 | なし（実 uv） |
| 3 (依存追加) | `uv add` は実コマンドを実行。ネットワークが必要なため、テスト時間を考慮し「モジュール import 確認」はフォールバック可 | なし（実 uv） |
| 4 (モデルDL) | `huggingface-cli` は setup.sh 自身がインストールするためテスト時に存在しない。不在時のエラーパスは PATH 操作で確認 | PATH 操作のみ |
| 5 (git clone) | ローカルの一時 git レポジトリを作成し、`git clone` / `git pull` を実コマンドで実行 | なし（実 git） |
| 6 (.env 生成) | 一時ディレクトリで .env の内容を cat → grep で検証。ファイルシステム操作のみ | なし |

### ユニットテスト計画

テストファイル: `tests/test-setup.sh`
フレームワーク: シェルベース単体テスト（record 関数によるカウンタ管理）

**テストケース一覧:**

| # | Phase | ケース名 | テスト方法 | 正常/異常 |
|---|-------|---------|-----------|----------|
| 1 | 1 | check_all 不全 → die | PATH から一部ツールを除去 → Phase 1 で die + exit 1 | 異常 |
| 2 | 2 | pyproject.toml 既存 → スキップ | 事前に pyproject.toml を作成 → Phase 2 で上書きされない | 正常 |
| 3 | 2 | 新規 init → pyproject.toml 生成 | 空ディレクトリ → uv init → pyproject.toml 生成 + main.py 削除 | 正常 |
| 4 | 4 | config.json 既存 → スキップ | モデルディレクトリ + config.json を事前作成 → 上書きされない | 正常 |
| 5 | 4 | MODEL_VARIANT=speed 切替 | 環境変数設定 → Speed 版ディレクトリが作成される | 正常 |
| 6 | 4 | MODEL_VARIANT=invalid → エラー | 不正な値 → エラー終了 | 異常 |
| 7 | 5 | .git 既存 → 維持 | 既存の .git ディレクトリ → git pull 相当（実 git 使用） | 正常 |
| 8 | 5 | 新規 → git clone（ローカルリポジトリ） | ローカルに一時レポジトリを作成 → `git clone` でクローン | 正常 |
| 9 | 5 | 中途半端なディレクトリ → クリーンアップ後 clone | .git なしディレクトリ → 削除 → clone | 正常 |
| 10 | 6 | ルート .env が正しく生成される | デフォルト値 → MTPLX_PORT=8080, PROXY_PORT=8082, MODEL_NAME 存在 | 正常 |
| 11 | 6 | proxy/.env が .env.example から生成 | .env.example 存在 → キー注入の確認 | 正常 |
| 12 | 6 | proxy/.env がデフォルト値で生成 | .env.example 不在 → フォールバック確認 | 正常 |
| 13 | 6 | .gitignore 不在時のみ生成 | なし → 作成 / 既存 → 上書きされない | 正常 |
| 14 | — | 冪等性: 2回連続実行 | 全 Phase を2回実行 → リソース維持 | 正常 |

**カバレッジ目標**: 80%（クリティカルパス: Phase の冪等性分岐は 100%）

### ユニットテスト不可能な項目（例外）

真にユニットテスト不可能な項目のみを列挙する：

| 項目 | 理由 | 代替手段 |
|------|------|---------|
| 実際のモデルダウンロード（Phase 4） | 27B のモデルファイルをテストでダウンロードするのは非現実的（10〜30分）。ディスク使用量も過大 | config.json の有無で冪等性の分岐をテスト |
| 実際の `huggingface-cli download` の挙動 | このコマンドは setup.sh 自身が `uv add huggingface_hub` した後にのみ利用可能。循環依存 | PATH 操作でコマンド不在パスを確認。ダウンロード成功の分岐は config.json 有無で代用 |
| `uv add` のネットワーク依存（Phase 3） | パッケージダウンロードにはネットワークが必要。CI がオフラインの可能性 | `uv add` は実コマンドを実行し、ネットワークエラー時はテストをスキップ（または CI でのみ実行） |

## Boy Scout Rule — 翻訳可能性計画

### 本チケットで新規作成するコード

`setup.sh` は新規ファイルだが、以下の翻訳可能性原則を遵守する：

1. **関数名/変数名が散文として読めるか**: Phase のコメント区切り + 変数名（`MODEL_VARIANT`, `MODEL_DIR`, `PROXY_DIR`）はすべてドメイン概念を正確に表現する。関数抽出可能な処理ブロック（例: `.env` 生成ブロック）は将来リファクタリング候補として意識する
2. **責務が混在している関数は分割すべきか**: 現状 `setup.sh` は 6 つの Phase が 1 スクリプトに収まっているが、各 Phase は明確に区切られており、かつこの粒度が適切（Q8 の「ルート直置き」ポリシーに従う）。Phase 内の複雑なロジック（proxy/.env のキー注入など）は将来の関数抽出候補
3. **ハードコード値を定数化すべきか**: 以下の値は `common.sh` の定数として共通化を検討する:
   - モデルリポジトリ名（`Youssofal/Qwen3.6-27B-MTPLX-Optimized-*`）
   - ポート番号（デフォルト 8080/8082）→ 環境変数で既に抽象化済み
   - `claude-code-proxy` リポジトリ URL → 定数化候補
4. **コメントが「なぜ」を説明しているか**: Phase 区切りコメント + 冪等性の理由コメントを日本語で記述する。フォールバックパスの理由（古い uv 対策）は特に明確にコメントする

### スコープ外だが触る可能性のある既存コード

- `common.sh`: setup.sh から source するが、既存の common.sh は変更しない（M0-1/M0-2 で reviewed 済み）。ただし、コメントの不備や翻訳可能性違反を発見した場合は修正する

## Acceptance Criteria

- [ ] `setup.sh` が新規ディレクトリで全 Phase を正常に完了する
- [ ] 冪等性: 2 回連続実行しても既存リソースが破壊されない
- [ ] 冪等性: `pyproject.toml` 既存時、Phase 2 がスキップされる
- [ ] 冪等性: `config.json` 既存時、モデルダウンロードがスキップされる
- [ ] 冪等性: `.git` 既存 → `git pull`、新規 → clone、中途半端 → クリーンアップ
- [ ] 異常系: Phase 1 で前提不足 → `die` + エラー表示 + exit 1
- [ ] 切替: `MODEL_VARIANT=speed ./setup.sh` → Speed 版パスで設定される
- [ ] 切替: `MODEL_VARIANT` 不正値 → エラー終了
- [ ] 境界値: proxy/.env の `.env.example` 不在フォールバックが動作する
- [ ] 翻訳可能性の検証が通っている
- [ ] 既存テストが通過している

## Notes

### 参照元

- **Tickets.md**: M1-2 セクション（L110-L158）
- **RFC.md**: §3. setup.sh — 環境構築（L302-L508）
- **設計全体マップ**: mycc/CLAUDE.md

### 依存関係

- **先行実装必須**: M0-1 (173, reviewed), M0-2 (174, reviewed) — common.sh の関数群
- **先行実装必須**: M1-1 (175, reviewed) — doctor.sh（テスト時に前提条件確認手順を流用）
- **並列可能**: M2-1 (未作成) — run.sh（setup.sh の出力する .env を入力とするが、setup.sh 実装とは独立）
- **並列可能**: M3-1 (未作成) — test.js（setup.sh の完了後に実行する検証スクリプト）

### 成果物

- 計画: `context/0176-m1-2-setupsh/plan.md`（未作成、`/plan-ticket` 承認後に作成）
- 実装サマリ: `context/0176-m1-2-setupsh/implementation.md`（未作成、`/start-ticket` 実装完了後に作成）
- レビュー報告書: `context/0176-m1-2-setupsh/review.md`（未作成、`/review-ticket` 全チェック通過後に作成）
