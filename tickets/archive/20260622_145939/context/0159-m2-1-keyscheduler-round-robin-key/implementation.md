# 実装サマリ: M2-1 (ticket #159)

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| src/routing/scheduler.rs | 新規 | KeyScheduler struct + impl (new/with_seed/select_key/key_count/provider_name) + 7テスト |
| src/routing/mod.rs | 編集 | pub mod scheduler; 追加 |

## 検証結果

- cargo check: 通過（警告ゼロ）
- cargo clippy -D warnings: 通過
- cargo test: 82/82 通過 + 1 doctest 通過
- cargo fmt: 適用済み
