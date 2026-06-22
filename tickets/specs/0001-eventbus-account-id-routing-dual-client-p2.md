---
ticket_id: 1
title: EventBus 分割 + account_id routing — Dual Client 基盤（P2）
slug: eventbus-account-id-routing-dual-client-p2
status: reviewed
created_at: 2026-06-22
updated_at: 2026-06-22
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0001-eventbus-account-id-routing-dual-client-p2/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0001-eventbus-account-id-routing-dual-client-p2/review.md
---
# EventBus 分割 + account_id routing — Dual Client 基盤（P2）

## Summary

2 つ以上の SipClient インスタンスが同一の PjsuaBackend singleton を共有しながら、それぞれ独立したイベントストリームを受信できるようにする。Reactor は単一のまま維持し（global_runtime は変更しない）、EventBus を SipClient ごとに分割して account_id ベースで振り分ける。既存の単一 Client 利用には影響を与えない。

## Background

siprs は現在、`PjsuaBackend` が `OnceLock<Mutex<PjsuaBackend>>` による singleton 化を実現している。しかし、`CoreReactor` は SipClient ごとに新規起動され、各 Reactor は単一の `EventBus` のみを保持する。このため、2 つめの SipClient 作成時には以下の問題が発生する：

1. `CoreReactor::spawn()` が新規 reactor を起動 — **単一 Reactor 原則（RFC02 §8.3）に反する**
2. `set_global_runtime()` が 2 度目の呼び出しで `Err` を返す（現状は無視 → 2 つめの Client には callback が配送されない）
3. PJSIP callback は最初の Reactor の RuntimeHandle のみを保持するため、2 つめの Client に NativeEvent が届かない
4. NativeEvent → SipEventPayload 変換後に publish される先が単一の EventBus のみで、client 間分離ができない

### 設計制約（RFC02 §8.3）

- `global_runtime()` は変更せず単一 Reactor を維持する（`OnceLock` 機構はそのまま）
- EventBus は SipClient ごとに個別インスタンスを持つ
- Reactor が `account_id` ベースでイベントを振り分ける
- デフォルト EventBus は最初に生成された SipClient のものを使用する
- Shutdown 中の GetAccountInfo 許可（M20-8）との整合性を確保する

## Scope

### 実装範囲

1. **Reactor の EventBus 複数保持対応**:
   - Reactor 内部状態として `ReactorEventRouter` 構造体を導入
   - `dispatch_event()` メソッドを実装（RFC02 §8.2 疑似実装に従う）
   - 既存の全 `events.publish(event)` → `dispatch_event()` 経由に変更

2. **RuntimeCommand::RegisterEventBus の追加**:
   - 既存 Reactor に新規 EventBus を登録するためのコマンド
   - `RuntimeHandle` に `register_event_bus()` ヘルパーメソッド追加

3. **EventBus に `control_sender()` getter 追加**:
   - 内部の `broadcast::Sender<SipEvent>` を Reactor 登録用に公開

4. **SipClient::new() の 2 パス初期化**:
   - `GLOBAL_RUNTIME` 既存 → 既存 Reactor を再利用 + EventBus 追加登録（Initialize スキップ）
   - `GLOBAL_RUNTIME` 未設定 → 従来通り新規 Reactor 起動
   - `ClientState` / `shutdown` は client ごとに独立

5. **既存テストの後方互換性確認**:
   - 単一 Client で全テストがパスすること
   - dispatch_event 追加による既存動作への影響ゼロ

### 非スコープ

- Dual Client TestContext utility（M20-10）
- Transport/ICE 系 NativeEvent 変換の完全化（M20-9）
- Dual Client の E2E 結合テスト（M20-10 の範囲）
- `AccountEventReceiver` の変更（client サイドフィルタは安全策として残す）

## Investigation

### コード解析結果

#### 1. EventBus 構造体（`src/event.rs:727-778`）

- `control: broadcast::Sender<SipEvent>` + `raw_sip: Option<broadcast::Sender<RawSipMessage>>`
- `broadcast::Sender` は `Clone` 可能で `Send + Sync`（`HashMap` に格納可能）
- EventBus 自体に Client 識別子の概念はない

#### 2. CoreReactor::spawn()（`src/runtime/reactor.rs:77-95`）

- 単一の `EventBus` のみ受け付けるシグネチャ
- 内部で `set_global_runtime(handle.clone())` — 2 度目は `Err` が無視される
- `CoreReactor` は空構造体（stateless）。全状態は関数引数として注入

#### 3. 現状のイベント配送経路

全イベントハンドラが単一の `events: &EventBus` に対して `events.publish(event)` を呼んでいる。集中ルーティングなし。

#### 4. global_runtime（`src/ffi/callbacks.rs:41-73`）

- `OnceLock<Mutex<Option<RuntimeHandle>>>` — 1 度だけセット可能
- テスト時は `clear_global_runtime()` でリセット
- 2 つめの SipClient はこの RuntimeHandle を再利用する

#### 5. PjsuaBackend singleton（`src/ffi/pjsua_backend.rs:82-94`）

- `OnceLock<Mutex<PjsuaBackend>>` — 既に singleton 化済みで共有可能

#### 6. SipClient::new()（`src/client.rs:115-161`）

- 毎回新規 Reactor を起動。毎回新規 `ClientState` + `shutdown_rx`

#### 7. Reactor の shutdown 処理（`src/runtime/reactor.rs:110-131`）

- `is_shutting_down` フラグで全コマンドを一括拒否
- Dual Client 時に片方の Client のみ shutdown した場合の挙動を検討要

### 実装上の重要判断

| 判断 | 選択 | 理由 |
|------|------|------|
| Reactor 状態管理 | `ReactorEventRouter` を `run_loop_async` のローカル変数として保持 | 最小変更で stateless 設計を拡張 |
| broadcast 重複防止 | `ClientId` newtype 導入（Reactor 内部採番） | 同一 client が複数 account を持つ場合の二重配送防止 |
| EventBus 登録タイミング | SipClient new() 時に `RegisterEventBus`、AddAccount 時に account→bus 紐付け | Initialize 前に bus を Reactor に認識させる必要がある |
| 2nd Client Initialize | スキップ（backend は既に initialized） | PjsuaBackend の 2 重 init 防止 |

## Test Plan

### ユニットテスト計画（MockBackend, `reactor.rs` tests に追加）

| # | テスト | 正常系 | 異常系 | 境界値 |
|---|-------|--------|--------|--------|
| 1 | 単一 Client 後方互換性 | 従来のイベントが従来の receiver で受信可能 | — | — |
| 2 | Dual Client イベント分離 | client_a のイベントが client_b に漏れない | 未登録 account_id → default fallback | account_id = None → broadcast |
| 3 | account_id=None broadcast | ClientInitialized が全 client で受信可能 | — | client 数 0,1,2,3 |
| 4 | 3+ Client | 3 Client × 3 Account が独立動作 | — | — |
| 5 | dispatch_event 境界値 | — | channel closed でも panic しない | 存在しない account_id |
| 6 | RegisterEventBus during shutdown | Shutdown 後も安全に動作 | — | — |

### ユニットテスト不可能な項目

- PJSIP callback からの実配送経路（Layer 3 結合テスト = M20-10）
- 複数 Client の shutdown 連携挙動（結合テスト = M20-10）

## 関連チケット・依存関係

| チケット | 関係 | 内容 |
|---------|------|------|
| M7-1 | 依存（完了） | EventBus 構造体と基本操作 |
| M12-1 | 依存（完了） | SipClient + ClientInner |
| M20-4 | 依存（完了） | NativeEvent → SipEventPayload 変換 |
| M20-5 | 依存（完了） | SubscribeAudio Reactor ハンドラ |
| M20-6 | 依存（完了） | blocking_read → read().await |
| M20-8 | 関連（P2） | Shutdown ポリシー拡張 |
| M20-10 | 関連（P2） | Dual Client TestContext utility |

## Acceptance Criteria

- [ ] 単一 Client の既存 EventBus 動作が変更されない
- [ ] Dual Client で client_a のイベントが client_b に漏れない
- [ ] `account_id = None` のイベントが全 Client に broadcast される
- [ ] 各 Client の subscribe が独立した receiver を返す
- [ ] 3 つ以上の Client 作成 → すべて独立して動作
- [ ] dispatch_event が未登録 account_id を安全に default へ fallback する
- [ ] 既存の全ユニットテストがパスする

## Boy Scout Rule — 翻訳可能性計画

1. `dispatch_event()` の routing を match + 早期 return で自然言語的に記述
2. ReactorEventRouter 構造体で関数引数のバケツリレーを構造化
3. 新規 RuntimeCommand は既存と同一命名規則に従う
4. TODO コメント 2 件に `[::STUB::]` マーカー追加（`audio/worker.rs`, `ffi/callbacks.rs`）
