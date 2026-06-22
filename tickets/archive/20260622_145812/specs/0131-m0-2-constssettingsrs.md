---
ticket_id: 131
title: M0-2: 静的定数定義 (consts/settings.rs)
slug: m0-2-constssettingsrs
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0131-m0-2-constssettingsrs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0131-m0-2-constssettingsrs/review.md
---

# M0-2: 静的定数定義 (consts/settings.rs)

## Summary

ggufrs crate の静的定数定義ファイル `consts/settings.rs` を作成し、マジックナンバーの直書きを防止する。ポート番号・デフォルトパス・タイムアウト・推論パラメータ等の設定値を一元管理する。

## Background

zasso CLAUDE.md の「設定値は consts/settings.rs で一元管理」ルールを遵守する。全サブモジュールから参照される共通定数を一箇所に集約することで、設定値の散逸を防ぎ、保守性を高める。

依存関係: M0-1（crate 骨格）が `reviewed` 済みのため、実装開始可能。

## Scope

- `consts/settings.rs` 作成 — 以下の8つの定数を定義:
  - `DEFAULT_RT_PORT: u16 = 3910` — REST API / OpenAI 互換エンドポイント
  - `DEFAULT_SW_PORT: u16 = 3911` — 静的コンテンツポート（未使用時は 0）
  - `DEFAULT_MODEL_DIR: &str = "models"` — モデルファイル格納ディレクトリ
  - `CURL_TIMEOUT_SECS: u64 = 60` — モデルダウンロードのタイムアウト（voiput 準拠）
  - `DEFAULT_CONTEXT_SIZE: u32 = 32768` — Qwen3.5 のデフォルトコンテキスト長
  - `DEFAULT_MAX_TOKENS: u32 = 256` — 推論のデフォルト最大トークン数
  - `DEFAULT_TEMPERATURE: f32 = 0.1` — 推論のデフォルト温度パラメータ
  - `GPU_PROVIDER_ENV_VAR: &str = "GGUFRS_GPU_PROVIDER"` — GPU プロバイダー環境変数名
- `consts/mod.rs` 更新 — `pub mod settings;` 宣言追加 + 全定数の再公開

## Non-scope

- その他のモジュール（config.rs, error.rs 等）の実装 → M0-3 以降の個別チケットで対応
- `#[cfg(test)]` テストモジュールの追加 → 本 spec の Test Plan で定義
- ビルドスクリプト（build.rs）の生成定数 → M5-1 で対応

## Investigation

### 証拠 1: settings.rs 未作成

`src/consts/` ディレクトリには `mod.rs` のみが存在し、`settings.rs` はまだ作成されていない。

```bash
$ ls -la crates/ggufrs/src/consts/
total 8
drwxr-xr-x   3 kawata  staff   96  6月 18 09:21 .
drwxr-xr-x   8 kawata  staff  256  6月 18 09:21 ..
-rw-r--r--   1 kawata  staff  440  6月 18 09:21 mod.rs
```

**ソース**: `ls -la crates/ggufrs/src/consts/` の実実行結果

### 証拠 2: consts/mod.rs の STUB

`consts/mod.rs` は本チケットで解決すべき STUB コメントを含む：

```rust
//! # [::STUB::] M0-2 で settings.rs を実装
// [::STUB::] M0-2 で pub mod settings; を追加し、pub use で再公開する
```

**ソース**: `crates/ggufrs/src/consts/mod.rs` 7-9行目の直接読み取り

### 証拠 3: 依存関係の充足

先行実装必須チケット M0-1（#130）のステータス: `reviewed`

M0-1 の spec には「全チケットの先行実装必須」と明記されており、本チケット M0-2 の実装に必要な crate 骨格（Cargo.toml, lib.rs のモジュール宣言）は全て整っている。

**ソース**: `resolve-ticket.js 130` の出力 + `tickets/specs/0130-m0-1-cargotoml-librs-2.md` の依存関係記述

### 証拠 4: zasso本家のパターン

zasso本家（`src-tauri/src/consts/settings.rs` + `mod.rs`）の構成を確認。設定定数の記述パターンは以下の通り：

```rust
// src-tauri/src/consts/settings.rs
/// アプリケーションバージョン（セマンティックバージョニング）
#[allow(dead_code)]
pub(crate) const APP_VERSION: &str = "v0.24.331";

// src-tauri/src/consts/mod.rs
pub(crate) mod settings;
pub(crate) use settings::BIFROST_PORT;
```

ggufrs も同様に `pub(crate) const` で定義し、`consts/mod.rs` で再公開する。

**ソース**: `src-tauri/src/consts/settings.rs` 1-30行目、`src-tauri/src/consts/mod.rs` 先頭部分

## Test Plan

### ユニットテスト計画

**テスト対象**: `consts/settings.rs` の全定数

| テストケース | 正常系/異常系 | 検証内容 |
|-------------|-------------|---------|
| ポート番号の範囲 | 正常系 | `DEFAULT_RT_PORT` が 1024-49151（ユーザーポート範囲）内であること |
| ポート番号の範囲 | 正常系 | `DEFAULT_SW_PORT` が 1024-49151 内であること |
| モデルディレクトリパス | 正常系 | `DEFAULT_MODEL_DIR` が空文字列でないこと |
| タイムアウト値 | 正常系 | `CURL_TIMEOUT_SECS` が 0 より大きいこと |
| コンテキストサイズ | 正常系 | `DEFAULT_CONTEXT_SIZE` が 0 より大きく、論理的な最大値（131072）以下であること |
| 最大トークン数 | 正常系 | `DEFAULT_MAX_TOKENS` が 0 より大きいこと |
| 温度パラメータ | 正常系 | `DEFAULT_TEMPERATURE` が 0.0 以上 2.0 以下であること |
| 環境変数名 | 正常系 | `GPU_PROVIDER_ENV_VAR` が空文字列でなく、`"GGUFRS_"` で始まること |
| 定数が const である | 正常系 | コンパイル時に評価可能（`const` 宣言）であること |

**カバレッジ目標**: 100%（定数のみのため）

**モック/スタブ**: 不要（純粋な定数定義であり外部依存なし）

### ユニットテスト不可能な項目（例外）

なし。全定数がコンパイル時定数かつ値の検証が可能なため、全てユニットテストでカバー可能。

## Boy Scout Rule — 翻訳可能性計画

### スコープ内（settings.rs, mod.rs）

- 定数名は全て `SCREAMING_SNAKE_CASE` で統一 — Rust の標準命名規則に準拠
- 各定数に「なぜこの値か」を日本語で記述（例: `DEFAULT_CONTEXT_SIZE = 32768` → 「Qwen3.5 の最大コンテキスト長は 32768 トークンのため」）
- `mod.rs` の再公開パターンは zasso本家と同一

### スコープ外の改善

現時点で「翻訳可能性を損なっている既存コード」はスコープ外のモジュール（config.rs, error.rs, registry.rs 等）に存在するが、これらはいずれも空のスタブであり、各チケットの実装時に改善される予定。本チケットでは特に改善対象なし。

## Acceptance Criteria

- [ ] `consts/settings.rs` が作成され、8つの定数が定義されている
- [ ] 各定数に「なぜこの値か」を日本語コメントで記述している
- [ ] `consts/mod.rs` に `pub mod settings;` および `pub use` が追加されている
- [ ] 全ての定数が `const` としてコンパイル時に評価可能である
- [ ] ポート番号定数は 0-65535 の範囲内である
- [ ] 数値定数の範囲（正数、温度範囲等）が適切である
- [ ] `make check-ggufrs` が成功する
- [ ] 定数値の検証ユニットテストが通過する

## Notes

### 依存・関連チケット

| チケット | 関係 |
|---------|------|
| M0-1 (#130) | 先行実装必須（reviewed ✅） |
| M0-4 (#132) | 後続（並行実装可能） |
| 全チケット | 本チケットの定数を参照 |

### STUB 解決

本チケットは `consts/mod.rs` の STUB 2箇所を解決する（`// [::STUB::] M0-2 で settings.rs を実装`, `// [::STUB::] M0-2 で pub mod settings;`）。

### 成果物

- 計画: context/0131-m0-2-constssettingsrs/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0131-m0-2-constssettingsrs/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0131-m0-2-constssettingsrs/review.md（未作成、/review-ticket 全チェック通過後に作成）
