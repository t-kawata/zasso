---
ticket_id: 9
title: phaseId情報の一貫性確保（O-003）
slug: phaseido-003
status: draft
created_at: 2026-06-26
updated_at: 2026-06-26
---
# phaseId情報の一貫性確保（O-003）

## Summary

tickets.ts の `loadPendingTickets()` が返す各チケットに、所属フェーズの `phaseId` を一貫して付与する。
併せて、runner.ts に重複して存在する非公開関数 `loadPendingTickets()` / `checkAllReviewed()` を削除し、
tickets.ts の公開関数に統一する。

## Background

RFC OMISSIONS-001 O-003 で指摘された設計不一致である。
tickets.ts が公開する `loadPendingTickets()` はチケットの `phaseId` を保証しないため、
runner.ts が独自に phaseId 付与ロジックを持つ非公開の同名関数を定義するに至った。
また `checkAllReviewed()` も runner.ts に非公開関数として重複している。
この結果、tickets.ts は本来の責務（Tickets.json の読み取りと状態確認の包括的提供）を
果たしておらず、将来的なメンテナンスで認知負荷が増大する。

## Scope

1. **tickets/src/tickets.ts — `loadPendingTickets()` の phaseId 付与**: 各チケットに親 phase の `id` を `phaseId` として設定する（runner.ts の非公開実装と同一ロジック）
2. **runner/src/runner.ts — 非公開 `loadPendingTickets()` 削除**: tickets.ts の公開関数に切り替え
3. **runner/src/runner.ts — 非公開 `checkAllReviewed()` 削除**: tickets.ts の公開関数に切り替え
4. **runner/src/runner.ts — 非公開 `TicketsJson` インターフェース削除**: 不要になる内部型を削除
5. **runner/src/runner.ts — import 追加**: `loadPendingTickets`, `checkAllReviewed` を tickets.ts から import
6. **tickets.test.ts — phaseId 検証テスト追加**: 複数 phase のチケットが正しい phaseId を持つことを検証
7. **runner.test.ts — モック更新**: `./tickets.js` のモックに `loadPendingTickets` と `checkAllReviewed` を追加

## Non-scope

- tickets.ts の `Ticket` インターフェース変更（現状の `phaseId: number` フィールドは維持）
- runner.ts の `LoopOptions` / `Ticket` インターフェース変更（runner 内の型定義は独立のまま維持）
- ロジック以外のコード整形やリファクタリング（翻訳可能性の改善は Boy Scout Rule の範囲で）
- O-001, O-002, O-004, O-005 の修正（別チケット）

## Investigation

以下は `2026-06-26` 時点のコードスナップショットに基づく。

### 証拠 1: tickets.ts loadPendingTickets — phaseId 未付与

- **ファイル**: `tools/conver/src/tickets.ts`
- **該当箇所**: L54-L68
- **現状**: 各 phase の tickets 配列をフラットに連結するのみで、親 phase の `id` をチケットに書き戻さない。
  `phaseId` フィールドがチケット JSON 側に含まれている場合はその値をそのまま通過させるが、
  欠落している場合の保証はない。
- **コード抜粋**:
  ```typescript
  for (const phase of data.phases) {
    for (const ticket of phase.tickets) {
      if (ticket.status !== "reviewed") {
        pending.push(ticket);  // ← phaseId の上書き・保証なし
      }
    }
  }
  ```

### 証拠 2: runner.ts 非公開 loadPendingTickets — phaseId 付与実装

- **ファイル**: `tools/conver/src/runner.ts`
- **該当箇所**: L71-L80
- **現状**: tickets.ts と同一責務の非公開関数が phaseId 付与ロジックを持つ。
  `flatMap` + スプレッド演算子で各チケットに `phaseId: phase.id` を上書きしている。
- **コード抜粋**:
  ```typescript
  function loadPendingTickets(ticketsPath: string): Ticket[] {
    return data.phases
      .flatMap((phase) =>
        phase.tickets.map((t) => ({ ...t, phaseId: phase.id })),
      )
      .filter((t) => t.status !== "reviewed")
      .sort((a, b) => a.id - b.id);
  }
  ```

### 証拠 3: runner.ts 非公開 checkAllReviewed — 重複関数

- **ファイル**: `tools/conver/src/runner.ts`
- **該当箇所**: L86-L92
- **現状**: tickets.ts の `checkAllReviewed()` と完全に同一処理の非公開関数が存在する。
  `flatMap` + `every` のワンライナーで実装されているが、tickets.ts 版は二重ループ。
  いずれも phaseId を関知しないため、同一の入力に対して同じ boolean を返す。

### 証拠 4: runner.ts import 状況

- **ファイル**: `tools/conver/src/runner.ts`
- **該当箇所**: L21-L26
- **現状**: `getSourceFromTickets` のみ tickets.ts から import している。
  `loadPendingTickets` と `checkAllReviewed` は import しておらず、非公開関数で代替している。

### 証拠 5: runner.test.ts モック — 不足エクスポート

- **ファイル**: `tools/conver/src/runner.test.ts`
- **該当箇所**: L90-L94
- **現状**: mock.module("./tickets.js") は `getSourceFromTickets` のみをエクスポート。
  runner.ts が tickets.ts から `loadPendingTickets` と `checkAllReviewed` を import するようになった場合、
  このモックも両関数をエクスポートする必要がある。
- **コード抜粋**:
  ```typescript
  mock.module("./tickets.js", {
    exports: {
      getSourceFromTickets: async (path: string) => path,
    },
  });
  ```

### 証拠 6: tickets.test.ts — phaseId 検証テストの欠落

- **ファイル**: `tools/conver/src/tickets.test.ts`
- **現状**: 全テストケースでチケットデータに `phaseId` をハードコードしている。
  `loadPendingTickets()` が phaseId を正しく付与するか検証するテストが存在しない。
  phaseId を欠いたチケットデータ（`phaseId` プロパティなし）で呼び出した場合の挙動が未カバレッジ。

### 証拠 7: テスト実行確認

- 現状の全テストは `make test` でパスすることを確認済み。
- tickets.test.ts 全11ケース、runner.test.ts 全10ケースがパス。

## Test Plan

### ユニットテスト計画

**カバレッジ目標**: 全体 80%以上、対象モジュール（tickets.ts, runner.ts）は 90%以上

| # | テストケース | 対象 | 種別 | 検証内容 |
|---|-------------|------|------|----------|
| 1 | phaseId の正しい付与（複数 phase） | tickets.test.ts | 正常系 | 3 phase に分散したチケットで `loadPendingTickets()` を呼び、各チケットの `phaseId` が所属 phase の id と一致することを確認 |
| 2 | phaseId 未設定チケットの補完 | tickets.test.ts | 異常系 | チケット JSON に `phaseId` プロパティがない場合でも、戻り値の全チケットに `phaseId` が設定されていることを確認 |
| 3 | phaseId の上書き（矛盾した場合） | tickets.test.ts | 異常系 | チケット JSON に `phaseId: 999` など誤った値があっても、親 phase の id で上書きされることを確認 |
| 4 | runner が tickets.ts の loadPendingTickets を使用 | runner.test.ts | 回帰 | 既存テスト「1チケット: make/plan/start → review → resolve」がパスすることを確認 |
| 5 | runner が tickets.ts の checkAllReviewed を使用 | runner.test.ts | 回帰 | 既存テスト全10ケースがモック更新後もパスすることを確認 |

**モック・スタブ要件**:
- runner.test.ts: `./tickets.js` のモックに `loadPendingTickets` と `checkAllReviewed` のエクスポートを追加
- いずれのテストも node:test の mock.module でファイルI/Oを分離可能なため、外部依存は発生しない

### ユニットテスト不可能な項目（例外）

該当なし — すべての処理はメモリ内で完結し、ファイルI/Oはテスト用 temp ファイルで代替可能。

## Boy Scout Rule — 翻訳可能性計画

本チケットで触るコードに対して以下の翻訳可能性改善を実施する：

1. **runner.ts コメント更新**: ファイル先頭の責務説明コメント（L21-L26）で現在 `getSourceFromTickets` のみ記載されている import 元説明に、`loadPendingTickets` と `checkAllReviewed` も追記する
2. **tickets.ts の flatMap 化**: 現状の二重 for ループ（L59-L65）を `flatMap` + `filter` のチェーンに書き換え、処理の流れが上から下に読めるように改善する（翻訳可能性向上）
3. **一関数一責務の維持**: 今回の修正で各関数に複数の責務が混入しないよう注意する。`loadPendingTickets()` は「未処理チケットの抽出」のみ、`checkAllReviewed()` は「全チケットのレビュー状態確認」のみを責務として維持する

## Acceptance Criteria

- [ ] tickets.ts `loadPendingTickets()` が返す全チケットに `phaseId` が正しく設定されている
- [ ] runner.ts の非公開 `loadPendingTickets()` が削除され、tickets.ts の公開関数を import している
- [ ] runner.ts の非公開 `checkAllReviewed()` が削除され、tickets.ts の公開関数を import している
- [ ] runner.ts の非公開 `TicketsJson` インターフェースが削除されている
- [ ] runner.test.ts の `./tickets.js` モックが更新されている
- [ ] `[::STUB::]` マーカーが全ての不完全実装に付与されている（該当なしを確認）
- [ ] `make test` が全てパスする
- [ ] `make check-all` が全てパスする

## Notes

**依存関係**:
- 先行実装が必要なチケット: なし（他の P5 チケットとは独立して実装可能）
- 関連チケット: P5-2 (O-002 cli.ts の絶対パス変換、依存関係なし）で両チケットの変更が競合しないことの確認のみ

**設計判断の経緯**:
- runner.ts の `sort((a, b) => a.id - b.id)` ロジックは、tickets.ts 側には移さない。
  ソート順は runner の関心事（実行順の制御）であり、tickets.ts の責務（Tickets.json 読み取り）とは分離すべき。
  現状の tickets.ts はソートなしで未処理チケットを phase 出現順に返すため、これを維持する。
- runner.test.ts のモックは、`loadPendingTickets` と `checkAllReviewed` を
  mock.module の exports に追加することで対応する。実装上は実際に temp ファイルを読む
  `loadPendingTickets` をモックで代替できるが、tickets.test.ts は実装のままテストする。

**成果物の保存先**: Tickets.json の P5-1 フィールドを参照
