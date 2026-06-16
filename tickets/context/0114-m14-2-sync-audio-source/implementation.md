# M14-2: SyncAudioSource + SyncSourceAdapter

## 変更ファイル
| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/audio/source.rs | 追記 | SyncAudioSource + SyncSourceAdapter + 4 tests |

## 実装内容
- SyncAudioSource trait: fn next_chunk(&mut self, buf: &mut [i16]) -> usize
- SyncSourceAdapter<T>: new(), into_inner()
- AsyncAudioSource for SyncSourceAdapter<T>: RPITIT impl with sync wrapper

## テスト (4件)
| テスト | 内容 |
|--------|------|
| test_sync_source_adapter | Adapter 経由で AsyncAudioSource 使用 |
| test_into_inner | into_inner() が元の実装を返す |
| test_sync_source_send | Send 境界コンパイル時検証 |

## 検証結果
- cargo check: 0 errors, 0 warnings
- cargo test: 339 passed, 0 failed (+2 doc-tests)
- run-quality-checks.js: 5 false positives（doc例コード、既知）
