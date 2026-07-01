---
ticket_id: 28
title: conver.js: --no-find フラグの追加
slug: converjs-no-find
status: draft
created_at: 2026-07-01
updated_at: 2026-07-01
---
# conver.js: --no-find フラグの追加

## Summary

conver.js のチケット自動処理ループにおいて、全チケット完了後に自動実行される find-omissions-for-next-rfc を抑制する `-n / --no-find` フラグを追加する。

## Background

conver.js は make → plan → start → review → resolve のパイプラインを走らせた後、最終段階で /find-omissions-for-next-rfc を自動実行する（RFC_ROOT.md §3 参照）。しかしユーザーが以下のような理由で find をスキップしたい場合がある：

- 単にチケット処理だけ実行して終了したい（find に時間をかけたくない）
- 既に find 済みの状態で再度チケットを流したい
- CI パイプラインの中で部分的な再実行を行いたい

このフラグは `-n 0`（デフォルト）で従来通り find を実行し、`-n 1` で find をスキップする。

## Scope

- cli.ts: `-n / --no-find` オプションの追加（CliOptions インターフェース + parseCliOptions）
- runner.ts: LoopOptions への noFind 追加 + find-omissions ブロックのガード条件
- conver.ts: 変更なし（parseCliOptions が返す値をそのまま runLoop に渡す）
- ヘルプ表示（showUsage）への記述追加
- 起動パラメータログ（conver.ts のログ出力）への表示追加

## Non-scope

- find-omissions-for-next-rfc スラッシュコマンド自体の変更
- 既存の resolve/jpush-branch への影響変更
- テストの新規作成（conver プロジェクトには現時点でテスト体制が未整備のため）

## Investigation

### 証拠1: find-omissions のトリガー箇所（runner.ts:333-354）

```typescript
// Step 4: 全チケット reviewed チェック → Session D: find-omissions
if (checkAllReviewed(options.ticketsPath)) {
  printCommandHeader("/find-omissions-for-next-rfc");
  const source = getSourceFromTickets(options.ticketsPath);
  await withSession(
    cwd,
    options.apiKey,
    options.model,
    async (session) => {
      await runCommand(
        session,
        `/find-omissions-for-next-rfc ${source}`,
        runOptions,
      );
    },
  );
  console.log("\n>>> ✅ find-omissions 完了");
  // find-omissions の結果を Slack 通知
  sendOmissionsNotification(options.slackWebhookUrl, cwd).catch(
    () => {},
  );
}
```

このブロックは resolve ブロック（L278-355）の内部にあり、`reviewedCount === target.length` の条件で実行される。

### 証拠2: ガードすべきブロックの独立性

上記 find-omissions ブロック（L333-354）は resolve ブロック内の末端に位置し、その結果に依存する後続処理は存在しない。直後のコードは resolve ブロックの終了（L355）と for ループの継続／終了のみ。つまり、このブロックを if で丸ごとガードしても副作用は生じない。

### 証拠3: LoopOptions には noFind フィールドが未存在（runner.ts:43-54）

```typescript
export interface LoopOptions {
  apiKey: string;
  model: string;
  ticketsPath: string;
  maxCount: number;
  resolveEvery: number;
  pushEnabled: boolean;
  slackWebhookUrl: string;
  verbose: boolean;
  timeoutMs: number;
  bindReviewInOneSession: boolean;
}
```

新規フィールド `noFind: boolean` の追加が必要。

### 証拠4: CliOptions にも noFind フィールドが未存在（cli.ts:6-17）

```typescript
export interface CliOptions {
  apiKey: string;
  model: string;
  ticketsPath: string;
  maxCount: number;
  resolveEvery: number;
  pushEnabled: boolean;
  slackWebhookUrl: string;
  verbose: boolean;
  timeoutMs: number;
  bindReviewInOneSession: boolean;
}
```

### 証拠5: 修正範囲は3ファイルのみ（cli.ts, runner.ts, conver.ts）

修正は以下の3ヶ所に局所化される：

| ファイル | 変更内容 |
|----------|---------|
| cli.ts | CliOptions に `noFind: boolean` 追加。parseCliOptions で `-n / --no-find` を `"1"` でパース。showUsage に説明追加 |
| runner.ts | LoopOptions に `noFind: boolean` 追加。find-omissions ブロック（L333）を `if (!options.noFind && checkAllReviewed(...))` に変更 |
| conver.ts | main() の起動パラメータログに noFind 表示を追加 |

## Test Plan

### ユニットテスト計画

conver プロジェクトの現状のテスト体制は `tests/merge-omissions-into-root-rfc.test.cjs` のみ。本チケットでは以下のテストを追加する：

1. **cli.test.ts**: parseCliOptions に対するテスト
   - 正常系: `-n 1` → noFind === true
   - 正常系: デフォルト（no-find 未指定）→ noFind === false
   - 境界値: `-n 0` → noFind === false
2. **runner.test.ts**: runLoop に対するテスト
   - 本質的に ACP セッションを必要とするため、モックを用いた単体テストは困難。一方、Plan Gate 承認後に実装する予定のため、テスト計画は以下に限定する：
   - find-omissions ブロックのガード条件の確認（noFind=true で checkAllReviewed が呼ばれないこと）

### ユニットテスト不可能な項目（例外）

- ACP セッションを伴う runLoop 全体の動作確認（モックでも再現困難）
- find-omissions のスキップ動作の確認（ACP レスポンスが必要）

これらの検証は実装後の手動確認（node conver.js -n 1 の実行）で代替する。

## Boy Scout Rule — 翻訳可能性計画

### runner.ts L333 のガード条件

現状:
```typescript
if (checkAllReviewed(options.ticketsPath)) {
```

変更後:
```typescript
if (!options.noFind && checkAllReviewed(options.ticketsPath)) {
```

これは散文的に「noFind がオフで、かつ全チケットが reviewed なら find を実行する」と読めるため、変数名 `noFind` が適切に意図を伝えている。

### cli.ts の showUsage 追加

`Options:` セクションに以下を追加（他のオプションと命名規則統一）:
```
  -n, --no-find <0|1>          Skip find-omissions after all done (default: 0)
```

### 特記事項

対象コードは既に翻訳可能性を満たしているため、本チケットで追加・修正するコードも同水準を維持することを確認する。

## Acceptance Criteria

- [ ] `node dist/conver.js -n 1` で起動した場合、全チケット完了後も find-omissions が実行されない
- [ ] `node dist/conver.js`（デフォルト）で起動した場合、従来通り find-omissions が実行される
- [ ] `node dist/conver.js -n 0` で起動した場合、従来通り find-omissions が実行される
- [ ] ヘルプ表示（`-h`）に `-n / --no-find` の説明が表示される
- [ ] 起動パラメータログに `noFind` の値が表示される
- [ ] 既存の resolve / jpush-branch 動作に影響がない
- [ ] `make build-conver` でビルドが通る

## Notes

- 前段の会話でユーザーが「-n 0 or 1, --no-find 0 or 1 (default 0) というフラグをつけることで、全チケット完了後にも find を実行しないモードで実行できることは安全に可能か」と質問し、安全に可能と回答済み。
- find-omissions ブロックが resolve ブロック内部にあるが、ガード条件の変更で resolve の動作には一切影響しない。
- 実装時は /plan-ticket による計画策定を経て /start-ticket で実装する。

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testVerification[]`, `testExceptions[]`, `notes` フィールド
- **実装サマリ**: `changes[]`, `notes` フィールド
- **レビュー報告書**: `instrumentation`, `notes`, `rfcDiscrepancies[]` フィールド
