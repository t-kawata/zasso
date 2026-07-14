---
ticket_id: 37
title: formulate-ticketsコマンド群へのチケット統合チェック追加
slug: formulate-tickets
status: draft
created_at: 2026-07-01
updated_at: 2026-07-01
---
# formulate-ticketsコマンド群へのチケット統合チェック追加

## Summary

formulate-tickets.md / formulate-tickets-for-next.md の Step 構造に「発散→収束」の2段階が欠けているため、I/O 境界で統合すべき候補がそのまま過剰分解されたチケットになる問題を修正する。Step 3（5層モデル）と Step 4（フェーズ設計）の間に「チケット統合チェック」を整数ステップとして新設し、後続ステップ番号を整数リナンバリングする。併せて find-omissions-for-next-rfc.md に P10-1 で追加予定の Step 3.5 も整数にリナンバリングする。

## Background

formulate-tickets.md / formulate-tickets-for-next.md の現在の Step 構成は「発散」のみで「収束」がない：

```
Step 1: 情報抽出（型・関数・依存を列挙） ← 発散
Step 3: 5層モデル分類（Layer 0-4）       ← さらに発散
Step 4: フェーズ設計                    ← なお発散
Step 7: チケット追加（列挙したまま）      ← ❌ 収束なし！
```

「I/O 境界の単位で区切る」というルールは Step 4 末尾に記述されているが、それは「これから区切る」という宣言だけで、実際に列挙された候補を統合する機構がない。AI は「列挙されたものをそのままチケット化」するため、過剰分解が発生する。

P9/P10 のチケット設計時、P9-1〜P9-3（3スクリプト）→ 1チケット、P10-1〜P10-3（3チケット）→ 1チケットに統合しなければならない例が発生し、この問題が顕在化した。

Step に小数（3.5 等）を使うと「Step 3 の一部」という含意になるが、チケット統合チェックは Step 3 の出力を受け取り Step 4（現 Step 5）への入力に変換する独立した処理である。整数リナンバリングにより第一級のステップであることを明確にする。

## Scope

- **formulate-tickets.md**: Step 3（5層モデル）と Step 4（フェーズ設計）の間に「チケット統合チェック」を Step 4 として新設。旧 Step 4〜Step 8 を Step 5〜Step 9 にリナンバリング。全 bash コードブロック内の Step 番号参照も更新。
- **formulate-tickets-for-next.md**: 同様の Step 4 追加 + リナンバリング。
- **find-omissions-for-next-rfc.md**: P10-1 で追加予定の Step 3.5（機械的フィルタリング）を Step 4 に変更。旧 Step 4〜Step 6 を Step 5〜Step 7 にリナンバリング。
- **create-omissions.js**: steps 配列の `"3.5"` を `"4"` に変更（P10-1 のスコープと重複。P10-1 完了前なら本チケットで先行対応、完了後なら本チケットで事後修正）。

### 新設する Step 4 の内容（3ファイル共通）

```
### Step 4: チケット統合チェック — I/O 境界による候補の束ね直し

Step 3 で分類した全要素に対して、以下の質問で統合すべき候補を洗い出す：

1. 「この2つの候補は、同じファイルを読み、同じファイルに書き出すか？」
   → YES: 1チケットに統合する
2. 「この候補は単独では呼ばれず、別の候補の出力を入力としてのみ動作するか？」
   → YES: パイプライン全体を1チケットに統合する
3. 「この2つの候補は、テストも含めて異なる不変条件で検証できるか？」
   → NO: 同じ不変条件のもとで検証できるなら統合する

統合の判断基準:
- 統合前: 「型A」「関数B」「関数C」が3つの候補として存在
- 統合後: 「ファイル読み込みから結果出力までのパイプライン」が1つのI/O境界
```

チケット分解の基準（旧 Step 4 / 新 Step 5）にも、統合チェック通過を前提とする記述を追加する。

## Non-scope

- 新規スクリプトの作成（AI の非決定論的判断ステップのため不要）
- チケット分解の基準そのものの変更（I/O 境界ルールは維持）
- 既存の Step 0〜Step 3 の内容変更
- RFC_ADDITION-002.md の内容変更（本チケットはその設計を Step 番号の点のみ修正する）

## Investigation

### 証拠1: formulate-tickets.md の現在の Step 構成（過剰分解の温床）

ファイル: `.claude/commands/formulate-tickets.md`（339行）

Step 構成:
```
Step 0: 初期化
Step 1: 設計書の検証と情報抽出
Step 2: CLAUDE.md 自動生成
Step 3: 依存グラフ構築（5層モデル） ← 全要素を機械的に列挙させる
Step 4: フェーズ設計                ← 列挙されたままフェーズに割り振る
Step 5: Tickets.json スケルトン生成
Step 6: フェーズ追加
Step 7: チケット追加                ← 統合なしでそのまま追加
Step 8: チェックリスト出力
```

Step 3 で「型A」「関数B」「関数C」と機械的に列挙した後、それらを統合するチェックがどこにも存在しない。Step 4 末尾の「チケット分解の基準」は「I/O 境界の単位で区切る」と宣言しているだけで、列挙された候補をどう統合するかの指示がない。

### 証拠2: formulate-tickets-for-next.md も同一の問題

ファイル: `.claude/commands/formulate-tickets-for-next.md`（363行）

formulate-tickets.md と同様の Step 構成を持ち、同一の過剰分解問題を抱える。Step 3（5層モデル）の直後に Step 4（フェーズ設計）が続き、統合チェックがない。

### 証拠3: 今回の P9/P10 設計で過剰分解が実際に発生した

P9-1（dedup）・P9-2（materiality）・P9-3（diminishing）は直列パイプラインとしてのみ動作し、単独では呼ばれない。本来「Step 3.5 機械的フィルタリングパイプライン」という1つの I/O 境界（raw OMISSIONS + 履歴 + RFC → フィルタリング済み OMISSIONS + 発散傾向レポート）に統合すべきだった。

同様に P10-1〜P10-3（create-omissions更新 + .md追記 + 結合テスト）も「find-omissions への Goal Gate 統合」という単一目的であり、3分割する理由がない。

### 証拠4: find-omissions-for-next-rfc.md の Step 3.5 も小数ステップ問題を抱える

P10-1 で追加予定の Step 3.5（機械的フィルタリング）も整数に修正すべき。P10-1 完了前なら本チケットで先に対応し、P10-1 完了後なら事後修正する。

### 証拠5: Step 番号の参照範囲

grep 結果により、bash コードブロック内の Step 番号参照が各 .md ファイル内に複数存在する：

- formulate-tickets.md: bash コードブロック内の update-omissions-step.js 呼び出しに Step 番号が使われている箇所は**存在しない**（チケット追加スクリプトのためステップ追跡不要）。ただし、Step 間の説明文中に「Step 4」「Step 5」等の相互参照が存在する。
- formulate-tickets-for-next.md: 同上。
- find-omissions-for-next-rfc.md: `update-omissions-step.js` で Step 番号が使われている（"3a", "3b" 等）。Step 3.5 の新設に伴い、関連箇所の整数リナンバリングが必要。

## Test Plan

### ユニットテスト計画

- 本チケットは Markdown 文書の編集のみ（スクリプト変更は find-omissions-for-next-rfc.md の Step 3.5→4 のみ）のため、専用のユニットテストは不要。
- create-omissions.js の steps 配列変更（"3.5"→"4"）が発生する場合: steps 配列に `"4"` が含まれ、`"3.5"` が含まれないことを grep で確認。

### ユニットテスト不可能な項目（例外）

- Markdown 文書の正確性: 目視確認による
- create-omissions.js の steps 配列変更後の表示確認: `show-omissions-steps.js` の手動実行

## Boy Scout Rule — 翻訳可能性計画

- 本チケットは Markdown 文書編集のみのため、コードの翻訳可能性に関する Boy Scout 対応は発生しない。
- ただし、各 .md ファイル内で「Step N」の表記ゆれがないように統一する。特に「小数ステップ（3.5等）」→「整数ステップ（4等）」への置き換え漏れがないよう注意する。

## Acceptance Criteria

- [ ] formulate-tickets.md に Step 4（チケット統合チェック）が追加され、旧 Step 4〜Step 8 が Step 5〜Step 9 にリナンバリングされている
- [ ] formulate-tickets-for-next.md に同内容の Step 4 が追加され、同様にリナンバリングされている
- [ ] find-omissions-for-next-rfc.md の Step 3.5（P10-1 追加予定）が Step 4 に変更され、後続が Step 5〜Step 7 にリナンバリングされている
- [ ] 両ファイルの bash コードブロック内で Step 番号の整合性が取れている（grep 確認）
- [ ] P10-1 が未完了の場合: create-omissions.js の steps 配列が `"3.5"` から `"4"` に変更されている

## Notes

- 本チケットは P10-1（find-omissions への Goal Gate 統合）と競合する可能性がある。P10-1 が先に完了している場合、find-omissions-for-next-rfc.md の Step 3.5 追加済み→それを Step 4 に修正する。P10-1 が未完了の場合、本チケットで先に Step 3.5→4 の修正を含める。
- P10-1 が create-omissions.js の steps 配列に `"3.5"` を追加している場合、本チケットで `"4"` に変更する必要がある。これを dependent task として管理する。

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testUnit[]`, `testExceptions[]`, `notes` フィールド
- **実装サマリ**: `changes[]`, `notes` フィールド
- **レビュー報告書**: `instrumentation`, `notes`, `rfcDiscrepancies[]` フィールド
