---
description: チケットの実装計画を策定する。
argument-hint: <P{phaseID}-{ticketID}>
---

# /plan-ticket

**第一級規則 — [::STUB::] マーカー絶対義務**: 不完全な実装（スタブ・モック・仮実装・プレースホルダー等、名称を問わず）には全て `[::STUB::]` マーカーを付与しなければならない。これは死守すべき絶対的法規であり、違反は「犯罪」として Malfeasance.json に記録される。本コマンドの全フェーズにおいて、Malfeasance.json を読み取り未解決の犯罪がないことを確認すること。違反を発見した場合は直ちに解決するか、その場でマーカーを追加・記録する。

**役割**: チケットの実装計画と物理的レビュー方法の定義。

## ワークフローにおける位置づけ

作業の流れは `make → plan → start → review` であり、現在 `plan` 実行中。

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

**翻訳可能性を損なっている既存コードを、スコープ内外問わず改善することを計画に含める。** 変更ファイル一覧とは別に「Boy Scout 改善（スコープ外の翻訳可能性修正）」セクションを設け、どのファイルの何を直すかを明記する。

### 翻訳可能性チェック（全言語共通、grep パターンは言語に応じて選択）

- 関数定義を grep し、名詞始まりの関数がないか
- 変数宣言を grep し、1文字変数や汎用名（`data`, `info`, `tmp`）がないか
- 数値リテラルが直接書かれていないか
- デバッグ出力が残っていないか

## 使用スクリプト一覧

`.claude/scripts/tickets/` 配下。

| スクリプト | 引数 | 説明 |
|---|---|---|
| `show-ticket-context.js` | `--ticket-key=<P{id}-{id}\|PX-{id}> [--for-spec] [--plan]` | **Step 1 で実行**。チケット情報を Markdown で出力。`--plan` で Not Found 時中断メッセージ。 |
| `update-ticket.js` | `<PATH of Tickets.json> P{phaseID}-{ticketID}`（stdin: 更新JSON） | チケットフィールドの更新 |
| `search-tickets.js` | `<PATH of Tickets.json> <query>` | 全文検索 |
| `scan-crimes.sh` | （なし） | **Step 4 で実行**。Malfeasance.json の犯罪スキャン。 |
| `review/find-all-stubs.js` | `<path>` | **Step 4 で実行**。`[::STUB::]` マーカーの全件検索。 |
| `review/run-quality-checks.js` | `<files...>` | **Step 5 で実行**。静的品質チェック。 |

## ワークフロー

### Step 1: 存在確認 + チケット情報取得

```bash
node ".claude/scripts/tickets/show-ticket-context.js" --ticket-key="$ARGUMENTS" --for-spec --plan
```

出力の先頭が `# {ticketKey}: Not Found` の場合 → 出力に従い「チケットが存在しないため /plan-ticket を中断します。」と回答して終了。Not Found でなければ設計情報及び関連情報探索方法が Markdown として出力されるため、これをコンテキストとして使用。

### Step 2: 設計情報・関連設計情報・関連チケット情報・ソースコードを探索・理解

Step 1 の出力を理解。その後、「Usage of query.js」に従い「Related RFC graph NODE-IDs to check」に表示されている全ての Node ID に対して以下を実行し、詳細設計情報を探索する。どの階層まで連続的に深掘りしていくかは AI が判断する。得られた情報は**必ず実際のソースコードを解析**し、物理的証拠を伴って実装計画に含めなければならない。物理的証拠がない実装計画は妄想であり厳しく禁止する。

```bash
node .claude/scripts/rfc-graph/query.js --graph="</path/to/?-GRAPH.json>" --source="</path/to/RFC-?.md>" --dirs-tree="</path/to/?-Dirs-Tree.json>" --id=Nxxxx (NODE-ID, e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
```

必要に応じて、「Related Tickets」に示されている関連チケットの情報を探索する。どの階層まで連続的に深掘りしていくかは AI が判断する。得られた情報は**必ず実際のソースコードを解析**し、物理的証拠を伴って実装計画に含めなければならない。物理的証拠がない実装計画は妄想であり厳しく禁止する。

```bash
node .claude/scripts/tickets/show-ticket-context.js --ticket-key=<Ticket KEY to show (e.g. P0-1)> --for-spec --no-test-rules
```

### Step 3: 犯罪・スタブの点検（必須 — 第一級規則）

Malfeasance.json を読み取り、未解決の犯罪がないか確認する。**計画承認の条件**として、以下のいずれかを満たさなければならない：

- **条件 A**: Malfeasance.json に `open` レコードが存在しない
- **条件 B**: `open` レコードが存在する場合、本チケットの実装計画内にそれらを解消する具体的ステップが含まれている

```bash
# 犯罪スキャンを実行（初回時は自動初期化）
.claude/scripts/tickets/scan-crimes.sh
```

条件 B の場合、計画内に各犯罪の解消ステップを明記すること。

併せて、`[::STUB::]` マーカーが計画に影響するか検証する：

1. `find-all-stubs.js` でスタブを一覧する
2. このチケットで解決可能なスタブがあるか評価する
3. `[::STUB::]` 未付与のスタブを発見したらマーカーを追加し、`malfeasance-create.js` で犯罪として記録する
4. 解決可能なスタブは計画の実装スコープに含める
5. 解決不可能なスタブは注記として計画に残し、将来のチケットとの関係を明記する

```bash
# スタブの検索
node .claude/scripts/tickets/review/find-all-stubs.js .
```

**能動的コード探索**: 計画対象のソースツリーにおいて、不完全実装が既存コードに存在しないか grep で確認する。発見した場合は `[::STUB::]` マーカーを追加し、`malfeasance-create.js` で犯罪として記録する。この探索結果は計画の「リスク」または「Boy Scout 改善」セクションに反映すること。

```bash
# 不完全実装パターンの grep
grep -rE "todo!\(\)|unimplemented!\(\)|panic!\(" . --include="*.rs" --include="*.ts" --include="*.vue" | grep -v "\[::STUB::\]" || true
grep -rE "TODO|FIXME|HACK|XXX" . --include="*.rs" --include="*.ts" --include="*.vue" | grep -v "\[::STUB::\]" || true
grep -rE "#\[allow" . --include="*.rs" --include="*.ts" --include="*.vue" | grep -v "\[::STUB::\]" || true
```

### Step 4: 計画策定

Step 1, Step 2, Step 3 によって得られた情報を元に、実装計画を策定する。
計画は **Universal Testing Rules** を最高法規として遵守しなければならない。
計画は、Step 1, Step 2, Step 3 にて得られた情報が安全に盛り込まれ、Step 1 の show-ticket-context.js の出力と同じ項目を出力しなければならないが、以下の条件を満たさない場合には Step 5 へ進むことを禁じる。満たさない場合、Step 2 に戻ってやり直さなければならない。満たす場合は、Step 5 に進む。

**Step 5 に進むことができる条件**
1. **Universal Testing Rules** を完全遵守し、網羅的テストコードとしての単体テスト及び結合テストによって完全な動作検証が計画されている
2. show-ticket-context.js の出力よりも**大幅に具体的**で**大幅に詳細**で**物的証拠に基づき**、**高密度情報**である
3. 実装時に考えなければならないことがゼロに近い程、実際に実装するコードスニペットが網羅的に書かれている

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

### Step 5: ステータスを更新してから計画完成報告

ステータス更新。

```bash
echo '{"status":"planned"}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"
```

Step 4 で策定した計画の全文をMarkdown形式でユーザーに報告し、以下のメッセージで締める。
```
計画の策定が完了しました。以下のコマンドを実行して実装を開始できます: `/start-ticket $ARGUMENTS`
```
