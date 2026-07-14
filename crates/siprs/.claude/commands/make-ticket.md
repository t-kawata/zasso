---
description: 実装仕様（spec）の詳細文書の作成と詳細化。P{phaseID}-{ticketID} 形式のチケットキーが必須。show-ticket-context.js が最初に実行され状況を Markdown で表示する。
---

# /make-ticket

**第一級規則 — [::STUB::] マーカー絶対義務**: 不完全な実装（スタブ・モック・仮実装・プレースホルダー等、名称を問わず）には全て `[::STUB::]` マーカーを付与しなければならない。これは死守すべき絶対的法規であり、違反は「犯罪」として Malfeasance.json に記録される。本コマンドの全フェーズにおいて、Malfeasance.json を読み取り未解決の犯罪がないことを確認すること。違反を発見した場合は直ちに解決するか、その場でマーカーを追加・記録する。

**役割**: 実装仕様（spec）の詳細文書の作成と詳細化。

## ワークフローにおける位置づけ

このプロジェクトの作業の流れは `make → plan → start → review` である。

- **`/make-ticket`**: 実装仕様（spec）の詳細文書の作成と詳細化。
- **`/plan-ticket`**: 実装レベルの詳細な計画。
- **`/start-ticket`**: 実装。
- **`/review-ticket`**: 完了したチケットをレビュー。

**ルール**: 自分の役割を完了したら、必要に応じて次のアクションを提案。

## 引数の解釈

- `P{phaseID}-{ticketID}` 形式（例: `P0-1`, `PX-53`） → チケットキー。必須。`show-ticket-context.js` の `--ticket-key` に投入する。
- 引数なし → エラーで中断
- 数字のみ → エラーで中断
- 上記以外 → エラーで中断

**`--title` は不要**: チケットが既に存在する場合はそのタイトルが使われる。存在しない場合も会話からタイトルは確定しているはずであり、AI はそのタイトルを記憶していて `ensure-ticket-and-spec.js` の `--title` に渡す。

## Boy Scout Rule

新規作成時、spec の「Boy Scout Rule — 翻訳可能性計画」セクションに以下を必ず含める：関数名は動詞句、変数名はドメイン概念、一関数一責務、ハードコード値は名前付き定数、エラー握りつぶし禁止。**スコープ内外問わず、翻訳可能性を損なう既存コードを積極的に改善する計画を記載する。**

## 使用スクリプト一覧

`.claude/scripts/tickets/` 配下。詳細は `.claude/scripts/tickets/README.md` を参照。

| スクリプト | 引数 | 説明 |
|---|---|---|
| `show-ticket-context.js` | `--ticket-key=<P{id}-{id}\|PX-{id}>` | **Step 1 で実行**。チケット情報を Markdown で出力。存在しない場合は Not Found 表示。 |
| `ensure-ticket-and-spec.js` | `--ticket-key=... --title="..." [--background=...] [--scope='["..."]'] [--test-unit='["..."]'] [--test-integration='["..."]'] [--test-exceptions='["..."]'] [--default-files='["..."]'] [--notes=...]` | **Step 2b で AI が手動実行**。create-spec.js → add-ticket.js を順次呼び出し、show-ticket-context.js を再実行する。会話から得た情報をオプション引数で渡せる。 |
| `add-ticket.js` | `<PATH of Tickets.json> P{phaseID}`（stdin: チケットJSON） | チケット追加。ensure-ticket-and-spec.js から内部的に呼ばれる。 |
| `add-phase.js` | `<PATH of Tickets.json>`（stdin: フェーズJSON） | フェーズ追加。 |
| `get-ticket.js` | `<PATH of Tickets.json> P{phaseID}-{ticketID}` | チケット情報取得。 |
| `update-ticket.js` | `<PATH of Tickets.json> P{phaseID}-{ticketID} [--append]`（stdin: 更新JSON） | チケットフィールド更新。`--append` 指定時は文字列・配列フィールドを追記（上書きしない）。 |
| `search-tickets.js` | `<PATH of Tickets.json> <query>` | 全文検索。 |
| `create-spec.js` | `"" <title>` | spec スケルトン生成。ensure-ticket-and-spec.js から内部的に呼ばれる。 |
| `resolve-ticket-context.js` | `--ticket-key=...` | （互換性維持）JSON 出力のコンテキスト解決。現在のワークフローでは使用しない。 |

## ワークフロー

**重要**: show-ticket-context.js は JSON ではなく Markdown を出力する。以降の Step では、その Markdown に表示されたパスやキーを読み取ってコマンドに具体値を入れて実行すること。

### Step 1: コンテキスト表示（show-ticket-context.js）

show-ticket-context.js を実行し、チケットの状態を Markdown で取得する。
`--write-spec` を指定すると、spec ファイル書き出しに適した形式で出力する
（IMPORTANT バナー / Pipeline Context を省略し、Universal Testing Rules を前置する）。

```bash
# 通常モード（AI がコンテキストとして読む）
node .claude/scripts/tickets/show-ticket-context.js --ticket-key=$ARGUMENTS

# spec 書き出しモード（Step 6 で使用）
node .claude/scripts/tickets/show-ticket-context.js --ticket-key=$ARGUMENTS --write-spec
```

出力される Markdown にはチケットの全フィールドがセクションとして含まれる:

| セクション | 内容 |
|---|---|
| `# {ticketKey}: {title} [{status}]` | H1 見出し + ステータスバッジ |
| `## RFC Reference` | RFC 文書内セクション参照 |
| `## Background` | 背景・目的 |
| `## Investigation` | 調査で得た物的証拠 |
| `## Scope` | 実装範囲の箇条書き |
| `## Implementation Target Files` | 実装対象ファイル一覧 |
| `## Source Paths` | 調査で参照したファイル |
| `## To show related RFC graph details` | query.js の使用法と NODE-IDs（pipelineAvailable の場合のみ） |
| `## Invariants` | 不変条件 |
| `## Test Plan` | Unit Tests / Integration Tests / Exceptions |
| `## Reference URLs` | 参考URL |
| `## RFC Discrepancies` | 設計乖離リスト |
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
node .claude/scripts/tickets/ensure-ticket-and-spec.js \
  --ticket-key=$ARGUMENTS \
  --title="（会話から確定したタイトル）" \
  [--background="（会話から得た背景説明）"] \
  [--scope='["項目1","項目2"]'] \
  [--test-unit='["UT: テスト項目1","UT: テスト項目2"]'] \
  [--test-integration='["IT: モジュールA+B結合テスト"]'] \
  [--test-exceptions='["結合テスト依存のためUT不可"]'] \
  [--default-files='["src/main.rs"]'] \
  [--notes="（補足情報）"]
```

**オプション引数について**: `--scope` / `--test-unit` / `--test-integration` / `--test-exceptions` / `--default-files` は JSON 配列として渡す。`--background` / `--notes` は文字列。会話から得られた情報を全て埋めることで、空のセクションが少なくなり以降のステップが効率的になる。`--test-unit` には単体テスト計画（`UT:` prefix）、`--test-integration` には結合テスト計画（`IT:` prefix）、`--test-exceptions` にはテスト不可能な項目の理由を記述する。`UT:` と `IT:` はどちらも自動テストコードであり、`testExceptions` はその補完であって代替ではない。

このスクリプトが内部で create-spec.js → add-ticket.js → show-ticket-context.js を順次実行し、最終的にチケット情報の Markdown が表示される。その出力をコンテキストとして **Step 3 へ進む**。

#### Case C: チケットが存在しない + 事前会話なし

「ticket & spec 化する事前情報が無いため /make-ticket を中断します。」とユーザに回答して終了する。

### Step 3: ソースコード調査

Step 1 の Pipeline Context の内容に基づいて調査方法を選択する。

- **pipelineAvailable が true**: show-ticket-context.js の出力情報と To show related RFC graph details セクションの query.js の使用法によって得られる関連グラフノード情報を活用した調査を行う
- **pipelineAvailable が false**: スポット調査（直接ソースコードを grep / read して情報収集）

### Step 4: 証拠の記録

調査で得られた情報をチケットの JSON フィールドに追記する。`investigation` および `notes` は累積されるため `--append` モードで実行する。これらの内容は Step 6 で spec ファイルに自動転記される。

```bash
echo '{"investigation":"src/foo.rs:42 で新規公開関数のパラメータ制約を確認。\n想定される全入力パターン（正常系3種・異常系2種）を列挙。\n型シグネチャと不変条件をコードコメントから抽出...", "notes":"実装時の注意... 調査時に発見した重要な情報..."}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS" --append
```

### Step 5: 仕様の具体化

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

**「設計コンテキスト」ブロックについて**: dump-ticket-graph-commands.js と dump-node-context-to-spec.js によって Step 6 で自動追記される4セクションを意識して spec を設計する。

Test Plan 具体化後、JSON フィールドに反映:

```bash
echo '{"scope":["範囲..."],"testUnit":["UT: ..."],"testIntegration":["IT: ..."],"testExceptions":["理由: ..."]}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"
```

### Step 6: 設計コンテキストの自動書き起こし + チケットフィールド転記

`show-ticket-context.js --write-spec` を実行し、Tickets.json の全フィールドを spec ファイルの先頭に書き込む。グラフ情報（ノード詳細・エッジ関係性・ファイルパス）は `--write-spec` 出力に自動的に含まれる。

```bash
node .claude/scripts/tickets/show-ticket-context.js \
  --ticket-key="$ARGUMENTS" --write-spec >> "（Spec-File のパス）"
```

### Step 7: 依存・関連チケットID の点検

```bash
node ".claude/scripts/tickets/search-tickets.js" "Tickets.json" "<キーワード>"
```

### Step 8: 犯罪の点検

```bash
.claude/scripts/tickets/scan-crimes.sh
node .claude/scripts/tickets/review/find-all-stubs.js .
```

### Step 9: ステータス更新

```bash
echo '{"status":"made"}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"
```
