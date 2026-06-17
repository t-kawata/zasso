# M15-1: AudioMixer 構造体

## 変更ファイル
| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/audio/mixer.rs | 追記 | AudioMixer (sources/queues/gain) + MixerSourceEntry + 8 tests |
| crates/siprs/src/audio/source.rs | 修正 | ErasedAudioSource dead_code 除去（STUB解決） |
| crates/siprs/src/util/id.rs | 修正 | AudioSourceId(NonZeroU64) → pub(crate) |
| crates/siprs/Cargo.toml | 修正 | dashmap, crossbeam-queue 追加 |

## 実装内容
- AudioMixer: DashMap<AudioSourceId, MixerSourceEntry> + ArrayQueue x2 + Atomic fields
- MixerSourceEntry: source(Mutex) / gain(AtomicU32) / muted(AtomicBool) / eof(AtomicBool)
- メソッド: new / add_source / remove_source / set_gain / mute / push/pop_out/in_frame / set_master_gain
- STUB解決: ErasedAudioSource の #[allow(dead_code)] 除去
- 新規依存: dashmap, crossbeam-queue (cargo add)

## テスト (8件)
test_add_source / test_add_remove_reuse / test_out_queue_roundtrip
test_out_queue_overflow / test_in_queue_overflow / test_master_gain

## 検証結果
- cargo check: 0 errors, 0 warnings
- cargo test: 347 passed, 0 failed (+2 doc-tests)
- run-quality-checks.js: 0 issues
