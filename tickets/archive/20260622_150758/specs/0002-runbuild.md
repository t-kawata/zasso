---
ticket_id: 2
title: run/build 時のエディション別アイコン自動生成
slug: generate-icons-on-build
status: reviewed
created_at: 2026-06-09
updated_at: 2026-06-09
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0002-runbuild/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0002-runbuild/review.md
---
# run/build 時のエディション別アイコン自動生成

## Summary

現在の Makefile では `make run` / `make build` 実行時にアイコン生成が行われないため、エディションを切り替えても古いアイコンが残り続ける。`editions.json` に定義された各エディションの `icon_path` を読み取り、`run` / `build` の直前に Tauri 用アイコンと Quasar（フロントエンド）用アイコンの両方を自動生成する `generate-icons` ターゲットを追加する。

## Background

- `editions.json` には mycute / zasso / neco-asovi の3エディションの全メタ情報が定義されており、各エディションに `icon_path`（例: `fe/public/logos/zasso-512.png`）が設定されている（`editions.json:8,19,30`）
- 現在の Makefile の `run`（57行）と `build`（65行）は `write-settings` のみを事前依存としており、アイコン生成は行わない
- `src-tauri/icons/` には現状 zasso 版のアイコンが置かれているが、エディションを `mycute` や `neco-asovi` に切り替えてもアイコンは更新されない
- `fe/public/icons/` にも同様に zasso 版の favicon が置かれている
- 参考プロジェクト（mycute）の `Makefile` には `generate-icons` ターゲット（211-233行）が存在し、`@quasar/icongenie` と `cargo tauri icon` の両方を実行している
- `@quasar/icongenie` は zasso の `fe/package.json` には依存として登録されていないが、`npx -y` で実行可能（mycute 同様）
- `cargo tauri icon` は `cargo-tauri` CLI がインストールされており利用可能

## Scope

以下の変更を行う：

1. **`Makefile`** に `generate-icons` ターゲットを新規追加
   - `editions.json` からカレントエディションの `icon_path` を読み取る
   - `@quasar/icongenie` で Quasar（フロントエンド）アイコンを生成
   - `cargo tauri icon` で Tauri（ネイティブ）アイコンを生成
   - ソース画像の存在チェックなどのガード
2. **`Makefile`** の `run` ターゲットに `generate-icons` を事前依存として追加
   - 現在: `run: write-settings`
   - 変更後: `run: write-settings generate-icons`
3. **`Makefile`** の `build` ターゲットに `generate-icons` を事前依存として追加
   - 現在: `build: write-settings`
   - 変更後: `build: write-settings generate-icons`

## Non-scope

- `editions.json` の内容変更は対象外
- アイコンファイルの Git 追跡管理（.gitignore 変更）は対象外
- アイコン画像そのもののデザインや差し替えは対象外
- フロントエンドビルドプロセス（`pnpm quasar build` / `pnpm dev`）への介入は対象外
- CI/CD パイプライン設定の変更は対象外
- mycute プロジェクトの `pngquant` / `sharp` ワークアラウンドは zasso でも必要か検証してから導入する（現状不要なら実装しない）

## Investigation

### 現状のアイコン関連ファイル構成

| パス | 内容 |
|------|------|
| `editions.json` | 3エディション定義、各々に `icon_path` あり（`Makefile:6` の `EDITION` 変数で選択） |
| `fe/public/logos/` | 各エディションの512x512ロゴ PNG（ソース画像） |
| `fe/public/icons/` | Quasar 用 favicon（現状 zasso 版、4ファイル） |
| `src-tauri/icons/` | Tauri 用アイコン（現状 zasso 版、15ファイル） |
| `fe/package.json` | icongenie 依存なし（`npx -y` で使用） |

### 参考実装: mycute プロジェクトの generate-icons ターゲット（Makefile 211-233行）

```
generate-icons:
    .env から APP_ICON_PATH を読み取り
    └── macOS: pngquant を no-op 化（ワークアラウンド）
    └── Windows: sharp ネイティブバイナリ再ビルド（ワークアラウンド）
    └── (cd web && npx -y @quasar/icongenie generate -i <icon_path> --quality 12)
    └── (cargo tauri icon <icon_path>)
```

### 本プロジェクトとの差異と考慮点

- mycute は `.env` 経由で `APP_ICON_PATH` を渡しているが、zasso は `editions.json` に `icon_path` が格納されている
- mycute は macOS で `pngquant` のバイナリを no-op 化しているが、これは icongenie が内部的に pngquant を呼び出す際の問題への対処。zasso でも同様の問題が発生する可能性がある
- zasso のアイコンソース画像パスは `editions.json` からの相対パス（例: `fe/public/logos/zasso-512.png`）であり、Makefile からはプロジェクトルートからの相対パスとして扱える
- icongenie の `-i` には Makefile からの相対パスを渡す必要がある（mycute は `../$$APP_ICON_PATH` としているが、zasso はプロジェクトルートが Makefile と同じなので `$$ICON_PATH` でよい）

## Test Plan

### ユニットテスト計画

- **対象**: なし
- **理由**: 本チケットの変更対象は Makefile（シェルスクリプト）のみであり、Rust / TypeScript のテスト可能なコードは含まれない
- 新規スクリプト（例: editions.json から icon_path を抽出する Node.js スクリプト）を作成した場合は、そのスクリプトのユニットテストを `scripts/` 配下に追加する

### ユニットテスト不可能な項目（例外）

| 項目 | 理由 |
|------|------|
| アイコン生成コマンドの実行 | `@quasar/icongenie` と `cargo tauri icon` は外部CLIツールであり、ユニットテストで検証不可能。実際のビルド時に成功することを確認する |
| 生成されたアイコンファイルの確認 | ファイルが存在し適切なサイズであることの確認は生成コマンドの実行後にしか行えない。手動テストで検証する |

### 手動テスト計画

1. `make run EDITION=mycute` → 起動後にアプリアイコン・favicon が mycute に切り替わっていることを確認
2. `make run EDITION=neco-asovi` → 同様に neco-asovi のアイコンに切り替わることを確認
3. `make build EDITION=zasso` → zasso のアイコンでビルドが通ることを確認
4. ソース画像が存在しない場合にエラーメッセージが表示されることを確認

## Boy Scout Rule — 翻訳可能性計画

- **Makefile** の `generate-icons` ターゲット内で、複数行のシェルコマンドを一つのブロックで記述するのではなく、 `@echo` で各処理を説明するコメント相当の出力を行う
- エラーハンドリングは各コマンドごとに `|| { echo "..."; exit 1; }` で行い、曖昧な失敗を防ぐ
- 変数名は `ICON_PATH`、`EDITION` などドメイン概念を表現する

## Acceptance Criteria

- [ ] `make run` 実行時に、カレントエディションのアイコンが Quasar（fe/public/icons/）と Tauri（src-tauri/icons/）の両方に自動生成される
- [ ] `make build` 実行時も同様にアイコンが自動生成される
- [ ] `editions.json` の `icon_path` を正しく読み取り、ソース画像が存在しない場合はエラーメッセージを表示して停止する
- [ ] エディション別ショートカット（`run-zasso`, `run-mycute`, `run-neco-asovi`, `build-*`）でも正しくアイコン生成が行われる
- [ ] `make run` / `make build` が期待通り動作する（既存機能の退行がない）
- [ ] 翻訳可能性の検証が通っている
- [ ] 既存テストが通過している

## Notes

<!--
注: このコメントは人間向けの説明である。AI は以下の手順に従うこと。

- plan_path: /plan-ticket が plan.md を作成後に frontmatter に更新する
- implementation_path: /start-ticket が implementation.md を作成後に frontmatter に更新する
- review_report_path: /review-ticket が review.md を作成後に frontmatter に更新する

各コマンドのワークフロー手順が frontmatter 更新の正しい手順である。
-->

### 成果物

- 計画: context/0002-runbuild/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0002-runbuild/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0002-runbuild/review.md（未作成、/review-ticket 全チェック通過後に作成）
