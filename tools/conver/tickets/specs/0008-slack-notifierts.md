---
ticket_id: 8
title: Slack通知モジュール (notifier.ts)
slug: slack-notifierts
status: draft
created_at: 2026-06-26
updated_at: 2026-06-26
---
# Slack通知モジュール (notifier.ts)

## Summary

`src/notifier.ts` に実装する Slack Incoming Webhook へのエラー通知モジュール。
現状はスタブ実装（`[::STUB::] P2-1`）であり、本チケットで以下の関数群を本実装する：

- `getUsername()`: 実行ユーザー名の取得
- `getAbsolutePath()`: 相対パスの絶対パス変換
- `classifyError()`: エラー種別の分類
- `buildSlackMessage()`: 規定フォーマットのメッセージ構築
- `sendSlackOnce()`: `https.request` による1回送信
- `sendSlackWithRetry()`: 指数バックオフリトライ
- `sendSlackError()`: 公開エントリポイント

`ErrorContext` インターフェースも RFC 定義に合わせて修正する。

## Background

conver.js のメインループ（`runner.ts`）は、各工程（make/plan/start/review/resolve）でエラーが発生した場合に Slack へ通知する必要がある。
エラー通知には Slack Incoming Webhook を使用し、Markdown フォーマットで以下の情報を人間が読める形で送信する：

```
■ conver エラー報告
• Tickets.json: /full/path/to/Tickets.json
• ユーザー: username
• チケット: P0-1 (チケットタイトル)
• 工程: make-ticket
• エラー種別: CommandTimeout
• 説明:
  > Claude Code のエラー説明（stopイベントのresponseテキスト）
```

Slack 通知の責務を `notifier.ts` に分離することで、`runner.ts` はループ制御とエラーハンドリングの統括に集中できる。

**現在のスタブの問題点:**
1. `ErrorContext` が `{ ticketId, message, phase }` と定義されているが、RFC の定義は `{ ticketId, phase, error, ticketsPath }`
2. 全関数が未実装で `sendSlackError` は常に `Promise.resolve()` を返す
3. テストファイル (`src/notifier.test.ts`) が存在しない

## Scope

### ErrorContext インターフェースの修正
- RFC 定義に合わせ、`error: Error` と `ticketsPath: string` を追加
- `message` を削除（`error.message` から取得するため）
- 最終形: `{ ticketId: string, phase: string, error: Error, ticketsPath: string }`

### ヘルパー関数の実装

**`getUsername(): string`**
- `child_process.execSync('whoami', { encoding: 'utf-8' })` でユーザー名取得
- 例外発生時は `'unknown'` を返す（throw しない）

**`getAbsolutePath(relativePath: string): string`**
- `fs.realpathSync(relativePath)` で絶対パスに変換
- 例外発生時（ENOENT 等）は引数をそのまま返す（throw しない）

**`classifyError(error: Error): string`**
- `error.name === 'CommandTimeoutError'` → `'CommandTimeout'`
- `error.message.includes('permission')` → `'PermissionDenied'`
- `error.message.includes('ENOENT')` → `'FileNotFound'`
- 上記以外 → `'Unknown'`

**`buildSlackMessage(context: ErrorContext): object`**
- `getAbsolutePath` + `getUsername` + `classifyError` を組み合わせてメッセージ構築
- 戻り値: `{ username: 'conver', icon_emoji: ':x:', text: '...' }`
- text は規定の Markdown フォーマット

### 送信関数の実装

**`sendSlackOnce(webhookUrl: string, payload: object): Promise<void>`**
- `node:https.request` で POST 送信
- Content-Type: `application/x-www-form-urlencoded`（`payload` パラメータに JSON 文字列を格納）
- ステータスコード 2xx で resolve、それ以外で reject
- ネットワークエラー時は reject

**`sendSlackWithRetry(webhookUrl: string, payload: object, maxRetries?: number): Promise<void>`**
- 最大 maxRetries 回（デフォルト 3）リトライ
- リトライ間隔: 1秒 → 2秒 → 3秒（指数バックオフ: `delay = 1000 * attempt`）
- 全試行失敗時: `console.error` で stderr にエラー出力し、throw しない
- throw しない理由: Slack 通知の失敗がメインループを停止させてはならない

**`sendSlackError(webhookUrl: string, context: ErrorContext): Promise<void>`**
- Public API: `buildSlackMessage` でペイロード生成 → `sendSlackWithRetry` で送信

### テストファイル作成
- `src/notifier.test.ts` を作成し、`node --test` で実行可能にする
- HTTP サーバーモックを使用して `sendSlackOnce` / `sendSlackWithRetry` をテスト

## Non-scope

- **Slack API のバリデーション**: webhook URL の形式検証は行わない。不正な URL は `https.request` のエラーとして伝播する
- **レート制限**: Slack API のレート制限ハンドリングは実装しない（リトライ機構のみ）
- **メッセージキューイング**: 複数通知のキューイングは行わず、即時送信する
- **フォーマットの拡張**: 通知フォーマットのカスタマイズ（カラー、添付ファイル等）はスコープ外

## Investigation

### 現状のソースコード調査結果

**src/notifier.ts (スタブ実装, 366 bytes)**
```typescript
// [::STUB::] P2-1: Slack通知の本実装は P2-1 で行う

export interface ErrorContext {
  ticketId: string;
  message: string;
  phase: string;
}

export function sendSlackError(context: ErrorContext): Promise<void> {
  return Promise.resolve();
}
```

**問題点の詳細:**

| 問題 | 箇所 | 説明 |
|------|------|------|
| インターフェース不整合 | ErrorContext | `message: string` は不要（RFC では `error: Error` が正しい） |
| フィールド欠落 | ErrorContext | `ticketsPath: string` が不足 |
| 未実装 | 全関数 | スタブは `sendSlackError` のみで常に成功を返す |
| テスト不在 | notifier.test.ts | テストファイルが存在しない |

**RFC_ROOT.md §5 の実装定義:**

RFC_ROOT.md の §5.1–5.3 に Slack 通知の完全な実装仕様が定義されている。具体的には:

1. **通知フォーマット** (§5.1): エラー発生時の Markdown フォーマットが規定されている
2. **実装コード** (§5.2): `notifier.ts` の完全な実装例（import, 全関数, エクスポート）が記載
3. **リトライ動作** (§5.3): 最大3回、1s→2s→3s の指数バックオフ、全失敗時は console.error で終了

**既存コードのパターン分析:**

1. **テストフレームワーク**: `node:test` + `node:assert/strict`（`src/error.test.ts`, `src/cli.test.ts`, `src/tickets.test.ts` で統一）
2. **テスト実行**: ビルド後、`dist/` の compiled JS に対して `node --test` で実行
3. **HTTP モック**: 現時点で HTTP モックを使用するテストは存在しない。`notifier.test.ts` で初めて導入する
4. **エラーハンドリングパターン**: RFC 定義通り、ヘルパー関数（getUsername, getAbsolutePath）はエラー時に throw せずフォールバック値を返す
5. **リトライパターン**: 指数バックオフ、全失敗時は throw せず console.error 出力

**使用する Node.js 標準モジュール:**
- `node:https` — HTTP リクエスト送信
- `node:child_process` — `execSync('whoami')` でユーザー名取得
- `node:fs` — `realpathSync` で絶対パス解決

**テスト用に必要なモック戦略:**
- `sendSlackOnce` のテスト: ローカル HTTP サーバーを `node:http` で起動し、`http://localhost:{port}` に対してリクエストを送信
- `getUsername` のテスト: 実際の `execSync` が動作するため、空文字列でないことを確認
- `getAbsolutePath` のテスト: 実際の `realpathSync` を使用（一時ディレクトリで検証）
- `classifyError` のテスト: 純粋関数のためモック不要

## Test Plan

### ユニットテスト計画

**テストファイル:** `src/notifier.test.ts`
**テストフレームワーク:** `node:test` + `node:assert/strict`
**カバレッジ目標:** 80%以上（クリティカルパスは90%以上）

**classifyError(error: Error): string**

| ケース | 種別 | 入力 | 期待結果 |
|--------|------|------|---------|
| CommandTimeoutError → "CommandTimeout" | 正常系 | `new CommandTimeoutError("timeout")` | `"CommandTimeout"` |
| message に "permission" を含む → "PermissionDenied" | 正常系 | `new Error("permission denied")` | `"PermissionDenied"` |
| message に "ENOENT" を含む → "FileNotFound" | 正常系 | `new Error("ENOENT: no such file")` | `"FileNotFound"` |
| 通常の Error → "Unknown" | 正常系 | `new Error("generic error")` | `"Unknown"` |
| message に "permission" と "ENOENT" 両方 → "PermissionDenied"（先勝ち） | 境界値 | `new Error("permission ENOENT")` | `"PermissionDenied"` |

**getUsername(): string**

| ケース | 種別 | 期待結果 |
|--------|------|---------|
| 正常: whoami が成功 | 正常系 | 空でない文字列を返す |
| 異常: whoami が失敗（モック） | 異常系 | `"unknown"` を返す |

**getAbsolutePath(relativePath: string): string**

| ケース | 種別 | 入力 | 期待結果 |
|--------|------|------|---------|
| 正常: 存在するパス | 正常系 | `__filename` 等 | 絶対パス |
| 異常: 存在しないパス | 異常系 | `/nonexistent/path` | 引数をそのまま返す |

**buildSlackMessage(context: ErrorContext): object**

| ケース | 種別 | 期待結果 |
|--------|------|---------|
| 正常: username="test", absolutePath を含む | 正常系 | username=conver, icon_emoji=:x:, text に各フィールドが含まれる |
| text に ticketId が含まれる | 正常系 | フォーマット通りの文字列 |
| text に phase が含まれる | 正常系 | フォーマット通りの文字列 |
| text に errorType が含まれる | 正常系 | classifyError の結果に応じた文字列 |

**sendSlackOnce(webhookUrl: string, payload: object): Promise<void>**

| ケース | 種別 | 期待結果 |
|--------|------|---------|
| 正常: 2xx 応答 → resolve | 正常系 | HTTP 200 で resolve |
| 異常: 4xx 応答 → reject | 異常系 | HTTP 400 で reject(`Slack API returned 400`) |
| 異常: 5xx 応答 → reject | 異常系 | HTTP 500 で reject(`Slack API returned 500`) |
| 異常: ネットワークエラー → reject | 異常系 | `req.on('error')` で reject |

**sendSlackWithRetry(webhookUrl: string, payload: object, maxRetries?: number): Promise<void>**

| ケース | 種別 | 期待結果 |
|--------|------|---------|
| 正常: 1回目で成功 | 正常系 | resolve する |
| 正常: 2回目で成功（1回目失敗） | 正常系 | 2回目のリトライで resolve |
| 異常: 3回すべて失敗 → throw しない | 異常系 | console.error 出力後、何も返さない |

**sendSlackError(webhookUrl: string, context: ErrorContext): Promise<void>**

| ケース | 種別 | 期待結果 |
|--------|------|---------|
| 正常: フルパス成功 | 正常系 | buildSlackMessage → sendSlackWithRetry が成功 |

### HTTP サーバーモック戦略

`sendSlackOnce` と `sendSlackWithRetry` のテストでは、`node:http` を使用してローカル HTTP サーバーを起動し、実際の HTTP 通信をシミュレートする。

```typescript
import http from 'node:http';

function createMockServer(responseCode: number, responseBody: string = 'ok'): Promise<{ server: http.Server, port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(responseCode, { 'Content-Type': 'text/plain' });
      res.end(responseBody);
    });
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ server, port });
    });
  });
}
```

### ユニットテスト不可能な項目（例外）

なし。全テストケースは以下の方法でユニットテストカバー可能：
- HTTP 通信: `node:http` のローカルサーバーモックで再現
- `execSync('whoami')`: 実際に実行しても副作用なし
- `realpathSync`: 一時ファイルで検証可能

## Boy Scout Rule — 翻訳可能性計画

### 現在のスタブからの改善点

1. **ErrorContext インターフェースの修正**: `message: string` → `error: Error` — 「メッセージ文字列」ではなく「エラーオブジェクト」を受け取ることで、呼び出し元がエラーの詳細（name, message, stack）を自由に利用可能になる
2. **関数名の一貫性**: `sendSlackError` の引数に `webhookUrl` を含めることで「どこに何を送るか」がシグネチャから一読でわかる
3. **ヘルパー関数の分離**: `getUsername`, `getAbsolutePath`, `classifyError` を個別関数に抽出することで、各責務が明確になりテスト容易性が向上する
4. **コメントの「なぜ」記述**: 各関数に「なぜこの処理が必要か」と「なぜエラーを握りつぶすのか」を日本語で記述

### スコープ外の改善対象

`notifier.ts` が完成した時点で `src/conver.ts` のスタブはまだ残る（P4-2 で本実装）。`src/session.ts` も同様（P3-1 で本実装）。これらは後続チケットで解決されることが `[::STUB::]` マーカーで明示されている。

## Acceptance Criteria

- [ ] `ErrorContext` インターフェースが RFC 定義（ticketId, phase, error, ticketsPath）と一致する
- [ ] `classifyError` が全4種別（CommandTimeout / PermissionDenied / FileNotFound / Unknown）を正しく分類する
- [ ] `buildSlackMessage` が規定の Markdown フォーマットでメッセージを構築する
- [ ] `sendSlackOnce` が 2xx 応答で resolve、それ以外で reject する
- [ ] `sendSlackWithRetry` が最大3回リトライし、全失敗時は throw せず console.error に出力する
- [ ] `sendSlackError` が buildSlackMessage → sendSlackWithRetry を正しく連鎖する
- [ ] `getUsername` が空でない文字列を返す（エラー時は `"unknown"`）
- [ ] `getAbsolutePath` が存在するパスを絶対パスに変換し、存在しないパスはそのまま返す
- [ ] 全既存テスト（`node --test dist/`）が通過する
- [ ] 翻訳可能性の検証: 各関数が単一責務を持ち、関数名と引数が一貫している
- [ ] 犯罪スキャン: 0件（新規犯罪を発生させない）

## Notes

### 依存・関連チケット

| チケット | 関係 | 説明 |
|----------|------|------|
| P0-2 | **依存** | `CommandTimeoutError` 型 — `classifyError` で `error.name` を参照する |
| P0-3 | **先行完了済み** | CLI引数パース完了。`--slack-url` フラグで受け取った webhook URL を `sendSlackError` に渡す |
| P4-1 | **後続依存** | `runner.ts` が `sendSlackError` を呼び出す。ErrorContext のインターフェース一致が必須 |
| P1-1 | **関連** | `tickets.ts` の `getSourceFromTickets` — `sendSlackError` に渡す `ticketsPath` の解決に関連 |

### 犯罪スキャン結果

- Malfeasance.json: 0件（犯罪なし）
- `[::STUB::]` マーカー: `notifier.ts` のスタブに付与済み ✅（`// [::STUB::] P2-1: Slack通知の本実装は P2-1 で行う`）
- その他のスタブ（src/conver.ts, src/runner.ts, src/session.ts, dist/*.js）: 全8箇所、正しい `[::STUB::]` マーカー付与済み ✅

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testVerification[]`, `testExceptions[]`, `notes` フィールド
- **実装サマリ**: `changes[]`, `notes` フィールド
- **レビュー報告書**: `instrumentation`, `notes`, `rfcDiscrepancies[]` フィールド
