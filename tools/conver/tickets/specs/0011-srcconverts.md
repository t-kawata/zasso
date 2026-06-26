---
ticket_id: 11
title: エントリポイント (src/conver.ts)
slug: srcconverts
status: draft
created_at: 2026-06-26
updated_at: 2026-06-26
---
# エントリポイント (src/conver.ts)

## Summary

conver.js のエントリポイント `src/conver.ts` を実装する。`parseCliOptions` でコマンドライン引数をパースし、`runLoop` に渡してループ処理を開始する。エラー時は `process.exit(1)` でプロセスを終了する。テストファイル `src/conver.test.ts` を作成し、正常系・異常系の両方をカバーする。

**コード自体は RFC_ROOT.md §7 の設計通りに既に実装済みである。** 本チケットの主たる作業はスタブマーカーの除去とテストの追加である。

## Background

`conver.ts` は二層構造パイプラインの内部ループにおけるプロセスエントリポイントである。役割は単純で、CLI引数のパース結果をループ制御モジュールに引き渡すブリッジに徹する。

### 既存実装の状態

現在の `src/conver.ts`（2026-06-26 時点）は以下のコードを持つ：

```typescript
// [::STUB::] P4-2: エントリポイントの本実装は P4-2 で行う

import { parseCliOptions } from "./cli.js";
import { runLoop } from "./runner.js";

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv);

  console.log("conver.js — チケット処理を開始します");
  console.log("  モデル:       ", options.model);
  console.log("  Tickets.json:", options.ticketsPath);

  await runLoop(options);
}

main().catch((err: Error) => {
  console.error("致命的エラー:", err.message);
  process.exit(1);
});
```

**重要な点**: このコードは既に RFC_ROOT.md §7 に示された設計と完全に一致している。`[::STUB::]` マーカーは残っているが、スタブではなく**最終形の実装**である。マーカーは「テストが未完成である」という意味でのみ残っている。

### 依存関係

| モジュール | インポート対象 | チケット | 状態 |
|---|---|---|---|
| `src/cli.ts` | `parseCliOptions`, `CliOptions` | P0-3 | reviewed |
| `src/runner.ts` | `runLoop`, `LoopOptions` | P4-1 | reviewed |

### test.sh における既存の統合テスト

`test.sh` には `dist/conver.js` に対する CLI 統合テストが既に4ケース存在する（CLI1〜CLI4）：
- `--help` で exit 0
- `-h` 短縮形で exit 0
- 引数なしで exit 1 + エラーメッセージに `--api-key` の言及
- `-k` のみ（--slack-url 不足）で exit 1 + エラーメッセージに `--slack-url` の言及

## Scope

### 実装するもの

1. **`main(): Promise<void>`** — 既に実装済み。スタブマーカーを除去する。
   - `parseCliOptions(process.argv)` で CLI 引数をパース
   - `runLoop(options)` でループ制御を開始
   - エラー時には `main().catch` でキャッチし `process.exit(1)`

2. **`src/conver.test.ts`** — ユニットテスト（新規作成）
   - `mock.module()` で `cli.ts` と `runner.ts` をモック化
   - `mock.method(process, 'exit')` で `process.exit` をインターセプト
   - 3テストケース（正常系1、異常系1、引数不足エラー伝播1）

### ループフロー（呼出元として）

```
conver.ts（エントリポイント）
  ├─ parseCliOptions(process.argv)  →  LoopOptions
  ├─ 起動ログ出力（モデル・Tickets.json パス etc.）
  └─ runLoop(options)               →  ループ制御へ委譲
       └─ エラー → main().catch → process.exit(1)
```

### エラーハンドリング

`main().catch` で `runLoop` が送出したエラーを捕捉し、以下の処理を行う：
1. `console.error` でエラーメッセージを表示
2. `process.exit(1)` でプロセス終了

注意：`parseCliOptions` のエラー（必須引数不足等）は `cli.ts` 内部で `process.exit(1)` を呼ぶため、`main().catch` には到達しない。

## Non-scope

- Tickets.json への書き込み — すべて Claude Code セッション内のスラッシュコマンドが行う
- ACP セッションの直接管理 — `session.ts`（P3-1）が担当
- CLI 引数パース — `cli.ts`（P0-3）が担当
- ループ制御ロジック — `runner.ts`（P4-1）が担当
- ビルド確認・E2Eテスト — P4-3 で対応

## Investigation

### 現状のソースコード

**`src/conver.ts`**（2026-06-26 時点）:

```
行数: 19行
公開関数: main() — 内部でのみ使用（export されていない）
内部関数: なし（main のみ）
外部依存: cli.ts (parseCliOptions), runner.ts (runLoop)
[::STUB::] マーカー: 1行目 — コード自体は最終形だがテスト未完成のため残存
```

**`src/conver.test.ts`**: 存在しない（新規作成が必要）

### 既存テストパターンの確認

`src/runner.test.ts` が参考になるテストパターン：

1. **モック設定**: `mock.module()` で外部モジュールの関数をモック化
2. **process.exit のモック**: `mock.method(process, 'exit', () => {})` でインターセプト
3. **テスト対象**: ビルド後の `dist/conver.test.js` を `node --test` で実行
4. **アサーション**: `assert.strictEqual` + モック呼び出し検証

### スタブ・犯罪ステータス

- 犯罪レコード: 0件 ✅
- `[::STUB::]` マーカー: `src/conver.ts:1` + `dist/conver.js:1` — テスト未完成のため残存

### テスト環境

```bash
# テスト実行方法（既存の test-conver ターゲット）
npm run build && node --experimental-test-module-mocks --test dist/error.test.js dist/cli.test.js dist/tickets.test.js dist/notifier.test.js dist/session.test.js dist/runner.test.js dist/conver.test.js
```

`--experimental-test-module-mocks` フラグが必要（`mock.module()` 使用のため）。

## Test Plan

### ユニットテスト計画

`src/conver.test.ts` を作成する。外部依存（`cli.ts`, `runner.ts`）は `mock.module()` でモック化し、conver.ts の呼出制御のみを検証する。

#### テスト方針

conver.ts は単純なパススルーエントリポイントである。そのためテストは以下の2軸に絞る：

1. **正常系**: main() が parseCliOptions → runLoop の順に正しく呼び出すこと
2. **異常系**: runLoop がエラーを throw した際に process.exit(1) が呼ばれること
3. **引数不足エラーの伝播**: cli.ts の parseCliOptions が引数不足でエラー終了した場合の挙動（ただし parseCliOptions 内で process.exit が呼ばれるため、main().catch には到達しない）

#### テストケース一覧

**1. 正常系: main が正しく呼出し連鎖を行う**

| # | ケース | 条件 | 期待動作 |
|---|--------|------|----------|
| 1 | 正常起動 | `parseCliOptions` が options を返す | `parseCliOptions(process.argv)` が1回呼ばれる。`runLoop(options)` が1回呼ばれる。process.exit は呼ばれない |

**2. 異常系: runLoop エラー時**

| # | ケース | 条件 | 期待動作 |
|---|--------|------|----------|
| 2 | runLoop エラー時 | `runLoop` が reject する | `console.error` でエラーメッセージ出力。`process.exit(1)` が呼ばれる |

**3. parseCliOptions エラー伝播（動作理解テスト）**

| # | ケース | 条件 | 期待動作 |
|---|--------|------|----------|
| 3 | cli.ts 内部エラー | `parseCliOptions` が process.exit(1) を呼ぶ | `parseCliOptions` 内部で process.exit(1) が呼ばれる。main().catch は呼ばれない |

#### モック戦略

`mock.module()` で `./cli.js` と `./runner.js` をモック化：

```typescript
mock.module("./cli.js", {
  parseCliOptions: mock.fn(() => baseOptions()),
});

mock.module("./runner.js", {
  runLoop: mock.fn(() => Promise.resolve()),
});
```

`process.exit` は `mock.method` でインターセプト：

```typescript
mock.method(process, "exit", () => {});
```

#### カバレッジ目標

- main(): 100%（分岐なし — 直線的実行パスのみ）
- エラーハンドリング（catch ブロック）: 100%
- 全体（ファイル単位）: 95% 以上

### ユニットテスト不可能な項目（例外）

- **`process.exit(1)` の実際のプロセス終了確認**: `mock.method` で呼び出し確認のみ。実際のプロセス終了は E2E テストに委ねる
- **ACP バイナリの起動**: E2E テスト（P4-3）で検証

### test.sh 統合

既存の CLI 統合テスト（CLI1〜CLI4）に加え、必要に応じて P4-2 固有の統合テストは追加しない — ユニットテストで十分カバーできる。test-conver ターゲットに conver.test.js を追加する。

## Boy Scout Rule — 翻訳可能性計画

### 実装後期待する状態

**`src/conver.ts`** の既存コードは既に翻訳可能性を満たしている：

- `main()`: 「メイン処理を実行する」— エントリポイントとして適切な関数名
- `parseCliOptions(process.argv)`: 「CLI オプションをパースする」— 責務が明確
- `runLoop(options)`: 「ループを実行する」— 処理の委譲先が明確
- `main().catch`: 「エラーを捕捉する」— エラーハンドリングの意図が明確
- `process.exit(1)`: 「プロセスを異常終了する」— 終了コード1でエラーを示す

**コードを逐語訳**:
```
main() は process.argv で CLIオプションをパースし、起動ログを出力し、runLoop に options を渡す。
エラーが発生した場合は、エラー内容を出力し、process.exit(1) で終了する。
```

既に翻訳可能な状態である。改善の必要はない。

### 改善計画

1. **スタブマーカー除去**: `[::STUB::]` マーカーを削除する（テスト完了後）
2. **新規コード（テスト）のルール順守**:
   - テストケース名は AAA パターン（Arrange-Act-Assert）で記述
   - モック状態は共有オブジェクトで管理（`runner.test.ts` と同じパターン）
   - `baseOptions()` ヘルパー関数でテスト間の重複を排除
3. **既存コードの改善**: スコープ内に改善対象なし（コードは既に最終形）

## Acceptance Criteria

- [ ] `main()`: `parseCliOptions(process.argv)` → `runLoop(options)` の呼び出し連鎖が正しい
- [ ] `main().catch`: `runLoop` エラー時に `process.exit(1)` が呼ばれる
- [ ] `[::STUB::]` マーカーが `src/conver.ts` から除去されている
- [ ] 翻訳可能性: 関数名・変数名は既に散文として読める状態
- [ ] テスト: 3テストケース以上（正常系・異常系・引数不足エラー伝播）
- [ ] カバレッジ: 95% 以上
- [ ] 既存テスト（test-conver）が全て通過すること
- [ ] 犯罪スキャン: 0件
- [ ] `test-conver` Makefile ターゲットに `dist/conver.test.js` が追加されている

## Notes

### 依存・関連チケット

- **P0-3** (src/cli.ts): `parseCliOptions` の提供元。conver.ts が最初に呼び出すモジュール。reviewed 済み。
- **P4-1** (src/runner.ts): `runLoop` の提供元。conver.ts の呼出先。reviewed 済み。
- **P4-3** (ビルド確認・E2E動作検証): P4-2 の完了後に実施。P4-2 が提供するユニットテストを前提とした E2E テストを含む。

### 実装の注意点

- `src/conver.ts` のコードは既に最終形だが、`[::STUB::]` マーカー削除はテスト完了まで行わない（第一級規則遵守）
- `dist/conver.js` の同位置にも `[::STUB::]` があるが、これは `src/conver.ts` からのビルド成果物であるため、`npm run build` で自動的に更新される
