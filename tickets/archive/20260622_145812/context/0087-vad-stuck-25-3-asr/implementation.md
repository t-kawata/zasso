# 実装サマリ: チケット#87

## 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `crates/voiput/src/pipeline/streamer.rs` | `handle_vad()` のインテリジェントタイムアウトから `time_exceeded` 撤廃、定数→設定値に変更 |
| `crates/voiput/src/types.rs` | `VadConfig` に `asr_stagnation_threshold_secs` フィールド追加（デフォルト 3.0） |
| `crates/voiput/src/backends/openai.rs` | `build_streamer_config()` に新フィールドのマッピング追加 |

## 修正内容
- `ASR_STAGNATION_THRESHOLD_SECS` のローカル定数を撤廃し、`VadConfig.asr_stagnation_threshold_secs`（デフォルト 3.0秒）として設定可能に
- 発話強制終了の条件から `time_exceeded`（vad_max_speech_duration = 25秒）を撤廃
- 修正後: `asr_stagnant && is_low_signal`（ASR停滞3秒＋低信号で強制終了）

## 動作確認
- cargo check: 警告ゼロ ✅
- cargo test: 全170件パス ✅
- 品質チェック: totalIssues=0 ✅
