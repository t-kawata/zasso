---
id: 59
title: 統合テスト
status: reviewed
ticket_ref: M6-2
created_at: "2026-06-12"
updated_at: 2026-06-12
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0059-untitled-3/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0059-untitled-3/review.md
---

## 背景 (Background)

### 現状

voiput crate には **121 のユニットテスト**（各モジュール内の `#[cfg(test)] mod tests`）が存在するが、**統合テスト（`tests/` ディレクトリ）が存在しない**。統合テストは crate を外部クレートとして利用した場合の公開APIの動作検証を行い、以下の観点でユニットテストを補完する：

- 公開API（`pub use`）の全リエクスポートが正しく機能すること
- `VoiputConfig` のビルダーパターンがドキュメント通りに使用可能であること
- `Voiput::new()` の構築とライフサイクルが期待通り動作すること
- `VoiputError` の種類とメッセージが利用者にとって意味があること
- Cargo.toml の dev-dependencies が不足していないこと

### 調査結果 (Investigation)

#### 現在のテスト構成

| 項目 | 値 |
|------|-----|
| ユニットテスト数 | 121（全 `#[test]`） |
| 統合テスト（`tests/`） | 未作成 |
| dev-dependencies | `tempfile = "3.27.0"` |
| テスト実行 | `cargo test --package voiput` で107テスト通過 |

#### 公開API一覧（lib.rs）

```rust
pub use config::{VoiputConfig, VoiputConfigBuilder};
pub use error::VoiputError;
pub use types::*;  // SttEvent, SttEngine, LocaleCode, OpenAiConfig, VadModelPaths, etc.
pub use voiput::Voiput;
pub use audio::{init, play_commit_sound, play_ready_sound};
pub use recognizer::SpeechRecognizer;
pub use lindera_util::get_tokenizer;
pub use pipeline::...  // 内部パイプライン（test-run.rs 用）
pub use backends::openai::{OpenAIBackend, OpenAIRecognizer};
// cfg gated:
pub use backends::mac::MacSpeechBackend;   // #[cfg(target_os = "macos")]
pub use backends::win::WinSpeechBackend;   // #[cfg(target_os = "windows")]
```

### Acceptance Criteria

1. `tests/integration_test.rs` が存在し、以下のテストを含むこと:
   - `test_config_build_minimal` — 最小構成で VoiputConfig 構築
   - `test_config_build_with_openai` — OpenAI 設定付きで構築
   - `test_config_rejects_missing_locale` — locale 未指定でエラー
   - `test_config_rejects_missing_vad_paths` — vad_model_paths 未指定でエラー
   - `test_config_rejects_openai_without_key` — OpenAI エンジンで config なしでエラー
   - `test_voiput_new_minimal` — Voiput::new() 正常構築
   - `test_voiput_start_stop` — start/stop ライフサイクル
   - `test_voiput_set_engine` — エンジン切り替え
   - `test_voiput_engine_getter` — engine() ゲッター
   - `test_voiput_health_check` — health_check() 呼び出し
   - `test_stt_event_variants` — SttEvent の全 variant 構築
   - `test_locale_code_methods` — LocaleCode の全メソッド（as_str, as_bcp47, as_iso639_1）
   - `test_stt_engine_default` — SttEngine のデフォルト値
   - `test_voiput_error_display` — VoiputError の Display 実装
2. `cargo test --test integration_test` が全テスト通過すること
3. 既存の `cargo test`（統合テスト込み）が全テスト通過すること
4. 各テストが `use voiput::*;` のみで完結すること（crate 内部に依存しない）

## スコープ (Scope)

### 実装範囲（やること）

- **`tests/integration_test.rs`** 新規作成（上述の14テスト）

### 実装範囲外（やらないこと）

- 既存ユニットテストの修正・削除
- test-run.rs の変更
- Cargo.toml の dev-dependencies 追加（現状の `tempfile` で十分）
- M6-3: README

## 設計 (Design)

### tests/integration_test.rs の構造

```rust
use voiput::*;

// ========================================================================
// VoiputConfig 構築テスト
// ========================================================================

#[test]
fn test_config_build_minimal() {
    let config = VoiputConfig::builder()
        .engine(SttEngine::Os)
        .locale(LocaleCode::Ja)
        .vad_model_paths(VadModelPaths { ... })
        .build()
        .unwrap();
    assert_eq!(config.engine, SttEngine::Os);
    assert_eq!(config.locale, LocaleCode::Ja);
}

#[test]
fn test_config_build_with_openai() {
    let config = VoiputConfig::builder()
        .engine(SttEngine::OpenAI)
        .locale(LocaleCode::En)
        .openai_config(OpenAiConfig { ... })
        .vad_model_paths(VadModelPaths { ... })
        .build()
        .unwrap();
    assert!(config.openai_config.is_some());
}

// ... (バリデーションエラーテスト)

// ========================================================================
// Voiput ライフサイクルテスト
// ========================================================================

#[test]
fn test_voiput_new_minimal() {
    let voiput = Voiput::new(minimal_config());
    assert!(voiput.is_ok());
}

// ... (start/stop/set_engine テスト)

// ========================================================================
// 型テスト
// ========================================================================

#[test]
fn test_stt_event_variants() {
    let _ = SttEvent::Started;
    let _ = SttEvent::FinalResult("text".into(), 1);
    // ... 全variant
}

// ... (LocaleCode, SttEngine, VoiputError テスト)
```

### ヘルパー関数

```rust
fn minimal_paths() -> VadModelPaths {
    VadModelPaths {
        silero: "/tmp/silero_vad.onnx".into(),
        ten: "/tmp/ten_vad.onnx".into(),
        gtcrn: String::new(),
    }
}
```

## テスト計画 (Test Plan)

### ユニットテスト計画（統合テスト自体がテスト）

統合テストは crate を外部から利用する視点で検証するため、モックは使用しない。
各テストは独立して実行可能で、`use voiput::*;` のみで完結する。

| # | テスト名 | 種別 | 検証内容 |
|---|---------|------|---------|
| 1 | `test_config_build_minimal` | 正常系 | Os+Ja+vad_model_paths で build() 成功 |
| 2 | `test_config_build_with_openai` | 正常系 | OpenAI 設定付きで build() 成功 |
| 3 | `test_config_rejects_missing_locale` | 異常系 | locale なしで InvalidConfig |
| 4 | `test_config_rejects_missing_vad_paths` | 異常系 | vad_model_paths なしで InvalidConfig |
| 5 | `test_config_rejects_openai_without_config` | 異常系 | OpenAI エンジンで openai_config なし → Err |
| 6 | `test_voiput_new_minimal` | 正常系 | Voiput::new() 正常構築 |
| 7 | `test_voiput_start_stop` | 正常系 | start/stop ライフサイクル |
| 8 | `test_voiput_set_engine` | 正常系 | set_engine 切替 |
| 9 | `test_voiput_engine_getter` | 正常系 | engine() の一貫性 |
| 10 | `test_voiput_health_check` | 正常系 | health_check() == 0 |
| 11 | `test_stt_event_variants` | 正常系 | 全 variant 構築可能 |
| 12 | `test_locale_code_methods` | 正常系 | as_str/as_bcp47/as_iso639_1 |
| 13 | `test_stt_engine_default` | 正常系 | Default が Os |
| 14 | `test_voiput_error_display` | 正常系 | Display 実装がエラーメッセージを含む |

### ユニットテスト不可能な項目（例外）

統合テスト自体が crate 外部からのテストであるため、モックや内部状態へのアクセスは不要。
非同期メソッド（`next_event()`, `flush()`）は统合テストではテストせず、test-run.rs のデモで確認する。

## 実装手順

### Step 1: `tests/integration_test.rs` を作成

### Step 2: テスト実行確認

```bash
cargo test --manifest-path crates/voiput/Cargo.toml
```

全テスト通過（既存107 + 新規14 = 121テスト）を確認。

## 物理的レビュー方法

1. `test -f crates/voiput/tests/integration_test.rs` — ファイル存在
2. `cargo test --package voiput` 全通過（既存107 + 新規14 = 121）
3. `grep '^use voiput' tests/integration_test.rs | head -1` → `use voiput::*;` のみ

## リスク

| リスク | 確率 | 影響 | 対策 |
|-------|------|------|------|
| テストが lib.rs の内部モジュールに依存 | 低 | 中 | `use voiput::*;` のみで書くことを徹底。コンパイル時に検出可能 |
| macOS cfg の影響 | 低 | 低 | MacSpeechBackend は cfg ガード対象なので統合テストではテストしない |

## Boy Scout Rule — 翻訳可能性計画

新規ファイルのため、関数名はすべて snake_case で動詞句（test_config_build_minimal 等）。
コメントは「なぜ」を日本語で記述（「何を」はテスト関数名が語る）。
