---
ticket_id: 89
title: make-ticket Step3 スクリプト化 — ensure-tickets-json.js + resolve-ticket-context.js
slug: make-ticket-step3-ensure-tickets-jsonjs-resolve-ticket-contextjs
status: made
created_at: 2026-07-13
updated_at: 2026-07-13
---

# make-ticket Step3 スクリプト化 — `ensure-tickets-json.js` + `resolve-ticket-context.js`

## Summary

現在 `make-ticket.md` の Step 3〜3a で手続き的（テキスト記述）に行われている Tickets.json の存在確認・作成、およびパイプライン情報変数（`$TICKET_KEY` / `$DOC_PATH` / `$GRAPH_PATH` / `$DIRS_TREE_PATH`）の確定処理を、2つの専用スクリプトに置き換え、AI がテキスト解釈ではなくスクリプトの構造化出力に従って分岐できるようにする。

**スクリプト1: `ensure-tickets-json.js`**
- Tickets.json の存在を保証（存在確認 → なければテンプレート作成 + PX フェーズ作成）
- stdout に機械的に解析可能な JSON を出力

**スクリプト2: `resolve-ticket-context.js`**
- 引数（`$ARGUMENTS` や `$TICKET_KEY`）と Tickets.json から、必要な変数を一括確定
- パイプライン情報の有無を判定し、利用可能な情報と不足情報を構造化出力
- stdout の指示に従って AI が分岐する

## Background

### 現状の問題

| 問題 | 詳細 |
|------|------|
| **分岐がテキスト依存** | Step 3 の分岐A/B（Tickets.json 有無）をAIが自然言語で解釈する。機械的に検証できない |
| **変数確定が2段階** | `$TICKET_KEY` を Step 3 で確定 → `$DOC_PATH` 等を Step 3a で確定。分散していて追跡しづらい |
| **変数名の突然出現** | `$TICKET_KEY` が Step 7 で突然使われる（定義は add-ticket.js の出力から「保持する」のみ） |
| **文脈が Step 4-5 に反映されない** | パイプライン情報の有無で調査範囲が変わるはずだが、Step 4-5 は常に同一のテキスト |
| **深掘りと新規作成で重複** | 変数確定ロジックが新規作成と深掘りで重複記述されている |

### 解決後の理想フロー

```
1. ensure-tickets-json.js          → Tickets.json 保証 + PX phase 保証
   ↓ { exists: true, ticketKey: "PX-52", ... }

2. resolve-ticket-context.js        → 全変数一括確定 + パイプライン有無判定
   ↓ { ticketKey, docPath, graphPath, dirsTreePath, pipelineAvailable, ... }
   ↓ stdout が「何があって何がなく、どう対応するか」を指示

3. AI はスクリプトの構造化出力に従って分岐
   ├ pipelineAvailable: true  → Step 4: グラフ探索＋ノード調査
   │                           Step 7: 機械的書き込み実行
   └ pipelineAvailable: false → Step 4: スポット調査のみ（従来通り）
                                 Step 7: 静かにスキップ
```

### 関連する PX-49/50/51 との関係

| チケット | 成果物 | PX-52 との関係 |
|---------|--------|--------------|
| PX-49 | `resolve-spec-path.js` 共通モジュール | `resolve-ticket-context.js` から import して使用 |
| PX-50 | `dump-node-context-to-spec.js` | Step 7-2 で呼び出される（本チケットの改修には影響しない） |
| PX-51 | `make-ticket.md` Step 7 拡張 | **本チケットで Step 3-3a を置き換える。Step 7 の内容自体は PX-51 のまま維持** |

## Scope

### 新規スクリプト: `ensure-tickets-json.js`

**引数**: `--dir=<path>`（Tickets.json を配置するディレクトリ、デフォルトは CWD）  
**出力**: stdout に JSON

```json
{
  "success": true,
  "path": "/path/to/Tickets.json",
  "existed": true,
  "phase": "PX",
  "instruction": "Tickets.json は既に存在します。次に resolve-ticket-context.js を実行してください。"
}
```

存在しなかった場合:
```json
{
  "success": true,
  "path": "/path/to/Tickets.json",
  "existed": false,
  "phase": "PX",
  "instruction": "Tickets.json を作成しました（PX phase 含む）。add-ticket.js でチケットを追加してください。"
}
```

**内部処理**:
1. `Tickets.json` が存在するか確認
2. 存在する → `existed: true` を返す
3. 存在しない → `write-tickets-json-template.js` でスケルトン生成 → `add-px-phase.js` で PX フェーズ作成 → `existed: false` を返す

### 新規スクリプト: `resolve-ticket-context.js`

**引数**: `--tickets=<path> [--ticket-key=<key>]`  
**出力**: stdout に JSON

```json
{
  "success": true,
  "ticketKey": "PX-52",
  "ticketKeySource": "argument",
  "docPath": "/path/to/RFC-ROOT.md",
  "docPathSource": "metadata.source",
  "graphPath": "/path/to/RFC-ROOT-GRAPH.json",
  "dirsTreePath": "/path/to/RFC-ROOT-Dirs-Tree.json",
  "pipelineAvailable": true,
  "available": ["ticketKey", "docPath", "graphPath", "dirsTreePath"],
  "missing": [],
  "instruction": "パイプライン情報が全て揃っています。Step 7 で機械的書き込みを実行できます。Step 4 ではグラフのノード情報を活用した調査を行ってください。"
}
```

パイプライン情報がない場合:
```json
{
  "success": true,
  "ticketKey": "PX-52",
  "ticketKeySource": "argument",
  "docPath": "",
  "docPathSource": "none",
  "graphPath": "",
  "dirsTreePath": "",
  "pipelineAvailable": false,
  "available": ["ticketKey"],
  "missing": ["docPath", "graphPath", "dirsTreePath"],
  "instruction": "パイプライン情報がありません（スポットチケット）。Step 7 はスキップしてください。Step 4 はスポット調査のみで構いません。"
}
```

`--ticket-key` 未指定の場合:
```json
{
  "success": true,
  "ticketKey": "",
  "ticketKeySource": "unset",
  "pipelineAvailable": false,
  "available": [],
  "missing": ["ticketKey"],
  "instruction": "チケットキーが未設定です。add-ticket.js でチケットを追加した後、本スクリプトを再実行してください。"
}
```

**内部処理**:
1. `--ticket-key` が指定されていれば `$TICKET_KEY` として使用
2. Tickets.json の `metadata.source` から `$DOC_PATH` を取得
3. `$DOC_PATH` から `$GRAPH_PATH` / `$DIRS_TREE_PATH` を導出
4. 3ファイルの実在確認
5. `instruction` フィールドに AI が次に行うべきアクションを機械的に生成

`resolveSpecPath` は PX-49 の共通モジュール `scripts/lib/resolve-spec-path.js` を import して使用する。

### make-ticket.md の改修内容

**Step 3 を以下のように置き換え:**

```markdown
#### Step 3: Tickets.json の保証とコンテキスト解決

```bash
# (1) Tickets.json の存在を保証
node .claude/scripts/tickets/ensure-tickets-json.js --dir=.

# 出力の instruction に従う（existed=true なら次へ、false なら add-ticket.js を実行してから次へ）
```

`ensure-tickets-json.js` が Tickets.json を保証した後、`add-ticket.js` でチケットを追加する:

```bash
# (2) チケットを追加
echo '{"title":"タイトル","referenceSection":"spec/0042-type-defs.md"}' | node ".claude/scripts/tickets/add-ticket.js" "Tickets.json" "PX"

# 出力の ticketKey を保持する
```

```bash
# (3) コンテキスト変数を一括確定（--ticket-key は省略可能。
#     省略時は available/missing で add-ticket 後再実行を指示される）
node .claude/scripts/tickets/resolve-ticket-context.js \
  --tickets=Tickets.json \
  --ticket-key=$TICKET_KEY
```

`resolve-ticket-context.js` の出力の `instruction` フィールドに従い、以下の変数が利用可能になる:

- `$TICKET_KEY` — チケットキー
- `$DOC_PATH` — 設計書パス（パイプライン情報がない場合は空文字列）
- `$GRAPH_PATH` / `$DIRS_TREE_PATH` — 同上
- `$PIPELINE_AVAILABLE` — パイプライン情報有無の真理値
```

**Step 4 を文脈対応に改修:**

```markdown
#### Step 4: ソースコード調査

`$PIPELINE_AVAILABLE` の値によって調査範囲が変わる:

- **`$PIPELINE_AVAILABLE=true`**: GRAPH.json のノード情報を活用し、グラフ上の依存関係を
  考慮した調査を行う。`$DOC_PATH`（RFC）を参照して設計意図を確認する。
- **`$PIPELINE_AVAILABLE=false`**: スポット調査。引数や会話から得られた情報をもとに
  ソースコードを調査する（従来通り）。
```

**Step 3a は削除**（`resolve-ticket-context.js` に統合されたため）。

**Step 7 の先頭条件を `$PIPELINE_AVAILABLE` で判定:**

```markdown
#### Step 7: 設計コンテキストの spec 自動書き起こし

`$PIPELINE_AVAILABLE` が true の場合のみ実行する。false の場合は静かにスキップする。
（`$GRAPH_PATH` / `$DIRS_TREE_PATH` / `$TICKET_KEY` / `$DOC_PATH` は
resolve-ticket-context.js で既に確定済み）
```

**深掘りワークフローも同様に簡略化:**

深掘り時も `$TICKET_KEY` は `$ARGUMENTS` そのものであり、`ensure-tickets-json.js` + `resolve-ticket-context.js` は新規作成と全く同じ手順で実行する。

### 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `.claude/scripts/tickets/ensure-tickets-json.js` | ✨ 新規 | Tickets.json 存在保証スクリプト |
| `.claude/scripts/tickets/resolve-ticket-context.js` | ✨ 新規 | コンテキスト変数一括確定スクリプト |
| `.claude/commands/make-ticket.md` | 🔧 修正 | Step 3/3a/4 を上記の通り置き換え。深掘りも同様に改修 |
| `tests/ensure-tickets-json.test.cjs` | ✨ 新規 | テスト |
| `tests/resolve-ticket-context.test.cjs` | ✨ 新規 | テスト |

### 変更しないもの

- Step 1-2, 5-6, 8-11（新規作成）— 変更不要
- Step 7 の実行コマンド自体（PX-51 の成果をそのまま維持）
- 深掘りの Step 1-2, 3-4, 10（Step 1 の後に変数確定が入るのみ）
- `dump-ticket-graph-commands.js` / `dump-node-context-to-spec.js` / `resolve-spec-path.js`
- 既存の Tickets.json スキーマ

## Non-scope

- PX-49/50/51 の成果物の修正は含めない
- `add-ticket.js` / `add-px-phase.js` / `write-tickets-json-template.js` の改修は含めない
- スクリプトの `node:test` 以外のテストフレームワーク導入は含めない

## Investigation

### 現状の make-ticket.md Step 3 の課題

現行の Step 3 は以下の手続きをテキストで記述している:

1. Tickets.json の存在確認 → 分岐A（存在） / 分岐B（不在）
2. 分岐A: `list-phases-and-tickets.js` → `add-ticket.js` → `$TICKET_KEY` 保持
3. 分岐B: `write-tickets-json-template.js` → `add-px-phase.js` → `add-ticket.js` → `$TICKET_KEY` 保持
4. Step 3a: `metadata.source` から `$DOC_PATH` / `$GRAPH_PATH` / `$DIRS_TREE_PATH` 確定

問題:
- 分岐A/B の判断は AI のテキスト解釈に依存している
- `$TICKET_KEY` は「保持する」と書かれているだけで、後続で使う変数として明示されていない
- Step 3 と Step 3a の間に依存関係があるのに独立したステップとして記述されている
- 深掘りでも同様のロジックが別途記述されている（DRY違反）

### 解決方法の擬似コード

**ensure-tickets-json.js:**
```javascript
function main() {
  const dir = parseArgument() || '.';
  const ticketsPath = path.join(dir, 'Tickets.json');
  
  if (fs.existsSync(ticketsPath)) {
    // exist: true, instruction: "次へ"
    console.log(JSON.stringify({ success: true, path: ticketsPath, existed: true, ... }));
    return;
  }
  
  // 存在しない: テンプレート生成 + PX phase作成
  runScript('write-tickets-json-template.js', ...);
  runScript('add-px-phase.js', ...);
  console.log(JSON.stringify({ success: true, path: ticketsPath, existed: false, ... }));
}
```

**resolve-ticket-context.js:**
```javascript
function main() {
  const ticketsPath = parseTicketsArg();
  const ticketKey = parseTicketKeyArg(); // optional
  const tickets = loadJson(ticketsPath);
  
  const docPath = tickets.metadata?.source || '';
  const graphPath = docPath ? deriveGraphPath(docPath) : '';
  const dirsTreePath = docPath ? deriveDirsTreePath(docPath) : '';
  
  const graphExists = graphPath ? fs.existsSync(graphPath) : false;
  const dirsExists = dirsTreePath ? fs.existsSync(dirsTreePath) : false;
  const docExists = docPath ? fs.existsSync(docPath) : false;
  
  const pipelineAvailable = !!(ticketKey && docPath && docExists && graphExists && dirsExists);
  
  const available = [];
  const missing = [];
  if (ticketKey) available.push('ticketKey'); else missing.push('ticketKey');
  if (docPath && docExists) available.push('docPath'); else missing.push('docPath');
  // ... etc
  
  // Instruction: AI が次に何をすべきか
  let instruction = '';
  if (!ticketKey) instruction = 'add-ticket.js でチケットを追加し、--ticket-key を指定して再実行してください。';
  else if (pipelineAvailable) instruction = 'パイプライン情報が全て揃っています。Step 7 を実行してください。';
  else instruction = 'パイプライン情報が不足しています（スポットモード）。Step 7 はスキップしてください。';
  
  console.log(JSON.stringify({ success: true, ticketKey, docPath, graphPath, dirsTreePath, pipelineAvailable, available, missing, instruction }));
}
```

## Test Plan

### ユニットテスト計画

**ensure-tickets-json.test.cjs:**

1. **正常系: Tickets.json が既に存在する場合 → `existed: true`**
   - 既存の Tickets.json があるディレクトリで実行し、変更がないことを確認

2. **正常系: Tickets.json が存在しない場合 → テンプレート作成 + `existed: false`**
   - 空のテンポラリディレクトリで実行し、Tickets.json と PX phase が作成されることを確認

**resolve-ticket-context.test.cjs:**

1. **正常系: 全パイプライン情報が揃っている場合 → `pipelineAvailable: true`**
   - `metadata.source` を持つ Tickets.json + 実在する GRAPH.json + Dirs-Tree.json で確認

2. **正常系: `metadata.source` がない場合 → `pipelineAvailable: false`**
   - `metadata.source` を持たない Tickets.json で確認

3. **正常系: `--ticket-key` 未指定の場合 → `missing: ["ticketKey"]`**
   - キーなしで実行し、instruction が add-ticket を促すことを確認

### ユニットテスト不可能な項目（例外）

- 該当なし（全ロジックはファイルI/O を含めてモック可能）

## Boy Scout Rule — 翻訳可能性計画

- `ensure-tickets-json.js` と `resolve-ticket-context.js` は新規スクリプトのため、最初から翻訳可能性を確保して記述する
- 関数名は動詞句（`ensureTicketsJson`, `resolveTicketContext`, `determinePipelineAvailability`）
- stdout の JSON には `instruction` フィールドを含め、AI が次に何をすべきか機械的に判断できるようにする

## Acceptance Criteria

- [x] 実装要件を満たしている
- [ ] `ensure-tickets-json.js` が Tickets.json 不在時にテンプレート + PX phase を自動作成する
- [ ] `resolve-ticket-context.js` が `$TICKET_KEY` / `$DOC_PATH` / `$GRAPH_PATH` / `$DIRS_TREE_PATH` を一括確定する
- [ ] 出力の `instruction` フィールドに AI が次に行うべきアクションが機械的に記述されている
- [ ] `pipelineAvailable` が正確に判定される（全ファイル存在 / 一部欠落 / 完全不在）
- [ ] make-ticket.md の Step 3/3a/4 が上記スクリプトを使った構造化フローに置き換わっている
- [ ] 深掘りワークフローも同様のスクリプト利用に統一されている
- [ ] Step 7 の条件判定が `$PIPELINE_AVAILABLE` で行われるようになっている
- [ ] 既存の PX-49/50/51 のテストが全件 PASS する
- [ ] 翻訳可能性の検証が通っている

## Notes

### 依存関係

- **PX-49** (依存): `scripts/lib/resolve-spec-path.js` を `resolve-ticket-context.js` から import して使用する
- **PX-51** (依存なし): `make-ticket.md` の Step 7 は PX-51 の成果をそのまま維持する。本チケットでは Step 3〜3a〜4 のみを改修する

### パイプライン全体における位置づけ

```
ensure-tickets-json.js  →  Tickets.json 保証
       ↓
add-ticket.js           →  チケット追加（$TICKET_KEY 確定）
       ↓
resolve-ticket-context.js →  $DOC_PATH/$GRAPH_PATH/$DIRS_TREE_PATH 一括確定
       │                      $PIPELINE_AVAILABLE 判定
       │                      instruction 発行
       ↓
AI が instruction に従って分岐:
  ├ pipelineAvailable=true  → Step 4: グラフ活用調査 → Step 7: 機械的書き込み
  └ pipelineAvailable=false → Step 4: スポット調査   → Step 7: スキップ
```

### 設計判断

- `instruction` フィールドは「AI 自由記述」ではなく「条件分岐の機械的生成」とする。例: "ticketKey 未設定" → "add-ticket.js で追加後再実行" / "全情報揃っている" → "Step 7 実行可能"。これにより決定論性を確保する
- 新規作成と深掘りで同一スクリプトを使い回すことで、変数確定ロジックの重複を排除する
- Step 4 の文脈分岐は `$PIPELINE_AVAILABLE` という単一の真理値で制御する。複雑な条件分岐はスクリプト側に閉じ込める
