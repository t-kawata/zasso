# 実装サマリ: Qwen3AsrBackend の new() と transcribe() 実装 (M4-2 / #112)

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|----------|------|------|
| `crates/voiput/src/local/qwen3.rs` | EDIT | スタブ→Qwen3AsrBackend 構造体 + impl AsrBackend + 2 tests |
| `crates/voiput/src/recognizer.rs` | EDIT | M2-5 スタブのコメント更新 (M4-2→M5-1) |

## 検証結果
| 項目 | 結果 |
|------|------|
| cargo check (errors) | ✅ 0 |
| cargo check (warnings) | ✅ 0 |
| cargo test --lib | ✅ 156 passed (2 new) |

## 解決したスタブ
| スタブ | 所在 | 状態 |
|--------|------|------|
| `[::STUB::] M4-2` | `local/qwen3.rs` | ✅ 解決（実装に置き換え） |
| `#[allow(dead_code)] config field` | `local/qwen3.rs` | ⏳ M4-3 で使用予定（正しく保留） |
| `#[allow(dead_code)] resolve_*` (2件) | `recognizer.rs` | ⏳ M5-1 で使用予定（コメント更新） |

## 確認した API の差異
RFC §5 のコードでは `OfflineQwen3ASRModelConfig` に `joiner` フィールドがあったが、
実際の sherpa-onnx v1.13.2 には存在しない。encoder/decoder のみ設定。

## 次工程
M4-3 (LocalAsrBackend impl + validate_qwen3_model_files) に進む。
