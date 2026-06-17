# M15-2: AudioWorkerTask

## 変更ファイル
| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/audio/worker.rs | 新規 | AudioWorker + process_frame() + 3 tests |
| crates/siprs/src/audio/mod.rs | 修正 | pub mod worker; 追加 |
| crates/siprs/src/audio/mixer.rs | 修正 | AudioMixer/MixerSourceEntry dead_code 除去 |

## 実装内容
- AudioWorker: mixer / call_id / format / tap_txs / pair_aligner / shutdown
- process_frame(): out_queue pull → PairAligner → in_queue pull → PairAligner → try_pair
- [::STUB::] M16-1 (#118) で Tap 配送と spawn_blocking run() を実装

## STUB 解決
- AudioMixer: #[allow(dead_code)] 除去（AudioWorker が使用開始）
- MixerSourceEntry: #[allow(dead_code)] 除去（同上）

## テスト (3件)
| テスト | 内容 |
|--------|------|
| test_single_source | 10フレーム処理 → out_queue 空 |
| test_tap_delivery | in/out → PairAligner → try_pair |
| test_empty_frame | 空フレーム → Ok |

## 検証結果
- cargo check: 0 errors, 0 warnings
- cargo test: 350 passed, 0 failed (+2 doc-tests)
- run-quality-checks.js: 0 issues
