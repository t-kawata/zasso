# M14-3: 音声ソース管理 API

## 変更ファイル
| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/client.rs | 修正 | 4 methods (add/remove/set_gain/mute) + 2 tests |
| crates/siprs/src/audio/source.rs | 修正 | ErasedAudioSource pub(crate) → pub に昇格 |

## 実装内容
| メソッド | 方式 | 特記事項 |
|----------|------|---------|
| add_audio_source(call_id, source) | RTT | Box<dyn ErasedAudioSource> 受取 |
| remove_audio_source(call_id, source_id) | RTT | |
| set_audio_source_gain(call_id, source_id, gain) | RTT | gain ≥ 0.0 検証 |
| mute_audio_source(call_id, source_id, muted) | RTT | |

## Visibility 変更
- ErasedAudioSource: pub(crate) → pub（add_audio_source の引数型として必要）

## テスト (2件)
| テスト | 内容 |
|--------|------|
| test_set_gain_negative | gain -1.0 → InvalidConfig |
| test_audio_source_after_shutdown | shutdown 後 → ShutdownInProgress |

## 検証結果
- cargo check: 0 errors, 0 warnings
- cargo test: 341 passed, 0 failed (+2 doc-tests)
- run-quality-checks.js: 5 false positives（既知、doc例コード）
