---
ticket_id: 4
title: エディション別アプリ名・識別子の自動切替
slug: edition-aware-app-name
status: done
created_at: 2026-06-09
updated_at: 2026-06-09
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0004-untitled/implementation.md
---
# エディション別アプリ名・識別子の自動切替

## Summary

`editions.json` に定義された3エディション（mycute / zasso / neco-asovi）を切り替えて `make build` したとき、アプリ名（productName）やバンドル識別子（identifier）が常に `zasso` 固定になっている。`write-settings`（`sync-version.mjs`）を拡張し、エディションに応じて `tauri.conf.json` / `settings.rs` / `Cargo.toml` の該当フィールドを自動書き換えする。

## Background

- `editions.json` には各エディションの `display_name` / `slug` / `identifier` / `data_dir` / `repo` が定義されている（例: `mycute`→`MYCUTE`/`com.t-kawata.mycute`）
- 現在の `write-settings`（`sync-version.mjs`）は **バージョン情報のみ** を同期しており、エディション固有のメタ情報は一切書き換えない
- その結果、以下のファイルが常に `zasso` 固定となる：
  - `src-tauri/tauri.conf.json` → `productName: "zasso"`、`identifier: "net.shyme.zasso"`、window `title: "zasso"`
  - `src-tauri/src/consts/settings.rs` → `APP_DISPLAY_NAME = "zasso"`
  - `fe/src/configs/settings.ts` → `EDITION_SLUG` は書き込まれるが、`display_name` などはなし
  - `src-tauri/Cargo.toml` → `[package] name = "zasso"`、`description = "A Tauri App"`
- `build.rs` は `EDITION_SLUG` 環境変数を読み取って `OUT_DIR/generated_constants.rs` に書き込む仕組みが既にある
- `edition.rs` には `current_edition()` が既に実装されており、`editions.json` からカレントエディションの全設定を取得可能

## Scope

`write-settings`（`scripts/sync-version.mjs`）を拡張し、エディションに応じて以下を自動書き換えする：

1. **`src-tauri/tauri.conf.json`**:
   - `productName` → カレントエディションの `display_name`
   - `identifier` → カレントエディションの `identifier`
   - `window[0].title` → カレントエディションの `display_name`
2. **`src-tauri/src/consts/settings.rs`**:
   - `APP_DISPLAY_NAME` → カレントエディションの `display_name`
   - 必要に応じて `APP_IDENTIFIER` / `APP_SLUG` の定数を追加
3. **`fe/src/configs/settings.ts`**:
   - 既存の `EDITION_SLUG` / `OS_TYPE` / `APP_VERSION` に加えて、`APP_DISPLAY_NAME` を追加
4. **`src-tauri/Cargo.toml`**:
   - `[package] name` → カレントエディションの `slug`（crate名）
   - `[package] description` → カレントエディションの `app_caption`

## Non-scope

- `editions.json` 自体の拡張・変更は対象外
- データディレクトリ（`data_dir`）の切り替えは対象外（ランタイム動作）
- GitHub Releases 設定の変更は対象外
- アイコン生成・インストーラー配置の変更は対象外（別チケットで対応済み）

## Investigation

### エディション情報の現在の流れ

```
Makefile EDITION=zasso
  ↓ EDITION_SLUG 環境変数
  ├── write-settings (sync-version.mjs)
  │     └── version のみ tauri.conf.json / fe/package.json / fe/settings.ts へ書き込み
  │     └── editions.json の display_name/identifier は未使用
  ├── build.rs (cargo build 時)
  │     └── EDITION_SLUG と OS_TYPE を OUT_DIR/generated_constants.rs へ書き込み
  ├── edition.rs (Rust runtime)
  │     └── editions.json から current_edition() で全メタ情報を取得可能
  └── cargo tauri build
        └── tauri.conf.json の productName/identifier を参照（→ 常に zasso）
```

### 各ファイルの固定値とエディション対応表

| ファイル・フィールド | 現在の固定値 | mycute 時 | zasso 時 | neco-asovi 時 |
|---|---|---|---|---|
| `tauri.conf.json` `productName` | `zasso` | `MYCUTE` | `zasso` | `NECO-ASOVI` |
| `tauri.conf.json` `identifier` | `net.shyme.zasso` | `com.t-kawata.mycute` | `net.shyme.zasso` | `com.t-kawata.neco-asovi` |
| `tauri.conf.json` `windows[0].title` | `zasso` | `MYCUTE` | `zasso` | `NECO-ASOVI` |
| `settings.rs` `APP_DISPLAY_NAME` | `zasso` | `MYCUTE` | `zasso` | `NECO-ASOVI` |
| `Cargo.toml` `[package] name` | `zasso` | `mycute` | `zasso` | `neco-asovi` |
| `Cargo.toml` `[package] description` | `A Tauri App` | editions.json の `app_caption` | editions.json の `app_caption` | editions.json の `app_caption` |

### editions.json の該当値

| エディション | display_name | slug | identifier | app_caption |
|------------|-------------|------|-----------|------------|
| zasso | zasso | zasso | net.shyme.zasso | The truest form of thriving can be found in the weeds. |
| mycute | MYCUTE | mycute | com.t-kawata.mycute | Growing hearts of sweet AI kids, only for you. |
| neco-asovi | NECO-ASOVI | neco-asovi | com.t-kawata.neco-asovi | Networked ECOsystem for Agentic AI SOVereign, In vitro. |

### sync-version.mjs の責務拡張方針

現在の `sync-version.mjs` は「バージョンの同期」のみ。これを「エディションメタ情報の同期」に拡張する。スクリプトに `EDITION_SLUG` 環境変数が渡されているため、`editions.json` を読み込んで該当エディションの全フィールドを各ファイルに書き込む。

### Cargo.toml 書き換えの注意点

`[package] name` を書き換えると **target ディレクトリ以下のコンパイルキャッシュが無効化** される（cargo が crate 名の変更として扱う）。これはエディション切替時に完全ビルド（キャッシュミス）が発生することを意味する。しかし `[package] name` はバンドル名やインストーラー名に直接影響しないため、**書き換えは必須ではない**という判断もありえる。ユーザーが明示的に質問しているので、一案として実装するが、優先度は低い。

## Test Plan

### ユニットテスト計画

- **対象**: `scripts/sync-version.mjs` の拡張部分（Node.js）
- **内容**: editions.json の読み取り、各ファイルへの書き込みロジックの正常系・異常系
- **ツール**: 既存のテストフレームワークは未導入のため、`node assert` による簡易テストで代用

### ユニットテスト不可能な項目（例外）

| 項目 | 理由 |
|------|------|
| cargo tauri build の実際の動作 | 外部CLIツールのためユニットテスト不能 |

### 手動テスト計画

1. `make build EDITION=mycute` → 生成された DMG の名前が `MYCUTE_0.24.237_aarch64.dmg` になること
2. `make build EDITION=neco-asovi` → identifier が `com.t-kawata.neco-asovi` になること
3. `make build EDITION=zasso` → `net.shyme.zasso` に戻ること
4. `make run EDITION=mycute` → ウィンドウタイトルが `MYCUTE` になること

## Boy Scout Rule — 翻訳可能性計画

- `sync-version.mjs` の責務を「バージョン同期」から「エディションメタ情報同期」に拡大するにあたり、関数分割を行い、一関数一責務を徹底する
- `updateTauriConf()`、`updateSettingsRs()`、`updateFeSettings()`、`updateCargoToml()` のように、更新対象ファイルごとに関数を分割する

## Acceptance Criteria

- [ ] `make build EDITION=mycute` で、インストーラーの productName が `MYCUTE` になる
- [ ] `make build EDITION=neco-asovi` で、identifier が `com.t-kawata.neco-asovi` になる
- [ ] `make build EDITION=zasso` で元の値（zasso / net.shyme.zasso）に戻る
- [ ] `make run` でも同様にウィンドウタイトルが切り替わる
- [ ] `settings.rs` の `APP_DISPLAY_NAME` がエディションに応じて変化する
- [ ] エディション別ショートカット（`build-mycute` 等）でも正しく動作する
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

- 計画: context/0004-edition-aware-app-name/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0004-edition-aware-app-name/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0004-edition-aware-app-name/review.md（未作成、/review-ticket 全チェック通過後に作成）
