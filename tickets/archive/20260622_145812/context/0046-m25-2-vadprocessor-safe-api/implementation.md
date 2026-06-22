# 実装サマリー: M2.5-2 VadProcessor safe API 書き換え

## 変更したファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `src/pipeline/vad.rs` | 変更 | sherpa_rs_sys → sherpa_onnx 全置き換え |

## 削除したもの

| 項目 | 削除行数 |
|------|---------|
| `use sherpa_rs_sys as sys;` | 1 |
| `use std::ffi::CString;` | 1 |
| `use std::mem;` | 1 |
| `unsafe impl Send for VadProcessor {}` | 2 |
| `unsafe impl Sync for VadProcessor {}` | 2 |
| 手動 `Drop` impl（8行） | 8 |
| unsafe C API 呼び出し（3箇所） | 〜15 |

## 追加したもの

- `use sherpa_onnx::{SileroVadModelConfig, TenVadModelConfig, VadModelConfig, VoiceActivityDetector};`
- `vad: Option<VoiceActivityDetector>` — RAII safe wrapper
- `VoiceActivityDetector::create(&config, buffer_size)` — safe constructor

## 検証結果

- コンパイル: vad.rs 単体ではエラーなし（全体としては denoiser.rs の旧importが残留中）
- unsafe 残存: 2件（Windows FFI `GetShortPathNameW`、sherpa 由来ではない）
- unsafed impl Send/Sync: 0（完全削除）
