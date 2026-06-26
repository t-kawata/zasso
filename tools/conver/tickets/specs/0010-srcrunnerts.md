---
ticket_id: 10
title: メインループ制御 (src/runner.ts)
slug: srcrunnerts
status: draft
created_at: 2026-06-26
updated_at: 2026-06-26
---
# メインループ制御 (src/runner.ts)

## Summary

Tickets.json から未処理チケットを順次取得し、ACP セッションを介して make → plan → start → review → resolve → find の一連の工程を自動実行するメインループ制御モジュール `src/runner.ts` を実装する。エラー発生時は Slack 通知 + `process.exit(1)` で停止する。

## Background

二層構造の開発パイプラインにおける内部ループ（内側ループ）を完全自動化するための要となるモジュール。各工程は独立した ACP セッションで実行され、DeepSeek V4（flash / pro）のモデル選択に対応する。

現在の `src/runner.ts` はスタブ（`return Promise.resolve()`）であり、P4-2（エントリポイント）から呼び出されてはいるが実際の処理は一切行われない。P3-1（session.ts）で `withSession` / `runCommand` / `disposeSession` が完全実装されたため、その呼び出し側である runner.ts を実装する準備が整った。

### 設計文書

RFC_ROOT.md §3（内部ループ制御）に完全な設計とコード例が記載されている。実装はこれに準拠する。

### 依存モジュール（全件 completed）

| モジュール | チケット | 状態 | runner.ts での使用箇所 |
|---|---|---|---|
| `src/session.ts` | P3-1 | reviewed | `withSession`, `runCommand` |
| `src/tickets.ts` | P1-1 | reviewed | `getSourceFromTickets`（find 工程で使用） |
| `src/notifier.ts` | P2-1 | reviewed | `sendSlackError`, `ErrorContext` |
| `src/error.ts` | P0-2 | reviewed | `CommandTimeoutError`（`runCommand` 経由） |
| `src/cli.ts` | P0-3 | reviewed | `CliOptions`（`LoopOptions` と実質同一） |

## Scope

### 実装するもの

1. **`LoopOptions` インターフェース** — `cli.ts` の `CliOptions` と同一フィールドを持つ。将来的な分離可能性のため独立定義する。
2. **`runLoop(options: LoopOptions): Promise<void>`** — メインループ制御（全チケットの逐次処理を制御）
3. **`loadPendingTickets(ticketsPath: string): Ticket[]`** — 未処理チケット読み込み（`tickets.ts` の同名関数と異なり、phaseId の付与順序が異なる）
4. **`checkAllReviewed(ticketsPath: string): boolean`** — 全チケット reviewed 判定（同上）
5. **`getCurrentPhase(error: unknown): string`** — エラーメッセージから工程名抽出

### ループフロー

```
ループ開始
  ├─ Tickets.json 読み込み（loadPendingTickets）
  ├─ 未処理チケットが存在するか確認 → なければ終了
  │
  ├─ [Session A] /make-ticket → /plan-ticket → /start-ticket
  │    └─ エラー → Slack通知 → exit(1)
  │
  ├─ [Session B] /review-ticket
  │    └─ エラー → Slack通知 → exit(1)
  │
  ├─ reviewedCount % resolveEvery === 0 チェック
  │    └─ 条件満たす → [Session C] /resolve-ticket
  │         └─ エラー → Slack通知 → exit(1)
  │         └─ pushEnabled → /jpush-branch（失敗時も Slack通知 + exit(1)）
  │
  ├─ Tickets.json 再読み込み（checkAllReviewed）
  │    └─ 全件 reviewed → [Session D] /find-omissions-for-next-rfc
  │         └─ エラー → Slack通知 → exit(1)
  │
  └─ 次の未処理チケットへ（ループ継続）
```

### エラーハンドリング

すべてのエラーは `runLoop` の `catch` ブロックで集中管理する：
1. `sendSlackError` で Slack 通知（3回リトライ）
2. コンソールにエラー出力
3. `process.exit(1)` でプロセス終了

## Non-scope

- Tickets.json への書き込み — すべて Claude Code セッション内のスラッシュコマンドが行う
- ACP セッションの直接管理 — `session.ts`（P3-1）が担当
- CLI 引数パース — `cli.ts`（P0-3）が担当
- Slack 通知の実装詳細 — `notifier.ts`（P2-1）が担当
- エントリポイント（conver.ts）— P4-2 で対応

## Investigation

### 現状のソースコード

**`src/runner.ts`**（2026-06-26 時点）:
```
// [::STUB::] P4-1: メインループ制御の本実装は P4-1 で行う

import { CliOptions } from "./cli.js";

export function runLoop(options: CliOptions): Promise<void> {
  return Promise.resolve();
}
```

- 行数: 7行（スタブ）
- 公開関数: `runLoop` のみ（空実装）
- 内部関数: なし
- テストファイル: 未作成（`src/runner.test.ts` は存在しない）

**`src/conver.ts`**（エントリポイント、4行で呼び出し）:
```typescript
import { runLoop } from "./runner.js";
// ...
await runLoop(options);
```

**依存モジュールのインターフェース確認**:

| モジュール | 使用する関数・型 | シグネチャ |
|---|---|---|
| `session.ts` | `withSession<T>(cwd, apiKey, model, fn)` | `(cwd: string, apiKey: string, model: string, fn: (session: AcpSession) => Promise<T>) => Promise<T>` |
| `session.ts` | `runCommand(acpSession, command, options)` | `(acpSession: AcpSession, command: string, options: RunCommandOptions) => Promise<string>` |
| `session.ts` | `RunCommandOptions` | `{ timeoutMs: number; verbose: boolean }` |
| `notifier.ts` | `sendSlackError(webhookUrl, context)` | `(webhookUrl: string, context: ErrorContext) => Promise<void>` |
| `notifier.ts` | `ErrorContext` | `{ ticketId: string; phase: string; error: Error; ticketsPath: string }` |
| `tickets.ts` | `getSourceFromTickets(ticketsPath)` | `(ticketsPath: string) => string` |

### 既存テストファイルの確認

- `src/runner.test.ts`: 存在しない（新規作成が必要）
- 既存のテストパターンは `src/session.test.ts`（9テストケース）を参考にする
- テストランナー: `node --experimental-vm-modules` + Node.js 標準テスト

### スタブ・犯罪ステータス

- 犯罪レコード: 0件 ✅
- `[::STUB::]` マーカー: `src/runner.ts` に正しく付与済み ✅
- 残存スタブ4件: 全件が `[::STUB::]` マーカー付きで管理済み ✅

## Test Plan

### ユニットテスト計画

`src/runner.test.ts` を作成し、以下のテストケースを実装する。

**テスト方針**: 外部依存（`withSession`, `runCommand`, `sendSlackError`）はすべてモック化し、runner.ts の制御ロジックのみを検証する。

#### 1. `getCurrentPhase`

| # | ケース | 入力 | 期待出力 |
|---|--------|------|----------|
| 1 | 正常系: make-ticket 検出 | `new Error("/make-ticket failed")` | `"make-ticket"` |
| 2 | 正常系: plan-ticket 検出 | `new Error("plan-ticket error")` | `"plan-ticket"` |
| 3 | 正常系: start-ticket 検出 | `new Error("in /start-ticket")` | `"start-ticket"` |
| 4 | 正常系: review-ticket 検出 | `new Error("review-ticket")` | `"review-ticket"` |
| 5 | 正常系: resolve-ticket 検出 | `new Error("/resolve-ticket")` | `"resolve-ticket"` |
| 6 | 正常系: find-omissions 検出 | `new Error("find-omissions")` | `"find-omissions"` |
| 7 | 正常系: jpush-branch 検出 | `new Error("jpush-branch")` | `"jpush-branch"` |
| 8 | 正常系: 不明なエラー | `new Error("unknown error")` | `"unknown"` |
| 9 | 異常系: Error 以外の throw | `"string error"` | `"unknown"` |

#### 2. `runLoop` — 正常フロー

外部依存はすべてスタブに差し替える。

| # | ケース | 条件 | 期待動作 |
|---|--------|------|----------|
| 10 | 正常ループ: | 未処理1件, resolveEvery=1, pushEnabled=false | make/plan/start → review → resolve の順で各 session が呼ばれる。exit(1) は呼ばれない |
| 11 | resolve 間隔: resolveEvery=3, 1件のみ | resolve 条件未満 | review のみ実行。resolve セッションは呼ばれない |
| 12 | 全件 reviewed 検出時: find 実行 | resolve後, checkAllReviewed=true | find-omissions セッションが実行される |
| 13 | 全件 reviewed 未満: find スキップ | resolve後, checkAllReviewed=false | find-omissions セッションは実行されない |
| 14 | maxCount 制限: 2件中1件処理 | maxCount=1 | 1件のみ処理され、2件目はスキップされる |

#### 3. `runLoop` — エラーフロー

| # | ケース | 条件 | 期待動作 |
|---|--------|------|----------|
| 15 | make/plan/start エラー | Session A の runCommand が reject | sendSlackError 呼出 + process.exit(1) |
| 16 | review エラー | Session B の runCommand が reject | sendSlackError 呼出 + process.exit(1) |
| 17 | resolve エラー | Session C の runCommand が reject | sendSlackError 呼出 + process.exit(1) |
| 18 | jpush-branch エラー | pushEnabled=true, runCommand reject | sendSlackError 呼出 + exit(1) |

#### 4. `runLoop` — その他

| # | ケース | 条件 | 期待動作 |
|---|--------|------|----------|
| 19 | pushEnabled=true: jpush-branch 実行 | resolve毎, pushEnabled=true | resolve 後に jpush-branch セッションが呼ばれる |
| 20 | 未処理チケット0件: 早期終了 | loadPendingTickets 空配列 | ループに入らず終了メッセージを出力 |

#### カバレッジ目標:
- 全関数: 90% 以上
- クリティカルパス（エラーハンドリング）: 100%

### ユニットテスト不可能な項目（例外）

- **実際の ACP バイナリ（claude-agent-acp）の起動テスト**: E2E テストとして `test.sh` で手動検証。ユニットテストでは `withSession` / `runCommand` をモック化する。
- **DeepSeek API キーの検証**: 外部 API 依存のためユニットテスト不可。
- **`process.exit(1)` の実際の終了確認**: モックで呼び出し確認のみ。実際のプロセス終了は E2E テストに委ねる。

## Boy Scout Rule — 翻訳可能性計画

### 実装後期待する状態

**`src/runner.ts`** の各関数は以下の翻訳可能性を満たす：

- `runLoop(options)`: 「ループを実行する」 — ループ制御のエントリポイント名として適切
- `loadPendingTickets(ticketsPath)`: 「未処理チケットを読み込む」 — 責務が明確
- `checkAllReviewed(ticketsPath)`: 「全件レビュー済みか確認する」 — 真偽値戻り値
- `getCurrentPhase(error)`: 「現在の工程を取得する」 — 入力に対して分類する責務が明確

### 改善計画

1. **既存コードの改善**: 本チケットのスコープ外。現在の `src/runner.ts` はスタブ7行のみで、改善対象は存在しない。
2. **新規コードのルール順守**:
   - 関数名はすべて動詞句で統一（`runLoop`, `loadPendingTickets`, `checkAllReviewed`, `getCurrentPhase`）
   - 変数名はドメイン概念を表現（`ticketId`, `pending`, `reviewedCount` 等）
   - 一関数一責務を厳守（`runLoop` がループ制御、`getCurrentPhase` が工程名抽出）
   - ハードコード値は名前付き定数
   - エラー握りつぶし禁止（エラーは常に `catch` ブロックに集約）
   - コメントは「なぜ」に特化（コードが「何を」語る）

## Acceptance Criteria

- [ ] `loadPendingTickets`: Tickets.json から未処理（status ≠ "reviewed"）チケットを抽出できる
- [ ] `checkAllReviewed`: 全チケットの status が "reviewed" か判定できる
- [ ] `getCurrentPhase`: エラーメッセージから正しい工程名を抽出できる（7パターン + 不明）
- [ ] `runLoop`: 正常フローで make/plan/start → review → resolve/find の順に各セッションが呼ばれる
- [ ] `runLoop`: resolveEvery 条件に応じて resolve セッションの実行間隔を制御できる
- [ ] `runLoop`: pushEnabled=true 時、resolve 後に jpush-branch が実行される
- [ ] `runLoop`: エラー発生時に Slack 通知 + `process.exit(1)` が呼ばれる
- [ ] `runLoop`: 全チケット reviewed 検出時に find-omissions が実行される
- [ ] `runLoop`: 未処理チケット0件で早期終了する
- [ ] 翻訳可能性: 関数名は動詞句、変数名はドメイン概念、一関数一責務
- [ ] テスト: 全ケース成功（20テストケース以上）
- [ ] カバレッジ: 90% 以上
- [ ] ビルド確認: `npm run build` 成功
- [ ] 犯罪スキャン: 0件
- [ ] `[::STUB::]`: `src/runner.ts` のスタブマーカー削除完了
