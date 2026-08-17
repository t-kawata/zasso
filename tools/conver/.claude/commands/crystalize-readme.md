---
description: RFC のグラフからユーザー向け使い方 README（または RESIDUE）を生成する。
argument-hint: </path/to/*-GRAPH.json>
allowed-tools: Read, Write, Bash
disable-model-invocation: true
---

# /crystalize-readme <graph-path>

**Role**: RFC のグラフ（`*-GRAPH.json`）を入力として、ユーザー向けの「使い方 README」を生成する。README が書けない場合は、その理由（実装漏れ・不足・矛盾）を `residues/RESIDUE-<timestamp>.md` に記録する。

## Language Protocol

| Context | Language | Reason |
|---------|----------|--------|
| Chat, proposals, explanations | **Japanese** | Japanese is mandatory **ONLY** when addressing the user directly. |
| Code comments | **English** | Must be written in the language AI understands most reliably. |
| Design docs, plans, tasks | **English** | Must be written in the language AI understands most reliably. |
| Runtime logs (`log::info!`, etc.) | **English** | International debugging environment and searchability |
| Everything else, i.e. any context where you are not speaking to the user | **English** | Must be written in the language AI understands most reliably. |

## Arguments

- **第 1 引数（必須）**: グラフ JSON のパス（絶対または相対）
  - 例: `crates/siprs/RFC-ROOT-GRAPH.json`
  - 例: `/absolute/path/to/rfc-doc-GRAPH.json`

## Derived Paths

以下のパスはグラフの `sourceFile` フィールドから機械的に導出される（`derive-output-paths.js`）。

```bash
sourceFile="$(node .claude/scripts/crystalize-readme/derive-output-paths.js --graph=<graphPath> --field=sourceFile)"
rfcDir="$(dirname "$sourceFile")"
examplesDir="$rfcDir/examples"
residuesDir="$rfcDir/residues"
readmePath="$rfcDir/README.md"
residuePath="$residuesDir/RESIDUE-<YYYYMMDDhhmmss>.md"
```

| パス | 値 |
|------|----|
| `rfcDir` | `sourceFile` の親ディレクトリ |
| `examplesDir` | `<rfcDir>/examples/` |
| `residuesDir` | `<rfcDir>/residues/` |
| README 候補 | `<rfcDir>/README.md` |
| RESIDUE 候補 | `<residuesDir>/RESIDUE-<YYYYMMDDhhmmss>.md` |

## Execution Steps

### Step 0: 引数検証・パス導出（決定論）

```bash
node .claude/scripts/crystalize-readme/validate-graph-arg.js --graph="$ARGUMENTS" || exit 2
node .claude/scripts/crystalize-readme/derive-output-paths.js --graph="$ARGUMENTS"
```

- グラフのスキーマ（nodes / edges / sourceFile）と `sourceFile` の実在を検証する。
- 検証失敗時はエラーメッセージを表示して終了する（exit 2）。

### Step 1: グリル — 階層的見出し（目次）

README の目次（階層的見出し）を確定する。

1. **候補抽出（決定論）**: `extract-toc-candidates.js` でグラフのノード階層から見出し候補を抽出する。
2. **AI による編成（非決定論）**: 候補を土台に、AI が目次の取捨・階層・見出し文を合成する。
3. **構造チェック（決定論）**: `check-toc-structure.js` で目次案を検証する。
   - 見出しの重複がない / 階層が整合的 / グラフの主要セクションを網羅 / 末尾が「examples（実装サンプル）の仕様と設計」
   - 不合格なら AI が自動修正を試み、修正後も不合格なら再提案として扱う。
4. **ユーザー承認**: ユーザーは **Yes/No または ABC の選択のみ**で回答する。自由記述を要求しない。
   - 例: `この目次で進めますか? Y / N / A / B / C`
   - 承認された目次はステータスファイルに記録し、以降の Step で参照する。

### Step 2: グリル — examples（実装サンプル）の仕様と設計

README 末尾セクション「examples（実装サンプル）の仕様と設計」の内容を確定する。

1. **候補抽出（決定論）**: グラフから examples 関連ノード（実装サンプルを示す kind）を抽出して AI に提示する。
2. **AI による合成（非決定論）**: AI が examples の仕様と設計（各サンプルが示す使い方・API 表面・期待動作）を合成する。
3. **構造チェック（決定論）**: `validate-examples-spec.js` で合成結果の構造・参照整合を検証する。

### Step 3: 分岐判定（決定論）

```bash
node .claude/scripts/crystalize-readme/check-readme-writable.js --graph=<graphPath>
# exit 0 → (a) README 系統 / exit 1 → (b) RESIDUE 系統
```

(a) README が書けると判定されるのは以下を**すべて**満たす場合:

1. グラフの機械検証が通過する（`uncoveredHeadings = []`、`isolatedNodes = []`、`unresolvableRefs = []`）
2. 未解決の OMISSIONS インベントリが存在しない
3. `examples/` が実在し、グラフが参照するサンプル実装がすべて実在する
4. グリルで確定した目次・examples 仕様が整合している

いずれかを満たさない場合は (b) RESIDUE へ。判定理由は RESIDUE に記録する。

### Step 4: 出力生成と検証

- **(a)** `<rfcDir>/README.md` を生成する。末尾セクションは必ず「examples（実装サンプル）の仕様と設計」。
- **(b)** `<residuesDir>/RESIDUE-<YYYYMMDDhhmmss>.md` を生成する。既存の OMISSIONS インベントリ（例: `OMISSIONS-*.md`）があれば雛形として投入する。
- 生成後、`validate-readme-output.js` / `validate-residue-output.js` で出力構造を検証し、不合格なら AI が修正する。

## Scripts

使用するスクリプトは `.claude/scripts/crystalize-readme/` に配置される（設計書 `tools/conver/docs/DESIGN-OF-CRYSTALIZE-README.md` §8 参照）。

- `validate-graph-arg.js` / `derive-output-paths.js` / `extract-toc-candidates.js` / `check-toc-structure.js` / `validate-examples-spec.js` / `check-readme-writable.js` / `generate-residue-filename.js` / `validate-readme-output.js` / `validate-residue-output.js`
- ステップ進行は `update-step-status.js`（既存パターン）で管理する。

## 設計原則

決定論的に実行できることはスクリプトで実行し、AI にできるだけ考えさせない。一方、AI による非決定論的思考が必要な箇所（目次・examples 仕様・本文の合成）まで無理に決定論的に設計しない。
