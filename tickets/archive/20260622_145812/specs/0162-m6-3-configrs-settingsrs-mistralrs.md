---
ticket_id: 162
title: M6-3: config.rs + settings.rs 修正 — mistralrs 特化フィールド除去
slug: m6-3-configrs-settingsrs-mistralrs
status: reviewed
created_at: 2026-06-19
updated_at: 2026-06-19
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0162-m6-3-configrs-settingsrs-mistralrs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0162-m6-3-configrs-settingsrs-mistralrs/review.md
---
# M6-3: config.rs + settings.rs 修正 — mistralrs 特化フィールド除去

## Summary

`config.rs` から mistralrs 特化の3要素（`GpuProvider::DirectML`、`GpuProvider::mistralrs_feature()`、`ModelConfig::chat_template`）を除去し、llama-cpp-2 対応の `feature_name()` + `cmake_flags()` に置き換える。`settings.rs` の `DEFAULT_CONTEXT_SIZE` を 32768 → 2048 に変更する。

## Background

llama-cpp-2 移行に伴い、以下の mistralrs 特化フィールドが不要になる：
- **DirectML**: llama-cpp-2 が DirectML をサポートしないため削除
- **mistralrs_feature()**: llama-cpp-2 では cargo feature 名と cmake フラグが分離するため、`feature_name()` + `cmake_flags()` に置き換え
- **chat_template**: GGUF ファイルが template 情報を自己内包するため、ModelConfig のフィールドとして持つ必要がない
- **DEFAULT_CONTEXT_SIZE**: Qwen3.5 最大値 32768 → 実用デフォルト 2048

## Scope

**config.rs 変更点:**
- `GpuProvider::DirectML` バリアント削除（4バリアント構成に）
- `GpuProvider::from_str("directml")` 削除 → `None`（未知の値として扱われる）
- `GpuProvider::detect()` Windows デフォルト: `DirectML` → `Cpu`
- `GpuProvider::mistralrs_feature()` → `feature_name()` + `cmake_flags()` に置き換え
- `ModelConfig` から `chat_template: Option<String>` フィールド削除
- 全 ModelConfig コンストラクタ（qwen3_5_0_8b, qwen3_5_2b, gemma4_e2b, gemma4_e4b, custom）から `chat_template: None` 削除
- 全テストの DirectML/chat_template/mistralrs_feature 関連参照を更新

**settings.rs 変更点:**
- `DEFAULT_CONTEXT_SIZE: u32 = 32768` → `2048`
- 該当箇所の doc コメントを更新
- `DEFAULT_MAX_TOKENS (256)` が新しい `DEFAULT_CONTEXT_SIZE (2048)` 以下であることは自動的に成立

## Non-scope

- `ModelConfig` の `model_path` フィールドやコンストラクタのパス値は M6-11（build.rs + 4モデルDL）で更新する
- `GpuProvider` の doc コメント内の mistralrs 言及（例：`Metal` バリアントの `"mistralrs の metal feature と対応する"`）は M6-14（ドキュメント整理）で一括対応する
- `GpuConfig` / `ServerConfig` / `GgufConfig` / `ConfigLayer` の構造は変更なし

## Investigation

**物理的証拠（config.rs 行番号）**:

| 変更対象 | 行 | 現状 | 変更後 |
|---------|-----|------|--------|
| DirectML バリアント | 36-40 | `DirectML,` | 削除 |
| from_str directml | 91 | `"directml" => Some(Self::DirectML),` | 削除 |
| detect Windows | 73-76 | `Self::DirectML` | `Self::Cpu` |
| mistralrs_feature() | 98-109 | メソッド全体 | `feature_name()` + `cmake_flags()` に置き換え |
| chat_template field | 183-187 | `pub chat_template: Option<String>,` | 削除 |
| chat_template in ctors | 204,221,243,260,276 | `chat_template: None,` | 削除（5箇所） |
| Metal doc | 33 | `"mistralrs の metal feature と対応する"` | 更新 |
| Cuda doc | 45 | `"mistralrs の cuda feature と対応する"` | 更新 |

**影響を受けるテスト（config.rs）**:

| テスト | 行 | 変更内容 |
|-------|-----|---------|
| `gpu_provider_all_variants_roundtrip_json` | 495-508 | `DirectML` エントリ削除 |
| `gpu_provider_directml_serializes_to_directml` | 522-526 | テスト削除 |
| `mistralrs_feature_metal` | 619-621 | `feature_name_metal` に置き換え |
| `mistralrs_feature_cuda` | 623-625 | `feature_name_cuda` に置き換え |
| `mistralrs_feature_cpu_auto_empty` | 628-632 | `feature_name_cpu_auto` に置き換え |
| `mistralrs_feature_directml_empty` | 634-637 | 削除（DirectML 自体が存在しないため） |
| `model_config_roundtrip_json` | 674-687 | `chat_template` フィールド削除 |
| `custom_optional_fields_are_none` | 752-759 | `chat_template.is_none()` アサーション削除 |
| `gemma4_e2b_optional_fields_are_none` | 787-793 | 同上 |
| `gemma4_e4b_optional_fields_are_none` | 827-832 | 同上 |
| `gemma4_e2b_is_idempotent` | 795-806 | `chat_template` 比較行削除 |
| `gemma4_e4b_is_idempotent` | 835-845 | 同上 |
| `qwen3_5_0_8b_is_idempotent` | 848-858 | 同上 |
| `qwen3_5_2b_is_idempotent` | 860-870 | 同上 |
| `gguf_config_roundtrip_json` | 910-927 | `chat_template: None` 削除 |
| `sample_model` ヘルパー | 962-971 | `chat_template: None` 削除 |
| `detect_stress_env_var_and_os_fallback` | 640-669 | Windows アサーションは環境非依存のため変更不要 |

**物理的証拠（settings.rs 行番号）**:

| 変更対象 | 行 | 現状 | 変更後 |
|---------|-----|------|--------|
| DEFAULT_CONTEXT_SIZE | 62 | `32768` | `2048` |
| doc コメント | 58-62 | Qwen3.5 最大値言及 | llama-cpp-2 推奨値に更新 |
| STUB コメント | 19-29 | 変更なし | 維持 |

**feature_name() / cmake_flags() のシグネチャ（RFC §5 より）:**
```rust
pub fn feature_name(&self) -> &'static str {
    match self {
        Self::Metal => "metal",
        Self::Cuda => "cuda",
        Self::Cpu | Self::Auto => "cpu",
    }
}
pub fn cmake_flags(&self) -> Vec<(&'static str, &'static str)> {
    match self {
        Self::Metal => vec![("LLAMA_METAL", "ON")],
        Self::Cuda => vec![("LLAMA_CUDA", "ON")],
        Self::Cpu | Self::Auto => vec![],
    }
}
```

## Test Plan

### ユニットテスト計画

**対象**: `config.rs` の `#[cfg(test)] mod tests`（新規 + 更新 + 削除）
全テストは外部依存なし・メモリ内完結。

**GpuProvider 変更に伴うテスト更新（4新規 + 4更新 + 2削除）:**

| # | 種別 | テスト | 内容 |
|---|------|-------|------|
| 1 | 更新 | `gpu_provider_all_variants_roundtrip_json` | DirectML エントリ削除 |
| 2 | 削除 | `gpu_provider_directml_serializes_to_directml` | DirectML 削除に伴い不要 |
| 3 | 削除 | `mistralrs_feature_directml_empty` | DirectML 削除に伴い不要 |
| 4 | 新規 | `feature_name_metal` | `Metal.feature_name()` == "metal" |
| 5 | 新規 | `feature_name_cuda` | `Cuda.feature_name()` == "cuda" |
| 6 | 新規 | `feature_name_cpu_auto` | `Cpu.feature_name()` == "cpu"、`Auto.feature_name()` == "cpu" |
| 7 | 新規 | `cmake_flags_metal` | `Metal.cmake_flags()` == `[("LLAMA_METAL", "ON")]` |
| 8 | 新規 | `cmake_flags_cuda` | `Cuda.cmake_flags()` == `[("LLAMA_CUDA", "ON")]` |
| 9 | 新規 | `cmake_flags_cpu_auto` | `Cpu/Auto.cmake_flags()` == `[]` |
| 10 | 更新 | `from_str_*` 既存テスト | 変更なしで通過（directml 以外） |

**ModelConfig 変更に伴うテスト更新（10更新 + 1削除）:**

| # | 種別 | テスト | 内容 |
|---|------|-------|------|
| 11-20 | 更新 | 全10テスト（前述） | `chat_template` 関連行削除 |

**settings.rs テスト:**
| # | 種別 | テスト | 内容 |
|---|------|-------|------|
| 21 | 更新 | `default_context_size_is_reasonable` | 変更なしで通過（2048 <= 131072） |
| 22 | 更新 | `max_tokens_does_not_exceed_context_size` | 変更なしで通過（256 <= 2048） |

### ユニットテスト不可能な項目（例外）

なし。

## Boy Scout Rule — 翻訳可能性計画

- `GpuProvider::Metal` / `GpuProvider::Cuda` の doc コメントに mistralrs への言及（"mistralrs の metal feature と対応する"）が残っている → `"llama-cpp-2 の \{metal\|cuda\} feature と対応する"` に更新
- `settings.rs` の `DEFAULT_CONTEXT_SIZE` doc コメントを llama-cpp-2 環境に合わせて更新

## Acceptance Criteria

- [ ] `GpuProvider` が4バリアント（Auto/Metal/Cuda/Cpu）で動作する
- [ ] `from_str("directml")` が `None` を返す
- [ ] `feature_name()` が正しい値を返す（metal→"metal", cuda→"cuda", cpu/auto→"cpu"）
- [ ] `cmake_flags()` が正しい値を返す
- [ ] `ModelConfig` に `chat_template` フィールドが存在しない
- [ ] `DEFAULT_CONTEXT_SIZE` が 2048 であること
- [ ] 全テストスイート通過

## Notes

<!--
注: このコメントは人間向けの説明である。AI は以下の手順に従うこと。

- plan_path: /plan-ticket が plan.md を作成後に frontmatter に更新する
- implementation_path: /start-ticket が implementation.md を作成後に frontmatter に更新する
- review_report_path: /review-ticket が review.md を作成後に frontmatter に更新する

各コマンドのワークフロー手順が frontmatter 更新の正しい手順である。
-->

### 成果物

- 計画: context/0162-m6-3-configrs-settingsrs-mistralrs/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0162-m6-3-configrs-settingsrs-mistralrs/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0162-m6-3-configrs-settingsrs-mistralrs/review.md（未作成、/review-ticket 全チェック通過後に作成）
