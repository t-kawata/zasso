# Implementation: M2-3 TlsConfig / ReconnectPolicy / CallMediaPreferences / OutgoingCallRequest / NegotiatedCodec / CodecSelectionPolicy

## 変更ファイル一覧

| ファイル | 種別 | 行数 | 内容 |
|----------|------|------|------|
| crates/siprs/src/config.rs | 修正 | +90行 | 5 新規型 + TlsConfig pub use 再公開 + 9 tests |

## 実装内容

### 追加した型

1. **CallMediaPreferences** — enable_early_media / enable_srtp / preferred_codecs
2. **OutgoingCallRequest** — 6 フィールド（target_uri / headers / auth_override / preferred_transport / media / auto_answer_refer）
3. **NegotiatedCodec** — Pcmu / Opus(OpusConfig)
4. **CodecSelectionPolicy** — Ordered / PreferOpusFallbackPcmu（#[derive(Default)]）
5. **ReconnectPolicy** — base_delay / max_delay / jitter_ratio
6. **TlsConfig pub use** — `#[cfg(feature = "tls")] pub use crate::transport::TlsConfig`

### 修正
- OpusConfig に `PartialEq` を追加（NegotiatedCodec が参照するため）

## ビルド・テスト結果

- cargo build → ✅ OK
- cargo test → ✅ 123 unit + 1 doc-test = 124 passed
- cargo test --features tls → ✅ 130 unit + 1 doc-test = 131 passed
- cargo clippy -- -D warnings → ✅ OK

### Quality Checks
- run-quality-checks.js: 0 issues ✅
