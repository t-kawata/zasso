# 計画: Translate mode 本実装 — llm-bridge-core 変換

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `provider/translate.rs` | 改修 | `handle_translate()` 本実装 + 内部関数分割 |
| `routing/mod.rs` | 追加 | `to_llm_api_format()` 変換関数 |
| `http/routes.rs` | 修正 | `resolved` 引数追加 + スタブフォールバック削除 |

## 実装手順

1. `routing/mod.rs`: `to_llm_api_format()` 追加
2. `provider/translate.rs`: `handle_translate()` 本実装 + `From<TransformError>` + 内部関数
3. `http/routes.rs`: 引数修正 + フォールバック削除
4. `make check-be`, `make test`
5. 品質チェック

## テスト計画

translate.rs 内の `#[cfg(test)] mod tests` に9ケースのユニットテストを追加。
llm-bridge-core の変換関数自体のテストは同クレートで実施済みのため、anthropx 側ではエラーハンドリング・分岐ロジック・統合動作を検証する。

## 物理的レビュー方法

1. `run-quality-checks.js` で静的品質チェック
2. 翻訳可能性 grep: 関数名が動詞句、unwrap/expect 不使用、全 variant 網羅
3. `make check-be` / `make test` 全てパス
