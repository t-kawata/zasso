---
ticket_id: 45
title: M2.5-1: Cargo.toml 依存置き換え
slug: m25-1-cargotoml
status: reviewed
created_at: 2026-06-11
updated_at: 2026-06-11
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0045-m25-1-cargotoml/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0045-m25-1-cargotoml/review.md
---
# M2.5-1: Cargo.toml 依存置き換え

## Summary

`sherpa-rs` / `sherpa-rs-sys`（非推奨、コミュニティメンテナンス）を `sherpa-onnx`（v1.13.2, k2-fsa公式メンテナンス）に置き換える。
`cargo rm` + `cargo add` で依存を切り替え、コンパイルエラーの一覧を取得する（M2.5-2, M2.5-3 のスコープ確定用）。

**注意（atomicity）:** 本チケット実行後、`pipeline/vad.rs` と `pipeline/denoiser.rs` が `sherpa_rs_sys` を参照しているためビルドが確実に壊れる。M2.5-2 と M2.5-3 を同一セッション内で連続実行し、M2.5-4 でビルド回復を確認すること。

## Background

`sherpa-rs`（v0.6.8, 最終更新2025-10）はコミュニティメンテナンスで、k2-fsa 公式の `sherpa-onnx` クレート（v1.13.2, 2026-05-14）が後継として登場している。

`sherpa-onnx` は:
- k2-fsa 公式リポジトリで開発
- Safe Rust API（RAII, `Option<Self>`, 自動 `Drop`）
- 静的リンク（デフォルト）と動的リンク（`shared` feature）を選択可能
- `sherpa-onnx-sys` が低レベルFFIを内部で提供

voiput は `shared` feature を使用し、DLL/dylib を `libs/` で管理する。

## Scope

### 1. 依存削除

```bash
cargo rm sherpa-rs
cargo rm sherpa-rs-sys
```

### 2. 依存追加

```bash
cargo add sherpa-onnx --no-default-features --features shared
```

- `--no-default-features`: 静的リンクを回避
- `--features shared`: 動的リンク（DLL/dylib を `libs/` に収集可能にするため）

### 3. build.rs 調整

build.rs の以下の箇所を確認・修正:
- `cargo:rustc-link-lib` や `cargo:rustc-link-search` に sherpa-rs-sys 関連の手動リンクがないか確認
  - sherpa-onnx-sys が自動で行うため、重複すると競合の原因になる
  - 現在の build.rs は sherpa 関連の手動リンクをしていないため、基本的に修正不要
- macOS: Framework リンク（Foundation, AVFoundation, Speech, CoreFoundation）は SpeechHelper 用であり維持
- Windows: システムライブラリリンク（ole32, kernel32 等）は維持
- ネイティブライブラリスタブ自動生成（`ar crs libSpeechHelper.a` 等）は維持

### 4. Cargo.toml コメントアウト行整理

`sherpa-rs` / `sherpa-rs-sys` のコメントアウト行を削除。
`sherpa-onnx` のコメント行を追加（将来の参照用）。

### 5. コンパイルエラー一覧取得

```bash
cargo check 2>&1 | grep "^error"
```

出力を保存し、M2.5-2 と M2.5-3 の実装範囲確定に使用する。
予想されるエラー箇所:
- `pipeline/vad.rs`: `sherpa_rs_sys as sys` → 全行（M2.5-2 で修正）
- `pipeline/denoiser.rs`: `sherpa_rs_sys as sys` → 全行（M2.5-3 で修正）

## Non-scope

- VadProcessor / SpeechDenoiser のコード書き換え — M2.5-2, M2.5-3
- テスト通過確認 — M2.5-4

## Investigation

### 証拠1: 現在の依存状態

`Cargo.toml` 現在:
```toml
sherpa-rs = "0.6.8"
sherpa-rs-sys = "0.6.8"
```

build.rs は sherpa 関連の `cargo:rustc-link-lib` を出力していない。
sherpa-rs-sys がビルドスクリプト内で `cargo:rustc-link-lib=sherpa-onnx-c-api` 等を自動出力する。

### 証拠2: sherpa-onnx クレート情報

| 項目 | 値 |
|------|-----|
| 最新版 | 1.13.2（2026-05-14） |
| メンテナー | csukuangfj / k2-fsa（公式） |
| 特徴 | Safe Rust wrapper, RAII, `shared` feature で動的リンク |
| 依存 | `sherpa-onnx-sys`（低レベルFFI, 内部依存として自動解決） |

### 証拠3: feature flags

- デフォルト: 静的リンク
- `shared`: 動的リンク（voiput はこちらを使用）
- `--no-default-features --features shared` で静的リンクを回避

## Test Plan

### ユニットテスト計画

このチケットではユニットテストを実装しない。cargo check でエラー箇所を特定するのが主目的。

### ユニットテスト不可能な項目

コンパイルエラーの確認は cargo check の成否で判断。

## Boy Scout Rule

- Cargo.toml のコメントアウト行を整理し、不要になった古い依存コメントを削除する
- sherpa-onnx の追加意図をコメントで説明（`# k2-fsa 公式クレート。shared feature で動的リンク`）

## Acceptance Criteria

- [ ] `cargo rm sherpa-rs && cargo rm sherpa-rs-sys` 成功
- [ ] `cargo add sherpa-onnx --no-default-features --features shared` 成功
- [ ] コンパイルエラー一覧が取得できていること
- [ ] build.rs のリンク設定に重複・競合がないこと

## Notes

- sherpa-onnx-sys は `sherpa-onnx` の内部依存であり、直接の追加は不要
- `cargo add` の `--no-default-features` を忘れると静的リンクになり、バイナリサイズが肥大化する
- 本チケット完了後、直ちに M2.5-2 と M2.5-3 を実行してビルドを回復すること

### 成果物

- 計画: context/0045-m25-1-cargotoml/plan.md（未作成）
- 実装サマリ: context/0045-m25-1-cargotoml/implementation.md（未作成）
- レビュー報告書: context/0045-m25-1-cargotoml/review.md（未作成）
