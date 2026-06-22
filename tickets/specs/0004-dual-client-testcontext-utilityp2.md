---
ticket_id: 4
title: Dual Client TestContext utility（P2）
slug: dual-client-testcontext-utilityp2
status: reviewed
created_at: 2026-06-22
updated_at: 2026-06-22
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0004-dual-client-testcontext-utilityp2/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0004-dual-client-testcontext-utilityp2/review.md
plan_path: /Users/shyme/shyme/zasso/tickets/context/0004-dual-client-testcontext-utilityp2/plan.md
---
# Dual Client TestContext utility（P2）

## Summary

2 つの `SipClient` インスタンス（client_a / client_b）と各アカウントを管理する `DualClientContext` 構造体を提供する。Dual Client アーキテクチャ（RFC02 §8）のテストを効率的に記述するための TestContext ユーティリティである。`client_a → client_b` の通話確立を 1 メソッドで行う高レベルヘルパーを実装し、dual account simultaneous call や双方向メディアテストの記述コストを削減する。

## Background

現在の結合テストは `TestContext`（単一 SipClient + 2 アカウント）のみを提供しており、dual client シナリオ（別々の SipClient インスタンス間の通話）をテストするには各テスト関数内で毎回以下のボイラープレートを記述する必要がある：

1. 2 つめの `SipClient` の生成（既存の `GLOBAL_RUNTIME` 再利用）
2. 2 つめの EventBus の購読
3. 2 つめのアカウント設定と登録
4. アカウント A → B の通話確立とイベント待機
5. テスト終了時の後片付け

M20-7（EventBus 分割 + account_id routing）により、複数の SipClient が同一 PjsuaBackend singleton を共有しながら独立したイベントストリームを持つ基盤が整った。本チケットはその上に **dual client テスト専用のユーティリティ** を構築し、テストコードの記述量を削減すると同時に、共通パターンでのバグ混入を防ぐ。

### 設計制約（RFC02 §8.3 準拠）

- `GLOBAL_RUNTIME` の `OnceLock` 機構は変更しない（単一 Reactor 維持）
- DualClientContext は `tests/` 専用のテストユーティリティであり、`siprs` クレートの公開 API には含めない
- 既存の単一 Client テストに影響を与えない（後方互換性）
- 全メソッドは `#[tokio::test]` との併用を前提とした同期関数（`SipClient` の API が同期的なため）

## Scope

### 実装範囲

1. **`tests/common/dual_client.rs`** — `DualClientContext` 構造体と関連ヘルパー実装

   `DualClientContext` struct:
   - `client_a: SipClient`
   - `client_b: SipClient`
   - `account_a: AccountId`
   - `account_b: AccountId`
   - `handle_a: SipAccountHandle`
   - `handle_b: SipAccountHandle`
   - `events_a: broadcast::Receiver<SipEvent>`
   - `events_b: broadcast::Receiver<SipEvent>`

   コンストラクタ:
   - `DualClientContext::new(config_a, config_b, account_cfg_a, account_cfg_b) -> Result<Self, SipError>`:
     - 2 つの SipClient を生成（2 つめは既存 GLOBAL_RUNTIME を再利用）
     - 各 Client にアカウントを追加し `SipAccountHandle` を保持
     - 各 Client から subscribe したイベントレシーバーを保持

   通信操作:
   - `call_a_to_b(&self, target_uri: impl Into<String>) -> Result<CallId, SipError>`
     - client_a から client_b のアカウントに発信
     - `OutgoingCallRequest` は `target_uri` とデフォルトの `media` 設定で構築
   - `answer_b(&self, call_id: CallId, code: u16) -> Result<(), SipError>` — client_b が着信応答
   - `hangup_a(&self, call_id: CallId, reason: HangupReason) -> Result<(), SipError>`
   - `hangup_b(&self, call_id: CallId, reason: HangupReason) -> Result<(), SipError>`

   イベント待機ヘルパー（`&mut self` — `Receiver` が可変参照を要求）:
   - `wait_for_event_a<F>(&mut self, predicate: F) -> Result<SipEvent, SipError>` — 既存の `wait_for_event` をラップ
   - `wait_for_event_b<F>(&mut self, predicate: F) -> Result<SipEvent, SipError>`
   - `wait_for_call_incoming_a(&mut self) -> Result<SipEvent, SipError>`
   - `wait_for_call_incoming_b(&mut self) -> Result<SipEvent, SipError>`
   - `wait_for_call_connected_a(&mut self) -> Result<SipEvent, SipError>`
   - `wait_for_call_connected_b(&mut self) -> Result<SipEvent, SipError>`
   - `wait_for_call_disconnected_a(&mut self) -> Result<SipEvent, SipError>`
   - `wait_for_call_disconnected_b(&mut self) -> Result<SipEvent, SipError>`

   後片付け:
   - `shutdown_all(self)` — 両 Client を安全にシャットダウン
     - **client_a のみ `shutdown()` を呼ぶ**（PjsuaBackend の `pjsua_destroy()` は 1 度のみ）
     - client_b は drop で Handle を解放

2. **`tests/common/mod.rs` への変更**:
   - `pub mod dual_client;` の追加
   - `pub use dual_client::DualClientContext;` の追加

3. **`tests/integration/` への Dual Client 結合テスト追加**:
   - `dual_client.rs` を作成し、以下 7 テストを実装:
     - `dual_client_new_initializes_both_clients`
     - `call_a_to_b_receives_incoming_call_on_b`
     - `answer_b_200_sends_call_connected_to_a`
     - `hangup_a_sends_disconnected_to_b`
     - `wait_for_event_timeout_returns_error`
     - `shutdown_all_cleans_up_both_clients`
     - `single_client_tests_unaffected`

### 非スコープ

- PjsuaBackend の変更（Dual Client 基盤は M20-7 で完了済み）
- `SipAccountHandle` への `make_call` 追加 — `SipClient::make_call` 経由で十分
- メディア双方向テスト — 後続チケットで対応
- CI/CD 設定 — M20-11 で対応
- `AccountEventReceiver` の変更

## Investigation

### 1. 現状のテスト基盤

`tests/common/mod.rs` に `TestContext`（単一 Client + 2 アカウント）が定義されている。アカウント名は `test_user_1` / `test_user_2`（パスワード `test_pass_1` / `test_pass_2`）で Asterisk の設定と対応する。

主要な既存ヘルパー:
- `setup_test_context() -> Result<TestContext, SipError>` — 単一 Client + 2 アカウント
- `teardown(ctx: TestContext)` — `ctx.client.shutdown()` のみ
- `wait_for_event()` / `wait_for_event_with_timeout()` — event predicate 待機
- `wait_for_registration()` — RegistrationSucceeded 待機
- `wait_for_call_connected()` / `wait_for_call_disconnected()` — 通話確立・切断待機
- 設定定数: `EVENT_TIMEOUT`（10s）, `REGISTER_TIMEOUT`（15s）, `CALL_TIMEOUT`（20s）

全テスト関数に `#[ignore]` が付与され、Docker Asterisk 起動後に `-- --ignored --test-threads=1` でのみ実行される。

### 2. Dual Client 基盤（M20-7）の状態

`src/runtime/reactor.rs` に `ReactorEventRouter` が実装済み（確認: 行 3264-3397）:
- `register()` で Client B の EventBus を追加登録可能
- `map_account()` で account_id → ClientId のルーティング設定可能
- `dispatch()` で account_id ベースの振り分けが動作
- 既存の単一 Client テストがパスしていることから、Dual Client 基盤は正常動作

`SipClient::new_with_pjsip()` の 2 パス初期化（確認: `src/client.rs`）:
- 1 台目 → `GLOBAL_RUNTIME` 未設定 → 新規 Reactor 起動
- 2 台目以降 → `GLOBAL_RUNTIME` 既存 → 既存 Reactor を再利用 + EventBus 追加登録（Initialize スキップ）
- 各 Client は独立した `ClientState` / `shutdown` 状態を持つ

### 3. SipClient 公開 API のシグネチャ（実装で使用）

```rust
// 発信
pub fn make_call(&self, account_id: AccountId, request: OutgoingCallRequest) -> Result<CallId, SipError>

// 着信応答
pub fn answer(&self, call_id: CallId, code: u16) -> Result<(), SipError>

// 切断（HangupReason: UserRequested / BusyHere / Declined / ...）
pub fn hangup(&self, call_id: CallId, reason: HangupReason) -> Result<(), SipError>

// EventBus 購読
pub fn subscribe(&self) -> tokio::sync::broadcast::Receiver<SipEvent>

// アカウント追加
pub fn add_account(&self, config: AccountConfig) -> Result<SipAccountHandle, SipError>

// シャットダウン
pub fn shutdown(&self) -> Result<(), SipError>

// 状態確認
pub fn is_shutdown(&self) -> bool
```

**`make_call` は `SipAccountHandle` ではなく `SipClient` にある**（RFC02 §10.3 の疑似コードとは異なる）。したがって `DualClientContext::call_a_to_b()` は `self.client_a.make_call(self.account_a, request)` となる。

### 4. PjsuaBackend のシングルトン破棄問題

`PjsuaBackend::destroy()` は `pjsua_destroy()` を呼び出す。`OnceLock<Mutex<PjsuaBackend>>` により singleton 化されており、`pjsua_destroy()` の 2 度目の呼び出しは `PJ_EBUSY` で失敗する。

**`shutdown_all()` の方針**: client_a のみ `shutdown()` を呼び、client_b は drop でリソース解放する。この動作は `is_shutdown()` で確認可能。

```rust
pub fn shutdown_all(self) -> Result<(), SipError> {
    // client_b を先に drop（EventBus 購読解除）
    drop(self.client_b);
    // client_a の shutdown で Backend を破棄
    self.client_a.shutdown()
}
```

### 5. OutgoingCallRequest の Default

`OutgoingCallRequest` には `Default` 実装がないため、`call_a_to_b()` 内で手動構築する:

```rust
OutgoingCallRequest {
    target_uri: target_uri.into(),
    headers: vec![],
    auth_override: None,
    preferred_transport: None,
    media: CallMediaPreferences::default(),  // Default が存在することを確認
    auto_answer_refer: false,
}
```

## Test Plan

### ユニットテスト計画

`DualClientContext` は PjsuaBackend（Docker Asterisk）に依存する統合テスト用ユーティリティである。MockBackend での純粋な単体テストは限定的だが、以下の項目はユニットテストで検証する：

1. `events_a` / `events_b` が異なる `broadcast::Sender` に紐づく別インスタンスであること（MockBackend で検証）
2. `shutdown_all()` が二重 `pjsua_destroy()` を呼ばないこと（MockBackend では `destroy()` が 1 度だけ呼ばれることを確認）
3. イベント待機関数の predicate 分岐ロジック（`wait_for_event_a` のラッパー動作）

### 結合テスト計画（Docker Asterisk + `-- --ignored --test-threads=1`）

正常系:

1. **`dual_client_new_initializes_both_clients`**
   - `DualClientContext::new()` で両 Client が生成される
   - `account_a != account_b` を確認
   - 両方の subscribe から RegistrationSucceeded を受信する

2. **`call_a_to_b_receives_incoming_call_on_b`**
   - 前条件: 両アカウント登録完了
   - `call_a_to_b("sip:test_user_2@host:5060")` を実行
   - client_b で `IncomingCall` を受信する
   - client_a では `IncomingCall` を受信しない（イベント分離の確認）
   - `HangupReason::UserRequested` で切断

3. **`answer_b_200_sends_call_connected_to_a`**
   - 前条件: client_b が IncomingCall を受信
   - `answer_b(call_id, 200)` を実行
   - client_a で `CallConnected` を受信する
   - client_b でも `CallConnected` を受信する（両端確認）
   - `hangup_a()` で切断

異常系:

4. **`wait_for_event_timeout_returns_error`**
   - 存在しないイベント条件で `wait_for_event_a()` を呼ぶ
   - `SipError::Timeout` が返ることを確認

後片付け:

5. **`shutdown_all_cleans_up_both_clients`**
   - `shutdown_all()` 呼び出し後、両 Client が post-shutdown 状態になる
   - エラーなく完了する

後方互換性:

6. **`single_client_tests_unaffected`**
   - DualClientContext を使用した後、`setup_test_context()` / `teardown()` が正常動作すること

### ユニットテスト不可能な項目（例外）

| 項目 | 理由 |
|------|------|
| DualClientContext + PjsuaBackend の実際の初期化 | PJSIP ライブラリの実際の初期化・破棄が必要 |
| SIP メッセージ送受信 | Docker Asterisk または SIPp が必要 |
| 双方向メディアストリーム | RTP/RTCP の実際の通信が必要 |
| イベント分離（client_a に IncomingCall が漏れないこと） | PjsuaBackend 結合時のルーティング確認が必要 |

## Boy Scout Rule — 翻訳可能性計画

- `DualClientContext::new()` は「2 つの Client を設定して初期化する」という単一責務に徹する
- イベント待機メソッドは「A のイベントを待つ」「B のイベントを待つ」と明白に命名: `wait_for_event_a` / `wait_for_event_b`
- `call_a_to_b` という関数名は「A が B に発信する」動作を逐語的に伝える
- 内部で使用する `OutgoingCallRequest` 構築は `build_call_request` ヘルパー関数に分離し、`call_a_to_b` の責務を発信のみに限定
- タイムアウト値はハードコードせず、既存の `EVENT_TIMEOUT` / `CALL_TIMEOUT` 定数を参照する
- エラーの握りつぶしは行わず、全て `?` で伝播する
- `shutdown_all` の「なぜ client_a だけ shutdown するか」をコメントで説明する

## 依存・関連チケット

| チケット ID | 関係 |
|-------------|------|
| M20-7 (ticket:1) | **前提**: EventBus 分割 + Dual Client 基盤（完了済み） |
| M20-1.8 | **前提**: PjsuaBackend シングルトン化（完了済み） |
| M20-4 | **関連**: NativeEvent → SipEventPayload 変換（`IncomingCall` 変換を含む、完了済み） |
| M20-5 | **関連**: SubscribeAudio Reactor ハンドラ（メディアテスト時に利用可能） |
| M20-12 | **関連**: Layer 4 相互接続試験（本チケットの DualClientContext を使用可能） |

## 犯罪の点検結果

`scan-crimes.sh` 結果: **未解決の犯罪 0 件**。
既存の 7 件の `[::STUB::]` は全て siprs 外（`crates/anthropx/` / `crates/ggufrs/`）または別チケット範囲（M20-4 / M18）のものであり、本チケットのスコープ外。

`find-all-stubs.js` 結果: **siprs の `tests/` ディレクトリにスタブは存在しない**。新規作成する `dual_client.rs` および `integration/dual_client.rs` に不完全な実装が含まれる場合は `[::STUB::]` マーカーを厳格に適用する。

## Acceptance Criteria

- [ ] `DualClientContext::new()` が 2 つの SipClient を正しく初期化し、両方の subscribe が alive であること
- [ ] `call_a_to_b()` で client_b が `IncomingCall` イベントを受信すること（イベント分離確認）
- [ ] `answer_b(200)` で client_a が `CallConnected` イベントを受信すること
- [ ] `hangup_a()` / `hangup_b()` で相手側が `CallDisconnected` を受信すること
- [ ] `wait_for_event_a()` / `wait_for_event_b()` がタイムアウト時に `SipError::Timeout` を返すこと
- [ ] `shutdown_all()` が二重破棄エラーなく完了すること（client_a のみ shutdown）
- [ ] DualClientContext 使用後に既存の単一 Client テストが影響を受けないこと
- [ ] 全結合テストが `-- --ignored --test-threads=1` で Docker Asterisk との結合でパスすること
- [ ] 翻訳可能性: 関数名が動詞句、コメントが「なぜ」を説明し、エラーが握りつぶされていないこと

## 計装方法

- `DualClientContext::new()` の初期化時間（client_a + client_b の生成時間）
- `call_a_to_b()` の通話確立レイテンシ（発信 → IncomingCall 受信までの時間）
- `shutdown_all()` のクリーンアップ時間
