---
ticket_id: 5
title: CI/CD — Docker Integration Job + Prebuilt Refresh Pipeline（P3）
slug: cicd-docker-integration-job-prebuilt-refresh-pipelinep3
status: reviewed
created_at: 2026-06-22
updated_at: 2026-06-22
plan_path: /Users/shyme/shyme/zasso/tickets/context/0005-cicd-docker-integration-job-prebuilt-refresh-pipelinep3/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0005-cicd-docker-integration-job-prebuilt-refresh-pipelinep3/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0005-cicd-docker-integration-job-prebuilt-refresh-pipelinep3/review.md
---
# CI/CD — Docker Integration Job + Prebuilt Refresh Pipeline（P3）

## Summary

GitHub Actions 上で PJSIP 依存の統合テスト（M20-1.x）を実行する CI job と、PJSIP prebuilt バイナリを自動生成・アップロードする pipeline を構築する。prebuilt は CI pipeline として自動化し、手動ビルド手順（`vendor/prebuilt/BUILD.md`）は補助的ドキュメントとする。

## Background

siprs クレートの統合テスト（`cargo test --features pjsip -- --ignored --test-threads=1`）は、PJSIP native ライブラリへのリンクと Asterisk SIP サーバへの接続を必要とする。このため以下の CI 基盤が不可欠である：

1. **Docker Integration Test Job**: PJSIP ライブラリと Asterisk コンテナを備えた Ubuntu 環境で統合テストを自動実行する
2. **Prebuilt Refresh Pipeline**: macOS 上で PJSIP prebuilt ライブラリを自動ビルドし、アーティファクトとして保存する

現在、これらはすべて手動（ローカルマシン）で実行されており、CI での自動化が完了していない。RFC02 §11 で設計が確定しており（設計判断 Q4:A）、実装が残っている。

既存の `build.rs` は prebuilt 優先・source build fallback の二段構えを実装済み（`prebuilt_available()` 関数でライブラリ存在確認 → prebuilt 優先 → fallback）。CI では prebuilt が利用可能であることが前提となる（Docker job は事前ビルド済み prebuilt を使用し、source build は行わない）。

## Scope

### 1. `.github/workflows/integration-test.yml` の作成

RFC02 §11.1 の YAML 定義に従い、以下の構成で作成する：

- **runs-on**: `ubuntu-22.04`
- **Service container**: `asterisk:20.6.0`（ポート 5060/udp, 5061/tcp を公開）
- **Steps**:
  1. `actions/checkout@v4`
  2. `dtolnay/rust-toolchain@stable` で Rust 環境構築
  3. `cargo build --features pjsip` で PJSIP 機能付きビルド
  4. PJSIP prebuilt の配置確認（`vendor/prebuilt/x86_64-unknown-linux-gnu/` に `.a` ファイルが存在すること）
  5. `cargo test --features pjsip -- --ignored --test-threads=1` で統合テスト実行
- **環境変数**: `SIP_SERVER=localhost`, `SIP_PORT=5060`
- **トリガー**: `push`（main/master）、`pull_request`、`workflow_dispatch`
- **注意点**: Ubuntu の prebuilt ライブラリが未整備の場合、事前に prebuilt refresh pipeline で生成するか、source build fallback に頼る。ただし CI ではビルド時間の観点から prebuilt 利用を原則とする。

### 2. `.github/workflows/prebuilt-refresh.yml` の作成

RFC02 §11.2 の YAML 定義に従い、以下の構成で作成する：

- **runs-on**: `macos-14`（Apple Silicon）
- **Steps**:
  1. `actions/checkout@v4`
  2. CMake インストール確認（`brew` 経由）
  3. PJSIP prebuilt ビルド手順の CI 自動化（`vendor/prebuilt/BUILD.md` の手順を CI コマンドとして記述）
  4. `actions/upload-artifact@v4` で prebuilt 成果物をアーティファクトとしてアップロード（`name: pjsip-prebuilt-macos`, `path: vendor/prebuilt/aarch64-apple-darwin/`）
- **トリガー**: `workflow_dispatch`（手動 dispatch）、schedule（月次程度）

### 3. Source build fallback 確認

`build.rs` の既存挙動（`prebuilt_available()` → prebuilt 優先 → fallback して cmake source build）を CI 環境でも維持する。prebuilt が利用できない環境では自動的に source build へフォールバックすることを確認する。

### 4. prebuilt 更新トリガー

PJSIP バージョン更新時、または手動 dispatch で prebuilt を再生成できるようにする。

## Non-scope

- **Linux prebuilt の生成**: CI 内で Ubuntu 向け PJSIP prebuilt を自動ビルドすることはスコープ外。Ubuntu CI では source build fallback または別途生成された prebuilt を使用する。
- **Windows CI**: 現時点では Windows 対応はスコープ外。
- **統合テスト自体の実装や修正**: 統合テスト（M20-1.x）は完了済み。本チケットは CI 自動化のみ。
- **build.rs の改修**: prebuilt 検出・source build fallback の既存ロジックは完成済みであり、本チケットの対象外。
- **Asterisk コンテナイメージのカスタマイズ**: 公式 `asterisk:20.6.0` をそのまま使用する。
- **キャッシュ機構の導入**: prebuilt アーティファクトのキャッシュ戦略は将来の検討項目。

## Investigation

### 証拠1: GitHub Actions ワークフロー未作成

```bash
$ ls .github/workflows/ 2>/dev/null || echo "no .github/workflows dir yet"
no .github/workflows dir yet
```

`.github/workflows/` ディレクトリ自体が存在しない。新規作成が必要。

### 証拠2: RFC02 §11 の YAML 定義が spec bench として利用可能

`crates/siprs/RFC02.md` の §11.1 および §11.2 に、以下の YAML 定義が存在する：

- §11.1: `integration-test` workflow（ubuntu-22.04 + asterisk service container）
- §11.2: `prebuilt-refresh` workflow（macos-14 + CMake build + upload-artifact）

これらの YAML は設計判断 Q4:A として承認済みであり、spec bench として CI ファイルに直接反映する。

### 証拠3: build.rs の prebuilt 検出ロジック完成済み

`crates/siprs/build.rs` にて：

- `prebuilt_available()` 関数（85-100行目）: `vendor/prebuilt/<target>/lib/` に全必須ライブラリが存在するか確認する
- `deploy_prebuilt()` 関数（432行目）: cmake ビルド成果物を prebuilt ディレクトリに永続化する
- メイン分岐（526-527行目）: prebuilt 優先 → fallback の二段構え

CI では prebuilt 優先パスを利用する。source build fallback は prebuilt 不在時の安全弁として機能。

### 証拠4: 既存の prebuilt 配置

```bash
$ ls vendor/prebuilt/
aarch64-apple-darwin/   BUILD.md
```

macOS（Apple Silicon）向け prebuilt は既存。Ubuntu（x86_64-unknown-linux-gnu）向け prebuilt は未作成。

### 証拠5: BUILD.md に手動ビルド手順の記載あり

`vendor/prebuilt/BUILD.md` に macOS 向け再ビルド手順が完備されている。この手順を CI の prebuilt refresh pipeline に自動化する。

### 証拠6: スタブ点検

犯罪スキャン結果: 未解決の犯罪 0 件。
全スタブ検索結果: 7 件の `[::STUB::]` マーカーあり。いずれも本チケットのスコープ外（anthropx, ggufrs, siprs audio/ffi/reactor 内の未結合実装）。

## Test Plan

### ユニットテスト計画

- 本チケットは CI/CD の YAML 定義と GitHub Actions の設定が主な成果物であり、Rust コードの追加は含まない
- CI の挙動検証は実環境（GitHub Actions）でのみ実施可能
- 以下の検証項目を YAML ファイルのコメントやドキュメントとして記述し、CI 実行時に確認する

### ユニットテスト不可能な項目（例外）

1. **integration-test workflow の検証**: CI 環境（GitHub Actions + Docker Asterisk）でのみ実行可能。ローカルでは `docker compose` 等で代替検証可能だが、本番同等の動作は Actions 上でのみ確認できる。
2. **prebuilt-refresh workflow の検証**: macOS 実機 + GitHub Actions でのみ実行可能。ローカル macOS での手動実行で代替検証する。
3. **アーティファクトアップロード**: `actions/upload-artifact@v4` の動作は GitHub Actions 環境でしか確認できない。

## Boy Scout Rule — 翻訳可能性計画

本チケットで新規作成するファイルは GitHub Actions の YAML 定義であり、Rust コードの追加・変更は含まない。したがって翻訳可能性の改善対象となる既存コードはない。ただし以下の点に留意する：

- YAML の step 名（`name:`）は英語で統一し、処理内容を一文で明確に記述する
- ワークフローファイル冒頭にコメントでワークフローの目的とトリガー条件を記述する
- マジックナンバー（ポート番号、バージョン番号等）は YAML 内の `env:` セクションで名前付き変数として定義する

## Acceptance Criteria

- [ ] `.github/workflows/integration-test.yml` が作成され、GitHub Actions 上で動作すること
  - [ ] Ubuntu 22.04 上で `cargo build --features pjsip` が成功すること
  - [ ] Docker Asterisk コンテナ（`asterisk:20.6.0`）が起動し、ポート 5060/udp が公開されること
  - [ ] `cargo test --features pjsip -- --ignored --test-threads=1` が全件 PASS すること
  - [ ] `push` / `pull_request` / `workflow_dispatch` の各トリガーで正しく起動すること
- [ ] `.github/workflows/prebuilt-refresh.yml` が作成され、macOS 上で動作すること
  - [ ] CMake ビルドが正常に完了すること
  - [ ] prebuilt ライブラリが `vendor/prebuilt/aarch64-apple-darwin/` に生成されること
  - [ ] `actions/upload-artifact@v4` でアーティファクトがアップロードされること
  - [ ] `workflow_dispatch` で手動起動できること
- [ ] source build fallback が正しく動作すること（prebuilt 不在時に `build.rs` が cmake ビルドへフォールバックする）
- [ ] 既存の全テスト（`make test`）が通過すること
- [ ] 犯罪スキャンで新たな犯罪が記録されていないこと

## Notes

- **plan_path**: 未作成（/plan-ticket 承認後に作成）
- **implementation_path**: 未作成（/start-ticket 実装完了後に作成）
- **review_report_path**: 未作成（/review-ticket 全チェック通過後に作成）

### 依存・関連チケット

- **M19-1**（build.rs — prebuilt 優先・source build fallback）: 本チケットの prebuilt 検出ロジックは build.rs の既存実装に依存する
- **M20-1.x**（統合テスト全般）: CI で実行する統合テスト群。本チケットはこれらのテストを CI 自動化する
- **RFC02 §11**: CI/CD 環境整備の設計判断 Q4:A。本チケットの spec bench

### 留意点

- Linux（x86_64-unknown-linux-gnu）向け prebuilt が未整備の場合、integration-test workflow の `cargo build --features pjsip` が source build fallback に頼ることになる。これにより初回ビルドが 5〜10 分かかる可能性がある。必要に応じて事前に Linux prebuilt を準備する。
- `actions/upload-artifact@v4` のアーティファクト保存期間はデフォルト 90 日。長期保存が必要な場合はリリースアセットとしての公開を検討する。
- prebuilt refresh pipeline は macOS 14（Apple Silicon）を前提とする。Intel macOS が必要な場合は別途 runner を追加する。

### 成果物

- 計画: context/0005-cicd-docker-integration-job-prebuilt-refresh-pipelinep3/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0005-cicd-docker-integration-job-prebuilt-refresh-pipelinep3/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0005-cicd-docker-integration-job-prebuilt-refresh-pipelinep3/review.md（未作成、/review-ticket 全チェック通過後に作成）
