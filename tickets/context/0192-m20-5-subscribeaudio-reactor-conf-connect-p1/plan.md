# M20-5: SubscribeAudio Reactor ハンドラ — conf_connect 統合（P1） — 実装計画

## 要件
SipClient::subscribe_audio() の Reactor 側実装を完了する。RuntimeCommand 拡張、Reactor ハンドラ実装、ConfConnect 統合を行う。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|----------|------|------|
| runtime/command.rs | 変更 | RuntimeCommand::SubscribeAudio に format/capacity/mode 追加、戻り値型変更、reply→reply_tx リネーム |
| runtime/reactor.rs | 変更 | SubscribeAudio ハンドラ実装、reject_command 更新、dead_code 削除 |
| client.rs | 変更 | subscribe_audio() を reactor 経由の send_and_wait に変更 |
| runtime/reactor.rs (tests) | 追加 | SubscribeAudio 正常系・異常系テスト（MockBackend） |

## Boy Scout 改善
- runtime/reactor.rs:473 誤ったコメント "(see M18)" を削除
- runtime/command.rs:164-167 reply → reply_tx リネーム（命名統一）
- client.rs:507 let _ = (call_id, format, mode, tx) 削除

## テスト計画
MockBackend を使用。6テストケース（正常系2、異常系2、境界値1、トレース1）

## 実装手順
1. command.rs: RuntimeCommand::SubscribeAudio 拡張
2. reactor.rs: ハンドラ実装 + reject_command 更新
3. client.rs: subscribe_audio を send_and_wait 化
4. コンパイル確認
5. テスト追加
6. 全テスト通過確認

## 物理的レビュー
cargo check → cargo test → run-quality-checks.js → Malfeasance 確認
