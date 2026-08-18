---
description: RFC のグラフからユーザー向け使い方 README（または RESIDUE）を生成する。
argument-hint: </path/to/*-GRAPH.json>
allowed-tools: Read, Write, Bash
disable-model-invocation: true
---

# /crystalize-readme <graph-path>

**Role**: RFC のグラフ（`*-GRAPH.json`）を入力として、ユーザー向けの「使い方 README」を生成する。README が書けるか否かは、**README に記載する使い方に従って完全に動作する examples 実装が、現状の実装で完全に成立しうるか**で判断する。書けない場合は、その実装漏れ・不足・矛盾を `residues/RESIDUE-<timestamp>.md` に記録する。RESIDUE は「書けない理由のメモ」ではなく、**README と examples 実装を完全なものにするための実装用チケットを作成する情報源**として、厳格かつ厳密に記述する（将来 `/drill-rfc-down` によりチケット化される）。

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

## Preflight: パス導出と sourceFile 実在チェック（決定論）

`derive-output-paths.js` を実行し、グラフ JSON の読込・構造検証（nodes / edges / `sourceFile` フィールド）と **`sourceFile` の実在チェック**を同時に行い、出力パスを導出する。

```bash
node .claude/scripts/crystalize-readme/derive-output-paths.js --graph="$ARGUMENTS" || exit 1
```

- グラフが読めない / 構造が不正 / `sourceFile` が実在しない場合はエラーメッセージを表示して終了する（exit 1）。
- 成功時は以下の JSON を出力する。このパス群と `sourceFile` を以降の Step の前提とする。

出力例:

```json
{"sourceFile":"/path/to/rfc/RFC-ROOT.md","rfcDir":"/path/to/rfc","examplesDir":"/path/to/rfc/examples","residuesDir":"/path/to/rfc/residues","readmePath":"/path/to/rfc/README.md"}
```

| パス | 説明 |
|------|------|
| `sourceFile` | グラフの生成元 RFC 文書（Preflight で実在を確認済み）。Step 0 の読込対象 |
| `rfcDir` | 元 RFC 文書が置かれているディレクトリ |
| `examplesDir` | `<rfcDir>/examples/`。examples（実装サンプル）の置き場 |
| `residuesDir` | `<rfcDir>/residues/`。RESIDUE 文書の置き場 |
| `readmePath` | `<rfcDir>/README.md`。README の出力先 |

## Workflow Steps

### Step 0: sourceFile の読込

Preflight が出力した `sourceFile` のファイルを読む。

- 読み取った内容は **Step 1（目次グリル）と Step 2（examples 仕様グリル）の前提情報**として使用する。
- この Step が完了するまで Step 1 以降に進まない。

### Step 1: グリル — 階層的見出し（目次）

README の目次（階層的見出し）を確定する。Step 0 で読み込んだ `sourceFile` の内容を前提情報として使用する。

**方針**: 「使い方に絞った README の目次」を提案する。技術的詳細内容には踏み込まない。全ての見出しに**階層的に一意な ID（H1, H2-1, H2-2, ...）**を採番する。

1. **見出し提案（非決定論）**: AI が `sourceFile` を前提に、使い方に絞った目次の各見出しを合成する。各見出しは `{id, heading, contentOptions[], recommendation, reason}` の形で、A/B/C または Yes/No で回答できる「内容の提案」を伴う。各提案には **AI の推奨とその理由**を明示する。
2. **検証ゲート（決定論・必須）**: 各提案は**ユーザーへ提示する前に必ず** `validate-toc-proposal.js` で検証する。`valid:true` になるまで再構成し、未検証の提案は提示しない。

```bash
echo '<proposal-json>' | node .claude/scripts/crystalize-readme/validate-toc-proposal.js || exit 1
```

3. **ユーザー回答**: ユーザーは **ID 単位で A/B/C/Yes/No で回答**する。自由コメントも可（受け付けるが、確定には ID 単位の回答が必要）。
4. **確定記録**: 回答ごとに `confirm-heading <id>` で確定を記録する。

```bash
node .claude/scripts/crystalize-readme/update-step-status.js --graph="$ARGUMENTS" confirm-heading <id>
```

5. **完了条件**: 全ての見出し項目と内容が確定するまで Step 2 に進まない。全 ID 確定後、`end-step 1` で Step 1 を完了し Step 2 へ進む。**末尾の見出しは必ず「examples（実装サンプル）の仕様と設計」**とする。

### Step 2: グリル — examples（実装サンプル）の仕様と設計

README 末尾セクション「examples（実装サンプル）の仕様と設計」の内容を確定する。Step 0 で読み込んだ `sourceFile` の内容を前提情報として使用する。

1. **候補抽出（決定論）**: グラフから examples 関連ノード（実装サンプルを示す kind）を抽出して AI に提示する。
2. **AI による合成（非決定論）**: AI が examples の仕様と設計（各サンプルが示す使い方・API 表面・期待動作）を合成する。
3. **構造チェック（決定論）**: `validate-examples-spec.js` で合成結果の構造・参照整合を検証する。

### Step 3: 分岐判定（決定論）

```bash
node .claude/scripts/crystalize-readme/check-readme-writable.js --graph="$ARGUMENTS"
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

- Preflight: `derive-output-paths.js`（グラフ読込・`sourceFile` 実在チェック・パス導出。`validate-graph-arg.js` の `readGraphFile` を内部利用）
- グリル / 判定 / 出力検証: `validate-toc-proposal.js` / `update-step-status.js`（`propose-heading` / `confirm-heading` / `reset-toc` 等）/ `validate-examples-spec.js` / `check-readme-writable.js` / `generate-residue-filename.js` / `validate-readme-output.js` / `validate-residue-output.js`
- ステップ進行は `update-step-status.js`（既存パターン）で管理する。

## 設計原則

決定論的に実行できることはスクリプトで実行し、AI にできるだけ考えさせない。一方、AI による非決定論的思考が必要な箇所（目次・examples 仕様・本文の合成）まで無理に決定論的に設計しない。
