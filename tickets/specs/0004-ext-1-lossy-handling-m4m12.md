---
ticket_id: 4
title: "EXT-1: Lossy handling 完全対応（M#4/m#12）"
slug: ext-1-lossy-handling-m4m12
status: implementing
created_at: 2026-06-22
updated_at: 2026-06-22
plan_path: /Users/shyme01/shyme/zasso/tickets/context/0004-ext-1-lossy-handling-m4m12/plan.md
implementation_path: /Users/shyme01/shyme/zasso/tickets/context/0004-ext-1-lossy-handling-m4m12/implementation.md
review_report_path: /Users/shyme01/shyme/zasso/tickets/context/0004-ext-1-lossy-handling-m4m12/review.md
---

# EXT-1: Lossy handling 完全対応（M#4/m#12）

## Summary

`allow_lossy=true + error_lossy_continue=true` 時に Error 級 lossy が発生してもリクエストを続行し、損失フィールドを metrics + tracing に記録できるようにする。この課題は llm-bridge-core 側に lossy-tolerant 変換 API（`anthropic_to_openai_lossy` / `TransformResult` / `LossyField`）が存在しないために未達であり、本チケットはその API が利用可能になった時点で anthropx 側の実装を完了する。

## Background

RFC02 §4 Lossy Handling 契約達成（M#4/m#12）の完全実装。

**現状の動作（RFC02 §4.1 の真理値表）:**

| allow_lossy | error_lossy_continue | LossyLevel | 現状の動作 | 正しい動作 |
|-------------|---------------------|------------|-----------|-----------|
| false       | false               | Error      | 400 拒否 ✅ | 400 拒否 |
| false       | false               | Warn       | 続行 ✅ | 続行 |
| true        | false               | Error      | 400 拒否 ✅ | 400 拒否 |
| true        | true                | Error      | Err 返却 ❌ | 続行+metrics |

`allow_lossy=true + error_lossy_continue=true` の場合のみ契約未達。原因は `llm_bridge_core::transform::anthropic_to_openai()` が `TransformError::LossyDowngrade` を返すだけで、部分的な変換結果（損失フィールドを除いた body）を返せない API 設計にある。

**依存関係:** llm-bridge-core 側に以下が追加されることが本チケットの前提条件：
- `TransformResult<T>` struct（data: T, lossy_fields: Vec<LossyField>）
- `LossyField` struct（name: String, level: LossyLevel, detail: String）
- `anthropic_to_openai_lossy(TransformRequest) -> Result<TransformResult<TransformResponse>, TransformError>`

## Scope

### llm-bridge-core 側（別 crate）— 外部依存

1. `TransformResult<T>` struct の追加（data: T, lossy_fields: Vec<LossyField>）
2. `LossyField` struct の追加（name: String, level: LossyLevel, detail: String）
3. `anthropic_to_openai_lossy(TransformRequest) -> Result<TransformResult<TransformResponse>, TransformError>` の追加
4. stream 変換 API（`transform_stream_events`）の lossy-tolerant 版の追加（各チャンク変換で lossy_fields を収集できるインターフェース）

### anthropx 側 — 本チケットの実装範囲

1. `src/provider/translate.rs` の lossy 処理全面改修:
   - non-stream path: `anthropic_to_openai_lossy()` を呼び出し、lossy_fields があれば続行 + metrics/tracing/span 記録
   - stream path: 各チャンクの変換結果に lossy_fields が含まれる場合、続行 + metrics/tracing/span 記録
2. `record_lossy(level)` を lossy 検出箇所で呼び出し（カウンタ枠組みは M7-1 で準備済み: `anthropx_lossy_total` / level ラベル）
3. lossy 発生時に `Span::current().record("lossy_applied", true)` を実行
4. `src/config/mod.rs` の `allow_lossy` / `error_lossy_continue` フィールドドキュメントから制約文言があれば削除
5. Tracing: 損失フィールド情報を `tracing::warn!` に個別出力（フィールド名・レベル・詳細）

## Non-scope

- `ConcurrencyLimiter` の変更 — 本チケットの対象外
- KeyScheduler の変更 — 本チケットの対象外
- `ProxyError` の variant 追加 — 既存の `TransformLossy` を流用
- `LossyLevel` enum の修正 — 現状維持、将来の拡張に備える
- metrics crate 以外の可観測性基盤の変更 — 本チケットの対象外

## Investigation

### 証拠 1: translate.rs の現在の lossy 処理（non-stream path）

`crates/anthropx/src/provider/translate.rs` L184-205:

```rust
let openai_req = match openai_req {
    Ok(resp) => resp,
    Err(TransformError::LossyDowngrade(msg))
        if LossyLevel::Error.should_reject(allow_lossy, error_lossy_continue) =>
    {
        metrics::record_lossy("Error");
        return Err(ProxyError::TransformLossy(msg));
    }
    Err(TransformError::LossyDowngrade(msg)) => {
        // allow_lossy が有効な場合、warning ログを出力して続行するが、
        // llm-bridge-core は変換不能データを含む body を返せないため、
        // このエラーは upstream エラーとして報告する
        metrics::record_lossy("Warn");
        warn!(
            "lossy downgrade suppressed by allow_lossy ({allow_lossy}, {error_lossy_continue}): {msg}"
        );
        return Err(ProxyError::TransformLossy(format!(
            "{msg} (allow_lossy={allow_lossy}, error_lossy_continue={error_lossy_continue})"
        )));
    }
    Err(e) => return Err(ProxyError::from(e)),
};
```

**問題点:** 2番目の match arm で `allow_lossy=true` 状態でも `Err(ProxyError::TransformLossy(...))` を返しており、続行できない。コメントにも `llm-bridge-core は変換不能データを含む body を返せない` と明記されている。

### 証拠 2: translate.rs の現在の lossy 処理（stream path）

`crates/anthropx/src/provider/translate.rs` L376-393:

non-stream path と同一の match 構造であり、同じ制約を持つ。stream path では各チャンク単位の `transform_chunk()`（L312-326）が llm-bridge-core の `transform_stream_events()` を呼び出しており、こちらも lossy-tolerant 版が必要。

### 証拠 3: metrics.rs の record_lossy 関数

`crates/anthropx/src/observability/metrics.rs` L107-109:

```rust
pub fn record_lossy(level: &str) {
    counter!("anthropx_lossy_total", "level" => level.to_owned()).increment(1);
}
```

**確認:** record_lossy の枠組みは既に実装済み。カウンタ `anthropx_lossy_total` は `register_metrics()` で登録済み（L59-62）。テストも存在（L269-306）。anthropx 側の改修は「呼び出し箇所の追加」のみ。

### 証拠 4: llm-bridge-core 0.2.6 の現状

現在の crate バージョン 0.2.6 では:
- `TransformResult<T>`, `LossyField` — 未存在
- `anthropic_to_openai_lossy()` — 未存在
- `anthropic_to_openai(req: &TransformRequest) -> Result<TransformResponse, TransformError>` — これのみ。LossyDowngrade 時は Err を返す
- `transform_stream_events()` — stream 変換。チャンク単位の逐次変換に対応済みだが lossy-tolerant 版は未実装

### 証拠 5: 現在の stubs

以下の 3 つの stubs が存在するが、いずれも lossy handling とは無関係:
- `src/http/routes.rs:237` — テストヘルパーの引数型
- `src/http/routes.rs:277` — 同上
- `src/routing/mod.rs:26` — ApiFormat 中間型（`[::STUB::] M5-2 で llm_bridge_core::model::ApiFormat に完全置き換え予定`）

### 証拠 6: config/mod.rs の allow_lossy ドキュメント

`crates/anthropx/src/config/mod.rs` L155-162:

```rust
/// 非 Anthropic→Anthropic 変換で情報落ち（lossy）を許容するか。
/// `true` で変換不能フィールドを警告のみで通過させる。
#[serde(default)]
pub allow_lossy: bool,
/// Error 級の lossy が発生した場合に処理を継続するか。
/// `false`（デフォルト）では Error 級 lossy 発生時にリクエストを拒否する。
#[serde(default)]
pub error_lossy_continue: bool,
```

**確認:** RFC02 §4.4 で言及されていた「現状の制約」コメントは現時点では追加されていない（または既に削除されている）。本チケット実装時には制約が解消されるため、新たな制約コメント追加は不要。

## Test Plan

### ユニットテスト計画

**方針:** ユニットテストでカバーできる範囲は全てユニットテストで検証する。llm-bridge-core 側の API 追加が前提であるため、anthropx 側のテストは `anthropic_to_openai_lossy()` が所定のインターフェースを提供していることを前提とした結合テストとなる。

#### anthropx 側ユニットテスト（translate.rs）

1. **non-stream path 正常系:**
   - `anthropic_to_openai_lossy()` が `TransformResult { data: ok, lossy_fields: [] }` を返す → 従来通り upstream に送信、lossy metrics は増加しない
   - `anthropic_to_openai_lossy()` が `TransformResult { data: ok, lossy_fields: [field1, field2] }` を返す → 続行、`record_lossy` 各 field の level で呼ばれる、`Span::current().record("lossy_applied", true)` が呼ばれる、`tracing::warn!` に各フィールド情報が出力される

2. **non-stream path 異常系:**
   - `anthropic_to_openai_lossy()` が `TransformError::InvalidFormat` を返す → 従来通り `ProxyError::Internal` にマッピング
   - `allow_lossy=false, error_lossy_continue=false` かつ Error 級 lossy → 従来通り 400 拒否（既存動作維持）

3. **non-stream path 境界値:**
   - `lossy_fields` が空配列の場合 → metrics 増加なし、`Span` 記録なし
   - `lossy_fields` が 100 件の場合 → 全フィールドが metrics + tracing に記録される

4. **stream path 正常系:**
   - 各チャンク変換時に lossy_fields が空 → 従来通り即時送信
   - 各チャンク変換時に lossy_fields が含まれる → 続行 + metrics + tracing + span 記録

5. **record_lossy 連携:**
   - `record_lossy("Error")` → `anthropx_lossy_total{level="Error"}` が increment（既存テストで確認済み）
   - `record_lossy("Warn")` → `anthropx_lossy_total{level="Warn"}` が increment（既存テストで確認済み）

#### llm-bridge-core 側（別 crate）のテスト（参考情報）
- `anthropic_to_openai_lossy()` が通常変換と同一結果を返すこと（lossy なし時）
- `TransformResult::lossy_fields` に損失フィールドが正しく格納されること
- `LossyField` の name / level / detail が正しく設定されること

### ユニットテスト不可能な項目（例外）

1. **前提条件のテスト:** `anthropic_to_openai_lossy()` / `TransformResult` / `LossyField` の実装は llm-bridge-core 側（別 crate）であり、本チケットのスコープ外。anthropx 側のテストはこれらが所定のインターフェースで提供されていることを前提とする。
2. **E2E 結合テスト:** `allow_lossy=true + error_lossy_continue=true` で実際のプロトコル変換を行い、lossy が発生する実データでの挙動確認は手動テストまたは integration-test feature による実結合テストで検証する。

## Boy Scout Rule — 翻訳可能性計画

### translate.rs の改善対象

1. **関数 `handle_lossy_translation` への抽出:**
   現在の non-stream / stream 両方に重複する lossy ハンドリング（match の LossyDowngrade arm）を `handle_lossy_translation()` 関数として抽出し、関数名で「lossy 発生時に翻訳を処理する」という意図を語らせる。

2. **変数名の明確化:**
   - `openai_req` → `translation_result` (lossy-tolerant API 導入後は TransformResult を保持する)
   - `upstream_body` → `transformed_body`（変換後の body であることが関数名から理解できる）

3. **ハードコード値の定数化:**
   - `"content-type"` ヘッダー名文字列 → `CONTENT_TYPE_JSON` など名前付き定数
   - `64`（channel size） → `STREAM_CHANNEL_SIZE`（既に定数化済み ✅）

4. **コメントの「なぜ」への純化:**
   現在の「変換と送信で役割が異なるため」等のコメントは維持。「何を」は関数名が語る方向に改善。

5. **`record_lossy` 呼び出しの統合:**
   lossy 検出時の `record_lossy` + `tracing::warn!` + `Span::current().record` の3操作を `fn record_lossy_event(level: &str, field_name: &str, detail: &str)` として統合し、呼び出し元の翻訳可能性を高める。

## Acceptance Criteria

- [ ] llm-bridge-core 側の lossy-tolerant API（`TransformResult` / `LossyField` / `anthropic_to_openai_lossy`）が利用可能であること（前提条件）
- [ ] `allow_lossy=true + error_lossy_continue=true` 時に Error 級 lossy が発生しても続行し、metrics + tracing + span に記録されること
- [ ] `allow_lossy=false` 時に Error 級 lossy が発生 → 400 Bad Request（既存動作が維持されていること）
- [ ] `record_lossy(level)` が lossy フィールドごとに level ラベル付きで呼ばれ、`anthropx_lossy_total` が増加すること
- [ ] 損失フィールド情報が `tracing::warn!` に個別出力されること
- [ ] `Span::current().record("lossy_applied", true)` が lossy 発生時に実行されること
- [ ] 既存テストがすべて通過すること
- [ ] `cargo build --no-default-features` が通ること（library モード維持）

## Notes

### 依存関係

- **外部依存:** llm-bridge-core に以下の API が追加されること:
  - `TransformResult<T>` struct
  - `LossyField` struct
  - `anthropic_to_openai_lossy()` / stream 版 lossy-tolerant 変換
- **内部依存:** M7-1（metrics crate）で `record_lossy` / `anthropx_lossy_total` の枠組みは準備済み
- **関連チケット:** なし（別トラックとして独立）

### Criminal Check

2026-06-22 時点で未解決の犯罪（`[::STUB::]` 未付与の不完全実装）は存在しない。

### 既存 stubs（本チケットのスコープ外）

- `src/http/routes.rs:237` — テストヘルパー引数型、本チケットと無関係
- `src/http/routes.rs:277` — 同上
- `src/routing/mod.rs:26` — ApiFormat 中間型、本チケットと無関係

### 成果物

- 計画: context/0004-ext-1-lossy-handling-m4m12/plan.md（未作成、`/plan-ticket` 承認後に作成）
- 実装サマリ: context/0004-ext-1-lossy-handling-m4m12/implementation.md（未作成、`/start-ticket` 実装完了後に作成）
- レビュー報告書: context/0004-ext-1-lossy-handling-m4m12/review.md（未作成、`/review-ticket` 全チェック通過後に作成）
