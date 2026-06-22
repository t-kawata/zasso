---
ticket_id: 195
title: M6-13: test-run + 実動作確認 (src/bin/test-run.rs)
slug: m6-13-test-run-srcbintest-runrs
status: implementing
created_at: 2026-06-22
updated_at: 2026-06-22
---

# M6-13: test-run + 実動作確認 (src/bin/test-run.rs)

- **フェーズ**: M6（Layer 4 — ビルド・テスト修正）
- **参照設計書**: `crates/ggufrs/RFC.md`（§10.3 test-run バイナリ, Step 15）
- **対象ファイル**: `crates/ggufrs/src/bin/test-run.rs`

---

## 依存・関連チケット

| 関係 | チケット | 内容 | 状態 |
|------|---------|------|------|
| 先行必須 | M6-1〜M6-11 | llama-cpp-2 移行の全基盤整備 | ✅ 全完了 |
| **先行必須** | **M6-12 (#190)** | **テストコード修正（パニック問題調査）** | ⚠️ **draft（未完了）** |
| **本チケット** | **M6-13 (#195)** | **test-run + 実動作確認** | ✅ 本チケット |
| 後続 | M6-14 (#?未作成) | Cargo.toml feature flags + clippy + ドキュメント | ⏳ 未着手 |

**循環依存**: なし。

**重要**: M6-12（テストコード修正）が未完了のため、M6-13 の実動作確認（`cargo run --bin test-run`）に必要な全前提条件が整っていない可能性がある。本チケットの実装スコープは test-run.rs のコード修正とコンパイル検証までとし、実機動作確認は M6-12 完了後に実施する。

---

## Summary

`crates/ggufrs/src/bin/test-run.rs` を llama-cpp-2 API に合わせて修正し、`cargo run --bin test-run` で全3パターン（Structured Output / Text Generation / Streaming Generation）が PASS する状態にする。

本チケットは llama-cpp-2 バックエンド移行（M6）の最終検証工程であり、移行完了のゲートとなる。

---

## Background

### mistralrs → llama-cpp-2 移行に伴う test-run.rs の位置づけ

test-run.rs は ggufrs クレートの機能を手動で目視確認するためのバイナリ。M5 フェーズで mistralrs バックエンド用に作成され、M5-2.3 で Gemma4 E2B モデル対応に切り替えられた。

しかし M6 フェーズでの llama-cpp-2 バックエンド移行に伴い、以下の変更が必要となっている：

1. **`GenerateParams` のフィールド変更**: `enable_thinking` が削除され（M6-5）、現在は3箇所の `[::STUB::]` コメントとして残存している
2. **InferenceEngine トレイトの 3メソッド化**: `send_raw()` が削除され（M6-8）、test-run.rs は既にこの3メソッドのみを使用しているためコード上の修正は最小限
3. **モデル解決の正確性**: `GgufEngine::new()` → `ModelRegistry::from_config()` → `load_immediate()` の初期化フローが変わっている

### 現状のtest-run.rs の問題

- `enable_thinking` に関する `[::STUB::]` コメントが3箇所残っている。このフィールドは M6-5 で `GenerateParams` から削除済みであり、削除されたフィールドへの参照コメントは削除する（復元すべきものではない）
- 既存の3パターンのシグネチャは全て `InferenceEngine` トレイトの3メソッドと一致しており、コード上の変更は `[::STUB::]` 箇所のみで最小限

---

## Scope

### 実装スコープ ✅

1. `src/bin/test-run.rs` のスタブマーカー `[::STUB::] M6-5: enable_thinking 削除` を削除する（3箇所）
2. `cargo check --bin test-run` の通過を確認
3. `cargo test` 全テスト通過を確認
4. モデル不在時のエラー表示動作を確認（ユニットテストでカバー）

### 非スコープ ❌

1. **実機推論実行（`cargo run --bin test-run` の実動作確認）**: モデルファイル（Gemma4 E2B UQFF Q4K、約3.1GB）のダウンロードと実機実行が必要。これは M6-12 完了後に M6-13 の事後タスクとして実施する。本チケットがカバーする「実動作確認」はコンパイル＋静的検証＋コードレビューまでとする。
2. **build.rs のモデルダウンロード修正**: M6-11 のスコープ
3. **テストコード修正（MockEngine 等）**: M6-12 のスコープ
4. **feature flags 調整や clippy**: M6-14 のスコープ
5. **サーバー機能の確認**: M4 フェーズのスコープ

---

## Investigation

### ソースコード調査結果

#### test-run.rs の現状

test-run.rs は 249行のファイルで、以下の3パターンを実行する：

| パターン | 関数 | InferenceEngine メソッド | モデル | 現在の状態 |
|---------|------|------------------------|-------|-----------|
| 1 | `run_pattern1` | `generate_structured()` | `gemma4-e2b` | ✅ シグネチャ一致 |
| 2 | `run_pattern2` | `generate()` | `gemma4-e2b` | ✅ シグネチャ一致 |
| 3 | `run_pattern3` | `generate_stream()` | `gemma4-e2b` | ✅ シグネチャ一致 |

**既存の `[::STUB::]` マーカー**（3箇所、全て同一内容）:

```rust
// [::STUB::] M6-5: enable_thinking 削除。M6-13 の本改修時に復元判断。
```

- `GenerateParams` から `enable_thinking` フィールドは既に M6-5 で除去されている
- このフィールドは mistralrs 特有のプロパティであり、llama-cpp-2 には同等の概念がない（`temperature` が0のときに決定論的生成になるのは llama-cpp-2 の標準動作）
- **復元不要**: 単にコメントを削除するだけでよい

#### 現状の `GgufEngine` 初期化フロー

```rust
let config = GgufConfig {
    models: vec![ModelConfig::gemma4_e2b()],
    server: ServerConfig {
        bind: "127.0.0.1:0".parse()?,
        models: vec!["gemma4-e2b".into()],
        auto_start_server: false,
    },
    gpu: GpuConfig {
        provider: GpuProvider::Cpu,
        cpu_only: true,
    },
};
let engine = GgufEngine::new(config).await?;
```

この初期化コードは `GgufEngine::new()` → `ModelRegistry::from_config()` → `load_immediate()` のフローを正しく呼び出しており、llama-cpp-2 移行後も API シグネチャに変更はない。

#### コンパイル状態

- `cargo check --bin test-run` → 通過 ✅
- `cargo test --no-run` → 通過 ✅

#### モデルファイル不在時の動作

- `GgufEngine::new()` → `ModelRegistry::from_config()` → `load_immediate()` がモデル不在時に `GgufError::ModelLoadFailed` を返すことを確認するテストが必要
- ただし本番モデルファイル（~3.1GB）なしでのテストとなるため、ダミーパスを与えてエラーになることを確認する

---

## Boy Scout Rule — 翻訳可能性計画

### test-run.rs の改善

1. **`[::STUB::]` マーカー削除**: 削除された `enable_thinking` フィールドを参照する3箇所のコメントを削除。削除されたフィールドへの言及はコードの翻訳可能性を損なう（読者が「enable_thinking とは何だ？」と混乱する）
2. **main 関数の責務分割**: main 関数は初期化とループ制御の2つの責務を持つ。RFC の設計では各パターンが独立した関数に抽出済みであり、main はサマリーの集約のみを行っている。これは翻訳可能な設計であり維持する
3. **エラーハンドリング**: 各パターンは `?` を使わずに個別の `(bool, Duration)` を返しており、1つのパターンの失敗が全体を abort しない設計。これは適切な設計パターンであり維持する
4. **ハードコード値**: 各パターンのプロンプト文字列はテスト用の固定値だが、テスト容易性の観点から判明度の高い文字列であるべき。現状のプロンプトはベンチマーク性格も持つため、固定値のままとする

### スコープ外の翻訳可能性改善

- `src/inference/generate.rs`（M6-6で全書き換え済み）は対象外
- `src/inference/stream.rs`（M6-7で全書き換え済み）は対象外
- 既存の `[::STUB::]` マーカーの解決は本チケット内で実施する

---

## Acceptance Criteria

- [ ] 3箇所の `[::STUB::]` マーカー（`enable_thinking` 削除に関するコメント）が test-run.rs から削除されている
- [ ] `cargo check --bin test-run` が通過する
- [ ] `cargo test` が全テスト通過する（既存の unit test + integration test）
- [ ] モデル不在時のエラーハンドリングがユニットテストで確認されている（ダミーパスによる `GgufError::ModelLoadFailed`）
- [ ] Malfeasance.json に未解決の犯罪が追加されていない
- [ ] 全テストファイルの `[::STUB::]` マーカーが点検され、本チケットに関連するものは全て解決されている

---

## Test Plan

### ユニットテスト計画

**test-run.rs 自体は main 関数のみのバイナリであるため、ユニットテストは既存の `tests/` ディレクトリのテストでカバーする。**

#### 既存テストでカバーされる項目（M6-12 完了後）

| テストファイル | カバー範囲 | 本チケットとの関係 |
|-------------|-----------|-------------------|
| `tests/ggufrs_api_check.rs` | 公開APIの存在確認 | ✅ test-run.rs が使用する全APIのコンパイル保障 |
| `tests/server_integration_test.rs` | サーバー結合テスト | ✅ 間接的にエンジン初期化の検証 |
| `src/lib.rs` (unit tests) | GgufEngine::new の基本動作 | ✅ test-run.rs の初期化フローの正しさ |

#### 本チケットで追加すべきテスト

test-run.rs はバイナリであり、通常の `#[cfg(test)]` モジュールによるユニットテストは適用しにくい。以下の方針で検証する：

1. **`cargo check --bin test-run`** — コンパイル検証
2. **`cargo test`** — 全ユニットテスト・結合テストが通過することの確認
3. **`parse_patterns()` のテスト** — test-run.rs 内のヘルパー関数は単体テスト可能だが、CLI 引数のパーステストは本チケットの優先度としては低い（目視確認バイナリのため）
4. **モデル不在時の初期化エラー検証**（新規追加）:
   - テスト用の `GgufConfig` で存在しないモデルパスを指定し、`GgufEngine::new()` が `GgufError::ModelLoadFailed` を適切に返すことを確認するテストが既存の lib.rs にあれば検証。なければ追加を検討

### ユニットテスト不可能な項目（例外）

| 項目 | 理由 |
|------|------|
| 実機推論動作（3パターンの実際の応答） | モデルファイル（~3.1GB Gemma4 E2B）が必要。CI でのダウンロードは時間的制約から困難 |
| ストリーミングの逐次出力表示 | 標準出力への逐次フラッシュ動作は端末依存のためユニットテスト不可 |
| モデル不在時のエラーメッセージ標準エラー出力 | `main` 関数内の `eprintln!` の動作確認。`GgufError` としてのエラー伝搬はユニットテスト可 |

### 実動作確認手順（M6-12 完了後）

```bash
# 1. コンパイル確認
cargo check --bin test-run

# 2. 全テスト通過
cargo test

# 3. 実機実行（モデルファイルが必要）
#    build.rs による自動ダウンロード、または手動配置
cargo run --bin test-run

# 4. モデル不在時の動作確認
#    モデルファイルがない状態で実行 → エラーメッセージを表示して終了する
```

---

## Notes

### 実装の流れ

1. `enable_thinking` 削除の STUB コメントを3箇所削除（`src/bin/test-run.rs`）
2. `cargo check --bin test-run` でコンパイル確認
3. `cargo test` で全テスト通過確認
4. spec の frontmatter `status` を `reviewed` に更新
5. モデルファイル実在不の場合のエラー検証テストを既存テストに追加

### M6-12 完了前の制限

M6-12（テストコード修正）が未完了のため、実機実行による動作確認は本チケットのスコープ外とする。代わりにコンパイル検証＋テスト通過＋コードレビューを以て本チケットのクリア条件とする。実機実行確認は M6-12 完了後の別タスクとしてキューに残す。

### 犯罪（[::STUB::] 未付与の不完全実装）調査

- Malfeasance.json スキャン結果: 未解決の犯罪なし（2026-06-22 確認）
- test-run.rs の3箇所の `[::STUB::]` マーカーは本チケットで削除されるため、犯罪の新規記録は不要
- `crates/ggufrs/` 全体のスタブスキャンを実施し、本チケットに関連する未解決のスタブがないことを確認する

### 成果物

- 計画: `context/0195-m6-13-test-run-srcbintest-runrs/plan.md`（未作成、`/plan-ticket` 承認後に作成）
- 実装サマリ: `context/0195-m6-13-test-run-srcbintest-runrs/implementation.md`（未作成、`/start-ticket` 実装完了後に作成）
- レビュー報告書: `context/0195-m6-13-test-run-srcbintest-runrs/review.md`（未作成、`/review-ticket` 全チェック通過後に作成）
