# M17-2: PjOwnedStr — pj_str_t wrapper — 実装サマリ

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| `src/ffi/strings.rs` | 新規 | PjStrRaw(slen:i32) + PjOwnedStr + 7トレイト + 12テスト |
| `src/ffi/mod.rs` | 変更 | #[allow] を mod bindings 内に移動し strings に影響しないよう修正。pub mod strings; 追加 |
| `src/util/pj_str.rs` | 変更 | 全実装削除 → #[deprecated] 型エイリアス化 |
| `src/util/mod.rs` | 変更 | 再エクスポート元を ffi::strings::PjOwnedStr に変更 |

## 検証結果
- ✅ `make check-be` — 成功
- ✅ `make test` — 14 PASS
- ✅ `cargo fmt --check` — 変更4ファイル通過
- ✅ 品質チェック — 0 issues
- ✅ 翻訳可能性 — 1文字変数/マジックナンバーなし
- ⏸️ siprs crate コンパイル — PJSIP 未インストールのためスキップ（既知制約）

## 主要な修正点
1. **PjStrRaw::slen** の型を `isize` → `i32` に修正（PJSIP ABI 準拠）
2. **ffi/mod.rs** の `#[allow]` スコープを `mod bindings` 内に限定
   - 手動コード（strings.rs）には clippy 抑制が適用されない
3. **util/pj_str.rs** を `#[deprecated]` エイリアス化
   - 後方互換性維持。移行先: `crate::ffi::strings::PjOwnedStr`
4. **as_str()** 追加（M4-2 からの差分）
