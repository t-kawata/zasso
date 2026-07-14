---
ticket_id: 15
title: conver.js 単一ファイルバンドル構築
slug: converjs
status: draft
created_at: 2026-06-26
updated_at: 2026-06-26
---
# conver.js 単一ファイルバンドル構築

## Summary

現在 `tsc` でトランスパイルされた `dist/*.js` は複数ファイルに分割されており、実行には `node_modules/@agentclientprotocol/sdk` が必要。esbuild で単一ファイルにバンドルし、`node_modules` なしでも動作する `dist/conver.js` を生成する。

## Background

- 現在のビルド: `npm run build` → `tsc` → `dist/` に複数 ESM ファイル出力
- `dist/conver.js` は `import` で `./cli.js`, `./runner.js` 等の sibling ファイルを実行時に解決
- `src/session.ts` が `@agentclientprotocol/sdk` を import しており、`node_modules` が必要
- 別マシンにコピーして実行するには `dist/` + `package.json` + `node_modules/` の3点セットが必要 → 単一ファイルなら `dist/conver.js` だけで動作する

## Scope

1. ビルドツールを `tsc` から **esbuild**（tsup でも可）に変更し、`src/conver.ts` をエントリポイントとして `dist/conver.js` 1ファイルにバンドルする
2. バンドル時は以下を `external`（バンドル対象外）に指定し、Node.js 実行時に解決させる：
   - `node:path`, `node:fs`, `node:child_process`, `node:http`, `node:https`, `node:stream`, `node:util`
3. `@agentclientprotocol/sdk` は**バンドルに含める**（外部依存はこの1パッケージのみ）
4. バンドル後の単一ファイルで `node dist/conver.js -k <key> -s <url>` が起動することを確認
5. `npm test`（現在の全56テスト）がバンドル後も通過することを確認
6. esbuild を `devDependencies` に追加（`npm install --save-dev esbuild`）

## Non-scope

- 型チェックの廃止はしない。`tsc --noEmit` を別途 CI / pre-build で実行する形を維持する
- テストファイル（`*.test.ts`）のバンドル対象外。テストは従来通り `tsc` でトランスパイルして実行する
- ソースマップは生成しない（現行の `sourceMap: false` を維持）
- ミニファイ（圧縮）は行わない。デバッグ容易性を優先する
- Windows 非対応の既存状態を変更しない

## Investigation

### 調査結果: バンドル可否の物理的証拠

1. **package.json**: 現在の `build` スクリプトは `"tsc"` のみ。runtime dependency は `@agentclientprotocol/sdk ^1.0.0` 1件。
2. **tsconfig.json**: `module: NodeNext`, `moduleResolution: NodeNext`, `target: ES2022`。esbuild はこれらの設定を自動認識し、ESM 形式で出力可能。
3. **外部依存の内訳**:
   - `node:*` 系（path, fs, child_process, http, https, stream, util）→ バンドル対象外（esbuild の `platform=node` で自動解決）
   - `@agentclientprotocol/sdk` → ES2022/CommonJS ハイブリッド、esbuild でバンドル可能。`node_modules/@agentclientprotocol/sdk/dist/` に `acp.js`, `connection.js` 等がある
4. **esbuild 0.28.1 利用可能**: `npx esbuild --version` で確認済み
5. **ファイルサイズ**: 現行の `dist/` 合計 16 ファイル。エントリポイント `conver.ts` からは `runner.ts → {session.ts, notifier.ts, tickets.ts} + cli.ts` の依存チェーン。コード行数約 550 行（テスト除く）で、`@agentclientprotocol/sdk` を含めても数十 KB に収まる見込み

### 証拠（コマンド実行結果）

```
$ npx esbuild --version
0.28.1

$ grep "import.*from" src/session.ts
import { spawn } from "node:child_process";
import { Writable, Readable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
```

## Test Plan

### ユニットテスト計画

- **既存テストの完全維持**: バンドル後の `dist/conver.js` に対して既存テスト（56件）が全て PASS することを確認する
- **バンドル検証テスト**（以下を確認できるテストコードを追加）:
  - `dist/conver.js` が単一ファイルであること
  - `dist/conver.js` を直接 `node` で起動したとき、引数不足でエラー終了する（必須フラグ欠落の検証）
  - `dist/conver.js` の中に `@agentclientprotocol/sdk` のコードが含まれていること（バンドルされた証拠）
  - `dist/conver.js` の中に `require("node:fs")` 等の外部指定が正しく保たれていること
- **カバレッジ目標**: 既存56テスト維持 + バンドル検証テスト追加

### ユニットテスト不可能な項目（例外）

- プロセスの実際の起動テスト（`node dist/conver.js` の実プロセス起動）は E2E または手動で実施

## Boy Scout Rule — 翻訳可能性計画

- `package.json` の `scripts.build` を esbuild に変更する。変更範囲は最小限（1行の修正 + 追加 devDependency）
- 新規に作成するバンドル検証テストコードは「テスト名＋アサーション」が散文として読めること
- `tsc --noEmit` を別途実行する段を設ける場合、コマンド名は `typecheck` のように意図を明示する

## Acceptance Criteria

- [ ] `npm run build` で `dist/conver.js` が単一ファイルとして生成される
- [ ] 生成された単一ファイルを `dist/conver.js` だけ別ディレクトリにコピーし、`node dist/conver.js -k test -s http://localhost` で起動確認できる（必須フラグ不足ではなく引数通りの挙動をする）
- [ ] `npm test` が全 PASS する（既存56テスト + 追加テスト）
- [ ] 翻訳可能性の検証が通っている
- [ ] 犯罪なし（[::STUB::] 未付与の不完全実装がない）

## Notes

- `esbuild` は `npx` で既に利用可能だが、`package.json` の `devDependencies` に明示的に追加する（再現性確保）
- バンドル後の CI ワークフロー: `npm run build`（esbuild でバンドル） → `npx tsc --noEmit`（型チェック、分離実行） → `npm test`（既存の node --test）
- 型チェックは独立コマンド `npm run typecheck` に分離する

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testUnit[]`, `testExceptions[]`, `notes` フィールド
- **実装サマリ**: `changes[]`, `notes` フィールド
- **レビュー報告書**: `instrumentation`, `notes`, `rfcDiscrepancies[]` フィールド

### Unit Tests

- npm run build で dist/conver.js が単一ファイルとして生成される
- npm test が全56テスト PASS
- バンドル後の単一ファイルだけで node dist/conver.js が起動可能

### Exceptions

- プロセスの実起動テストは E2E/手動
