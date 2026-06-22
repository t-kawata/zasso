# M17-4: PjsuaBackend — 実装計画

## 要件
SipBackend trait の本番実装 PjsuaBackend を新規作成。全14メソッド + pj_status_t変換 + codec policy。
PJSIP不在時は #[cfg] スタブでコンパイル維持。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| src/ffi/pjsua_backend.rs | 新規 | PjsuaBackend + impl SipBackend(14) + pj_status_to_sip_error + codec_prio定数 + 7テスト |
| src/ffi/mod.rs | 変更 | #[cfg(feature="pjsip")] pub mod pjsua_backend; |
| src/runtime/reactor.rs | 変更 | 全16未処理コマンドのdispatch実装 |
| Cargo.toml | 変更 | [features] pjsip = [] 追加 |

## 実装手順
1. Cargo.toml — pjsip feature 追加
2. src/ffi/pjsua_backend.rs — PjsuaBackend + cfg実装
3. src/ffi/mod.rs — module宣言
4. src/runtime/reactor.rs — dispatch拡張
5. cargo check -p siprs
6. cargo test（376 tests）
7. cargo fmt

## レビュー方法
1. run-quality-checks.js
2. 翻訳可能性 grep
3. cargo fmt --check
## リスク
- manual extern "C" ABI不一致 → SAFETY + 後日bindgen検証
- cfg組み合わせ漏れ → cargo check --features pjsip で確認
