# 計画: チケット #90 — M7-1 EventBus

## 要件

RFC §15.4 準拠 EventBus (tokio::sync::broadcast)。2 チャネル構成: control(SipEvent) + raw_sip(RawSipMessage)

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/Cargo.toml | 修正 | cargo add tokio --features sync |
| crates/siprs/src/event.rs | 追記 | EventBus + 5 methods + 8 tests |

## 実装手順

1. cargo add tokio --package siprs --features sync
2. event.rs に EventBus 追記
3. cargo check + cargo test

## レビュー方法

- run-quality-checks.js on event.rs
- 全テスト PASS 確認 (224 + 8 = 232)
