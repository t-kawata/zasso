---
ticket_id: 191
title: モジュール分割 — config/util 単一責務化（m#8）
slug: configutil-m8
status: reviewed
created_at: 2026-06-22
updated_at: 2026-06-22
source_ticket: M6-2（crates/anthropx/Tickets.md）
design_doc: crates/anthropx/RFC02.md §7
depends_on: なし（独立したファイル分割作業）
followed_by: M6-3（設定検証補完 — 分割後の validate.rs に記述）
implementation_path: /Users/shyme01/shyme/zasso/tickets/context/0191-configutil-m8/implementation.md
review_report_path: /Users/shyme01/shyme/zasso/tickets/context/0191-configutil-m8/review.md
---
# モジュール分割 — config/util 単一責務化（m#8）

## Summary

`config/mod.rs`（1516行）を型定義・TOML読込・設定検証の3責務に分割し、`util/mod.rs` から `build_upstream_headers` と `HOP_BY_HOP_HEADERS` を `headers.rs` に抽出する。公開APIは `pub use` 経由で維持し、振る舞いを一切変えずにファイル構成のみを RFC02 §7 の設計に合わせる。

## Background

- `config/mod.rs` が 1516 行と肥大化しており、CLAUDE.md のファイル上限（800行）を超過している（現状 1516行 = 上限の約1.9倍）。
- RFC02 §7.1 では `config/parse.rs` と `config/validate.rs` への分割が規定されていたが、実装段階で1ファイルに統合されたままになっている。
- `util/mod.rs` に HTTP ヘッダ処理（`build_upstream_headers` + `HOP_BY_HOP_HEADERS`）と ID 生成（`ids.rs`）が混在している。RFC02 §7.2 に従い、責務ごとにファイルを分離する。
- ファイル分割のみで振る舞いは一切変更しないため、テストの追加変更は不要（既存テストが変更なく通過することを確認する）。

## Scope

### config/ ディレクトリの再編

`config/mod.rs`（1516行）を3ファイルに分割する：

| ファイル | 責務 | 備考 |
|----------|------|------|
| `config/mod.rs` | 型定義のみ（struct / enum / `mod` 宣言 / `pub use`） | 残す行を削減 |
| `config/parse.rs` | TOML読込（`AppConfig::from_toml()` + `cli::parse_args()`） | TOML読込関連ブロックを移動 |
| `config/validate.rs` | 設定検証（`AppConfig::validate()` + `normalize_url_prefix()` + aliasチェック + 内部ヘルパー） | 検証関連ブロックを移動 |

分割後の `mod.rs` 構成：
```rust
mod parse;
mod validate;

pub use parse::*;
pub use validate::*;
// 型定義（struct, enum）はこのファイルに残す
```

### util/ ディレクトリの再編

`util/mod.rs`（156行、うちヘッダ関連 58行 + テスト 88行）からヘッダ処理を抽出：

| ファイル | 責務 |
|----------|------|
| `util/mod.rs` | モジュール宣言 + `pub mod ids;` + `pub use headers::*;` |
| `util/headers.rs` | `build_upstream_headers()` + `HOP_BY_HOP_HEADERS` 定数（既存テスト込み） |

- `util/headers.rs` では `reqwest::http::HeaderMap` を使用（RFC02 §5.4）
- 既存の `pub use` 経路を維持し、import パスが変更なく動作すること

## Non-scope

- ロジックの変更・リファクタリング（振る舞い不変 — 分割のみ）
- テストの追加・修正（既存テストがそのまま通過することを確認するが、新規テストは書かない）
- 公開APIの変更（`pub use` 経由で同一インターフェースを維持）
- M6-3 で対応予定の設定検証ロジック補完（本チケットはファイル分割のみ）
- 命名やコメントの改善（ただし Boy Scout Rule に基づく修正は可）

## Investigation

### 物理的証拠

#### 1. ファイルサイズ違反
```
$ wc -l crates/anthropx/src/config/mod.rs crates/anthropx/src/util/mod.rs
  1516 crates/anthropx/src/config/mod.rs     ← 上限800行を超過（1.9倍）
   156 crates/anthropx/src/util/mod.rs
```
**判定**: config/mod.rs は CLAUDE.md のファイル上限（800行）を超過。即座の分割が必要。

#### 2. ディレクトリ構成（現状）
```
src/config/
├── mod.rs         # 1516行 — 型定義 + TOML読込 + 設定検証が混在

src/util/
├── mod.rs         # 156行 — headers.rs 抽出対象（58行）+ ids.rs への委譲
├── ids.rs         # 既存の独立ファイル（3,192 bytes）
```
**判定**: RFC02 §7 の設計と乖離。`parse.rs` / `validate.rs` が存在せず、`headers.rs` も未抽出。

#### 3. テストの検証
- `util/mod.rs` 内の `#[cfg(test)] mod tests`（`build_upstream_headers` の4テスト）は `headers.rs` に移動する
- テストコードも含めて完全移動するため、テスト内容の変更は不要
- `config/mod.rs` 内のテストは分割先ファイルに移動する

#### 4. 影響範囲（grep）
`build_upstream_headers` の使用箇所:
```
src/provider/transparent.rs    // build_upstream_headers() 呼び出し
src/provider/translate.rs      // build_upstream_headers() 呼び出し
```
→ `pub use` 経由で同一パスが解決されるため修正不要。

`use anthropx::config::AppConfig` / `use anthropx::config::ConfigError` の使用箇所:
```
src/http/routes.rs
src/http/auth.rs
src/provider/transparent.rs
src/provider/translate.rs
src/lifecycle.rs
src/app_state.rs
```
→ `mod.rs` からの `pub use` 再公開により修正不要。

#### 5. 犯罪・スタブ点検
- 未解決の犯罪: **0件**（Malfeasance.json）
- 既存スタブ: 3件（すべて scope 外: `routes.rs` 2件 + `routing/mod.rs` 1件）
- スコープ内のスタブ: **該当なし**

#### 6. RFC02 §7 設計との一致確認
RFC02 の設計と本チケットの内容が一致することを確認。以下の点に注意:
- RFC02 §7.2 では `HOP_BY_HOP_HEADERS` を `Lazy<HashSet<String>>` に変更する設計だが、本チケットでは振る舞い不変の原則により現状の `&[&str]` を維持する（型の変更はロジック変更に該当するため）

## Test Plan

### ユニットテスト計画

本チケットはファイル分割のみでロジック変更を一切含まないため、**新規テストは不要**。
以下の検証手順で振る舞い不変を確認する：

1. **既存テスト完全通過**（最優先）
   ```bash
   cargo test --manifest-path crates/anthropx/Cargo.toml
   ```
   → すべての既存テストが変更なく通過すること。

2. **コンパイル確認**
   ```bash
   cargo build --manifest-path crates/anthropx/Cargo.toml
   ```
   → ビルドエラーがゼロであること。

3. **公開API確認**
   - `use anthropx::config::AppConfig` が動作すること
   - `use anthropx::config::ConfigError` が動作すること
   - `use anthropx::config::*` が動作すること

4. **ファイルサイズ確認**
   - 各ファイルが 800 行を超えないこと
   - 分割後の `config/mod.rs` は型定義のみ（大幅に削減されること）

### ユニットテスト不可能な項目（例外）

- **該当なし**: ファイル分割のみの作業であり、ユニットテストで検証不可能な項目は存在しない。

## Boy Scout Rule — 翻訳可能性計画

本チケットはファイル分割が主目的だが、以下の箇所に翻訳可能性の改善を適用する：

1. **`util/mod.rs` → `util/headers.rs` 抽出時**:
   - `build_upstream_headers` 関数のコメントを「なぜ hop-by-hop を除去するか」の説明に改善する（RFC 7230 §6.1 の参照を明示）
   - 現状コメントは「何を」の説明に留まっているが、RFC 参照を追加して「なぜ」を補強する

2. **`config/mod.rs` 分割時**:
   - 型定義だけが残る `mod.rs` は Rust コーディング規約に従い、実装ロジックを含まない純粋なモジュール宣言＋型定義ファイルとする
   - `parse.rs` / `validate.rs` は各々の責務を関数名・モジュールコメントで明確に宣言する
   - モジュールコメント（`//!`）は各ファイルの冒頭に必ず記述し、「このファイルの責務は何か」を一文で定義する

3. **スコープ外だが着手可能な改善（Boy Scout Rule）**:
   - 既存コードのハードコード値・マジックナンバーの定数化は本チケットの範囲を超えるため、発見した場合は `[::STUB::]` マーカーを付与し、本チケット完了報告時に発見事項として記載する

## Acceptance Criteria

- [ ] `config/` が型定義（mod.rs）、TOML読込（parse.rs）、設定検証（validate.rs）の3ファイルに分割されている
- [ ] `util/` から `build_upstream_headers` + `HOP_BY_HOP_HEADERS` が `headers.rs` に抽出されている
- [ ] `pub use` 経路により既存の import パスがすべて動作する
- [ ] `cargo build` が成功する
- [ ] 全既存テストが変更なく通過する
- [ ] 各ファイルが 800 行を超えない
- [ ] 振る舞いが一切変更されていない（ロジック変更ゼロ）

## Notes

### 依存関係

- **先行**: なし（既存コードのファイル分割のみ。他のチケットに依存しない）
- **後続**: M6-3（設定検証補完 — 分割後の `validate.rs` に追記する）
- **設計参照**: RFC02.md §7（モジュール分割）

### 実装上の注意点

1. **RFC02 §7.2 の乖離**: RFC02 では `HOP_BY_HOP_HEADERS` を `Lazy<HashSet<String>>` に変更する設計だが、本チケットでは振る舞い不変の原則により現状の `&[&str]` を維持する。型の変更はロジック変更となるため、別チケットで対応する。
2. **分割手順**: `parse.rs` → `validate.rs` → `headers.rs` の順で作成し、各ステップでコンパイルが通ることを確認しながら進める。
3. **テストコードの移動**: `util/mod.rs` 内のテスト（`build_upstream_headers_*` 4テスト）は `headers.rs` に移動する。`config/mod.rs` 内のテストも同様に分割先に移動する。

### 成果物

- 計画: context/0191-configutil-m8/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0191-configutil-m8/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0191-configutil-m8/review.md（未作成、/review-ticket 全チェック通過後に作成）
