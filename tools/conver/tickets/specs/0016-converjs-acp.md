---
ticket_id: 16
title: conver.js ACP接続の信頼性修正
slug: converjs-acp
status: draft
created_at: 2026-06-28
updated_at: 2026-06-28
---
# conver.js ACP接続の信頼性修正

## Summary

現在の conver.js の ACP セッション確立（`createSession` / `spawnAgent` / `buildClientApp`）に原因不明のバグがあり、claude-agent-acp との接続が「ACP connection closed」で失敗する。一方、全く同じロジックを独立したテストコード（`acp-test.mjs`）として実行すると接続は成功する。本チケットでは、テストで実証済みのコードパターンを conver.js 本体の実装として採用し、原因不明のバグを回避する。

## Background

### 問題の症状

```bash
node ./conver.js -k <key> -s <url> -c 3 -v 1
```
```
▶ [P0-1] 設定データ型定義
  make/plan/start...
Error: write EPIPE    ← 子プロセス側のパイプ切断
❌ エラー発生: ACP connection closed    ← セッション確立失敗
```

30秒のタイムアウトが発生し、チケットが1つも処理されない。

### 確認済みの事実

- `@agentclientprotocol/sdk ^1.0.0` は正常にロードされ、全APIが利用可能
- `claude-agent-acp v0.52.0` バイナリは存在し、単体で起動確認済み
- 同一のコードパターンを `node -e` のテストコードで実行すると **initialize / buildSession / prompt の全工程が成功する**
- minify 有無、SDK バンドル有無、グローバルハンドラ有無はいずれも結果に影響しない
- 根本原因は特定できていないが、バンドルファイルの ESM トップレベル実行と SDK 内部の非同期処理の相互作用が疑われる

### 動作確認済みテストコード

`~/shyme/star/acp-test.mjs` として保存済み。以下のレイヤーが全て PASS する：

| Layer | 操作 | 結果 | 所要時間 |
|-------|------|------|---------|
| 1 | SDK import | ✅ | - |
| 2 | バイナリ検出 | ✅ | - |
| 3 | spawn | ✅ | - |
| 4 | ndjson stream | ✅ | - |
| 5 | ClientApp構築 | ✅ | - |
| 6 | initialize | ✅ | 158ms |
| 7 | buildSession | ✅ | 2.1秒 |
| 8 | prompt + nextUpdate | ✅ | 15秒 |

## Scope

1. `conver.ts` / `session.ts` の ACP 関連コードを、テスト実証済みのパターンに書き換える
2. `buildClientApp` の permission ハンドラは Optional Chaining 対応済みの安全な実装を維持
3. グローバルエラーハンドラ（`process.on("uncaughtException")` 等）は一切登録しない
4. EPIPE は子プロセス終了時の正常な副作用として許容し、特別なハンドリングは行わない
5. `acp-test.mjs` は回帰テストとして保存する

## Non-scope

- ACP SDK 自体の修正は行わない
- チケット処理ロジック（`runLoop`）自体の変更は行わない
- 環境変数設定は変更しない

## Investigation

### 物理的証拠

**証拠1: バンドル版とテストコードの比較**

同一コードパターンでバンドル版のみが失敗：
```bash
# ✅ acp-test.mjs — 成功（15 passed, 1 failed）
# ❌ node ./conver.js — 失敗（ACP connection closed）
```

**証拠2: 単体 createSession テスト**
```javascript
const stream = acp.ndJsonStream(Writable.toWeb(proc.stdin), Readable.toWeb(proc.stdout));
const app = acp.client({name:'conver'})
  .onRequest(...)
  .onNotification(acp.methods.client.session.update, () => {});
await new Promise((resolve, reject) => {
  app.connectWith(stream, async (ctx) => {
    await ctx.request(acp.methods.agent.initialize, {protocolVersion:1, clientCapabilities:{}});
    const session = await ctx.buildSession(cwd).start();
    // → 2.2秒で成功！
  });
});
```

**証拠3: 試した修正と結果**
| 修正 | 結果 |
|------|------|
| `--minify` を外す | 変わらず |
| SDK を external に | 変わらず |
| 全てのグローバルハンドラ削除 | 変わらず |
| WritableStream ラッパー追加/削除 | 変わらず |

### 結論

原因は特定できていない。「テストで動くコードパターン」をそのまま本番実装として採用する。

## Test Plan

### ユニットテスト計画

- 既存56テストは全て維持し、変更後も全件PASSすること
- 新規テスト: `process.listeners('uncaughtException').length === 0`（グローバルハンドラ不在確認）
- カバレッジ目標: 既存56テスト維持

### ユニットテスト不可能な項目（例外）

- claude-agent-acp との実結合テストはモック不可
- `acp-test.mjs` を E2E テストとして手動実行で検証する

## Boy Scout Rule — 翻訳可能性計画

- session.ts の各関数（spawnAgent/createSession/withSession/runCommand/disposeSession）は関数名が動詞句として翻訳可能であることを維持する
- 新たなグローバルエラーハンドラを追加しない

## Acceptance Criteria

- [ ] `node ./conver.js -k <key> -s <url> -c 1 -v 1` が1チケット以上を処理完了する
- [ ] `make test-conver` が全テスト PASS する
- [ ] `acp-test.mjs <key>` が全15テスト PASS する
- [ ] 犯罪なし
- [ ] 翻訳可能性の検証が通っている

## Notes

- 具体的な置き換え内容は `/plan-ticket PX-2` で策定する
- PX-1（esbuild バンドル構築）の完了を前提とする（既に reviewed）

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testUnit[]`, `testExceptions[]`, `notes` フィールド
- **実装サマリ**: `changes[]`, `notes` フィールド
- **レビュー報告書**: `instrumentation`, `notes`, `rfcDiscrepancies[]` フィールド
