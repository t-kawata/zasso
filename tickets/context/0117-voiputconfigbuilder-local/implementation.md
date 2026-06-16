# 実装サマリ: VoiputConfigBuilder Local 検証 (M6-2 / #117)

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|----------|------|------|
| `crates/voiput/src/config.rs` | EDIT | build() に Local 検証追加 |
| `crates/voiput/src/recognizer.rs` | EDIT | テスト修正（Local 検証対応） |

## 検証結果
| 項目 | 結果 |
|------|------|
| cargo check | ✅ 0 errors, 0 warnings |
| cargo test --lib | ✅ 160 passed |

## 残存スタブ
resolve_qwen3_model_paths / resolve_qwen3_asr_config は M8-2 まで保留（正しい）

## M6 マイルストーン進捗
| チケット | ステータス | 内容 |
|---------|-----------|------|
| #116 (M6-1) | ✅ reviewed | SpeechRecognizer dispatch |
| #117 (M6-2) | ✅ done | Config validation ← NEW |
| — (M6-3) | ❌ 未作成 | コンパイル完了確認 |
