# 計画: Dual Client TestContext utility（P2）

## 要件の再確認

2 つの SipClient インスタンスを管理する `DualClientContext` を `tests/common/dual_client.rs` に実装し、Dual Client シナリオの結合テスト記述コストを削減する。

**対象**: `crates/siprs/tests/` 配下のテストユーティリティ（クレートの公開 API には含めない）

### spec からの修正点（再検証で判明）

1. `HangupReason::UserRequested` は存在しない → `HangupReason::Bye` を使用する
2. `CallMediaPreferences` に `Default` はない → 手動構築（`enable_early_media: true, enable_srtp: None, preferred_codecs: vec![]`）

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `crates/siprs/tests/common/dual_client.rs` | **新規** | `DualClientContext` 構造体 + 全メソッド実装 |
| `crates/siprs/tests/common/mod.rs` | **編集** | `pub mod dual_client;` + `pub use dual_client::DualClientContext;` 追加 |
| `crates/siprs/tests/integration/dual_client.rs` | **新規** | 7 テストケースを含む結合テストファイル |

## Boy Scout 改善（スコープ外の翻訳可能性修正）

本チケットのスコープは `tests/` 配下のみのため、大規模なリファクタリングは行わない。
- `tests/common/mod.rs` に `mod dual_client` を追加する際、既存の `#[allow(dead_code)]` が依然として必要な状態になっていないか確認する
- 今回触るファイル内で spec に記載した翻訳可能性原則（関数名=動詞句、定数参照、エラー伝播）を遵守する

## テスト計画

### ユニットテスト計画

MockBackend 上で検証可能な範囲は限定的。以下の項目を確認する：
1. イベントレシーバーの分離：`events_a` / `events_b` が別インスタンスであること
2. `shutdown_all()` の二重破棄防止：Backend::destroy() が 1 度のみ呼ばれること

### 結合テスト計画（Docker Asterisk + `-- --ignored --test-threads=1`）

1. **`dual_client_new_initializes_both_clients`** — 両 Client 生成・両アカウント登録成功
2. **`call_a_to_b_receives_incoming_call_on_b`** — A→B 発信で B に IncomingCall
3. **`answer_b_200_sends_call_connected_to_a`** — B 応答で A に CallConnected
4. **`hangup_a_sends_disconnected_to_b`** — A 切断で B に CallDisconnected
5. **`wait_for_event_timeout_returns_error`** — タイムアウト時 SipError::Timeout
6. **`shutdown_all_cleans_up_both_clients`** — 二重破棄エラーなく完了
7. **`single_client_tests_unaffected`** — 既存テスト影響ゼロ確認

### ユニットテスト不可能な項目（例外）

| 項目 | 理由 |
|------|------|
| DualClientContext + PjsuaBackend の結合動作 | PJSIP ライブラリの実際の初期化・破棄が必要 |
| SIP メッセージ送受信（IncomingCall / CallConnected / CallDisconnected） | Docker Asterisk 必須 |
| イベントルーティング分離の実際の動作確認 | PjsuaBackend 結合時のルーティング確認が必要 |

## 実装手順

### Step 1: `tests/common/dual_client.rs` の新規作成

DualClientContext 構造体と全メソッドを実装する。`call_a_to_b()` 内で `OutgoingCallRequest` を手動構築し、`shutdown_all()` では client_a のみ shutdown を呼ぶ。

### Step 2: `tests/common/mod.rs` の編集

`pub mod dual_client;` + `pub use dual_client::DualClientContext;` を追加。

### Step 3: `tests/integration/dual_client.rs` の新規作成

既存テストと同パターン（`#[ignore]` + `#[tokio::test]`）で 7 テストを実装。

### Step 4: ビルド確認

```bash
make check-be
```

### Step 5: Docker Asterisk 起動 + 結合テスト実行

```bash
cd /Users/shyme/shyme/zasso/crates/siprs && docker compose -f tests/docker/docker-compose.yml up -d
cd /Users/shyme/shyme/zasso && cargo test --package siprs --test integration_test -- --ignored --test-threads=1 2>&1
```

## 物理的レビュー方法

1. **`run-quality-checks.js`**: 変更ファイルに対して品質チェックを実行
2. **翻訳可能性 grep**: 関数名が動詞句か、定数使用か、エラー伝播されているか
3. **`cargo fmt --check`**: フォーマット違反なし
4. **`cargo clippy -- -D warnings`**: 警告ゼロ
5. **全テスト通過確認**: ユニットテスト + 結合テスト（Docker Asterisk）

## リスク

| リスク | 影響 | 対策 |
|--------|------|------|
| `CallMediaPreferences` に Default がない | コードが冗長になる | 手動構築で対応（計画に記載済み） |
| `SipEventPayload::CallDisconnected` バリアントが存在しない可能性 | コンパイルエラー | 実装時に event.rs を確認し正しい名前に修正 |
| 既存テストに影響を与える変更 | 既存テストの失敗 | 実装前に `make test` でベースライン確認 |
