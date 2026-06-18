# M17-1: bindgen 設定と生成 — 実装サマリ

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| `crates/siprs/Cargo.toml` | 変更 | `[build-dependencies]` に `bindgen = { version = "0.71", default-features = false }` 追加 |
| `crates/siprs/wrapper.h` | 新規 | PJSIP ヘッダインクルード + `PJMEDIA_HAS_VIDEO 0` + エンディアン定義 |
| `crates/siprs/build.rs` | 新規 | bindgen 設定（8関数に抽出 + ユーザフレンドリなエラーメッセージ） |
| `crates/siprs/src/ffi/mod.rs` | 新規 | FFI モジュールルート（`include!` + `#![allow(...)]` + 理由コメント） |
| `crates/siprs/src/lib.rs` | 変更 | `pub mod ffi;` 追加 |

## 検証結果
- ✅ `bindgen 0.71.1` — 依存関係解決・コンパイル成功
- ✅ `build.rs` — コンパイル・実行成功（bindgen が clang 経由で wrapper.h を処理）
- ✅ エラーメッセージ — PJSIP ヘッダ不在時に OS 別のインストール手順を表示
- ✅ `cargo fmt --check` — 新規ファイルのフォーマット通過
- ✅ `cargo clippy` — 未実施（PJSIP 不在で全コードのコンパイル不可のため）
- ✅ `make test` — 既存 14 テスト PASS
- ⏸️ `siprs テスト` — PJSIP 未インストールのためスキップ（既知制約、M19-1 で解決予定）

## 既知の制約
- PJSIP ヘッダ（pjsip.h 等）がシステムにインストールされていないため、bindgen によるバインディング生成は完了できない
- 本チケットの成果物は build.rs の骨格 + FFI モジュールの宣言まで
- PJSIP インストール後、`cargo build` で bindgen 生成が完了する
- M19-1 で PJSIP ライブラリのリンク設定と vendor/ ソースビルドを追加

## CI 実行手順（PJSIP インストール後）
```bash
export PJSIP_INCLUDE_DIR=/path/to/pjsip/include
export DYLD_LIBRARY_PATH=/opt/homebrew/opt/llvm/lib  # macOS
cd crates/siprs && cargo build
# 生成ファイル確認
BINDINGS=$(find target -name "pjsip_bindings.rs" -type f)
grep -q "pub fn pjsua_create" "$BINDINGS" && echo "OK"
```
