---
ticket_id: 35
title: CLI引数統合 — cli.ts への -w/--watcher 追加
slug: cli-clits-w-watcher
status: draft
created_at: 2026-07-01
updated_at: 2026-07-01
---
# CLI引数統合 — cli.ts への `-w`/`--watcher` 追加

## Summary

src/cli.ts に `-w`/`--watcher` CLI フラグを追加し、Watcher モード用の JSON 設定ファイルパスを受け付ける。指定がない場合は従来の通常モードを維持する。

## Background

Watcher モード全体のパイプラインにおいて、P6-1（WatcherConfig 型定義と設定ファイル読み込み）、P6-2（時間窓判定）、P8-1（ステップ境界時間制御）は完了済み。これらをユーザーが実際に起動できるようにするため、CLI インターフェースに `-w` フラグを追加する。

フラグで指定された JSON 設定ファイルパスは `CliOptions.watcherConfig` に文字列として格納され、conver.ts のエントリポイントで `loadWatcherConfig()` を介して `WatcherConfig` オブジェクトに変換される（P8-3 のスコープ）。

## Investigation

### 現状調査

src/cli.ts の現状:

- **CliOptions インターフェース**（src/cli.ts:5-16）: 現在11フィールド。watcherConfig フィールドは未定義。
- **showUsage() 関数**（src/cli.ts:18-47）: help 表示に watcher オプションなし。
- **parseCliOptions() 関数**（src/cli.ts:49-94）: parseArgs で全オプションを定義。`-w`/`--watcher` 未定義。

src/cli.test.ts の現状:

- 全フラグ指定テスト: watcherConfig 未アサーション
- 最小構成テスト: watcherConfig 未アサーション

src/conver.test.ts の現状:

- パラメータログアサーション: 7項目（model / ticketsPath / maxCount / resolveEvery / pushEnabled / timeoutMs / noFind）で watcherConfig なし

### 依存関係

| 依存元 | 依存先 | 状態 | 内容 |
|--------|--------|------|------|
| P8-2 → | P6-1 (WatcherConfig) | reviewed ✅ | 設定データ型・ロード関数の提供元 |
| P8-2 → | P0-3 (cli.ts 既存コード) | reviewed ✅ | 編集対象の既存ファイル |
| P8-2 ← | P8-3 (entrypoint) | todo ❓ | watcherConfig を受け取る消費側 |

### 変更の全体像

cli.ts (P8-2)                conver.ts                     runner.ts
  ┌────────────────┐         ┌──────────────────┐         ┌─────────────────┐
  │ CliOptions      │         │ parseCliOptions() │         │ LoopOptions      │
  │  apiKey:        │         │   → CliOptions    │         │  watcherConfig?: │
  │  ...            │         │                    │         │   WatcherConfig  │
  │  watcherConfig?:│─string──┼── -w/--watcher path│         │                  │
  └───────┬────────┘         │                    │         └────────┬────────┘
          │                  │ loadWatcherConfig()│                  │
          └─────────────────►│   → WatcherConfig  ├──────────────────┘
                             │                    │
                             └────────────────────┘
                              (P8-3 で実装)

## Scope

### 変更ファイル

1. **src/cli.ts** — CliOptions に `watcherConfig?: string` 追加、parseCliOptions に `-w`/`--watcher` オプション追加、showUsage に説明追加
2. **src/cli.test.ts** — 新規テストケース追加（watcher オプションの正常系 5ケース）
3. **src/conver.test.ts** — パラメータログアサーションを 7項目 → 8項目に更新

### 変更内容詳細

#### src/cli.ts

**CliOptions インターフェース**（既存 L5-16 に `watcherConfig` 追加）:
```typescript
export interface CliOptions {
  // ...既存11フィールド...
  /** Watcher 設定ファイルへのパス。指定がない場合は未定義（通常モード） */
  watcherConfig?: string;
}
```

**showUsage 関数**（既存 usage 文字列に1行追加）:
```
  -w, --watcher <path>    Watcher config JSON path
```

**parseCliOptions 関数の options 定義**（既存 options オブジェクトに追加）:
```typescript
watcher: { type: "string", short: "w" },
```

**parseCliOptions 関数の戻り値**（既存 return オブジェクトに追加）:
```typescript
watcherConfig: parsed.values.watcher,
// undefined の場合は undefined のまま
```

## Non-scope

- `loadWatcherConfig()` の呼び出し統合 → P8-3
- Runner 起動パスの分岐（通常モードと watcher モード） → P8-3
- `-w` で指定されたファイルのバリデーション → P8-3（P6-1 の validateWatcherConfig を呼ぶ）

## Test Plan

### ユニットテスト計画

#### cli.test.ts に追加するテストケース（5ケース）

| # | テストケース | 種別 | 検証内容 |
|---|-------------|------|----------|
| 1 | `-w /path/to/config.json` 指定 | 正常系 | `watcherConfig` に `/path/to/config.json` が格納される |
| 2 | `--watcher /path/to/config.json` 指定 | 正常系 | ロングオプションでも同一動作 |
| 3 | `-w` 未指定 | 正常系 | `watcherConfig` が `undefined`（通常モード） |
| 4 | 全フラグ + `-w` 指定 | 正常系 | 他11フラグと共存しても正しい |
| 5 | 最小構成 + `-w` 指定 | 正常系 | デフォルト値 + watcherConfig 保持 |

#### conver.test.ts の更新

- 既存テスト「main(): 起動時に全7項目のパラメータログが key=value 形式で出力される」:
  - アサーションを 7項目 → 8項目に更新
  - `paramLines[7]` が `"  watcherConfig="` で始まることを確認する1行を追加
  - `assert.strictEqual(paramLines.length, 8)` に変更

#### カバレッジ目標

- cli.ts: 90% 以上（全オプションのパースがカバーされる）
- conver.ts: 既存カバレッジ維持（ログ項目数のアサーション更新のみ）

### ユニットテスト不可能な項目（例外）

- `showUsage()` 表示内容の完全一致検証 → 統合テスト（test.sh）でカバー（既存方針通り）
- `-w` で指定されたファイルの実在性バリデーション → P8-3（loadWatcherConfig の責務）

## Boy Scout Rule — 翻訳可能性計画

本チケットのスコープ（src/cli.ts, src/cli.test.ts, src/conver.test.ts）は既存コードの翻訳可能性を維持する：

- 新規変数: `watcherConfig` — CLI 設定ファイルパスを格納するドメイン概念名
- 既存関数: `parseCliOptions()` — パース処理に特化済み。責務分割不要
- マジックナンバー: 新規コードに定数化不要の自明な値のみ
- エラー握りつぶし: 既存パターン（必須フラグ欠如の `process.exit(1)`）を踏襲。新たな必須チェックは追加しない

**スコープ外の既存コード**: src/cli.ts の既存コードは翻訳可能性を損なう箇所なし。

## Acceptance Criteria

1. [ ] `-w /path/to/config.json` を指定すると `watcherConfig` に `/path/to/config.json` が格納される
2. [ ] `--watcher /path/to/config.json` も同様に動作する
3. [ ] `-w` 未指定の場合、`watcherConfig` は `undefined`（通常モード）
4. [ ] `--help` の表示に `-w, --watcher <path>` が含まれる
5. [ ] 既存の全CLIオプションの動作に影響を与えない（全テストパス）
6. [ ] conver.test.ts のパラメータログアサーションが 8項目に更新されている
7. [ ] `make test-conver` で全テスト成功（既存 + 新規5ケース + conver更新）

## Notes

### 依存関係一覧

- **P6-1** (WatcherConfig) → reviewed ✅ — 設定ファイル読み込み先の型定義
- **P8-1** (step-timer) → reviewed ✅ — runner.ts での watcherConfig 消費側（既存）
- **P8-3** (entrypoint) → todo — watcherConfig を受け取る後続（conver.ts 統合）
- **P0-3** (existing cli.ts) → reviewed ✅ — 編集対象の既存コード

### 依存関係グラフ（P8関連）

```
P6-1 (WatcherConfig型) ──→ P6-2 (時間窓判定)
    │                            │
    ▼                            ▼
P7-1 (CronScheduler)        P8-1 (step-timer: done)
    │                            │
    ▼                            │
P8-3 (entrypoint: todo) ←── P8-2 (←● CLI引数: このチケット)
```

循環依存: なし ✅

### 犯罪 (Malfeasance)

スキャン結果: 0件 ✅
スタブ数: 0件 ✅
