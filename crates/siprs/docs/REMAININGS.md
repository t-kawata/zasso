# siprs crate 残課題一覧

このドキュメントは siprs crate の M20 マイルストーン（統合テスト・受け入れ）完了後に
残ることが明らかになっている技術的課題を網羅する。各課題には発見経緯・背景・
影響範囲・解決の方向性を記載する。

> **注記**: このドキュメントは `/grill-me-for-rfc-ja` での議論のための一次情報源である。
> 各課題の優先順位付けと正式なチケット化は grill の結果に委ねる。

---

## 1. EventBus callback のイベント網羅性不足

### 背景

M17-3（callback bridge）で PJSIP の C callback を `NativeEvent` に変換する
パスは実装されたが、Reactor → EventBus へのパスは M20-1.7（#157）まで未完成だった。
#157 で `enqueue_native_event()` の送信が復活し、Reactor に `NativeEvent` ハンドラが
追加されたが、一部の NativeEvent → SipEventPayload 変換が未実装のままである。

### 未対応のイベント

| NativeEvent | 現状の Reactor ハンドラ | あるべき動作 |
|------------|------------------------|-------------|
| `RegistrationStateChanged { acc_id }` | `=> None` で捨てている | `pjsua_acc_get_info()` で登録状態を取得し `RegistrationSucceeded` / `RegistrationFailed` を publish |
| `RegistrationStarted { acc_id, renew }` | `RegistrationStarted {}` を publish（Info なし） | `RegistrationInfo` にアカウントID等を設定 |
| `CallStateChanged { call_id, state }` | state=1→Disconnected, state=3→Connected のみ対応 | state=0(NULL), state=2(CONNECTING) 等のハンドリング追加。各 state の意味は PJSIP の `pjsip_inv_state` enum 参照 |
| `CallMediaStateChanged { call_id }` | `_ => None` | `MediaActive` / `MediaStopped` / `MediaError` を publish |
| `DtmfDigit { call_id, digit }` | `DtmfReceived` を publish（Info なし） | digit の値を `DtmfReceivedInfo` に設定 |
| `CallTsxStateChanged`, `CallRedirected`, `CallTransferStatus`, `CallReplaced`, `TransportStateChanged`, `IceTransportError`, `NatDetected` | `_ => None` | 必要に応じて対応する SipEventPayload を publish |
| `on_dtmf_digit` の送信系 | 送信完了時に `DtmfSent` が発火するか未確認 | PJSIP の DTMF 送信完了 callback を確認 |

### 影響

- `register_succeeds` テストが `RegistrationSucceeded` を受信できずタイムアウト
- `call_normal_hangup` 等の通話テストが `CallConnected` / `CallDisconnected` を受信できない
- `dtmf::*` テストが `DtmfSent` は戻り値で確認可能だが `DtmfReceived` は受信できない
- 監視・運用ユースケースでイベントが欠落する

### 解決の方向性

1. Reactor の NativeEvent ハンドラで各イベントに対応する `SipEventPayload` を publish
2. `RegistrationStateChanged` は PjsuaBackend に `get_account_info()` メソッドを追加し、
   reactor 経由で PJSIP API を呼び出して登録状態を取得する
3. `CallStateChanged` の state 値は PJSIP の `pjsip_inv_state` に従い enum 化する

---

## 2. SipClient 公開 API の blocking_read 問題

### 背景

`SipClient::account()` および `SipAccountHandle::registration_state()` が
`tokio::sync::RwLock::blocking_read()` を使用している。このメソッドは
tokio ランタイムの async コンテキスト内から呼び出すとパニックする
（エラーメッセージ: "Cannot block the current thread from within a runtime"）。

### 発見経緯

M20-1（#150, #152）の統合テスト実装時に発見。`#[tokio::test]` 内で
`ctx.client.account(account_id)?.registration_state()?` を呼び出すと
テストプロセスがパニックで異常終了する。

### 影響範囲

以下のテストで上記 API を直接使用できない：

- `dual_account_simultaneous_call` — `account()` を経由せずハンドルを直接保持するワークアラウンド中
- `reregister_after_unregister` — `handle_1.register()` は問題ないが `account()` は使えない
- 一般ユーザーが tokio 環境から `account()` を呼び出すと同様にパニックする

### 現在の回避策

`TestContext` に `SipAccountHandle` を直接保持するフィールド
（`handle_1`, `handle_2`）を追加し、`account()` を経由せずに操作している。

### 解決の方向性

1. **推奨**: `account()` を async メソッドに変更し、`tokio::sync::RwLock::read().await` を使用する
   - ただしこれは破壊的変更であり、全ての呼び出し元に `.await` 追加が必要
2. **代替**: `tokio::sync::RwLock` を `std::sync::RwLock` に置き換える
   - tokio のブロッキング禁止制約から解放される
3. **部分対応**: 少なくとも `registration_state()` は state のコピーを返すだけなので
   `Arc<AtomicEnum>` 等で排他制御なしに読めるようにする

---

## 3. SipBackend::send_dtmf と DtmfSent イベントの二重管理

### 背景

`SipClient::send_dtmf()` は成功時に `Ok(())` を返すと同時に、PJSIP callback 経由で
`DtmfSent` イベントが EventBus に publish される可能性がある。現状は戻り値のみで
成功を判断しているが、統合テストでは `DtmfSent` イベントの受信も確認している。

### 問題点

- `send_dtmf` の戻り値は Reactor のコマンド完了を意味し、実際の DTMF 送出成功とは
  必ずしも一致しない（PJSIP が非同期で DTMF を送信するため）
- `DtmfSent` イベントがどの callback で発火されるか未確認（`on_dtmf_digit` は受信用）

### 解決の方向性

- PJSIP の DTMF 送信完了 callback を確認し、適切なタイミングで `DtmfSent` を emit する
- 統合テストでは `DtmfSent` イベントの受信をもって成功と判断する方針に統一する

---

## 4. SipClient の `account()` と reactor スレッド間の状態同期

### 背景

`SipClient::account()` は `tokio::sync::RwLock` で保護された `ClientState` を
読む。一方、Reactor スレッドも同じ `RwLock` を `blocking_write()` で書き込む。
この設計は現状問題なく動作しているが、以下のリスクがある。

### リスク

- `blocking_read()` と `blocking_write()` の同時呼び出しでデッドロック
  （tokio の RwLock は std の RwLock とは異なり、fair なロック取得順を保証しない）
- 大量の `account()` 呼び出しが reactor の書き込みを starvation させる可能性

### 解決の方向性

- 読み取りが多いことを考慮し、`RwLock` の代わりに `arc_swap` または
   immutable data structure の採用を検討する
- または `dashmap` ですでに導入されている並列 HashMap を state 管理にも活用する

---

## 5. 統合テストのプレースホルダー状態

### 該当テスト

| テスト | 現状 | 理由 |
|--------|------|------|
| `call::call_reject` | `eprintln!` でスキップ | 着信応答には双方向クライアントが必要 |
| `provisional::early_media_received` | `eprintln!` でスキップ | Asterisk Echo が 183 を送信しない |
| `register::reregister_after_unregister` | 一部未検証 | `account()` の blocking_read 問題 |

### 備考

実 SIP 環境（M20-2）または SipClient API の改善（課題2）が完了しないと
完全なテストが書けない。

---



## 6. subscribe_audio が未実装

### 背景

`SipClient::subscribe_audio()` に対応する `RuntimeCommand::SubscribeAudio` の
Reactor ハンドラが明示的に未実装とマークされている。

```rust
// runtime/reactor.rs
RuntimeCommand::SubscribeAudio { call_id, reply } => {
    let result = (|| -> Result<(), SipError> {
        let _ = call_id;
        Err(SipError::invalid_state(
            "SubscribeAudio: not implemented (see M18)",
        ))
    })();
```

そのため `subscribe_audio()` を呼び出しても常にエラーが返る。

### 発見経緯

M20-1.6（#156）の統合テスト実行時に `media::media_loopback_tap_active` テストが
`subscribe_audio` のエラーを握り潰してスキップしていることが判明。

### 影響

- `media_loopback_tap_active` — `AudioTapHandle` が取得できず、メディア検証が実質スキップ
- `media_tap_closes_on_hangup` — 同上
- `subscribe_audio` API を使用する全ユーザーが Runtime エラーを受け取る

### 解決の方向性

1. Reactor の SubscribeAudio ハンドラに実際の実装を追加する
2. PjsuaBackend に AudioTap の設定・管理ロジックを実装する
3. M18（メディアFFI）との連携を確認する（RustMediaPort と AudioBridge は実装済み）

---

## 7. PjsuaBackend の一部メソッドが未完成

### 背景

`PjsuaBackend` の `#[cfg(not(feature = "pjsip"))]` 側のスタブは期待通りの動作だが、
`#[cfg(feature = "pjsip")]` 側にも以下の問題がある。

### conf_connect / conf_disconnect がデッドコード

`PjsuaBackend::conf_connect()` / `conf_disconnect()` は実装されているが、
これらを呼び出す `RuntimeCommand` が存在せず、Reactor からも呼ばれていない。
実装はあるが実行パスが存在しないデッドコード状態である。

### configure_codecs が未調整

`configure_codecs()` は `pjsua_conf_adjust_rx_level()` の呼び出しのみで、
コーデックの有効化/無効化（`pjsua_codec_set_priority()`）を行っていない。
音声コーデックポリシー（PCMU/Opus only）の実現には追加実装が必要。

### 影響

- `conf_connect` / `conf_disconnect` は conference port 接続が必要なシナリオ
  （media loopback, 複数音声ソースのミキシング）で必要になる
- `configure_codecs` の不備により Opus のみの通話等が意図通り動作しない可能性がある

---

## 8. Docker 環境のドキュメント不足

### 現状のドキュメント

以下のファイルが存在するが、Docker の起動からテスト実行までの流れを
説明する包括的なドキュメントが不足している：

- `tests/docker/docker-compose.yml` — Asterisk 20.6.0 (Ubuntu 24.04)
- `tests/docker/asterisk/pjsip.conf` — エンドポイント設定
- `tests/docker/asterisk/extensions.conf` — ダイヤルプラン
- `tests/docker/asterisk/modules.conf` — 最小モジュール設定

### 不足している情報

- macOS での Docker Desktop セットアップ手順
- CI 環境（GitHub Actions）での Docker 実行方法
- トラブルシューティングガイド（Asterisk CLI デバッグ、SIP trace 採取）
- テスト失敗時の原因切り分け手順

---

## 9. macOS prebuilt ビルド手順の自動化不足

### 現状

`vendor/prebuilt/BUILD.md` に手動ビルド手順はあるが、CI での自動再ビルドは未整備。
PJSIP のバージョンアップ時に以下のカスタム変更の再適用が必要：

1. `pjlib/CMakeLists.txt` — `if(NOT APPLE)` で OpenSSL/GnuTLS/mbedTLS を除外
2. CMake 引数 — `-DSRTP_WITH_OPENSSL=OFF` の指定

### 解決の方向性

- GitHub Actions での prebuilt 自動ビルド pipeline
- または source build fallback を primary に昇格し prebuilt を廃止

## 参考: 解決済みの課題

| 課題 | 解決チケット | 内容 |
|------|------------|------|
| OpenSSL 依存 | #151 | macOS prebuilt を Apple Security Framework に切替 |
| credential 未設定 | #155 | `pjsip_cred_info` に認証情報を設定、`cred_count=1` |
| PJSIP thread 未登録 | #155 | `pj_thread_register("siprs-reactor")` 追加 |
| AddAccount ID 不一致 | #152 | Reactor が別 ID を生成していたバグ修正 |
| enqueue_native_event 未送信 | #157 | コメントアウト解除、RuntimeCommand 追加 |
| PjsuaBackend singleton | #158 | `OnceLock<Mutex<PjsuaBackend>>` 化 |
| thread_desc リーク | #158 | `Box::leak` をやめて `Box` に戻し |
| integration_test の pjsip feature 依存 | #156 | Cargo.toml に required-features 追加 |
