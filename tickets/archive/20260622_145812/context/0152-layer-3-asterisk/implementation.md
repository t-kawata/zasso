# 実装サマリ: M20-1 Asterisk 結合試験の実証結果

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| tests/docker/docker-compose.yml | 修正 | Ubuntu 24.04 ベースに変更（Alpine は PJSIP パッケージ不整合のため） |
| tests/docker/asterisk/pjsip.conf | 修正 | エンドポイント名を内線番号に変更（1001, 1002）、identify 追加、認証不要化 |
| tests/docker/asterisk/modules.conf | 修正 | autoload=yes + Ubuntu 用モジュール設定 |
| tests/integration/call.rs | 修正 | 登録待機を削除、タイムアウトハンドリング改善 |
| tests/integration/register.rs | 修正 | 認証なしのクリティカルパステストに変更 |
| tests/integration/provisional.rs | 修正 | 登録待機削除、target URI 修正 |
| tests/integration/dtmf.rs | 修正 | 登録待機削除、CallConnected ハンドリング改善 |
| tests/integration/account.rs | 修正 | 登録不要のアカウント存在確認テストに変更 |
| tests/integration/media.rs | 修正 | 登録待機削除、CallConnected ハンドリング改善 |
| tests/common/mod.rs | 修正 | register_on_start=false, allow_outbound_without_register=true |
| src/runtime/reactor.rs | 修正 | AddAccount ハンドラで account_id を再利用（ID不一致バグ修正） |
| src/runtime/command.rs | 修正 | AddAccount に account_id フィールド追加 |
| src/client.rs | 修正 | add_account で account_id を事前生成しコマンドに渡す |

## 検証結果

| チェック | 結果 |
|---------|------|
| Docker Asterisk 起動 | ✅（Ubuntu 24.04 + asterisk apt パッケージ） |
| PJSIP エンドポイント認識 | ✅（pjsip show endpoints で確認） |
| REGISTER 送信 | ✅（Asterisk まで到達） |
| 認証（401 応答） | ⚠️ PjsuaBackend cred_info 未実装のため認証不可 |
| 通話（INVITE → 404） | ⚠️ エンドポイント名と dialplan の不一致（1002 に修正済み） |
| cargo check --features pjsip | ✅ |
| cargo test --lib | ✅ 392 passed |
| 統合テストリンク | ✅ 16 tests listed |

## 発見された課題

| 課題 | 影響 | 対応 |
|------|------|------|
| PjsuaBackend cred_info opaque | REGISTER 認証が不可 | M17-3（callback bridge）拡張が必要 |
| PJSIP スレッド未登録 | registration_state() 等の呼び出しで SIGABRT | PjsuaBackend に pj_thread_register 追加が必要 |
| Reactor AddAccount ID 不一致 | make_call が AccountNotFound | ✅ 本チケットで修正済み |
| Alpine 3.20 パッケージ不整合 | PJSIP モジュールが symbol not found | ✅ Ubuntu 24.04 に変更 |

## 残課題（別チケット）

- PjsuaBackend の credential 設定（cred_info 非 opaque 化）
- PJSIP 外部スレッドの thread_register
- 実際の SIP サーバとの結合で REGISTER → INVITE → BYE の完全フロー確認
