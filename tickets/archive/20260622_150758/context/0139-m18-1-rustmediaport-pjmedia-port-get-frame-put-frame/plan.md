# M18-1: RustMediaPort — 実装計画

## 要件
PJSIP conference bridge と Rust AudioWorkerTask を接続する lock-free メディアポート。
RT callback 内では ArrayQueue pop/push + memcpy のみ。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| src/ffi/media.rs | 新規 | MAX_FRAME_BYTES/MediaFrame/PortDirection/RustMediaPort/PjmediaFrame + extern "C" + 8テスト |
| src/ffi/mod.rs | 変更 | pub mod media; 追加 |

## 実装手順
1. src/ffi/media.rs 作成
2. src/ffi/mod.rs 更新
3. cargo check -p siprs
4. cargo test（376→384）
5. cargo fmt

## レビュー方法
1. run-quality-checks.js
2. 翻訳可能性 grep
3. cargo fmt --check
## リスク
- extern "C" ABI不一致 → #[repr(C)] + SAFETY コメント
- ArrayQueue 競合 → crossbeam は lock-free で安全
