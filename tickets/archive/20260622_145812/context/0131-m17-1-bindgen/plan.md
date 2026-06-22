# M17-1: bindgen 設定と生成 — 実装計画

## 要件
PJSIP 2.17 C ライブラリの Rust FFI バインディングを bindgen で自動生成する。
allowlist で必要最小限のシンボルのみ生成し、PJSIP ライブラリのリンクは M19-1 に委譲する。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| Cargo.toml | 変更 | build-dependencies に bindgen 追加 |
| wrapper.h | 新規 | PJSIP ヘッダインクルード + autoconf 定義 |
| build.rs | 新規 | bindgen 設定（関数抽出パターン） |
| src/ffi/mod.rs | 新規 | FFI モジュールルート (include! + #![allow(...)]) |
| src/lib.rs | 変更 | pub mod ffi; 追加 |

## 実装手順
1. Cargo.toml — [build-dependencies] 追加
2. wrapper.h — C ヘッダラッパー作成
3. build.rs — bindgen 設定スクリプト作成（関数抽出）
4. src/ffi/mod.rs — FFI モジュール作成
5. src/lib.rs — pub mod ffi; 追加
6. cargo check --lib で型検証
7. 生成バインディングのシンボル確認
8. cargo fmt
9. 既存テスト通過確認

## レビュー方法
1. run-quality-checks.js で静的品質チェック
2. 翻訳可能性 grep（名詞始まり関数・1文字変数・マジックナンバー）
3. cargo fmt --check
4. 生成バインディングの主要シンボル grep 確認

## リスク
- bindgen API 変更 → マイナーバージョン調整
- PJSIP 未インストール → PJSIP_INCLUDE_DIR 環境変数対応
- libclang 不在 → インストール手順をエラーメッセージで案内
