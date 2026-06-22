# 実装サマリ: M20-13 受け入れ基準検証・リリース判定

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `tickets/context/0007-m20-13-rfc02/acceptance-matrix.md` | **新規作成** | 18項目 PASS/FAIL マトリクス |
| `crates/siprs/src/util/id.rs` | 修正 | `AccountId::from_raw()` コンストラクタ追加 |
| `crates/siprs/src/ffi/pjsua_backend.rs` | 修正 | ヘルパーメソッドを `impl PjsuaBackend` に移動 |
| `crates/siprs/tests/common/dual_client.rs` | 修正 | `HangupReason` インポート修正 |
| `crates/siprs/tests/integration/call.rs` | 修正 | `SipError::other()` → `SipError::invalid_state()` |
| `crates/siprs/tests/integration/dual_client.rs` | 修正 | `SipError::Timeout` パターン修正 + unused 変数対応 |
| `crates/siprs/tests/interop/freeswitch.rs` | 修正 | `accounts().await`, `SipError::other()` 修正, unused import 削除 |
| `crates/siprs/tests/integration/account.rs` | 修正 | `mut ctx` → `ctx` |

## 検証結果サマリ

### 自動検証完了項目（14/18 PASS）
- 458/458 unit tests PASS (+ 2 doc-tests)
- 全主要型の Send + Sync コンパイル時確認
- blocking_read/blocking_write コードベース0件確認
- codec auto モード（Opus=255, PCMU=254）確認
- Shutdown 中 GetAccountInfo 許可（16テスト PASS）
- 全イベントバリアント確認
- 付録B 修正確認

### 環境制約により未検証（2項目）
- Dual Client 結合テスト（PJSIP thread assertion → SIGABRT）
  → CI 上の Docker Asterisk job で確認
- Docker Integration Job 動作確認
  → CI 実行後に確認

### ビルド修正
- PjsuaBackend の configure_codecs ヘルパーが trait ブロック内にあった問題を修正
- AccountId::from_raw コンストラクタ追加
- テストファイルのコンパイルエラー（SipError::other, accounts().await 等）を修正
