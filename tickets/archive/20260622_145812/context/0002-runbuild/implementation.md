# 実装サマリ: run/build 時のエディション別アイコン自動生成

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `Makefile` | 修正 | `.PHONY` に `generate-icons` 追加（29行目） |
| `Makefile` | 追加 | `generate-icons` ターゲット（43-66行目） — editions.json のパース、favicon生成、Tauriアイコン生成 |
| `Makefile` | 修正 | `run:` の依存に `generate-icons` 追加（82行目） |
| `Makefile` | 修正 | `build:` の依存に `generate-icons` 追加（90行目） |
| `scripts/generate-favicons.mjs` | 新規 | クロスプラットフォーム favicon 生成スクリプト（sharp + Node.js） |
| `fe/package.json` | 修正 | devDependencies に `sharp@0.34.5` 追加 |

## クロスプラットフォーム対応

| コンポーネント | macOS | Windows | Linux | 使用技術 |
|---------------|-------|---------|-------|---------|
| editions.json パース | ✅ | ✅ | ✅ | Node.js（`JSON.parse`）— `jq` 非依存 |
| Quasar favicon 生成 | ✅ | ✅ | ✅ | sharp（Node.js native addon、全プラットフォーム対応） |
| Tauri アイコン生成 | ✅ | ✅ | ✅ | `cargo tauri icon`（Tauri CLI、全プラットフォーム対応） |

## icongenie 不採用の理由

`@quasar/icongenie` は Node.js v26 で `read-chunk` の戻り値が Uint8Array となり、`buffer.readUInt32BE` が呼び出せずクラッシュする。`sharp` を同等の代替として採用。

## テスト結果

- `make generate-icons EDITION=zasso` ✅
- `make generate-icons EDITION=mycute` ✅
- `make generate-icons EDITION=neco-asovi` ✅
- `make generate-icons EDITION=nonexist` → エラーメッセージ表示 ✅
- 品質チェック（`run-quality-checks.js`）→ 0 issues ✅
