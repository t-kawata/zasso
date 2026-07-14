---
ticket_id: 31
title: WatcherConfig 型定義と設定ファイル読み込み
slug: watcherconfig
status: made
created_at: 2026-07-01
updated_at: 2026-07-01
ticket_key: P6-1
---
# WatcherConfig 型定義と設定ファイル読み込み

## Summary

Watcher モード（`-w/--watcher` フラグ）で指定されるJSON設定ファイルの型定義とバリデーションを行う `src/watcher.ts` を作成する。intervalMinutes, startTime, endTime, timezone の4項目を持つインターフェースを定義し、ファイル読み込み・バリデーション関数を純粋関数として実装する。

## Background

conver.js に Watcher モードを追加するには、まず設定ファイルの型定義と読み込み機能が必要である。Watcher モードは指定された間隔（intervalMinutes）で定期的にチケット処理を実行し、指定された時間枠（startTime〜endTime）内でのみ動作する。この設定を外部JSONファイルから読み込むための基盤が P6-1 の責務である。

- 既存の `cli.ts`（`src/cli.ts:43`）は `parseArgs`（`node:util`）で引数パースを行っている
- `src/settings.ts` には `VERSION = "v0.0.2"` のみ定義されている
- テストは `node:test` + `node:assert/strict` で記述し、`dist/` 配下の compiled JS に対して実行する（`src/error.test.ts:3-4` のパターンに準拠）
- NodeNext モジュール解決のため、import は `.js` 拡張子を付与する（`tsconfig.json:4`）

## Scope

### 成果物
- `src/watcher.ts` — WatcherConfig 型定義・バリデーション・ファイル読み込み
- `src/watcher.test.ts` — 全関数のユニットテスト

### 公開API

```typescript
// 設定ファイルの型定義（4フィールド）
export interface WatcherConfig {
  intervalMinutes: number;   // 定期実行間隔（分）, > 0
  startTime: string;         // 開始時刻 "HH:mm" 形式
  endTime: string;           // 終了時刻 "HH:mm" 形式
  timezone: string;          // IANAタイムゾーン名（例: "Asia/Tokyo"）
}

// バリデーション結果
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// 設定ファイル読み込み（JSON → WatcherConfig）
export function loadWatcherConfig(configPath: string): WatcherConfig

// バリデーション（純粋関数, I/Oなし）
export function validateWatcherConfig(config: unknown): ValidationResult
```

## Non-scope

- 時間窓判定ロジック（P6-2 で実装）
- Cron スケジューラ（P7-1 で実装）
- CLI引数 `-w/--watcher` の追加（P8-2 で実装）
- Watcher モードの起動パス（P8-3 で実装）

## Investigation

### 既存コードパターンの確認

1. **プロジェクト構成**: `src/` 配下の `.ts` を TypeScript コンパイルし、`dist/` に `.js` を出力。NodeNext モジュール解決（`tsconfig.json`）
2. **import パターン**: NodeNext のため相対importは `.js` 拡張子が必要：
   ```typescript
   import { readFileSync } from "node:fs";
   import { VERSION } from "./settings.js";
   ```
3. **テストパターン**:
   - `node:test` の `describe`/`it` で構造化
   - `node:assert/strict` で検証
   - テストファイルは `src/*.test.ts` に配置
   - 実行は `dist/` の compiled JS に対して行う（Makefile 経由）
   - ファイルI/Oを含むテストは一時ファイルを作成する結合テストとして記述（`testExceptions` にモック不要と明記）
4. **エラー型**: 既存の `CommandTimeoutError` は `src/error.ts` に定義。Watcher 用の新しいエラー型は定義せず、バリデーションエラーは `ValidationResult.errors` として文字列配列で返す
5. **settings.ts**: 現状は `VERSION` のみ。Watcher 用のデフォルト値等はここに追加するか検討。WatcherConfig の型自体は設定ファイル由来の値なので settings.ts にはデフォルト値を置かない

### 時刻フォーマットの調査

- `startTime` / `endTime` は `"HH:mm"` 形式（24時間表記）を想定
- 例: `"09:00"`, `"17:30"`, `"00:00"`, `"23:59"`
- フォーマット検証は正規表現 `/^([01]\d|2[0-3]):[0-5]\d$/` で行う
- タイムゾーンは IANA Time Zone Database 準拠の文字列（`Intl.supportedValuesOf("timeZone")` で検証可能）
- 日跨ぎ（startTime > endTime）の解釈は P6-2 の責務

### ファイル読み込みパターン

既存の `src/tickets.ts:56` で `readFileSync` を使用している。Watcher 設定ファイルも同一パターンで読み込む：

```typescript
const raw = readFileSync(configPath, "utf-8");
const parsed = JSON.parse(raw);
return parsed as WatcherConfig;
```

## Test Plan

### ユニットテスト計画

テスト対象: `src/watcher.ts` の全公開関数

#### `validateWatcherConfig` のテスト

| カテゴリ | ケース | 検証内容 |
|---------|--------|---------|
| 正常系 | 全フィールドが正しい WatcherConfig | `valid: true`, `errors: []` |
| 正常系 | intervalMinutes が1 | `valid: true` |
| 正常系 | intervalMinutes が最大値 525600（1年） | `valid: true` |
| 異常系 | `null` 入力 | `errors` に欠落エラー |
| 異常系 | `undefined` 入力 | `errors` に欠落エラー |
| 異常系 | `{}` 空オブジェクト | `errors` に全フィールド欠落 |
| 異常系 | intervalMinutes が 0 | `errors` に範囲エラー |
| 異常系 | intervalMinutes が負数 | `errors` に範囲エラー |
| 異常系 | intervalMinutes が小数 | `errors` に整数チェックエラー |
| 異常系 | intervalMinutes が非数値文字列 | `errors` に型エラー |
| 異常系 | startTime が不正フォーマット `"25:00"` | `errors` にフォーマットエラー |
| 異常系 | startTime が不正フォーマット `"09:60"` | `errors` にフォーマットエラー |
| 異常系 | startTime が空文字 | `errors` にフォーマットエラー |
| 異常系 | endTime が不正フォーマット `"abc"` | `errors` にフォーマットエラー |
| 異常系 | timezone が空文字 | `errors` にタイムゾーンエラー |
| 異常系 | timezone が不正なIANA名 `"Invalid/Zone"` | `errors` にタイムゾーンエラー |
| 境界値 | startTime = `"00:00"` | 正常 |
| 境界値 | endTime = `"23:59"` | 正常 |
| 複合 | intervalMinutes=0 + 不正時刻 + 空タイムゾーン | `errors` に3件のエラー |

#### `loadWatcherConfig` のテスト（ファイルI/O含む結合テスト）

| カテゴリ | ケース | 検証内容 |
|---------|--------|---------|
| 正常系 | 有効なWatcherConfigJSONファイル | パース成功、正しいWatcherConfig返却 |
| 異常系 | 存在しないファイルパス | `Error` スロー（ENOENT） |
| 異常系 | JSONパースエラー（不正なJSON） | `Error` スロー（JSON構文エラー） |
| 異常系 | 必須フィールド欠落のJSON | `Error` スロー（バリデーションエラーメッセージ含む） |

#### カバレッジ目標
- `validateWatcherConfig`: 100%（純粋関数のため全分岐カバー可能）
- `loadWatcherConfig`: 80%（ファイルI/O分岐は一時ファイルでカバー）

### ユニットテスト不可能な項目（例外）

- なし。`loadWatcherConfig` のファイルI/Oは一時ファイルを作成する結合テストでカバー可能。12:22 現在のプロジェクトパターン（`src/tickets.ts` と同様）に従う。

## Boy Scout Rule — 翻訳可能性計画

このチケットで新規作成する `src/watcher.ts` に対して、最初から翻訳可能性を確保する：

1. **関数名は動詞句**: `loadWatcherConfig`, `validateWatcherConfig` — 関数呼び出しの並びが処理手順を物語る
2. **変数名はドメイン概念**: `intervalMinutes`, `startTime`, `endTime`, `timezone` — 設定項目名をそのまま型フィールド名として使用
3. **一関数一責務**: `loadWatcherConfig` はファイル読み込み + パース + バリデーションを一貫して行うが、内部で `validateWatcherConfig` を呼び出し、責務を分離する
4. **ハードコード値は名前付き定数**: 時刻フォーマットの正規表現はプライベート定数として `src/watcher.ts` 内で定義する
5. **エラー握りつぶし禁止**: ファイル読み込みエラーはそのまま伝播、バリデーションエラーは `ValidationResult.errors` に集約して呼び出し元が適切に処理できるようにする

既存コードの改善はスコープ外（新規ファイル作成のみのため）。

## Acceptance Criteria

- [ ] `WatcherConfig` インターフェースが4フィールド（intervalMinutes, startTime, endTime, timezone）を定義している
- [ ] `ValidationResult` インターフェースが valid フラグと errors 配列を持つ
- [ ] `validateWatcherConfig` が全フィールドの型・値範囲・フォーマットを検証する
- [ ] `loadWatcherConfig` がファイル読み込み + バリデーションを一貫して行う
- [ ] 無効な設定に対して適切なエラーメッセージが返る
- [ ] 日跨ぎ判定ロジック（P6-2）がこの型を使用できる
- [ ] 翻訳可能性の検証が通っている
- [ ] 既存テストが通過している
- [ ] `make test` が成功している

## Notes

### 依存関係

| 方向 | チケット | 関係 |
|------|---------|------|
| 入力 | P8-2 (CLI統合) | `-w/--watcher` で得たファイルパスを `loadWatcherConfig` に渡す |
| 出力→ | P6-2 (時間窓判定) | `WatcherConfig` の startTime/endTime/timezone を `isInTimeWindow` が消費する |
| 出力→ | P7-1 (CronScheduler) | `WatcherConfig` の intervalMinutes で定期実行間隔を設定 |
| 出力→ | P8-1 (ステップ境界制御) | runner.ts が `WatcherConfig` を参照して endTime ガードを行う |

### 結合テスト計画
- P6-2 実装後に、`loadWatcherConfig` → `isInTimeWindow` の結合テストを追加
- P8-2 実装後に、CLI引数 → `loadWatcherConfig` の I/O 結合テストを追加

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testUnit[]`, `testExceptions[]`, `notes` フィールド
- **実装サマリ**: `changes[]`, `notes` フィールド
- **レビュー報告書**: `instrumentation`, `notes`, `rfcDiscrepancies[]` フィールド
