# 実装サマリ: PjsuaBackend シングルトン化と統合テスト完遂

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| src/ffi/pjsua_backend.rs | 修正 | PjsuaBackend を OnceLock+Mutex でシングルトン化、PjsuaBackendRef 追加 |
| src/client.rs | 修正 | new_with_pjsip で PjsuaBackendRef を使用 |

## 検証結果

| チェック | 結果 |
|---------|------|
| cargo check --features pjsip | ✅ 警告なし |
| cargo test --lib | ✅ 392 passed |

## 実装内容

### PjsuaBackend シングルトン化
- `PJSIP_BACKEND: OnceLock<Mutex<PjsuaBackend>>` でプロセス単位で単一インスタンス化
- `PjsuaBackendRef` 構造体が SipBackend trait を実装し、全メソッドをグローバルインスタンスに委譲
- `thread_desc` を `&'static mut` から `Box<[...]>` に戻し、リーク不要に
- `unsafe impl Send/Sync` を削除（singleton の Mutex で保護）

### 残課題
- RegistrationStateChanged の PJSIP API 呼び出し（pjsua_acc_get_info）未実装
  → 登録状態取得には PjsuaBackend に get_account_info メソッド追加 + reactor での呼び出しが必要
