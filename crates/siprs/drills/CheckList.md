# RFC 要件チェックリスト

> **⚠️ このファイルはスクリプトにより自動生成された雛形です。**
> AIが目視チェックし、補足事項・プロジェクト固有の制約を追記してから使用すること。

生成日時: 2026-08-27T02:26:30.931Z
DesignTree バージョン: 1

---

## 全体チェック

- [x] RFC全体にTBD / TODO / スタブ / 委譲 が0件であること
- [x] 全セクションにコードスニペットが含まれていること
- [x] DesignTreeの全ノードがRFCのいずれかのセクションに対応していること

---

## §1 raw SIP 生産経路の設計（vendored PJSIP < 2.13 制約） ✅

- [x] セクション全体が完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

### §1.1 raw SIP キャプチャ機構の選択（pjsip_module vs tpmgr recv_data_cb） ✅

- [x] **raw SIP キャプチャ機構の選択（pjsip_module vs tpmgr recv_data_cb）** が設計として完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


---

## §2 P1/P2 FFI コールバック登録スコープ（on_transport_state 等） ✅

- [x] セクション全体が完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §3 TestBackend の登録イベント発火と account_register example 完走 ✅

- [x] セクション全体が完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §4 CallEntry.state のネイティブ遷移反映（call_state 整合性） ✅

- [x] セクション全体が完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §5 CallResumed の発火設計（resume の観測手段） ✅

- [x] セクション全体が完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

### §5.1 CallResumed 実装機構（メディア状態遷移の検出） ✅

- [x] **CallResumed 実装機構（メディア状態遷移の検出）** が設計として完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


---

## §6 DtmfSent の意味論（PJSIP コールバック vs 500ms タイムアウト契約） ✅

- [x] セクション全体が完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §7 tap 駆動の生産経路（pjsua_conf_set_callback 欠如への対応） ✅

- [x] セクション全体が完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §8 文書化決定（マイク source 位置づけ / unsubscribe drop ベース） ✅

- [x] セクション全体が完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

### §8.1 unsubscribe のユーザーフレンドリーな API 設計 ✅

- [x] **unsubscribe のユーザーフレンドリーな API 設計** が設計として完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


---

<!-- AI補足欄: 上記チェック項目に加え、プロジェクト固有の制約・注意事項をここに追記すること -->

---

## AI 補足事項（目視検査による追記）

### 全体（全セクション共通）

- [x] **H1（pjsua-native ビルド修復）は実 FFI 経路の検証ゲート**。§1 / §2 / §5a / §7 の実機検証は `cargo build --features pjsua-native` 成功が前提。RFC 追補は §62.11 の bindgen 整合方針を参照し、実装チケットとの依存を明記すること
- [x] **破壊的変更は v0.x で受容**（round 2 方針と整合）: `CallResumed` のペイロード化、subscribe 系 API の戻り値変更（`Subscription<T>` 化）を伴う
- [x] 各セクションに **I/O 境界参照情報**（graphify / boundify 用）を含めること

### §1（raw SIP 生産経路）

- [x] **vendored PJSIP は 2.17.0（導入済み）**。`pjsua_callback.on_rx_msg` は 2.17 にも存在しない（実ヘッダ検証済み）。「PJSIP < 2.13」コメントは誤りなので更新すること
- [x] raw SIP は `pjsip_module.on_rx_request` / `on_rx_response` を `pjsip_endpt_register_module` で登録し、`pjsip_rx_data.pkt_info.msg` から raw バイトを `enqueue_raw_sip_bytes` へ供給
- [x] bindgen allowlist に `pjsip_module` 構造体・`pjsip_endpt_register_module` を追加する必要がある

### §2（P1/P2 コールバック登録）

- [x] `register_callbacks` は現状 `on_call_media_state` のみ。`on_transport_state` / `on_call_tsx_state` / `on_call_replaced` / `on_nat_detect` の 4 つを追加登録（**2.17 の `pjsua_callback` に全フィールド存在を確認済み**）
- [x] `m20_native_event_conv.rs` の「P1/P2 returns None」という stale doc comment を修正

### §3（TestBackend 登録イベント発火）

- [x] `TestBackend::set_registration` が `NativeEvent::RegistrationStateChanged` を発火し、reactor が `process_native_event` で処理して `account_register` example が TestBackend 上で完走すること
- [x] 実 FFI 経路（`on_reg_state2` → キュー → drain）と同じイベント系列になるよう、TestBackend のイベント供給経路を設計

### §4（CallEntry.state 整合性）

- [x] `process_native_event` の `CallStateChanged` アームで、publish と同一の変換結果を `CallEntry.state` の更新にも使用し、`call_state()` の stale を解消
- [x] `CallStateTables` は reactor 内で可変参照を共有しているため、更新順序（publish 前 / 後）を明記

### §5（CallResumed 実装）

- [x] `CallResumed` は unit variant → `CallResumed(CallResumedInfo { call_id })` へ変更（イベントは call_id を運ぶ）
- [x] `NativeEvent::CallMediaStateChanged` に `pjsua_call_media_status` を追加し、FFI ハンドラが `pjsua_call_get_media_status(call_id)` で取得
- [x] reactor が per-call の直前 status を追跡し、`LOCAL_HOLD` / `REMOTE_HOLD` → `ACTIVE` 遷移のみ `CallResumed` を publish（`ACTIVE` 自体は `MediaActive` を継続 publish）

### §6（DtmfSent 契約）

- [x] **PJSIP に DTMF 送信完了コールバックは存在しない**（`pjsua_call_send_dtmf` / `pjsua_call_dial_dtmf` は同期 `pj_status_t` 返却のみ、実ヘッダ検証済み）。500ms タイムアウトを正式契約として明記
- [x] `DtmfSent { Ok(()) }` の意味 = 「backend 受理 + タイムアウト経過で送出完了とみなす」と README / RFC に明記

### §7（tap 駆動）

- [x] **`pjsua_conf_set_callback` は 2.17 にも存在しない**（実ヘッダ検証済み）。`RustMediaPort` を custom `pjmedia_port` として `pjsua_conf_add_port` で登録
- [x] port ops（`get_frame` / `put_frame`）内で `push_media_frame` → `AudioTapSender::try_push`（非ブロック）を呼び、tap へ連続供給

### §8（文書化）

- [x] `open_default_microphone_source` は「注入可能なキャプチャ source（cpal による OS 既定入力の独立キャプチャ）」であり **通話マイクではない**旨を README に明記
- [x] `Subscription<T>` ハンドル型を導入し、`unsubscribe()` メソッド（内部 receiver の drop）を提供。`recv()` / `recv_async()` は委譲。`subscribe_account` のアカウントフィルタも Subscription 内で維持

### EXAMPLES（E1-E5 契約の再検証）

- [x] E2（account_register）: §3 により TestBackend 上で完走すること
- [x] E3（make_call）: §4 により `call_state()` がネイティブ遷移後も整合すること
- [x] E4（audio_tap）: §7 により tap が連続生産されること
- [x] E5（tts_source）: マイク source の位置づけ（§8）に沿った記述であること
---

## 検証記録（Step 1-9）

- [x] **rfc-evolution.js verify**: append-only ✅ / well-formedness ✅ / exit 0
- [x] TBD / TODO / STUB / 委譲表現: 0 件（追補 415 行を機械走査）
- [x] 全設計セクション（§62.22–62.29、Q1–Q8a 対応）にコードスニペット + I/O 境界あり
- [x] §62.21（スコープ）/ §62.30（I/O 参照表）は round 2 の §62.10 / §62.20 と同種の支援セクション（コード不要の構造的例外）
- [x] vendored PJSIP 2.17.0 の実ヘッダ検証を §62.21 / §62.22 に反映
