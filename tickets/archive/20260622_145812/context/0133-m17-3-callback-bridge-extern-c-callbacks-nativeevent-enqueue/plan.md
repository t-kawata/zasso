# M17-3: Callback bridge — 実装計画

## 要件
PJSIP C callback 群を Rust reactor に接続。NativeEvent / global_runtime /
catch_callback_panic / register_callbacks の4本柱。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| src/ffi/callbacks.rs | 新規 | NativeEvent / PjsuaCallback / global_runtime / catch_callback_panic / enqueue_native_event / register_callbacks / extern "C" 関数 + 9 テスト |
| src/ffi/mod.rs | 変更 | pub mod callbacks; 追加 |
| src/runtime/reactor.rs | 変更 | set_global_runtime() 呼び出し追加 |

## 実装手順
1. src/ffi/callbacks.rs 作成
2. src/ffi/mod.rs 更新
3. src/runtime/reactor.rs 更新（set_global_runtime）
4. cargo check -p siprs
5. cargo test（360→369 tests）
6. cargo fmt

## レビュー方法
1. run-quality-checks.js
2. 翻訳可能性 grep
3. cargo fmt --check
## リスク
- extern "C" シグネチャ不整合 → #[repr(C)] + PJSIP 2.17 仕様準拠
- OnceLock 二重 set → Result 返却
- テスト分離 → take → set パターン
