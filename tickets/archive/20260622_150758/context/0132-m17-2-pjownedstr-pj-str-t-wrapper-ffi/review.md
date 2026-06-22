# レビュー報告書: #132 M17-2 PjOwnedStr — pj_str_t wrapper

## チェック結果一覧

| 項目 | 結果 |
|------|------|
| コンパイル検証 (`make check-be`) | ✅ OK |
| テスト (`make test`) | ✅ 14 PASS |
| 静的品質チェック | ✅ 0 issues |
| 構造整合性チェック | ✅ 50 issues（全て旧 spec 由来、本チケット起因の新規 issue なし） |
| 翻訳可能性（動詞句関数名） | ✅ new / as_raw / as_str / deref / fmt / as_ref / eq + テスト関数 |
| 翻訳可能性（1文字変数） | ✅ 新規追加なし |
| 翻訳可能性（マジックナンバー） | ✅ 新規追加なし |
| 翻訳可能性（デバッグ出力） | ✅ なし |
| SAFETY コメント | ✅ unsafe impl Send + Sync に理由付き |
| cargo fmt --check | ✅ 通過 |
| util/pj_str.rs #[deprecated] | ✅ 型エイリアス + 移行先案内コメント |

## Acceptance Criteria 充足状況

- [x] `PjOwnedStr` が `crate::ffi::strings::PjOwnedStr` から利用可能
- [x] `crate::util::PjOwnedStr` が `#[deprecated]` 警告付きで引き続き利用可能
- [x] `PjStrRaw::slen` が `i32` であること（isize から修正）
- [x] `ffi/mod.rs` の `#[allow]` が `mod strings` に影響していない
- [x] M4-2 の 10 テスト + 新規 2 テスト（計 12 テスト）実装
- [x] `test_raw_ptr_valid_after_move` が引き続き有効
- [x] `cargo fmt --check` 通過

## スタブ評価
既存 7 スタブは全てフェーズ7以前（音声パイプライン）のもの。
本チケット（フェーズ8）で解決可能なスタブはなし。
resampler.rs:7 の "M17-2" 参照は旧 rubato 関連のスタブであり、本チケットの PjOwnedStr とは無関係。

## 依存関係クロスチェック
- M4-2 (#68): ✅ reviewed（本チケットで ffi/ に移行完了）
- M17-1 (#131): ✅ reviewed（ffi/mod.rs 基盤提供）
- 循環依存なし

## 備考
- siprs crate は PJSIP 未インストールのためコンパイル不可（M17-1 からの既知制約）
- 変更は全4ファイル、最小差分で実装
