# 実装サマリー: M2.5-1 Cargo.toml 依存置き換え

## 変更したファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| Cargo.toml | 変更 | `cargo rm sherpa-rs && cargo rm sherpa-rs-sys && cargo add sherpa-onnx --no-default-features --features shared` |

## コンパイルエラー一覧（M2.5-2/3 のスコープ）

2 errors, 2 files:

1. `src/pipeline/vad.rs:14` — `use sherpa_rs_sys as sys;` → M2.5-2
2. `src/pipeline/denoiser.rs:7` — `use sherpa_rs_sys as sys;` → M2.5-3

## 検証結果

- cargo rm: ✅ 成功
- cargo add sherpa-onnx@1.13.2: ✅ 成功（shared feature）
- コンパイルエラー: 想定通りの2件のみ。予期せぬエラーなし
- build.rs: 手動リンクの重複・競合なし（確認済み）
