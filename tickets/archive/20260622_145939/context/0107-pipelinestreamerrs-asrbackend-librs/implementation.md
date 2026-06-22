# 実装サマリ: streamer.rs AsrBackend 移行 + lib.rs 再公開更新 (M3-2 / #107)

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|----------|------|------|
| `crates/voiput/src/pipeline/streamer.rs` | EDIT | AsrBackend trait 定義削除 → pub use trate::AsrBackend に変更 |
| `crates/voiput/src/lib.rs` | EDIT | AsrBackend の再公開元を trate に変更 |

## 検証結果
| 項目 | 結果 |
|------|------|
| streamer.rs のコンパイル | ✅ 成功（pub use trate::AsrBackend で解決） |
| lib.rs の pub use 更新 | ✅ voiput::AsrBackend が trate を指す |
| 既知のエラー（M3-3/M3-4） | ⚠️ OpenAIBackend (model_name) + MockBackend (model_name) — 許容 |

## 残存エラー（M3-3, M3-4 で解消）
1. openai.rs: `method model_name is not a member of trait AsrBackend` + locale型不一致
2. streamer.rs (MockBackend): `method model_name is not a member of trait AsrBackend`
3. binary/test-run.rs (MockStreamerBackend): 同上

## 次工程
M3-3 (OpenAIBackend impl 修正) に進む。
