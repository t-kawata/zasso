# 実装サマリ: LocalRecognizer Facade (M5-1 / #114)

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|----------|------|------|
| `crates/voiput/src/local/recognizer.rs` | EDIT | スタブ→LocalRecognizer impl + AsrBackend impl |
| `crates/voiput/src/recognizer.rs` | EDIT | pub(crate)追加、allow(dead_code)維持（M6-2参照に更新） |
| `crates/voiput/src/local/qwen3.rs` | EDIT | allow(dead_code)除去、validate_qwen3_model_files 公開 |

## 検証結果
| 項目 | 結果 |
|------|------|
| cargo check | ✅ 0 errors, 0 warnings |
| cargo test --lib | ✅ 160 passed |

## 解決したスタブ
| スタブ | 状態 |
|--------|------|
| `[::STUB::]` (local/recognizer.rs) | ✅ 解決（LocalRecognizer 実装） |
| `#[allow(dead_code)]` validate_qwen3_model_files | ✅ 解決（LocalRecognizer::new で使用） |
| `#[allow(dead_code)]` resolve_qwen3_model_paths | ⏳ M6-2 で使用予定（正しく保留） |
| `#[allow(dead_code)]` resolve_qwen3_asr_config | ⏳ M6-2 で使用予定（正しく保留） |

## M5 マイルストーン進捗
| チケット | ステータス | 内容 |
|---------|-----------|------|
| #114 (M5-1) | ✅ done | LocalRecognizer Facade ← NEW |
| — (M5-2) | ❌ 未作成 | LocalRecognizerAdapter |
