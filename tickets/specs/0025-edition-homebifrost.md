---
ticket_id: 25
title: EDITION_HOME導入とbifrostバイナリの自動展開
slug: edition-homebifrost
status: reviewed
created_at: 2026-06-10
updated_at: 2026-06-10
plan_path: /Users/kawata/shyme/zasso/tickets/context/0025-edition-homebifrost/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0025-edition-homebifrost/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0025-edition-homebifrost/review.md
---
# EDITION_HOME導入とbifrostバイナリの自動展開

## Summary

アプリ起動時にエディションのホームディレクトリ（例: `~/.zasso/zasso`）の絶対パスを OnceLock でキャッシュし、`EDITION_HOME/bifrost/` にバンドル済みのbifrostバイナリをバージョンマーカー方式で自動展開する。

## Background

現在、エディションのデータディレクトリは `ensure_edition_data_dir()` で作成されるが、その絶対パスは `EditionConfig::data_dir_path()` をその都度計算する必要がある（editions.json のパース + ホームディレクトリ解決が毎回発生する）。bifrost のバンドルバイナリを `EDITION_HOME/bifrost/` に展開する仕組みも存在しない。

アプリ起動時に以下の2つを保証したい：
- エディションホームの絶対パスがどこからでも定数アクセス可能であること
- バンドルしたbifrostバイナリが `EDITION_HOME/bifrost/` に展開され、バージョン更新時に自動的に再展開されること

## Scope

1. `consts/edition.rs` に `OnceLock<PathBuf>` を追加、`init_edition_home()` / `edition_home()` を実装
2. `consts/mod.rs` で上記2関数を re-export
3. `bifrost/deploy.rs` を新規作成 — バージョンマーカー照合、tar.gz展開、実行権限付与
4. `bifrost/mod.rs` に `mod deploy;` 追加、`ensure_bifrost_binary` を再公開
5. `lib.rs` の `setup()` フックに `init_edition_home()` + `ensure_bifrost_binary()` を追加
6. `Cargo.toml` に `flate2` + `tar` を追加

## Non-scope

- bifrost バイナリの起動・プロセス管理
- エディションの概念そのものの変更
- 既存の `ensure_edition_data_dir()` の削除（互換性維持）
- `scripts/download_bifrost.sh` の自動バージョン同期

## Investigation

### 現状のコード解析（物理的証拠）

**`src-tauri/src/consts/edition.rs`（ライン1-60）**:
- `EditionConfig` は `data_dir` フィールドを持ち、`data_dir_path()` で `<home>/<data_dir>` の絶対パスを計算する
- `ensure_edition_data_dir()` は `current_edition()` → `data_dir_path()` → `create_dir_all` の順に実行
- パスのキャッシュ機構は存在せず、呼び出しのたびにJSONパースとパス計算が走る
- エラー型は `String`（`Result<(), String>`）

**`src-tauri/src/consts/mod.rs`（ライン1-17）**:
- `include!(concat!(env!("OUT_DIR"), "/generated_constants.rs"))` で EDITION_SLUG を取得
- `include_str!("../../../editions.json")` で editions.json 埋め込み
- re-export: `current_edition`, `EditionConfig`, `ensure_edition_data_dir`

**`src-tauri/src/bifrost/`（Phase 1完了済み）**:
- `mod.rs`: `pub(crate) mod assets;`
- `assets.rs`: `BIFROST_VERSION = "v1.5.11"`, `ARCHIVE_FILENAME`（3種のcfg切替）, `bundled_archive()`（include_bytes!で埋め込み）
- 3つの tar.gz ファイルが同ディレクトリに存在

**`src-tauri/src/lib.rs`（ライン1-27）**:
- `mod consts;` と `mod bifrost;` の宣言はある
- `setup()` フックは `consts::ensure_edition_data_dir()` のみを呼び出している
- bifrost 展開の呼び出しは未実装

**`src-tauri/Cargo.toml`（ライン1-26）**:
- `flate2` も `tar` も未追加
- `tauri-build = "2"` が build-dependencies にある

## Test Plan

### ユニットテスト計画

**`consts::edition_home()` — EDITION_HOME アクセサ:**
- 初期化前の `edition_home()` 呼び出し → panic（プログラミングエラーとして許容）
- `init_edition_home()` 呼び出し後に `edition_home()` が正しい絶対パスを返すこと
- 複数回 `edition_home()` を呼んでも同じパスが返ること（参照の安定性）

**`consts::init_edition_home()` — 初期化関数:**
- 正常系: カレントエディションの data_dir_path が OnceLock に設定されること
- 異常系: `editions.json` が不正な形式の場合、エラーが返ること
- 異常系: ホームディレクトリが取得できない環境でもエラーが返ること（ただし環境依存）
- 二重初期化: 2回呼んだ場合、2回目はエラーが返ること

**`bifrost::deploy::ensure_bifrost_binary()` — 展開関数:**
- 正常系: 初回呼び出しで `EDITION_HOME/bifrost/` が作成され、bifrost-http が展開されること
- 正常系: `.version` が `BIFROST_VERSION` と一致する場合、展開をスキップすること
- 正常系: 2回目以降の呼び出しで既存バイナリが上書きされないこと
- 異常系: 書き込み権限がないディレクトリでエラーになること

**モック・スタブ:**
- `bundled_archive()` は静的なバイト列（モック不要）
- ファイルシステム操作はテスト用にテンポラリディレクトリを使用

**カバレッジ目標:** 80%（新規コード対象）

### ユニットテスト不可能な項目（例外）

- `init_edition_home()` の起点 → lib.rs の setup() フックでの呼び出し。Tauri ランタイムが必要なためユニットテスト不可。手動テストで確認。
- 実際の tar.gz 展開の完全性検証 → アーカイブ内の単一バイナリが正しく展開されることは、テスト用のスタブアーカイブで代用可能。ただし実際の製品アーカイブで検証するには手動テストが必要。
- クロスプラットフォームの実行権限付与 → Unix (macOS/Linux) での `set_permissions` は当該OS上でしかテスト不可。

## Boy Scout Rule — 翻訳可能性計画

**新規コード（deploy.rs）:**
- `ensure_bifrost_binary(home)` — 「ホームディレクトリを引数に、bifrostバイナリを確実に配置する」と読める
- 関数内で「バージョン照合 → 展開 → 権限設定 → マーカー書き込み」を逐語可能な順序で記述する
- マジック文字列 `".version"` は定数 `VERSION_MARKER` に抽出
- `unwrap_or_default()` で読み取りエラーを握りつぶさず、デフォルト値でフォールバックする意図を明示

**既存コードの改善対象:**
- `consts/edition.rs` の `data_dir_path()` → 関数名は「データディレクトリのパスを返す」で翻訳可能。変更不要。
- `edition_home()` の戻り値に `&'static PathBuf` を採用 → 呼び出し側で Result 処理が不要になり、コードの散文性が向上する

## Acceptance Criteria

- [ ] `consts::edition_home()` で `~/.zasso/zasso` 等の絶対パスが取得できる
- [ ] `edition_home()` が複数回呼び出しで一貫した値を返す
- [ ] `EDITION_HOME/bifrost/` が起動時に自動生成される
- [ ] `EDITION_HOME/bifrost/bifrost-http` が展開される（macOS/Linuxでは実行権限付き）
- [ ] `EDITION_HOME/bifrost/.version` に `v1.5.11` が書き込まれる
- [ ] 2回目以降の起動で、`.version` が一致する場合は展開がスキップされる
- [ ] `make check` がパスする
- [ ] 未対応プラットフォームでは `compile_error!` でビルドが止まる

## Notes

<!--
注: このコメントは人間向けの説明である。AI は以下の手順に従うこと。

- plan_path: /plan-ticket が plan.md を作成後に frontmatter に更新する
- implementation_path: /start-ticket が implementation.md を作成後に frontmatter に更新する
- review_report_path: /review-ticket が review.md を作成後に frontmatter に更新する

各コマンドのワークフロー手順が frontmatter 更新の正しい手順である。
-->

### 成果物

- 計画: context/0025-edition-homebifrost/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0025-edition-homebifrost/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0025-edition-homebifrost/review.md（未作成、/review-ticket 全チェック通過後に作成）
