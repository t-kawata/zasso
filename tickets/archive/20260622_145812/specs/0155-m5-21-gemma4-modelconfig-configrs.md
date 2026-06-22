---
ticket_id: 155
title: "M5-2.1: Gemma4 モデル情報調査と ModelConfig 追加 (config.rs)"
slug: m5-21-gemma4-modelconfig-configrs
status: reviewed
created_at: 2026-06-19
updated_at: 2026-06-19
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0155-m5-21-gemma4-modelconfig-configrs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0155-m5-21-gemma4-modelconfig-configrs/review.md
---

# M5-2.1: Gemma4 モデル情報調査と ModelConfig 追加 (config.rs)

## Summary

Qwen3.5 非互換問題に対応するため、mistralrs v0.8.1 でサポートが確認された
Gemma4 E2B / E4B（UQFF 形式）の `ModelConfig` ビルトインコンストラクタを
`config.rs` に追加する。Qwen3.5 系の既存コンストラクタは維持する。

## Background

### 経緯

mistralrs v0.8.1 は Qwen3.5 の GGUF アーキテクチャ（`qwen35`）を未サポートであり、
実際の推論テストで `Unknown GGUF architecture 'qwen35'` エラーが発生した。
代替として、同バージョンでサポートが確認された Gemma4 E2B（≈3.1GB）と
Gemma4 E4B（≈5.0GB）をデフォルトモデルとして採用する。

Gemma4 モデルは UQFF（Universal Quantized File Format）形式であり、
mistralrs では `UqffVisionModelBuilder` を使用して読み込む。
テキスト補正タスクでは Vision モデルだが `TextMessages` を渡すことで
純テキスト推論が可能。

### 現在の実装状況

- `config.rs`: `ModelConfig::qwen3_5_0_8b()` / `ModelConfig::qwen3_5_2b()` が実装済み
- `build.rs`: Qwen3.5 2モデルのダウンロード定義あり（M5-2.2 で Gemma4 の UQFF を追加予定）
- Gemma4 の ModelConfig は未定義

### このチケットの必要性

M5-2.x シリーズの最初のステップ。設定構造体が先に存在しないと
後続の UQFF 読み込み対応（M5-2.2）やデフォルトモデル切り替え（M5-2.3）が
開始できない。Qwen3.5 の設定を維持したまま Gemma4 設定を追加する。

### 高速化の設計判断

**`context_size` は 2048 に固定する**:
- Gemma4 は最大 128k トークンまでサポートするが、ASR 補正タスクでは
  入力 60-90 トークン + 出力 60-90 トークンで十分
- `32768` に設定すると prefill（KV キャッシュ構築）に不要なコストがかかり、
  CPU 推論（2-5 tok/s）では顕著なレイテンシ増加となる
- INFO.md の推奨に基づき 2k で固定

## Scope

### 実装するもの

1. **`ModelConfig::gemma4_e2b()` 追加**（`config.rs`）
   - モデル名: `"gemma4-e2b"`
   - モデルパス: `"models/gemma4-e2b-uqff/q4k-0.uqff"`（build.rs のパスと整合）
   - `context_size: Some(2048)` — 高速化の設計判断に基づく固定値
   - `lazy_load: true` — Qwen3.5 同様の遅延ロード
   - `gpu_layers: None`, `batch_size: None`, `chat_template: None`

2. **`ModelConfig::gemma4_e4b()` 追加**（同上）
   - モデル名: `"gemma4-e4b"`
   - モデルパス: `"models/gemma4-e4b-uqff/q4k-0.uqff"`
   - その他は `gemma4_e2b()` と同一

3. **ユニットテスト追加**
   - `gemma4_e2b()` のフィールド検証
   - `gemma4_e4b()` のフィールド検証
   - Qwen3.5 既存テストが変更なしで通過することの確認

### 実装しないもの

- build.rs の MODEL_FILES 変更 — M5-2.2 で行う
- registry.rs の UQFF 読み込み対応 — M5-2.2 で行う
- デフォルトモデルの Gemma4 切り替え — M5-2.3 で行う
- `enable_thinking` の GenerateParams 追加 — M5-2.3 で行う
- Qwen3.5 コンストラクタの削除 — 将来の mistralrs 対応に備え維持

## Investigation

### モデル情報

| 項目 | E2B | E4B |
|------|-----|-----|
| パラメータ数 | 2B | 4B |
| 量子化形式 | UQFF Q4K（≈Q4_K_M） | 同左 |
| ファイル | `q4k-0.uqff` | `q4k-0.uqff` |
| 推定サイズ | ≈3.1 GB | ≈5.0 GB |
| リポジトリ | `mistralrs-community/gemma-4-E2B-it-UQFF` | `mistralrs-community/gemma-4-E4B-it-UQFF` |
| 推論ツール | `UqffVisionModelBuilder` | 同左 |
| 推定TTFT | 80-150ms | 150-300ms |
| 推定生成速度 | 5-10 tok/s | 2-5 tok/s |
| 推定レイテンシ | ≈300ms/ラウンド | ≈800ms/ラウンド |
| 推奨context_size | 2048 | 2048 |

出典: `crates/ggufrs/docs/mistralrs-gemma4-e2b-e4b/INFO.md` および
`mistralrs-gemma4-guide.md`。

### ModelConfig 構造体の確認

```rust
pub struct ModelConfig {
    pub name: String,
    pub model_path: PathBuf,
    pub lazy_load: bool,
    pub context_size: Option<u32>,
    pub gpu_layers: Option<u32>,
    pub batch_size: Option<u32>,
    pub chat_template: Option<String>,
}
```

既存の `qwen3_5_0_8b()` は `context_size: Some(32768)` で設定されている。
Gemma4 は `Some(2048)` に設定する。

### model_path の設計判断

`model_path` は build.rs（M5-2.2 で追加予定）でダウンロードされるパスと
整合させる必要がある。Gemma4 ガイドに基づき、以下の構成を採用：

```
models/
├── gemma4-e2b-uqff/
│   └── q4k-0.uqff       ← E2B モデルファイル
└── gemma4-e4b-uqff/
    └── q4k-0.uqff       ← E4B モデルファイル
```

これにより M5-2.2 で build.rs に以下のターゲットパスを追加する：
- `models/gemma4-e2b-uqff/q4k-0.uqff`
- `models/gemma4-e4b-uqff/q4k-0.uqff`

### 依存チケットの状態

- **M0-5** (#138): ✅ reviewed — `ModelConfig` 構造体定義完了
- **M1-1** (#139): ✅ reviewed — `ModelConfig::qwen3_5_0_8b()` 等のビルトインコンストラクタ完了
- 本チケット（#155）の先行実装必須は全て完了しており、ブロックされていない
- 本チケットは M5-2.2 の先行実装必須である

### スタブ状況

本チケットが解決する STUB は存在しない（純粋な新規追加）。

## Test Plan

### ユニットテスト計画

**対象**: `config.rs` の `ModelConfig` impl ブロック

| # | テストケース | 種別 | 内容 |
|---|------------|------|------|
| 1 | `gemma4_e2b_has_correct_name` | 正常系 | `name == "gemma4-e2b"` |
| 2 | `gemma4_e2b_has_correct_context_size` | 正常系 | `context_size == Some(2048)` |
| 3 | `gemma4_e2b_lazy_load_is_true` | 正常系 | `lazy_load == true` |
| 4 | `gemma4_e2b_optional_fields_are_none` | 正常系 | gpu_layers/batch_size/chat_template が None |
| 5 | `gemma4_e2b_is_idempotent` | 正常系 | 複数回呼び出しで同一値 |
| 6 | `gemma4_e4b_has_correct_name` | 正常系 | `name == "gemma4-e4b"` |
| 7 | `gemma4_e4b_has_correct_context_size` | 正常系 | `context_size == Some(2048)` |
| 8 | `gemma4_e4b_lazy_load_is_true` | 正常系 | `lazy_load == true` |
| 9 | `gemma4_e4b_optional_fields_are_none` | 正常系 | gpu_layers/batch_size/chat_template が None |
| 10 | `gemma4_e4b_is_idempotent` | 正常系 | 複数回呼び出しで同一値 |

既存の Qwen3.5 テスト（`qwen3_5_0_8b_*` / `qwen3_5_2b_*` の 7 ケース）は
変更なしで通過することを確認する。

### ユニットテスト不可能な項目（例外）

なし。ModelConfig のコンストラクタは純粋なデータ構造であり、
すべての検証はユニットテストでカバー可能。

## Boy Scout Rule — 翻訳可能性計画

### 現在のコードの評価

`config.rs` の既存コードは翻訳可能性の原則に沿って記述されている。
関数名は動詞句（`qwen3_5_0_8b()`）、変数名はドメイン概念（`context_size`、
`lazy_load`）、一関数一責務を満たしている。改善は不要。

### 遵守すべき翻訳可能性のルール

新規追加する `gemma4_e2b()` / `gemma4_e4b()` も既存のスタイルに従う：

1. **関数名は動詞句**:
   - `gemma4_e2b()` — 「Gemma4 E2B の設定を返す」
   - `gemma4_e4b()` — 「Gemma4 E4B の設定を返す」

2. **変数名はドメイン概念**:
   - 既存の `ModelConfig` の全フィールドがドメインを正確に表現している

3. **一関数一責務**:
   - 各コンストラクタは1モデルの設定のみを担当

4. **ハードコード値は consts/settings.rs で管理**:
   - `context_size` の値（2048）はこのチケットで直接指定するが、
     これはモデル固有の値であり汎用定数ではないため許容される
   - Qwen3.5 の `context_size: Some(32768)` と同様のパターン

## Acceptance Criteria

- [ ] `ModelConfig::gemma4_e2b()` が実装され、期待通りのフィールド値を持つ
- [ ] `ModelConfig::gemma4_e4b()` が実装され、期待通りのフィールド値を持つ
- [ ] 両コンストラクタとも `context_size: Some(2048)` である
- [ ] Qwen3.5 系の既存コンストラクタ（`qwen3_5_0_8b()` / `qwen3_5_2b()`）が維持されている
- [ ] 既存テストがすべて変更なしで通過する
- [ ] 新規テスト 10 ケースが追加され全件通過する
- [ ] `cargo test` が全件通過する

## Notes

- モデルパスは build.rs で実際にダウンロードされるパスと整合させること
  （M5-2.2 で build.rs に Gemma4 の MODEL_FILES エントリを追加する際に
  本チケットの model_path を参照する）
- Qwen3.5 の設定は一切削除しない — 誤削除防止のため注意
- Gemma4 は Vision モデルだが TextMessages でテキスト推論可能 —
  この情報は後続チケットの参考用であり、本チケットでは ModelConfig の追加のみ
- 参照:
  - `crates/ggufrs/docs/mistralrs-gemma4-e2b-e4b/mistralrs-gemma4-guide.md`（モデル情報詳細）
  - `crates/ggufrs/docs/mistralrs-gemma4-e2b-e4b/INFO.md`（パフォーマンス推定）
  - `crates/ggufrs/Tickets.md` L605-625（チケット定義原文）

### 成果物

- 計画: context/0155-m5-21-gemma4-modelconfig-configrs/plan.md（未作成、`/plan-ticket` 承認後に作成）
- 実装サマリ: context/0155-m5-21-gemma4-modelconfig-configrs/implementation.md（未作成、`/start-ticket` 実装完了後に作成）
- レビュー報告書: context/0155-m5-21-gemma4-modelconfig-configrs/review.md（未作成、`/review-ticket` 全チェック通過後に作成）
