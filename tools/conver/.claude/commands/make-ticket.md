---
description: 実装仕様（spec）の詳細文書の作成と詳細化。P{phaseID}-{ticketID} 形式のチケットキーが必須。show-ticket-context.js が最初に実行され状況を Markdown で表示する。
---

# /make-ticket

**役割**: 実装仕様（spec）の詳細文書の作成と詳細化。

## ワークフローにおける位置づけ

作業の流れは `make → plan → start → review` であり、現在 `make` 実行中。

- **`/make-ticket`**: 実装仕様（spec）の詳細文書の作成と詳細化。
- **`/plan-ticket`**: 実装レベルの詳細な計画。
- **`/start-ticket`**: 実装。
- **`/review-ticket`**: 完了したチケットをレビュー。

## 引数の解釈

- `P{phaseID}-{ticketID}` 形式（例: `P0-1`, `PX-53`） → チケットキー。必須。`show-ticket-context.js` の `--ticket-key` に投入する。
- 引数なし → エラーで中断
- 数字のみ → エラーで中断
- 上記以外 → エラーで中断

## Boy Scout Rule

新規作成時、spec の「Boy Scout Rule — 翻訳可能性計画」セクションに以下を必ず含める：関数名は動詞句、変数名はドメイン概念、一関数一責務、ハードコード値は名前付き定数、エラー握りつぶし禁止。**スコープ内外問わず、翻訳可能性を損なう既存コードを積極的に改善する計画を記載する。**

## 使用スクリプト一覧

`.claude/scripts/tickets/` 配下。詳細は `.claude/scripts/tickets/README.md` を参照。

| スクリプト | 引数 | 説明 |
|---|---|---|
| `show-ticket-context.js` | `--ticket-key=<P{id}-{id}\|PX-{id}>` | **Step 1 で実行**。チケット情報を Markdown で出力。存在しない場合は Not Found 表示。 |
| `ensure-ticket.js` | `--ticket-key=... --title="..." [--background=...] [--scope='["..."]'] [--test-unit='["..."]'] [--test-integration='["..."]'] [--test-exceptions='["..."]'] [--default-files='["..."]'] [--notes=...]` | **Step 2 Case B で AI が手動実行**。add-ticket.js → show-ticket-context.js を順次呼び出す。spec ファイルは作成せず、spec パスのみ導出する。Step 6 で show-ticket-context.js --for-spec により spec ファイルが書き出される。 |
| `insert-field-template.js` | `<Tickets.json> P{phaseID}-{ticketID}` | **Step 3 で AI が実行**。チケットの11フィールドにテンプレートをマージ挿入する。 |
| `list-remaining-stubs.js` | `<Tickets.json> P{phaseID}-{ticketID}` | **Step 4b のループ内で AI が繰り返し実行**。自然言語で残存 `[::TEMPLATE-STUB::]` マーカーを一覧表示。exit 0 = 全置換完了 / exit 1 = 未置換あり。 |
| `check-field-density.js` | `<Tickets.json> P{phaseID}-{ticketID}` | **Step 5a で AI が実行**。全 `[::TEMPLATE-STUB::]` マーカーの残存チェック + 密度スコアリング。exit 0 = 合格 / exit 1 = 未記入あり。 |
| `add-ticket.js` | `<PATH of Tickets.json> P{phaseID}`（stdin: チケットJSON） | チケット追加。ensure-ticket.js から内部的に呼ばれる。 |
| `add-phase.js` | `<PATH of Tickets.json>`（stdin: フェーズJSON） | フェーズ追加。 |
| `get-ticket.js` | `<PATH of Tickets.json> P{phaseID}-{ticketID}` | チケット情報取得。 |
| `update-ticket.js` | `<PATH of Tickets.json> P{phaseID}-{ticketID} [--append]`（stdin: 更新JSON） | チケットフィールド更新。`--append` 指定時は文字列・配列フィールドを追記（上書きしない）。 |
| `search-tickets.js` | `<PATH of Tickets.json> <query>` | 全文検索。 |
| `create-spec.js` | `"" <title>` | spec スケルトン生成。現在のワークフローでは直接使用しない（spec は Step 6 で show-ticket-context.js --for-spec により書き出される）。 |
| `resolve-ticket-context.js` | `--ticket-key=...` | （互換性維持）JSON 出力のコンテキスト解決。現在のワークフローでは使用しない。 |

## ワークフロー

**重要**: show-ticket-context.js は Markdown を出力する。以降の Step では、その Markdown に表示されたパスやキーを読み取ってコマンドに具体値を入れて実行すること。

### Step 1: コンテキスト表示（show-ticket-context.js）

show-ticket-context.js を実行し、チケットの状態を Markdown で取得する。

```bash
node .claude/scripts/tickets/show-ticket-context.js --ticket-key=$ARGUMENTS
```

出力される Markdown にはチケット内の値がある全フィールドを含む（値無しなら表示無し）:

| セクション | 内容 |
|---|---|
| `# {ticketKey}: {title} [{status}]` | H1 見出し + ステータスバッジ |
| `## RFC Reference` | RFC 文書内セクション参照 |
| `## Background` | 背景・目的 |
| `## Scope` | 実装範囲の箇条書き |
| `## Implementation Target Files` | 実装対象ファイル一覧 |
| `## To show related RFC graph details` | query.js の使用法と NODE-IDs（pipelineAvailable の場合のみ）。Step 4a で最初に参照する調査エントリポイント |
| `## Investigation` | 調査で得た物的証拠 |
| `## Acceptance Criteria` | 合格条件（Happy path / Error case / Edge case） |
| `## Invariants` | 不変条件（正常成立条件 / 異常時 / 内部状態 / 境界値） |
| `## Boy Scout Rule` | 翻訳可能性改善計画 |
| `## Test Plan` | Unit Tests / Integration Tests / Exceptions |
| `## Related Tickets` | 関連チケット一覧表 |
| `## Notes` | 補足情報 |
| `## Pipeline Context` | 全リソースパスと存在確認の一覧表（通常モードのみ） |

チケットが存在しない場合は Not Found メッセージが表示される。

### Step 2: 判断分岐

Step 1 の出力に基づいて分岐する。

#### Case A: チケットが存在する

Step 1 で表示された Markdown をコンテキストとして保持し、**Step 3 へ進む**。対話は不要。

#### Case B: チケットが存在しない + 事前会話あり

事前にユーザーと会話し、このチケットの内容について合意ができている場合、以下のコマンドを実行する。

```bash
node .claude/scripts/tickets/ensure-ticket.js \
  --ticket-key=$ARGUMENTS \
  --title="（会話から確定したタイトル）" \
  [--background="（会話から得た背景説明）"] \
  [--scope='["項目1","項目2"]'] \
  [--test-unit='["UT: テスト項目1","UT: テスト項目2"]'] \
  [--test-integration='["IT: モジュールA+B結合テスト"]'] \
  [--test-exceptions='["結合テスト依存のためUT不可"]'] \
  [--default-files='["src/main.rs"]'] \
  [--acceptance-criteria='["Happy path: ...","Error case: ...","Edge case: ..."]'] \
  [--notes="（補足情報）"]
```

**オプション引数について**: `--scope` / `--test-unit` / `--test-integration` / `--test-exceptions` / `--default-files` は JSON 配列として渡す。`--background` / `--notes` は文字列。会話から得られた情報を全て埋めることで、空のセクションが少なくなり以降のステップが効率的になる。`--test-unit` には単体テスト計画（`UT:` prefix）、`--test-integration` には結合テスト計画（`IT:` prefix）、`--test-exceptions` にはテスト不可能な項目の理由を記述する。`UT:` と `IT:` はどちらも自動テストコードであり、`testExceptions` はその補完であって代替ではない。

このスクリプトが内部で add-ticket.js → show-ticket-context.js を順次実行し、最終的にチケット情報の Markdown が表示される。その出力をコンテキストとして **Step 3 へ進む**。

#### Case C: チケットが存在しない + 事前会話なし

「ticket & spec 化する事前情報が無いため /make-ticket を中断します。」とユーザに回答して終了する。

### Step 3: チケットにテンプレート挿入

各フィールドに `[::TEMPLATE-STUB::<field-name>::]` 形式のマーカーが設定され、AI が後続ステップで埋めるべき項目が明確になる。

```bash
node ".claude/scripts/tickets/insert-field-template.js" "Tickets.json" "$ARGUMENTS"
```

### Step 4: Universal Testing Rules の完全理解

以下のとおり、TDD は絶対的義務である。このルールが Step 5b で testUnit / testIntegration / testExceptions のスタブを埋める際の法律となる。Step 5 の調査中は常に Universal Testing Rules を遵守するための思考を行わなければならない。

**Universal Testing Rules**

Write all code under the following non-negotiable rules:

1. Tests must be comprehensive and exhaustive for all observable behavior, including edge cases, failure modes, and invariants. Any behavior not covered by tests is considered undefined and unacceptable.

2. Do not write or accept any implementation whose correctness cannot be fully validated through tests. If correctness cannot be proven via tests, the implementation is invalid and must be redesigned.

3. If a feature cannot be completely and deterministically tested, treat this as a design failure. Refactor the architecture until full testability is achieved.

4. Tests are not a scoreboard and must never be treated as a goal in themselves. Passing tests does not imply correctness unless the tests fully capture the intended behavior.

5. It is strictly forbidden to modify or weaken tests to make an implementation pass. The implementation must conform to the tests, not the other way around.

6. Implementation is considered complete only when:
   - The tests fully and precisely specify the intended behavior.
   - The implementation passes all tests without exception.
   - The implementation's correctness is demonstrably guaranteed by those tests.

7. Any gap between test coverage and intended behavior is a critical defect. Resolve such gaps before considering the work complete.

**Test Field Reference**:

| Field | Requirement | Format |
|-------|------------|--------|
| `testUnit` | Unit tests — automated tests covering individual functions/modules | `UT:` prefix; enumerate normal/edge/failure cases |
| `testIntegration` | Integration tests — automated tests spanning multiple modules | `IT:` prefix; specify which tickets/modules are integrated |
| `testExceptions` | Items that cannot be tested, with mandatory technical justification | Free text; every item must state why it cannot be tested |

`UT:` と `IT:` は自動テストコードであり、手動テストではない。両者を合わせて全実装コードの正当性を検証可能にしなければならない。`testExceptions` はその補完であり代替ではない。

### Step 5: 調査 + テンプレート記入

#### 5a: 設計及びソースコード調査

テンプレートで定義された各フィールドの要求事項に基づいて調査方法を選択する。

- **pipelineAvailable が true**: show-ticket-context.js の出力情報と query.js の使用法によって得られる関連グラフノード情報を活用した調査を行う。出力内の「Related RFC graph NODE-IDs to check」にある全 NODE-ID を「Usage of query.js」に提示されるスクリプト実行コマンドにより参照し、全ての設計情報を得た後に具体的なソースコード調査を開始する。
- **pipelineAvailable が false**: スポット調査（事前のユーザとの会話に加え、直接ソースコードを grep / read して情報収集）

#### 5b: テンプレートマーカーの置換

調査結果に基づき、11フィールドの全 `[::TEMPLATE-STUB::<field-name>::]` マーカーを実際の内容で置換する。

**品質基準（厳守）**: 以下で書き込む内容は、Step 1 の show-ticket-context.js 出力や Step 2 の ensure-ticket.js 出力よりも**大幅に具体的**で**大幅に詳細**で**物的証拠に基づき**、**高密度情報**でなければならない。各項目の文字数は大幅に増加する。簡素なプレースホルダーは「横着」とみなす。型シグネチャ、ファイルパス、データ構造、エラー種類を具体的に列挙すること。

**Phase 1 — テストファースト（TDD）**: Universal Testing Rules（Step 4 に提示済み）に従い、まず `testUnit`, `testIntegration`, `testExceptions` の全マーカーを置換する。テスト計画が固まるまで他のフィールドに着手してはならない。

**Phase 2 — 残り全フィールド**: `investigation`, `boyScoutPlan`, `scope`, `invariants`, `background`, `instrumentation`, `notes`, `acceptanceCriteria` の全残存マーカーを置換する。

各フィールドの型とマーカー構成は以下の通り：

| フィールド | 型 | マーカー数 | 各マーカーの意味 |
|-----------|----|-----------|----------------|
| `invariants` | string | 4 | 正常成立条件 / 異常永不変条件 / 内部状態不変条件 / 境界不変条件 |
| `background` | string | 4 | Goal / Purpose / Motivation / Constraints |
| `scope` | array | 13 | 変更対象（path/action/detail/before-after/api/schema/config/dep） / 非変更範囲（item/why） / 影響範囲（component/nature/response） |
| `testUnit` | array | 4 | Normal / Error / Boundary / Invariant |
| `testIntegration` | array | 4 | Integration point / Verification / Prerequisites / Related tickets |
| `testExceptions` | array | 3 | Item / Reason / Alternative verification |
| `instrumentation` | string | 4 | Logging / Metrics / Error tracking / Health check |
| `notes` | string | 5 | Implementation steps / Risks / Caveats / Open items / Future improvements |
| `acceptanceCriteria` | array | 3 | Happy path / Error case / Edge case |
| `investigation` | string | 1 | コード調査で得た証拠一式 |
| `boyScoutPlan` | string | 1 | 翻訳可能性改善計画 |

**string 型**のフィールドはマーカー行ごとに文字列全体を置換し、**array 型**のフィールドは要素単位でマーカーを置換する：

```bash
# 例: string 型フィールドの更新
echo '{"invariants":"- 【正常成立条件】入力値は schema 検証を通過すること\n- 【異常永不変条件】エラー時も DB 整合性は保たれる"}', | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"

# 例: array 型フィールドの更新
echo '{"testUnit":["UT: [正常系] 有効な入力で正しい結果が返ること","UT: [異常系] 無効な入力でエラーが返ること"]}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"
```

**残存マーカーの確認とループ**: 1回以上の置換を行ったら以下を実行する：

```bash
node ".claude/scripts/tickets/list-remaining-stubs.js" "Tickets.json" "$ARGUMENTS"
```

未記入マーカーがある限り（exit 1）本 Step 5b に戻って置換を続ける。全マーカーが置換された（exit 0）時点で Step 6 へ進む。

### Step 6: 設計コンテキストの自動書き起こし + チケットフィールド転記 + ステータス更新

**「設計コンテキスト」ブロックについて**: dump-ticket-graph-commands.js と dump-node-context-to-spec.js によって本 Step で自動追記される4セクションを意識して spec を設計する。

`show-ticket-context.js --for-spec` を実行し、Tickets.json の全フィールドを spec ファイルの先頭に書き込む。グラフ情報（ノード詳細・エッジ関係性・ファイルパス）は `--for-spec` 出力に自動的に含まれる。

```bash
node .claude/scripts/tickets/show-ticket-context.js \
  --ticket-key="$ARGUMENTS" --for-spec > "（Spec-File のパス）"
```

```bash
echo '{"status":"made"}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"
```
