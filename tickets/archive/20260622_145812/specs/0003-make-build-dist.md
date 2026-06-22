---
ticket_id: 3
title: make build 後のインストーラー自動検証・dist配置
slug: installer-dist-deploy
status: reviewed
created_at: 2026-06-09
updated_at: 2026-06-09
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0003-make-build-dist/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0003-make-build-dist/review.md
---
# make build 後のインストーラー自動検証・dist配置

## Summary

現在の `make build` は `cargo tauri build --bundles <type>` を実行するだけで終了し、インストーラーが実際に生成されたかどうかの検証や、成果物の dist/ への整理を行わない。

`make build` 完了後に以下の処理を自動実行する：

1. インストーラーファイルが期待通り生成されたか検証する
2. `dist/<os>/v<version>/` ディレクトリを作成する
3. インストーラーを所定の命名規則でコピーする
4. コピー成功を確認し、cyan で完了メッセージを表示する
5. 途中でエラーが発生した場合は red でエラーメッセージを表示して停止する

## Background

- 現在の `make build` ターゲット（90-91行）は単に `cargo tauri build --bundles $(BUNDLE)` を実行するだけで、その後の後処理は一切行わない
- Tauri のビルド成果物は `src-tauri/target/release/bundle/<type>/` に配置されるが、ここに置きっぱなしだとバージョン管理やリリース作業が煩雑になる
- `dist/` ディレクトリは既に存在するが空（`ls dist/` で何もなし）
- バージョンは `src-tauri/src/consts/settings.rs` の `APP_VERSION` が唯一の情報源（現在 `v0.24.237`）
- エディション切り替え（`make build EDITION=mycute`）が行われた場合、`editions.json` の `display_name` をファイル名に反映する必要がある
- リリース業務（`gh release`）の前に dist/ に成果物が揃っていることを前提としたフローが今後必要になる

## Scope

以下の変更を `Makefile` の `build` ターゲットおよび新規スクリプトに行う：

1. **`Makefile` の `build` ターゲットを拡張**: `cargo tauri build` の後処理として、インストーラー検証・dist 配置・完了報告を追加
2. **新規スクリプト `scripts/deploy-installer.mjs`（またはインライン処理）**: 以下の処理を担当
   - settings.rs からバージョン文字列（`v0.24.237`）を抽出
   - エディション slug から `display_name` を editions.json 経由で解決
   - OS 種別（mac/win/linux）を環境から判定
   - アーキテクチャ名（`aarch64` / `x86_64` / `x64`）を判定
   - Tauri のバンドル出力パスからインストーラーを発見
   - `dist/<os>/<version>/` ディレクトリを作成
   - `<os>-<version>-<arch>.<ext>` の命名規則でコピー
   - 成功/失敗のステータスを cyan/red で表示

## Non-scope

- `cargo tauri build` 自体の挙動変更は対象外
- GitHub Releases へのアップロード（`gh release`）は対象外
- 過去バージョンの dist 管理・クリーンアップは対象外
- インストーラーの内容検証（署名確認、インストールテスト等）は対象外
- クロスコンパイル（macOS 上で Windows ビルド等）は対象外 — あくまで現在の OS のビルドのみ

## Investigation

### 現状の build ターゲット（Makefile 89-91行）

```makefile
# 現在のOS用にビルド（make build EDITION=mycute でエディション指定）
build: write-settings generate-icons
	EDITION_SLUG=$(EDITION) cargo tauri build --bundles $(BUNDLE)
```

- `$(BUNDLE)` は `Makefile:12-19` で OS 種別に応じて定義:
  - macOS → `dmg`
  - Linux → `appimage`
  - Windows → `nsis`
- 完了後は何もせずそのまま終了する

### Tauri bundle の出力パス（実機確認 macOS）

```
src-tauri/target/release/bundle/dmg/
├── bundle_dmg.sh      # DMG 生成スクリプト（Tauri 内部用）
├── icon.icns          # アイコン（DMG 用）
└── zasso_0.24.237_aarch64.dmg    # ★ インストーラー本体
```

- ファイル名: `<productName>_<version>_<arch>.dmg`
  - `productName`: `tauri.conf.json` の値（例: `zasso`）
  - `version`: `tauri.conf.json` の値（例: `0.24.237`、v 無し）
  - `arch`: OS のアーキテクチャ（`aarch64`, `x86_64` 等）

### 理論上の他プラットフォーム出力（未実機確認）

| OS | BUNDLE | バンドルディレクトリ | 推定ファイル名パターン |
|----|--------|---------------------|----------------------|
| macOS | dmg | `bundle/dmg/` | `<productName>_<version>_<arch>.dmg` |
| Windows | nsis | `bundle/nsis/` | `<productName>_<version>_<arch>.exe` |
| Linux | appimage | `bundle/appimage/` | `<productName>_<version>_<arch>.AppImage` |

### バージョンの情報源

- **Rust 側（唯一の情報源）**: `src-tauri/src/consts/settings.rs` → `APP_VERSION = "v0.24.237"`（v 接頭辞あり）
- **tauri.conf.json**: `"version": "0.24.237"`（v 接頭辞なし、write-settings で同期）
- **fe/src/configs/settings.ts**: `APP_VERSION = "v0.24.237"`（v 接頭辞あり）

### アーキテクチャ名の対応

| `uname -m` 出力 | 期待するファイル名上の表記 |
|----------------|------------------------|
| `arm64` | `aarch64` |
| `x86_64` | `x86_64` |
| Windows `AMD64` | `x64` |

### editions.json の display_name

| edition | display_name |
|---------|-------------|
| zasso | zasso |
| mycute | MYCUTE |
| neco-asovi | NECO-ASOVI |

### 要求される dist 構造（ユーザー仕様）

```
dist/<os>/v0.24.237/
└── <os>-<edition>-v0.24.237-<arch>.<ext>
```

例（macOS, arm64, zasso edition）:
```
dist/mac/v0.24.237/
└── mac-zasso-v0.24.237-aarch64.dmg
```

### 動作イメージ

```
make build EDITION=zasso
  → write-settings
  → generate-icons
  → cargo tauri build --bundles dmg  ... (20秒〜数分)
  → ✅ インストーラーを検証・コピー中...
  → 🌀 dist/mac/v0.24.237/mac-zasso-v0.24.237-aarch64.dmg を作成しました
  → ✅ Build and deploy complete.
```

エラー時:
```
make build EDITION=nonexist
  → write-settings
  → generate-icons
  → cargo tauri build ...  (正常完了)
  → 🔴 Error: Installer not found at src-tauri/target/release/bundle/dmg/
```

## Test Plan

### ユニットテスト計画

- **対象**: なし
- **理由**: 本チケットの変更対象は Makefile（シェルスクリプト）および小さな Node.js スクリプトのみであり、テスト可能な Rust / TypeScript のコードは含まれない

### ユニットテスト不可能な項目（例外）

| 項目 | 理由 |
|------|------|
| `cargo tauri build` の成否 | 外部CLIツールのためユニットテスト不能 |
| インストーラーファイルの存在確認 | 実際のビルド後にしか確認できない |
| ファイルコピーの成否 | ファイルシステム操作のためユニットテストには不向き（Makefile のシェルで完結） |

### 手動テスト計画

1. 現在地: macOS → `make build` → `dist/mac/v0.24.237/mac-zasso-v0.24.237-aarch64.dmg` が作成される
2. エラーケース: Tauri build に失敗した場合、red メッセージで終了
3. ファイル破損ケース: build 成功後、インストーラーファイルが存在しない場合、red メッセージで終了

## Boy Scout Rule — 翻訳可能性計画

- Makefile の build ターゲットを「ビルド実行」「検証」「配置」「報告」の責務に分割し、各処理を `@echo` で明示する
- エラーメッセージは具体的なファイルパスを含め、何が失敗したか一目でわかるようにする
- 変数名は `INSTALLER_SOURCE`、`DIST_DIR`、`VERSION_TAG` などドメイン概念を表現する

## Acceptance Criteria

- [ ] `make build` 実行後、インストーラーが `dist/<os>/v<version>/<os>-<edition>-v<version>-<arch>.<ext>` にコピーされる
- [ ] コピー成功時、cyan 色で `✅ Build and deploy complete: dist/...` と表示される
- [ ] インストーラーが見つからない場合、red 色でエラーメッセージが表示され `exit 1` する
- [ ] `cargo tauri build` が失敗した場合、そのエラーが表示され後続処理は実行されない
- [ ] エディション別ショートカット（`build-zasso`, `build-mycute`, `build-neco-asovi`）でも正しく動作する
- [ ] 既存の `make check` / `make test` が通過している
- [ ] 翻訳可能性の検証が通っている

## Notes

<!--
注: このコメントは人間向けの説明である。AI は以下の手順に従うこと。

- plan_path: /plan-ticket が plan.md を作成後に frontmatter に更新する
- implementation_path: /start-ticket が implementation.md を作成後に frontmatter に更新する
- review_report_path: /review-ticket が review.md を作成後に frontmatter に更新する

各コマンドのワークフロー手順が frontmatter 更新の正しい手順である。
-->

### 成果物

- 計画: context/0003-make-build-dist/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0003-make-build-dist/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0003-make-build-dist/review.md（未作成、/review-ticket 全チェック通過後に作成）
