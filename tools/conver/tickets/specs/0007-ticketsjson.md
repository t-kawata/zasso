---
ticket_id: 7
title: Tickets.json 読み込み・状態確認
slug: ticketsjson
status: draft
created_at: 2026-06-26
updated_at: 2026-06-26
---
# Tickets.json 読み込み・状態確認

## Summary

`src/tickets.ts` に実装する Tickets.json 読み込みモジュール。現状はスタブ実装（[::STUB::] P1-1）であり、本チケットで以下の3関数を本実装する：
- `loadPendingTickets(ticketsPath)`: 未処理チケット一覧を返す
- `checkAllReviewed(ticketsPath)`: 全チケットが reviewed 状態かを判定
- `getSourceFromTickets(ticketsPath)`: metadata.source を返す

合わせて、`TicketsJson` / `Phase` / `Ticket` の型定義を実際の JSON 構造に合わせて修正する。

## Background

conver.js のメインループ（`runner.ts`）は、Tickets.json を読み込んで未処理チケットを抽出し、順次処理する。この読み込み・状態確認の責務を `tickets.ts` に分離することで、`runner.ts` は処理の制御のみに集中できる。

Tickets.json は以下の構造を持つ（`.claude/scripts/lib/validate-tickets.js` のバリデーションに準拠）：

```json
{
  "title": "...",
  "metadata": { "source": "tools/conver/RFC_ROOT.md", "generatedAt": "2026-06-25" },
  "phases": [
    { "id": 0, "name": "Phase 0", "externalDependencies": "...",
      "tickets": [
        { "id": 1, "phaseId": 0, "status": "todo", "title": "...", "scope": [...], ... }
      ]
    }
  ]
}
```

**現在のスタブの問題点:**
1. `TicketsJson` が `{ tickets: Ticket[] }` と定義されているが、実際は `{ phases: Phase[] }` で Phase 内に tickets がネストしている
2. 全関数のシグネチャが `(tickets: Ticket[])` と配列を受け取っているが、実際は `(ticketsPath: string)` でファイルパスを受け取り、内部で `readFileSync` で読み込むべき
3. `getSourceFromTickets` の戻り値ロジックが未実装（metadata.source を優先、なければ元のパスを返す）

## Scope

### 型定義の修正
- Ticket: id, phaseId, status, title + オプショナルフィールド（referenceSection, background, scope, testUnit, testExceptions, instrumentation, notes, relatedTicketIds, startedAt, completedAt）
- Phase: id, name, externalDependencies?, tickets: Ticket[]
- TicketsJson: title?, metadata?: { source: string, generatedAt: string, analyzedSections?: string }, phases: Phase[]

### 関数の本実装
- `loadPendingTickets(ticketsPath: string): Ticket[]` — `readFileSync` でファイルを読み込み、全チケットのうち `status !== "reviewed"` のものを抽出。各チケットに `phaseId` が付与されていることを確認する。戻り値はすべての pending チケット（全 phase をフラットに走査）。
- `checkAllReviewed(ticketsPath: string): boolean` — 全チケットの `status` が `"reviewed"` の場合に `true`、1件でも未 review があれば `false`。空のチケット一覧の場合は `true` とする。
- `getSourceFromTickets(ticketsPath: string): string` — `metadata.source` が存在すればその値を、なければ `ticketsPath`（引数そのまま）を返す。

### 関数シグネチャの統一
- 全関数が `(ticketsPath: string)` を受け取り、内部で JSON ファイルを読み込む
- ファイル読み込みは `readFileSync`（stdlib、エンコーディングは `"utf-8"`）
- JSON パース失敗やファイル不在のエラーは呼び出し元に伝播（キャッチしない）

### テストファイル作成
- `src/tickets.test.ts` を作成し、`node --test` で実行可能にする
- テストヘルパーとして一時ファイル書き込み関数を含める（test.sh の既存パターンを踏襲）

## Non-scope

- **書き込み処理**: Tickets.json の書き込みは Claude Code セッションと `.claude/scripts/tickets/` のスクリプト群が担当。本モジュールは読み取り専用。
- **バリデーション**: JSON スキーマバリデーションは行わない（`.claude/scripts/lib/validate-tickets.js` が担当）。不正な形式の JSON はそのままパースエラーとして伝播。
- **キャッシング**: 現在のスコープではキャッシュ機構は実装しない。毎回ファイルから読み込む。必要に応じて PX チケットで対応。

## Investigation

### 現状のソースコード調査結果

**src/tickets.ts (スタブ実装, 468 bytes)**
```typescript
// [::STUB::] P1-1: Tickets.json 読み込みの本実装は P1-1 で行う

export interface Ticket {
  id: number;
  phaseId: number;
  status: string;
  title: string;
}

export interface TicketsJson {
  tickets: Ticket[];
}

export function loadPendingTickets(path: string): Ticket[] {
  return [];
}

export function checkAllReviewed(tickets: Ticket[]): boolean {
  return true;
}

export function getSourceFromTickets(tickets: Ticket[]): string {
  return "";
}
```

**問題点の詳細:**

| 問題 | 箇所 | 説明 |
|------|------|------|
| インターフェース不整合 | TicketsJson | `tickets: Ticket[]` だが実際の構造は `phases: Phase[]` |
| シグネチャ不整合 | checkAllReviewed, getSourceFromTickets | `Ticket[]` を受け取っているが、ファイルパスを受け取るべき |
| 未実装 | loadPendingTickets | 常に空配列を返す |
| 未実装 | checkAllReviewed | 常に true を返す |
| 未実装 | getSourceFromTickets | 常に空文字を返す |

**Tickets.json の実際の構造（Tickets.json から抽出）:**
```json
{
  "title": "conver.js: ACP-based Ticket Processing Pipeline 実装チケット分解設計書",
  "metadata": {
    "source": "tools/conver/RFC_ROOT.md",
    "generatedAt": "2026-06-25",
    "analyzedSections": "1. CLI設計, 2. ACPセッション管理, ..."
  },
  "phases": [
    {
      "id": 0,
      "name": "純粋ロジック基盤 (Layer 0/1) — 型定義・純粋関数",
      "externalDependencies": "なし（stdlibのみ）",
      "tickets": [...]
    }
  ]
}
```

**Ticket が持つ全フィールド（Tickets.json から抽出）:**
- id (number, required)
- phaseId (number, required)
- status (string, required — "todo" | "done" | "reviewed")
- title (string, required)
- referenceSection (string, optional)
- background (string, optional)
- scope (string[], optional)
- testUnit (string[], optional)
- testExceptions (string[], optional)
- instrumentation (string, optional)
- notes (string, optional)
- relatedTicketIds (string, optional)
- startedAt (string: YYYY-MM-DD, optional)
- completedAt (string: YYYY-MM-DD, optional)

**既存のテストパターン（src/cli.test.ts から）:**
- テストフレームワーク: `node:test` + `node:assert/strict`
- 実行方法: ビルド後、`dist/` の compiled JS に対して `node --test` で実行
- ファイル書き込みを伴うテストは `test.sh` の統合テストで行う（一時ファイル使用、排他制御）

## Test Plan

### ユニットテスト計画

**テストファイル:** `src/tickets.test.ts`
**テストフレームワーク:** `node:test` + `node:assert/strict`（cli.test.ts と同一）
**カバレッジ目標:** 90%以上

**loadPendingTickets (ticketsPath: string): Ticket[]**

| ケース | 種別 | 入力 | 期待結果 |
|--------|------|------|---------|
| 正常: 1 phase に未処理2件+reviewed1件 | 正常系 | 3チケット中2件未処理の JSON ファイル | 未処理2件のみ返る |
| 正常: 複数 phase に分散した未処理 | 正常系 | Phase 0に1件(done), Phase 1に1件(todo) | todo の1件のみ |
| 正常: 未処理なし(全 reviewed) | 境界値 | 全チケット status=reviewed | 空配列 |
| 正常: 空のチケット一覧 | 境界値 | phases が空 | 空配列 |
| 異常: ファイルなし | 異常系 | 存在しないパス | ENOENT 例外を throw |
| 異常: 不正な JSON | 異常系 | 壊れた JSON | SyntaxError を throw |

**checkAllReviewed (ticketsPath: string): boolean**

| ケース | 種別 | 入力 | 期待結果 |
|--------|------|------|---------|
| 正常: 全チケット reviewed | 正常系 | 全 tickets.status = "reviewed" | true |
| 正常: 未処理あり | 正常系 | 1件 status="todo" | false |
| 正常: 空配列 | 境界値 | tickets=[] | true |
| 異常: ファイルなし | 異常系 | 存在しないパス | ENOENT 例外 |

**getSourceFromTickets (ticketsPath: string): string**

| ケース | 種別 | 入力 | 期待結果 |
|--------|------|------|---------|
| 正常: metadata.source あり | 正常系 | source="tools/conver/RFC.md" | "tools/conver/RFC.md" |
| 正常: metadata なし | 正常系 | metadata キー不在 | ticketsPath をそのまま返す |
| 正常: metadata はあるが source なし | 境界値 | metadata={generatedAt:...} のみ | ticketsPath をそのまま返す |
| 異常: ファイルなし | 異常系 | 存在しないパス | ENOENT 例外を throw |

### ユニットテスト不可能な項目（例外）

なし。全テストケースは一時ファイルを作成してのユニットテストでカバー可能。node:fs の readFileSync は実際のファイルシステムを使用する。

## Boy Scout Rule — 翻訳可能性計画

### 現在のスタブからの改善点

1. **関数シグネチャの修正**: `(tickets: Ticket[])` → `(ticketsPath: string)` — 「チケット配列」ではなく「チケットファイルのパス」を受け取ることで関数名と引数の一貫性を確保
2. **型定義の改善**: `TicketsJson { tickets: Ticket[] }` → `TicketsJson { phases: Phase[] }` — JSONの実際の構造を正確に型で表現
3. **変数名の文脈付与**: `path` → `ticketsPath` で「何のパスか」を明示
4. **コメントの「なぜ」記述**: 各関数に「なぜこの処理が必要か」を日本語で記述（`/start-ticket` 時に実施）
5. **ハードコード値なし**: `readFileSync` のエンコーディング `"utf-8"` は 1箇所のみの使用のため定数化不要

### スコープ外の改善対象

現状では `src/conver.ts` や `src/runner.ts` は未だ軽量なスタブであり、P4-1/P4-2 で本実装される。tickets.test.ts を作成することでテストパターンを統一し、後続チケットのテスト作成を容易にする。

## Acceptance Criteria

- [ ] `TicketsJson` インターフェースが `phases: Phase[]` を含む実際の構造と一致する
- [ ] `loadPendingTickets(ticketsPath)` がファイルを読み込んで未処理チケットのみを返す
- [ ] `checkAllReviewed(ticketsPath)` が全チケットの status を正しく判定する
- [ ] `getSourceFromTickets(ticketsPath)` が metadata.source を優先して返す
- [ ] 不正な JSON / ファイル不在の場合はエラーを throw する
- [ ] 全既存テスト（`node --test dist/`）が通過する
- [ ] 翻訳可能性の検証: 関数名と引数の一貫性が担保されている
- [ ] 犯罪スキャン: 0件（新規犯罪を発生させない）

## Notes

### 依存・関連チケット

| チケット | 関係 | 説明 |
|----------|------|------|
| P0-3 | **先行完了済み** | CLI引数パース完了。P1-1 は P0-3 で定義された型には依存しない |
| P4-1 | **後続依存** | `runner.ts` が `loadPendingTickets` / `checkAllReviewed` / `getSourceFromTickets` を利用する |
| P0-2 | **関連** | error.ts (CommandTimeoutError) — P1-1 ではファイル I/O エラーは呼び出し元に伝播するため直接依存しない |

### 犯罪スキャン結果

- Malfeasance.json: 0件（犯罪なし）
- `[::STUB::]` マーカー: `tickets.ts` の全スタブ関数に付与済み ✅

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testUnit[]`, `testExceptions[]`, `notes` フィールド
- **実装サマリ**: `changes[]`, `notes` フィールド
- **レビュー報告書**: `instrumentation`, `notes`, `rfcDiscrepancies[]` フィールド
