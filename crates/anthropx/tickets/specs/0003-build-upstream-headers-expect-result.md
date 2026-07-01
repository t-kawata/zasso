---
ticket_id: 3
title: build_upstream_headers の expect() を Result 伝播に置き換え
slug: build-upstream-headers-expect-result
status: draft
created_at: 2026-07-01
updated_at: 2026-07-01
---
# build_upstream_headers の expect() を Result 伝播に置き換え

## Summary

`src/util/headers.rs` の `build_upstream_headers()` が持つ `HeaderValue::from_str().expect()`（1箇所）を `Result` 伝播に置き換える。戻り値型を `HeaderMap` から `Result<HeaderMap, ConfigError>` に変更し、テストコード内の `unwrap()` も `Result<()>` に書き換える。

## Background

親 RFC §F.4（Rust 防弾設計）およびプロジェクトの Rust コーディング規約（`unwrap/expect` プロダクションコード禁止）に基づくコード品質改善。

OMISSIONS-002.md O-002 で `build_upstream_headers` の `expect()` が改善対象として特定された。この関数は `src/util/headers.rs:54` で `HeaderValue::from_str(&format!("Bearer {}", provider_api_key)).expect("valid Bearer token header")` を使用している。フォーマット結果が静的に有効なヘッダ値であることは保証されるため実害はないが、プロジェクト規約に違反する。

## Scope

- `src/util/headers.rs: pub fn build_upstream_headers()` — 戻り値型を `HeaderMap` → `Result<HeaderMap, ConfigError>` に変更
- `src/util/headers.rs: #[cfg(test)] mod tests` — 全テスト関数を `Result<()>` に変更し、`?` 演算子でエラー伝播
- `src/config/mod.rs: ConfigError` — `InvalidValue(String)` バリアントを流用し、新規バリアント追加は行わない

## Non-scope

- `build_upstream_headers` 以外の関数での expect/unwrap 排除
- `ConfigError` への新規バリアント追加（`InvalidValue` で代用可能）
- テストコード内の `Option::unwrap()` はテストアサーションとして正当のため、`?` に変更せず `expect()` に置き換え

## Investigation

### ソースコード調査（2026-07-01）

**対象コード** (`src/util/headers.rs`):

- **関数定義 L32**: `pub fn build_upstream_headers(client_headers: &HeaderMap, provider_api_key: &str) -> HeaderMap`
  - 戻り値 `HeaderMap` — エラー時にパニックする可能性を持つ
- **expect 箇所 L53-54**: `HeaderValue::from_str(&format!("Bearer {}", provider_api_key)).expect("valid Bearer token header")`
  - `HeaderValue::from_str` の返り値型は `Result<HeaderValue, InvalidHeaderValue>`
  - エラーは静的に到達不能だが、規約違反
- **テストコード L64-156**: 4つのテスト関数が全て `fn test_name()` でパニック型
  - テスト内で `build_upstream_headers()` の戻り値を直接使用（`let result = build_upstream_headers(...);`）
  - 各テストで `result.get(...).unwrap()` を使用（`Option` の unwrap — テストコードでは許容されるが、可能な限り `expect()` に置き換え）

**呼び出し元調査**:

```
src/http/auth.rs:223    // コメントのみ — 実際の呼び出しなし
src/lib.rs:14           // doc comment
src/util/mod.rs:6       // doc comment
src/util/headers.rs     // 定義とテストのみ
```

→ **プロダクションコードからの呼び出しは存在しない**。シグネチャ変更の影響範囲は自身の定義とテストコードに完全に限定される。

**ConfigError 調査** (`src/config/mod.rs:456`):

```rust
pub enum ConfigError {
    Io(String, #[source] std::io::Error),
    Parse(String, #[source] toml::de::Error),
    EmptyApiKeys(String),
    DuplicateModel(String),
    DuplicateAlias(String, String),
    InvalidValue(String),        // ← このバリアントを流用
    ValidationFailed(Vec<ConfigError>),
}
```

- notes の記載と異なり `src/config/error.rs` は存在せず、`src/config/mod.rs` に定義
- `InvalidValue(String)` バリアントが既存 — `HeaderValue::from_str` のエラーをラップするのに使用可能
- エラーメッセージに API key を含めないよう注意（`InvalidValue("invalid Authorization header value".to_string())`）

**犯罪チェック**: 0件（scan-crimes.sh 確認）
**スタブチェック**: 0件（find-all-stubs.js 確認）

### 実装方針

1. `InvalidHeaderValue` エラーを `ConfigError::InvalidValue` にマップ
   - エラーメッセージは `"invalid Authorization header value"` — API key が露出しない定数値
2. 戻り値型を `Result<HeaderMap, ConfigError>` に変更
3. テスト関数を `Result<()>` に変更し `?` でエラー伝播
4. テスト内の `Option::unwrap()` は `expect()` に置き換え（意味のあるメッセージ付与）

### 依存関係

- `relatedTicketIds`: なし（他モジュールからの呼び出しなし、テストコード内のみ使用）
- 循環依存: なし

## Test Plan

### ユニットテスト計画

既存4テストを `Result<()>` に変更＋シグネチャ変更に追従：

| テスト名 | 検証内容 | 変更内容 |
|----------|----------|----------|
| `build_upstream_headers_filters_auth` | Authorization 上書き + hop-by-hop 除去 | `Result<()>` 化、`build_upstream_headers(...)?` で呼び出し |
| `build_upstream_headers_filters_hop_by_hop` | hop-by-hop 除去 | 同上 |
| `build_upstream_headers_preserves_other` | 安全なヘッダ維持 | 同上 |
| `build_upstream_headers_empty_client` | 空 client → Bearer のみ | 同上 |

**正常系**: 既存4テストの動作不変（シグネチャ変更による既存テストの維持確認）
**異常系（追加）**: `ConfigError` へのエラー伝播パスが型レベルで正しいことを確認（コンパイルチェックで担保 — 実際に `InvalidHeaderValue` が発生するパスは静的に到達不能のためユニットテスト不可）

### ユニットテスト不可能な項目（例外）

- `InvalidHeaderValue` エラーの実際の到達パス — `format!("Bearer {}", ...)` が常に有効なヘッダ値を生成するため、静的に到達不能。型検査によりエラーハンドリングの正しさを担保する。

## Boy Scout Rule — 翻訳可能性計画

- **関数名/変数名**: 既存の `build_upstream_headers`, `provider_api_key`, `client_headers` は適切。変更不要。
- **責務分割**: 関数は単一責務（upstream リクエスト用ヘッダ構築）。分割不要。
- **ハードコード値**: `HOP_BY_HOP_HEADERS` は既に RFC 参照の定数として抽出済み。
- **コメント**: 既存コメントは「なぜ」を日本語で説明。問題なし。
- **今回の改善**: `expect()` → `?` + `ConfigError::InvalidValue` により、エラーパスが明示的になる。関数の戻り値型が `Result` になることで、呼び出し元にエラーハンドリングを強制する設計となる。

## Acceptance Criteria

- [ ] `cargo check --all-targets` が warning 0 で通過する
- [ ] `cargo clippy -- -D warnings` が通過する
- [ ] `cargo fmt --check` が通過する
- [ ] `cargo test --lib` の既存テストが全て通過する
- [ ] `build_upstream_headers` の戻り値が `Result<HeaderMap, ConfigError>` になっている
- [ ] プロダクションコードに新たな `unwrap()/expect()` が含まれていない

## Notes

- O-002（OMISSIONS-002.md）の解消チケット
- P4-1（translate stream idle timeout テスト追加）と同一 RFC ファミリー
- ConfigError の位置: `src/config/mod.rs`（notes の古い記載（`src/config/error.rs`）は誤り。本 spec で修正）

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testVerification[]`, `testExceptions[]`, `notes` フィールド
- **実装サマリ**: `changes[]`, `notes` フィールド
- **レビュー報告書**: `instrumentation`, `notes`, `rfcDiscrepancies[]` フィールド
