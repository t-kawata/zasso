# 実装計画: M20-1 Layer 3 結合テスト — ローカルSIPサーバ + Docker（Asterisk）

## 要件

- Asterisk (Docker) との SIP 結合テストを実装する
- 全テストに `#[ignore]` を付与し、CI 専用とする
- FreeSWITCH/ICE/TURN は M20-2 で対応（本チケットのスコープ外）
- 単一バイナリ構成で PJSIP singleton 問題を回避

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| Cargo.toml | 修正 | dev-dependencies に `ctor` 追加 |
| tests/common/mod.rs | 新規 | TestContext 構造体、setup/teardown、イベント待機ヘルパー |
| tests/docker/docker-compose.yml | 新規 | Asterisk コンテナ定義（SIP 5060） |
| tests/docker/asterisk/pjsip.conf | 新規 | PJSIP エンドポイント設定（テスト用アカウント） |
| tests/docker/asterisk/extensions.conf | 新規 | 内線間ダイヤル + media loopback |
| tests/docker/asterisk/modules.conf | 新規 | 最小限モジュール設定 |
| tests/integration/register.rs | 新規 | REGISTER テスト (3 tests) |
| tests/integration/call.rs | 新規 | INVITE/BYE テスト (4 tests) |
| tests/integration/provisional.rs | 新規 | Provisional 応答テスト (2 tests) |
| tests/integration/dtmf.rs | 新規 | DTMF テスト (3 tests) |
| tests/integration/account.rs | 新規 | アカウントテスト (2 tests) |
| tests/integration/media.rs | 新規 | メディアループバックテスト (2 tests) |
| tests/integration_test.rs | 新規 | 単一エントリポイント（#[path] でサブモジュール集約） |

## Boy Scout 改善（スコープ外）

翻訳可能性 grep の結果、既存コードに改善を要する箇所はなし。本チケットではスコープ外の修正は不要。

## 実装手順

1. `cargo add --dev ctor`
2. Docker Compose + Asterisk 設定ファイル作成
3. `tests/common/mod.rs` — TestContext 実装
4. `tests/integration_test.rs` — エントリポイント
5. 各テストファイル（16 tests、全 `#[ignore]`）
6. 検証

## テスト計画

### ユニットテスト
- `tests/common/mod.rs` の TestContext に対し基本的な setup/teardown テスト

### 統合テスト（Docker 起動後）
- register: 成功/失敗/再登録 (3)
- call: 正常切断/cancel/timeout/reject (4)
- provisional: 180 Ringing/183 Early Media (2)
- dtmf: RFC4733/SIP INFO/Inband (3)
- account: unregister/dual account (2)
- media: loopback sign 確認 (2)
- **合計: 16 tests**

### ユニットテスト不可能な項目
- 全統合テスト: 実 SIP サーバ + PJSIP 初期化が必要
- Docker 管理: OS レベルの操作

## 物理的レビュー方法

1. `cargo test -p siprs` → 392 passed
2. `cargo test -p siprs -- --ignored --list` → 16 tests listed
3. 翻訳可能性 grep（関数名/変数名/デバッグ出力）
4. `run-quality-checks.js tests/` 通過

## リスク

- PJSIP singleton → 単一バイナリ + `--test-threads=1`
- Docker 必須 → `#[ignore]` で CI スキップ
- Asterisk 設定不備 → 最小設定 + ヘルスチェック
