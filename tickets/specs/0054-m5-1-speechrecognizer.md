---
ticket_id: 54
title: M5-1: SpeechRecognizer
slug: m5-1-speechrecognizer
status: reviewed
created_at: 2026-06-12
updated_at: 2026-06-12
plan_path: /Users/kawata/shyme/zasso/tickets/context/0054-m5-1-speechrecognizer/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0054-m5-1-speechrecognizer/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0054-m5-1-speechrecognizer/review.md
---
# M5-1: SpeechRecognizer

## Summary

MYCUTE の `SpeechRecognizer`（`src/stt/recognizer.rs` 501行）を voiput `recognizer.rs` に拡張する。
現在の `recognizer.rs` は M1-4 で `apply_replaces()` 関数のみ。本チケットで `SpeechRecognizer` 構造体と
全ライフサイクルメソッド（new/start/stop/set_locale/set_engine/update_config/cleanup/tick/Drop）、
およびインターセプタータスクを追加する。`LmgwClient` 依存を排除し `OpenAiConfig` ベースに置き換える。

## Background

M4 までのチケットで3バックエンド（OpenAI / macOS / Windows）が個別に実装された。
M5-1 はこれらを統括する認識器として、以下の責務を持つ：
- 全バックエンドの一元管理（即時エンジン切り替え対応のため常に全バックエンドを初期化）
- インターセプタータスクによる置換辞書適用（std::thread + blocking_recv）
- PostCorrection バックエンドの構築（OpenAIBackend → BackendWrapper）

## Scope

### 1. `recognizer.rs` — SpeechRecognizer 構造体 + メソッド群を追加

**現在の状態（M1-4）:**
- `apply_replaces()` 関数のみ（101行）
- テスト6件（空マップ、単一置換、複数置換、最長一致、空のbefore、決定論性）

**追加する要素（MYCUTE ~/shyme/mycute/src/stt/recognizer.rs 501行から移植）:**

| 要素 | MYCUTE | voiput |
|------|--------|--------|
| `SpeechRecognizer` struct | 12フィールド | 同構造。`lmgw_client` 関連フィールドは削除 |
| `new()` | LmgwClient を引数に取る | `OpenAiConfig` を受け取り `OpenAIBackend` を直接構築 |
| `start()` | engine分岐で3バックエンド | 同構造。cfg 条件付き |
| `stop()` | 全バックエンド停止 | 同構造 |
| `set_locale()` | 全バックエンドへ伝播 | 同構造 |
| `set_engine()` | engineフィールド更新のみ | 同構造 |
| `update_config()` | stop → engine切替 → start（PostCorrection更新含む） | 同構造。`LmgwClient` 経由のPostCorrection更新 → `OpenAiConfig` から直接 `OpenAIBackend` 生成 |
| `cleanup()` | macOS backend.cleanup() | 同構造 |
| `tick()` | engine分岐 | 同構造 |
| `Drop` | stop + cleanup | 同構造 |
| インターセプタータスク | std::thread + blocking_recv | 同構造。`apply_replaces` 使用（既存関数） |

**PostCorrection バックエンド構築の変更（最大の変更点）:**
```
// MYCUTE:
let oa_backend = OpenAIBackend::new(&settings, lmgw_client, shared_locale)?;
let wrapper = BackendWrapper(Arc::new(Mutex::new(oa_backend)));

// voiput:
let oa_backend = OpenAIBackend::new(&openai_config, shared_locale);
let wrapper = BackendWrapper(Arc::new(Mutex::new(oa_backend)));
```

### 2. `lib.rs` — re-export（`SpeechRecognizer` を追加公開）

```rust
pub use recognizer::SpeechRecognizer;
```

## Non-scope

- Voiput 公開API — M5-2
- test-run.rs [VOICEKIT] — M5-2
- 各バックエンドの個別修正 — M4-2/M4-3/M4-4（完了）

## Investigation

### 証拠1: 移植元ファイルサイズと構造

`~/shyme/mycute/src/stt/recognizer.rs` = **501行**。
内訳:
- インターセプタータスク（std::thread spawn + blocking_recv loop）（86〜108行、23行）
- SpeechRecognizer struct（24〜46行、23行）
- `new()`（65〜237行、173行）← 最大ブロック。バックエンド3種の初期化 + PostCorrection設定
- `start()`（240〜290行、51行）
- `stop()`（293〜321行、29行）
- `set_locale()`（324〜343行、20行）
- `set_engine()`（345〜347行、3行）
- `update_config()`（350〜419行、70行）← PostCorrection更新ロジックを含む
- `cleanup()`（421〜426行、6行）
- `tick()`（428〜458行、31行）
- `Drop`（461〜465行、5行）
- `apply_replaces_from_map()`（473〜501行、29行）→ M1-4 で既に移植済み（`apply_replaces`）

### 証拠2: `new()` の引数の違い

```
// MYCUTE:
pub fn new(
    tx: mpsc::Sender<SttEvent>,
    engine: SttEngine,
    locale: LocaleCode,
    stt_settings: Option<SttSettings>,
    lmgw_client: Arc<LmgwClient>,          // ← 削除
    replaces_map: Arc<RwLock<IndexMap<...>>>,
) -> Result<Self, String>

// voiput（計画）:
pub fn new(
    tx: mpsc::Sender<SttEvent>,
    engine: SttEngine,
    locale: LocaleCode,
    openai_config: Option<OpenAiConfig>,    // ← LmgwClient の代わり
    vad_config: Option<VadConfig>,
    replaces_map: Arc<RwLock<IndexMap<...>>>,
) -> Result<Self, String>
```

### 証拠3: OpenAIRecognizer の voiput 版

`voiput::OpenAIRecognizer::new(tx, config, shared_locale)` は以下のシグネチャ:
```rust
pub fn new(
    tx: mpsc::Sender<SttEvent>,
    _config: &VoiputConfig,
    shared_locale: Arc<Mutex<LocaleCode>>,
) -> Self
```

MYCUTE の `OpenAIRecognizer::new(tx, settings, shared_locale, lmgw_client)` とは異なり、
`VoiputConfig` を受け取り、`LmgwClient` は不要。

### 証拠4: OpenAIBackend の voiput 版

`OpenAIBackend::new(openai_config, shared_locale)`:
```rust
pub fn new(openai_config: &OpenAiConfig, shared_locale: Arc<Mutex<LocaleCode>>) -> Self
```

### 証拠5: インターセプタータスク

std::thread で起動され、`rx_internal.blocking_recv()` でイベントを受信。
FinalResult/PartialResult のテキストに `apply_replaces()` を適用し、本来の tx に転送。
制御イベント（Started/Stopped/Ready/Error 等）は素通り。
`apply_replaces()` は M1-4 で既に `recognizer.rs` に存在。

### 証拠6: update_config の PostCorrection 更新

MYCUTE では `self.openai_backend.as_ref().map(|b| b.lmgw_client())` で LmgwClient を取得し、
`OpenAIBackend::new(&settings, lmgw, shared_locale)` で PostCorrection 用バックエンドを再構築している。
voiput では `OpenAiConfig` から直接構築する:

```rust
// voiput 版 PostCorrection 更新:
if let Some(oa_config) = self.openai_config.as_ref() {
    let oa_backend = OpenAIBackend::new(oa_config, self.shared_locale.clone());
    let wrapper: Arc<dyn PostCorrectionBackend> =
        Arc::new(BackendWrapper(Arc::new(std::sync::Mutex::new(oa_backend))));
    backend.update_pc_config(Some(wrapper), Some(PostCorrectionConfig::default()));
} else {
    backend.update_pc_config(None, None);
}
```

## Test Plan

### ユニットテスト計画

- `recognizer.rs` 内の `#[cfg(test)] mod tests`:

| テスト | 内容 |
|-------|------|
| `test_validate_config_openai` | OpenAI エンジンは常に Ok |
| `test_validate_config_os` | Os エンジンも常に Ok（cfg ガード） |
| `test_interceptor_passthrough_control_events` | Started/Stopped はインターセプターを素通り |
| `test_interceptor_applies_replaces` | FinalResult のテキストに置換が適用される |
| `test_interceptor_empty_replaces` | 置換辞書なしではそのままパススルー |

### ユニットテスト不可能な項目

- **FFI 呼び出しを含む new()/start()/stop()**: 実際のライブラリが必要
- **バックエンドの完全結合テスト**: 各バックエンドの初期化にネイティブライブラリまたは API キーが必要
- **インターセプタータスクの完全テスト**: std::thread + blocking_recv の結合。ただしイベント変換ロジックは分離テスト可能

## Boy Scout Rule — 翻訳可能性計画

- MYCUTE の `update_config()` は70行と大きい。macOS/Windows の PostCorrection 更新部分をヘルパー関数に抽出
- MYCUTE の `start()` 内の engine 分岐（3重 cfg）はコメントで意図を明確化
- `lmgw_client()` メソッド参照を削除（voiput の OpenAIRecognizer にそのようなメソッドは存在しない）

## Acceptance Criteria

- [ ] SpeechRecognizer の new/start/stop/set_locale/set_engine/update_config/cleanup/tick/Drop が実装されていること
- [ ] インターセプタータスクが正しくイベントを中継すること（ユニットテストで検証）
- [ ] `LmgwClient` 依存が完全に排除されていること
- [ ] 既存全テストが通過すること

## Notes

- M1-4 で作成済みの `recognizer.rs` に `SpeechRecognizer` を追記する（`apply_replaces` はそのまま維持）
- `BackendWrapper` は `crate::pipeline::streamer::BackendWrapper`（M3-1 で実装済み）
- `SttEvent` の全 variant は `crate::types::SttEvent`（M0-2 で定義済み）
- `VoiputConfig` の `openai_config` フィールドから `OpenAiConfig` を取得

### 成果物

- 計画: context/0054-m5-1-speechrecognizer/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0054-m5-1-speechrecognizer/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0054-m5-1-speechrecognizer/review.md（未作成、/review-ticket 全チェック通過後に作成）
