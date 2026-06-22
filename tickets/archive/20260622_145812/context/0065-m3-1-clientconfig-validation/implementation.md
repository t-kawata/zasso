# M3-1: ClientConfig バリデーション 実装サマリ

## 変更ファイル
- `crates/siprs/src/config.rs`

## 追加内容

### バリデーション関数群（型定義後、テスト前に挿入）
- `validate_client_config(cfg) -> Result<(), SipError>` — エントリポイント、5つのサブチェックを呼び出す
- `validate_event_bus_capacity(capacity)` — capacity >= 16 を検証
- `validate_raw_sip_event_capacity(enabled, event_capacity, bus_capacity)` — 有効時 event >= bus を検証
- `validate_audio_format(fmt)` — サンプルレートと frame_ms を検証
- `validate_pair_buffer(pair_buffer_ms, mixer_frame_ms)` — 整数倍 + 非ゼロを検証

### テスト（12 tests）
1. `test_validate_client_config_default_passes` — Default config が通過
2. `test_validate_event_bus_capacity_minimum` — 16 で OK
3. `test_validate_event_bus_capacity_too_small` — 15 で InvalidConfig
4. `test_validate_raw_sip_event_sufficient` — cap >= bus で OK
5. `test_validate_raw_sip_event_insufficient` — cap < bus で InvalidConfig
6. `test_validate_raw_sip_event_disabled` — disabled 時 cap 不問で OK
7. `test_validate_pair_buffer_multiple` — 120%20==0 で OK
8. `test_validate_pair_buffer_not_multiple` — 125%20!=0 で InvalidConfig
9. `test_validate_pair_buffer_zero` — pair=0 で InvalidConfig
10. `test_validate_mixer_frame_ms_zero` — mixer=0 で InvalidConfig
11. `test_validate_audio_format_zero_frame` — frame_ms=0 で InvalidConfig
12. `test_validate_client_config_all_errors_have_field_name` — 全エラーにフィールド名含む

## その他
- `use crate::error::SipError` を config.rs の import に追加
- `#[allow(dead_code)]` — M12-2 で使用されるまでの未使用警告を抑制
- `validate_transports` は spec 記載の通り型レベルで保証されるため実装せず

## 検証結果
- `cargo test`: 135 passed, 0 failed
- `run-quality-checks.js`: 0 issues
- 警告: 0
