# Implementation: M2-1 ClientConfig / ClientAudioConfig / TimeoutConfig / RawSipEventConfig 定義

## 変更ファイル一覧

| ファイル | 種別 | 行数 | 内容 |
|----------|------|------|------|
| crates/siprs/src/config.rs | 新規 | 295行 | ClientConfig + ClientAudioConfig + LogLevel + ResamplerQuality + TimeoutConfig + RawSipEventConfig + 20 tests |
| crates/siprs/src/lib.rs | 修正 | +1行, -2行 | pub mod config; 追加、コメント更新 |

## 実装内容

### config.rs 主要構成

1. **LogLevel** — Error / Warn / Info / Debug / Trace（Clone + Copy + Eq）
2. **ResamplerQuality** — Low / Medium / High（Clone + Copy + Eq）
3. **TimeoutConfig** — command/shutdown/register/invite timeout（Default: 10s/15s/15s/90s）
4. **RawSipEventConfig** — enabled/include_bodies/max_body_bytes/redact_authorization（Default）
5. **ClientAudioConfig** — default_delivery_format/pair_buffer_ms/jitter_buffer_ms/mixer_frame_ms/max_sources_per_call/resampler_quality（Default）
6. **ClientConfig** — 12 フィールド（Default: RFC §10.1 完全準拠）
7. **20 テスト** — 全 Default フィールド個別検証 + derive 確認 + Send+Sync

### 設計判断
- config.rs は `pub use crate::transport::{...}` で transport 型を再公開（facade）
- `Duration::from_secs()` で RFC の秒単位タイムアウトを直接表現
- マジックナンバーは全て RFC §10.1 の既定値で doc comment に明示

## ビルド・テスト結果

- cargo build → ✅ OK
- cargo test → ✅ 101 unit + 1 doc-test = 102 passed
- cargo clippy -- -D warnings → ✅ OK

### Quality Checks
- run-quality-checks.js: 0 issues ✅
- 翻訳可能性: unwrap/expect/dbg なし
