# 実装成果: チケット #90 — M7-1 EventBus

## 変更ファイル

| ファイル | 種別 | 変更内容 |
|----------|------|----------|
| crates/siprs/Cargo.toml | 修正 | cargo add tokio --features sync |
| crates/siprs/src/event.rs | 追記 | EventBus (5 methods) + 8 tests |

## 実装内容

### EventBus (struct)
- control: broadcast::Sender<SipEvent>
- raw_sip: Option<broadcast::Sender<RawSipMessage>>
- #[derive(Clone)] — SipClient と共有可

### 5 methods
- new(control_cap, raw_sip_cap) — 2チャネル構成
- subscribe_control() → broadcast::Receiver<SipEvent>
- subscribe_raw_sip() → Option<broadcast::Receiver<RawSipMessage>>
- publish(event) — エラー無視
- publish_raw_sip(msg) — 無効時 no-op

### 依存関係
- tokio v1.52.3 (features: sync)

## テスト結果
- 232 tests PASS（既存 224 + 新規 8）
- 0 warnings
- Quality checks: 0 issues
