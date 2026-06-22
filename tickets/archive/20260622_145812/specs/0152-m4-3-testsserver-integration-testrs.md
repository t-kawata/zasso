---
ticket_id: 152
title: "M4-3: サーバー結合テスト (tests/server_integration_test.rs)"
slug: m4-3-testsserver-integration-testrs
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0152-m4-3-testsserver-integration-testrs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0152-m4-3-testsserver-integration-testrs/review.md
plan_path: /Users/kawata/shyme/zasso/tickets/context/0152-m4-3-testsserver-integration-testrs/plan.md
---

# M4-3: サーバー結合テスト (tests/server_integration_test.rs)

## Summary

ggufrs サーバーの結合テストを実装する。実モデルは使用せず、
`GgufEngine` を空設定で起動し、`reqwest` で HTTP リクエストを送信して
サーバーのライフサイクル・ルーティング・エラーレスポンスを検証する。
実ハンドラロジックの詳細な動作確認は M4-1 のユニットテストで既に
カバー済みのため、本テストは結合部分（境界）に焦点を当てる。

## Background

### このチケットの必要性

M4-1 でルーター + ハンドラ、M4-2 でサーバー起動/停止が実装されたが、
これらはユニットテスト（MockEngine 使用）のみで検証されている。
結合テストでは以下の観点を確認する：

1. **サーバーライフサイクル**: `start_server()` → リクエスト到達 → `Drop` による停止が一連で動作する
2. **HTTP 層のルーティング**: Axum がポートを正しくバインドし、パスベースのルーティングが期待通り動作する
3. **エラーレスポンスのシリアライズ**: エラー時も適切な HTTP ステータスコードと JSON ボディが返る
4. **実モデル不在時の動作**: モデルがロードされていなくてもサーバーが起動し、エラーレスポンスを返す

### 現在の実装状況

- `tests/` ディレクトリ: **未作成** — ggufrs にはまだ結合テストがない
- `Cargo.toml dev-dependencies`: mockall, tower — **追加済み**、HTTP クライアントなし
- `MockEngine`: `pub(crate)` のため、結合テスト（別 crate）からは参照不可
- `GgufEngine::start_server()`: **実装済み**（M4-2）
- `server::build_router()`: **実装済み**（M4-1）
- ユニットテスト（M4-1）: 既に 20 ケースでハンドラの動作確認済み

## Scope

### 実装するもの

1. **`tests/server_integration_test.rs`** 作成
   - サーバーライフサイクルテスト（起動 → リクエスト → 停止）
   - GET /v1/models 結合テスト（HTTP 経由で 200 OK 確認）
   - POST /v1/chat/completions エラーレスポンス確認
   - POST /anthropic/v1/messages エラーレスポンス確認
   - サーバー起動後に正しく停止できることの確認

2. **`Cargo.toml` dev-dependencies** に `reqwest` 追加
   - 結合テストで使用する HTTP クライアント
   - features = ["json"] で JSON レスポンスの直接パースを有効化

### 実装しないもの

- 実モデルを使用した推論の動作確認 — 実際の GGUF モデルファイルが必要
- MockEngine の結合テストからの利用 — `pub(crate)` 制約あり、別 crate からは利用不可
- test-run バイナリ — M5-2 で実装予定
- ストリーミングエンドポイントのテスト — 将来の拡張
- Anthropic 変換の完全なラウンドトリップ — llm-bridge-core の動作が前提

## Investigation

### ソースコード調査結果

#### ディレクトリ・依存関係

**`tests/` ディレクトリ**: ggufrs に `tests/` ディレクトリは未作成。
Rust の慣習に従い `crates/ggufrs/tests/server_integration_test.rs` を作成する。

**Cargo.toml dev-dependencies**:
```toml
[dev-dependencies]
mockall = "0.14.0"
tower = "0.5"
```

`reqwest` は未追加。

#### 結合テストからアクセス可能な公開API

```rust
// ggufrs crate の公開API（use ggufrs::* で利用可能）
pub struct GgufEngine { ... }
pub struct GgufConfig { models, server, gpu }
pub struct ServerConfig { bind, models, auto_start_server }
pub enum GgufError { ... }
pub trait InferenceEngine { ... }
pub mod server {
    pub fn build_router(engine: AppState) -> Router;
    pub type AppState = Arc<dyn InferenceEngine + Send + Sync>;
    pub type AppError = (StatusCode, Json<Value>);
}
```

#### スタブ状況

このチケットでは新たなスタブを解決しない。既存のスタブ3件は全て後続チケット担当。

#### 依存チケットの状態

- **M4-1** (#150): ✅ reviewed — ルーター + ハンドラ実装済み
- **M4-2** (#151): ✅ reviewed — サーバー起動・停止実装済み

両依存とも実装完了しており、M4-3 はブロックされていない。

#### 結合テストの設計制約

1. **MockEngine 不可**: `crate::inference::tests::MockEngine` は `pub(crate)` のため、
   結合テスト（別 crate としてコンパイル）からは参照できない。
2. **実モデル不可**: テスト実行に実際の GGUF モデルファイルは不要。
   空の `GgufConfig`（モデル0個）でエンジンを初期化する。
3. **ポート 0**: サーバー起動時にポート 0 を指定し、OS にポートを自動割当させる。
   実際のバインドポートは起動後に取得する。

#### テストアプローチ

```rust
use ggufrs::{GgufEngine, GgufConfig, GpuConfig, GpuProvider, ServerConfig};

/// 結合テスト用のサーバーを起動する
async fn start_test_server() -> (tokio::task::JoinHandle<Result<(), GgufError>>, u16) {
    let config = GgufConfig {
        models: vec![],
        server: ServerConfig {
            bind: "127.0.0.1:0".parse().unwrap(),
            models: vec![],
            auto_start_server: false,
        },
        gpu: GpuConfig { provider: GpuProvider::Cpu, cpu_only: true },
    };
    let engine = Arc::new(GgufEngine::new(config).await.unwrap());
    let handle = engine.clone().start_server(config.server).await.unwrap();
    // ポート 0 の場合、実際のポートを取得する必要がある
    // ... (start_server が現在ポートを返さない課題)
}
```

**課題**: `start_server()` は `JoinHandle` を返すが、実際にバインドされたポート番号を
取得する手段がない（ポート 0 の場合は自動割当）。ポート取得方法が必要。

**解決策**: テストヘルパー内で `TcpListener` を事前にバインドし、そのポート番号と
リスナーを `start_server` に渡す代替手段を検討するか、コードにポート取得機能を追加する。

検討: `axum::serve()` は `TcpListener` を取り、`TcpListener::local_addr()` で
ポートを取得できる。しかし `start_server` 内部でリスナーが隠蔽されている。

**代替アプローチ**:
- ポート 0 ではなく、明示的な固定ポート（例: 18901）を使用してテスト
- または `axum_test` クレートを使用してサーバーレスでテスト

**推奨**: 固定ポート（18401 などの未使用範囲）を使用してテストする。
テストは `#[serial_test::serial]` で直列化し、ポート競合を防止する。

## Test Plan

### 結合テスト計画

テストは `tests/server_integration_test.rs` に記述する。Rust の結合テストは
各ファイルが独立した crate としてコンパイルされる。

#### テスト前提条件

- `Cargo.toml` に `reqwest`（features = ["json"]）を dev-dependencies として追加
- サーバーは固定ポート（18401）を使用。テスト実行時にポートが既に使用中の場合は
  `#[ignore]` 相当のスキップか、エラーハンドリングで graceful に失敗する
- 各テストは独立したサーバーインスタンスで実行

#### 1. サーバーライフサイクル

| # | ケース | 種別 | 内容 |
|---|--------|------|------|
| 1.1 | サーバー起動と正常終了 | 正常系 | start_server → サーバー稼働確認 → handle.abort → 停止 |
| 1.2 | 重複起動のエラー | 異常系 | 同一ポートで2度目の起動 → エラー |

#### 2. GET /v1/models

| # | ケース | 種別 | 内容 |
|---|--------|------|------|
| 2.1 | モデル一覧が 200 OK | 正常系 | GET /v1/models → 200 + `object: "list"` を含む JSON |
| 2.2 | レスポンスが有効な JSON | 正常系 | JSON パース可能 |

#### 3. POST /v1/chat/completions

| # | ケース | 種別 | 内容 |
|---|--------|------|------|
| 3.1 | モデル不在でエラーレスポンス | 異常系 | 実モデル未ロード → 404 + `{"error": ...}` |
| 3.2 | 不正なリクエストボディ | 異常系 | 空ボディ → 400 |

#### 4. POST /anthropic/v1/messages

| # | ケース | 種別 | 内容 |
|---|--------|------|------|
| 4.1 | Anthropic エンドポイントが動作 | 異常系 | 不正リクエスト → 400 |
| 4.2 | 空ボディでエラーレスポンス | 異常系 | `{}` → 400 |

#### 5. サーバー Drop による停止

| # | ケース | 種別 | 内容 |
|---|--------|------|------|
| 5.1 | server_handle.abort() 後ポートが解放 | 正常系 | drop(handle) 後、同一ポートでの再バインドが成功 |

### ユニットテスト不可能な項目（例外）

| 項目 | 理由 |
|------|------|
| 実際のモデル推論の動作確認 | テスト実行に GGUF モデルファイル（約600MB）が必要。CI でもモデルダウンロードは別チケット（M5-1） |
| MockEngine を使用したハンドラテスト | M4-1 のユニットテストで既にカバー済み（20ケース） |
| Anthropic ↔ OpenAI 変換の完全性 | llm-bridge-core の動作確認であり ggufrs の結合テスト範囲外 |

## Boy Scout Rule — 翻訳可能性計画

### 現在のコードの評価

新規作成ファイルであるため、過去の違反を引き継ぐリスクはない。
以下の翻訳可能性ルールを遵守して実装する：

### M4-3 実装で遵守すべき翻訳可能性のルール

1. **関数名は動詞句にする**:
   - `start_test_server` — 「テストサーバーを起動する」
   - `test_server_lifecycle` — 「サーバーライフサイクルをテストする」
   - 各テスト関数: `test_models_endpoint`, `test_chat_completion_error` 等

2. **変数名はドメイン概念を表現する**:
   - `engine` — GgufEngine インスタンス
   - `server_handle` — サーバーの JoinHandle
   - `client` — reqwest クライアント
   - `response` — HTTP レスポンス

3. **一関数一責務**: 各テスト関数は単一のシナリオをテスト。ヘルパー関数は
   `start_test_server()` として分離。

4. **ハードコード値の定数化**: テスト用ポート番号は関数内 const として定義:
   ```rust
   const TEST_PORT: u16 = 18401;
   ```

5. **不要なデバッグ出力の禁止**: テスト内の `println!` / `eprintln!` /
   `dbg!` を使用しない（テスト失敗時のアサート失敗で十分な情報が得られる設計にする）。

### 具体的な改善

- `Cargo.toml` の `[::STUB::]` コメント行を整理（dev-dependencies のコメントアウトされた
  `mockall = "0.13"` 行が残っている → 削除する）

## Acceptance Criteria

- [ ] `tests/server_integration_test.rs` が作成されている
- [ ] サーバーライフサイクルテストが実装されている（起動 → 確認 → 停止）
- [ ] GET /v1/models の結合テストが実装されている
- [ ] POST /v1/chat/completions のエラーレスポンステストが実装されている
- [ ] POST /anthropic/v1/messages のエラーレスポンステストが実装されている
- [ ] `reqwest` が dev-dependencies に追加されている
- [ ] 全既存テスト（158件）が通過している
- [ ] 新規結合テストが全て通過している
- [ ] `cargo fmt` / `cargo clippy` が通過している
- [ ] 翻訳可能性ルールに従った命名・構造になっている

## Notes

- `reqwest` v0.12 を dev-dependencies に追加（features = ["json"]）
- 結合テストは `#[tokio::test]` を使用（integration test でも `tokio` は dev-dependencies に含める必要あり。`tokio` は既に通常依存にあるので、integration test からは `ggufrs` の再 export または `tokio` を直接参照する）
- 結合テスト用のポート競合を避けるため、`18401` を使用（zasso の管理ポート範囲外のポート番号）
- 依存: M4-1（build_router）✅完了、M4-2（start_server）✅完了
- 後続チケット: M5-2（test-run バイナリ）、M5-3（モデル結合テスト）
- 参照: RFC.md §9.1（単体テスト）、§9.2（結合テスト）
- 参照: `crates/ggufrs/Tickets.md` L525-547（オリジナルチケット定義）

### 成果物

- 計画: context/0152-m4-3-testsserver-integration-testrs/plan.md（未作成、`/plan-ticket` 承認後に作成）
- 実装サマリ: context/0152-m4-3-testsserver-integration-testrs/implementation.md（未作成、`/start-ticket` 実装完了後に作成）
- レビュー報告書: context/0152-m4-3-testsserver-integration-testrs/review.md（未作成、`/review-ticket` 全チェック通過後に作成）
