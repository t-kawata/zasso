# 計画: チケット #111 — M13-1 SipAccountHandle アカウント単位操作

## 要件
RFC §8.4 準拠。SipAccountHandle に6メソッド追加。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/client.rs | 修正 | impl SipAccountHandle (6 methods) + ensure_not_shutdown + [::STUB::]除去 + 7 tests |
| crates/siprs/src/runtime/command.rs | 修正 | UpdateAccountConfig バリアント追加 |
| crates/siprs/src/runtime/reactor.rs | 修正 | reject_command に UpdateAccountConfig 追加 |

## 実装手順
1. command.rs: UpdateAccountConfig 追加
2. reactor.rs: reject_command に UpdateAccountConfig arm 追加
3. client.rs: SipAccountHandle 6 methods + ensure_not_shutdown()
4. [::STUB::] + #[allow(dead_code)] 除去
5. テスト 7件追加
6. cargo check + cargo test (0 warnings)

## レビュー方法
- run-quality-checks.js
- 翻訳可能性 grep
- 全テスト PASS
