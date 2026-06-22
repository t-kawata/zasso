---
ticket_id: 185
title: integration-test feature + テスト環境整備
slug: integration-test-feature
status: reviewed
created_at: 2026-06-22
updated_at: 2026-06-22
dependencies: 
implementation_path: /Users/shyme01/shyme/zasso/tickets/context/0185-integration-test-feature/implementation.md
review_report_path: /Users/shyme01/shyme/zasso/tickets/context/0185-integration-test-feature/review.md
---
# integration-test feature + テスト環境整備

## Summary

CI で常時実行可能な mock server 統合テストを拡充し、実プロバイダーテストを `integration-test` feature で分離する。
また、テストランナーとして `cargo nextest` を導入し、テスト実行環境を整備する。

## Background

- 現状の `real_provider.rs` には feature gate がなく、テストバイナリが常にコンパイルされる。
  `DEEPSEEK_API_KEY` 未設定時はテスト関数自体はスキップされるものの、コンパイル時間の増加と
  意図しない依存（reqwest の full feature 等）が CI に影響する可能性がある。
- RFC.md (§12) では `integration-test = []` feature と `#[cfg_attr(not(feature = "integration-test"), ignore)]`
  による分離が設計されているが、実際の Cargo.toml に未反映。
- `mock_server.rs` に mock upstream サーバーがなく、リクエストが受け付けられることしか確認できていない。
  すなわち「anthropx がプロキシとして正しく upstream に中継する」経路のエンドツーエンド検証が存在しない。
- ConcurrencyLimiter の振る舞い（in-flight 制限、queue overflow）が mock server レベルの統合テストで
  検証されていない（ユニットテストのみ）。
- テスティングフレームワークが標準の `cargo test` のみで、テスト実行時間の計測・フィルタリング・
  並列実行制御の高度な機能を利用できていない。

## Scope

### 必須スコープ

1. **Cargo.toml に `integration-test = []` feature を追加**
   - RFC.md §12 に従い、依存なしの空 feature として定義

2. **real_provider.rs の feature gate**
   - テスト関数レベルで `#[cfg_attr(not(feature = "integration-test"), ignore)]` を付与
   - integration-test feature なしではコンパイルのみ（型チェック）され、実行はスキップ
   - integration-test feature ありの場合のみ実プロバイダーテストが実行される

3. **mock_server.rs の拡充** — mock upstream サーバーによる統合テスト追加
   - axum の Router を用いた mock upstream ハンドラの実装
   - 以下をカバーするテストケース:
     - transparent non-stream: mock upstream → 200 + 正しいレスポンスボディ
     - transparent stream (SSE): mock upstream → 200 + SSE イベント
     - translate non-stream (OpenAI wire): mock upstream → 200
     - ConcurrencyLimiter: in-flight 制限到達時の挙動（429 / ブロック）
     - ConcurrencyLimiter: queue 制限到達時の挙動（429）
     - 認証: 無効な API key → 401
     - /v1/models: mock upstream との整合性

4. **cargo nextest の導入**
   - `dev-dependencies` に追加ではなく、`.config/nextest.toml` と CI 用設定を整備
   - `make test` に統合（デフォルトは標準 cargo test のまま、nextest 用ターゲットも追加）

### 非スコープ

- `#[cfg(test)]` 各モジュール内のユニットテスト修正（既存のユニットテストに手を入れない）
- `real_provider.rs` の translate mode テスト追加（依存する translate 実装の完成度に応じて別チケット）
- CI/CD パイプライン設定（GitHub Actions 等）— 本チケットは anthropx crate 内の設定のみ
- 既存のスタブ（routing/mod.rs の M5-2 関連スタブ）の解決（別チケット対象）

## Investigation

### 証拠1: Cargo.toml — 現状の feature 定義

`crates/anthropx/Cargo.toml` (実ファイル) の feature セクション:

```toml
[features]
default = ["server"]
server = ["dep:axum", "dep:reqwest", "dep:uuid", "dep:llm-bridge-core", "tokio/full"]
```

`integration-test` feature は存在しない。一方 RFC.md (Cargo.toml equivalent セクション, L55-64) では:

```toml
[features]
default = ["server"]
server = ["dep:axum", "dep:reqwest", "dep:tokio/full", "dep:clap", "dep:futures"]
integration-test = []
```

`integration-test` feature が定義されている。RFC と実態に乖離あり。

### 証拠2: real_provider.rs — feature gate 不在

`crates/anthropx/tests/real_provider.rs` の先頭に `#[cfg(feature = "integration-test")]` がなく、
無条件でコンパイルされる。スキップ判定は実行時の環境変数チェックのみ:

```rust
fn load_api_key() -> Option<String> {
    match std::env::var("DEEPSEEK_API_KEY") {
        Ok(key) if !key.is_empty() => Some(key),
        _ => {
            eprintln!("...SKIPPED...");
            None
        }
    }
}
```

### 証拠3: mock_server.rs — mock upstream 不在

`crates/anthropx/tests/mock_server.rs` の全テストケースは、直 URL `http://127.0.0.1:{port}/mock`
を base_url に設定しているが、実際にそのアドレスでリッスンするサーバーは存在しない。
そのため全テストが「upstream 不在によるエラー」を期待するテストになっており、
proxy として正しく中継できることの確認ができていない。

現状のテスト一覧（7件）:
| テスト名 | 検証内容 | upstream |
|----------|----------|----------|
| `healthz_metrics_return_200` | 管理系エンドポイント | 不要 |
| `models_sorted_by_provider_public` | モデル一覧ソート順 | 不要 |
| `model_without_slash_returns_400` | 400 エラー | 不要 |
| `request_to_proxy_returns_response` | queue overflow → 429 | 不要 |
| `transparent_non_stream_accepts_request` | エラーが返る | 不在 |
| `non_stream_key_failover_handles_error` | エラーが返る | 不在 |
| `stream_no_failover_returns_error` | エラーが返る | 不在 |

`transparent_non_stream_accepts_request` 等は mock upstream を立てれば 200 を期待できる。

### 証拠4: ConcurrencyLimiter — 統合テスト不在

`src/provider/limiter.rs` には 6 件のユニットテストが存在する（acquire/release、in-flight block、
queue full、try_acquire、Display、Error trait）。しかし、HTTP リクエストを伴う統合テストで
ConcurrencyLimiter の動作が検証されていない。

### 証拠5: スタブと犯罪

- スタブ: 1件 — `routing/mod.rs` L24（M5-2 で解決予定）— 本チケットのスコープ外
- 犯罪: 0件 — clean

## Test Plan

### ユニットテスト計画

本チケットの作業の性質上、ユニットテスト（`#[cfg(test)]` モジュール内のテスト）は
既存テストの維持のみを対象とし、新規ユニットテストの追加は以下に限定する:

| テスト対象 | ケース | 種別 |
|-----------|--------|------|
| 既存 limiter.rs テスト | 変更なし、現状維持 | — |
| 既存 config/mod.rs テスト | 変更なし、現状維持 | — |
| 既存 routing/mod.rs テスト | 変更なし、現状維持 | — |

新規ユニットテストの追加は本チケットでは行わない（統合テスト拡充に集中する）。

### 統合テスト計画（mock_server.rs 拡充）

axum_test の TestServer を mock upstream として使用し、 anthropx → mock upstream の経路を検証する。

**テスト1: transparent non-stream 正常系**
- mock upstream: `/v1/messages` に対して固定 JSON レスポンス（Anthropic 互換形式）
- anthropx 経由でリクエスト → 200 + 正しい JSON ボディ
- 期待: `mock.post("/v1/messages")` がストリーミングなしで成功

**テスト2: transparent stream 正常系（SSE）**
- mock upstream: `/v1/messages?stream=true` に対して SSE レスポンス
- anthropx 経由でリクエスト → 200 + text/event-stream

**テスト3: ConcurrencyLimiter — max_in_flight 超過**
- max_in_flight=1, max_queue=0 の設定
- mock upstream ハンドラで意図的に 200ms スリープ
- 1 つ目のリクエストを送信（in-flight 消費）
- 2 つ目のリクエスト → 429 (QueueFull)

**テスト4: ConcurrencyLimiter — queue 超過**
- max_in_flight=0, max_queue=0 の設定
- リクエスト → 429

**テスト5: translate non-stream 正常系（OpenAI wire）**
- provider mode=translate, openai_wire_api=Auto
- mock upstream: `/v1/chat/completions` をリッスン
- anthropx 経由で translate → 200

**テスト6: 認証 — 無効な API key**
- API key がマッチしないリクエスト → 401

**テスト7: /v1/models — provider 一覧との整合性**
- mock upstream に /v1/models エンドポイントを生やし、
  anthropx の /v1/models が provider 設定と整合していることを確認

### ユニットテスト不可能な項目（例外）

| 項目 | 理由 |
|------|------|
| 実プロバイダーテスト | 外部 API key が必要。`integration-test` feature で分離 |
| SSE ストリーミングの完全検証 | axum_test では SSE の完全なハンドシェイク検証が困難 |
| ネットワークエラー時のリトライ | ネットワークスタックに依存する挙動のため |

## Boy Scout Rule — 翻訳可能性計画

本チケットで触るコードはテストコード（`tests/mock_server.rs`, `tests/real_provider.rs`）と
`Cargo.toml` の設定行が中心である。以下の改善を計画する:

1. **mock_server.rs** — 現在のテストファイルはコメント（日本語）、テスト関数名（英語）の
   ハイブリッド状態。関数名を散文として読める形に統一し、各テストの日本語説明コメントを追加する。
   また、現在 `test_port()` の戻り値 18910 がハードコードされており、これを名前付き定数に抽出する。

2. **real_provider.rs** — `load_api_key()` のスキップメッセージが println! でなく eprintln! に
   なっているが、定型メッセージ文字列を定数化できるか検討（必須ではない）。

3. **既存のハードコード値**: `test_port()` の `18910` を `MOCK_SERVER_BASE_PORT` 定数として抽出。

4. **コメントの一貫性**: テストファイル内の日本語コメントが「なぜ」ではなく「何を」説明している
   箇所を特定し、必要に応じてコードの可読性向上に置き換える（コメントで補わず関数名で語らせる）。

## Acceptance Criteria

### 機能要件

- [ ] `cargo test` で `integration-test` なし: 全 unit + mock test が pass（実プロバイダーテストはスキップ）
- [ ] `cargo test --features integration-test`: 実プロバイダーテストを含む全テストが実行可能
- [ ] real_provider.rs に `#[cfg_attr(not(feature = "integration-test"), ignore)]` が付与されている
- [ ] mock_server.rs に mock upstream を使った transparent non-stream 正常系テストが追加されている
- [ ] mock_server.rs に ConcurrencyLimiter の統合テストが追加されている（max_in_flight, queue）
- [ ] mock upstream を使った translate non-stream テストが追加されている
- [ ] 認証エラー（無効な API key）のテストが追加されている
- [ ] `cargo nextest` でのテスト実行が可能（`make test-nextest` 等）

### 翻訳可能性要件

- [ ] `test_port()` のハードコード値 `18910` が名前付き定数に抽出されている
- [ ] テスト関数名が散文として読める英語になっている
- [ ] 日本語コメントが「なぜ」を説明している（「何を」は関数名が語る）

### 品質要件

- [ ] 既存テスト（unit tests 全件）が通過している
- [ ] 新規追加テストが全て通過している
- [ ] `cargo clippy` が警告ゼロ
- [ ] 犯罪スキャンで新たな犯罪が記録されていない

## Notes

### 関連リソース

- RFC.md §12 テスト戦略 — mock と real provider の二層構成の設計
- `src/provider/limiter.rs` — ConcurrencyLimiter 本体と既存ユニットテスト
- `tests/mock_server.rs` — 拡充対象の統合テストファイル（現状 265 行）
- `tests/real_provider.rs` — feature gate 対象の実プロバイダーテストファイル

### 依存関係

- 先行チケット M5-1, M5-2, M5-3 は全て完了済み
- Translate mode の統合テストには `llm-bridge-core` の正常動作が必要（M5-1 で完了済み）
- `cargo nextest` は cargo の拡張であり、プロジェクトへの導入は任意

### 成果物

- 計画: context/0185-integration-test-feature/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0185-integration-test-feature/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0185-integration-test-feature/review.md（未作成、/review-ticket 全チェック通過後に作成）
