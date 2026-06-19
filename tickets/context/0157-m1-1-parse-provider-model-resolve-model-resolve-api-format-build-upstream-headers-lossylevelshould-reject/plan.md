# 計画: M1-1 (ticket #157)

## 要件
5つの純粋ロジック関数を実装: parse_provider_model, resolve_model, resolve_api_format, build_upstream_headers, LossyLevel::should_reject

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| src/routing/mod.rs | 新規 | 3関数 + ApiFormat enum + 12テスト |
| src/util/mod.rs | 新規 | build_upstream_headers + HOP_BY_HOP_HEADERS + 4テスト |
| src/lib.rs | 編集 | pub mod routing; + pub mod util; |
| src/config/mod.rs | 編集 | impl LossyLevel { should_reject } + 3テスト |

## 実装手順
1. src/routing/mod.rs 作成
2. src/util/mod.rs 作成
3. src/lib.rs 編集
4. src/config/mod.rs 編集
5. cargo check + cargo test + cargo clippy 確認

## レビュー方法
- cargo check --all-targets 警告ゼロ
- cargo test 63/63 通過
- cargo clippy -D warnings 通過
- 翻訳可能性 grep
