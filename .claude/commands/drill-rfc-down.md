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
node .claude/scripts/drill-rfc-down/preflight.js "$ARGUMENTS" || exit 1
```

### Step 1: grill

Preflight で確認した全資料・`README.md` 内の RESIDUE・ユーザーとの事前の会話を完全に理解し、`.claude/commands/grill-me-for-rfc.md`（および旧 `drill-rfc-down-old.md`）に定義された「スクリプトを多用した厳密な grill」と同一の厳格さで進化内容を確定せよ。簡易的な grill もどきは禁止。このステップで RFC への編集（追記優先・破壊的変更禁止）を完了せよ。

<!-- ? ここに詳細を書く:
- 入力（資料・RESIDUE・会話）を完全に理解する手順
- grill の進行手順（init → DesignTree 生成 → 質問 → 回答反映 → CheckList 生成 → 照合 → 再 grill 判定）
- RFC 編集の安全策（追記優先・破壊的変更禁止・I/O 境界参照情報の追記・TBD/スタブ禁止）
- この時点で GRAPH / Dirs-Tree / Tickets と矛盾する破壊的変更が RFC に生じるため、それを検出・防止するスクリプト安全策の設計 -->

### Step 2: graphify

Step 1 で確定した進化を既存 `*-GRAPH.json` へ、破壊・矛盾・危険ゼロで反映せよ。ノード・エッジの追加・編集は `crud.js`（唯一の書き込み経路）を使用し、`verify.js` で完全な検証を通過するまで修正を繰り返せ。

<!-- ? ここに詳細を書く:
- 既存 GRAPH へのノード・エッジの追加・編集手順（crud.js 等の唯一の書き込み経路の利用）
- グラフ検証スクリプトの実行と全項目通過条件（孤立ノード・未カバー行・headingRefs 等）
- グラフの一意性・整合性・破壊的変更を防ぐスクリプト安全策の設計 -->

### Step 3: boundify

Step 1 で確定した進化を既存 `*-Dirs-Tree.json` と `src` 内のディレクトリ・ファイルへ、破壊・矛盾・危険ゼロで反映せよ。更新後に `validate-dirs-tree-schema.js` で検証し、GRAPH / Dirs-Tree 間の全ての矛盾・破壊を解消するまで修正を繰り返せ。

<!-- ? ここに詳細を書く:
- Dirs-Tree の検証・自己修復手順
- `src` への新規ディレクトリ・ファイル生成手順（宣言スタブ・Prose 除外・Prune 規則・循環依存検出）
- GRAPH との整合性検証
- 破壊的変更を防ぐスクリプト安全策の設計 -->

### Step 4: split

Step 1 で確定した進化を既存 `Tickets.json` へ、破壊・矛盾・危険ゼロでチケットの編集・積み増しとして反映せよ。更新後に `validate-tickets.js` でスキーマ検証し、GRAPH / Dirs-Tree / Tickets 間の全ての矛盾・破壊を解消するまで修正を繰り返せ。

<!-- ? ここに詳細を書く:
- 新規ノード群のフェーズ割当・チケット積み増しの手順（phasify 等）
- 既存チケットの status 保全・ラウンド管理・phaseId 採番
- Tickets.json のスキーマ検証・GRAPH / Dirs-Tree との整合性検証
- 破壊的変更を防ぐスクリプト安全策の設計 -->

### Step 5: verify

5つの整合性（正典 RFC／GRAPH／Dirs-Tree／実装／テスト）を検証スクリプトと AI の厳格な解析で検査せよ。検査を完全に突破できるまで Step 2 に戻って修正を繰り返せ（ブロッキングループ）。

<!-- ? ここに詳細を書く:
- 5つの整合性それぞれの検査項目・合格基準
- 実行する検証スクリプト群と AI による解析の視点
- 検査を突破できない場合に Step 2 へ戻す条件・ループ制御・報告方法 -->
