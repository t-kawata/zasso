---
ticket_id: 105
title: パス解決の純粋関数群
slug: path-resolution
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/kawata/shyme/zasso/tickets/context/0105-untitled-4/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0105-untitled-4/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0105-untitled-4/review.md
---
# パス解決の純粋関数群

## Summary

Qwen3-ASR モデルファイルのパス解決を行う 2 つの純粋関数を実装する。`resolve_qwen3_model_paths()` は `model_dir` からモデルファイルパス群を生成し、`resolve_qwen3_asr_config()` は設定の相対パスを解決する。いずれも副作用のない純粋関数であり、決定論的テストが可能。

## Background

Qwen3-ASR バックエンド（M4-2）は起動時に 4 つのモデルファイルパスを必要とする。これらのパスは VoiputConfig の `model_dir` 設定に応じて絶対パスまたは相対パスの形式で指定される。既存の VAD モデルパス解決パターン（`resolve_vad_model_path`）と一貫した方法でパス解決を行う。

M2-3 で定義した `Qwen3AsrModelPaths` / `Qwen3AsrConfig` と M2-4 で定義した定数（`QWEN3_MODEL_SUBDIR` 等）を使用する。

## Scope

### 実施すること

- `crates/voiput/src/recognizer.rs` に以下の純粋関数を実装（RFC §4 のコードブロック通り）:
  1. `resolve_qwen3_model_paths(model_dir: &Option<String>) -> Qwen3AsrModelPaths`
     - `resolve_vad_model_path()` を流用してサブディレクトリ `qwen3-asr` 内の 4 ファイルのパスを生成
  2. `resolve_qwen3_asr_config(config: &VoiputConfig) -> Option<Qwen3AsrConfig>`
     - `qwen3_asr_config` の各モデルファイルパスを `model_dir` で解決
     - 絶対パス（`/` 始まり）はそのまま使用
     - 相対パスは `model_dir` と結合
     - `qwen3_asr_config` が `None` の場合は `None` を返す
- `#[cfg(test)]` で単体テストを実装
- `cargo test --lib` で全テスト通過確認

### 実施しないこと

- build.rs のダウンロード処理（M7-1）
- VAD 用の `resolve_vad_model_path` 関数の変更
- ファイル I/O を伴う処理（純粋関数に限定）

## Investigation

### RFC に定義された関数

`resolve_qwen3_model_paths()` (RFC §4):
```rust
fn resolve_qwen3_model_paths(model_dir: &Option<String>) -> Qwen3AsrModelPaths {
    let subdir = resolve_vad_model_path(QWEN3_MODEL_SUBDIR, model_dir);
    Qwen3AsrModelPaths {
        encoder: format!("{}/{}", subdir, MODEL_FILENAME_QWEN3_ENCODER),
        decoder: format!("{}/{}", subdir, MODEL_FILENAME_QWEN3_DECODER),
        joiner: format!("{}/{}", subdir, MODEL_FILENAME_QWEN3_JOINER),
        tokens: format!("{}/{}", subdir, MODEL_FILENAME_QWEN3_TOKENS),
    }
}
```

`resolve_qwen3_asr_config()` (RFC Appendix C):
```rust
fn resolve_qwen3_asr_config(config: &VoiputConfig) -> Option<Qwen3AsrConfig> {
    let qwen3_config = config.qwen3_asr_config.as_ref()?;
    let model_dir = &config.model_dir;
    let resolve = |path: &str| { ... };
    Some(Qwen3AsrConfig { ... })
}
```

### 現在の状態

- M2-3 (#103) ✅ reviewed: `Qwen3AsrModelPaths`, `Qwen3AsrConfig` 定義済み
- M2-4 (#104) ✅ reviewed: `QWEN3_MODEL_SUBDIR` 等 5 定数定義済み
- `resolve_vad_model_path()` は既存（`recognizer.rs` 内で公開関数として存在）
- `cargo check` ✅ 正常

### スタブ調査

- `grep -rn '\[::STUB::\]' crates/voiput/src/` → recognizer.rs 4件（M6-1）、新規なし

### 依存チケット

- M2-3 (#103): ✅ reviewed（Qwen3AsrModelPaths, Qwen3AsrConfig）
- M2-4 (#104): ✅ reviewed（QWEN3_MODEL_SUBDIR 等の定数）
- 後続: M4-2 (Qwen3AsrBackend) — 本関数の解決結果を config として使用

## Test Plan

### ユニットテスト計画

純粋関数であるため、全テストがメモリ内完結・決定論的：

| # | テスト名 | 種別 | 検証内容 |
|---|---------|------|---------|
| 1 | `resolve_with_absolute_path` | 正常系 | 絶対パスがそのまま使用されること |
| 2 | `resolve_with_relative_path_and_model_dir` | 正常系 | 相対パス＋model_dir で結合されること |
| 3 | `resolve_without_model_dir` | 正常系 | model_dir 未指定時に相対パスのまま |
| 4 | `resolve_with_none_config` | 異常系 | qwen3_asr_config=None → None |
| 5 | `resolve_paths_contain_subdir` | 正常系 | 全パスに `qwen3-asr/` サブディレクトリが含まれること |

### ユニットテスト不可能な項目（例外）

なし（全テストが純粋関数として検証可能）

## Boy Scout Rule — 翻訳可能性計画

- `resolve_qwen3_model_paths()` — 「Qwen3 モデルパスを解決する」— 動詞句として自然
- `resolve_qwen3_asr_config()` — 「Qwen3-ASR 設定を解決する」— 動詞句として自然
- 内部クロージャ `resolve` — 単一責務のため許容

## Acceptance Criteria

- [ ] `resolve_qwen3_model_paths()` が実装されていること
- [ ] `resolve_qwen3_asr_config()` が実装されていること
- [ ] 既存の `resolve_vad_model_path()` を流用していること
- [ ] 絶対パスと相対パスの両方に対応していること
- [ ] 5 つのテストケースが全て通過すること
- [ ] `cargo check` が成功すること

## Notes

### 実装フラグメント

`crates/voiput/src/recognizer.rs` の VAD パス解決関数近辺に追加:

```rust
/// Qwen3-ASR モデルファイルのパスを解決する。
///
/// model_dir が設定されている場合、`models/qwen3-asr/` サブディレクトリを
/// そのパスからの相対として解決する。絶対パスの場合はそのまま使用する。
fn resolve_qwen3_model_paths(model_dir: &Option<String>) -> Qwen3AsrModelPaths {
    let subdir = resolve_vad_model_path(QWEN3_MODEL_SUBDIR, model_dir);
    Qwen3AsrModelPaths {
        encoder: format!("{}/{}", subdir, MODEL_FILENAME_QWEN3_ENCODER),
        decoder: format!("{}/{}", subdir, MODEL_FILENAME_QWEN3_DECODER),
        joiner: format!("{}/{}", subdir, MODEL_FILENAME_QWEN3_JOINER),
        tokens: format!("{}/{}", subdir, MODEL_FILENAME_QWEN3_TOKENS),
    }
}

/// VoiputConfig から Qwen3AsrConfig を解決する。
///
/// qwen3_asr_config が設定されている場合、各モデルファイルのパスが
/// 絶対パスか相対パスかを判断し、必要に応じて model_dir と結合する。
fn resolve_qwen3_asr_config(config: &VoiputConfig) -> Option<Qwen3AsrConfig> {
    let qwen3_config = config.qwen3_asr_config.as_ref()?;
    let model_dir = &config.model_dir;

    let resolve = |path: &str| -> String {
        if path.starts_with('/') {
            path.to_string()
        } else {
            match model_dir {
                Some(dir) => {
                    let trimmed = dir.trim_end_matches('/');
                    format!("{}/{}", trimmed, path)
                }
                None => path.to_string(),
            }
        }
    };

    Some(Qwen3AsrConfig {
        model_paths: Qwen3AsrModelPaths {
            encoder: resolve(&qwen3_config.model_paths.encoder),
            decoder: resolve(&qwen3_config.model_paths.decoder),
            joiner: resolve(&qwen3_config.model_paths.joiner),
            tokens: resolve(&qwen3_config.model_paths.tokens),
        },
        provider: qwen3_config.provider.clone(),
        num_threads: qwen3_config.num_threads,
        debug: qwen3_config.debug,
    })
}
```

### 依存関係

- **先行実装必須**: M2-3 (#103) ✅ reviewed、M2-4 (#104) ✅ reviewed
- **後続**: M4-2 (Qwen3AsrBackend::new)
- **本チケットで M2 マイルストーン完了**

### 参照設計書

`crates/voiput/docs/sherpa-onnx-qwen3-asr/Tickets.md` M2-5
`crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§4, Appendix C)
