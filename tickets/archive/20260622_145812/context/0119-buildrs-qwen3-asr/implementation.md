# 実装サマリ: build.rs Qwen3-ASR モデルダウンロード (M7-1 / #119)

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|----------|------|------|
| `crates/voiput/build.rs` | EDIT | QWEN3_MODEL_FILES + create_dir_all + chain 統合 |

## 追加したファイル
```
models/qwen3-asr/
├── encoder.int8.onnx  (pantinor/sherpa-onnx-qwen3-asr-0.6b-int8)
├── decoder.int8.onnx
├── joiner.int8.onnx
└── tokens.txt
```

## 検証結果
| 項目 | 結果 |
|------|------|
| cargo check | ✅ 成功（0 warnings） |
| cargo test --lib | ✅ 160 passed |

## M7 マイルストーン進捗
| チケット | ステータス | 内容 |
|---------|-----------|------|
| #119 (M7-1) | ✅ done | build.rs モデルダウンロード ← NEW |
| — (M7-2) | ❌ 未作成 | テストフィクスチャ |
