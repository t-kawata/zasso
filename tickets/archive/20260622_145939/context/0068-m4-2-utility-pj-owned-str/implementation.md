# 実装成果: チケット #68 — M4-2 ユーティリティ（PjOwnedStr）

## 変更ファイル

| ファイル | 種別 | 変更内容 |
|----------|------|----------|
| crates/siprs/src/util/pj_str.rs | 新規 | PjOwnedStr + PjStrRaw + 7 trait impls + 10 tests |
| crates/siprs/src/util/mod.rs | 修正 | pub mod pj_str + pub use PjOwnedStr + コメント改善 |

## 実装内容

### PjStrRaw（モック FFI 型）
- #[repr(C)] で C 互換レイアウト（ptr: *const i8, slen: isize）
- pub(crate) 可視性 — M17-2 で ffi::pj_str_t に置き換え予定
- Debug + Clone + Copy を自動導出

### PjOwnedStr
- bytes: String — 文字列データを所有（Vec<u8> ではなく String を使用し Deref を単純化）
- raw: PjStrRaw — 構築時に一度だけ計算し保持
- unsafe impl Send + Sync — 自己参照型だが String のヒープデータはムーブ不変のため安全
- new(s: &str) → Deref で元の文字列が完全復元
- as_raw() → PjStrRaw を返す（pub(crate)、M17-2 以降使用）
- 7 つのトレイト実装: Deref, Debug, Display, AsRef<str>, PartialEq<str>, PartialEq<&str>

## テスト結果
- 172 tests PASS（既存 162 + 新規 10）
- 0 warnings（dead_code は #[allow] で抑制）
- Quality checks: 0 issues

## Boy Scout 改善
- util/mod.rs の各モジュール宣言に役割コメントを追加
