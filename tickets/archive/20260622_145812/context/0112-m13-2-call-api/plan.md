# 計画: チケット #112 — M13-2 発着信API

## 要件
RFC §8.5, §19, §19.1, §20, §38 準拠。SipClient に通話操作 8 メソッド追加。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/client.rs | 修正 | impl SipClient call API (8 methods) + 5 tests |
| crates/siprs/src/runtime/command.rs | 修正 | HangupReason pub に昇格 |

## 実装手順
1. import 追加 (CallState, DtmfMethod, OutgoingCallRequest, HangupReason, CallId)
2. SipClient に 8 methods 追加
3. answer コード制限: 180/183/200/486/603
4. HangupReason を pub に変更
5. テスト 5 件追加
6. cargo check + cargo test (0 warnings)

## レビュー方法
- run-quality-checks.js
- 翻訳可能性 grep
- 全テスト PASS
