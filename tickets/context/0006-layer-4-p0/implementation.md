# 実装サマリー: チケット 6 (M20-12)

## 変更ファイル一覧

| ファイル | 種別 | 変更内容 |
|---------|------|---------|
| `tests/integration/call.rs` | 修正 | `call_reject` プレースホルダーを DualClientContext 実装に置き換え |
| `tests/integration/provisional.rs` | 修正 | `early_media_received` スキップ理由を日本語で詳細化 |
| `tests/integration_test.rs` | 修正 | `#[path]` で interop モジュールを追加 |
| `tests/interop/asterisk.rs` | **新規** | Asterisk 相互接続試験 7 テスト（register/invite/dtmf/codec/hold/transfer/srtp） |
| `tests/interop/freeswitch.rs` | **新規** | FreeSWITCH 相互接続試験 5 テスト（register/invite/dtmf/codec/ice_turn） |
| `docs/interop-matrix.md` | **新規** | 相互接続試験結果マトリクステンプレート |

## 完了項目

### ✅ プレースホルダーテスト解決

- **call_reject**: DualClientContext 実装に置き換え完了。client_b → answer(486) → client_a で CallRejected 確認
- **early_media_received**: スキップ継続。Asterisk Echo が 183 を送出しない制約をコメントで文書化
- **reregister_after_unregister**: 既に実装済み（確認のみ）、問題なし

### ✅ 相互接続試験

- **Asterisk**: 7 テスト作成（register/invite_bye/dtmf_rfc4733/codec_opus_pcmu/hold_unhold/blind_transfer/srtp_sdes）
- **FreeSWITCH**: 5 テスト作成（register/invite_bye/dtmf_sip_info/codec_opus_pcmu/ice_turn）
- 全テスト `#[ignore]` 付与、FreeSWITCH は `FS_HOST` / `FS_SIP_PORT` 環境変数で接続先指定可能

### ✅ ドキュメント

- `docs/interop-matrix.md` 作成：Asterisk（Docker/実機） + FreeSWITCH の PASS/FAIL マトリクステンプレート

### ✅ Layer 2 ユニットテスト

- 既存 55 テスト（runtime/reactor.rs）+ 458 テスト（lib 全体）が全 PASS 確認
- RFC02 §10.1 全10項目は既存テストで網羅済み（新規追加不要）

## コンパイル確認

- `cargo check --tests` → 成功（pjsip feature 無し）
- `cargo test --lib` → 458 passed / 0 failed

## 既知の制約

- `cargo check --features pjsip` は pjsua_backend.rs の pre-existing エラー（12件）により失敗。本チケット非依存
