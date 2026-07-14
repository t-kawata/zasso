---
ticket_id: 14
title: Makefileエントリの完全記述
slug: makefile
status: draft
created_at: 2026-06-26
updated_at: 2026-06-26
relatedTicketIds: "P0-1 (Makefile 生成元), P5-4 (同一フェーズ O-004)"
---

# Makefileエントリの完全記述（O-005）

## Summary

Makefile の各エントリに説明コメントを追加し、RFC_ROOT.md §7 に `test-conver` エントリを追記する。これにより新しい開発者が Makefile の全ターゲットの目的と使用法を一目で把握できるようにする。

## Background

### 発端

RFC OMISSIONS-001 の実装乖離調査において、Makefile に説明コメントが一切なく、かつ `test-conver` ターゲットが RFC_ROOT.md §7（Makefile エントリ一覧）に記載されていないことが判明した。

### 現状の問題

1. **Makefile の内容（tools/conver/Makefile）**:
   ```
   list-tickets:
           node .claude/scripts/tickets/list-phases-and-tickets.js Tickets.json

   build-conver:
           npm run build

   run-conver:
           node dist/conver.js $(ARGS)

   test-conver:
           npm run build && node --experimental-test-module-mocks --test ...
   ```
   - 全4ターゲットに説明コメントがなく、各ターゲットの目的がコードを読まないと分からない
   - `list-tickets` は RFC_ROOT.md に記載されていない（私用ヘルパーなので意図的）

2. **RFC_ROOT.md §7（Makefile エントリ）の現状**:
   ```markdown
   #### Makefile エントリ

   ```makefile
   build-conver:
           cd tools/conver && npm run build

   run-conver:
           cd tools/conver && node dist/conver.js $(ARGS)
   ```
   - `test-conver` が記載されていない
   - エントリ一覧が表形式でなく、参照性が低い
   - 各ターゲットの説明がない

### RFC OMISSIONS-001 §5 における設計決定

- `test-conver` を RFC_ROOT.md §7 に追記する
- `list-tickets` は私用ヘルパーであるため RFC には含めない
- Makefile 自体に各エントリの簡潔な説明コメント（日本語）を追加する
- 変更はコメントおよび文書のみで、動作への影響はない

## Scope

### 実施範囲

1. **tools/conver/Makefile**: 全4エントリに日本語の説明コメントを追加
   - `list-tickets`: 「チケット一覧を表示する（私用ヘルパー）」
   - `build-conver`: 「TypeScript ソースを dist/ にコンパイルする」
   - `run-conver`: 「conver.js を実行する。ARGS で引数を渡す」
   - `test-conver`: 「全ユニットテストを実行する」

2. **RFC_ROOT.md §7**: Makefile エントリセクションを表形式にリファクタリングし、`test-conver` を追記

## Non-scope

- `list-tickets` の RFC_ROOT.md への記載は行わない（私用ヘルパーのため意図的に除外）
- Makefile の機能変更・リファクタリングは行わない
- 他の RFC_ROOT.md セクションの修正は行わない

## Investigation

### 確認した物理的証拠

1. **tools/conver/Makefile**（2026-06-26 時 point）:
   ```
   list-tickets:
           node .claude/scripts/tickets/list-phases-and-tickets.js Tickets.json

   build-conver:
           npm run build

   run-conver:
           node dist/conver.js $(ARGS)

   test-conver:
           npm run build && node --experimental-test-module-mocks --test dist/error.test.js dist/cli.test.js dist/tickets.test.js dist/notifier.test.js dist/session.test.js dist/runner.test.js dist/conver.test.js
   ```
   → 全4エントリに説明コメントなし

2. **RFC_ROOT.md の該当箇所（999-1008行目）**:
   ```
   #### Makefile エントリ

   ```makefile
   build-conver:
           cd tools/conver && npm run build

   run-conver:
           cd tools/conver && node dist/conver.js $(ARGS)
   ```
   → `test-conver` の記載なし。また Makefile の実体（`cd tools/conver && ...`）と RFC の記載（`npm run build` / `node dist/conver.js ...`）の間に差異あり（RFC は `cd tools/conver &&` 付き、実 Makefile はプロジェクトルートからの実行を想定）

3. **RFC OMISSIONS-001.md §5（設計書）**:
   - `test-conver` を RFC_ROOT.md §7 に追記
   - Makefile に説明コメント追加
   - `list-tickets` は RFC 非記載

### 確認した動作

- `make build-conver` / `make test-conver` / `make run-conver` はすべて正常動作する
- Makefile のターゲットに説明がないこと以外に問題はない

## Test Plan

### ユニットテスト計画

このチケットはコメント追記および文書更新のみであるため、新規のユニットテストは不要。

ただし既存テストへの影響確認として以下を検証する：

| テスト観点 | 方法 | 期待結果 |
|-----------|------|---------|
| Makefile パース不能にならない | `make build-conver` 実行 | ビルド成功 |
| 全ターゲット正常動作 | `make test-conver` 実行 | 全テスト通過 |
| RFC_ROOT.md の構文 | Markdown として有効 | レンダリング可能 |

### ユニットテスト不可能な項目（例外）

| 項目 | 理由 |
|------|------|
| Makefile コメントの内容検証 | コメントは実行に影響しないため、プログラムによる検証が不能 |
| RFC_ROOT.md の正確性検証 | Markdown 文書の内容検証は人手によるレビューに依存 |

## Boy Scout Rule — 翻訳可能性計画

本チケットの変更対象は Makefile（コメント）および RFC_ROOT.md（文書）の2ファイルである。

- **Makefile コメント**: 各エントリの直前に `# 説明:` 形式で日本語コメントを追加する。これにより Makefile の各行が日本語に逐語訳可能な「散文」となる
- **RFC_ROOT.md**: エントリ一覧を表形式にすることで、ターゲット名・説明・使用例が一覧可能となり、読者がコードエントリの意味を推測する必要がなくなる
- 既存コードの翻訳可能性改善はスコープ外（P5-5 はコメント・文書更新のみ）

## Acceptance Criteria

- [ ] Makefile の全4エントリに説明コメントが追加されている（`list-tickets`, `build-conver`, `run-conver`, `test-conver`）
- [ ] RFC_ROOT.md §7 に `test-conver` のエントリが表形式で追記されている
- [ ] `make build-conver` が成功する
- [ ] `make test-conver` が成功する
- [ ] `list-tickets` は RFC_ROOT.md に含まれていない（設計決定通り）

## Notes

- 親オミッション: O-005（RFC OMISSIONS-001）
- 同一フェーズの関連チケット: P5-1（O-003 phaseId 一貫性）, P5-2（O-002 絶対パス変換）, P5-3（O-001 起動パラメータログ）, P5-4（O-004 ACP SDK型定義）
- 依存関係: なし（独立した修正単位）
- make ターゲットの動作確認にはプロジェクトルート（tools/conver）での実行を想定

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testUnit[]`, `testExceptions[]`, `notes` フィールド
- **実装サマリ**: `changes[]`, `notes` フィールド
- **レビュー報告書**: `instrumentation`, `notes`, `rfcDiscrepancies[]` フィールド
