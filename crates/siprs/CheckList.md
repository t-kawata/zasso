# RFC 要件チェックリスト

> **⚠️ このファイルはスクリプトにより自動生成された雛形です。**
> AIが目視チェックし、補足事項・プロジェクト固有の制約を追記してから使用すること。

生成日時: 2026-06-22T01:24:48.268Z
DesignTree バージョン: 1

---

## 全体チェック

- [ ] RFC全体にTBD / TODO / スタブ / 委譲 が0件であること
- [ ] 全セクションにコードスニペットが含まれていること
- [ ] DesignTreeの全ノードがRFCのいずれかのセクションに対応していること

---

## §1 NativeEvent → SipEventPayload 変換の完全網羅設計 ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

### §1.1 RegistrationStateChanged は RuntimeCommand(GetAccountInfo) 経由で状態取得 ✅

- [ ] **RegistrationStateChanged は RuntimeCommand(GetAccountInfo) 経由で状態取得** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


---

## §2 公開APIの同期設計（blocking_read 問題の解決） ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §3 DTMF 送信結果のイベント設計（戻り値 vs DtmfSent 二重管理） ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §4 Reactor スレッド間状態同期の設計（RwLock 問題） ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §5 SubscribeAudio リアクターハンドラの実装設計 ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §6 PjsuaBackend メソッド完全化（conf_connect/codecs） ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

### §6.1 conf_connect RuntimeCommand 引数は CallId + CallMediaDirection で抽象化 ✅

- [ ] **conf_connect RuntimeCommand 引数は CallId + CallMediaDirection で抽象化** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §6.2 configure_codecs: 明示指定を基本とし、auto時のみ Opus優先=255/PCMU=254 ✅

- [ ] **configure_codecs: 明示指定を基本とし、auto時のみ Opus優先=255/PCMU=254** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


---

## §7 統合テスト補強戦略（プレースホルダー解決） ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

### §7.1 Dual Client: 同一PjsuaBackend singleton を複数Clientで共有 ✅

- [ ] **Dual Client: 同一PjsuaBackend singleton を複数Clientで共有** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


---

## §8 Docker/CI 環境整備とビルド自動化 ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## AI補足：プロジェクト固有の追加チェック項目

### 既存RFCとの整合性

- [ ] NativeEvent ↔ SipEventPayload 変換マッピングテーブル（全バリアントの対応表）が記述されていること
- [ ] 低優先度 NativeEvent（CallTsxStateChanged, CallRedirected, CallTransferStatus, CallReplaced, TransportStateChanged, IceTransportError, NatDetected）のマッピング方針（実装対象 or 意図的除外とその理由）が明記されていること
- [ ] `DtmfSentInfo` 構造体が定義されていること（Section 20 に追加。フィールド: method, digit, status(Result), pjsip_error_code 等を DtmfReceivedInfo と比較して設計すること）
- [ ] DtmfSent の発火元 PJSIP callback の調査結果が RFC に反映されていること（`on_dtmf_digit` の送信完了時の挙動、または別 callback の特定）
- [ ] `RuntimeCommand` enum に `ConfConnect` / `ConfDisconnect` / `GetAccountInfo` の3バリアントが追加されていること
- [ ] Section 27.3（callback bridge）に Dual Client 時の PJSIP callback routing 方式が追記されていること（単一 Reactor + EventBus 分割構成、account_id ベースの EventBus 振り分け）
- [ ] `RuntimeCommand` の `ConfConnect` / `ConfDisconnect` の引数が `(CallId, CallMediaDirection)` で抽象化され、conf_port_id の解決は PjsuaBackend 内部で行う設計が記述されていること
- [ ] Section 33（ランタイム内部state）に以下の3点が明記されていること：(1) Client 側は `read().await` を使用し `blocking_read()` を禁止、(2) shutdown 中は GetAccountInfo のみ許可・conf_connect/disconnect は拒否、(3) conf_port_id は CallEntry ではなく PjsuaBackend 内部で管理
- [ ] Section 29（codec policy）に明示指定と auto 時の Opus優先フォールバックの2層ポリシーが記述されていること
- [ ] Section 14（エラー設計）に新 RuntimeCommand のエラーは既存バリアント（InvalidState / NotFound / InternalError）で兼用する方針が明記されていること
- [ ] Section 22（音声購読API）に Reactor の `SubscribeAudio` ハンドラ実装経路（RuntimeCommand → conf_connect → RustMediaPort）が追記されていること。`AudioTapMode` が conf_connect のチャネル設定にどう反映されるかも含むこと
- [ ] Section 20（DTMF仕様）に DtmfSent の発火条件（PJSIP callback 優先、不在時は 500ms タイムアウトベース）が記述されていること
- [ ] Section 43（テスト戦略）に各新機能のテスト層マッピングが追記されていること。以下の対応が明記されていること：
  - イベントマッピング（Layer 2: MockBackend）
  - RegistrationStateChanged（Layer 2: MockBackend、Layer 3: Asterisk）
  - conf_connect / SubscribeAudio（Layer 3: SIP Integration）
  - configure_codecs（Layer 2: MockBackend）
  - Dual Client（Layer 3: SIP Integration）
- [ ] Section 43（テスト戦略）に call_reject / early_media / reregister の解決条件と Dual Client utility 設計が追記されていること
- [ ] Section 44（CI/CD）に Docker テスト job と prebuilt CI pipeline の設計が追記されていること

### コードスニペット要件

- [ ] RegistrationStateChanged ハンドラ（NativeEvent → RuntimeCommand::GetAccountInfo 発行 → RegistrationSucceeded/Failed publish の流れ）のコードスニペット
- [ ] CallStateChanged ハンドラの pjsip_inv_state マッピング（state値 → CallState 変換）のコードスニペット
- [ ] CallMediaStateChanged ハンドラの pjsua_call_get_info().media_status 判定（MediaActive/MediaStopped/MediaError の分岐）のコードスニペット
- [ ] 低優先度 NativeEvent（CallTsxStateChanged, CallRedirected, CallTransferStatus, CallReplaced, TransportStateChanged, IceTransportError, NatDetected）の全マッピング対応表のコードスニペット
- [ ] DtmfSent 発火タイミング（戻り値=コマンド受理 vs DtmfSent=送出完了 の分離）のコードスニペット
- [ ] SubscribeAudio ハンドラ（RuntimeCommand → conf_connect → AudioTapHandle 生成。AudioTapMode の conf_connect チャネル設定への反映を含む）のコードスニペット
- [ ] Dual Client テスト utility（同一 PjsuaBackend singleton 共有 + EventBus 分割 routing）のコードスニペット
- [ ] conf_port_id 解決（PjsuaBackend 内部で CallId → conf_port_id 変換）のコードスニペット
- [ ] Shutdown 中 command 振り分け（GetAccountInfo 許可 / conf_connect/disconnect 拒否）のコードスニペット
- [ ] DtmfSent タイムアウトフォールバック（500ms タイマー経由の発火）のコードスニペット
- [ ] configure_codecs auto 時（pjsua_codec_set_priority 呼び出し）のコードスニペット

### 言語プロトコル準拠（CLAUDE.md）

- [ ] コードコメントは日本語であること
- [ ] `log::info!` 等のランタイムログは英語であること
- [ ] RFC の説明文は日本語で記述すること

### ゼロトレランス項目

- [ ] `[::STUB::]` 未付与の不完全実装がコードベースに存在しないこと（該当する場合は Malfeasance 犯罪として記録すること）
- [ ] `todo!()` / `unimplemented!()` / `panic!()` の新規投入がないこと
- [ ] 追記後に `make check-be` がパスすること（コードスニペットの構文が正しいこと）

---

> **注記**: 上記はスクリプト生成後に AI が目視補足した項目です。DesignTree の全18ノードに対応する §1〜§8 の各チェック項目と合わせてご確認ください。