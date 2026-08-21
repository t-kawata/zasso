---
description: Evolve the canonical RFC and its GRAPH / Dirs-Tree / Tickets as deltas via grill-style questioning.
argument-hint: [<material file|directory>...]
disable-model-invocation: true
---

# /drill-rfc-down

**Role**: Evolve the canonical RFC and its GRAPH / Dirs-Tree / Tickets as deltas via grill-style questioning over crystalize RESIDUE, prior conversation, and given materials. Append-only, lockstep, no destructive changes.

## Language Protocol

| Context | Language | Reason |
|---------|----------|--------|
| Chat, proposals, explanations | **Japanese** | Japanese is mandatory **ONLY** when addressing the user directly. |
| Code comments | **English** | Must be written in the language AI understands most reliably. |
| Design docs, plans, tasks | **English** | Must be written in the language AI understands most reliably. |
| Runtime logs (`log::info!`, etc.) | **English** | International debugging environment and searchability |
| Everything else, i.e. any context where you are not speaking to the user | **English** | Must be written in the language AI understands most reliably. |

## Arguments

All arguments are **optional**. Any number of arguments may be given, separated by spaces.

**Every argument is interpreted as a "given material"** — the third input type of drill-rfc-down, alongside the crystalize RESIDUE and the prior free conversation with the user.

Each argument is a **path** to either:

- a **material file** (reference document, design note, meeting minutes, RFC excerpt, market material, etc.), or
- a **directory** containing material files (every file under it is read as a material)

```bash
/drill-rfc-down <material-file-or-dir> <material-file-or-dir> ...
```

If no arguments are given, drill-rfc-down proceeds with only the crystalize RESIDUE (in README.md) and the prior free conversation as input.

## Script List

<!-- 最後に書くので、まだ書かないこと -->

## Workflow

### Step 0: Preflight

引数（資料ファイル／ディレクトリ）とカレントディレクトリの `Tickets.json` を読み込み、全資料・`metadata.resolvedPaths` の3ファイル（RFC / GRAPH / Dirs-Tree）・`README.md` のパスを取得して実在を検証する。欠落があればエラー文言と共に中断を指示し、全て存在すればファイルパスを Markdown で明示して Step 1 への進行を指示する。

この検証と出力はスクリプトファイル1行の実行で行う。

```bash
node .claude/scripts/drill-rfc-down/preflight.cjs "$ARGUMENTS" || exit 1
```

### Step 1: grill

**役割**: 資料・README.md の RESIDUE・事前の会話を完全に理解し、grill で進化内容を確定して RFC へ追記する。追記優先・破壊的変更禁止。

**変数**: Step 0 の `[VARIABLES]` ブロックから `$RFC_PATH` / `$RFC_DIR` / `$SESSION_DIR` / `$DRILL_DIR` をバインドして使用する。セッション（Status / DesignTree / CheckList）と成果物（baseline / delta）は全て `$SESSION_DIR` に隔離し、既存の `$RFC_DIR/Status.json` 等には触れない。

#### 1-1. セッション初期化

`$SESSION_DIR` を生成し、Status / DesignTree / CheckList を新規作成する（既存セッションがあれば継続）。

```bash
node "$DRILL_DIR/session-init.js" "$RFC_PATH"
node "$DRILL_DIR/session-status.js" "$SESSION_DIR"
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-1
```

#### 1-2. ベースライン取得

RFC 編集前スナップショットを `$SESSION_DIR/baseline.json` に保存する。

```bash
node "$DRILL_DIR/rfc-evolution.js" capture "$RFC_PATH"
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-2
```

#### 1-3. 入力完全理解

全資料・README.md の RESIDUE を全て読み、ユーザーとの事前の会話も含めて全て理解し、進化スコープをユーザーへ提示する。

```bash
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-3
```

#### 1-4. DesignTree ノード生成

進化スコープから初期ノードを追加する。**1ノード=1設計判断**。

**DesignTree ノードの JSON 規則**:
- **id 規約**: トップレベルは `Q1, Q2, ...`（Q+番号）。子ノードは `Q1a, Q1b`（親の Q 番号+英小文字）。grill 質問の Q 番号と対応する
- **title**: その設計判断を表す具体的な名詞句
- **status**: 新規ノードは `"open"`（grill 解決後 `"resolved"` になる）
- **children**: 子ノードの配列（初期 `[]`。下位判断は `add-child` で追加）
- **questions**: 初期 `[]`。`resolve` 時に `{resolvedAt, answer}` が自動追記される

```bash
node "$DRILL_DIR/update-tree.js" "$SESSION_DIR" add '{"id":"Q1","title":"<設計判断>","status":"open","children":[],"questions":[]}'
node "$DRILL_DIR/update-tree.js" "$SESSION_DIR" add-child "Q1" '{"id":"Q1a","title":"<下位判断>","status":"open","children":[],"questions":[]}'
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-4
```

#### 1-5. Grill（規則厳守）

進化内容を grill 方式の質問攻めで確定する。以下の規則を全て厳守する。

**★ 各質問は必ず以下を順に含む**（長さは設計判断の複雑さに比例させ、簡潔にしない）:
0. **質問 ID**: `Q番号`（`Q<number>` 形式・ターン内で一意）
1. **背景と理由**: なぜこの設計判断が必要か・選択肢・トレードオフを十分な詳細で
2. **改行区切り選択肢**: 各選択肢を 1 行ずつマークダウンリスト形式で（1 行に 2 つ以上並べない）
3. **推奨と根拠**: どれを推奨するか・なぜ他より優れているかを具体的に

**ユーザーは Yes/No または A/B/C 選択のみで回答する。自由記述を求めてはならない**（自発的な自由記述は受け取ってよい）。

- **粗粒度バンドル**: 1質問=3〜5ノード、1ターン=5〜10質問。**2パス方式**（全体アーキテクチャ→詳細）
- **各ターン終了時に確定内容を要約**してから次のターンへ進む
- **質問提示前に必ず `validate-question-format.js` を通過させる**（`valid: true` まで。スキップは禁止）
- **回答受領後、即座に DesignTree ノードを更新**する（`add` / `resolve` / `batch-resolve`、必要に応じて `add-child` / `refine` / `delete`）
- **grill 中に RFC を書かない**。質問と回答に専念する

```bash
node "$DRILL_DIR/validate-question-format.js" "<質問文>"
node "$DRILL_DIR/update-tree.js" "$SESSION_DIR" add '{"id":"Q5","title":"<新たな設計判断>","status":"open","children":[],"questions":[]}'
node "$DRILL_DIR/update-tree.js" "$SESSION_DIR" resolve "<node_id>" "<回答要約>"
node "$DRILL_DIR/update-tree.js" "$SESSION_DIR" batch-resolve '["Q1","Q2","Q3"]' "<回答要約>"
node "$DRILL_DIR/update-tree.js" "$SESSION_DIR" add-child "Q1" '{"id":"Q1a","title":"<下位判断>","status":"open","children":[],"questions":[]}'
node "$DRILL_DIR/update-tree.js" "$SESSION_DIR" refine "<node_id>" "<新タイトル>"
node "$DRILL_DIR/update-tree.js" "$SESSION_DIR" delete "<node_id>"
node "$DRILL_DIR/update-tree.js" "$SESSION_DIR" open-count
node "$DRILL_DIR/tree-query.js" "$SESSION_DIR" tree
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-5
```

**DesignTree 可視化・検索**（grill 中にツリー状態を俯瞰・検索するために使用）:

```bash
node "$DRILL_DIR/tree-query.js" "$SESSION_DIR" tree              # 階層表示（🔲/✅）
node "$DRILL_DIR/tree-query.js" "$SESSION_DIR" search "<キーワード>"  # id/title 部分一致検索
node "$DRILL_DIR/tree-query.js" "$SESSION_DIR" path "<node_id>"  # ルートから指定ノードまでの経路
node "$DRILL_DIR/tree-query.js" "$SESSION_DIR" stats             # 統計（open/resolved/進捗%）
```

#### 1-6. 終了判定

`open-count` が 0 になったら grill セッションの終了をユーザーへ提案し、**同時に「CheckList（RFC 要件チェックリスト）の生成を開始しますか？」をユーザーに問う**。承認が得られたら次へ進む。

```bash
node "$DRILL_DIR/update-tree.js" "$SESSION_DIR" open-count
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-state CHECKLIST_PENDING
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-6
```

#### 1-7. CheckList 生成・承認

`generate-checklist.js` で CheckList を機械生成し、**AI は全項目を目視確認して補足を追記する**（曖昧なノードの注記・プロジェクト固有の制約の追加）し、**ユーザーに提示して承認を得る**。承認後に CHECKLIST_APPROVED へ遷移する。

```bash
node "$DRILL_DIR/generate-checklist.js" "$SESSION_DIR" --no-backup
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-state CHECKLIST_APPROVED
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-7
```

#### 1-8. RFC 追記

確定した進化内容を RFC に追記する。**追記内容は進化スコープ全体を自己完結的にカバーする完全な設計でなければならない**。各新セクションには必ず以下を含める:

- **コードスニペット（コード例）**: 各設計判断に必ずコード例を付ける（本家 STEP 5 と同一の制約）
- **I/O 境界参照情報**: 後段 graphify / boundify が分割判断できるよう参考情報を含める
- **TBD / TODO / スタブ / 委譲の混入禁止**: どの形式でも禁止

```bash
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-8
```

#### 1-9. CheckList 検証

CheckList の全項目を機械的に検証し、未達項目を修正して **全項目 ✅ になるまで繰り返す**。**TBD / TODO / 「別バージョンで対応」が検出されたら即時警告し、該当セクションの記載が完了するまで完了宣言しない**。

```bash
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-state REVIEWING
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-9
```

#### 1-10. 再 grill 判定

新たな未解決ノードがあれば 1-5 へ戻る（3 回超でユーザーへ報告）。

```bash
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-state GRILLING
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" inc-loop
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-10
```

#### 1-11. 進化検証（スクリプト検証 ＋ AI エキスパート判定）

**スクリプトによる決定論的検証**（機械ゲート・結果は AI への情報提供）: append-only ゲート・delta 抽出・well-formedness・矛盾候補を検証し、`$SESSION_DIR/delta.json` を生成する。違反は exit 1 → 1-8 へ戻る。

```bash
node "$DRILL_DIR/rfc-evolution.js" verify "$RFC_PATH"
```

**AI エンジニアリングエキスパート判定**（非決定論・妥協無し）: 検証結果・delta.json・DesignTree の resolved ノード・進化スコープを全て確認し、エンジニアリングエキスパートとして以下を厳格に判定する:

- **危険**: 追記内容が既存の設計・実装・契約を破壊しないか
- **漏れ**: 進化スコープ・DesignTree の全 resolved ノードが RFC に反映されているか
- **矛盾**: 既存 RFC / GRAPH / Dirs-Tree / Tickets と矛盾しないか
- **不足**: 各設計判断にコード例・I/O 境界情報・十分な詳細があるか

**品質ループ（妥協無し）**: いずれかが不十分と判断したら、**妥協無く 1-8 へ戻って修正**し、1-8 → 1-11 を繰り返す。全て通過したと判断した場合のみ次へ進む。

```bash
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-11
```

#### 1-12. 完了宣言

open-count 0・CheckList ✅・RFC に TBD/TODO/スタブ 0・verify 通過で DONE とする。

```bash
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-state DONE
node "$DRILL_DIR/check-all-schema.js" "$SESSION_DIR"
node "$DRILL_DIR/rfc-evolution.js" clean "$RFC_PATH"
node "$DRILL_DIR/update-status.js" "$SESSION_DIR" set-step 1-12
```

**次**: `$SESSION_DIR/delta.json` を入力に **Step 2: graphify** へ。

### Step 2: graphify

Step 1 で確定した進化（`$SESSION_DIR/delta.json`）を既存 `*-GRAPH.json` へ反映する。**AI がエンジニアリングエキスパートとして設計し、スクリプトは情報提供と安全な編集道具・検証に徹する**。危険・漏れ・矛盾・不足ゼロで完了させるため、以下の **stage → AI 設計（crud.js で staging を編集）→ approve（verify.js 通過後のみ promote）** のループで進める。**AI が JSON を手書き編集してはならない**。あらゆる編集は `crud.js` が唯一の経路であり、各編集のたびにスキーマ検証が走り、失敗時は自然言語の英語メッセージ（`[ERROR] Cause: ... Action: ...`）で AI に修正指示を出す。

**① stage（スクリプトは候補情報を提供するのみ・実 GRAPH は不変）**: `graphify-step.js --stage` が実 `*-GRAPH.json` を `<graph>.staging.json` へコピーし、`graphify-delta-analyzer.js` の候補（新規ノード / 修正ノード / 新規エッジ）を `<graph>.candidates.json` に書き出してレポート表示する。さらに **四軸インスペクションレポート（危険・漏れ・矛盾・不足）** を英語で併記する（slug 衝突 / 重複見出し / 弱マッチ / **Step1 の矛盾候補** / 100行超セクション / slug 25文字超）。**これは「計画」ではなく AI の設計判断を助ける情報であり、promote ゲート（verify.js）は一切変更しない**。実 GRAPH は一切書き換わらない。

```bash
node "$DRILL_DIR/graphify-step.js" --graph="$GRAPH_PATH" --delta="$SESSION_DIR/delta.json" --source="$RFC_PATH" --stage
```

**② AI 設計（エンジニアリングエキスパートの非決定論的判断）**: 候補レポートと delta.json・RFC 原文を突き合わせ、AI 自身が以下を厳格に判断しながら、**staging グラフを `crud.js` で編集**して進化を設計する:

- **危険**: 新規/修正ノード・エッジが既存設計を破壊しないか
- **漏れ**: 全ての delta セクションが GRAPH に反映されるか
- **矛盾**: 新規ノードの統合 vs 新規追加の判断が正しいか
- **不足**: 新規ノードの kind / slug / headingRefs / エッジ contracts が適切か

候補は参考情報に過ぎず、そのまま適用する義務はない。AI の判断が候補と異なれば、crud.js の粒度編集ツール（`create-nodes` / `update-node` / `create-edges`）で staging に反映する。**`--approve` はアナライザーを再実行せず、AI が crud.js で設計した staging グラフをそのまま検証・昇格する**。

```bash
# 例: staging グラフへのノード追加（--graph は staging パスを指す）
node "$DRILL_DIR/../rfc-graph/crud.js" --graph="$GRAPH_PATH.staging.json" create-nodes --file="$SESSION_DIR/ai-nodes.json"
# 例: staging グラフへのエッジ追加
node "$DRILL_DIR/../rfc-graph/crud.js" --graph="$GRAPH_PATH.staging.json" create-edges --file="$SESSION_DIR/ai-edges.json"
# 例: staging ノードの修正
node "$DRILL_DIR/../rfc-graph/crud.js" --graph="$GRAPH_PATH.staging.json" update-node --id=N0003 --file="$SESSION_DIR/ai-patch.json"
```

**③ approve（完全と判断した時のみ）**: 設計が完了したら `--approve` を実行する。`verify.js` が staging グラフを全検査（未カバー見出し・孤立ノード・headingRefs 解決性・一意性）し、**通過した場合のみ staging → 実 GRAPH へ promote** する。検証失敗時は英語メッセージ（`[ERROR] Cause: ... Action: ...`）が出て promote されないため、crud.js で修正して再実行する。**破壊的変更（ノード削除）はデフォルト禁止・AI 明示承認のみ**。

```bash
node "$DRILL_DIR/graphify-step.js" --graph="$GRAPH_PATH" --source="$RFC_PATH" --approve
```

**④ reject（設計を破棄）**: 設計をやり直す場合は `--reject` で staging を破棄する。実 GRAPH はバイト単位で不変（perfect-before-write ゲート）。

```bash
node "$DRILL_DIR/graphify-step.js" --graph="$GRAPH_PATH" --source="$RFC_PATH" --reject
```

**検証**: `verify.js` が promote 前に staging を全検査するため、**通過するまで②③を繰り返す**。グラフの書き込みは `crud.js`（staging）と promote（graphify-step.js）のみが経路である。

### Step 3: boundify

Step 1 の進化（delta.json）と Step 2 の GRAPH 進化（`$GRAPH_PATH.delta.json`）を既存 `*-Dirs-Tree.json` と `src` 内の実ディレクトリ・ファイルへ反映する。**AI がエンジニアリングエキスパートとして設計し、スクリプトは情報提供と安全な編集道具・検証に徹する**。危険・漏れ・矛盾・不足ゼロで完了させるため、以下の **stage → AI 設計（dirs-tree-crud.js で staging を編集）→ approve（validate 通過後のみ promote）→ reject** のループで進める。**AI が JSON を手書き編集してはならない**。あらゆる Dirs-Tree 編集は `dirs-tree-crud.js` が唯一の経路であり、各編集のたびにスキーマ検証が走り、失敗時は自然言語の英語メッセージ（`[ERROR] Cause: ... Action: ...`）で AI に修正指示を出す。

**① stage（スクリプトは候補情報を提供するのみ・実 Dirs-Tree/src は不変）**: `boundify-step.js --stage` が実 `*-Dirs-Tree.json` を `<dirsTree>.staging.json` へコピーし、`boundify-delta-analyzer.js` の候補（新規ファイル / 修正ファイル / **src drift（欠落・余剰）** / 依存ディレクトリ）を `<dirsTree>.candidates.json` に書き出してレポート表示する。さらに **四軸インスペクションレポート（危険・漏れ・矛盾・不足）** を英語で併記する（パス衝突 / 依存循環 / 未マップ GRAPH ノード / kind 不一致 / **Prose 除外** / 宣言スタブ欠落）。**これは「計画」ではなく AI の設計判断を助ける情報であり、promote ゲート（validate-dirs-tree-schema）は一切変更しない**。実 Dirs-Tree と src は一切書き換わらない。

```bash
node "$DRILL_DIR/boundify-step.js" --dirs-tree="$DIRS_TREE_PATH" --src="$RFC_DIR/src" --graph="$GRAPH_PATH" --graph-delta="$GRAPH_PATH.delta.json" --stage
```

**② AI 設計（エンジニアリングエキスパートの非決定論的判断）**: 候補レポートと graph-delta.json・RFC 原文・src drift を突き合わせ、AI 自身が以下を厳格に判断しながら、**staging Dirs-Tree を `dirs-tree-crud.js` で編集**して進化を設計する:

- **危険**: 新規/修正ファイルが既存実装を破壊しないか
- **漏れ**: 全 GRAPH ノードが Dirs-Tree / src に反映されるか
- **矛盾**: 配置位置・言語・kind が正しいか
- **不足**: 宣言スタブ・Prose 除外（rationale/glossary/requirement）・Prune 規則を満たすか

候補は参考情報に過ぎず、そのまま適用する義務はない。AI の判断が候補と異なれば、dirs-tree-crud.js の粒度編集ツール（`add-dir` / `add-file` / `update-node` / `update-mapped` / `remove-node`）で staging に反映する。新規ファイルの実体（src 内の宣言スタブ等）も AI が作成する。**`--approve` はアナライザーを再実行せず、AI が dirs-tree-crud.js で設計した staging Dirs-Tree をそのまま検証・昇格する**。

```bash
# 例: staging Dirs-Tree へのファイルノード追加（--dirs-tree は staging パスを指す）
node "$DRILL_DIR/dirs-tree-crud.js" --dirs-tree="$DIRS_TREE_PATH.staging.json" --graph="$GRAPH_PATH" add-file --path=src/api/session_storage.rs --kind=architecture --mapped=N0003:Session storage
# 例: staging Dirs-Tree へのディレクトリノード追加
node "$DRILL_DIR/dirs-tree-crud.js" --dirs-tree="$DIRS_TREE_PATH.staging.json" --graph="$GRAPH_PATH" add-dir --path=src/api/cache --kind=architecture
# 例: staging ノードの kind 更新
node "$DRILL_DIR/dirs-tree-crud.js" --dirs-tree="$DIRS_TREE_PATH.staging.json" --graph="$GRAPH_PATH" update-node --path=src/api/auth.rs --file="$SESSION_DIR/ai-patch.json"
# 例: staging ノードの mappedNodeIds 更新
node "$DRILL_DIR/dirs-tree-crud.js" --dirs-tree="$DIRS_TREE_PATH.staging.json" --graph="$GRAPH_PATH" update-mapped --path=src/api/auth.rs --mapped=N0002:Auth module
```

**③ approve（完全と判断した時のみ）**: 設計が完了したら `--approve` を実行する。`validate-dirs-tree-schema.js` が staging Dirs-Tree を全検査（GRAPH/Dirs-Tree 間整合・mappedNodeIds 解決・循環依存）し、**通過した場合のみ**進化デルタ `dirs-tree-delta.json` を機械導出し、新規ファイルの src スタブを commit して、staging → 実 Dirs-Tree へ promote する。検証失敗時は英語メッセージ（`[ERROR] Cause: ... Action: ...`）が出て promote されないため、dirs-tree-crud.js で修正して再実行する。**破壊的変更（ファイル/ディレクトリの削除・移動）はデフォルト禁止・AI 明示承認（`remove-node --force`）のみ**。

```bash
node "$DRILL_DIR/boundify-step.js" --dirs-tree="$DIRS_TREE_PATH" --src="$RFC_DIR/src" --graph="$GRAPH_PATH" --approve
```

**④ reject（設計を破棄）**: 設計をやり直す場合は `--reject` で staging を破棄する。実 Dirs-Tree と src はバイト単位で不変（perfect-before-write ゲート）。

```bash
node "$DRILL_DIR/boundify-step.js" --dirs-tree="$DIRS_TREE_PATH" --src="$RFC_DIR/src" --graph="$GRAPH_PATH" --reject
```

**検証**: `validate-dirs-tree-schema.js` が promote 前に staging を全検査するため、**通過するまで②③を繰り返す**。Dirs-Tree の書き込みは `dirs-tree-crud.js`（staging）と promote（boundify-step.js）のみが経路である。

### Step 4: split

Step 3 の進化（`$DIRS_TREE_PATH.delta.json`）を既存 `Tickets.json` へ、チケットの編集・積み増しとして反映する。**AI がエンジニアリングエキスパートとして設計し、スクリプトは情報提供と安全な編集道具・検証に徹する**。危険・漏れ・矛盾・不足ゼロで完了させるため、以下の **stage → AI 設計（add-ticket / update-ticket で staging を編集）→ approve（validate-tickets 通過後のみ promote）→ reject** のループで進める。**AI が JSON を手書き編集してはならない**。あらゆるチケット編集は `add-ticket.js` / `update-ticket.js` が唯一の経路であり、各編集のたびにスキーマ検証が走り、失敗時は自然言語の英語メッセージ（`[ERROR] Cause: ... Action: ...`）で AI に修正指示を出す。

**① stage（スクリプトは候補情報を提供するのみ・実 Tickets.json は不変）**: `split-step.js --stage` が実 `Tickets.json` を `<tickets>.staging.json` へコピーし、`split-delta-analyzer.js` の候補（新規チケット / 編集チケット / フェーズ割当 / **既存チケットの status**）を `<tickets>.candidates.json` に書き出してレポート表示する。さらに **四軸インスペクションレポート（危険・漏れ・矛盾・不足）** を英語で併記する（status 上書きリスク / 未マップ修正ノード / 重複ノードチケット / スコープ・テスト計画不足）。**これは「計画」ではなく AI の設計判断を助ける情報であり、promote ゲート（validate-tickets）は一切変更しない**。実 Tickets.json は一切書き換わらない。

```bash
node "$DRILL_DIR/split-step.js" --tickets="$TICKETS_PATH" --dirs-tree-delta="$DIRS_TREE_PATH.delta.json" --stage
```

**② AI 設計（エンジニアリングエキスパートの非決定論的判断）**: 候補レポートと dirs-tree-delta.json・既存 status 一覧を突き合わせ、AI 自身が以下を厳格に判断しながら、**staging Tickets.json を `add-ticket.js` / `update-ticket.js` で編集**して進化を設計する:

- **危険**: 既存チケット（特に reviewed / R<N>）の status を壊さないか
- **漏れ**: 全 GRAPH ノード / ファイルがチケットに反映されるか
- **矛盾**: フェーズ割当・nodeIds 対応が正しいか
- **不足**: 新規チケットに十分なスコープ・テスト計画があるか

候補は参考情報に過ぎず、そのまま適用する義務はない。AI の判断が候補と異なれば、add-ticket.js / update-ticket.js で staging に反映する。**`--approve` はアナライザーを再実行せず、AI が staging で設計した Tickets.json をそのまま検証・昇格する**。

```bash
# 例: staging Tickets.json への新規チケット追加（--tickets は staging パスを指す）
echo '{"title":"Session storage","nodeIds":["N0003"],"scope":[],"testUnit":[],"testIntegration":[],"testExceptions":[],"changes":[]}' | node "$DRILL_DIR/../tickets/add-ticket.js" "$TICKETS_PATH.staging.json" "P1"
# 例: staging チケットの title 更新
echo '{"title":"Auth module extended"}' | node "$DRILL_DIR/../tickets/update-ticket.js" "$TICKETS_PATH.staging.json" "P0-1"
```

**③ approve（完全と判断した時のみ）**: 設計が完了したら `--approve` を実行する。`validate-tickets` が staging Tickets.json を全検査（title / round / metadata / phases / tickets の status・phaseId 整合）し、**通過した場合のみ**進化デルタ `tickets-delta.json` を機械導出して staging → 実 Tickets.json へ promote する。検証失敗時は英語メッセージ（`[ERROR] Cause: ... Action: ...`）が出て promote されないため、add-ticket / update-ticket で修正して再実行する。**既存チケットの status は決して黙って上書きしない。破壊的変更（チケット削除）はデフォルト禁止・AI 明示承認のみ**。

```bash
node "$DRILL_DIR/split-step.js" --tickets="$TICKETS_PATH" --approve
```

**④ reject（設計を破棄）**: 設計をやり直す場合は `--reject` で staging を破棄する。実 Tickets.json はバイト単位で不変（perfect-before-write ゲート）。

```bash
node "$DRILL_DIR/split-step.js" --tickets="$TICKETS_PATH" --reject
```

**検証**: `validate-tickets` が promote 前に staging を全検査するため、**通過するまで②③を繰り返す**。ラウンド管理（R<N>）・phaseId 採番は既存 phasify 規約に従う。Tickets.json の書き込みは `add-ticket.js` / `update-ticket.js`（staging）と promote（split-step.js）のみが経路である。

### Step 5: verify

5つの成果物（正典 RFC／GRAPH／Dirs-Tree／src 実装／Tickets）の**相互整合性**を機械検証し、**横断的な矛盾ゼロ**を確認する。`verify-consistencies.js` が5整合性を検査し、`verify-step.js` が severity ランクで PASS/FAIL を判定する。**high が1件でも残れば FAIL（exit 1）→ Step 2 へ戻って修正 → 再検証**を繰り返す（ブロッキングループ）。low（cosmetic）のみなら PASS。

```bash
node "$DRILL_DIR/verify-step.js" --rfc="$RFC_PATH" --graph="$GRAPH_PATH" --dirs-tree="$DIRS_TREE_PATH" --src="$RFC_DIR/src" --tickets="$TICKETS_PATH"
```

**5つの整合性検査（severity: high=構造破壊 / low=cosmetic）**:

| 検査 | 内容 | severity |
|---|---|---|
| RFC headings ↔ GRAPH headingRefs | 全見出しが GRAPH ノードでカバーされる | high |
| GRAPH ↔ Dirs-Tree mappedNodeIds | 全非-Prose ノードが Dirs-Tree にマップされる | high |
| Dirs-Tree ↔ src | 全 Dirs-Tree ファイルが src に存在 / src 余剰 | high / low |
| GRAPH ↔ Tickets nodeIds | 全非-Prose ノードがチケットに存在 | high |
| ダングリング参照 | Dirs-Tree / Tickets の参照先が GRAPH に存在 | high |

**ループ制御**: `verify-step.js` が exit 1 を返したら、報告された high 項目を解消するよう **Step 2（graphify）へ戻って修正**し、Step 3/4 を再実行してから再検証する。exit 0（PASS）まで繰り返す。検証は **read-only**（成果物を一切書き換えない・決定論的）。
