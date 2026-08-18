---
description: RFC のグラフからユーザー向け使い方 README を生成する（セクション単位の点検ループ方式）。
argument-hint: </path/to/*-GRAPH.json>
allowed-tools: Read, Write, Bash
disable-model-invocation: true
---

# /crystalize-readme <graph-path>

**Role**: RFC のグラフ（`*-GRAPH.json`）を入力として、ユーザー向けの「使い方 README」を生成する。README の各セクションは、**そのセクションに記載する使い方に従って完全に動作する実装が現状で成立しうるか**をセクション単位で判断して「完全記述」か「残渣記述」に確定する。書けないセクションは `<::README-RESIDUE::>`（examples は `<::EXAMPLES-RESIDUE::>`）マーカーとともに、危険・漏れ・矛盾・不足の具体的証拠と実装補強設計を README.md 内に記録する。RESIDUE は「書けない理由のメモ」ではなく、**README と examples 実装を完全なものにするための実装用チケットを作成する情報源**として、厳格かつ厳密に記述する（将来 `/drill-rfc-down` によりチケット化される）。独立した RESIDUE ファイルは生成しない。

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

## Preflight: パス導出と実行モード判定（決定論）

`derive-output-paths.js` を実行し、グラフ JSON の読込・構造検証（nodes / edges / `sourceFile` フィールド）と **`sourceFile` の実在チェック**を同時に行い、出力パスを導出する。さらに **`README.md` / `CRYSTALIZE-Status.json` の実在**から実行モードを判定する。

```bash
node .claude/scripts/crystalize-readme/derive-output-paths.js --graph="$ARGUMENTS" || exit 1
```

- グラフが読めない / 構造が不正 / `sourceFile` が実在しない場合はエラーメッセージを表示して終了する（exit 1）。
- 成功時は英語の Markdown を出力する。`Mode` とパス群・存在フラグを以降の Step の前提とする。
- **モード判定**: `README.md` または `CRYSTALIZE-Status.json` が実在 → **`refine`**（過去に `/crystalize-readme` を実行済み。今回の実行は洗練・更新）、両方なし → **`fresh`**（まっさらから新規）。

出力例（fresh）:

```markdown
## crystalize-readme Preflight

**Mode: fresh** — No previous run was detected (no README.md or CRYSTALIZE-Status.json). This execution will start from scratch.

| Path | Value |
|------|-------|
| sourceFile | /path/to/rfc/RFC-ROOT.md |
| rfcDir | /path/to/rfc |
| examplesDir | /path/to/rfc/examples |
| readmePath | /path/to/rfc/README.md |

- sourceFile exists: yes
- README.md exists: no
- CRYSTALIZE-Status.json exists: no
```

出力例（refine）:

```markdown
## crystalize-readme Preflight

**Mode: refine** — A previous /crystalize-readme run was detected (README.md and/or CRYSTALIZE-Status.json exists). This execution will refine and update the existing artifacts.

| Path | Value |
|------|-------|
| sourceFile | /path/to/rfc/RFC-ROOT.md |
| rfcDir | /path/to/rfc |
| examplesDir | /path/to/rfc/examples |
| readmePath | /path/to/rfc/README.md |

- sourceFile exists: yes
- README.md exists: yes
- CRYSTALIZE-Status.json exists: yes
```

| パス | 説明 |
|------|------|
| `sourceFile` | グラフの生成元 RFC 文書（Preflight で実在を確認済み）。Step 0 の読込対象 |
| `rfcDir` | 元 RFC 文書が置かれているディレクトリ |
| `examplesDir` | `<rfcDir>/examples/`。examples（実装サンプル）の置き場 |
| `readmePath` | `<rfcDir>/README.md`。README の出力先 |

## マーカー分類（単一情報源: `validate-marker-grammar.js`）

| セクション種別 | 作業単位（未処理） | 残渣（書けない） |
|---|---|---|
| 使い方セクション | `<::TEMPLATE-README::>` | `<::README-RESIDUE::>` |
| examples セクション | `<::TEMPLATE-EXAMPLES::>` | `<::EXAMPLES-RESIDUE::>` |

## Workflow Steps

### Step 0: sourceFile の読込

Preflight が出力した `sourceFile` のファイルを読む。

- 読み取った内容は **Step 1（目次グリル）の前提情報**として使用する。
- この Step が完了するまで Step 1 以降に進まない。

### Step 1: グリル — 階層的見出し（目次）

README の目次（階層的見出し）を確定する。Step 0 で読み込んだ `sourceFile` の内容を前提情報として使用する。

**方針**: 「使い方に絞った README の目次」を提案する。技術的詳細内容には踏み込まない。全ての見出しに**階層パス ID（H1, H1-1, H1-2, H1-2-1, H2, H2-1, ...）**を採番する。ID は階層パスであり、**親 = 最後の `-<n>` を除去**して導出する（`H1-2-1` の親は `H1-2`）。**子は親の後にのみ存在でき、親不在の ID（H2 無しの H2-1）は構造違反**として拒否される。

1. **見出し提案（非決定論）**: AI が `sourceFile` を前提に、使い方に絞った目次の各見出しを合成する。各見出しは `{id, heading, contentOptions[], recommendation, reason, existingIds}` の形で、A/B/C または Yes/No で回答できる「内容の提案」を伴う。`existingIds` は既存ノード ID 全体（親が存在することを示す）。各提案には **AI の推奨とその理由**を明示する。
2. **検証ゲート（決定論・必須）**: 各提案は**ユーザーへ提示する前に必ず** `validate-toc-proposal.js` で検証する。`valid:true` になるまで再構成し、未検証の提案は提示しない。

```bash
echo '{"id":"H1-1","heading":"アカウントの追加","contentOptions":["add_account() と register() を呼ぶコード","SipAccountHandle 経由で登録状態を確認するコード","set_registration_enabled() で動的に登録を切り替えるコード"],"recommendation":"add_account() と register() を呼ぶコード","reason":"アカウント追加は最も基本的な操作であり、先に最小のコードを示すのが効果的なため","existingIds":["H1"]}' | node .claude/scripts/crystalize-readme/validate-toc-proposal.js || exit 1
```

- 提案 JSON の全フィールド: `id`（階層パス ID。親 = 最後の `-<n>` を除去）/ `heading`（見出しタイトル）/ `contentOptions`（A/B/C または Yes/No の選択肢 2〜4 件）/ `recommendation`（推奨する選択肢）/ `reason`（推奨理由）/ `existingIds`（既存ノード ID 全体。親が含まれること）。
- 上記は実際の crate（siprs）の公開 API（`add_account` / `register` / `SipAccountHandle` 等）に基づく**生きた例**。AI も同様に、対象 RFC / `sourceFile` の実 API と使い方に即した具体的な内容で提案を組み立てること。
- 見出し・選択肢・理由の**内容は日本語**で記述する。

3. **提案の記録**: 検証を通過した提案 JSON を `propose-heading` で CRYSTALIZE-Status.json に記録する。

```bash
echo '<proposal-json>' | node .claude/scripts/crystalize-readme/update-step-status.js --graph="$ARGUMENTS" propose-heading
```

4. **ユーザー回答**: ユーザーは **ID 単位で A/B/C/Yes/No で回答**する。自由コメントも可（受け付けるが、確定には ID 単位の回答が必要）。
5. **確定記録**: 回答ごとに、確定した内容を `confirm-heading` で記録する。`confirmedContent` は選んだ選択肢の内容。

```bash
echo '{"id":"H1-1","confirmedContent":"add_account() と register() を呼ぶコード"}' | node .claude/scripts/crystalize-readme/update-step-status.js --graph="$ARGUMENTS" confirm-heading
```

6. **完了条件**: 全ての見出し項目と内容が確定するまで次に進まない。提案修正と再提案を繰り返し全て確定するまで続ける。全ノード確定後、`end-step 1` で Step 1 を完了する。**末尾の見出しは必ず「Examples（implementation samples）spec and design」**とする。

7. **雛形出力（Step 1 の最後・決定論）**: 確定した見出し群 + examples セクションをスクリプトにより機械的に README.md へ雛形出力する。各使い方セクションには `<::TEMPLATE-README::>`、examples セクションには `<::TEMPLATE-EXAMPLES::>` のマーカーが自動付与される。

```bash
node .claude/scripts/crystalize-readme/emit-readme-skeleton.js --graph="$ARGUMENTS" --readme=<rfcDir>/README.md
```

- **refine モード安全**: 未解決の `<::TEMPLATE-*::>` マーカーを含む既存 README.md は上書きを拒否する（exit 1）。
- この Step が完了するまで Step 2 に進まない。

### Step 2: セクション単位の点検ループ

確定した見出し群の各セクションを「完全記述」または「残渣記述」へ遷移させるループ。**判断はセクション単位**でなければならない。

**エントリー判断（決定論・必須）**: まずチケットリストを表示し、src 内のどこを読むべきかのエントリーを特定する。チケットキー（PX-1xx など）が分かれば `specs/<ticket>.md` で設計 spec を確認できる。

```bash
node .claude/scripts/tickets/list-phases-and-tickets.js Tickets.json
```

ループ本体:

1. **ループ状態確認（決定論）**: `loop-drive-readme.js` で未解決セクション（`<::TEMPLATE-README::>` 残存）を一覧する。

```bash
node .claude/scripts/crystalize-readme/loop-drive-readme.js --readme=<rfcDir>/README.md --list
```

2. **実装の解析（証拠必須）**: 各 `<::TEMPLATE-README::>` セクションについて、セクションの内容に対応するチケットキーを特定し、`specs/<ticket>.md` → src の実装を解析する。「README のそのセクションに書かれる内容が**漏れ・矛盾・不足のない完全に動作する実装**として完了しているか」を厳しく点検する。証拠のない判断は禁止。
3. **判定（セクション単位・非決定論）**: 「**確実に正確に動作することを保証できる README（使い方だけを記述し、内部の技術詳細には踏み込まない）**」が「書けるか書けないか」をセクション単位で判断する。
   - **「書ける」** → 完全な記述を書き上げ、`<::TEMPLATE-README::>` マーカーを削除する（`resolve-section` で CRYSTALIZE-Status.json も complete 化）。
   - **「書けない」** → 「危険・漏れ・矛盾・不足」の**具体的証拠**と**どう実装補強しなければならないか**を極めて具体的且つ説明的に記述し、`<::TEMPLATE-README::>` を消して `<::README-RESIDUE::>` に置換する（`mark-residue` で CRYSTALIZE-Status.json も residue 化）。

```bash
echo '{"id":"H1-1","heading":"アカウントの追加"}' | node .claude/scripts/crystalize-readme/update-step-status.js --graph="$ARGUMENTS" resolve-section
echo '{"id":"H1-2","heading":"通話"}' | node .claude/scripts/crystalize-readme/update-step-status.js --graph="$ARGUMENTS" mark-residue
```

4. **脱出条件（決定論）**: 全ての `<::TEMPLATE-README::>` マーカーに対して対応が完了したことをスクリプトが点検し、README.md が「完全記述セクション」と「残渣記述セクション」の **2 種類のみ**で構成されることを保証できた時のみループを抜ける。

```bash
node .claude/scripts/crystalize-readme/loop-drive-readme.js --readme=<rfcDir>/README.md --check
# exit 0 → ループ脱出 / exit 1 → 未解決セクションあり（ループ継続）
```

### Step 3: examples 専用 Step（ループ脱出後）

README 末尾セクション「Examples（implementation samples）spec and design」を確定する。`<::TEMPLATE-EXAMPLES::>` マーカーの解決はこの専用 Step の責務であり、Step 2 ループの完了チェックには含まれない。

1. **候補抽出（決定論）**: グラフから examples 関連ノード（実装サンプルを示す kind）を抽出して AI に提示する。
2. **AI による合成（非決定論）**: AI が examples の仕様と設計（各サンプルが示す使い方・API 表面・期待動作）を合成する。
3. **構造チェック（決定論）**: `validate-examples-spec.js` で合成結果の構造・参照整合を検証する。
4. **確定（セクション単位）**: 確実に動作する examples の記述が書ける場合は完全記述で `<::TEMPLATE-EXAMPLES::>` を削除する。書けない場合は証拠 + 実装補強設計を記述し、`<::TEMPLATE-EXAMPLES::>` を `<::EXAMPLES-RESIDUE::>` に置換する。

### Step 4: 出力検証（決定論）

```bash
node .claude/scripts/crystalize-readme/validate-readme-output.js --readme=<rfcDir>/README.md
```

- `<::TEMPLATE-*::>` が **0 個**で、全セクションが「完全記述」または「残渣記述」のどちらかであり、末尾セクションが「Examples（implementation samples）spec and design」であることを検証する。
- 不合格なら AI が修正し、再検証する。

## Scripts

使用するスクリプトは `.claude/scripts/crystalize-readme/` に配置される（設計書 `tools/conver/docs/DESIGN-OF-CRYSTALIZE-README.md` §8 参照）。

- Preflight: `derive-output-paths.js`（グラフ読込・`sourceFile` 実在チェック・パス導出。`validate-graph-arg.js` の `readGraphFile` を内部利用）
- マーカー文法: `validate-marker-grammar.js`（4 マーカーの単一情報源 + `splitSections` / `validateMarkerGrammar`）
- 雛形出力: `emit-readme-skeleton.js`（Step 1 末。確定見出し群 + examples を README.md に機械出力）
- ループ駆動: `loop-drive-readme.js`（**独立した**新規スクリプト。`--list` / `--check`、`resolveSection` / `markResidue`）
- グリル / 状態管理: `validate-toc-proposal.js` / `update-step-status.js`（`propose-heading` / `confirm-heading` / `delete-heading` / `reset-toc` / `resolve-section` / `mark-residue` 等）/ `validate-examples-spec.js`
- 出力検証: `validate-readme-output.js`（マーカー文法 + 末尾 examples セクション）
- ステップ進行は `update-step-status.js`（既存パターン）で管理する。

## 設計原則

決定論的に実行できることはスクリプトで実行し、AI にできるだけ考えさせない。一方、AI による非決定論的思考が必要な箇所（目次・examples 仕様・本文の合成・セクションの書ける/書けない判定）まで無理に決定論的に設計しない。判断はセクション単位とし、マーカー遷移（`<::TEMPLATE-README::>` → 完全記述 or `<::README-RESIDUE::>`）は機械的に検証可能な状態遷移として設計する。
