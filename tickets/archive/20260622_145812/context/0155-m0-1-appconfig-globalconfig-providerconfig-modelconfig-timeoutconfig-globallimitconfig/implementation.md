# 実装サマリ: M0-1 (ticket #155)

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| crates/anthropx/Cargo.toml | 新規 | package定義 + serde (derive) / toml / serde_json(dev) |
| crates/anthropx/src/lib.rs | 新規 | pub mod config; のモジュール宣言 |
| crates/anthropx/src/config/mod.rs | 新規 | 全6構造体 + 2enum + Default impl + 19テスト |

## 定義した型

- AppConfig（global + providers: BTreeMap）
- GlobalConfig（port, url_prefix, require_client_auth, log_format, allow_lossy, error_lossy_continue, timeouts, limits, aliases）
- ProviderConfig（transparent, base_url, api_keys + 7 optional override fields）
- ModelConfig（public, upstream, enabled, tags, max_tokens_cap, aliases）
- TimeoutConfig（connect_ms, read_ms, total_ms）— PartialEq
- GlobalLimitConfig（default_max_in_flight, default_max_queue）— PartialEq
- LogFormat enum（Text, Json）— PartialEq + rename_all snake_case
- OpenAiWireApi enum（Auto, ChatCompletions, Responses）— PartialEq + rename_all snake_case

## デフォルト値

port=8088, connect_ms=3000, read_ms=600000, total_ms=600000,
in_flight=64, queue=256, enabled=true, log_format=Text,
error_lossy_continue=false

## 検証結果

- cargo check: 通過（警告ゼロ）
- cargo clippy -D warnings: 通過
- cargo test: 19/19 通過
- cargo fmt: 適用済み

## 未解決事項

- 本クレートは workspace 未登録（後続フェーズで対応）
- M0-1 で定義すべき LogFormat / OpenAiWireApi を本チケットで含めて定義した（RFC依存解決）
