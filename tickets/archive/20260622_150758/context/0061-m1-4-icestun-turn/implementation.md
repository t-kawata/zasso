# Implementation: M1-4 ICE/STUN/TURN 設定型定義

## 変更ファイル一覧

| ファイル | 種別 | 行数 | 内容 |
|----------|------|------|------|
| crates/siprs/Cargo.toml | 修正 | +2行 | secrecy 0.10.3 依存追加 |
| crates/siprs/src/transport.rs | 修正 | +113行 | IceConfig + TurnTransport + StunServerConfig + TurnServerConfig + 11 tests |

## 実装内容

### transport.rs 追記内容

1. **IceConfig** — enabled / aggressive_nomination / trickle_ice / renomination / max_host_candidates + Default impl（RFC §13 準拠）
2. **TurnTransport** — Udp / Tcp enum（Clone + Copy + Eq）
3. **StunServerConfig** — uri: String, new(impl Into<String>)
4. **TurnServerConfig** — uri / username / password(Option<SecretString>) / transport, new()
5. **11 ユニットテスト**

### 設計判断
- `TurnServerConfig.password` は `secrecy::SecretString` でラップ。Debug 出力は自動マスク
- `IceConfig` は Clone のみ derive（PartialEq は不要と判断）
- 全型を transport.rs に同居（M2-1 で re-export）

## ビルド・テスト結果

- cargo build → ✅ OK
- cargo test → ✅ 81 unit + 1 doc-test = 82 passed
- cargo test --features tls → ✅ 88 unit + 1 doc-test = 89 passed
- cargo clippy -- -D warnings → ✅ OK

### Quality Checks
- run-quality-checks.js: 1 issue（TlsConfig::new の6引数 — 既存、許容範囲）
- 翻訳可能性: 全関数が動詞句、unwrap/expect/dbg なし
