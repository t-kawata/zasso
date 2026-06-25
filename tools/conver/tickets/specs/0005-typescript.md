---
ticket_id: 5
title: TypeScriptプロジェクトスキャフォールディング
slug: typescript
status: draft
created_at: 2026-06-25
updated_at: 2026-06-25
---
# TypeScriptプロジェクトスキャフォールディング

## Summary

conver.js の TypeScript ビルド基盤を作成する。tsconfig.json で strict モードのコンパイル設定を定義し、package.json に依存関係とビルドスクリプトを設定、Makefile に build-conver / run-conver ターゲットを追記する。

## Background

conver.js は `@agentclientprotocol/claude-agent-acp` SDK を使用して Claude Code の ACP セッションをプログラムから制御するパイプラインである。TypeScript で記述され、`tsc` により JavaScript にコンパイルされて実行される。

現状、以下のファイルが存在しないためビルド基盤が未整備である：
- `package.json` — 依存関係管理・ビルドスクリプト
- `tsconfig.json` — TypeScript コンパイル設定
- `src/` — ソースコード配置ディレクトリ
- Makefile の build-conver / run-conver ターゲット（現状は `list-tickets` のみ）

本チケットはこれらを整備し、後続の全モジュール実装（P1〜P4）が即座にビルド・テストできる基盤を提供する。

## Scope

### tsconfig.json
- target: ES2022（Node.js 18+ のネイティブサポート範囲）
- module: NodeNext（Node.js ESM に準拠したモジュール解決）
- moduleResolution: NodeNext
- strict: true（厳格な型チェック）
- outDir: dist、rootDir: src
- esModuleInterop: true（CommonJS モジュールとの相互運用性）
- skipLibCheck: true（型定義ファイルのチェックをスキップしビルド高速化）
- forceConsistentCasingInFileNames: true（大文字小文字の一貫性を強制）
- declaration: false（型定義ファイルは生成不要）
- sourceMap: false（運用時にソースマップは不要）

### package.json
- name: "conver"、private: true
- type: "module"（ESM モジュールとして出力）
- scripts: build（tsc）、clean（rm -rf dist）
- dependencies: @agentclientprotocol/sdk@^1.0.0（ACP セッション制御）
- devDependencies: typescript@^5.4.0

### Makefile ターゲット
- `build-conver`: tools/conver で `npm run build` を実行
- `run-conver`: tools/conver で `node dist/conver.js $(ARGS)` を実行

### ソースファイルの初期準備
- `src/` ディレクトリの作成
- `src/error.ts` — `CommandTimeoutError` クラス（後続 P0-2 で具体化予定だがスキャフォールディングとして作成し、[::STUB::] マーカーを付与）
- `src/conver.ts` — エントリポイント（空の main() 関数、[::STUB::] マーカーを付与）
- その他 src/*.ts ファイルはスキャフォールディング時には空のスタブとして作成

## Non-scope

- 各モジュールの本実装（P0-2: error.ts、P0-3: cli.ts、P1〜P4 でそれぞれ実施）
- `npm install` の自動実行（手動実行を前提とする）
- CI/CD パイプラインの設定
- ESLint / Prettier 等のリンター設定

## Investigation

### 現状のプロジェクト構成

```
$ ls tools/conver/
Makefile              RFC_ROOT.md           Tickets.json
.claude/              install.js            test.sh
tickets/              node_modules/         package-lock.json
```

- `package.json` が存在しない
- `tsconfig.json` が存在しない
- `src/` ディレクトリが存在しない
- Makefile の内容は `list-tickets` ターゲットのみ

### RFC_ROOT.md での定義

RFC_ROOT.md 961-977行に tsconfig.json、983-996行に package.json の完全な定義が存在する。

**tsconfig.json 定義:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": false,
    "sourceMap": false
  },
  "include": ["src/**/*.ts"]
}
```

**package.json 定義:**
```json
{
  "name": "conver",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@agentclientprotocol/sdk": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

### Makefile に追加すべきターゲット定義（RFC_ROOT.md）

```
build-conver:
	cd tools/conver && npm run build

run-conver:
	cd tools/conver && node dist/conver.js $(ARGS)
```

## Test Plan

### ユニットテスト計画

本チケットはビルド基盤の構築が目的であり、テストは「ビルドが通ること」を検証する確認に集約される。

| テスト対象 | 内容 | 種別 |
|---|---|---|
| `npm run build` | tsc がエラーなく完了し dist/ に JavaScript が生成される | ビルド検証 |
| `npm run clean` | dist/ が削除される | ビルド検証 |
| `tsc --noEmit` | 型エラーがゼロであること | 静的検証 |

### ユニットテスト不可能な項目（例外）

| 項目 | 理由 |
|---|---|
| `npm run build` の成功 | 外部プロセス（tsc）の実行結果に依存するためユニットテストでは検証不可 |
| `Makefile` ターゲットの動作 | Make コマンドの実行結果はシェルスクリプトレベルで検証する範囲 |
| `@agentclientprotocol/sdk` の解決 | npm パッケージのインストール状態に依存するため |

## Boy Scout Rule — 翻訳可能性計画

このチケットで作成するファイル（tsconfig.json, package.json, Makefile）は設定ファイルであり、プログラムロジックを含まない。そのため翻訳可能性ルールの直接適用対象外だが、以下の点に留意する：

- Makefile ターゲット名は動詞句（`build-conver`, `run-conver`, `list-tickets`）で統一
- package.json の scripts も同様に動詞句で統一（`build`, `clean`）
- スタブコード（src/error.ts, src/conver.ts）には `[::STUB::]` マーカーを必ず付与する

新規作成ファイルのみが対象のため、既存コードの改善は発生しない。

## Acceptance Criteria

- [ ] `tsconfig.json` が作成され、strict モードで ES2022/NodeNext が設定されている
- [ ] `package.json` が作成され、`@agentclientprotocol/sdk` 依存と `tsc` ビルドスクリプトが定義されている
- [ ] `make build-conver` で `dist/conver.js` が生成される
- [ ] `npm install && npm run build` がエラーなく完了する
- [ ] `src/` ディレクトリが作成され、各ソースファイルのスタブが配置されている
- [ ] 全てのスタブに `[::STUB::]` マーカーが付与されている
- [ ] 犯罪スキャン（scan-crimes.sh）で未解決の犯罪がゼロである

## Notes

- plan: /plan-ticket が計画を策定し、チケットの JSON フィールド（scope, testVerification, notes）に保存する
- implementation: /start-ticket が実装サマリーをチケットの JSON フィールド（changes, notes）に保存する
- review: /review-ticket がレビュー報告をチケットの JSON フィールド（instrumentation, notes）に保存する

### 依存関係
- **先行依存**: なし（Layer 0 の基盤整備）
- **後続チケット**: P0-2（エラー型定義）、P0-3（CLI引数パース）、P1〜P4 の全チケット
- **関連チケット**: PX-4（install.js — 同じ tools/conver ディレクトリを操作するためコンフリクト注意）
