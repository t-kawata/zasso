---
ticket_id: 158
title: "M5-2.4: test-run + 実動作確認"
slug: m5-24-test-run
status: reviewed
created_at: 2026-06-19
updated_at: 2026-06-19
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0158-m5-24-test-run/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0158-m5-24-test-run/review.md
---

# M5-2.4: test-run + 実動作確認

## Summary

Gemma4 移行の最終確認。`cargo run --bin test-run` を実行し、
3パターン（Structured Output → Text Generation → Streaming）が
すべて PASS することをエビデンス付きで確認する。

## Background

### 経緯

M5-2.1 から M5-2.3 までの実装で Gemma4 モデル対応のコードは完了した：
- ModelConfig コンストラクタ追加（M5-2.1）
- UQFF 読み込み対応（M5-2.2）
- デフォルトモデル切り替え + enable_thinking（M5-2.3）

本チケットでは実際にモデルがダウンロードされた状態で test-run を実行し、
Gemma4 E2B が正しく推論できることを目視確認する。

### 現在の実装状況

- `cargo run --bin test-run` で Gemma4 E2B を使用するコードになっている
- test-run.rs の推論パラメータは高速化最適済み（thinking OFF, max_tokens 抑制）
- build.rs で Gemma4 E2B（≈3.1GB）の自動ダウンロードを試行する
- ダウンロードに失敗した場合は警告のみ（ビルドは継続する）

### このチケットの必要性

コードの正しさはユニットテスト（175件）で検証済みだが、実際のモデルを使った
エンドツーエンドの推論動作は test-run の実実行でしか確認できない。
M5-2.x シリーズの完了を宣言するには、この確認が必須。

## Scope

### 実行すること

1. **モデルファイルの確認**
   - `models/gemma4-e2b-uqff/q4k-0.uqff` が存在するか確認
   - 存在しない場合は build.rs がダウンロードを試行したことを確認

2. **`cargo run --bin test-run` の実行と結果記録**
   - 3パターンの推論結果を記録
   - サマリーで PASS/FAIL を確認
   - 各パターンの出力をエビデンスとして保存

3. **結果の評価**
   - Structured Output: 正しい JSON フォーマットか
   - Text Generation: 意味のあるテキストが生成されているか
   - Streaming: 逐次出力されているか

4. **問題があれば修正・再実行**
   - エラー原因を特定し修正
   - 修正後再実行して全パターン PASS を確認

### 実装しないもの

- コード変更 — 原則として行わない（問題発見時は除く）
- 結合テストの作成 — M5-3 で実施
- RFC.md の更新 — 別途対応

## Investigation

### test-run 実行計画

```bash
# モデルファイルの確認
ls -lh models/gemma4-e2b-uqff/q4k-0.uqff

# test-run の実行（モデルが存在する場合）
cargo run --bin test-run
```

### 期待される出力

```
============================================================
  Initializing GgufEngine
============================================================
✓ GgufEngine initialized successfully
  Model: Gemma4 E2B (UQFF Q4K, ~3.1GB)

============================================================
  Pattern 1: Structured Output (JSON Schema)
============================================================
  Result: {
      "corrected_text": "...",
      "was_modified": true/false,
      "correction_notes": "..."
  }

============================================================
  Pattern 2: Text Generation
============================================================
  <生成テキスト>

============================================================
  Pattern 3: Streaming Generation
============================================================
  <ストリーミング出力>

============================================================
  Summary
============================================================
  Pattern 1 (Structured Output):  PASS
  Pattern 2 (Text Generation):    PASS
  Pattern 3 (Streaming):          PASS
```

### モデルダウンロード状態

まずモデルファイルが存在するか確認する。存在しない場合:
1. `cargo build` で build.rs によるダウンロードを試行
2. タイムアウト等で失敗した場合は手動 curl で再試行

### 依存チケットの状態

- **M5-2.3** (#157): ✅ reviewed — test-run 設定切替完了
- 本チケット（#158）の先行実装必須は完了
- 本チケットは M5-2.x シリーズの最終チケット

## Test Plan

本チケットはコード変更を伴わない目視確認のため、従来のユニットテストは
対象外。以下の検証で代替する:

| # | 検証項目 | 方法 | 合格条件 |
|---|---------|------|---------|
| 1 | モデルファイル存在確認 | `ls -lh models/gemma4-e2b-uqff/q4k-0.uqff` | ファイル存在 |
| 2 | test-run ビルド | `cargo check --bin test-run` | コンパイル成功 |
| 3 | Pattern 1 | Structured Output 実行 | PASS + 有効な JSON |
| 4 | Pattern 2 | Text Generation 実行 | PASS |
| 5 | Pattern 3 | Streaming 実行 | PASS |
| 6 | サマリー | 最終表示 | 3/3 PASS |

### ユニットテスト不可能な項目（例外）

全項目が実モデル依存のため、ユニットテスト対象外。

## Acceptance Criteria

- [ ] `cargo run --bin test-run` がエラーなく実行される
- [ ] Pattern 1 (Structured Output) が PASS
- [ ] Pattern 2 (Text Generation) が PASS
- [ ] Pattern 3 (Streaming) が PASS
- [ ] サマリーが 3/3 PASS を示す
- [ ] Structured Output が正しい JSON フォーマットである（目視確認）
- [ ] 各パターンの出力がエビデンスとして記録されている
- [ ] エラー発生時は原因が特定され、修正後再実行されている

## Notes

- モデルファイル（≈3.1GB）が未ダウンロードの場合、`cargo build` で
  build.rs がダウンロードを試行する。タイムアウト（60秒）で失敗する場合は
  手動ダウンロードが必要
- test-run バイナリは目視確認用であり、自動テストではない
- 参照: `crates/ggufrs/Tickets.md` L666-682

### 成果物

- 計画: context/0158-m5-24-test-run/plan.md（未作成）
- 実装サマリ: context/0158-m5-24-test-run/implementation.md（未作成）
- レビュー報告書: context/0158-m5-24-test-run/review.md（未作成）
