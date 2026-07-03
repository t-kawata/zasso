---
tree:
  level: child
  childId: "01"
  childName: siprs — SIP Client Core Library
slug: siprs-core
canonicalRfcPath: ../RFC-ROOT.md
canonicalRfcSection: "§1-§51（コア設計）, §58（バージョニング）, §59（ネットワーキング）, §60（既存セクション対応表）"
ioSchema: "pub struct SipClient { /* Clone + Send + Sync の公開ハンドル */ }
pub struct SipAccountHandle { /* アカウント単位操作 */ }
pub struct EventBus { /* 制御系 + RawSIP の分離バス */ }
pub enum SipEventPayload { /* 35 バリアントの全イベント */ }
pub trait AsyncAudioSource { /* 動的音声注入 trait */ }
pub struct AudioChunkPair { /* IN/OUT 整列済み音声バッファ */ }
pub enum SipError { /* kind + message + native_status + retryable */ }
pub(crate) trait SipBackend { /* PJSIP/Mock 差し替え内部 trait */ }"
decouplingMethod: "pub trait SipBackend（内部 abstraction）+ cargo test 時の MockBackend 注入。siprs-server からの依存は pub API（SipClient, EventBus, SipEventPayload）経由のみ。HTTP 依存は一切持たない。"
dependencyOn: []
---

# RFC: siprs — SIP Client Core Library

<!--
===== Anchor Marker System =====
このファイルの一部のセクションには「機械転記ブロック」として、
親RFC（../RFC-ROOT.md）から機械的に転記された内容が含まれている。
機械転記ブロックは開始マーカーと終了マーカー
で囲まれており、generate-child-rfcs.js の再実行で自動更新される。

機械転記ブロック以外の記述（AI記述部）は維持される。機械転記ブロックの
内容を変更する場合は、必ず親RFCの該当マーカー範囲を編集した上で
generate-child-rfcs.js を再実行すること。
===============================
-->

## 責務

<!-- 機械転記ブロック（generate-child-rfcs.js が更新。自動管理のため直接編集禁止） -->
## 1. 目的

本 crate の目的は、Rust から PJSUA を安全かつ非同期的に利用し、複数 SIP アカウント、複数トランスポート、発着信、音声処理、DTMF、ICE/TURN/STUN、TLS、SRTP、およびアプリケーション統合向けイベント配信を、tokio ネイティブな API で提供することである。映像機能は対象外であり、音声のみに責務を限定する。

### 設計判断の補足

**単一 crate 選択の背景（§6.1）**: 本 crate は SIP signalling、media bridge、audio processing、event bus
を単一の `siprs` crate に同居させる。これは将来の分割可能性を否定するものではなく、PJSIP の密結合性と
通話・メディアの不可分性という実装上の制約に基づく意図的判断である。特に `pjsua_call_hangup()` 1回の呼び出しで
signalling と media の両方が終了するため、crate 境界を跨ぐ整合性管理のコストが分離のメリットを上回る。

**SipBackend trait によるテスト容易性の確保**: 内部 trait `SipBackend` を導入し、本番用 `PjsuaBackend` と
テスト用 `MockBackend` を差し替え可能にすることで、PJSIP の初期化を必要としない高速な状態機械テスト（Layer 2）
を実現する。RuntimeCommand の処理・イベント変換・状態遷移の全パターンを PJSIP 非依存で検証できることが、
TDD による安定した実装の基盤となる。

**EventBus の分離設計（§15.4）**: 制御系イベント（SipEvent）と Raw SIP メッセージ（RawSipMessage）を
別個の broadcast channel で配送する。RawSIP 有効時に高頻度の SIP メッセージが制御系イベントを圧迫することを
防止し、アプリケーションの状態管理に必須の制御系イベントの取りこぼしを回避する。

### 実装上の注意点

- **unsafe コードの隔離**: `ffi/` モジュールのみが unsafe ブロックを含む。`runtime/` 以上の層では
  unsafe を一切使用せず、SipBackend trait の安全な Rust API を介して PJSIP と通信する。
- **callback bridge の制約**: PJSIP の C callback 内ではロック獲得・メモリ確保・async 待機を禁止する。
  callback の責務は NativeEvent の生成と MPSC channel への enqueue のみに限定する。
- **Reactor の単一スレッド保証**: Reactor スレッドは PJSIP のスレッド安全制約（特定の pjsua_* API は
  同一スレッドからの呼び出しが必要）を満たすために単一スレッドで動作する。この設計は〜30同時通話までの
  Tauri デスクトップアプリ想定範囲では十分なスループットを持つ。
- **lock-free queue の選択（§39）**: AudioWorkerTask と PJSIP audio callback の境界には
  `crossbeam::ArrayQueue` を使用する。PJSIP の audio callback はリアルタイムスレッドで実行されるため、
  Mutex によるブロッキングは許容されない。
<!-- /機械転記ブロック -->

## I/O境界

<!-- 機械転記ブロック（generate-child-rfcs.js が更新。自動管理のため直接編集禁止） -->
## 1a. M20 実装優先度マップ

M20 追補の全実装項目を実装順序の優先度とともに整理する。
各項目の詳細設計は後方の該当 `### M20 追補:` セクションに記述されている。
優先度は実装着手の目安であり、上位優先度の完了を下位の前提とはしない（並行着手可能な項目を含む）。

| 優先度 | 実装項目 | 設計判断 | 既存コード影響範囲 |
|--------|---------|---------|------------------|
| **P0** | NativeEvent → SipEventPayload 変換（Registration/Call/DTMF系） | Q1:A | `runtime/reactor.rs` — `process_native_event()` |
| **P0** | RegistrationStateChanged の RuntimeCommand::GetAccountInfo | Q8:B | `runtime/reactor.rs` + RuntimeCommand enum |
| **P0** | DtmfSentInfo 構造体定義と DtmfSent 発火実装 | Q2:A, Q14:A | `event.rs` + `runtime/reactor.rs` |
| **P0** | `account()` / `registration_state()` の `blocking_read` → `read().await` 修正 | Q3:A | `client.rs` + `account.rs` |
| **P1** | SubscribeAudio Reactor ハンドラ実装（conf_connect 経路） | Q2:A, Q5:B, Q10:B | `runtime/reactor.rs` + `backend/pjsua.rs` |
| **P1** | RuntimeCommand::ConfConnect / ConfDisconnect 新設 | Q3:A, Q5:B, Q11:B | RuntimeCommand enum + `runtime/reactor.rs` |
| **P1** | configure_codecs auto モード（Opus=255, PCMU=254） | Q7 | `backend/pjsua.rs` — `configure_codecs()` |
| **P1** | CallStateChanged 全 pjsip_inv_state 対応 | Q1:A | `runtime/reactor.rs` — CallState 変換 |
| **P1** | CallMediaStateChanged → MediaActive/Held/Error 変換 | Q1:A | `runtime/reactor.rs` — media_status 判定 |
| **P2** | Shutdown 中 command 振り分け（GetAccountInfo 許可） | Q12:C | `runtime/reactor.rs` — `dispatch_command()` |
| **P2** | EventBus 分割 + account_id ベース routing（Dual Client 基盤） | Q9:A | `runtime/reactor.rs` + `event.rs` |
| **P2** | Transport/ICE 系 NativeEvent 変換（重要度P1） | Q1:A | `runtime/reactor.rs` |
| **P2** | Dual Client TestContext utility | Q6:A | `tests/` |
| **P3** | Docker Integration Test Job (GitHub Actions) | Q4:A | `.github/workflows/` |
| **P3** | Prebuilt Refresh Pipeline | Q4:A | `.github/workflows/` + `vendor/prebuilt/` |
<!-- /機械転記ブロック -->

## 親との関係

根拠: §1-§51（コア設計）, §58（バージョニング）, §59（ネットワーキング）, §60（既存セクション対応表）

<!-- 機械転記ブロック（generate-child-rfcs.js が更新。自動管理のため直接編集禁止） -->
## 2. 非目的

本 crate は SIP サーバ実装、PBX 実装、独自 RTP スタック、録音ファイル書き出し機構、GUI、永続設定保存、通話課金、映像処理を提供しない。録音については `AudioChunkPair` の提供に留め、ファイルコンテナ化は利用側責務とする。

### 2.1 Tauri（フロントエンド）統合との責務境界

本 crate は Rust ネイティブの crate であり、Tauri の `tauri::ipc::Channel` や JavaScript との通信機構を提供しない。Tauri アプリケーションに統合する際は、以下の責務境界を明確にする。

**本 crate の責務範囲**:
- Rust 公開 API（`SipClient`, `SipEventPayload` 等）の提供。
- `tracing` による構造化ログ出力。Tauri の `tracing-subscriber` との統合は利用者側で行う。
- `serde::Serialize` / `Deserialize` は util 型を除き optional feature（`serde`）として提供する。`SecretString`（secrecy crate）のシリアライズは常に `"***REDACTED***"` となる。

**利用者（Tauri プラグイン層）の責務**:
- `SipEventPayload` をフロントエンドに流すための DTO（Data Transfer Object）への変換。
- `AudioChunkPair`（バイナリデータ）の効率的な転送（例: `tauri::ipc::Channel` 経由の Base64 エンコード、または共有メモリ参照）。
- `std::time::Instant`（`PairAligner` 内部使用）を外部に露出しないこと。タイムスタンプは `SystemTime` に変換してから DTO に格納する。
- フロントエンドからの操作コマンド（発信ボタン、着信応答等）を本 crate の Rust API へ変換するアダプタ層。
<!-- /機械転記ブロック -->

## 依存関係

<!-- 機械転記ブロック（generate-child-rfcs.js が更新。自動管理のため直接編集禁止） -->
## 4. 準拠要件

クレートは Rust 1.95 以上を MSRV とし、tokio を唯一の公開非同期ランタイム前提とする。PJSIP は **2.17** を正本バージョンとして固定する。patch version の更新は CI で互換性確認の上で追従するが、minor version の変更は別途評価判断とする。対象 OS は Windows x86_64、macOS arm64、Ubuntu x86_64 とし、ビルド時にプレビルド優先・欠損時ソースビルドという二段階戦略を採用する。

### 4.1 バージョニングポリシー

本 crate は以下のバージョニングポリシーに従う。

**0.x フェーズ（開発初期）**:
- API は semver に厳密には準拠しない。必要に応じて破壊的変更を行い、安定化を優先する。
- パブリック API の変更は `CHANGELOG.md` およびマイグレーションガイドで明示する。
- `SipEventPayload` のバリアント追加は破壊的変更と見なさない（`#[non_exhaustive]` によりマッチングは網羅的でなくてもよい）。

**1.0 以降（安定化フェーズ）**:
- semver に厳密に準拠する（MAJOR.MINOR.PATCH）。
- **MAJOR**: パブリック API の破壊的変更（enum バリアントの削除・リネーム、struct フィールドの削除、trait メソッドのシグネチャ変更）。
- **MINOR**: 後方互換のある機能追加（enum バリアントの追加、struct フィールドの追加、新 trait の追加）。`SipEventPayload` の拡張も MINOR 範囲。
- **PATCH**: バグ修正・リファクタリング・内部最適化。公開 API の変更は一切含めない。

**破壊的変更が許容される例外**:
- セキュリティ脆弱性の修正に必要な場合（MAJOR を待たずに PATCH で対応し、CHANGELOG に明記）。
- `SipClient::new()` のタイムアウトやリトライ動作の変更など、コンパイル時の型互換性に影響しない動作変更は PATCH 範囲とする。


<!-- /機械転記ブロック -->
