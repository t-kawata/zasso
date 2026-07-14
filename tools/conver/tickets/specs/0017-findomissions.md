---
ticket_id: 17
title: 完了通知の改善（find後のOMISSIONS通知追加）
slug: findomissions
status: draft
created_at: 2026-06-28
updated_at: 2026-06-28
---
# 完了通知の改善（find後のOMISSIONS通知追加）

## Summary

全チケット完了後に実行される `find-omissions-for-next-rfc` の結果（OMISSIONS-XXX.json）をSlackに通知する。severity を 🔴/🟡/🔵 の絵文字で視覚化し、コードブロック内に整形して送信する。

## Background

現在の完了通知フローは以下：

```
resolve + Slack完了通知（sendSlackSuccess）
  → find-omissions-for-next-rfc（通知なし）
  → ✅ 全Nチケットの処理が完了しました。
```

`find-omissions-for-next-rfc` の結果（設計と実装の乖離リスト）はOMISSIONS-XXX.json に保存されるが、Slack通知はされない。結果を確認するにはファイルを直接開く必要があり、外側ループの循環速度を低下させている。

## Scope

1. `find-omissions-for-next-rfc` の完了後、出力された OMISSIONS-XXX.json を読み取る
2. `omissions` 配列の各要素を以下のフォーマットでコードブロックに整形する：
   - severity `high` → 🔴
   - severity `medium` → 🟡
   - severity `low` → 🔵
3. 整形した内容をSlackに通知する（`sendSlackSuccess` と同様の仕組み）
4. OMISSIONS ファイルが存在しない場合（エラー等）は「OMISSIONSは生成されませんでした」と通知する
5. omissions 配列が空の場合は「乖離は見つかりませんでした」と通知する

## Non-scope

- Slack Bot Token の導入（`files.upload` API は使用しない）。Incoming Webhook の `text` フィールドのみで完結させる
- OMISSIONS-XXX.md のファイル添付
- `sendSlackError` の動作変更

## Investigation

### 調査結果

現在の `find-omissions-for-next-rfc` の実行箇所（`runner.ts`）では、コマンド完了後にOMISSIONSファイルの有無を確認していない。Slack通知も行われない。

```typescript
// 現在のコード（runner.ts）
if (checkAllReviewed(options.ticketsPath)) {
  console.log("  🎯 全チケット reviewed → find-omissions...");
  const source = getSourceFromTickets(options.ticketsPath);
  await withSession(cwd, options.apiKey, options.model, async (session) => {
    await runCommand(session, `/find-omissions-for-next-rfc ${source}`, runOptions);
  });
  console.log("\n>>> ✅ find-omissions 完了");
}
```

OMISSIONS-XXX.json の `omissions` 配列の構造：
```json
{
  "omissions": [
    {
      "id": "O-001",
      "type": "missing_implementation",
      "severity": "high",
      "rfcSection": "§3.2",
      "description": "XXXトレイトが未実装",
      "affectedFiles": ["src/lib.rs"],
      "suggestedResolution": "Xxxトレイトを実装する"
    }
  ]
}
```

OMISSIONS ファイルの命名規則: `OMISSIONS-XXX.json`（XXX は連番、`create-omissions.js` が採番）。`find-omissions-for-next-rfc` の出力先はカレントディレクトリ（RFCファイルと同じディレクトリ）。

セキュリティ上、Slack Incoming Webhook にファイル添付は不可（`files.upload` API には Bot Token が必要）。`text` フィールド内のコードブロックで代替する。

## Test Plan

### ユニットテスト計画

- `notifier.ts`: `buildOmissionsBlocks()` 関数の追加。以下をテスト：
  - 正常系: omissions 配列 → 正しくコードブロックに整形される
  - severity マッピング: high→🔴, medium→🟡, low→🔵
  - 空配列: 「乖離は見つかりませんでした」
- `runner.ts`: find-omissions 完了後の通知フロー（モック経由で検証）
- カバレッジ目標: 既存56テスト維持 + 新規テスト追加

### ユニットテスト不可能な項目（例外）

- Slack Webhook への実際の送信（モックで代替）

## Boy Scout Rule — 翻訳可能性計画

- `notifier.ts` に `buildOmissionsBlocks()` を追加。関数名は「OMISSIONSブロックを構築する」と翻訳可能であること
- severity の絵文字マッピングはオブジェクト定数として定義し、switch文を避ける

## Acceptance Criteria

- [ ] find-omissions 完了後、OMISSIONS-XXX.json の内容がSlackに通知される
- [ ] high → 🔴、medium → 🟡、low → 🔵 で表示される
- [ ] コードブロックとして整形されている
- [ ] OMISSIONS ファイルがない場合もエラーにならない
- [ ] omissions 配列が空の場合も通知される
- [ ] `make test-conver` が全テスト PASS する
- [ ] 犯罪なし

## Notes

- sendSlackSuccess と同じ `sendSlackWithRetry` を利用する
- OMISSIONS ファイルの検索は `readdirSync` でパターンマッチする
- PX-2（ACP接続の信頼性修正）の完了を前提とする
- 依存関係: PX-2 → PX-3（本チケット）

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testUnit[]`, `testExceptions[]`, `notes` フィールド
- **実装サマリ**: `changes[]`, `notes` フィールド
- **レビュー報告書**: `instrumentation`, `notes`, `rfcDiscrepancies[]` フィールド
