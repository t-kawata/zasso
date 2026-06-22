# 実装サマリ: M1-1 (ticket #157)

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| src/routing/mod.rs | 新規 | parse_provider_model / resolve_model / resolve_api_format + ApiFormat enum + 16テスト |
| src/util/mod.rs | 新規 | build_upstream_headers + HOP_BY_HOP_HEADERS + 4テスト |
| src/lib.rs | 編集 | pub mod routing; + pub mod util; + pub use 再公開 |
| src/config/mod.rs | 編集 | impl LossyLevel { should_reject } + 4テスト追加 |

## 実装した関数

- parse_provider_model: "provider/model" を最初の / で split
- resolve_model: 4段階解決（provider alias → global alias → public match → allow-list fallback）
- resolve_api_format: OpenAiWireApi → ApiFormat マッピング（Auto は URL パス自動判定）
- build_upstream_headers: hop-by-hop除去 + auth除去 + Bearer上書き
- LossyLevel::should_reject: Error級のみ拒否、真理値表通り

## 検証結果

- cargo check: 通過（警告ゼロ）
- cargo clippy -D warnings: 通過
- cargo test: 66/66 通過 + 1 doctest 通過
- cargo fmt: 適用済み
