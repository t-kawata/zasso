---
ticket_id: 81
title: PostCorrection 必須化 — エンジン非依存の OpenAI 補正パス
slug: postcorrection-openai
status: done
created_at: 2026-06-14
updated_at: 2026-06-14
plan_path: /Users/kawata/shyme/zasso/tickets/context/0081-postcorrection-openai/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0081-postcorrection-openai/implementation.md
---

# PostCorrection 必須化 — エンジン非依存の OpenAI 補正パス

## Summary

`VoiputConfig` に `openai_config` とは独立した `post_correction_openai_config` を追加する。これによりエンジンが `Os` の場合でも OpenAI の事後補正が動作可能になる。test-run.rs は `--openai-key` を必須引数とし、未指定時はエラー終了する。

## Background

現状の `rebuild_pc_backend()` は `openai_config`（エンジン OpenAI 用の設定）を兼用している。そのため `--engine os` で起動した場合、PC バックエンドが `None` になり、LLM 事後補正が一切行われない。これは音声認識結果の品質に直接影響する。

## Scope

- `src/config.rs` — `VoiputConfig` に `post_correction_openai_config: Option<OpenAiConfig>` フィールド追加。ビルダーに `post_correction_openai_config()` メソッド追加
- `src/recognizer.rs` — `SpeechRecognizer::new()` が `VoiputConfig` から独立した `post_correction_openai_config` を参照して PC バックエンドを構築する
- `src/binary/test-run.rs` — `--openai-key` を必須引数に変更（未指定時は `exit(1)` でエラー表示）
- `tests/integration_test.rs` — 既存テストを新しい設定に追従

## Non-scope

- OpenAI バックエンド（音声認識エンジンとしての OpenAI）の動作変更。`--engine openai` の transcribe 機能は従来通り

## Investigation

### 現状の PC バックエンド初期化

`recognizer.rs:549-561`:
```rust
fn rebuild_pc_backend(
    openai_config: Option<&OpenAiConfig>,
    shared_locale: Arc<parking_lot::Mutex<LocaleCode>>,
) -> (Option<Arc<dyn PostCorrectionBackend>>, Option<PostCorrectionConfig>) {
    if let Some(oa_config) = openai_config {
        let oa_backend = OpenAIBackend::new(oa_config, shared_locale);
        let wrapper = Arc::new(BackendWrapper(Arc::new(Mutex::new(oa_backend))));
        (Some(wrapper), Some(PostCorrectionConfig::default()))
    } else {
        (None, None)  // ← openai_config がないと完全にスキップ
    }
}
```

`openai_config` はエンジンが `OpenAI` の場合のみ設定される。`--engine os` では必ず `None`。

### 呼び出し箇所

`recognizer.rs` 内で `rebuild_pc_backend` が呼ばれている箇所:
- Line 299-310 (macOS backend 初期化)
- Line 321-332 (Windows backend 初期化)
- Line 483-500 (set_engine 時の update_pc_config)

### 判断基準

`SpeechRecognizer::new()` は `config.openai_config` を 2 つの用途に使用している:
1. OpenAI バックエンドの構築（engine=OpenAI の場合）
2. PostCorrection バックエンドの構築（常に必要）

この 2 つを分離し、PC 用の設定を独立して保持する。

## Test Plan

### ユニットテスト計画

| # | テスト | 種別 | ファイル | 内容 |
|---|--------|------|----------|------|
| 1 | `config_build_with_pc_openai` | 正常系 | `config.rs` | `post_correction_openai_config` 指定で build 成功 |
| 2 | `config_build_os_with_pc` | 正常系 | `config.rs` | Engine=Os + PC 設定で build 成功 |
| 3 | `rebuild_pc_backend_uses_dedicated_config` | 正常系 | `recognizer.rs` | PC バックエンドが独立した config から構築される |
| 4 | 既存全テスト回帰 | 回帰 | — | 161テスト通過 |

### ユニットテスト不可能な項目（例外）

- 実際の OpenAI API 呼び出し（ネットワーク依存）

## Boy Scout Rule — 翻訳可能性計画

- `rebuild_pc_backend` の引数名を `openai_config` → `pc_openai_config` に変更し、責務を明確化
- `SpeechRecognizer::new()` 内で openai_config（認識用）と pc_openai_config（補正用）の使い分けをコメントで明示

## Acceptance Criteria

- [ ] `VoiputConfig::builder().engine(Os).post_correction_openai_config(...)` で設定可能
- [ ] `SpeechRecognizer` が PC 用 OpenAI 設定から PostCorrectionBackend を構築する
- [ ] `test-run.rs` の `--openai-key` が必須引数になる（未指定時 exit(1)）
- [ ] `--engine os --openai-key=xxx` で OS 認識結果が LLM 補正される
- [ ] 全既存テスト通過

## Notes

test-run.rs の `--openai-key` 必須化により、現在の引数なし実行ができなくなります。これは意図的な変更です。

### 成果物

- 計画: context/0081-postcorrection-openai/plan.md（未作成）
- 実装サマリ: context/0081-postcorrection-openai/implementation.md（未作成）
- レビュー報告書: context/0081-postcorrection-openai/review.md（未作成）
