# RFC 要件チェックリスト

> **⚠️ このファイルはスクリプトにより自動生成された雛形です。**
> AIが目視チェックし、補足事項・プロジェクト固有の制約を追記してから使用すること。

生成日時: 2026-08-24T04:12:43.819Z
DesignTree バージョン: 1

---

## 全体チェック

- [x] RFC全体にTBD / TODO / スタブ / 委譲 が0件であること
- [x] 全セクションにコードスニペットが含まれていること
- [x] DesignTreeの全ノードがRFCのいずれかのセクションに対応していること

---

## §1 Public ClientConfig unification policy (RFC §10 type promoted, legacy config.rs retired) ✅

- [x] セクション全体が完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §2 STUN/TURN/ICE config type unification and Vec-ization ✅

- [x] セクション全体が完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §3 Backend selection mechanism (MockBackend vs PjsuaBackend feature gate) ✅

- [x] セクション全体が完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

### §3.1 Test double strategy after MockBackend deletion (cfg(test) SipBackend double vs module removal) ✅

- [x] **Test double strategy after MockBackend deletion (cfg(test) SipBackend double vs module removal)** が設計として完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


---

## §4 Event bus unification topology (reactor dispatch into client bus) ✅

- [x] セクション全体が完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §5 Registration state machine production wiring (typed state, register_on_start consumption) ✅

- [x] セクション全体が完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §6 Public API expansion scope (answer/reject, send_dtmf, hangup/cancel, unsubscribe) ✅

- [x] セクション全体が完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

### §6.1 API audit findings: add answer/hangup/hold/unhold/transfer/send_dtmf/call_state(call_id), unsubscribe decision ✅

- [x] **API audit findings: add answer/hangup/hold/unhold/transfer/send_dtmf/call_state(call_id), unsubscribe decision** が設計として完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §6.2 call_state signature reconciliation (RFC per-call call_state(call_id) vs existing list call_state()) ✅

- [x] **call_state signature reconciliation (RFC per-call call_state(call_id) vs existing list call_state())** が設計として完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


---

## §7 Media path architecture (per-call AudioMixer, IN/OUT/BOTH routing, tap push, mic source) ✅

- [x] セクション全体が完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

### §7.1 Unified audio injection API with channel-direction flag (IN/OUT/BOTH) ✅

- [x] **Unified audio injection API with channel-direction flag (IN/OUT/BOTH)** が設計として完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


---

## §8 Shutdown sequence production wiring (ShutdownSpec, ClientShutdown event, command router) ✅

- [x] セクション全体が完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §9 Error conversion native_status preservation (M20 converters on production path) ✅

- [x] セクション全体が完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

<!-- AI補足欄: 上記チェック項目に加え、プロジェクト固有の制約・注意事項をここに追記すること -->

## AI 補足注記（設計判断の確定事項・プロジェクト固有制約）

### 全体
- [x] 追記セクションは既存 RFC の `Initial Design Artifact` ヘッダーを保持し、追補形式（既存節の末尾への追加 or 新節）で書くこと
- [x] 既存 GRAPH ノード（N0013 client_config_spec / N0025 registr_state_machine / N0034 audioworker_lifecycle / N0043 shutdown_specification / N0017 m20_runtime_command_error）への追補として整合させること
- [x] 各設計判断に I/O 境界参照情報（graphify/boundify が分割判断可能な入出力）を含めること

### §1–2 設定一本化
- [x] 旧 `src/config.rs` の `ClientConfig` / `StunServerConfig` は削除対象。`StunServerConfig` の二重定義（config.rs:71 と transport_ice_spec.rs:143）を一元化
- [x] `turn_servers: Vec<TurnServerConfig>` の型を STUN 型から修正（現行 `turn_server: Option<StunServerConfig>` は型バグ）
- [x] §13 の ICE 既定値（enabled=true / aggressive_nomination=true / max_host_candidates=16）に一致させる

### §3 バックエンド / TestBackend
- [x] MockBackend は**完全削除**（ユーザー指示: 実装過程のゴミ）。本番バイナリに Mock 参照を残さない
- [x] `cfg(test)` の TestBackend は `SipBackend` trait（§27a）実装で、`mock-backend` feature は作らない
- [x] reactor.rs:74-75 の無条件 Mock 生成を排除し、`#[cfg(feature="pjsua-native")]` で PjsuaBackend 選択

### §4 イベントバス
- [x] 単一 EventBus を SipClient が所有。reactor の `dispatch_event` が直接 publish（§15.6 一元化）
- [x] `RawSipEventConfig.enabled`（default true）に応じて raw_sip チャネルを生成（現行 None 固定を解消）
- [x] `subscribe_account` の account_id フィルタ死滅を解消（全イベントに account_id を付与する配線）

### §5 登録状態機械
- [x] `AccountEntry.registration` を typed `RegistrationState`（§33）に変更。初期値 `Disabled`/`Idle`
- [x] M20 変換器（m20_registr_cmd_pat.rs）→ `registr_state_machine.rs` の遷移駆動を production 配線
- [x] `register_on_start` をランタイム消費（更新→再登録/解除）。Mock の `"Registered"` ハードコード排除

### §6 公開 API
- [x] `reject` は独立 API でなく `answer(call_id, 486/603)` で実現（§19.1 の decline コード）。`is_valid_answer_code` を修正
- [x] `unsubscribe` は RFC §8.3 に明示 API がないため、**drop による購読解除を README に明文化**（明示 API は追加しない）
- [x] 現行 `call_state()` → `calls()` 改名。新設 `call_state(call_id) -> Result<CallState, SipError>`
- [x] `hold`/`unhold`/`transfer` も §19 要求のため追加対象（監査で発見）

### §7 メディア経路
- [x] `AddAudioSource{call_id, channels: ChannelSelector}` を新設。`ChannelSelector ∈ {In, Out, Both}`
- [x] per-call `AudioMixer` + 初期化時 `AudioWorkerTask` spawn（`AudioWorkerTask::spawn` を production から呼ぶ）
- [x] `AudioTapSender::push` を PjsuaBackend メディアコールバック（conf port put_frame）から呼ぶ
- [x] `open_default_microphone_source` の cpal-input feature 方針を確定（デフォルト feature 含めるか）

### §8 シャットダウン
- [x] `ShutdownSpec.execute_sequence` を reactor `Shutdown` アームから呼ぶ（PhaseTimeout 含む）
- [x] `ClientShutdown` イベント publish（§15.1 ライフサイクル系）
- [x] `ShutdownCommandRouter` を `is_shutting_down` ゲート付きでコマンド受信ループに接続

### §9 エラー変換
- [x] `SipError.native_status: i32` を保持。`error.rs:299-307` の None 設定を排除
- [x] M20 converter（m20_runtime_command_error.rs）を reactor 経路で呼び出し §14.1 テーブル準拠の写像に一元化