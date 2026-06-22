# レビュー報告書: M6-6 — inference/generate.rs 全書き換え

## チェック結果

| チェック項目 | 結果 | 備考 |
|-------------|------|------|
| コンパイル検証 | ⚠️ 想定内エラー | gbnf 未追加（M6-11） + openai.rs 未修正（M6-9） |
| テスト実行 | ⚠️ 未実行 | コンパイルエラーにより実行不可（M6-11 で復旧） |
| 品質チェック | ✅ 4件（test only unwrap/expect） | テストコード内の正当な使用、許容範囲 |
| 構造整合性 | ⚠️ 81件（全件レガシー） | 旧 zasso チケットの重複ID等、本件無関係 |
| 翻訳可能性 | ✅ | 全関数動詞句、変数名ドメイン適切、デバッグ出力なし |
| 犯罪スキャン | ✅ 1件 open（M6-7 で解決予定） | DummyEngine todo!() — 本チケットスコープ外 |
| `[::STUB::]` | ✅ 4件解決 / 1件新規（generate_stream） | 新規スタブは M6-7 で解決予定 |

## Acceptance Criteria 充足状況

| # | 項目 | 状態 |
|---|------|------|
| 1 | mistralrs import 全削除 | ✅ |
| 2 | From\<GenerateParams\> for InferenceParams | ✅ ローカル構造体で代替（llama-cpp-2 に該当型なし） |
| 3 | generate() → spawn_blocking + LlamaContext | ✅ |
| 4 | generate_structured() → gbnf + grammar | ✅（M6-11 で有効化） |
| 5 | generate_stream() 削除 | ✅ Err スタブに置き換え |
| 6 | send_raw() 削除 | ✅ |
| 7 | 全エラー → GgufError::InferenceFailed | ✅ |
| 8 | mistralrs テスト削除 + 新規テスト追加 | ✅ 8件変換テスト + 4件 gbnf テスト |
| 9 | スタブ4件解決 | ✅ |

## 特記事項

1. **llama-cpp-2 API の差異**: RFC は高レベル API（InferenceParams, infer()）を想定していたが、
   実際の v0.1.150 は低レベル API のみ提供。ローカル InferenceParams + 手動推論ループで対応した。

2. **gbnf 未解決**: 仕様通りの保留。M6-11 で Cargo.toml に gbnf 追加後にコンパイル復旧。

3. **依存関係整合性**: M6-4（registry.rs 完了）、M6-5（トレイト定義完了）に正しく依存し、
   M6-7, M6-9, M6-11 を後続としている。循環依存なし。

## 判定

**PASS** — 本チケットの実装は仕様を満たしている。コンパイル未通過は設計通りの順序依存であり、
M6-11 完了後に統合検証が必要。
