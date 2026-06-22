# 実装サマリ: local モジュール宣言 + lib.rs 公開 (M4-1 / #111)

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|----------|------|------|
| `crates/voiput/src/local/mod.rs` | NEW | 子モジュール宣言 (qwen3, recognizer) |
| `crates/voiput/src/local/qwen3.rs` | NEW | 空（[::STUB::] M4-2） |
| `crates/voiput/src/local/recognizer.rs` | NEW | 空（[::STUB::] M5-1） |
| `crates/voiput/src/lib.rs` | EDIT | pub mod local 追加 |

## 検証結果
| 項目 | 結果 |
|------|------|
| cargo check (voiput) | ✅ 成功 |

## M4 マイルストーン進捗
| チケット | ステータス | 内容 |
|---------|-----------|------|
| #111 (M4-1) | ✅ done | local モジュール宣言 ← NEW |
| — (M4-2) | ❌ 未作成 | Qwen3AsrBackend 実装 |
| — (M4-3) | ❌ 未作成 | LocalAsrBackend impl |
