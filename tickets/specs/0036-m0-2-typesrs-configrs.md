---
ticket_id: 36
title: M0-2: 公開型定義（types.rs + config.rs）
slug: m0-2-typesrs-configrs
status: reviewed
created_at: 2026-06-11
updated_at: 2026-06-11
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0036-m0-2-typesrs-configrs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0036-m0-2-typesrs-configrs/review.md
---
# M0-2: 公開型定義（types.rs + config.rs）

## Summary

voiput crate の公開型をすべて定義する。以下の2ファイルを作成し、test-run.rs の `[CONFIG]` セクションを実装する：

- `src/types.rs` — SttEvent, SttEngine, LocaleCode, OpenAiConfig, VadModelPaths, VadConfig, VadType, PostCorrectionConfig, DenoiserConfig, SignalFilterConfig
- `src/config.rs` — VoiceKitConfig + VoiceKitConfigBuilder（ビルダーパターン、build() バリデーション）
- `src/bin/test-run.rs` — `[CONFIG]` セクションを追加（正常系・異常系の Config 構築デモ）
- `src/error.rs` — インライン定義の SttEngine を削除し `crate::types::SttEngine` に差し替え
- `src/lib.rs` — `mod types; mod config;` のコメントアウト解除＋公開 re-export 追加

## Background

M0-1 では `error.rs` に `SttEngine` を仮置きしていた。本チケットで `types.rs` に正規の型定義を集約し、`error.rs` の仮定義を置き換える。また、`config.rs` に VoiceKitConfig（ビルダーパターン）を実装し、crate 利用者が最初に触れる設定APIを提供する。

test-run.rs も本チケットで初めて意味のあるデモセクション `[CONFIG]` を持つようになる。

**ファイル間依存関係:**
- `types.rs` → どのファイルにも依存しない（独立した型定義のみ）
- `config.rs` → `types.rs` の各種 Config 型 + `error.rs` の VoiceKitError
- `error.rs` → `types.rs` の SttEngine（M0-1 ではインライン定義。本チケットで差し替え）
- `lib.rs` → types / config モジュール宣言＋re-export
- `test-run.rs` → `types.rs` の型＋`config.rs` の VoiceKitConfig

## Scope

### 1. `src/types.rs`

MYCUTE `~/shyme/mycute/src/types.rs`（SttEvent, LocaleCode）と `~/shyme/mycute/src/mycute_settings.rs`（SttEngine, VadType, SttSettings）から必要な定義を統合する。

- **SttEvent**（11 variant）: MYCUTE から完全互換でコピー：
  `PartialResult(String, u64)`, `FinalResult(String, u64)`, `Started`, `Error(String)`, `Stopped`, `Ready`, `PostCorrectionStarted`, `PostCorrectionFinished`, `SttPending`, `SttCompleted`, `ForceClearDecoration`, `DecorationPartial(String)`

- **SttEngine**（2 variant）: `OpenAi`, `Os`（デフォルト: `Os`）。RFC に従い MYCUTE の `OpenAI` を `OpenAi` にリネーム。

- **LocaleCode**（2 variant）: `Ja`（デフォルト）, `En`
  - `as_str()` → `"ja"` / `"en"`
  - `as_bcp47()` → `"ja-JP"` / `"en-US"`
  - `as_iso639_1()` → `"ja"` / `"en"`

- **OpenAiConfig**: `base_url: String`, `api_key: String`, `model: String`

- **VadModelPaths**: `silero: String`, `ten: String`, `gtcrn: String`

- **VadConfig**: `vad_type: VadType`, `threshold: f32`, `min_silence_duration: f32`, `min_speech_duration: f32`, `max_speech_duration: f32`, `pre_padding_ms: u64`, `utterance_min_ms: u64`, `num_threads: i32`（+ Default impl）

- **VadType**: `Silero`（デフォルト）, `Ten`

- **PostCorrectionConfig**: `sentence_count_threshold: usize`, `min_text_length: usize`, `interval_ms: u64`（+ Default impl）

- **DenoiserConfig**: `enabled: bool`（デフォルト true, + Default impl）

- **SignalFilterConfig**: `enabled: bool`, `rms_threshold: f32`, `occupancy_ratio: f32`（+ Default impl）

### 2. `src/config.rs`

- **VoiceKitConfig**: 全フィールド（engine, locale, openai_config, vad, post_correction, punctuation, denoiser, signal_filter, speech_timeout_sec, vad_model_paths）
- **VoiceKitConfigBuilder**: ビルダーパターン。各 setter メソッド + `build()` でバリデーション：
  - `locale` 必須
  - `vad_model_paths` 必須
  - `engine == SttEngine::OpenAi` なら `openai_config` 必須

### 3. `src/bin/test-run.rs` — `[CONFIG]` セクション追加

- `test_config()` 関数を新規追加：
  1. 正常系: Engine=Os, locale=Ja, vad_model_paths 指定で VoiceKitConfig を構築 → 内容表示
  2. 異常系: locale 未指定で build() → エラーメッセージ表示
  3. 異常系: openai_config 未指定で Engine=OpenAi → エラーメッセージ表示
  4. 各種 Config のデフォルト値を表示
- `main()` から `test_config()` を呼び出す
- Stage 表示を `Stage 2/6` に更新

### 4. `src/error.rs` — SttEngine の差し替え

- インライン定義の `pub enum SttEngine` を削除
- `use crate::types::SttEngine;` を追加
- テスト内の `const STT_ENGINE_OS` もあわせて修正

### 5. `src/lib.rs` — モジュール宣言の有効化

- `// mod types;` → `mod types;`（コメントアウト解除）
- `// mod config;` → `mod config;`
- `// pub use types::*;` → `pub use types::*;`
- `// pub use config::{VoiceKitConfig, VoiceKitConfigBuilder};` → `pub use config::{VoiceKitConfig, VoiceKitConfigBuilder};`
- doc-test の例示コードを `rust,ignore` から `rust,no_run` に戻す

## Non-scope

- 内部トレイト定義（AsrBackend, PostCorrectionBackend 等）— M1-1 以降
- パイプラインコンポーネント — M1-1 以降
- test-run.rs の `[CONFIG]` 以外のセクション — 各担当チケット
- constants.rs の修正 — 変更不要

## Investigation

### 証拠1: MYCUTE SttEvent の完全な定義

MYCUTE `~/shyme/mycute/src/types.rs` 11〜36行目:

```rust
pub enum SttEvent {
    PartialResult(String, u64),
    FinalResult(String, u64),
    Started,
    Error(String),
    Stopped,
    ForceClearDecoration,
    Ready,
    PostCorrectionStarted,
    PostCorrectionFinished,
    SttPending,
    SttCompleted,
    DecorationPartial(String),
}
```

全12 variant。PartialResult/FinalResult は String + u64（テキスト＋シーケンス番号）。
voiput でも完全互換で定義する。

### 証拠2: MYCUTE SttEngine と voiput の差分

MYCUTE `~/shyme/mycute/src/mycute_settings.rs` 74〜78行目:

```rust
pub enum SttEngine {
    OpenAI,
    #[default]
    Os,
}
```

RFC §4.4 に従い voiput では `OpenAI` → `OpenAi`（小文字 i）にリネーム。

### 証拠3: MYCUTE LocaleCode のメソッド

```rust
// as_str → "ja" / "en"
// as_bcp47 → "ja-JP" / "en-US"  ← macOS/Windows ネイティブAPI用
// as_iso639_1 → "ja" / "en"     ← OpenAI API用
```

voiput では `as_bcp47()` と `as_iso639_1()` を RFC §4.4 に従って新規追加する（MYCUTE にはなかった）。

### 証拠4: M0-1 での error.rs の仮 SttEngine 定義

M0-1 完了時の `src/error.rs` 12〜20行目:

```rust
pub enum SttEngine {
    OpenAI,
    #[default]
    Os,
}
```

本チケットでこのインライン定義を削除し `use crate::types::SttEngine` に置き換える。
これにより SttEngine の唯一の情報源が types.rs に統一される。

### 証拠5: 各 Config 構造体のデフォルト値

RFC §4.4 に定義されたデフォルト値：
| Config | フィールド | デフォルト値 |
|--------|-----------|-------------|
| VadConfig | threshold | 0.5 |
| | min_silence_duration | 0.2 |
| | min_speech_duration | 0.25 |
| | max_speech_duration | 25.0 |
| | pre_padding_ms | 100 |
| | utterance_min_ms | 300 |
| | num_threads | 4 |
| PostCorrectionConfig | sentence_count_threshold | 3 |
| | min_text_length | 10 |
| | interval_ms | 2000 |
| DenoiserConfig | enabled | true |
| SignalFilterConfig | rms_threshold | 0.005 |
| | occupancy_ratio | 0.15 |
| VoiceKitConfig | punctuation | true |
| | speech_timeout_sec | 30.0 |

### 証拠6: MYCUTE から削除する型

voiput に移植しない MYCUTE の型（Tickets.md に記載）：
- `TargetPlatform` — MYCUTE 固有（macOS/Windows 判別）
- `HotkeyAction` — MYCUTE ホットキー機能
- 上記以外の `types.rs` の型（`SttPayload`, `InternalEvent`, `Ws*` 等）— すべて MYCUTE 固有

## Test Plan

### ユニットテスト計画

#### types.rs（18テスト目標）

1. **SttEngine**: 全 variant の構築確認、Default が Os であること
2. **LocaleCode**: as_str() / as_bcp47() / as_iso639_1() の全 variant の戻り値確認
3. **SttEvent**: 全12 variant の構築確認
4. **OpenAiConfig**: 全フィールドの設定・取得
5. **VadModelPaths**: 全フィールドの設定・取得
6. **VadConfig**: Default 値が RFC の値と一致すること
7. **VadType**: Default が Silero であること
8. **PostCorrectionConfig**: Default 値一致
9. **DenoiserConfig**: Default 値一致
10. **SignalFilterConfig**: Default 値一致

#### config.rs（10テスト目標）

1. **build() 正常系**: Engine=Os, locale=Ja, vad_model_paths あり → Ok
2. **build() 正常系（全カスタム）**: 全フィールド指定 → 全フィールドの値が指定通り
3. **build() 異常系**: locale 未指定 → Err(InvalidConfig)
4. **build() 異常系**: vad_model_paths 未指定 → Err(InvalidConfig)
5. **build() 異常系**: engine=OpenAi で openai_config なし → Err(InvalidConfig)
6. **build() 正常系**: engine=OpenAi で openai_config あり → Ok
7. **Default 値伝播**: vad/post_correction/denoiser/signal_filter 未指定 → それぞれの Default 値が使われる
8. **builder メソッド**: 各 setter が self を返すこと（チェーン可能）

#### error.rs（1テスト修正）

- 既存の test_stt_engine_default は types.rs 側に移動
- error.rs のテストから SttEngine 関連のテストを削除（types.rs でカバー）

#### test-run.rs 確認

- `cargo run --bin test-run` で `[CONFIG]` セクションが表示されること
- 正常系 Config の内容表示
- 異常系 Config のエラー表示

### ユニットテスト不可能な項目（例外）

なし。全テストがメモリ内完結・決定論的。

## Boy Scout Rule — 翻訳可能性計画

- **error.rs の SttEngine 削除**: M0-1 で仮置きしたインライン定義を削除し、types.rs の正規定義に統合する
- **Config 構造体のフィールド名**: MYCUTE の SttSettings フィールド名をそのまま踏襲（2点間の差分を最小化）
- **例外**: `SttEngine::OpenAI` → `SttEngine::OpenAi`（RFC 指示のため）
- **コメント**: 「なぜこの値か」を各 Config 構造体のフィールドに日本語コメントで記載
- **ビルダーパターン**: 各 setter メソッドは動詞句（`.engine()`, `.locale()` 等）

## Acceptance Criteria

- [ ] `cargo test` が全件 PASS（既存13 + 新規28 = 41テスト程度）
- [ ] `cargo run --bin test-run` で `[CONFIG]` セクションが正常系・異常系のデモを表示すること
- [ ] `pub use types::*`, `pub use config::*` が lib.rs から正しく re-export されていること（コンパイル時検証）
- [ ] error.rs にインライン SttEngine が残っていないこと（grep確認）
- [ ] doc-test の例示コードが `rust,no_run` でコンパイル可能であること
- [ ] 翻訳可能性の検証が通っていること（1文字変数・マジックナンバー・汎用名なし）

## Notes

- このチケット完了後、test-run.rs は `Stage 2/6` を表示し、`[CONFIG]` セクションを実行する
- types.rs の完了により、M1-1 以降の全パイプラインコンポーネントが types をインポート可能になる
- error.rs の SttEngine インライン定義削除は忘れやすいので注意

### 成果物

- 計画: context/0036-m0-2-typesrs-configrs/plan.md（未作成）
- 実装サマリ: context/0036-m0-2-typesrs-configrs/implementation.md（未作成）
- レビュー報告書: context/0036-m0-2-typesrs-configrs/review.md（未作成）
