---
ticket_id: 190
title: M6-12: テストコード修正 — llama-cpp-2 パニック問題調査・修正
slug: m6-12-llama-cpp-2
status: draft
created_at: 2026-06-22
updated_at: 2026-06-22
---

# M6-12: テストコード修正 — llama-cpp-2 パニック問題調査・修正

- **フェーズ**: M6（Layer 3 — サーバー層置き換え）
- **参照設計書**: `crates/ggufrs/RFC.md`

---

## 依存・関連チケット

| 関係 | チケット | 内容 | 状態 |
|------|---------|------|------|
| 先行必須 | M6-4 | llama-cpp-2 統合（load_model） | ✅ 完了 |
| 先行必須 | M6-9 (#189) | server/openai.rs + router.rs 修正 | ✅ 完了 |
| 関連 | M6-11 (#187) | 依存差し替え（mistralrs → llama-cpp-2） | ✅ 完了 |
| 本チケット | M6-12 (#190) | llama-cpp-2 パニック問題調査・修正 | ✅ 本チケット |

**循環依存**: なし。

---

## Summary

`registry.rs` に存在する `[::STUB::] M6-12` タグのスタブを解決する。具体的には、`LlamaModel::load_from_file()` が存在しないモデルファイルに対して `debug_assert!` でパニックする問題を回避するため、`load_model()` にファイル存在チェックを追加し、該当テストの `#[ignore]` を解除する。

---

## Background

### 問題

`registry.rs` の `load_model()` は内部で `llama-cpp-2` の `LlamaModel::load_from_file()` を呼び出す。`llama-cpp-2` v0.1.150 の `model.rs:751` には以下のコードが存在する：

```rust
debug_assert!(Path::new(path).exists(), "{path:?} does not exist");
```

この `debug_assert!` は **debug ビルドでのみ有効**であり、存在しないファイルパスを渡すとパニックする。Rust のテストはデフォルトで debug ビルドで実行されるため、テスト `get_triggers_load_model_for_unloaded_model`（存在しないモデルファイルで `ModelLoadFailed` が返ることを確認するテスト）が期待通りに動作しない。

### 影響

- テストが `#[ignore]` で抑制されたままとなり、未検証のエラーハンドリング経路が残っている
- 本番コード（release ビルド）では `debug_assert!` が除去されるため `NullResult` が返るが、開発中のテストではこの経路を検証できない
- 手動で `#[ignore]` を外して実行すると、`spawn_blocking` がパニックを `JoinError` として捕捉し、`GgufError::InferenceFailed` に変換されるため、テストの期待値（`GgufError::ModelLoadFailed`）と不一致でテスト失敗する

### 解決方針

外部クレートの `debug_assert!` は変更できないため、呼び出し側で事前にファイル存在チェックを行い、存在しない場合は早期に `GgufError::ModelLoadFailed` を返す。これにより：

1. `debug_assert!` のパニック経路に到達しない
2. debug / release の両方で一貫したエラーハンドリング
3. テストが正常に動作し `#[ignore]` を解除できる

---

## Investigation

### 物理的証拠

**1. llama-cpp-2 の debug_assert 箇所**

```
ファイル: llama-cpp-2-0.1.150/src/model.rs:751
コード:   debug_assert!(Path::new(path).exists(), "{path:?} does not exist");
```

`LlamaModel::load_from_file()` の冒頭にあり、ファイルが存在しない場合に debug ビルドでパニックする。

**2. テスト実行時の実際の出力**

```
コマンド: cargo test -- --ignored get_triggers_load_model_for_unloaded_model

thread 'tokio-rt-worker' panicked at .../llama-cpp-2-0.1.150/src/model.rs:751:9:
"models/nonexistent/qwen3.5.gguf" does not exist

thread 'registry::tests::get_triggers_load_model_for_unloaded_model' panicked at src/registry.rs:464:18:
expected ModelLoadFailed (load_model path)
```

2つのパニックが観測される：
- 一次パニック：`llama-cpp-2` の `debug_assert!`（`spawn_blocking` 内部で発生）
- 二次パニック：テストの `match` が `_` ブランチに落ちたことによる期待値不一致

**3. spawn_blocking によるパニック捕捉**

`load_model()` 内の `spawn_blocking` クロージャでパニックが発生すると、`JoinHandle` は `JoinError` を返す。現在のコードではこれを `GgufError::InferenceFailed` に変換している：

```rust
// registry.rs:253-263
let model = tokio::task::spawn_blocking(move || { ... })
    .await
    .map_err(|e| GgufError::InferenceFailed(Box::new(e)))??;
```

テストは `Err(GgufError::ModelLoadFailed { .. })` を期待しているが、実際には `Err(GgufError::InferenceFailed(..))` が返るため不一致となる。

**4. 正常系テストの状況**

```bash
cargo test           # 184 passed, 0 failed, 0 warnings
cargo check          # 0 warnings
```

本件以外のテスト・ビルドは全て正常。

**5. スタブ状況**

`registry.rs:450` に `[::STUB::] M6-12` マーカーが存在する。その他のファイルにも M6-11/M6-13 タグ付きのスタブが存在するが、本チケットのスコープ外。

---

## Scope

### 実装範囲

**`crates/ggufrs/src/registry.rs` — `load_model()` の修正**:

`LlamaModel::load_from_file()` を呼び出す前に、`model_path` が実在するか `try_exists()` で確認する。存在しない場合は早期に `GgufError::ModelLoadFailed` を返す。

```rust
// 追加するコードイメージ
if !model_path.try_exists().map_err(|e| GgufError::ModelLoadFailed {
    name: name_owned.clone(),
    source: Box::new(e),
})? {
    return Err(GgufError::ModelLoadFailed {
        name: name_owned,
        source: Box::new(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("model file not found: {}", model_path.display()),
        )),
    });
}
```

**`crates/ggufrs/src/registry.rs` — テストの `#[ignore]` 解除**:

```rust
// 変更前
#[ignore]
#[tokio::test]
async fn get_triggers_load_model_for_unloaded_model() {

// 変更後
#[tokio::test]
async fn get_triggers_load_model_for_unloaded_model() {
```

**`crates/ggufrs/src/registry.rs` — `[::STUB::]` マーカー削除**:

`// [::STUB::] M6-12: ...` のコメント行を削除する。

### 非スコープ

- M6-11 タグ付きスタブ（`error.rs`, `generate.rs`）の解決
- M6-13 タグ付きスタブ（`test-run.rs`）の解決
- `anthropx/routing/mod.rs` の M5-2 タグ付きスタブの解決
- `llama-cpp-2` 本体へのパッチ・PR
- その他の新機能追加やリファクタリング

---

## Test Plan

### ユニットテスト計画

テストは既に実装済み（`get_triggers_load_model_for_unloaded_model`）。以下の変更のみ：

| # | テスト名 | 変更 | 正常/異常 | 内容 |
|---|---------|------|-----------|------|
| 1 | `get_triggers_load_model_for_unloaded_model` | `#[ignore]` 削除 | 異常 | 存在しないモデルファイルの `get()` → `ModelLoadFailed` |

新規テストは不要。既存のテスト1件が修正後正しく動作することを確認する。

### ユニットテスト不可能な項目（例外）

なし。

---

## Acceptance Criteria

- [ ] `cargo test` が 185 passed（従来184 + 本テスト1）で全件パスする
- [ ] `cargo test -- --ignored` に本テストが表示されない（`#[ignore]` 解除確認）
- [ ] `grep -rn '\\[::STUB::\\] M6-12' crates/ggufrs/src/` が空（スタブ削除確認）
- [ ] `cargo check --all-targets` が警告0でパスする

## Boy Scout Rule — 翻訳可能性計画

本チケットの変更は最小限であり、翻訳可能性を損なう既存コードへの介入はスコープ外とする。

## Notes

### リスク

- `try_exists()` はファイルシステムのパーミッションエラー等で `Err` を返す可能性がある。その場合も `ModelLoadFailed` としてエラーを統一する
- ファイル存在チェックと実際のロードの間にファイルが削除される競合は、テストコード（存在しないファイルを意図的に使う）のコンテキストでは問題とならない。本番コードではファイルが存在することが事前条件であるため、競合が発生した場合は `spawn_blocking` 内で `debug_assert!` がパニック → `JoinError` → `InferenceFailed` のフォールバック経路で処理される
