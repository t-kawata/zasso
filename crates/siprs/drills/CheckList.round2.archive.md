# RFC 要件チェックリスト

> **⚠️ このファイルはスクリプトにより自動生成された雛形です。**
> AIが目視チェックし、補足事項・プロジェクト固有の制約を追記してから使用すること。

生成日時: 2026-08-26T01:50:32.452Z
DesignTree バージョン: 1

---

## 全体チェック

- [x] RFC全体にTBD / TODO / スタブ / 委譲 が0件であること
- [x] 全セクションにコードスニペットが含まれていること
- [x] DesignTreeの全ノードがRFCのいずれかのセクションに対応していること

---

## §1 本番バックエンド基盤: pjsua-native ビルド修復 + トランスポート生成配線 ✅

- [x] セクション全体が完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §2 登録・アカウント経路: register_on_start 自動登録 + remove_account の unregister 先行 + AccountRemoved publish ✅

- [x] セクション全体が完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §3 イベント経路の完成: FFI キュー drain + raw SIP publisher + P1/P2 変換器 ✅

- [x] セクション全体が完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §4 着信・通話イベント: IncomingCall CallEntry 登録 + answer 修正 + CallRejected 判断 + CallState 全遷移 ✅

- [x] セクション全体が完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §5 DTMF 実装整合: DtmfMethod 一元化 + method 反映 + DtmfSent{Ok} 経路 ✅

- [x] セクション全体が完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §6 メディア経路の完成: conf port コールバック + キュー消費/conf_connect + WAV・ファイル source ✅

- [x] セクション全体が完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §7 STUN/TURN/ICE 配線: stun_srv / turn_cfg / media_ice 反映 ✅

- [x] セクション全体が完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

### §7.1 coturn による TURN/STUN プロトコルレベルテスト設計 ✅

- [x] **coturn による TURN/STUN プロトコルレベルテスト設計** が設計として完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


---

## §8 Examples 設計: E1-E5 の確定 ✅

- [x] セクション全体が完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §9 Docker/Asterisk 実 SIP 統合テスト基盤（Layer 4 検証の必須化） ✅

- [x] セクション全体が完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

### §9.1 統合テストの配置と実行方式（crate/feature/ignore） ✅

- [x] **統合テストの配置と実行方式（crate/feature/ignore）** が設計として完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §9.2 Docker オーケストレーション方式（docker CLI/compose/testcontainers） ✅

- [x] **Docker オーケストレーション方式（docker CLI/compose/testcontainers）** が設計として完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §9.3 docker 可用性ゲートのスキップ意味論 ✅

- [x] **docker 可用性ゲートのスキップ意味論** が設計として完全に記述されている
- [x] コードスニペットが含まれている
- [x] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


---

## AI 補足事項（grill 決定に基づく横断的制約）

### 前提・ゲート

- [x] **pjsua-native ビルド修復（Q1）が本ラウンドの全実装の前提**である。§3–§7 の実配線（FFI drain / raw SIP / 着信 / DTMF / メディア / STUN-TURN-ICE）は pjsua-native 上でしか検証できない。integration test は `#![cfg(feature = "pjsua-native")]` でゲートされ、既定 `make test` の実行を壊さない。
- [x] **docker 可用性ゲートの横断適用**: 実 SIP（Asterisk）・実 TURN（coturn）の統合テストはすべて冒頭で docker 可用性をチェックし、不可時は `[SKIPPED: docker unavailable]` を明示ログしてスキップする（Q9c）。CI では docker が常に使用可能なため実質必須ゲート。

### 破壊的変更（v0.x で受容）

- [x] `RegistrationSucceeded` / `RegistrationFailed` を enum から完全削除し `RegistrationStateChanged` に統一する（Q2）。`examples/account_register.rs` を含む README / example の待ち受けイベントを修正する。
- [x] `CallRejected` を unified し「reject（486/603）は `CallDisconnected` で観測」に確定する（Q4）。`SipCall` の偽ドキュメント（「`answer_call()` で生成」）を修正する。
- [x] `DtmfMethod` を §20 準拠（Inband / Info / Rfc4733）の単一定義に一元化し、3 箇所の重複定義を解消する（Q5）。

### 検証保証

- [x] Asterisk との相互接続は **siprs→Asterisk の発信と、Callfile / Originate による Asterisk→siprs の着信の両方向**をテストする（Q4）。
- [x] coturn のプロトコルレベル検証は **STUN binding 成功 + TURN allocate 成功 + relay candidate 経由のメディア転送確認**まで含む（Q7a）。
- [x] `AudioChunkPair` → 指定 bit/hz のステレオ WAV 変換ユーティリティを実装し、subscribe_audio の完全記述を成立させる（Q6 / H13）。

### 記述の整合

- [x] 本ラウンドの追補は既存 §62（ラウンド 1）と重複・矛盾させず、§62.10 以降（または新 §63）として追記する。既存セクション（§12 / §17 / §18 / §19 / §20 / §27 / §28 / §43 / §44 等）への追補として位置付ける。
- [x] 各設計判断にコードスニペットと I/O 境界参照情報（graphify / boundify 用）を含める。
- [x] TBD / TODO / 「別バージョンで対応」を一切含めない。未実装のまま残す事項は記述自体を検証可能な範囲に限定し、実装チケットの依存関係を明記する。