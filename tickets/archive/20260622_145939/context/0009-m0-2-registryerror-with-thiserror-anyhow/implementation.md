# M0-2 実装サマリ

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `crates/procreg/Cargo.toml` | 依存追加 | `thiserror = "2.0.18"`, `anyhow = "1.0.102"`（`cargo add`） |
| `crates/procreg/src/error.rs` | 新規作成 | `RegistryError` 列挙型（5バリアント）+ 日本語 doc コメント + 9ユニットテスト |
| `crates/procreg/src/lib.rs` | 修正 | `pub mod error;` + `pub use crate::error::RegistryError;` + ドキュメント更新（surgical diff、計2行追加） |

## 実装した型

- `RegistryError::UnknownDependency { src, dep }` — 不明な依存
- `RegistryError::CircularDependency` — 循環依存
- `RegistryError::NotFound(String)` — プロセス未検出
- `RegistryError::SpawnFailed { name, source: anyhow::Error }` — spawn 失敗（任意エラーラップ）
- `RegistryError::ReadyTimeout { name, timeout }` — 起動完了待機タイムアウト

## 検証結果

- `cargo check`: 警告ゼロで通過
- `cargo test`: 22/22 通過（M0-1 の13件 + M0-2 の9件、0.00s）
- 品質チェック: issue 0
- 翻訳可能性 grep: 問題なし
- `lib.rs` 変更: 2行追加のみ（surgical diff 遵守）

## 計画との一致

実装は計画通り。スコープ外の petgraph 等の依存は一切追加していない。
