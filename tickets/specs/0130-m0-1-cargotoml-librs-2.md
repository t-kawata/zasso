---
ticket_id: 130
title: M0-1: Cargo.toml / lib.rs プロジェクト骨格
slug: m0-1-cargotoml-librs-2
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0130-m0-1-cargotoml-librs-2/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0130-m0-1-cargotoml-librs-2/review.md
---

# M0-1: Cargo.toml / lib.rs プロジェクト骨格

## Summary

ggufrs crate のプロジェクト骨格（Cargo.toml, lib.rs, 空のモジュールスタブ, .gitignore, Makefile ターゲット）を作成し、全チケットのビルド基盤を確立する。

## Background

全チケットの前提となる最初のチケット。crate の骨格を確立し、以降のチケットが段階的に機能を追加できるようにする。mistralrs のバージョンは固定せず `cargo update` で追従可能な状態とし、`Cargo.lock` はバージョン管理対象とする。

## Scope

- `crates/ggufrs/Cargo.toml` — package 定義、dependencies、features、bin
- `crates/ggufrs/src/lib.rs` — crate ルート（モジュール宣言、doc comment）
- `crates/ggufrs/src/consts/mod.rs` — 定数モジュール（空 mod 宣言）
- `crates/ggufrs/src/inference/mod.rs` — 推論モジュール（空 mod 宣言）
- `crates/ggufrs/src/server/mod.rs` — サーバーモジュール（空 mod 宣言）
- `crates/ggufrs/src/config.rs` — 設定モジュール（空 mod 宣言）
- `crates/ggufrs/src/error.rs` — エラーモジュール（空 mod 宣言）
- `crates/ggufrs/src/registry.rs` — レジストリモジュール（空 mod 宣言）
- `crates/ggufrs/src/bin/test-run.rs` — テスト用バイナリ（スタブ）
- `crates/ggufrs/.gitignore` — ビルド生成物・モデルファイル除外
- Makefile の `check-ggufrs` ターゲット追加
- dependencies: `cargo add` で追加（mistralrs, tokio, axum, serde, 等）

## Non-scope

- 各モジュールの実装ロジック（consts/settings.rs, error.rs, config.rs の型定義含む）→ 個別チケット（M0-2 以降）で対応
- `pub use mistralrs::{...}` の re-export 実体化 → M3-5 で対応
- テストコード（mockall 等）→ M2-4 で対応
- build.rs のモデル自動ダウンロード → M5-1 で対応

## Investigation

### 証拠 1: 全ファイルの存在確認

チケット M0-1 の実装スコープに含まれる全ファイルが既に作成済みであることを確認した。

| ファイル | 状態 | 備考 |
|----------|------|------|
| `Cargo.toml` | ✅ 作成済み | v0.1.0, edition 2021, 全依存関係記述済み |
| `src/lib.rs` | ✅ 作成済み | 6 モジュール宣言 + STUB コメント + ドキュメントコメント |
| `src/consts/mod.rs` | ✅ 作成済み | STUB: M0-2 |
| `src/inference/mod.rs` | ✅ 作成済み | STUB: M2-1 |
| `src/server/mod.rs` | ✅ 作成済み | STUB: M4-1 |
| `src/config.rs` | ✅ 作成済み | STUB: M0-3/M0-5 |
| `src/error.rs` | ✅ 作成済み | STUB: M0-4 |
| `src/registry.rs` | ✅ 作成済み | STUB: M0-6 |
| `src/bin/test-run.rs` | ✅ 作成済み | STUB: M5-2 |
| `.gitignore` | ✅ 作成済み | `/target/`, `/models/` |

**ソース**: 直接のファイル確認（`ls -la crates/ggufrs/src/`, 各ファイル内容読み取り）

### 証拠 2: Cargo.toml 依存関係

`Cargo.toml` の dependencies セクション:

| クレート | バージョン | feature |
|----------|-----------|---------|
| mistralrs | 0.8.1 | default-features = false |
| tokio | 1 | rt-multi-thread, macros, signal |
| axum | 0.8 | — |
| serde | 1 | derive |
| serde_json | 1 | — |
| futures | 0.3 | — |
| thiserror | 2 | — |
| anyhow | 1 | — |
| async-trait | 0.1 | — |
| tracing | 0.1 | — |
| tracing-subscriber | 0.3 | fmt, env-filter |
| llm-bridge-core | 0.2 | — |

dev-dependencies: `[::STUB::] M2-4 で mockall を追加`

features:
- default = ["cpu"]
- cpu, metal, cuda

**ソース**: `crates/ggufrs/Cargo.toml` の直接読み取り

### 証拠 3: Makefile ターゲット

`make check-ggufrs` ターゲットが Makefile に定義済み：

```makefile
check-ggufrs:
	EDITION_SLUG=$(EDITION) cargo check --manifest-path crates/ggufrs/Cargo.toml
```

`make check-all` にも `check-be check-ggufrs check-fe` として組み込まれている。
`make check-be` は ggufrs を含まず、本家 src-tauri のみチェックする。

**ソース**: `Makefile` 83-97行目の直接読み取り

### 証拠 4: ビルド通過確認

`make check-ggufrs` を実行し、コンパイルが成功することを確認：

```
EDITION_SLUG=zasso cargo check --manifest-path crates/ggufrs/Cargo.toml
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.85s
```

**ソース**: 実実行結果（2026-06-18 09:XX 確認）

### 証拠 5: 全 STUB マーカーの整合性

lib.rs の STUB マーカーと Tickets.md のチケット割り当てが一致していることを確認：

| lib.rs の STUB | 解決チケット | 状態 |
|----------------|-------------|------|
| `pub mod inference` | M2-1 | 未解決（STUB） |
| `pub mod registry` | M2-2 | 未解決（STUB） |
| `pub mod server` | M4-1 | 未解決（STUB） |
| `pub use mistralrs::{...}` | M3-5 | 未解決（STUB） |
| `consts/mod.rs: pub mod settings` | M0-2 | 未解決（STUB） |
| `config.rs` の型定義 | M0-3, M0-5 | 未解決（STUB） |
| `error.rs` の列挙型 | M0-4 | 未解決（STUB） |
| `registry.rs` の ModelInfo | M0-6 | 未解決（STUB） |

**ソース**: `src/lib.rs` 各行のコメント、Tickets.md のチケット依存関係

### 結論

チケット M0-1 の実装スコープは全て完了している。追加の実装作業は不要。

## Test Plan

### ユニットテスト計画

M0-1 は crate 骨格の作成のみであり、テスト可能なロジック関数を含まない。そのためユニットテストは不要。

検証は以下で代替する：
1. ✅ `make check-ggufrs` でコンパイル通過（確認済み）
2. `cargo tree` で依存関係の解決を可視化確認

### ユニットテスト不可能な項目（例外）

- crate 骨格はロジックを含まないため、ユニットテストの対象外。ビルド成功が唯一の検証条件

## Boy Scout Rule — 翻訳可能性計画

M0-1 で触るコードは以下のものであり、翻訳可能性の観点から現状を評価する：

1. **Cargo.toml**: 設定ファイルであり翻訳可能性の適用範囲外
2. **lib.rs**: 現状のモジュール宣言とコメントはドキュメントコメントとして適切。関数分割や責務分離の余地なし
3. **各空 mod.rs**: まだ実装がないため現時点では問題なし。各チケット実装時に翻訳可能性を担保する
4. **bin/test-run.rs**: スタブのみで関数本体なし。M5-2 で実装時に翻訳可能性を担保する
5. **Makefile**: シェルスクリプトであり翻訳可能性の対象外

**現状で改善すべき点**: 特になし（すべてのファイルが適切な粒度で分割され、コメントは「なぜ」を説明している）

## Acceptance Criteria

- [x] `crates/ggufrs/Cargo.toml` が作成され、package 定義・dependencies・features・bin が定義されている
- [x] `crates/ggufrs/src/lib.rs` が作成され、全モジュール宣言とドキュメントコメントが記述されている
- [x] `crates/ggufrs/src/consts/mod.rs` が作成されている
- [x] `crates/ggufrs/src/inference/mod.rs` が作成されている
- [x] `crates/ggufrs/src/server/mod.rs` が作成されている
- [x] `crates/ggufrs/src/config.rs` が作成されている
- [x] `crates/ggufrs/src/error.rs` が作成されている
- [x] `crates/ggufrs/src/registry.rs` が作成されている
- [x] `crates/ggufrs/src/bin/test-run.rs` が作成されている
- [x] `crates/ggufrs/.gitignore` が作成されている
- [x] Makefile に `check-ggufrs` ターゲットが追加され、`check-all` に含まれている
- [x] dependencies が `cargo add` 相当の形式で追加されている
- [x] `make check-ggufrs` が成功する（コンパイル通過確認済み）
- [x] llm-bridge-core = "0.2" が dependencies に含まれている

## Notes

### 重要: 本チケットは実装完了状態にある

調査の結果、チケット M0-1 の実装スコープは全て既に完了している。追加の作業は不要。
以降のチケット（M0-2 以降）に進むこと。

### STUB マーカーについて

各モジュールファイルには解決先チケットが明記された `[::STUB::]` マーカーが適切に配置されている。
未マークのスタブは発見されなかった。

### 成果物

- 計画: context/0130-m0-1-cargotoml-librs-2/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0130-m0-1-cargotoml-librs-2/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0130-m0-1-cargotoml-librs-2/review.md（未作成、/review-ticket 全チェック通過後に作成）
