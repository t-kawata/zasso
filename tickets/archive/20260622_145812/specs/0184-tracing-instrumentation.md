---
ticket_id: 184
title: 観測可能性・メトリクス配線 + tracing instrumentation
slug: tracing-instrumentation
status: reviewed
created_at: 2026-06-22
updated_at: 2026-06-22
implementation_path: /Users/shyme01/shyme/zasso/tickets/context/0184-tracing-instrumentation/implementation.md
review_report_path: /Users/shyme01/shyme/zasso/tickets/context/0184-tracing-instrumentation/review.md
---
# 観測可能性・メトリクス配線 + tracing instrumentation

## Summary

`observability/metrics.rs` に実装済みのメトリクスカウンタ（`register_metrics`, `record_request`, `format_metrics`）が各ハンドラ・ライフサイクルから呼び出されておらず、実質的に機能していない。また tracing instrumentation（`tracing::info_span!` / `.instrument()`）が未実装で、リクエスト単位のトレーサビリティが確保されていない。さらに CancellationToken の伝播と failover metrics カウンタの追加、非UTF-8 header 値の適切な処理を実装する。

## Background

anthropx プロキシは LLM リクエストを中継するプロダクションサーバーである。可用性・監視可能性はプロダクション品質に必須だが、現在は以下の問題がある：

1. **メトリクスが出力されない**: `/metrics` エンドポイントは常にゼロ値しか返さない（`record_request` がどこからも呼ばれていない）
2. **リクエストトレースがない**: 各リクエストに tracing span が割り当てられておらず、ログとリクエストの関連付けが不可能
3. **Failover が観測できない**: failover（key 再試行）が発生してもカウンタが増加せず、可用性指標が取得できない
4. **SSE stream が graceful shutdown に応答しない**: `proxy_sse_stream` が CancellationToken を無視しており、サーバー停止時に stream が強制切断されない
5. **非UTF-8 header がサイレントドロップ**: `filter_response_headers` で非UTF-8 header 値が警告なしに消失する

## Investigation

### 調査方法

全ソースコードの解析、grep によるメトリクス/tracing 関連の使用箇所特定、各モジュールのインターフェース検証を行った。

### Finding 1: `register_metrics()` がライフサイクルから呼ばれていない

- **定義箇所**: `observability/metrics.rs:32` — `pub fn register_metrics()` は存在するが、中身は空（静的初期化済みのため noop）
- **呼び出し元**: `lifecycle.rs:36-76` — `ProxyServer::start()` の起動シーケンスに `register_metrics()` の呼び出しがない
- **不変条件違反**: Tickets.md に「register_metrics() は ProxyServer::start() から呼ばれる」と明記されている
- **影響**: 現状は noop のため実害はないが、将来カウンタ動的追加に対応した際に初期化漏れとなる

### Finding 2: `record_request()` がどの handler からも呼ばれていない

- **定義箇所**: `observability/metrics.rs:42` — `pub fn record_request(status: u16)` は完全実装済み（total/success/4xx/5xx の振り分けロジック）
- **呼び出し元調査結果**: `routes.rs:96-147` — `handle_messages` の成功パスもエラーパスも `record_request()` を一切呼んでいない
  - 成功時: `handle_transparent(state, ...).await` または `handle_translate(...).await` の結果をそのまま return
  - エラー時: `?` 演算子で早期リターン → `ProxyError::into_response()` でエラーレスポンス
- **内部エンドポイント**: `healthz`(routes.rs:28), `metrics_handler`(routes.rs:35), `list_models`(routes.rs:49) も `record_request()` を呼んでいない
  - これらは内部監視用のため record_request の対象外としても問題ない（設計判断が必要）
- **不変条件違反**: Tickets.md に「record_request() は各 handler の出口で呼ばれる」と明記
- **影響**: `/metrics` エンドポイントが常にゼロ値を返す。メトリクスが完全に機能していない

### Finding 3: Tracing instrumentation が未実装

- **確認結果**: `routes.rs:96-147` — `handle_messages` に `tracing::info_span!` も `.instrument(span)` も存在しない
- **既存の tracing 使用箇所**:
  - `main.rs:36` — `tracing::info!("shutdown signal received, ...")`
  - `main.rs:40` — `tracing::info!("server stopped")`
  - `lifecycle.rs:42` — `tracing::error!("config validation error: {err}")`
  - `translate.rs:35,168,310` — `tracing::warn!(...)` で lossy downgrade の警告
- **不変条件違反**: Tickets.md に「tracing::info_span! は handle_messages で生成され .instrument(span) でラップする」と明記
- **影響**: リクエストID、provider名、model名、stream有無がトレースコンテキストとして伝播しない。ログから特定リクエストの処理経過を追跡不可能
- **補足**: `Cargo.toml` には `tracing = "0.1.44"` と `tracing-subscriber = { version = "0.3.23", features = ["json"] }` が既に存在するため依存追加は不要

### Finding 4: Failover metrics カウンタが存在しない

- **該当コード**: `transparent.rs:64-96` — `execute_with_failover` は 5xx 時に別 key で最大3回再試行するが、failover 発生を記録するカウンタがない
- **metrics.rs の現状**: カウンタは TOTAL_REQUESTS / SUCCESS_REQUESTS / ERROR_4XX / ERROR_5XX の4つのみ。failover 用のカウンタは未定義
- **不変条件違反**: Tickets.md に「failover metrics カウンタは execute_with_failover からインクリメントされる」と明記
- **影響**: failover（可用性を支える重要機能）の発生頻度が一切観測できない

### Finding 5: CancellationToken が ServerHandle から伝播されていない

- **該当コード**: 
  - `lifecycle.rs:48` — `CancellationToken::new()` で生成
  - `lifecycle.rs:94` — `shutdown()` で `self.cancel.cancel()` を発火
  - `provider/transparent.rs:119` — `proxy_sse_stream(_cancel: CancellationToken, ...)` 引数は unused（先頭 `_`）
  - `provider/transparent.rs:152-153` — `stream_response` 内で新規 `CancellationToken::new()` を作成しており、ServerHandle の token が伝播されない
  - `handle_transparent`(transparent.rs:23) / `handle_messages`(routes.rs:96) のシグネチャに CancellationToken がない
  - translate mode (`collect_and_transform_stream`, translate.rs:372) にもキャンセル機構なし
- **不変条件違反**: Tickets.md に「proxy_sse_stream に CancellationToken を伝播（ServerHandle の shutdown で stream 中断）」と明記
- **影響**: サーバー停止時に SSE stream が中断されず、クライアントが切断を検知できないか、リソースリークが発生する
- **アーキテクチャ判断**: CancellationToken の伝播経路として、`AppState`（app_state.rs）に持たせる方法が適切。全 handler が `Arc<AppState>` 経由でアクセス可能になる

### Finding 6: 非UTF-8 header 値が無警告で静かにドロップされる

- **該当コード**: `transparent.rs:178-199` — `filter_response_headers`
  ```rust
  .filter_map(|(name, value)| {
      value
          .to_str()       // ← 非UTF-8 だと Err を返す
          .ok()            // ← 静かに無視（Err は None に変換）
          .map(|v| (name.as_str().to_string(), v.to_string()))
  })
  ```
- **Tickets.md の要件**: 「json_response の非UTF-8 header 値を適切に処理」と明記
- **影響**: upstream が非UTF-8 の header 値（例: Latin-1 エンコードされたカスタム header）を返した場合、その header が無警告で消失する
- **補足**: axum/http の `HeaderValue::to_str()` は ASCII/UTF-8 のみサポート。非UTF-8 値は `to_str()` が Err を返す。`bytes()` で生バイトを取得できるが、axum Response builder の header 設定も `HeaderValue` を要求するため、非UTF-8 値の設定自体が制限される。適切な処理としては「非UTF-8 header を警告ログに出力した上でドロップする」が現実的

## Scope

### スコープ内

1. **`lifecycle.rs`**: `ProxyServer::start()` の冒頭で `metrics::register_metrics()` を呼び出す
2. **`routes.rs`**: `handle_messages` の成功パスとエラーパスで `metrics::record_request(status)` を呼び出す
   - 成功時: ハンドラ結果から HTTP ステータスを取得
   - エラー時: `ProxyError` から対応する HTTP ステータスを取得
   - `healthz`, `metrics_handler`, `list_models` は内部エンドポイントのため対象外（設計判断により記録しない）
3. **`routes.rs`**: `handle_messages` に `tracing::info_span!` を生成し、非同期ブロックを `.instrument(span)` でラップ
   - span に `request_id`, `provider`, `model`, `stream` フィールドを含める
   - 成功/エラー時に `tracing::info!` / `tracing::warn!` でログ出力
4. **`observability/metrics.rs`**: Failover 用カウンタ `FAILOVER_COUNT` を追加。`record_failover()` 関数を公開
5. **`transparent.rs`**: `execute_with_failover` の failover 発生箇所で `metrics::record_failover()` を呼び出す
6. **`app_state.rs`**: `CancellationToken` を `AppState` に追加
7. **`lifecycle.rs`**: `ProxyServer::start()` で生成した `CancellationToken` を `AppState::new()` に渡す
8. **`transparent.rs`**: `handle_transparent` → `stream_response` → `proxy_sse_stream` の経路で CancellationToken を伝播し、`proxy_sse_stream` 内で `cancel.cancelled()` を監視して stream を中断する
9. **`provider/translate.rs`**: `collect_and_transform_stream` でも同様に CancellationToken を伝播して stream 中断可能にする（注意: translate mode は全チャンク受信後に変換する設計のため、中断は受信ループの break として実装）
10. **`transparent.rs`**: `filter_response_headers` で非UTF-8 header 値を `tracing::warn!` で警告ログに出力してからドロップする

### スコープ外

- Prometheus や OpenTelemetry 等の外部メトリクスシステムとの統合
- メトリクスのヒストグラムやレイテンシ計測
- アラート設定
- ダッシュボード構築
- ProxyError の tracing フィールド拡張（Error variant ごとの構造化）
- Translate mode の failover 対応（現状は単一 key のみ）

## Test Plan

### ユニットテスト計画

| # | テスト対象 | 内容 | 正常系 | 異常系 | 境界値 |
|---|-----------|------|--------|--------|--------|
| 1 | `metrics::register_metrics()` | 呼び出し後に format_metrics が正常出力される | 全カウンタ0 | — | — |
| 2 | `metrics::record_failover()` | failover カウンタが増加する | 1回/複数回 | — | 0回 |
| 3 | `metrics::format_metrics()` | failover カウンタ行が含まれる | 全カウンタ出力 | — | 0値/最大値 |
| 4 | `transparent::filter_response_headers()` | 非UTF-8 header 値の警告ログ | UTF-8値はそのまま通過 | 非UTF-8値は警告＋ドロップ | — |
| 5 | `routes::handle_messages` | record_request が呼ばれる | 成功時に counter 増加 | エラー時に counter 増加 | — |
| 6 | コンパイル検証 | tracing span がエラーなく生成される | — | — | — |

### テスト詳細

#### Test 1: register_metrics 呼び出し
- `register_metrics()` を呼び出した後に `format_metrics()` が全カウンタ行を含むこと
- 事前リセット不要（初期値0の確認）

#### Test 2: record_failover 呼び出し
```rust
#[test]
fn record_failover_increments_counter() {
    reset_counters();
    record_failover();
    assert_eq!(FAILOVER_COUNT.load(Ordering::Relaxed), 1);
    record_failover();
    assert_eq!(FAILOVER_COUNT.load(Ordering::Relaxed), 2);
}
```

#### Test 3: format_metrics に failover 行が含まれる
```rust
#[test]
fn format_metrics_includes_failover() {
    reset_counters();
    let output = format_metrics();
    assert!(output.contains("anthropx_requests_failover_total"));
}
```

#### Test 4: filter_response_headers の非UTF-8 header
- 非UTF-8 値を含む HeaderMap で `filter_response_headers` を呼び出し
- 非UTF-8 値の header が結果に含まれず、`tracing::warn!` が発行されることを確認
- tracing のテストは `tracing_test::with_default_subscriber` 等を使用

#### Test 5: handle_messages からの metrics 記録
- `routes.rs` のテストに追加:
  - `make_state_with_mock_upstream` を使用して実際の handler 実行
  - handler 実行後に `format_metrics()` でカウンタ増加を確認
  - 成功時: total + success がそれぞれ 1
  - エラー時（model 欠如）: total + 4xx がそれぞれ 1

#### Test 6: コンパイル検証
- tracing span がコンパイルエラーなく生成されること
- `.instrument(span)` の future ラップがコンパイルを通ること

### ユニットテスト不可能な項目（例外）

| # | 項目 | 理由 |
|---|------|------|
| 1 | CancellationToken 伝播による SSE stream 中断の E2E 動作 | axum SSE stream の中断は実際の HTTP 接続が必要。CancellationToken の型結合はコンパイル検証で担保 |
| 2 | tracing span の出力内容の visual 確認 | tracing 出力のフォーマットは tracing-subscriber の責務 |
| 3 | graceful shutdown 連携のタイミング検証 | 実際のシグナルハンドリングとタスク join のタイミングは E2E レベルでしか検証不可 |

## Boy Scout Rule — 翻訳可能性計画

本チケットで触るコードに対する改善：

1. **`transparent.rs` `execute_with_failover`**: 現状の名前は責務を正しく表現している（「failover 付きで実行する」）。変更不要。
2. **`transparent.rs` `proxy_sse_stream`**: 引数 `_cancel` が unused になっている。`cancel` に rename して実際に使用する。
3. **`routes.rs` `handle_messages`**: 現状の処理フローは翻訳可能（「model を取得し、provider を解析し、transparent/translate を分岐する」）。metrics と tracing の追加により責務が増えるが、関数分割するほどではない。ただし内部での責務は明確に関数（`record_request`）委譲することで可読性を維持する。
4. **`filter_response_headers`**: 非UTF-8 header のドロップにコメントで理由を追加（axum HeaderValue の制約であることを明示）。
5. **ハードコード値**: `max_attempts` の `3`（transparent.rs:68）は現在 `scheduler.key_count().min(3)` と動的。magic number としては許容範囲だが、`MAX_FAILOVER_ATTEMPTS` 定数を `metrics.rs` または適切な場所に抽出してもよい。ただし本チケットのスコープ外とし、変更しない。

## Acceptance Criteria

- [ ] `lifecycle.rs` の `ProxyServer::start()` から `metrics::register_metrics()` が呼ばれる
- [ ] `routes.rs` の `handle_messages` 成功時/エラー時に `metrics::record_request(status)` が呼ばれ、`/metrics` エンドポイントが実際の値を返す
- [ ] `handle_messages` に `tracing::info_span!` + `.instrument(span)` が実装され、`request_id`, `provider`, `model` がトレースコンテキストとして伝播する
- [ ] `metrics.rs` に `FAILOVER_COUNT` カウンタと `record_failover()` 関数が追加されている
- [ ] `format_metrics()` に failover カウンタ行が含まれる
- [ ] `execute_with_failover` の failover 発生箇所で `metrics::record_failover()` が呼ばれる
- [ ] `AppState` に `CancellationToken` が追加され、`ProxyServer::start()` から伝播される
- [ ] `proxy_sse_stream` が CancellationToken を監視し、キャンセル時に stream を中断する
- [ ] `collect_and_transform_stream` が CancellationToken を監視し、キャンセル時に受信ループを break する
- [ ] `filter_response_headers` で非UTF-8 header 値が `tracing::warn!` で警告された上でドロップされる
- [ ] 既存テストが全て通過する
- [ ] 全ての `[::STUB::]` マーカーが適切に管理されている（新たな不完全実装を導入しない）

## Notes

### アーキテクチャ判断: CancellationToken の伝播経路

CancellationToken を `AppState` に保持する設計を採用する。経路は以下の通り：

```
ProxyServer::start()
  ├── cancel = CancellationToken::new()
  ├── AppState::new(config, providers, cancel)  ← AppState に保存
  ├── build_router(state)  → 各 handler に Arc<AppState> 経由で伝播
  │     ├── handle_messages(state, body)
  │     │     ├── handle_transparent(state, provider, resolved, body, stream)
  │     │     │     ├── stream_response(upstream_resp, state.cancel)
  │     │     │     │     └── proxy_sse_stream(upstream_resp, cancel)  ← _cancel 廃止
  │     │     │     └── json_response(upstream_resp)  ← 変更なし
  │     │     └── handle_translate(...)
  │     │           └── translate_stream(...) → collect_and_transform_stream(..., cancel)
  │     └── healthz / list_models / metrics_handler  ← 変更なし
  └── ServerHandle { cancel, join_handle }  ← 従来通り ServerHandle も保持
```

`AppState` が CancellationToken を Arc または内部で保持することで、全 handler が常に shutdown シグナルにアクセス可能になる。

### 依存関係

- 先行: M5-2（ProviderClient 導入 + ConcurrencyLimiter 接続）— ✅ 完了
- 後続: M5-4（integration-test feature + テスト環境整備）
- 本チケット内での依存: すべての作業は並行可能。推奨実装順: metrics → tracing → CancellationToken → failover → header処理

### 犯罪 (Malfeasance) の点検結果

`scan-crimes.sh` の結果、未解決の犯罪は0件。新たな不完全実装を導入しないこと。

### 成果物

- 計画: context/0184-tracing-instrumentation/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0184-tracing-instrumentation/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0184-tracing-instrumentation/review.md（未作成、/review-ticket 全チェック通過後に作成）
