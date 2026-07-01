---
ticket_id: 36
title: エントリポイント統合 -- conver.ts watcher 起動パス
slug: converts-watcher
status: draft
created_at: 2026-07-01
updated_at: 2026-07-01
---
# エントリポイント統合 -- conver.ts watcher 起動パス

## Summary

conver.ts のエントリポイント `main()` に watcher モード起動パスを追加する。
`-w/--watcher` で設定ファイルが指定された場合、`loadWatcherConfig()` で設定を読み込み、
`CronScheduler` を起動して定期的に `runLoop()` を実行する。
設定未指定時は従来通りの通常ループを実行する。

## Background

P8-2 で CLI 引数 `-w/--watcher` が追加されたが、conver.ts の `main()` は
`watcherConfig` を `_ignored` として完全に無視している（conver.ts:21）。
watcher モードのエントリポイントとして機能するために、以下の変換が必要：

1. `watcherConfig`（string | undefined）→ `WatcherConfig` への読み込み・変換
2. 設定有無による起動モードの分岐（通常モード / watcher モード）
3. watcher モード時の `CronScheduler` 起動と時間枠制御
4. SIGINT/SIGTERM による graceful shutdown

## Scope

1. **conver.ts main() の修正**: watcherConfig の型変換と分岐処理の追加
2. **runWatcherMode() 関数の追加**: Watcher モード専用の起動処理
   - `loadWatcherConfig()` による設定読み込み
   - `isWithinTimeWindow()` による初回時間枠チェック
   - `CronScheduler` の生成と起動
   - SIGINT/SIGTERM ハンドラの登録
   - 時間枠終了時のクリーンアップと停止
3. **runNormalMode() 関数の追加**: 従来の main() 相当の起動処理（loopOptions を runLoop に渡す）
4. **conver.test.ts の更新**: watcher モード起動パスのテスト追加

## Non-scope

- runner.ts のループロジック変更（既存の `checkStepDeadline` で時間枠チェック済み）
- cli.ts の引数定義変更（P8-2 で完了）
- CronScheduler の実装変更（P7-1 で完了）
- WatcherConfig の型定義変更（P6-1 で完了）

## Investigation

### 現状のコード調査（物理的証拠）

**conver.ts:20-22** — watcherConfig が完全に無視されている：
```typescript
// watcherConfig の型変換（string → WatcherConfig）は P8-3 で行う
const { watcherConfig: _ignored, ...loopOptions } = options;
await runLoop(loopOptions);
```

**cli.ts:19** — CliOptions に watcherConfig フィールドが定義済み：
```typescript
watcherConfig?: string;
```

**runner.ts:57-58** — LoopOptions に watcherConfig? フィールドが定義済み：
```typescript
watcherConfig?: WatcherConfig;
```
しかし現状、conver.ts から runner.ts に watcherConfig が渡されていない。

**watcher.ts:141** — `loadWatcherConfig(path: string): WatcherConfig` が利用可能：
- ファイル読み込み + JSONパース + バリデーションを一貫実行

**cron-scheduler.ts:51** — `CronScheduler` クラスが利用可能：
- `constructor(config: WatcherConfig)`
- `start(callback: () => void)`, `stop()` — 冪等
- `isRunning(): boolean`

**step-timer.ts:23** — `isWithinTimeWindow(config)` が利用可能：
- config が null/undefined の場合は常に true
- config がある場合は時間枠内判定

**conver.test.ts** — 既存のモック構造：
- cli.js と runner.js を `mock.module()` でモック化
- MockLoopOptions には watcherConfig フィールドがない（P8-3 完了後に更新必要）

### 設計判断

watcher モードの起動フロー：

```
main()
  ├── watcherConfig が未指定 → runNormalMode() → runLoop()
  └── watcherConfig が指定
       ├── loadWatcherConfig(configPath) — 設定読み込み（失敗時はエラー終了）
       ├── isWithinTimeWindow(config) — 初回時間枠チェック
       │    └── false → 即時終了（「時間枠外です」のメッセージ）
       ├── CronScheduler(config).start(runLoop) — 定期実行開始
       ├── SIGINT/SIGTERM → CronScheduler.stop() → process.exit(0)
       └── time-window 終了検知 → CronScheduler.stop() → process.exit(0)
```

通常モードは従来通り `runLoop(loopOptions)` の 1 行。関数抽出自体は必須ではないが、
コードの翻訳可能性（`main()` が設定変換→モード選択→起動 の流れを語る）のために
`runNormalMode()` / `runWatcherMode()` に分割する。

## Test Plan

### ユニットテスト計画

テスト対象: conver.ts（修正後）

**モジュールモック（既存と同じ戦略）**:
- `cli.js` の `parseCliOptions` — 既存モックを拡張
- `runner.js` の `runLoop` — 既存モックを拡張
- `watcher.js` の `loadWatcherConfig` — 新規モック追加（`mock.module()` は1度しか呼べないため事前登録）

**正常系ケース**:
1. watcherConfig 未指定 → runLoop が呼ばれる（既存テストを拡張）
2. watcherConfig 指定（有効なパス）→ loadWatcherConfig が呼ばれ、CronScheduler が起動される
3. watcherConfig 指定かつ時間枠内 → runLoop が呼ばれる
4. watcherConfig 指定かつ時間枠外 → runLoop 未呼出、即時終了

**異常系ケース**:
5. watcherConfig 指定だが設定ファイル不在 → エラー終了（process.exit(1)）
6. watcherConfig 指定だが設定ファイルが不正JSON → エラー終了
7. watcherConfig 指定だがバリデーション失敗 → エラー終了

**境界値ケース**:
8. watcherConfig が空文字列 → 通常モードとして動作

### ユニットテスト不可能な項目（例外）

1. **デーモン的挙動の完全検証**: CronScheduler による定期実行の連続動作は
   プロセスライフサイクルをまたぐため E2E テストで検証する（既存の testExceptions と同じ）
2. **SIGINT/SIGTERM の動作確認**: シグナルハンドラのテストはプロセス終了を伴うため
   手動または E2E テストで検証する

## Boy Scout Rule — 翻訳可能性計画

**conver.ts main() 修正時の改善**:
- `runWatcherMode()` / `runNormalMode()` への分割で main() を宣言的にする
  （main() = 「設定を解析し、モードを選択し、実行する」と読める）
- `_ignored` 変数名を削除し、watcherConfig を実際に使うコードに置き換える
- エラーハンドリング漏れを防止：loadWatcherConfig のエラーは catch して
  console.error + process.exit(1) する

**conver.test.ts 改善**:
- テストコード内のインライン `MockLoopOptions` に `noFind` フィールドを追加
  （現在は欠落しており、watcherConfig も含める）
- テストケース名を日本語訳読可能な形式に維持

## Acceptance Criteria

- [ ] `-w` 未指定時に `runLoop()` が従来通り呼ばれる
- [ ] `-w config.json` 指定時に `loadWatcherConfig()` で設定が読み込まれる
- [ ] `-w` 指定かつ時間枠内で `CronScheduler.start()` が呼ばれる
- [ ] `-w` 指定かつ時間枠外で即時終了（process.exit(0)）
- [ ] 設定ファイル不在時・不正JSON時・バリデーション失敗時にエラー終了（process.exit(1)）
- [ ] SIGINT/SIGTERM で CronScheduler.stop() が呼ばれる
- [ ] 既存テストがすべて通過する
- [ ] `main()` が「設定解析→モード選択→実行」と翻訳可能な宣言的コードになっている

## Notes

<!--
注: このコメントは人間向けの説明である。

- plan: /plan-ticket が計画を策定し、チケットの JSON フィールド（scope, testVerification, notes）に保存する
- implementation: /start-ticket が実装サマリーをチケットの JSON フィールド（changes, notes）に保存する
- review: /review-ticket がレビュー報告をチケットの JSON フィールド（instrumentation, notes）に保存する

詳細は Tickets.json の該当チケットフィールドを参照すること。
-->

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testVerification[]`, `testExceptions[]`, `notes` フィールド
- **実装サマリ**: `changes[]`, `notes` フィールド
- **レビュー報告書**: `instrumentation`, `notes`, `rfcDiscrepancies[]` フィールド
