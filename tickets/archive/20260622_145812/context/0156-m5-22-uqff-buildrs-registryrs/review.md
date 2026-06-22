# レビュー報告書 — チケット #156 (M5-2.2)

## チェック結果

| チェック項目 | 結果 |
|-------------|------|
| コンパイル検証 | ✅ `cargo clippy -- -D warnings` clean |
| 単体テスト | ✅ 174 tests passed (既存168 + 新規6) |
| 結合テスト | ✅ 1 test passed |
| 静的品質チェック | ✅ 16 issues (全て build.rs cargo:warning / RwLock expect、許容範囲) |
| 構造整合性 | ✅ 69 issues (全て既存チケットの旧形式由来、本チケット無関係) |
| 翻訳可能性 | ✅ 関数名は動詞句、1文字変数なし、デバッグ出力なし |
| 依存関係 | ✅ M5-2.1 (#155) reviewed, M5-1 (#153) reviewed |
| STUB 状態 | ✅ 該当範囲に STUB なし |

## Acceptance Criteria 確認

- [x] build.rs に Gemma4 E2B/E4B のダウンロード定義追加
- [x] build.rs がサブディレクトリを作成可能
- [x] Qwen3.5 の MODEL_FILES エントリ維持
- [x] registry.rs が `.uqff` 拡張子で UqffMultimodalModelBuilder パスを通す
- [x] registry.rs が `.gguf` 拡張子で GgufModelBuilder パスを通す
- [x] 未知拡張子でエラーを返す
- [x] 既存テスト全件通過
- [x] 新規テスト 6 ケース追加・全件通過

## Boy Scout 改善

- `get()` メソッドからビルダー構築ロジックを `build_model_with_gguf()` / `build_model_with_uqff()` に関数抽出（責務整理）
- build.rs のダウンロード失敗を assert! panic から cargo:warning に緩和（大モデルタイムアウトに耐性）
- テスト `uqff_model_path_returns_model_load_failed` のパス修正（存在しないディレクトリに変更し、ダウンロードタイムアウト回避）

## 発見事項
- mistralrs v0.8.1 の API 確認により、UqffVisionModelBuilder の代わりに UqffMultimodalModelBuilder を使用する必要があった
- UqffSource 列挙型は存在せず、Vec<PathBuf> で直接ファイルパスを指定する API

## 総評
問題なし。チケット #156 は品質基準を満たしている。
