---
ticket_id: 150
title: Layer 3 結合テスト — ローカルSIPサーバ + Docker
slug: layer-3-sip-docker
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
dependencies: |
plan_path: /Users/shyme/shyme/zasso/tickets/context/0150-layer-3-sip-docker/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0150-layer-3-sip-docker/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0150-layer-3-sip-docker/review.md
---

# Layer 3 結合テスト — ローカルSIPサーバ + Docker

## Summary

実際の PJSUA 経由で SIP プロトコルレベルの結合試験を実施する。
Docker で起動した Asterisk を相手に、REGISTER/INVITE/BYE/DTMF
の基本フローを検証する。

PJSIP の初期化が必要なため全テストに `#[ignore]` 属性を付与し、CI でのみ実行する。
手動では `cargo test -p siprs -- --ignored --test-threads=1` で起動する。

**参照設計書:** `docs/rust-sip-client-rfc.md` (§43.3, §43.1, §43.2, §44)

## Background

これまでの M0-M19 で以下の実装が完了している（全 392 テスト通過）:

- Layer 0: 基盤型定義（エラー型、ID型、オーディオフォーマット、トランスポート、設定型）
- Layer 1: 純粋ロジック（設定バリデーション、ID マッピング、オーディオ処理、状態機械）
- Layer 2: ランタイム（SipBackend trait、MockBackend、Reactor）
- Layer 3: 公開API（SipClient、アカウント/発着信API）
- Layer 4: FFI（PJSUA bindings、callback bridge、メディアポート）

しかし、これらの実装は MockBackend を用いた単体テストのみで検証されており、
実際の PJSUA + SIP サーバとの結合は一度も行われていない。

本チケットでは、Docker 上の Asterisk との結合試験を実装し、
siprs crate が実 SIP サーバと正しく通信できることを保証する。

FreeSWITCH との結合試験（ICE/TURN/Opus codec negotiation）は M20-2 に含める。

## Scope

### 1. `tests/common/mod.rs` — 共通テストユーティリティ

SIP サーバのセットアップ・ティアダウン・アカウント設定を共通化する。

- `struct TestContext` — PJSIP 初期化、サーバ接続情報、`SipClient` インスタンス管理
- `fn setup_test_context()` — SIP サーバ接続情報（`docker compose ps` の出力から取得 or 環境変数）を読み取り、`SipClient::new()` を呼び出す
- `fn teardown(context: TestContext)` — `SipClient::shutdown()` を呼び出しリソース解放
- サーバアドレスは環境変数 `SIP_SERVER_HOST`（デフォルト `127.0.0.1`）で注入可能

### 2. `tests/docker/docker-compose.yml`

Asterisk の Docker Compose 設定。

- Asterisk (PJSIP チャネル): SIP ポート 5060, SRTP ポート 5061
- サービス間のネットワーク設定
- あらかじめ作成した設定ファイル（`tests/docker/asterisk/` 以下に PJSIP 設定、`tests/docker/extensions.conf` にダイヤルプラン）

### 3. 各統合テストファイル

以下のテストファイルを `tests/integration/` に作成:

| ファイル | テストケース | 検証内容 |
|---------|------------|---------|
| `tests/integration/register.rs` | 3 tests | REGISTER 成功/失敗/再登録タイマー |
| `tests/integration/call.rs` | 4 tests | INVITE/BYE 正常/CANCEL/タイムアウト |
| `tests/integration/provisional.rs` | 2 tests | 180 Ringing / 183 Early Media 応答 |
| `tests/integration/dtmf.rs` | 3 tests | DTMF RFC4733/SIP INFO/Inband |
| `tests/integration/account.rs` | 2 tests | unregister/re-register/2 アカウント同時通話 |
| `tests/integration/media.rs` | 2 tests | media loopback の sign 確認（ICE/TURN は M20-2 でカバー） |

各テストファイル内のテスト関数に `#[ignore]` 属性を付与。

### 4. エントリポイント

`tests/integration/mod.rs` または各ファイルを個別にテストハーネスとして機能させる。
Cargo の統合テストは `tests/` 以下の各ファイルを個別にテストバイナリとして認識するため、
`tests/integration/register.rs` 等を直接統合テストファイルとして配置する（`tests/register.rs` ではなく `tests/integration/register.rs` に置く場合は `tests/integration/main.rs` 相当のエントリポイントが必要）。

→ 方針: `tests/integration/` を `tests/` 直下のフラット配置とするか、`tests/tests/` 方式を採用する。
   Cargo の統合テスト慣習に従い `tests/integration/register.rs` 等は `tests/` 直下に `register_test.rs` の形で配置し、
   `tests/common/mod.rs` を共通モジュールとする。

### 5. dev-dependencies 追加

`Cargo.toml` の `[dev-dependencies]` に必要に応じて以下を追加:
- `ctor` — テストスイート全体の初期化（PJSIP 初期化等）
- `futures` — 非同期テストのタイムアウト制御
- `tokio-stream` — イベントストリーム購読（必要に応じて）

## Non-scope

- **Layer 4 相互接続試験（M20-2）**: 実 PBX/Proxy との結合試験は別チケット
- **受け入れ基準検証（M20-3）**: リリース判定は別チケット
- **CI/CD パイプライン設定**: GitHub Actions / CI の job 定義は本チケットの範囲外（§44 の CI/CD 要件は別途対応）
- **FreeSWITCH 結合試験**: ICE/TURN / Opus codec negotiation は M20-2（Layer 4 相互接続試験）でカバー
- **coturn サーバ設定**: TURN サーバは M20-2 で別途対応
- **パフォーマンステスト**: 負荷試験や応答時間測定は含まない

## Investigation

### 証拠 1: テストディレクトリは未作成

```bash
$ ls -la crates/siprs/tests/
# ディレクトリ自体が存在しない
```

`tests/` ディレクトリは未作成。`cargo test -p siprs` は現状 392 の単体テストを全通過している。

### 証拠 2: dev-dependencies は最小限

```toml
[dev-dependencies]
static_assertions = "1.1.0"
```

`ctor` や `futures` 等のテスト補助依存は未導入。結合テストに必要な dev-dependency の追加が見込まれる。

### 証拠 3: Makefile に siprs 固有のテストターゲットなし

```makefile
test:
    EDITION_SLUG=$(EDITION) cargo test --manifest-path src-tauri/Cargo.toml $(TEST_ARGS)
```

`make test` は Tauri のテストのみを実行。siprs のテストは直接 `cargo test -p siprs` で実行する必要がある。

### 証拠 4: Docker Compose / Asterisk / FreeSWITCH 設定ファイルは未作成

```
$ find . -name "docker-compose*" -o -name "Dockerfile*" | grep siprs
# 出力なし
```

Docker 関連ファイルは一切存在しない。`tests/docker/docker-compose.yml` および Asterisk/FreeSWITCH の設定ファイルを新規作成する必要がある。

### 証拠 5: 参照設計書に詳細なテスト仕様あり

`docs/rust-sip-client-rfc.md §43.3` に以下の詳細記述を確認:

- 試験対象: REGISTER、INVITE/BYE、provisional response、DTMF 全方式、unregister/re-register、dual account、TURN/ICE、media loopback
- SIP サーバ: Asterisk (PJSIP チャネル)
- §44 CI/CD 要件: matrix build (windows-latest, macos-14, ubuntu-22.04)
- FreeSWITCH との結合（ICE/TURN/Opus）は §43.4（M20-2）で別途対応

### 証拠 6: STUB マーカーは存在しない

```
$ grep -rn '\[::STUB::\]' crates/siprs/src/
# 出力なし
```

すべての M0-M19 実装は完了しており、未解決の STUB はない。

## Test Plan

本チケットの成果物は統合テストコードそのものであるため、「テスト計画」はテストコード自体の検証計画を示す。
各統合テストは以下に従って検証する。

**重要:** 統合テストは全て `#[ignore]` を付与するため、`cargo test -p siprs -- --ignored` でのみ実行される。
通常の `cargo test -p siprs` ではスキップされ、既存の 392 単体テストのみが実行される。

### 統合テスト検証計画

| # | 検証内容 | 実行方法 | 期待結果 |
|---|---------|---------|---------|
| 1 | テストファイルがコンパイル可能 | `cargo test -p siprs` | 全 392 テスト通過、ignore されたテストは 0 実行 |
| 2 | REGISTER 成功 | `SIP_SERVER_HOST=127.0.0.1 cargo test -p siprs -- --ignored register_success` | `RegistrationState::Registered` に遷移 |
| 3 | REGISTER 失敗（誤パスワード） | 同上 `register_failure` | `RegistrationState::Failed`、原因イベント発火 |
| 4 | INVITE → BYE 正常切断 | 同上 `call_normal_hangup` | `CallDisconnected` イベント発火 |
| 5 | CANCEL | 同上 `call_cancel` | `CallCancelled` イベント発火 |
| 6 | DTMF RFC4733 | 同上 `dtmf_rfc4733` | `DtmfSent` / `DtmfReceived` 発火 |
| 7 | 2アカウント同時通話 | 同上 `dual_account_call` | 両方独立して遷移完了 |
| 8 | AudioTap メディア確認 | 同上 `media_loopback` | `AudioChunkPair` の in/out が非ゼロ |
| 9 | TURN/ICE | M20-2 でカバー（本チケットでは未実施） | — |

### ユニットテスト計画（テスト補助モジュール）

`tests/common/mod.rs` に実装するヘルパー関数のユニットテストは必要に応じて記述する。

### ユニットテスト不可能な項目（例外）

- 各統合テストケース: Docker 上の実 SIP サーバが必要。MockBackend では SIP プロトコルレベルの挙動（SIP メッセージ解析、タイマー、再送、DTMF トーン検出等）を再現できない
- Docker コンテナの起動/終了: OS レベルのコンテナ管理操作でありユニットテスト不可

## Boy Scout Rule — 翻訳可能性計画

統合テストコードは以下の翻訳可能性を考慮して記述する:

- **テスト関数名は動詞句**: `register_succeeds_with_valid_credentials()` のように「何をテストするか」が散文として読める命名
- **Arrange-Act-Assert 構造**: テスト本体は準備→実行→検証の三段構成とし、空行で区切る
- **共通ヘルパーは明確な関数名**: `setup_test_context()` / `teardown()` / `wait_for_event()` 等、関数呼び出しの並びがテストの流れの日本語訳になる
- **ハードコード値の定数化**: サーバホスト、ポート番号、タイムアウト値は `const` または環境変数経由で注入
- **エラー伝播**: テストは `Result<()>` を返し `?` でエラーを伝播（`unwrap()` 不使用）
- **コメントは「なぜ」**: コードの意図が関数名と構造から読める場合、コメントは SIP プロトコルの仕様上の理由や制約を説明する

## Acceptance Criteria

- [ ] `tests/common/mod.rs` が実装され、テストコンテキスト管理が行える
- [ ] `tests/docker/docker-compose.yml` が実装され、`docker compose up -d` で Asterisk が起動する
- [ ] Asterisk の PJSIP 設定が整備され、REGISTER/INVITE を受け付けられる
- [ ] 以下の統合テストファイルが実装され、`cargo test -p siprs -- --ignored --test-threads=1` で全テストが通過する:
  - `register_test.rs` (3 tests)
  - `call_test.rs` (4 tests)
  - `provisional_test.rs` (2 tests)
  - `dtmf_test.rs` (3 tests)
  - `account_test.rs` (2 tests)
  - `media_test.rs` (2 tests)
- [ ] `cargo test -p siprs` で既存 392 テストが全通過（ignore テストは実行されないこと）
- [ ] 全テスト関数に `#[ignore]` 属性が付与されている
- [ ] テストコードが翻訳可能性の要件を満たしている
