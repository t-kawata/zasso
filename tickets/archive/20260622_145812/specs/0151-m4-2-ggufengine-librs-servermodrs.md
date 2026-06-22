---
ticket_id: 151
title: "M4-2: GgufEngine サーバー統合 (lib.rs, server/mod.rs)"
slug: m4-2-ggufengine-librs-servermodrs
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0151-m4-2-ggufengine-librs-servermodrs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0151-m4-2-ggufengine-librs-servermodrs/review.md
plan_path: /Users/kawata/shyme/zasso/tickets/context/0151-m4-2-ggufengine-librs-servermodrs/plan.md
---

# M4-2: GgufEngine サーバー統合 (lib.rs, server/mod.rs)

## Summary

`GgufEngine` に HTTP サーバーのライフサイクル管理機能を追加する。
`start_server()` で Axum サーバーを起動し、`new_with_auto_start()` で
設定に基づく自動起動を可能にする。Drop 時の graceful shutdown により
リソースリークを防止する。

## Background

### 設計上の位置づけ（RFC §3.4）

M4-1 でルーター + ハンドラは実装済みだが、これらを実際に起動する
サーバーライフサイクル管理（bind、serve、shutdown）は未実装。
`GgufEngine` は `server_handle` フィールドを持っているが、
`#[allow(dead_code)]` で抑制されており未使用状態。

M4-2 で以下の3機能を実装し、サーバーを実際に使用可能にする：

1. **`start_server()`**: `build_router()` を呼び出し、`axum::serve()` で HTTP サーバーを起動
2. **`new_with_auto_start()`**: `auto_start_server` フラグに応じて自動起動
3. **`shutdown_signal()`**: Ctrl+C / SIGTERM による graceful shutdown

### 現在の実装状況

- `lib.rs` L52-66: `server_handle` フィールドは **定義済みだが `#[allow(dead_code)]`**
- `lib.rs` L85: `server_handle: Mutex::new(None)` — **初期化済み**
- `lib.rs` L63: `[::STUB::] M4-2 で start_server() 実装時に使用`
- `server/mod.rs` L7: `[::STUB::] M4-2 で GgufEngine との統合を実装`
- `server/router.rs`: `build_router()` — **実装済み**（M4-1）
- `config.rs`: `ServerConfig` — **定義済み**（`bind`, `models`, `auto_start_server`）
- `Cargo.toml`: tokio（signal feature） — **追加済み**（`signal` feature 有り）

### このチケットの必要性

M4-1 でルーター + ハンドラは完成したが、これらは `build_router()` を呼び出して
Router を取得するところまで。実際に TCP ポートで待受けて HTTP リクエストを
処理するには `axum::serve()` の呼び出しが必要。また、サーバーの起動・停止の
ライフサイクルを `GgufEngine` と統合することで、利用者は単一のエンジンインスタンスで
ライブラリ API とサーバー機能の両方を利用できるようになる。

## Scope

### 実装するもの

1. **`GgufEngine::start_server()`** (`lib.rs`)
   - シグネチャ: `pub async fn start_server(self: Arc<Self>, config: ServerConfig) -> Result<JoinHandle<Result<()>>>`
   - `crate::server::build_router()` を呼び出して Router を構築
   - `tokio::net::TcpListener::bind(config.bind)` で TCP リスナーを起動
   - `axum::serve(listener, app).with_graceful_shutdown(shutdown_signal())` で HTTP サーバー起動
   - `JoinHandle` を `self.server_handle` に内部保存
   - `JoinHandle` を戻り値として返す（呼び出し元が死活監視可能）

2. **`GgufEngine::new_with_auto_start()`** (`lib.rs`)
   - シグネチャ: `pub async fn new_with_auto_start(config: GgufConfig) -> Result<Arc<Self>>`
   - `GgufEngine::new(config.clone())` でエンジンを初期化
   - `config.server.auto_start_server` が `true` の場合、`tokio::spawn` で `start_server()` を自動起動
   - `Arc<Self>` を返す（`start_server()` が `self: Arc<Self>` を要求するため）

3. **`shutdown_signal()`** (`lib.rs` または `server/mod.rs`)
   - Ctrl+C と SIGTERM（Unix）の2系統を `tokio::select!` で待機
   - シグナル受信時に graceful shutdown をトリガー

4. **`impl Drop for GgufEngine`** (`lib.rs`)
   - `server_handle` が `Some` の場合、`handle.abort()` を呼び出す
   - サーバープロセスのリソースリークを防止

5. **`server/mod.rs` 更新**
   - `build_router`, `AppState`, `AppError` の再公開（M4-1 で既に実装済み）
   - M4-2 の STUB コメントを削除
   - 必要に応じて `shutdown_signal()` の配置

6. **`lib.rs` 更新**
   - `start_server()`, `new_with_auto_start()`, `impl Drop` の追加
   - `server_handle` の `#[allow(dead_code)]` を除去
   - `[::STUB::]` マーカーを削除

### 実装しないもの

- 結合テスト（`tests/server_integration_test.rs`）— M4-3 で実装
- test-run バイナリからのサーバー呼び出し — M5-2 で実装
- 複数サーバーインスタンスの管理（1エンジン1サーバーのみ）
- TLS/HTTPS サポート

## Investigation

### ソースコード調査結果

#### lib.rs の現在の構造

**ファイル: `crates/ggufrs/src/lib.rs`**（138行）

- GgufEngine 構造体（L52-67）: `registry` + `server_handle` フィールド
- `server_handle`（L65）: `Mutex<Option<JoinHandle<Result<(), GgufError>>>>` — `#[allow(dead_code)]` あり
- `GgufEngine::new()`（L80-88）: `server_handle: Mutex::new(None)` で初期化
- `impl Drop` は未実装

```rust
#[allow(dead_code)]
pub(crate) server_handle: Mutex<Option<JoinHandle<Result<(), crate::error::GgufError>>>>,
```

**M4-2 で変更すべき箇所:**
- `#[allow(dead_code)]` を `server_handle` から除去（`start_server()` が使用するため）
- `start_server()` を `impl GgufEngine` ブロックに追加
- `new_with_auto_start()` を追加
- `impl Drop for GgufEngine` を追加
- `shutdown_signal()` を追加（コードサイズ次第で別関数として lib.rs または server/mod.rs に配置）

#### server/mod.rs の構造

```rust
pub mod openai;
pub mod router;
pub use router::{build_router, AppError, AppState};
// [::STUB::] M4-2 で GgufEngine との統合を実装
```

M4-2 実装後、STUB コメントを削除する。`build_router()` は `server::build_router()` として
既に利用可能。

#### 依存クレートの状態

| クレート | 用途 | 状態 |
|---------|------|------|
| `axum = "0.8"` | HTTP サーバー | ✅ 追加済み |
| `tokio = "1"` (signal feature) | 非同期ランタイム + シグナル処理 | ✅ 追加済み（features = ["signal"]） |
| `tracing = "0.1"` | サーバー起動・停止のロギング | ✅ 追加済み |

#### ServerConfig の状態

```rust
pub struct ServerConfig {
    pub bind: SocketAddr,
    pub models: Vec<String>,
    pub auto_start_server: bool,
}
```

全フィールド定義済み。`start_server()` の引数として使用可能。

#### スタブ状況

M4-2 で解決される STUB：

```
crates/ggufrs/src/lib.rs:63:
  [::STUB::] M4-2 で start_server() 実装時に使用 → start_server 実装後、マーカー削除

crates/ggufrs/src/server/mod.rs:7:
  [::STUB::] M4-2 で GgufEngine との統合を実装 → 統合完了後、マーカー削除
```

M4-2 では解決しない STUB（後続チケット担当）：

```
crates/ggufrs/src/bin/test-run.rs: (M5-2)
crates/ggufrs/src/consts/settings.rs: (dead_code 抑制)
```

#### 依存チケットの状態

- **M4-1** (#150): ✅ reviewed — `build_router()` 実装済み、`AppState`/`AppError` 利用可能
- **M2-3** (#143): ✅ reviewed — `GgufEngine::new()` 実装済み、`server_handle` フィールド定義済み

両依存ともコード実装は完了しており、M4-2 はブロックされていない。

### 参照: RFC のコード例（§3.4）

```rust
impl GgufEngine {
    pub async fn start_server(
        self: Arc<Self>,
        config: ServerConfig,
    ) -> Result<JoinHandle<Result<()>>> {
        let bind = config.bind;
        let handle = tokio::spawn(async move {
            let app = build_router(self);
            let listener = tokio::net::TcpListener::bind(bind).await?;
            axum::serve(listener, app)
                .with_graceful_shutdown(shutdown_signal())
                .await?;
            Ok(())
        });
        *self.server_handle.lock().unwrap() = Some(handle.clone());
        Ok(handle)
    }
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c().await.expect("failed to install Ctrl+C handler");
    };
    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv().await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}
```

**注**: RFC コード例は `anyhow::Result` を使用しているが、ggufrs は `GgufError` を使用する。
実際の実装では `GgufError` に置き換える。`signal::ctrl_c()` の `expect()` は
RFC の簡略表現であり、実際にはエラー伝播するかログに記録する。

## Test Plan

### ユニットテスト計画

テストは `lib.rs` の `#[cfg(test)] mod tests` に追加する。
`Mutex` と `JoinHandle` の操作が中心のため、実際のサーバー起動ではなく
ロジックの検証に重点を置く。

#### 1. Drop 時の server_handle 動作

| # | ケース | 種別 | 内容 |
|---|--------|------|------|
| 1.1 | server_handle が None の場合、Drop がパニックしない | 正常系 | サーバー未起動の GgufEngine を Drop → 正常終了 |
| 1.2 | server_handle が Some の場合、Drop が abort を呼ぶ | 正常系 | JoinHandle をセットした状態で Drop → abort される（handle の状態確認） |

注意: Drop テストは `tokio::spawn` したタスクを abort する挙動の確認であり、
実際のサーバー起動は行わない。`JoinHandle` をモック的に作成する代わりに、
`tokio::spawn(async { loop { tokio::time::sleep(Duration::from_secs(3600)).await; } })` で
実タスクを作成し、Drop 後にタスクが停止することを確認する。

#### 2. start_server のロジック

| # | ケース | 種別 | 内容 |
|---|--------|------|------|
| 2.1 | ポート 0 でサーバー起動が成功する | 正常系 | 任意の利用可能ポートで bind できることを確認（サーバー起動後、実際に HTTP リクエストを送信） |
| 2.2 | 重複ポートで起動時にエラー | 異常系 | 既に使用中のポート → エラーが返る |

注意: 2.1, 2.2 は結合テストに近い（TCP ポート操作を含む）。M4-3 の結合テストで
詳細にテストする場合は、ここでは最小限の確認に留める。

#### 3. new_with_auto_start のロジック

| # | ケース | 種別 | 内容 |
|---|--------|------|------|
| 3.1 | auto_start_server=true でエンジン生成 | 正常系 | サーバーが自動起動し、正常に動作する |
| 3.2 | auto_start_server=false でエンジン生成 | 正常系 | サーバーが起動しない（server_handle が None） |
| 3.3 | auto_start_server=true の起動失敗 | 異常系 | バインドエラーなど → Err が返る |

#### 4. shutdown_signal の存在確認

| # | ケース | 種別 | 内容 |
|---|--------|------|------|
| 4.1 | shutdown_signal がコンパイル可能 | 正常系 | 関数が定義され、呼び出し可能であることを確認 |

#### カバレッジ目標

- `GgufEngine::start_server()`: ラインカバレッジ 90% 以上
- `GgufEngine::new_with_auto_start()`: ラインカバレッジ 100%
- `impl Drop`: ラインカバレッジ 100%
- `shutdown_signal()`: 関数定義の確認（シグナル待機はテスト環境で実測困難）

### ユニットテスト不可能な項目（例外）

| 項目 | 理由 |
|------|------|
| `shutdown_signal()` の全経路テスト | Ctrl+C と SIGTERM のシグナル送信はテストランナーのシグナル処理と干渉するため、ユニットテストではテスト不可能。結合テスト環境で個別検証する（M4-3）。 |
| 実際の TCP バインドと HTTP 応答 | ポート 0 を使用した起動確認はユニットテストでも可能だが、実際の HTTP リクエスト到達確認は M4-3 の結合テストに委ねる。 |

## Boy Scout Rule — 翻訳可能性計画

### 現在のコードの評価

lib.rs に追加するコードは新規であり、既存の違反を引き継ぐリスクはない。
以下の翻訳可能性ルールを遵守して実装する：

### M4-2 実装で遵守すべき翻訳可能性のルール

1. **関数名は動詞句にする**:
   - `start_server` — 「サーバーを起動する」
   - `new_with_auto_start` — 「自動開始付きで新しく生成する」
   - `shutdown_signal` — 「シャットダウン信号を待機する」

2. **変数名はドメイン概念を表現する**:
   - `bind` — バインドアドレス
   - `listener` — TCP リスナー
   - `app` — Axum アプリケーション（Router）
   - `handle` — JoinHandle（タスクハンドル）
   - `ctrl_c` / `terminate` — シグナル種類

3. **一関数一責務**:
   - `start_server`: サーバー起動とハンドル保存（bind + serve は一連の責務）
   - `new_with_auto_start`: エンジン生成 + 条件付き自動起動
   - `shutdown_signal`: シグナル待機のみ
   - `Drop::drop`: リソース解放のみ

4. **ハードコード値の定数化**:
   - ポート番号: `settings.rs` の `DEFAULT_RT_PORT` をデフォルト値として使用する（RFC の例では `127.0.0.1:3910` と直書きされているが、これをコード中にハードコードしない）
   - RFC の `expect("failed to install signal handler")` はエラー伝播に置き換える

5. **`?` 演算子によるエラー伝播**:
   - RFC コード例では `expect()` / `unwrap()` が使われているが、これらを `?` + `GgufError::ServerStartupFailed` に置き換える
   - `self.server_handle.lock().unwrap()` はテストコードのみ（Mutex のロックエラーは回復不能）

6. **コメントは「なぜ」を説明**:
   - コードが「何を」しているかは関数名で語る
   - コメントは「なぜ `Arc<Self>` を要求するか」「なぜ `select!` で2系統待つか」等の設計判断を日本語で説明

### 具体的な改善

- `server_handle` の `#[allow(dead_code)]` を除去（このチケットで解決）
- `[::STUB::]` マーカー2箇所を削除
- RFC のサンプルコードにあった `expect()` 使用箇所をエラー伝播に直す
- `shutdown_signal()` の `expect()` を `tracing::warn` + 継続に変更（Ctrl+C ハンドラのインストール失敗は
  致命的ではないため、ログに記録して graceful shutdown なしで継続するのが堅牢）

## Acceptance Criteria

- [ ] `GgufEngine::start_server()` が実装され、正常にサーバーを起動できる
- [ ] `GgufEngine::new_with_auto_start()` が実装され、auto_start_server フラグに応じて動作する
- [ ] `impl Drop for GgufEngine` が実装され、Drop 時にサーバーが abort される
- [ ] `shutdown_signal()` が Ctrl+C + SIGTERM（Unix）を待機する
- [ ] `server_handle` の `#[allow(dead_code)]` が除去されている
- [ ] `lib.rs` の `[::STUB::] M4-2 で start_server() 実装時に使用` が削除されている
- [ ] `server/mod.rs` の `[::STUB::] M4-2 で GgufEngine との統合を実装` が削除されている
- [ ] 既存テスト（153件）が全て通過している
- [ ] 新規テストが全て通過している
- [ ] RFC のサンプルコードにあった `expect()` / `unwrap()` がエラー伝播に置き換えられている
- [ ] `cargo fmt` / `cargo clippy` が通過している
- [ ] 翻訳可能性ルールに従った命名・構造になっている

## Notes

- `start_server()` の `self: Arc<Self>` 要件は、`build_router()` が `AppState = Arc<dyn InferenceEngine>` を要求するため
- `axum::serve()` は `axum 0.8` の API（`hyper 1.x` ベース）を使用。`with_graceful_shutdown()` は
  `tokio::signal` の Future を受け取る
- `shutdown_signal()` の `signal::ctrl_c()` 失敗時の動作: インストール失敗は `tracing::warn` でログに記録し、
  処理を継続する（Ctrl+C が使えない環境でもサーバーが動作するように）
- `new_with_auto_start()` は `Arc<Self>` を返す — 呼び出し元はクローンして共有可能
- 依存: M4-1（build_router）✅完了（reviewed）、M2-3（GgufEngine::new）✅完了（reviewed）
- 後続チケット: M4-3（サーバー結合テスト）、M5-2（test-run バイナリ）
- 参照: RFC.md §3.4（非同期サーバー起動とシャットダウン）
- 参照: `crates/ggufrs/Tickets.md` L500-525（オリジナルチケット定義）

### 成果物

- 計画: context/0151-m4-2-ggufengine-librs-servermodrs/plan.md（未作成、`/plan-ticket` 承認後に作成）
- 実装サマリ: context/0151-m4-2-ggufengine-librs-servermodrs/implementation.md（未作成、`/start-ticket` 実装完了後に作成）
- レビュー報告書: context/0151-m4-2-ggufengine-librs-servermodrs/review.md（未作成、`/review-ticket` 全チェック通過後に作成）
