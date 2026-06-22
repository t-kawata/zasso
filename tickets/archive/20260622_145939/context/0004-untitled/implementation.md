# 実装サマリ: エディション別アプリ名・識別子の自動切替

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `scripts/sync-version.mjs` | 修正 | 関数分割＋エディションメタ情報の全ファイル同期を追加 |
| `src-tauri/src/consts/settings.rs` | 修正 | `APP_IDENTIFIER`, `APP_SLUG` 定数を追加 |

## sync-version.mjs の責務拡張

| 関数 | 更新対象 | 新規/既存 |
|------|---------|----------|
| `readEditionConfig()` | editions.json からエディション設定を取得 | 新規 |
| `updateTauriConf()` | version, productName, identifier, window[0].title | 既存拡張 |
| `updateFePackage()` | version のみ | 既存(変更なし) |
| `updateFeSettings()` | EDITION_SLUG, OS_TYPE, APP_VERSION, APP_DISPLAY_NAME | 既存拡張 |
| `updateSettingsRs()` | APP_DISPLAY_NAME, APP_IDENTIFIER, APP_SLUG | 新規 |
| `updateCargoToml()` | [package] name, description | 新規 |

## テスト結果

| テストケース | 結果 |
|------------|------|
| `EDITION_SLUG=zasso` → productName=zasso, identifier=com.t-kawata.zasso | ✅ |
| `EDITION_SLUG=mycute` → productName=MYCUTE, identifier=com.t-kawata.mycute | ✅ |
| `EDITION_SLUG=neco-asovi` → productName=NECO-ASOVI, identifier=com.t-kawata.neco-asovi | ✅ |
| `EDITION_SLUG=nonexist` → エラーメッセージ表示 + exit 1 | ✅ |
| `make check` (cargo check) → 成功 | ✅ |
| `make test` (cargo test) → 0 passed | ✅ |
| 品質チェック (run-quality-checks.js) → 0 issues | ✅ |
