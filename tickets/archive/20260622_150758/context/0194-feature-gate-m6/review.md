# レビュー報告書: Feature gate 整備（m#6）

## 検証結果概要

| チェック項目 | 結果 |
|-------------|------|
| コンパイル検証（--no-default-features） | ✅ 成功 |
| コンパイル検証（デフォルト: server） | ✅ 成功 |
| テスト全実行（190テスト） | ✅ 176 unit + 14 integration + 1 doctest 全通過 |
| 犯罪スキャン | ✅ 未解決の犯罪なし |
| スタブチェック | ✅ 既存3件維持、新たなスタブなし |
| 不完全実装パターンチェック | ✅ 該当なし |
| 構造整合性チェート | ✅ 全86件のissueは旧チケット由来（本チケット無関係） |
| 翻訳可能性チェック | ✅ 新たな問題なし |
| 品質チェック | ✅ 全て既存コード由来の指摘 |

## Acceptance Criteria 達成状況

- ✅ `cargo build --no-default-features -p anthropx` 成功
- ✅ `cargo build -p anthropx`（デフォルト: server feature）成功
- ✅ `cargo test -p anthropx` 全テスト通過
- ✅ `clap/futures/http/tokio-util/tokio-stream/tracing-subscriber` が `optional = true` かつ `server` feature 配下
- ✅ `src/main.rs` に `#![cfg(feature = "server")]` 設定済み
- ✅ `src/util/headers.rs` は `http::` を使用（`reqwest::http` 非対応のため代替。`http` crate は server feature 経由で利用可能）
- ✅ 既存 `[::STUB::]` マーカー維持
- ✅ 翻訳可能性計画の各項目適用済み

## 特記事項

- `src/util/headers.rs` の import は spec で規定された `reqwest::http::HeaderMap` ではなく `http::*` を使用した。reqwest 0.13.4 が `reqwest::http` を再公開していないため。機能的等価（`http` crate は server feature 経由で利用可能）。
- `ProxyError::Upstream(http::StatusCode)` → `Upstream(u16)` の変更は spec に記載されていなかったが、config モジュールの unconditional 性を維持するために必要だった（`http` crate の optional 化に伴う連鎖的変更）。
