# Implementation: M2-2 AccountConfig / AccountCodecPolicy / OpusConfig / AccountMediaConfig / DtmfPolicy

## 変更ファイル一覧

| ファイル | 種別 | 行数 | 内容 |
|----------|------|------|------|
| crates/siprs/src/config.rs | 修正 | +260行 | 11 型 + 4 convenience methods + 13 tests を追記 |

## 実装内容

### 追加した型（11種類）

1. **DtmfMethod** — Inband / SipInfo / Rfc4733（Clone + Copy + Eq）
2. **Codec** — Pcmu / Opus（Clone + Copy + Eq）
3. **SrtpPolicy** — Disabled / Optional / Mandatory（Clone + Copy + Eq）
4. **AccountTransportPolicy** — Default / Prefer(TransportKind) / Only(TransportKind)
5. **OpusConfig** — bitrate / complexity / cbr / inband_fec / dtx / ptime_ms
6. **AccountCodecPolicy** — enable_pcmu / enable_opus / opus + `default_voice()`
7. **DtmfPolicy** — send_methods / receive_methods / default_send_method + `all_methods()`
8. **AccountMediaConfig** — srtp / ice / vad / ec_tail_ms / input_gain_db / output_gain_db + `Default`
9. **AccountConfig** — 16 フィールド（RFC §11 完全準拠）
10. **AuthOverride** — 空の placeholder struct
11. **AccountConfigPatch** — 全フィールド Option + Default

### 影響範囲
- TransportKind を config.rs の `pub use` に追加（AccountTransportPolicy で参照）

## ビルド・テスト結果

- cargo build → ✅ OK
- cargo test → ✅ 114 unit + 1 doc-test = 115 passed
- cargo clippy -- -D warnings → ✅ OK

### Quality Checks
- run-quality-checks.js: 0 issues ✅
