---
ticket_id: 65
title: boundify 警告メッセージのAI指示化と自己修復ループの導入
slug: boundify-ai
status: draft
created_at: 2026-07-07
updated_at: 2026-07-07
---

# boundify 警告メッセージのAI指示化と自己修復ループの導入

## Summary

boundify パイプラインを「検証・自己修復 → 生成 → 品質検証」の3段構成に再設計する。各ステップのエラーメッセージを「AIが次に何をすべきか」が明確な自然言語指示に変更し、AIが自力で原因修正 → 再実行 → 退行チェックまで行える自己修復ループを実現する。

## Background

2026-07-07 の実動作検証で以下の問題が確認された。

### 問題1: 警告メッセージがAIへの指示として不十分

循環依存やスキーマ検証エラーのメッセージが機械的JSON（`{cycle: [...], language: "..."}`）や3段テンプレートのみで終わっており、AIが次に何をすべきかが書かれていない。

### 問題2: エラー時の復帰が無意味

「エラーメッセージに従って原因を修正した上で reset-to-step」と書かれているが、同じStepを再実行しても同じエラーが発生するだけで、問題は解決しない。AIが修正すべき対象はグラフデータ（*-GRAPH.json）であり、それを教える導線がない。

### 問題3: 検証が分散しすぎている

現在は検証が Step 3（Dirs-Tree.json スキーマ検証）と Step 5（最終品質検証）に分散している。検証を先に集約し、通過後はファイル生成のみを行えば、失敗時のロールバックコストが下がる。

### 問題4: 退行チェックがない

循環依存修正などでグラフデータを変更した際、graphify の成果物（ノード構成、エッジ網羅性、headingRefs解決性、孤立ノード有無）が壊れていないかを確認する退行チェックが存在しない。

## Scope

### Step構成の再編

旧Step構成（0→1→2→3→4→5）を以下の4Stepに再編する：

```
Step 0: グラフ読み込み・言語収集（事前処理、変更なし）
Step 1: 検証・自己修復ループ（新設）
         5軸チェック（verify-graph-integrity.js）で問題がないこと、
         および循環依存・ノード不備がないことを確認する。
         問題があればスクリプトがAIに具体的修正指示を出し、
         AIが手動修正 → 再実行 → 問題消失確認 → 退行チェック まで行う。
Step 2: Dirs-Tree.json 生成 + スキーマ検証（旧Step1 + Step3 統合）
Step 3: 一括ファイル生成（旧Step4 --dry-run + 本実行、generate-all-dir-templates.js）
Step 4: 最終品質検証（旧Step5、ただし生成物の確認に特化）
```

### 警告メッセージのAI指示化

以下の警告/エラーメッセージを「何が起きたか」「なぜ起きたか」「AIが次に何をすべきか」の3要素で再構成する：

| スクリプト | 対象 | 現状 | 修正後 |
|---|---|---|---|
| `boundify-graph-to-dirs.js` | 循環依存検出時の warnings | `{cycle: [...], language: "..."}` の機械的JSON | 循環の詳細＋「次のエッジを確認して修正後、再実行してください」 |
| `validate-dirs-tree-schema.js` | スキーマ検証エラー | 3段テンプレート＋エラー一覧 | エラー一覧＋「先頭から順に修正してください」の優先順位指示 |
| `verify-graph-integrity.js`（新規） | nodes/edges 不一致 | なし（新規） | どのIDが増減したか＋「元のグラフと一致するよう復元してください」 |

### verify-graph-integrity.js（新規作成）

graphify 成果物の非破壊を機械的に検証する5軸チェックスクリプト：

| チェック項目 | 方法 | 退行検出対象 |
|---|---|---|
| nodes構成 | nodes の ID 集合の変化 | ノードの誤削除・誤追加 |
| edges構成 | edges 配列の変化 | エッジの誤削除・誤変更 |
| headingRefs解決性 | resolve-by-heading.js 実行 | 参照切れ |
| 孤立ノード | verify.js --check-isolated 相当 | エッジ切れノード |
| 未カバー行 | verify.js --check-coverage 相当 | ソースとの乖離 |

出力は `{ok: true}` または `{ok: false, errors: [...], remedies: [...]}` とし、remedies にAIへの修正指示を含める。

### boundify-graph.md の全面改修

- Step順序を上記4Stepに変更
- 各Stepの「エラー時の復帰」を自己修復ループとして書き直す
  - スクリプトの出力をAIが読む
  - AIが指示に従ってグラフデータを手動修正
  - 再実行してエラー消失確認
  - `verify-graph-integrity.js` で退行チェック
  - 問題なければ次Stepへ
- 旧 Step 2（エッジ投影・循環検出）は Step 1 に統合
- 旧 Step 3（スキーマ検証）は Step 2 に統合
- 「AI による十分性判断」等の manual prompt は Step 4 に集約

## Non-scope

- boundify 以外のパイプライン（graphify / formulate）への自己修復ループ導入
- 既存エラーメッセージの日本語/英語の言語切り替え
- 循環依存の自動修正（AI判断を要するため自動修正は行わない）
- generate-dir-template.js の引数体系変更
- テストファイルのStep順変更（テストは各関数のユニットテストであり、Step変更の影響を受けない）

## Investigation

2026-07-07 の実動作検証で以下のエビデンスを確認。

### エビデンス1: 循環依存警告がAIに何も指示していない

boundify-graph-to-dirs.js が出力する warnings は機械的JSONのみで、AIが具体的に何をすべきかが書かれていない。

```json
"warnings": [{"cycle": ["dir_a", "dir_b", "dir_c"], "language": "rust"}]
```

### エビデンス2: エラー時の復帰が無意味

全Stepで「エラーメッセージに従って原因を修正した上で reset-to-step」と書かれているが、修正対象はグラフデータでありStep再実行では解決しない。

```
例: validate-dirs-tree-schema.js のエラー（パス重複）
  → グラフデータの slug が重複しているのが原因
  → reset-to-step 1 で Dirs-Tree を再生成しても同じ slug が再現されるだけ
  → graphify で slug を修正する必要がある
```

### エビデンス3: 検証が分散しすぎている

現在の検証の分散状況：

```
Step 1: Dirs-Tree生成（検証なし）
Step 2: エッジ投影・循環検出（warnings に記録するのみ）
Step 3: スキーマ検証（初めて検証）
Step 4: ファイル生成（検証なし）
Step 5: 最終品質検証（AI目視）
```

Step 2 の循環検出結果が実際に活用されるのは Step 5 の目視まで待たねばならない。

### エビデンス4: 退行チェックがない

循環依存修正のためグラフのエッジを変更した場合、graphify の verify.js がチェックする3項目（カバレッジ・孤立ノード・headingRefs解決性）が壊れていないか確認する手段がない。

### 関連コード箇所

| ファイル | 行 | 内容 |
|---|---|---|
| `boundify-graph-to-dirs.js` | 438-441 | warnings への循環記録（機械的JSONのみ） |
| `boundify-graph.md` | 全Step | エラー時復帰のパターン（意味をなしていない） |
| `boundify-graph.md` | 129-132 | 「/graphify-rfc に戻って」の抽象指示 |
| `boundify-graph.md` | 219-237 | 「AI による十分性判断」manual prompt |
| `validate-dirs-tree-schema.js` | 315-371 | スキーマ検証エラー（3段テンプレート＋一覧のみ） |
| `.claude/scripts/rfc-graph/verify.js` | 全般 | 孤立ノード・カバレッジ・headingRefs解決性の3軸検証 |
| `.claude/scripts/rfc-graph/resolve-by-heading.js` | 全般 | headingRefs解決性チェック |

## Test Plan

### ユニットテスト計画

1. **boundify-graph-to-dirs.js**: 循環依存検出時の warnings に人間可読な指示文が含まれることを確認
   - 正常系: 循環あり → warnings に `message` フィールド（AI指示文）が含まれる
   - 正常系: 循環なし → warnings が空配列

2. **verify-graph-integrity.js（新規）**:
   - 正常系: 変更がないグラフ → `{ok: true}`
   - 異常系: ノードが削除されたグラフ → `{ok: false, errors: [...]}`
   - 異常系: エッジが削除されたグラフ → `{ok: false, errors: [...]}`
   - 異常系: headingRefs が解決不能 → `{ok: false, errors: [...]}`
   - 異常系: 孤立ノードが存在 → `{ok: false, errors: [...]}`

3. **validate-dirs-tree-schema.js**: エラー一覧に修正優先順位が含まれることを確認
   - 正常系: 複数エラー時、先頭に「先頭から順に修正」の指示文

### ユニットテスト不可能な項目（例外）

- AIの自己修復ループ全体（AI修正 → 再実行 → 退行チェック）は E2E 手動確認
- boundify-graph.md（ドキュメント）の修正はテスト不能

## Boy Scout Rule — 翻訳可能性計画

### 新規作成

- `verify-graph-integrity.js`: 関数名は動詞句（`checkNodeIntegrity`, `checkEdgeIntegrity`, `checkHeadingRefs` 等）
- エラーメッセージは3要素構成（`[問題]` / `[原因]` / `[修正方法]`）
- remedies はAIがそのまま実行可能な手順を箇条書きで記述

### 既存改善（スコープ内）

- `boundify-graph-to-dirs.js` の warnings 構築: 循環情報に人間可読な指示文を追加
- `validate-dirs-tree-schema.js`: エラー一覧に修正優先順位を追加
- `boundify-graph.md`: 全Stepのエラー時復帰を自己修復ループとして統一的に書き直し

## Acceptance Criteria

- [ ] Step構成が「検証・自己修復 → 生成 → 品質検証」の4Stepに再編されている
- [ ] 循環依存検出時の warnings にAIが次に取るべき行動が自然言語で記載されている
- [ ] スキーマ検証エラーに修正優先順位の指示が含まれている
- [ ] `verify-graph-integrity.js` が作成され、nodes/edges/headingRefs/孤立/カバレッジの5軸をチェックする
- [ ] エラー時復帰が「AI修正 → 再実行 → 退行チェック」の自己修復ループとして記述されている
- [ ] 既存テストがすべて通過している
- [ ] 翻訳可能性検証が通っている

## Notes

- 本チケットは PX-24/PX-25 の完了が前提。これらのチケットで改修されたスクリプトが対象。
- PX-24（スキーマ拡張、完了）、PX-25（言語推論廃止、完了）
- `verify.js` の既存関数（checkCoverage, checkIsolated 等）は verify-graph-integrity.js から子プロセス呼び出しではなく直接関数呼び出し可能か調査する。module.exports の状態次第。
