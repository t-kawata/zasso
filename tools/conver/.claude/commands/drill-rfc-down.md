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

Step 1 で確定した進化（`$SESSION_DIR/delta.json`）を既存 `*-GRAPH.json` へ反映する。**破壊・矛盾・危険ゼロ**のため、以下の **dry-run → AI 判断 → crud.js → verify.js** の慎重ループで進める。

**スクリプトによる決定論的解析（dry-run・書込なし）**: `graphify-delta-analyzer.js` が delta.json と既存 GRAPH から新規ノード / 修正ノード / 新規エッジの候補を提案し、`$SESSION_DIR/graph-delta.json` を生成する（GRAPH は一切書かない）。

```bash
node "$DRILL_DIR/graphify-delta-analyzer.js" --delta="$SESSION_DIR/delta.json" --graph="$GRAPH_PATH" --out="$SESSION_DIR/graph-delta.json"
```

**dry-run レポート確認**: `graphify-step.js --dry-run` で候補一覧を確認し、AI エンジニアリングエキスパートとして以下を厳格に判断する:

- **危険**: 新規/修正ノード・エッジが既存設計を破壊しないか
- **漏れ**: 全ての delta セクションが GRAPH に反映されるか
- **矛盾**: 新規ノードの統合 vs 新規追加の判断が正しいか
- **不足**: 新規ノードの kind / slug / headingRefs が適切か

```bash
node "$DRILL_DIR/graphify-step.js" --graph="$GRAPH_PATH" --delta="$SESSION_DIR/delta.json" --source="$RFC_PATH" --dry-run
```

**AI 判断 → 書込（完璧と判断した時のみ）**: 計画が完全なら `--approve` で crud.js 適用 → verify.js 全検査通過を確認する。不十分なら 1-8 へ戻って修正する。**破壊的変更（ノード削除）はデフォルト禁止・AI 明示承認のみ**。

```bash
node "$DRILL_DIR/graphify-step.js" --graph="$GRAPH_PATH" --delta="$SESSION_DIR/delta.json" --source="$RFC_PATH" --approve
```

**検証**: `verify.js` が未カバー見出し・孤立ノード・headingRefs 解決性・一意性を全検査し、**通過するまで修正を繰り返す**。グラフの書き込みは `crud.js` が唯一の経路。

### Step 3: boundify

Step 1 の進化（delta.json）と Step 2 の GRAPH 進化（`$SESSION_DIR/graph-delta.json`）を既存 `*-Dirs-Tree.json` と `src` 内の実ディレクトリ・ファイルへ反映する。**破壊・矛盾・危険ゼロ**のため、以下の **dry-run → AI 判断 → 書込 → validate-dirs-tree-schema** の慎重ループで進める。

**スクリプトによる決定論的解析（dry-run・書込なし）**: `boundify-delta-analyzer.js` が graph-delta.json と既存 Dirs-Tree と **`src` の実ファイル**（`fs` で機械列挙）から、新規ファイル / 修正ファイル / **src drift（欠落・余剰）** の候補を提案し、`$SESSION_DIR/dirs-tree-delta.json` を生成する（Dirs-Tree と src は一切書かない）。

```bash
node "$DRILL_DIR/boundify-delta-analyzer.js" --graph-delta="$SESSION_DIR/graph-delta.json" --dirs-tree="$DIRS_TREE_PATH" --src="$RFC_DIR/src" --out="$SESSION_DIR/dirs-tree-delta.json"
```

**dry-run レポート確認**: `boundify-step.js --dry-run` で候補と src drift を確認し、AI エンジニアリングエキスパートとして以下を厳格に判断する:

- **危険**: 新規/修正ファイルが既存実装を破壊しないか
- **漏れ**: 全 GRAPH ノードが Dirs-Tree / src に反映されるか
- **矛盾**: 配置位置・言語・kind が正しいか
- **不足**: 宣言スタブ・Prose 除外（rationale/glossary/requirement）・Prune 規則を満たすか

```bash
node "$DRILL_DIR/boundify-step.js" --graph="$GRAPH_PATH" --dirs-tree="$DIRS_TREE_PATH" --src="$RFC_DIR/src" --graph-delta="$SESSION_DIR/graph-delta.json" --dry-run
```

**AI 判断 → 書込（完璧と判断した時のみ）**: 計画が完全なら `--approve` で新規ファイル生成＋Dirs-Tree 更新を適用し、`validate-dirs-tree-schema.js` 全検査通過を確認する。不十分なら 1-8 へ戻って修正する。**破壊的変更（ファイル/ディレクトリの削除・移動）はデフォルト禁止・AI 明示承認のみ**。

```bash
node "$DRILL_DIR/boundify-step.js" --graph="$GRAPH_PATH" --dirs-tree="$DIRS_TREE_PATH" --src="$RFC_DIR/src" --graph-delta="$SESSION_DIR/graph-delta.json" --approve
```

**検証**: `validate-dirs-tree-schema.js` が GRAPH / Dirs-Tree 間の整合・mappedNodeIds 解決・循環依存を全検査し、**通過するまで修正を繰り返す**。

### Step 4: split

Step 3 の進化（`$SESSION_DIR/dirs-tree-delta.json`）を既存 `Tickets.json` へ、チケットの編集・積み増しとして反映する。**破壊・矛盾・危険ゼロ**のため、以下の **dry-run → AI 判断 → 書込 → validate-tickets** の慎重ループで進める。

**スクリプトによる決定論的解析（dry-run・書込なし）**: `split-delta-analyzer.js` が dirs-tree-delta.json と既存 Tickets.json から、新規チケット / 編集チケット / フェーズ割当の候補を提案し、`$SESSION_DIR/tickets-delta.json` を生成する（Tickets.json は一切書かない）。既存チケットの **status を surface** し、AI が保全判断できるようにする。

```bash
node "$DRILL_DIR/split-delta-analyzer.js" --dirs-tree-delta="$SESSION_DIR/dirs-tree-delta.json" --tickets="$TICKETS_PATH" --out="$SESSION_DIR/tickets-delta.json"
```

**dry-run レポート確認**: `split-step.js --dry-run` で候補を確認し、AI エンジニアリングエキスパートとして以下を厳格に判断する:

- **危険**: 既存チケット（特に reviewed / R<N>）の status を壊さないか
- **漏れ**: 全 GRAPH ノード / ファイルがチケットに反映されるか
- **矛盾**: フェーズ割当・nodeIds 対応が正しいか
- **不足**: 新規チケットに十分なスコープ・テスト計画があるか

```bash
node "$DRILL_DIR/split-step.js" --tickets="$TICKETS_PATH" --dirs-tree-delta="$SESSION_DIR/dirs-tree-delta.json" --dry-run
```

**AI 判断 → 書込（完璧と判断した時のみ）**: 計画が完全なら `--approve` で add-ticket / update-ticket により新規チケット追加・編集を適用し、`validate-tickets` スキーマ検証を通過させる。不十分なら 1-8 へ戻って修正する。**既存チケットの status は決して黙って上書きしない。破壊的変更（チケット削除）はデフォルト禁止・AI 明示承認のみ**。

```bash
node "$DRILL_DIR/split-step.js" --tickets="$TICKETS_PATH" --dirs-tree-delta="$SESSION_DIR/dirs-tree-delta.json" --approve
```

**検証**: `validate-tickets` がスキーマ（title / round / metadata / phases / tickets の status・phaseId 整合）を全検査し、**通過するまで修正を繰り返す**。ラウンド管理（R<N>）・phaseId 採番は既存 phasify 規約に従う。

### Step 5: verify

5つの整合性（正典 RFC／GRAPH／Dirs-Tree／実装／テスト）を検証スクリプトと AI の厳格な解析で検査せよ。検査を完全に突破できるまで Step 2 に戻って修正を繰り返せ（ブロッキングループ）。

<!-- ? ここに詳細を書く:
- 5つの整合性それぞれの検査項目・合格基準
- 実行する検証スクリプト群と AI による解析の視点
- 検査を突破できない場合に Step 2 へ戻す条件・ループ制御・報告方法 -->
