# 実装サマリ: PjsuaBackend 結合障壁除去（credential + thread）

## 変更ファイル

| ファイル | 種別 | 内容 |
|---------|------|------|
| `src/ffi/pjsua_backend.rs` | 修正 | credential 設定追加 + thread 登録追加 + 構造体フィールド追加 |

## 修正内容

### 1. credential 対応
- `secrecy::ExposeSecret` を import 追加
- `pjsua_acc_config.cred_info[0]` の各フィールド（realm, scheme, username, data_type, data, algorithm_type）を設定
- `cred_count = 1` に設定（これまで 0 だったため認証が常に失敗していた）
- 発見: `pjsip_cred_info` は opaque ではなく、bindgen が全フィールドを生成済みだった

### 2. PJSIP 外部スレッド登録
- `PjsuaBackend` 構造体に `thread_desc: Option<Box<[c_long; 64]>>` フィールド追加
- `initialize()` 内で `pjsua_create()` 成功直後に `pj_thread_register("siprs-reactor", ...)` を呼び出し
- 記述子の寿命を構造体フィールドで保持

## 検証結果（Docker Asterisk 接続）

| テスト | 結果 | 証明するもの |
|-------|------|------------|
| register::register_succeeds | ✅ | credential 設定が有効、REGISTER 成功 |
| register::register_fails_with_wrong_password | ✅ | 誤パスワードで RegistrationFailed |
| account::dual_account_simultaneous_call | ✅ | スレッド登録有効、SIGABRT なし |
| cargo test --lib | ✅ 392 passed | 既存テストに影響なし |
| cargo check --features pjsip | ✅ | コンパイル正常 |
