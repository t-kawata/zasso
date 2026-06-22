# 実装サマリ: Qwen3 モデルファイル名定数の追加 (M2-4 / #104)

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|----------|------|------|
| `crates/voiput/src/constants.rs` | EDIT | 5 定数を VAD 定数直後に追加 |

## 追加した定数
| 定数名 | 値 |
|--------|-----|
| `MODEL_FILENAME_QWEN3_ENCODER` | `"encoder.int8.onnx"` |
| `MODEL_FILENAME_QWEN3_DECODER` | `"decoder.int8.onnx"` |
| `MODEL_FILENAME_QWEN3_JOINER` | `"joiner.int8.onnx"` |
| `MODEL_FILENAME_QWEN3_TOKENS` | `"tokens.txt"` |
| `QWEN3_MODEL_SUBDIR` | `"qwen3-asr"` |

## 検証結果
| 項目 | 結果 |
|------|------|
| cargo check | ✅ 成功 |
| 定数値一致 | ✅ RFC の HuggingFace URL ファイル名と一致 |

## 次工程
M2-5 (Path resolution) に進むか、M3-1 (voiput → trate 依存追加) に進む。
