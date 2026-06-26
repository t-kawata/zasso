---
ticket_id: 10
title: ファイルパスの絶対パス変換（O-002）
slug: absolute-path-resolution
status: draft
created_at: 2026-06-26
updated_at: 2026-06-26
---
# ファイルパスの絶対パス変換（O-002）

## Summary

cli.ts の `parseCliOptions()` が返す `ticketsPath` を `path.resolve()` で絶対パスに変換する。
併せて、runner.ts の `runLoop()` 内で使用する `cwd` も `path.resolve()` で正規化する。
これにより、ACP セッション内のカレントディレクトリが期待と異なる場合のファイル参照不具合を防止する。

## Background

RFC OMISSIONS-001 O-002 で指摘された実装漏れである。
`cli.ts` の `parseCliOptions()` は `--tickets` オプションの値をそのまま（相対パスのまま）返している。
ACP セッション内で `cwd` が変わった場合、相対パスは異なるファイルを指す可能性がある。

同様に `runner.ts` の `runLoop()` 内で `process.cwd()` の戻り値をそのまま使用している。
`process.cwd()` は通常絶対パスを返すが、シンボリックリンクを含むパスの場合に
正規化されていない値が返ることがある。

## Scope

1. **cli.ts — `parseCliOptions()` の ticketsPath に `path.resolve()` 適用**:
   `import path from "node:path"` を追加し、戻り値の `ticketsPath` を `path.resolve(parsed.values.tickets)` で絶対パスに変換する

2. **runner.ts — `runLoop()` の cwd に `path.resolve()` 適用**:
   `import path from "node:path"` を追加し、`const cwd = process.cwd()` を `const cwd = path.resolve(process.cwd())` に変更する

## Non-scope

- cli.ts の他の文字列型オプション（`slackWebhookUrl` 等）への `path.resolve()` 適用（URL を誤変換するリスクがあるため RFC 設計上も対象外）
- runner.ts の `ticketsPath` 自体への変換（cli.ts で既に絶対パス化されているため、runner.ts では変換済みの値を受け取ることを前提とする）
- O-001, O-003, O-004, O-005 の修正（別チケット）
- ロジック以外のコード整形やリファクタリング

## Investigation

以下は 2026-06-26 時点のコードスナップショットに基づく。

### 証拠 1: cli.ts parseCliOptions — ticketsPath が相対パスのまま

- **ファイル**: `tools/conver/src/cli.ts`
- **該当箇所**: L72（戻り値オブジェクトの ticketsPath フィールド）
- **現状**: `ticketsPath: parsed.values.tickets` と、`parseArgs` から得た値をそのまま返している。
  デフォルト値 `"./Tickets.json"` を指定した場合、相対パスのまま runner.ts に渡る。
  また `import path from "node:path"` は存在しない。
- **コード抜粋**:
  ```typescript
  // L72: path.resolve() なし
  ticketsPath: parsed.values.tickets,
  ```

### 証拠 2: runner.ts runLoop — cwd が未正規化

- **ファイル**: `tools/conver/src/runner.ts`
- **該当箇所**: L94（runLoop 冒頭の cwd 変数）
- **現状**: `const cwd = process.cwd();` と、Node.js の戻り値をそのまま使用している。
  シンボリックリンクを含む環境で正規化されない。
  `import path from "node:path"` は存在しない。
- **コード抜粋**:
  ```typescript
  // L94: path.resolve() なし
  const cwd = process.cwd();
  ```

### 証拠 3: cli.test.ts — デフォルト値テストが相対パスを期待

- **ファイル**: `tools/conver/src/cli.test.ts`
- **該当箇所**: L51
- **現状**: `assert.strictEqual(options.ticketsPath, "./Tickets.json");` と、
  相対パスのままの値を期待している。絶対パス変換後は `path.resolve("./Tickets.json")` の結果となる。
- **コード抜粋**:
  ```typescript
  assert.strictEqual(options.ticketsPath, "./Tickets.json");
  ```

### 証拠 4: runner.test.ts — 既に絶対パスを使用

- **ファイル**: `tools/conver/src/runner.test.ts`
- **該当箇所**: L32
- **現状**: `ticketsPath: "/tmp/test-tickets.json"` と既に絶対パスで指定している。
  そのため cli.ts 側の変更による影響は受けない。
  
  また runner.ts の `cwd` は mock.module("./session.js") の `withSession` に渡されるが、
  テストのモックは `_cwd` として未使用パラメータで受け取るため、`cwd` の変更による
  テストへの影響はない。

### 証拠 5: RFC_OMISSIONS-001.md §2 の設計

- **ファイル**: `tools/conver/RFC_OMISSIONS-001.md`
- **該当箇所**: §2（L64-L73）
- **設計方針**:
  - `path.resolve()` による絶対パス変換は cli.ts の `parseCliOptions()` でのみ行う
  - runner.ts は変換済みの絶対パスを受け取ることを前提とする
  - 全文字列型オプションの一律変換は過剰であり、URL（slackWebhookUrl 等）を誤変換するリスクがあるため、ticketsPath のみを対象とする
  - runner.ts の `cwd` も `path.resolve()` で正規化する

## Test Plan

### ユニットテスト計画

**カバレッジ目標**: 全体 80%以上、対象モジュール（cli.ts, runner.ts）は 90%以上

| # | テストケース | 対象 | 種別 | 検証内容 |
|---|-------------|------|------|----------|
| 1 | 相対パス指定時に絶対パスが返る | cli.test.ts | 正常系 | `--tickets ./Tickets.json` 指定時に `path.resolve("./Tickets.json")` と一致する絶対パスが返ることを確認 |
| 2 | 絶対パス指定時はそのまま | cli.test.ts | 正常系 | `--tickets /absolute/path.json` 指定時に同じ絶対パスが返ることを確認 |
| 3 | 既存全フラグテストの回帰 | cli.test.ts | 回帰 | 既存テストケース「最小構成デフォルト値」の `ticketsPath` アサーションのみ絶対パスに更新し、他は変更なしで全テストがパスすることを確認 |
| 4 | runner.ts cwd の絶対パス確認 | runner.test.ts | 回帰 | 既存テスト全10ケースがパスすることを確認（runner.ts の cwd 変更がテストに影響しないことを確認） |

**モック・スタブ要件**:
- いずれのテストも `path.resolve()` は副作用のない純粋関数であるため、モック不要
- `node:path` の `path.resolve()` は環境に依存するため、テストでは相対パス→絶対パスの変換が正しく行われることのみ確認する

### ユニットテスト不可能な項目（例外）

該当なし — `path.resolve()` は純粋関数であり、すべての検証はユニットテストでカバー可能。

## Boy Scout Rule — 翻訳可能性計画

本チケットで触るコードに対して以下の翻訳可能性改善を実施する：

1. **cli.ts の path インポート追加時の整理**: `import path from "node:path"` を既存の `import { parseArgs } from "node:util"` と整列させ、標準ライブラリのインポートはアルファベット順に保つ
2. **runner.ts の path インポート追加時の整理**: 同様に既存のインポート群とアルファベット順に整列させる
3. **一関数一責務の維持**: `parseCliOptions()` は「CLI引数のパース」のみ、`runLoop()` は「ループ制御」のみを責務として維持する。パス変換は cli.ts の戻り値構築時に完結させる

## Acceptance Criteria

- [ ] cli.ts の `parseCliOptions()` が相対パス指定時も絶対パスを返す
- [ ] cli.ts の既存テストが絶対パス変換後に全てパスする（`ticketsPath` のアサーションを更新）
- [ ] runner.ts の `runLoop()` 内で `cwd` が `path.resolve()` で正規化されている
- [ ] runner.ts の既存テストが全てパスする
- [ ] `make test` が全てパスする
- [ ] `make check-all` が全てパスする
- [ ] `[::STUB::]` マーカーが全ての不完全実装に付与されている（該当なしを確認）

## Notes

**依存関係**:
- 先行実装が必要なチケット: なし（他の P5 チケットとは独立して実装可能）
- 関連チケット: P5-1 (O-003 phaseId一貫性) — 両チケットの変更対象ファイルが異なる（cli.ts vs tickets.ts）ため競合しない
- 関連チケット: P3-1 (session.ts) — runner.ts の cwd 変更が session.ts の `withSession` に影響しないことを確認済み

**設計判断の経緯**:
- `path.resolve()` の適用対象を ticketsPath のみに限定するのは、RFC_OMISSIONS-001.md §2 の設計判断に従う。URL型オプション（slackWebhookUrl）への `path.resolve()` 適用は誤変換リスクがある
- cli.test.ts の「最小構成デフォルト値」テストで `ticketsPath` が相対パスから絶対パスに変わる。これは期待動作の変更であるため、テストアサーションを更新する必要がある。テストファイル自体は cli.ts の変更を検証するように修正されるべき

**成果物の保存先**: Tickets.json の P5-2 フィールドを参照
