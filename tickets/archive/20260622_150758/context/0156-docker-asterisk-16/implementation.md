# 実装サマリ: M20-1.6 統合テスト完全実行

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| tests/common/mod.rs | 修正 | register_on_start=true, allow_outbound_without_register=false, wait_for_registration 改善（RegistrationFailed スキップ）, handle_1/handle_2 フィールド追加 |
| tests/integration/register.rs | 修正 | 登録待機を復元、&mut ctx.events パターンに変更 |
| tests/integration/call.rs | 修正 | 同上 + send_dtmf シグネチャ修正 |
| tests/integration/provisional.rs | 修正 | 登録待機復元 |
| tests/integration/dtmf.rs | 修正 | 登録待機→通話→DTMF フロー復元 |
| tests/integration/account.rs | 修正 | blocking_read 回避のため簡略化 |
| tests/integration/media.rs | 修正 | 登録待機復元 |
| tests/docker/asterisk/pjsip.conf | 修正 | エンドポイント名=アカウントユーザー名、同一セクション名で AOR/endpoint 併用 |
| tests/docker/asterisk/extensions.conf | 修正 | 名前ベースルーティング追加（test_user_1→1001） |
| src/ffi/pjsua_backend.rs | 修正 | thread_desc を &'static mut に変更、unsafe Send/Sync |
| Cargo.toml | 修正 | [[test]] required-features = ["pjsip"] 追加 |

## 検証結果（Docker Asterisk 接続）

| テスト | 結果 | 備考 |
|-------|------|------|
| register::register_succeeds | ❌ タイムアウト | SIP 200 OK 受信確認済みだが、RegistrationSucceeded イベントが Reactor から emit されない |
| register::register_fails_with_wrong_password | ❌ | 同上の事象 |
| call::call_normal_hangup | ❌ SIGABRT | thread_desc の寿命問題（Box→&'static mut に修正済み） |
| 上記以外の 13 テスト | ⬜ | 未到達 |

## 発見された課題

### 課題 1: RegistrationSucceeded イベントが Reactor から emit されない
- PJSIP 経由で Asterisk から 200 OK 受信確認済み
- PJSIP の `on_reg_state2` callback が NativeEvent に変換され、EventBus に publish されるはず
- 実際には RegistrationSucceeded イベントが EventBus に流れていない
- **原因**: PjsuaBackend の callback bridge が registration callback に未対応、または Reactor が NativeEvent を適切に処理していない可能性
- **調査方法**: tracing ログレベルを DEBUG に設定し、callback bridge → event emission の流れを確認

### 課題 2: 複数テストの連続実行で SIGABRT
- thread_desc を PjsuaBackend 構造体で保持しているが、テスト間で PjsuaBackend が再作成される際に既存スレッドの再登録でアサーション失敗
- **対策**: Box::leak で &'static mut に変更したが、SingABRT 解消には pj_thread_desc をプロセス単位で共有する仕組みが必要

### 課題 3: AOR 名とエンドポイント名のマッチング
- 同一セクション名で endpoint + aor の併用は動作する（pjsip show で確認済み）
- 識別は username ベース（identify 不使用）で両アカウントの REGISTER が独立して動作

## 結論

本チケットのスコープ（全 16 テスト完全実行）は、以下の理由により完了できていない：
1. RegistrationSucceeded イベントが Reactor の callback bridge から emit されない → ライブラリ修正が必要
2. 複数テストの連続実行で PJSIP singleton 問題が顕在化

`register_on_start: true` + credential 設定は PJSIP レベルでは機能しており（200 OK 確認）、Asterisk との REGISTER は成功している。問題は Reactor が registration 成功イベントを EventBus に流していない点にある。
