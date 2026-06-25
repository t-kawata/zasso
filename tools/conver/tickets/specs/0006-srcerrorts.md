---
ticket_id: 6
title: エラー型定義 (src/error.ts)
slug: srcerrorts
status: draft
created_at: 2026-06-25
updated_at: 2026-06-25
---
# エラー型定義 (src/error.ts)

## Summary

conver.js が使用するエラー型の基底クラス `CommandTimeoutError` を定義する。
依存関係ゼロのモジュールとして、全モジュールから参照されるエラー型を提供する。

## Background

conver.js は ACP 経由で Claude Code のセッションを制御する際、各コマンドの実行にタイムアウトを設定する。タイムアウトが発生した場合は他のエラー（I/Oエラー、権限エラー等）と明確に区別できるよう、固有のエラー型 `CommandTimeoutError` で表現する必要がある。

RFC_ROOT.md §6.1 に定義されたエラー種別のうち、本チケットでは `CommandTimeout` のみを実装する。残りのエラー種別（`SessionError`, `PermissionDenied`, `FileNotFound`, `PushFailed`）は各チケットの実装と同時に追加される。

## Scope

- `CommandTimeoutError` クラスの定義（`Error` を継承）
  - コンストラクタで `message: string` を受け取り `this.name = 'CommandTimeoutError'` を設定する
  - スタックトレースは `Error` のデフォルト動作に委ねる
- `src/error.ts` からの名前付きエクスポート

## Non-scope

- `SessionError`, `PermissionDenied`, `FileNotFound`, `PushFailed` 等の他のエラー型定義（各モジュールの実装チケットで追加）
- エラーハンドリングロジック（`try-catch` やエラー分類は呼び出し側の責務）
- タイムアウト検出ロジック自体（`Date.now()` による経過時間チェックは各モジュールの実装に含まれる）

## Investigation

### ソースコード調査結果

1. **`src/error.ts`（実装済み）**: 以下の完全な実装が存在する:

```typescript
export class CommandTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandTimeoutError";
  }
}
```

- 記述は RFC_ROOT.md §6.2 の設計と一致している
- 依存関係ゼロ（import 文なし）
- `this.name` の設定が正しく行われている

2. **RFC_ROOT.md §6.1 のエラー種別一覧**:
   | エラー種別 | 使用モジュール | 備考 |
   |---|---|---|
   | CommandTimeout | session.ts (runCommand) | **本チケットのスコープ** |
   | SessionError | session.ts | P3-1 で追加予定 |
   | PermissionDenied | runner.ts | P4-1 で追加予定 |
   | FileNotFound | tickets.ts | P1-1 で追加予定 |
   | PushFailed | runner.ts (jpush-branch) | P4-1 で追加予定 |

3. **RFC_ROOT.md §6.3（notifier.ts）の `classifyError`**: 既に `error.name === 'CommandTimeoutError'` による判定が設計されている。本実装で `this.name = 'CommandTimeoutError'` と設定しているため、この判定と互換性がある。

4. **既存のテスト**: `test.sh` はチケット管理スクリプトのテストのみで、conver.js のユニットテストは未実装。TypeScript のテストフレームワークは導入されていない。

## Test Plan

### ユニットテスト計画

`CommandTimeoutError` は純粋なクラス定義であり、外部依存が一切ないため、全テストケースをユニットテストでカバーできる。

**テスト対象**: `src/error.ts` の `CommandTimeoutError` クラス

**テストフレームワーク**: Node.js 標準の `node:assert` + `node:test`（追加依存なし）

| # | ケース | 種別 | 検証内容 |
|---|--------|------|----------|
| 1 | `new CommandTimeoutError(msg)` で `name` が `CommandTimeoutError` | 正常系 | `error.name === 'CommandTimeoutError'` |
| 2 | `CommandTimeoutError` が `Error` のインスタンス | 正常系 | `error instanceof Error === true` |
| 3 | `error.message` がコンストラクタ引数と一致 | 正常系 | `error.message === msg` |
| 4 | `error.stack` が定義されている（Error 継承の確認） | 正常系 | `typeof error.stack === 'string'` |
| 5 | 空文字メッセージでも正常動作 | 境界値 | `new CommandTimeoutError('')` で例外が発生しない |
| 6 | 長文メッセージでも正常動作 | 境界値 | 1000文字のメッセージでも `name` の値は正しい |

**ファイル構成**:
```
src/
  error.ts          # 実装（既存）
  error.test.ts     # テスト（新規作成）
```

**テスト実行方法**: `node --test src/error.test.ts` または `make test-conver`

**カバレッジ目標**: 100%（分岐が存在しない純粋クラスのため到達可能）

### ユニットテスト不可能な項目（例外）

なし。全テストケースをユニットテストでカバー可能。

## Boy Scout Rule — 翻訳可能性計画

### 現状評価

```typescript
// src/error.ts （現状）
export class CommandTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandTimeoutError";
  }
}
```

**翻訳**: 「CommandTimeoutError クラスは Error を継承する。コンストラクタは message を受け取り Error に渡し、name を 'CommandTimeoutError' に設定する。」

→ 既に翻訳可能な状態。関数名（`constructor`）とクラス名（`CommandTimeoutError`）が名詞として明確であり、処理内容が散文として読める。

### 改善計画

- `[::STUB::]` マーカーの除去（実装完了のため）
- 変数名は現在のままで十分（`message` は標準の命名）
- 追加のコメントは不要（コード自体が意図を語っている）

スコープ外（他モジュールの error.ts 参照部分）については現在のルールに適合していることを確認済み。

## Acceptance Criteria

- [x] `CommandTimeoutError` クラスが `Error` を継承して定義されている
- [x] `this.name = 'CommandTimeoutError'` がコンストラクタ内で設定されている
- [x] `message` 引数が `Error` のコンストラクタに正しく渡されている
- [ ] ユニットテストが実装され、全テストケースが通過している
- [ ] `[::STUB::]` マーカーが除去されている
- [ ] 既存のテストが全て通過している

## Notes

### 依存・関連チケット

- **P0-1** (先行完了): TypeScriptプロジェクトスキャフォールディング — tsconfig.json, package.json の設定が本チケットの前提
- **P3-1** (後続): `SessionError` の追加が予定される
- **P4-1** (後続): `PermissionDenied`, `PushFailed`, `FileNotFound` の追加が予定される
- **P0-3**: `cli.ts` から `error.ts` を参照する（cli.ts:229）

### 実装上の注意点

- `this.name = "CommandTimeoutError"` の代入は `super(message)` の後で行う必要がある（`Error` コンストラクタが `name` を `'Error'` に設定するため）
- スタックトレースのキャプチャは `Error` のデフォルト動作に委ね、特別な加工は行わない
- `export` は名前付きエクスポートとする（named export の一貫性維持）

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testVerification[]`, `testExceptions[]`, `notes` フィールド
- **実装サマリ**: `changes[]`, `notes` フィールド
- **レビュー報告書**: `instrumentation`, `notes`, `rfcDiscrepancies[]` フィールド
