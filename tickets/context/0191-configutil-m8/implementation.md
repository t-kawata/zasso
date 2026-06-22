# 変更したファイル一覧と実装内容の概要

## 変更ファイル

| ファイル | 種別 | 内容 |
|----------|------|------|
| config/mod.rs | 編集 | 型定義のみに削減。mod parse / mod validate 宣言を追加。テストは tests.rs に分離 |
| config/parse.rs | 新規 | AppConfig::from_toml() + テスト2件 |
| config/validate.rs | 新規 | AppConfig::validate() + テスト9件 |
| config/tests.rs | 新規 | 型関連テスト（元 config/mod.rs のテストモジュールより） |
| util/mod.rs | 編集 | mod headers + pub use headers::* に変更 |
| util/headers.rs | 新規 | build_upstream_headers() + HOP_BY_HOP_HEADERS + テスト4件 |

## ファイルサイズ（800行制限）

| ファイル | 行数 | 判定 |
|----------|------|------|
| config/mod.rs | 478 | ✅ |
| config/tests.rs | 697 | ✅ |
| config/parse.rs | 67 | ✅ |
| config/validate.rs | 313 | ✅ |
| util/mod.rs | 8 | ✅ |
| util/headers.rs | 157 | ✅ |

## 検証結果

- cargo build: ✅ 成功
- cargo test: ✅ 168 passed
- cargo clippy: ✅ ワーニング0
- cargo fmt: ✅ 適用済み

## Boy Scout Rule 改善

- headers.rs: `build_upstream_headers` のコメントに RFC 7230 §6.1 の参照を追加
- config/mod.rs: モジュール構成をドキュメントに明記
- config/parse.rs / validate.rs: 各ファイル冒頭にモジュールコメントを追加
