# 実装サマリー: M2.5-3 SpeechDenoiser safe API 書き換え

## 変更したファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `src/pipeline/denoiser.rs` | 変更 | 全 sherpa_rs_sys → sherpa_onnx（62行→50行） |

## 削除したもの

- `use sherpa_rs_sys as sys;`
- `use std::ffi::CString;`
- `unsafe impl Send for SpeechDenoiser {}`
- `unsafe impl Sync for SpeechDenoiser {}`
- 手動 `Drop` impl
- 全 `unsafe` ブロック（4箇所）

## M2.5 移行完了

| 計測 | 移行前 | 移行後 |
|------|--------|--------|
| cargo test | 72/72 PASS | 72/72 PASS |
| unsafe (sherpa由来) | 9箇所 | 0 |
| unsafe impl Send/Sync | 4つ | 0 |
| 手動 Drop | 2つ | 0 |
| 依存 | sherpa-rs 0.6.8 + sherpa-rs-sys | sherpa-onnx 1.13.2 （公式） |
