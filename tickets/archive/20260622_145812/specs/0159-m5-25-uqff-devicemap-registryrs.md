---
ticket_id: 159
title: "M5-2.5: UQFF モデルビルダーの DeviceMap 修正 (registry.rs)"
slug: m5-25-uqff-devicemap-registryrs
status: implementing
created_at: 2026-06-19
updated_at: 2026-06-19
---

# M5-2.5: UQFF モデルビルダーの DeviceMap 修正 (registry.rs)

## Summary

`UqffMultimodalModelBuilder` でモデルロード時に発生する `cpu (avail: 0MB)` 問題を、
`DeviceMapSetting::dummy()` と `with_force_cpu()` の指定により回避する。

## Background

### 経緯

M5-2.4 の test-run 実動作確認で、Gemma4 E2B モデルのロードに失敗した。
エラーメッセージは `cpu (avail: 0MB)` および `exceeds total capacity by 6423MB`。

外部専門家による調査の結果（`INFO02.md`）、以下の複合原因が特定された：

1. **mistralrs v0.8.1 の `auto_device_map.rs` のバグ**: CPU デバイスが avail リストに
   二重追加される（`Device::Cpu` がループ内 + 条件分岐内で2回 push される）
2. **`sysinfo` v0.36.1 の macOS ARM バグ**: `available_memory()` が `0` を返す
3. **UQFF マルチモーダルモデルの activation 推計値の過大評価**: Vision encoder の
   `max_image_shape (1024, 1024)` ベースの計算により ~6GB 超過と判定される

GGUF モデル（Qwen3.5）が問題なく動作するのは、マルチモーダルの activation 計算が
行われないため必要メモリ推計が小さくなるため。

### 現在の実装状況

- `registry.rs` `build_model_with_uqff()`: `UqffMultimodalModelBuilder::new(...).build().await`
  のみで DeviceMap 設定なし
- `UqffMultimodalModelBuilder` は `DerefMut<Target = MultimodalModelBuilder>` により
  `with_device_mapping()`, `with_force_cpu()` 等のメソッドが透過利用可能

### このチケットの必要性

M5-2.x シリーズの完了には test-run の 3/3 PASS が必要。
Auto device map のメモリ検出バグを回避し、モデルを正常ロードできるようにする。

## Scope

### 実装するもの

1. **`registry.rs` `build_model_with_uqff()` の修正**
   - `UqffMultimodalModelBuilder` のチェーンに以下を追加：
     - `.with_device_mapping(DeviceMapSetting::dummy())` — Auto map を完全バイパス
     - `.with_force_cpu()` — CPU デバイスを明示固定
   - 必要なインポートの追加（`DeviceMapSetting`）

2. **test-run の再実行（M5-2.4 再実施）**
   - `cargo run --bin test-run` で 3/3 PASS を確認
   - 結果をエビデンスとして記録

### 実装しないもの

- `GgufModelBuilder` のパスは変更しない（既存通り正常動作）
- `build_model_with_gguf()` は修正しない
- `AutoDeviceMapParams::Multimodal` のカスタム指定は行わない
  （`DeviceMapSetting::dummy()` で十分）

## Investigation

### INFO02.md の推奨コード

```rust
use mistralrs::{
    UqffMultimodalModelBuilder, DeviceMapSetting,
};

let model = UqffMultimodalModelBuilder::new(repo, vec![path])
    .with_device_mapping(DeviceMapSetting::dummy())
    .with_force_cpu()
    .build()
    .await?;
```

`DeviceMapSetting::dummy()` は `DeviceMapSetting::Map(DeviceMapMetadata::dummy())` の
ショートカットであり、`DummyDeviceMapper` を返してメモリフィット計算を完全スキップする。

### 必要なインポート

```rust
// 現在の registry.rs の mistralrs インポート
use mistralrs::{GgufModelBuilder, Model, UqffMultimodalModelBuilder};
// 追加が必要:
use mistralrs::DeviceMapSetting;
// 注意: DeviceMapSetting::dummy() はユニットメソッドのため、
// DeviceMapMetadata の直接インポートは不要
```

### 依存チケットの状態

- **M5-2.2** (#156): ✅ reviewed — UQFF 読み込み対応（`build_model_with_uqff()` の基盤）
- **M5-2.4** (#158): ✅ reviewed — test-run 実動作確認（本チケットで再実施）
- 本チケット（#159）の先行実装必須は全て完了

## Test Plan

### ユニットテスト計画

本チケットは DeviceMap 設定の追加のみであり、新規ロジックを含まない。
既存テストの全件通過で検証する。

| # | 検証項目 | 方法 | 合格条件 |
|---|---------|------|---------|
| 1 | コンパイル確認 | `cargo check` | 成功 |
| 2 | clippy 確認 | `cargo clippy -- -D warnings` | clean |
| 3 | 既存テスト | `cargo test` | 175件全通過 |

### 実動作確認（test-run）

| # | 検証項目 | 合格条件 |
|---|---------|---------|
| 1 | Pattern 1 (Structured Output) | PASS |
| 2 | Pattern 2 (Text Generation) | PASS |
| 3 | Pattern 3 (Streaming) | PASS |
| 4 | サマリー | 3/3 PASS |

### ユニットテスト不可能な項目（例外）

| 項目 | 理由 |
|------|------|
| test-run の実動作確認 | 実モデル（≈3.1GB）が必要 |

## Boy Scout Rule — 翻訳可能性計画

`build_model_with_uqff()` の修正はメソッドチェーンへの2行追加のみであり、
関数名・変数名の変更は不要。`with_device_mapping` および `with_force_cpu` は
メソッド名自体が動作を説明している（"デバイスマッピングを設定する"、"CPU を強制する"）。

## Acceptance Criteria

- [ ] `build_model_with_uqff()` に `.with_device_mapping(DeviceMapSetting::dummy())` が追加されている
- [ ] `build_model_with_uqff()` に `.with_force_cpu()` が追加されている
- [ ] 必要なインポート（`DeviceMapSetting`）が追加されている
- [ ] `cargo check` が通過する
- [ ] `cargo clippy -- -D warnings` が clean である
- [ ] 既存テスト 175件が全件通過する
- [ ] `cargo run --bin test-run` で 3/3 PASS する
- [ ] Structured Output が正しい JSON フォーマットである（目視確認）
- [ ] test-run の結果がエビデンスとして記録されている

## Notes

- `DeviceMapSetting::dummy()` は `#[doc(hidden)]` ではなく公開 API のヘルパーメソッド
- `with_force_cpu()` は `MultimodalModelBuilder` のメソッドであり、
  `UqffMultimodalModelBuilder` は `DerefMut` 経由でアクセスする
- 修正後は M5-2.x シリーズが完了し、M5-3（結合テスト）に進むことができる
- 参照:
  - `crates/ggufrs/docs/mistralrs-gemma4-e2b-e4b/INFO02.md`
  - `crates/ggufrs/Tickets.md` L685-702

### 成果物

- 計画: context/0159-m5-25-uqff-devicemap-registryrs/plan.md（未作成）
- 実装サマリ: context/0159-m5-25-uqff-devicemap-registryrs/implementation.md（未作成）
- レビュー報告書: context/0159-m5-25-uqff-devicemap-registryrs/review.md（未作成）
