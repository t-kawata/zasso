---
ticket_id: 184
title: RuntimeCommand 新設 — GetAccountInfo / ConfConnect / ConfDisconnect（P0-P1）
slug: runtimecommand-getaccountinfo-confconnect-confdisconnectp0-p1
status: reviewed
created_at: 2026-06-22
updated_at: 2026-06-22
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0184-runtimecommand-getaccountinfo-confconnect-confdisconnectp0-p1/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0184-runtimecommand-getaccountinfo-confconnect-confdisconnectp0-p1/review.md
---
# RuntimeCommand 新設 — GetAccountInfo / ConfConnect / ConfDisconnect（P0-P1）

## Summary

PJSIP の `pjsua_acc_get_info()` / `pjsua_conf_connect()` / `pjsua_conf_disconnect()` を RuntimeCommand 経由で安全に呼び出すための 3 コマンドを RuntimeCommand enum に追加する。同時に `MediaDirection` enum と `AccountInfoSnapshot` struct を新規定義し、MockBackend / PjsuaBackend の該当メソッドを実装する。

## Background

RegistrationStateChanged の変換（RFC02 §3）には GetAccountInfo が必須であり、SubscribeAudio の conf_connect 経路（RFC02 §5）には ConfConnect / ConfDisconnect が必須である。

M20-1.5（credential 対応）と M20-1.8（シングルトン化）により、PJSIP API が reactor スレッドから安全に呼び出せる状態が整っており、RuntimeCommand 経路の拡張が可能になった。

## Scope

1. `MediaDirection` enum 定義（Inbound / Outbound / Both）
2. `AccountInfoSnapshot` struct 定義
3. `SipBackend::get_account_info()` trait メソッド追加
4. `RuntimeCommand` に 3 バリアント追加: `GetAccountInfo` / `ConfConnect` / `ConfDisconnect`
5. `PjsuaBackend` (pjsip) に `get_account_info` FFI 実装
6. `PjsuaBackend` (non-pjsip) に `unimplemented!()` スタブ追加
7. `PjsuaBackendRef` に委譲追加
8. `MockBackend` に `get_account_info` テスト実装追加
9. `CoreReactor` に 3 コマンドの handler 追加
10. `reject_command()` に 3 コマンドの arm 追加
11. Shutdown ポリシー実装（GetAccountInfo 許可、ConfConnect/Disconnect 拒否）
12. 全テスト追加（型定義・MockBackend・Reactor 結合）

## Non-scope

- `SipBackend::resolve_conf_port()` の新規追加（conf_port_id 解決は既存の `pjsua_call_get_info` 経路を利用。内部メソッドとして backend 実装内で完結）
- `RuntimeCommand::SubscribeAudio` の conf_port 統合（別チケット M20-5）
- NativeEvent → SipEventPayload の RegistrationStateChanged 変換（別チケット M20-4）
- `SipBackend::hold()` / `SipBackend::unhold()` の追加（Hold handler の `backend.hangup()` バグ修正はスコープ外）
- 統合テスト（M20-1 系で実施済み／別途実施）

## Investigation

### 物理的証拠

#### 1. 既存資産の確認

| 調査項目 | 結果 |
|---------|------|
| `SipBackend` trait の `conf_connect`/`conf_disconnect` | `crates/siprs/src/runtime/backend.rs:L79-L90` — 既存。引数は `(NativeConfPortId, NativeConfPortId)` |
| `SipBackend` trait の `get_account_info` | **未定義** — 全 trait メソッドを確認（L39-L106）、該当なし |
| `PjsuaBackend` (pjsip) の `conf_connect`/`conf_disconnect` | `crates/siprs/src/ffi/pjsua_backend.rs:L487-L521` — FFI 実装済。`pjsua_conf_connect/disconnect` を呼ぶ |
| `PjsuaBackend` (non-pjsip) の `unimplemented!()` | `crates/siprs/src/ffi/pjsua_backend.rs:L631-L718` — 13 箇所の `unimplemented!()` あり。`#[cfg(not(feature = "pjsip"))]` によりビルド対象外 |
| `PjsuaBackendRef` の委譲 | `crates/siprs/src/ffi/pjsua_backend.rs:L89-L133` — `global().lock().unwrap()` 経由で全委譲済。`get_account_info` のみ未委譲 |
| `RuntimeCommand` enum | `crates/siprs/src/runtime/command.rs:L35-L144` — 現在 13 バリアント。`GetAccountInfo`/`ConfConnect`/`ConfDisconnect` は未定義 |
| `CoreReactor` handler match | `crates/siprs/src/runtime/reactor.rs:L86-L419` — 現在 13 の match arm あり。3 新バリアントの handler なし |
| `reject_command()` | `crates/siprs/src/runtime/reactor.rs:L426-L485` — 全既存バリアントの arm あり。3 新バリアントの arm なし |
| `AccountInfoSnapshot` | 全ソースファイルを grep したが該当なし |
| `MediaDirection` | 全ソースファイルを grep したが該当なし |

#### 2. エラー型確認

| 必要なエラー | 既存の SipErrorKind | 該当行 |
|------------|-------------------|--------|
| ConfConnect conf_port 未解決 → InvalidState | `InvalidState`（retryable: true） | `error.rs:L35` |
| GetAccountInfo AccountId 不在 → NotFound | `AccountNotFound`（retryable: false） | `error.rs:L40-L41` |
| PJSIP API エラー → InternalError | `NativeError`（retryable: true） | `error.rs:L72-L73` |

新規エラーバリアント追加は不要。3 種とも既存バリアントを兼用可能。

#### 3. 犯罪・スタブ状況

- `scan-crimes.sh`: 未解決の犯罪 0 件
- `find-all-stubs.js`: スタブ 0 件

`PjsuaBackend` の `#[cfg(not(feature = "pjsip"))]` ブロックに `unimplemented!()` が 13 箇所存在するが、これらは `--cfg` によりビルド対象外のためスタブポリシーの対象外と判断する（pjsip feature 有効時は実装済みコードがコンパイルされる）。

## Test Plan

### ユニットテスト計画

#### 型定義テスト（3 tests）

| # | テスト名 | 種別 | 内容 | ファイル |
|---|---------|------|------|---------|
| 1 | `test_media_direction_variants` | 正常系 | `Inbound`, `Outbound`, `Both` が構築可能であること | `command.rs` |
| 2 | `test_account_info_snapshot_send` | コンパイル時 | `AccountInfoSnapshot` が `Send` を満たすこと | `command.rs` |
| 3 | `test_new_commands_send` | コンパイル時 | 既存 `test_runtime_command_send` に 3 新バリアントの Send 検証を統合 | `command.rs` |

#### MockBackend テスト（4 tests）

| # | テスト名 | 種別 | 内容 | ファイル |
|---|---------|------|------|---------|
| 4 | `test_mock_get_account_info_ok` | 正常系 | initialize → add_account → get_account_info → AccountInfoSnapshot 検証 | `backend.rs` |
| 5 | `test_mock_get_account_info_not_found` | 異常系 | 未登録 native_acc_id → AccountNotFound | `backend.rs` |
| 6 | `test_mock_conf_connect_ok` | 正常系 | ensure_initialized 後 conf_connect 成功 | `backend.rs` |
| 7 | `test_mock_conf_disconnect_ok` | 正常系 | ensure_initialized 後 conf_disconnect 成功 | `backend.rs` |

#### Reactor 結合テスト（8 tests）

| # | テスト名 | 種別 | 内容 | ファイル |
|---|---------|------|------|---------|
| 8 | `test_get_account_info_ok` | 結合 | Initialize → AddAccount → GetAccountInfo → AccountInfoSnapshot 受信 | `reactor.rs` |
| 9 | `test_conf_connect_ok` | 結合 | Initialize → MakeCall → ConfConnect → Ok 受信 | `reactor.rs` |
| 10 | `test_conf_disconnect_ok` | 結合 | Initialize → MakeCall → ConfConnect → ConfDisconnect → Ok 受信 | `reactor.rs` |
| 11 | `test_get_account_info_not_found` | 異常系 | 未登録 native_acc_id → AccountNotFound | `reactor.rs` |
| 12 | `test_conf_port_unresolved` | 異常系 | conf_port 未解決 → InvalidState（MockBackend に注入） | `reactor.rs` |
| 13 | `test_shutdown_get_account_info_allowed` | Shutdown ポリシー | Shutdown 後も GetAccountInfo が成功すること | `reactor.rs` |
| 14 | `test_shutdown_conf_connect_rejected` | Shutdown ポリシー | Shutdown 後 ConfConnect → InvalidState | `reactor.rs` |
| 15 | `test_shutdown_conf_disconnect_rejected` | Shutdown ポリシー | Shutdown 後 ConfDisconnect → InvalidState | `reactor.rs` |

**カバレッジ目標**: 80%以上（新規コード対象）

### ユニットテスト不可能な項目（例外）

- `PjsuaBackend::get_account_info()` の FFI 呼び出し（`pjsua_acc_get_info`）は PJSIP ライブラリが必要。`#[cfg(not(feature = "pjsip"))]` 環境ではテスト不可能。統合テスト（M20-1 系）でカバー。
- `PjsuaBackend::conf_connect/disconnect` の実 FFI 経路も同様。

## Boy Scout Rule — 翻訳可能性計画

### 本チケットスコープでの改善

1. **ConfConnect/ConfDisconnect の conf_port_id 解決ロジック**
   - 解決ヘルパー関数 `resolve_conf_ports_for_direction(call_id, media_direction)` を抽出し、match で方向ごとのポートペアを一文で読めるようにする
   - `MediaDirection::Inbound` → `(call_conf_port, conference_port)`、`Outbound` → `(conference_port, call_conf_port)` の対応を明確にする

2. **Reactor handler の責務分離**
   - `handle_get_account_info()`, `handle_conf_connect()`, `handle_conf_disconnect()` を独立した private 関数として抽出
   - match arm が「関数呼び出しの並び＝処理手順の日本語訳」になっていることを確認

### スコープ外で発見した問題

3. **`CoreReactor::run_loop()` の Hold handler（reactor.rs:L267-L270）**
   - `RuntimeCommand::Hold` の handler が誤って `backend.hangup(native_id)` を呼んでいる（正しくは `backend.hold()` または `pjsua_call_set_hold()`）。M13-2 で修正予定。本チケットでは発見のみ報告。

## Acceptance Criteria

- [ ] `MediaDirection` enum（Inbound / Outbound / Both）が `command.rs` に定義され、全バリアントが構築可能であること
- [ ] `AccountInfoSnapshot` struct（acc_id, registration_status, registration_expires, online_status, uri）が定義されていること
- [ ] `SipBackend::get_account_info()` が trait に追加され、既存の 3 実装（`PjsuaBackend` pjsip / non-pjsip / `PjsuaBackendRef` / `MockBackend`）すべてがコンパイルを通すこと
- [ ] `RuntimeCommand` に `GetAccountInfo`, `ConfConnect`, `ConfDisconnect` の 3 バリアントが追加され、コンパイルが通ること
- [ ] 3 コマンドすべてが `Send` を満たすこと
- [ ] `CoreReactor` の match が 3 コマンドを網羅し、コンパイルが通ること
- [ ] `reject_command()` に 3 コマンドの arm が追加され、全コマンドの網羅性が保たれていること
- [ ] Shutdown 中: GetAccountInfo は成功、ConfConnect/ConfDisconnect は `InvalidState` で拒否されること
- [ ] 全 15 テストが通過すること
- [ ] `make check-be` が clippy 警告 0 で通過すること

## Notes

- `bindings::pjsua_acc_info` 構造体のフィールド定義は実 FFI 生成結果に依存する。bindgen 生成後の確認が必要。
- `conf_port_id` 解決ロジックは PJSIP の `pjsua_call_get_info()` の `conf_slot` フィールドに依存する。この FFI が未実装の場合、conf_port 解決処理はスタブとなる。

### 成果物

- 計画: context/0184-runtimecommand-getaccountinfo-confconnect-confdisconnectp0-p1/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0184-runtimecommand-getaccountinfo-confconnect-confdisconnectp0-p1/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0184-runtimecommand-getaccountinfo-confconnect-confdisconnectp0-p1/review.md（未作成、/review-ticket 全チェック通過後に作成）
