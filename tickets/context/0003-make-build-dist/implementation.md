# 実装サマリ: make build 後のインストーラー自動検証・dist配置

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `Makefile` | 修正 | `build` ターゲットに deploy-installer.mjs の後処理を追加（92行目） |
| `scripts/deploy-installer.mjs` | 新規 | インストーラー検証・dist 配置・報告を行うクロスプラットフォームスクリプト |

## スクリプトの責務（deploy-installer.mjs）

| 処理 | 実装 |
|------|------|
| バージョン抽出 | `settings.rs` の `APP_VERSION` を正規表現で取得（例: `v0.24.237`） |
| OS 判定 | `process.platform` → `darwin`→mac, `win32`→win, `linux`→linux |
| アーキテクチャ | `process.arch` → `arm64`→aarch64, `x64`→x86_64(x64 on win) |
| バンドル種別 | OS から自動導出（mac→dmg/dmg, win→nsis/exe, linux→appimage/AppImage） |
| インストーラー発見 | `bundle/<type>/` をスキャン、該当拡張子のファイルを特定 |
| dist 配置 | `dist/<os>/v<version>/<os>-<edition>-v<version>-<arch>.<ext>` にコピー |
| 結果表示 | 成功 → cyan、失敗 → red |

## テスト結果

- `EDITION_SLUG=zasso node scripts/deploy-installer.mjs` → `dist/mac/v0.24.237/mac-zasso-v0.24.237-aarch64.dmg` 作成 ✅
- `EDITION_SLUG=mycute node scripts/deploy-installer.mjs` → `mac-mycute-v0.24.237-aarch64.dmg` 作成 ✅
- 存在しない bundle ディレクトリ → red エラーで exit 1 ✅
- 品質チェック（run-quality-checks.js）→ 0 issues ✅
