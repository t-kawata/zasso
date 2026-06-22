# #144 実装サマリ

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| Cargo.toml | 修正 | metrics = "0.24.6" (optional) + metrics feature |
| src/lib.rs | 修正 | #[cfg(feature = "metrics")] pub mod metrics |
| src/metrics/mod.rs | 新規 | 8 計装関数（counter!/gauge! + increment/set） |
| src/runtime/state.rs | 修正 | add_call/remove_call → set_active_calls |
| src/runtime/state.rs | 修正 | add_account/remove_account → set_registered_accounts |
| src/runtime/reactor.rs | 修正 | SendDtmf 成功 → increment_dtmf_sent |
| src/audio/mixer.rs | 修正 | push_out_frame/push_in_frame oldest-drop → increment_audio_tap_overflows |
| src/ffi/callbacks.rs | 修正 | on_ice_transport_error → increment_ice_failures |
| src/ffi/callbacks.rs | 修正 | on_transport_state → increment_transport_reconnects |
| src/event.rs | 修正 | publish_raw_sip → increment_raw_sip_messages |

## metrics crate API
metrics v0.24 では counter!/gauge! マクロはハンドルを返し、.increment() / .set() を呼び出す方式:
- counter!("name").increment(1);
- gauge!("name").set(value as f64);

## 検証結果
| コマンド | 結果 |
|---------|------|
| cargo check -p siprs | ✅ |
| cargo check --features metrics | ✅ |
| cargo check --all-features | ✅ |
| cargo test -p siprs | ✅ 390 passed |
| cargo test -p siprs --features metrics | ✅ 390 passed |
| make check-be | ✅ |
| cargo fmt --check | ✅ |
