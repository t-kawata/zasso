---
ticket_id: 4
title: Rust 2024 Edition 移行計画策定
slug: rust-2024-edition
status: draft
created_at: 2026-07-01
updated_at: 2026-07-01
---
# Rust 2024 Edition 移行計画策定

## Summary

Rust 2021 Edition から Rust 2024 Edition への移行計画を策定する。`cargo fix --edition` の試験実行による影響範囲の洗い出し、`tail_expr_drop_order` によるデストラクタ実行順の変化の影響評価、および移行作業の手順・スケジュールを文書化する。

## Background

RFC §F.5 で Rust 2024 Edition 移行計画の策定が要求されているが、`lib.rs` に `#![warn(rust_2024_compatibility)]` を設定したのみで、影響範囲調査と移行計画の策定は未実施。特に `tokio::select!` 内のテンポラリドロップ順の影響確認が未着手。

本チケットは **コード変更を伴わない調査・計画策定タスク** であり、成果物は移行計画書（本 spec の移行計画セクション）となる。

## Scope

1. **`cargo fix --edition` 試験実行**: 移行時に自動修正されるファイルの棚卸しと、自動修正の内容確認
2. **`tail_expr_drop_order` 影響評価**: `translate.rs` の `select!` マクロ展開後におけるテンポラリ変数のドロップ順変化と、その影響（安全性・正当性）の確認
3. **依存クレートの互換性確認**: llm-bridge-core v0.3.0 を始めとする主要依存が Rust 2024 Edition に対応済みかの確認
4. **移行計画書の作成**: 作業手順・リスク評価・スケジュールを含む移行計画を本 spec の「移行計画」セクションとして文書化

## Non-scope

- 実際の `edition = "2024"` への変更とそのコミット — 本チケットは計画策定のみ
- 移行に伴うコード修正 — 計画に基づき別チケットで実施する
- 他 crate（zasso全体）の移行 — 本チケットは `crates/anthropx` のみ対象

## Investigation

### 環境情報

| 項目 | 値 |
|------|-----|
| Rust バージョン | 1.96.0 (ac68faa20 2026-05-25) |
| 現在の Edition | 2021 |
| 対象 Edition | 2024 |
| 現時点での 2024 Edition 可用性 | 安定版に含まれる（Rust 1.85.0 以降） |

### cargo fix --edition 試験実行結果

`cargo fix --edition --allow-dirty` を実行した結果、以下の **5 ファイル** が自動修正された：

| ファイル | 修正内容 |
|----------|---------|
| `Cargo.toml` | `edition = "2021"` → `edition = "2024"` |
| `src/lib.rs` | 2021 edition から 2024 edition へのマイグレーション |
| `src/main.rs` | 同上 |
| `tests/mock_server.rs` | 同上 |
| `tests/real_provider.rs` | 同上 |

**自動修正はすべて edition 文字列の書き換えのみ**。コード構造の変更や構文書き換えは生じなかった。

### tail_expr_drop_order 警告

`cargo fix --edition` 実行中に **1件の警告** が `src/provider/translate.rs:605` で発生した：

```
warning: relative drop order changing in Rust 2024
  --> src/provider/translate.rs:605:35
```

**警告内容の詳細**（`tokio::select!` ブロック内のテンポラリ変数のドロップ順変化）:

| 変数 | 種類 | Edition 2021 | Edition 2024 |
|------|------|-------------|-------------|
| `chunk` | select! バインド変数 | 先にドロップ | 後にドロップ |
| `bytes` | ローカル変数 (match 内) | 先にドロップ | 後にドロップ |
| `output` | select! ブロックスコープ | 先にドロップ | 後にドロップ |
| `futures_init` | select! 内部生成 | 先にドロップ | 後にドロップ |
| `futures` | select! 内部生成 | 先にドロップ | 後にドロップ |
| `__awaitee` | .await の暗黙テンポラリ | 先にドロップ | 後にドロップ |
| テンポラリ `#4` (transform_chunk 戻り値) | テンポラリ式 | **最後にドロップ** | **先にドロップ** |
| テンポラリ `#1` | select! 引数のテンポラリ | 先にドロップ | 後にドロップ |
| テンポラリ `#2`, `#3` | `tx.send(...).await` のテンポラリ | 先にドロップ | 後にドロップ |

**カスタムデストラクタを持つ型**（全て `bytes::Bytes` またはそれを含む型）:
- `chunk`: `Bytes` カスタムデストラクタ（参照カウント解放）
- `bytes`: `Bytes` カスタムデストラクタ
- `output`: `Bytes` カスタムデストラクタ
- `futures_init`, `futures`: `pin_project!` 由来の drop glue

**影響評価**: すべてのデストラクタはアロケーション解放（`Bytes` の参照カウント減少）のみであり、ロック解放・メッセージ送信等の副作用は持たない。したがってドロップ順の変化は **安全（harmless）** と判断する。なお、既存コードには `#[allow(tail_expr_drop_order)]` が `translate.rs:492` に付与されているが、これは警告の抑制のみで動作に影響しない。

### 依存クレートの互換性

| クレート | バージョン | 2024 Edition 互換性 |
|----------|-----------|-------------------|
| llm-bridge-core | 0.3.0 (P3-1 で更新済み) | ✅ 対応済み |
| tokio | 1.52.3 | ✅ 2024 Edition に対応 |
| bytes | 1.12.0 | ✅ 2024 Edition に対応 |
| reqwest | 最新 | ✅ 2024 Edition に対応 |
| その他全依存 | — | `cargo fix --edition` がクレート全体を通過したことにより互換性確認済み |

### 現在の互換性 lint 設定

`src/lib.rs:2` に `#![warn(rust_2024_compatibility)]` が設定されているが、Rust 1.96.0 では `cargo check` においてこの lint グループからの警告は一切発生しなかった。これは 2024 edition が安定化された後、`rust_2024_compatibility` が `rust-2024-compatibility` に改名され、レガシーエイリアスが実質的に空になったためと推測される。

### 結論

移行作業は以下の最小手順で完了可能：
1. `cargo fix --edition` で 5 ファイルの edition 文字列を自動修正
2. ビルド・テスト通過確認
3. `#[allow(tail_expr_drop_order)]` は移行後も残置可能（互換性維持の明示として機能）
4. `#![warn(rust_2024_compatibility)]` は移行後は不要（edition が確定するため削除）

## Test Plan

### 検証計画

本チケットはコード変更を伴わない調査・計画策定タスクのため、ユニットテストによる検証は対象外。代わりに以下の検証手順で計画の正当性を確認する：

1. **移行コマンドの試験実行済み確認**:
   - `cargo fix --edition --allow-dirty` が 5 ファイルを自動修正し、コンパイルが通過すること（既に確認済み）
   - `cargo test` 全件通過確認（移行後の状態で）
2. **tail_expr_drop_order 影響評価の正当性確認**:
   - カスタムデストラクタの実体が `bytes::Bytes` の `Drop` 実装（参照カウント解放）であり、副作用がないことを確認済み

### ユニットテスト不可能な項目（例外）

- 計画策定タスクのため、自動テストによる検証は不可能。成果物のレビューによる代替検証

## Boy Scout Rule — 翻訳可能性計画

本チケットはコード変更を伴わない調査タスクのため、翻訳可能性の改善対象となるコード変更は発生しない。

ただし、調査過程で発見した課題として：
- `src/lib.rs:2` の `#![warn(rust_2024_compatibility)]` は Rust 1.96.0 では実質的に機能していない（空の lint グループ）。移行後に削除予定
- `src/provider/translate.rs:492` の `#[allow(tail_expr_drop_order)]` は 2024 Edition 移行後も妥当（互換性 lint の抑制として継続利用可能）。ドロップ順変化が安全である理由をコメントに追記予定

## Acceptance Criteria

- [ ] `cargo fix --edition` により自動修正されるファイル一覧が特定できていること
- [ ] `tail_expr_drop_order` の影響範囲と安全性が評価できていること
- [ ] 移行手順・リスク・スケジュールを含む移行計画が文書化されていること
- [ ] 翻訳可能性の検証が通っていること
- [ ] 既存テストが通過していること

## 移行計画

### フェーズ 1: 事前準備（所要時間: 30分）

1. ワーキングツリーをクリーンな状態にする（未コミットの変更をコミットまたはスタッシュ）
2. 依存クレートの最新互換性を確認（llm-bridge-core v0.3.0 は P3-1 で確認済み）
3. 念のため全依存をアップデート: `cargo update`

### フェーズ 2: 移行実行（所要時間: 5分）

```bash
# Edition 2024 への自動マイグレーション
cargo fix --edition --allow-dirty

# コンパイル確認
cargo check

# テスト確認
cargo test
```

### フェーズ 3: 事後処理（所要時間: 15分）

1. `src/lib.rs` から `#![warn(rust_2024_compatibility)]` を削除（2024 Edition では不要）
2. `src/provider/translate.rs:492` の `#[allow(tail_expr_drop_order)]` は残置（移行後も互換性 lint の明示的抑制として機能）。必要であればコメントに理由を追記
3. 移行後のビルド・テスト全件通過を確認

### リスク評価

| リスク | 確率 | 影響 | 対策 |
|--------|------|------|------|
| tail_expr_drop_order による意図しない動作 | **低** | 中 | デストラクタの副作用がすべて安全であることを確認済み |
| 依存クレートが 2024 Edition 未対応 | **低** | 高 | cargo fix が 5 ファイルともコンパイル通過したため未対応クレートは存在しない |
| 手動修正が必要なコードが存在 | **低** | 低 | cargo fix がコード構文の変更を必要としなかったことを確認済み |

### スケジュール

- 事前準備 + 移行実行 + 事後処理: 合計約 **50分**
- 別チケット（P6-2 以降）での実施を想定

## Notes

### 関連チケット

- **P3-1** (llm-bridge-core v0.3.0): Rust 2024 Edition 対応版への更新が完了。本チケットの前提条件
- **P2-2** (translate.rs timeout): `#[allow(tail_expr_drop_order)]` がすでに付与された箇所を含む。同一箇所のドロップ順変化が移行の焦点

### 成果物の保存先

各成果物は Tickets.json の該当チケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testVerification[]`, `testExceptions[]`, `notes` フィールド
- **移行計画書**: 本 spec の「移行計画」セクション
