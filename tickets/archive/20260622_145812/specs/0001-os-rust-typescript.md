---
ticket_id: 1
title: ビルド時のエディション/OS情報を Rust 定数と TypeScript 設定に同時注入する
slug: os-rust-typescript
status: reviewed
created_at: 2026-06-09
updated_at: 2026-06-09
plan_path: /Users/kawata/shyme/zasso/tickets/context/0001-os-rust-typescript/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0001-os-rust-typescript/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0001-os-rust-typescript/review.md
---
# ビルド時のエディション/OS情報を Rust 定数と TypeScript 設定に同時注入する

## Summary

Makefile からエディション slug（`EDITION_SLUG`）と OS 種別を受け取り、**Rust**（`src-tauri/src/consts/`、`OUT_DIR` 経由）と **TypeScript**（`fe/src/configs/settings.ts`）の両方にビルド時に自動書き込みする。両ファイルが常に同一の値を持つことを保証する。

## Background

- `editions.json`（プロジェクトルート）に mycute / zasso / neco-asovi の3エディションの全メタ情報が定義されているが、Rust コードからこれを参照する仕組みがない
- `src-tauri/src/consts/constants.rs` は空ファイルとして準備されているがモジュール未宣言
- `fe/src/configs/settings.ts` には `EDITION_KEY = "zasso"` がハードコードされている（editions.json のキーと同じ値だが、更新時に手動同期が必要）
- Makefile にはエディション指定の概念がなく、`make build` が OS に応じたバンドル形式を選べない
- エディション切り替え時にフロントエンドとバックエンドの設定が乖離するリスクがある

## Scope

以下の5ファイルを変更し、エディション/OS情報のビルド時自動注入を実現する：

1. **`src-tauri/build.rs`** — EDITION_SLUG + CARGO_CFG_TARGET_OS を読み取り、`OUT_DIR/generated_constants.rs` を生成
2. **`src-tauri/src/consts/mod.rs`** — 新規作成。`include!()` で OUT_DIR の生成ファイルを取り込み、`include_str!()` で editions.json をバイナリ埋め込み、`current_edition() -> Result` を提供
3. **`src-tauri/src/lib.rs`** — `mod consts;` を追加
4. **`Makefile`** — `build` ターゲットを1本化（OS自動検出）、`run`/`build` 時に settings.ts を自動生成
5. **`fe/src/configs/settings.ts`** — ファイルを生成対象に変更（冒頭に自動生成マーク、`.gitignore` に追加）

## Non-scope

- `tauri.conf.json` の `productName` / `identifier` の動的生成は対象外（別チケット）
- `editions.json` の内容変更は対象外
- `build-mac` / `build-win` / `build-linux` ターゲットの削除はしない（クロスコンパイル時の明示的指定用として残す）
- GitHub Actions 等の CI 設定は対象外

## Investigation

### 現状のファイル構成

| ファイル | 状態 |
|----------|------|
| `src-tauri/src/consts/constants.rs` | 空ファイル（1バイト） |
| `src-tauri/src/consts/mod.rs` | **存在しない** |
| `src-tauri/src/lib.rs` | モジュール宣言なし（`consts` 未宣言） |
| `src-tauri/build.rs` | `tauri_build::build()` のみ |
| `fe/src/configs/settings.ts` | `export const EDITION_KEY = "zasso";`（ハードコード） |
| `fe/src/configs/` | `settings.ts` のみ |
| `editions.json` | 3エディション定義（mycute / zasso / neco-asovi）完備 |
| `.gitignore`（root） | 生成ファイル用のパターンなし |
| `.gitignore`（src-tauri/） | `target/` と `gen/schemas` のみ |

### エディションslugと実際のtauri.conf.jsonの乖離

- `editions.json` の zasso.identifier = `"com.t-kawata.zasso"`
- `tauri.conf.json` の identifier = `"net.shyme.zasso"`
- 現時点では tauri.conf.json は別管理だが、本チケットでは変更しない

### Makefile 現状

```makefile
run:       cargo tauri dev
build-mac: cargo tauri build --bundles dmg
build-win: cargo tauri build --bundles nsis
build-linux: cargo tauri build --bundles appimage
```

- エディション指定なし
- `make build`（単一ターゲット）なし
- OS自動検出なし

### settings.ts 現状

```typescript
export const EDITION_KEY = "zasso";
```

- `EDITION_KEY` という名前（slug と概念一致だが命名に揺れがある）
- ハードコードされておりビルド時に動的変更不可能
- 変数名を `EDITION_SLUG` に統一すべき

### 既存serde依存

`Cargo.toml` には既に `serde = { version = "1", features = ["derive"] }` と `serde_json = "1"` が追加済み。新しい依存クレートは不要。

## Test Plan

### Rust 側の検証（暗黙的コンパイルチェック）

| # | ケース | 検証方法 |
|---|--------|----------|
| 1 | `EDITION_SLUG=zasso make build` でコンパイル成功 | `make build` が pass する |
| 2 | `EDITION_SLUG=mycute make build` でコンパイル成功 | 同上 |
| 3 | `EDITION_SLUG=neco-asovi make build` でコンパイル成功 | 同上 |
| 4 | `EDITION_SLUG` 未設定でもデフォルト "zasso" でビルド成功 | `make build`（EDITION 未指定）が pass |
| 5 | `OUT_DIR/generated_constants.rs` が生成され、`EDITION_SLUG` と `OS_TYPE` を含む | `find target -name generated_constants.rs -exec cat {} \;` で確認 |
| 6 | `current_edition()` が正しい EditionConfig を返す | コードに一時的なログ出力を入れて確認 |

### TypeScript 側の検証

| # | ケース | 検証方法 |
|---|--------|----------|
| 7 | `make build` 後に settings.ts に `EDITION_SLUG` と `OS_TYPE` が正しく書き込まれる | `cat fe/src/configs/settings.ts` で確認 |
| 8 | `make build EDITION=mycute` で値が "mycute" になる | 同上 |
| 9 | `make run` でも settings.ts が同様に更新される | `make run`（起動後すぐ停止）→ settings.ts 確認 |

### 同期検証

| # | ケース | 検証方法 |
|---|--------|----------|
| 10 | Rust 定数と TypeScript 設定の値が一致する | `make build` 後、両ファイルの EDITION_SLUG 値を diff |

### 異常系

| # | ケース | 期待結果 |
|---|--------|----------|
| 11 | 存在しないエディション slug（`EDITION_SLUG=hoge`） | Rust はビルド成功するが、`current_edition()` が `Err` を返す。TypeScript 側は値が書き込まれる（実行時に editions.json の参照がないためこの値が使われる） |
| 12 | editions.json が存在しない・壊れている | コンパイルエラー（`include_str!` が失敗する）になる |

## Boy Scout Rule — 翻訳可能性計画

- `constants.rs` の変数名: `EDITION_SLUG`（ハードコードされた文字列ではなく名前付き定数）
- `settings.ts` の変数名: 現状 `EDITION_KEY` → `EDITION_SLUG` に統一（`editions.json` のキーとしての役割を関数名が正確に表現）
- `current_edition()`: 関数名が「現在のエディションを取得する」と読める
- Build.rs: `unwrap_or_else` で「環境変数がなければデフォルトを使う」というポリシーを明示（`unwrap` ではない）
- Makefile: 変数名を散文として読めるように（`EDITION`, `BUNDLE`, `UNAME_S`）

## Acceptance Criteria

- [ ] `make build`（EDITION 未指定）で zasso edition のビルドが成功する
- [ ] `make build EDITION=mycute` で mycute edition のビルドが成功する
- [ ] `make build` が実行OSに応じて適切なバンドル形式（macOS→dmg, Windows→nsis, Linux→appimage）を自動選択する
- [ ] `src-tauri/src/consts/` から `EDITION_SLUG` と `OS_TYPE` が参照可能
- [ ] `current_edition()` が `Result` を返し、エラー時にパニックしない
- [ ] `fe/src/configs/settings.ts` から `EDITION_SLUG` と `OS_TYPE` が参照可能（Rust 側と値が一致）
- [ ] `settings.ts` は Makefile の `run` および `build` ターゲット実行時に自動生成される
- [ ] ソースツリーに生成ファイルを書き込まない（Rust 側は OUT_DIR、TypeScript 側は `.gitignore` で管理）
- [ ] `unwrap()` / `expect()` を使用していない
- [ ] 既存の `build-mac` / `build-win` / `build-linux` ターゲットが引き続き動作する

## Notes

### 成果物

- 計画: context/0001-os-rust-typescript/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0001-os-rust-typescript/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0001-os-rust-typescript/review.md（未作成、/review-ticket 全チェック通過後に作成）

### 既存 Plan との関係

本チケットは `elegant-sniffing-torvalds.md` の内容を包含し、TypeScript 側（settings.ts）の対応を追加したものである。
