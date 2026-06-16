# 実装成果: チケット #94 — M8-3 ClientCapabilities / SrtpImplementation / AudioDeviceCaps

## 変更ファイル

| ファイル | 種別 | 変更内容 |
|----------|------|----------|
| crates/siprs/src/event.rs | 修正 | ClientCapabilities (20 fields) + SrtpImplementation + AudioDeviceCaps + 5 tests |
| crates/siprs/src/runtime/state.rs | 修正 | ClientCapabilities {} → ClientCapabilities::default_disabled() |

## 実装内容

### SrtpImplementation (enum)
- SdesSrtp / DtlsSrtp

### AudioDeviceCaps (struct)
- has_default_input/output: bool, input/output_devices: Vec<String>

### ClientCapabilities (struct, ~20 fields)
- 台数制約: max_calls, max_accounts
- トランスポート: transport_types
- セキュリティ: tls_available/version, srtp_available/types
- メディア: available_codecs, opus_available, audio_devices
- NAT/ICE: ice/trickle_ice/stun/turn_supported
- DTMF: dtmf_methods
- SIP拡張: supports_refer, supports_session_timers
- 付加機能: event_bus_capacity, raw_sip_events_supported, mixer_max_sources

### ClientCapabilities::default_disabled()
- 全 boolean false, 全 Vec 空, 全数値 0

## テスト結果
- 258 tests PASS（既存 253 + 新規 5）
- 0 warnings
- Quality checks: 0 issues

## 🎉 M8 マイルストーン完了
- M8-1 (#92): RegistrationState / ClientState ✅
- M8-2 (#93): CallState / MediaRuntime ✅
- M8-3 (#94): ClientCapabilities / Srtp / AudioDeviceCaps ✅
