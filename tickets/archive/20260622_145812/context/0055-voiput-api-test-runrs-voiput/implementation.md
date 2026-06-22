# M5-2: Voiput 公開API — 実装成果

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `crates/voiput/src/voiput.rs` | 新規 (398行) | Voiput 構造体 (11メソッド + Drop + VAD変換ヘルパー + 17ユニットテスト) |
| `crates/voiput/src/lib.rs` | 修正 (+2行) | `mod voiput;` 有効化、`pub use voiput::Voiput;` 追加 |
| `crates/voiput/src/recognizer.rs` | 修正 (+4行) | SpeechRecognizer に `is_running()` ゲッター追加 |
| `crates/voiput/src/binary/test-run.rs` | 修正 (+118行) | `test_voiput()` 関数 (8デモセクション)、Stage表記更新 |

## テスト結果

- 全107テスト通過 (既存90 + 新規17)
- 新規テスト内訳: Voiput 構築3、ライフサイクル3、設定変更4、VAD変換5、ヘルスチェック1、Drop1
- test-run バイナリ: 全13セクション正常表示、`[VOIPUT]` 8デモすべて PASS

## 品質チェック

- run-quality-checks.js: 207件指摘 (すべて既存コード由来または test-run の意図的 println)
- validate-structure.js: 4件 (すべて既存問題、M5-2 無関係)
- 翻訳可能性: 全関数名が動詞句、実務コードに unwrap なし
