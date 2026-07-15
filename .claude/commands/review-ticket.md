---
description: 実装済みチケットの品質レビューを実行。
argument-hint: <P{phaseID}-{ticketID}>
---

# /review-ticket

**第一級規則 — [::STUB::] マーカー絶対義務**: 不完全な実装（スタブ・モック・仮実装・プレースホルダー等、名称を問わず）には全て `[::STUB::]` マーカーを付与しなければならない。これは死守すべき絶対的法規であり、違反は「犯罪」として Malfeasance.json に記録される。本コマンドの全フェーズにおいて、Malfeasance.json を読み取り未解決の犯罪がないことを確認すること。違反を発見した場合は直ちに解決するか、その場でマーカーを追加・記録する。

**役割**: `done` チケットの品質検証。

## ワークフローにおける位置づけ

作業の流れは `make → plan → start → review` であり、現在 `review` 実行中。

- **`/make-ticket`**: 実装仕様（spec）の詳細文書の作成と詳細化。
- **`/plan-ticket`**: 実装レベルの詳細な計画。
- **`/start-ticket`**: 実装。
- **`/review-ticket`**: 完了したチケットをレビュー。

## 引数の解釈

- `P{phaseID}-{ticketID}` 形式（例: `P0-1`, `PX-53`） → チケットキー。必須。`show-ticket-context.js` の `--ticket-key` に投入する。
- 引数なし → エラーで中断
- 数字のみ → エラーで中断
- 上記以外 → エラーで中断

## Boy Scout Rule — レビュー観点

**実装者が既存コードの改善を行ったか検証する。** 新コードの品質だけでなく、既存コードに対する改善痕跡（エラー伝播への修正、定数化、関数分割等）も確認する。翻訳可能性チェック（grep パターンは言語に応じて選択）：

- 関数定義を grep し、動詞句でない関数名がないか
- 変数宣言を grep し、1文字変数や汎用名が新たに追加されていないか
- マジックナンバーが直接書かれていないか
- デバッグ出力が残っていないか
- コメントは「なぜ」のみか（「何を」はコード自身が語るべき）

## 使用スクリプト一覧

`.claude/scripts/tickets/` 配下。

| スクリプト | 引数 | 説明 |
|---|---|---|
| `show-ticket-context.js` | `--ticket-key=<P{id}-{id}\|PX-{id}> --for-spec --review` | **Step 1 で実行**。チケット情報を Markdown で出力。`--review` で Not Found 時中断。 |
| `update-ticket.js` | `<PATH of Tickets.json> P{phaseID}-{ticketID}`（stdin: 更新JSON） | チケットフィールド更新・status 変更。`--append` で既存内容を保持し追記。 |
| `scan-crimes.sh` | （なし） | **Step 3, 4 で実行**。Malfeasance.json の犯罪スキャン。 |
| `review/find-all-stubs.js` | `<path>` | **Step 3 で実行**。`[::STUB::]` マーカーの全件検索。 |
| `review/run-quality-checks.js` | `<files...>` | **Step 5 で実行**。静的品質チェック。 |
| `review/generate-report.js` | （stdin経由） | **Step 5 で実行**。品質レポート生成。 |

## ワークフロー

### Step 1: 存在確認 + チケット情報取得

```bash
node ".claude/scripts/tickets/show-ticket-context.js" --ticket-key="$ARGUMENTS" --for-spec --review
```

出力の先頭が `# {ticketKey}: Not Found` の場合 → 出力に従い「チケットが存在しないため /review-ticket を中断します。」と回答して終了。Not Found でなければ設計情報及び関連情報探索方法が Markdown として出力されるため、これをコンテキストとして使用。

### Step 2: 設計情報・関連設計情報・関連チケット情報・ソースコードを探索・理解

Step 1 の出力を理解。その後、「Usage of query.js」に従い「Related RFC graph NODE-IDs to check」に表示されている全ての Node ID に対して以下を実行し、詳細設計情報を探索する。どの階層まで連続的に深掘りしていくかは AI が判断する。得られた情報は**必ず実際のソースコードを解析**し、実装状況に関して物理的証拠を伴ってレビューを行わなければならない。物理的証拠がないレビューは妄想であり厳しく禁止する。

```bash
node .claude/scripts/rfc-graph/query.js --graph="</path/to/?-GRAPH.json>" --source="</path/to/RFC-?.md>" --dirs-tree="</path/to/?-Dirs-Tree.json>" --id=Nxxxx (NODE-ID, e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
```

必要に応じて、「Related Tickets」に示されている関連チケットの情報を探索する。どの階層まで連続的に深掘りしていくかは AI が判断する。得られた情報は**必ず実際のソースコードを解析**し、実装状況に関して物理的証拠を伴ってレビューを行わなければならない。物理的証拠がないレビューは妄想であり厳しく禁止する。

```bash
node .claude/scripts/tickets/show-ticket-context.js --ticket-key=<Ticket KEY to show (e.g. P0-1)> --for-spec --no-test-rules
```

### Step 3: 犯罪の緊急解決（最優先 — 第一級規則）

Malfeasance.json を読み取り、未解決の犯罪（`open`）が存在する場合、**レビュー処理より優先して**解決する。これは最優先タスクであり、スキップを禁止する。

```bash
# 犯罪スキャンを実行（初回時は自動初期化）
.claude/scripts/tickets/scan-crimes.sh
```

犯罪解決の手順は start-ticket.md の「犯罪の緊急解決」に従う。全犯罪を解決するまでレビューを進行してはならない。

また、本チケットの実装コードに新たな犯罪（`[::STUB::]` 未付与の不完全実装）がないことを確認する。発見した場合は：
1. その場で `[::STUB::]` マーカーを追加する
2. `malfeasance-create.js` で犯罪として記録する
3. 犯罪を解決する（実装完了 or マーカー追加）

### Step 4: [::STUB::] の一覧と評価

`find-all-stubs.js` で全スタブを抽出し、以下の3分類で評価する：

```bash
# 全スタブの一覧取得
node .claude/scripts/tickets/review/find-all-stubs.js .
```

**分類基準**:

1. **解決可能なスタブ** — 依存先チケットが完了し、現状で実際の実装に置き換えられるもの
   → **その場で実装し、`[::STUB::]` マーカーを除去する**

2. **別チケットが必要なスタブ** — 解決には別の新規チケットが必要なもの
   → **新規チケットの作成をユーザーに提案する**

3. **保留妥当なスタブ** — 将来的なチケットで解決予定であり、現在はスタブのままが正しいもの
   → **理由を明確にし、解決予定チケットIDを確認してユーザーに報告する**

**未マークスタブの発見時**: コードの内容から明らかにスタブと判断されるにも関わらず `[::STUB::]` が付与されていない場合、**その場でマーカーを追加し、`malfeasance-create.js` で犯罪として記録する**。その後、上記の分類に従って評価する。

スタブ評価の結果はレビュー報告書に必記録すること。

### Step 5: 不完全実装の能動的探索（必須）

コンパイル検証に入る前に、レビュー対象の**変更コード全体を精査し**、不完全実装が混入していないか確認する。これは**自動スクリプトでは検出できない漏れを発見するための能動的ステップ**であり、スキップを禁止する。

```bash
# 変更ファイル一覧を確認
git diff --name-only "$(git merge-base HEAD origin/master)"

# 各ファイルの変更行を確認
git diff "$(git merge-base HEAD origin/master)"
```

**確認基準（7パターン）**:
1. `todo!()`, `unimplemented!()`, `panic!()` — `[::STUB::]` は付いているか
2. 空の関数本体 — 仮置きのままではないか
3. `return Ok(())` / `return None` — エラー処理が未完了ではないか
4. コメントアウトされたコード — 残骸を残していないか
5. `TODO` / `FIXME` / `HACK` / `XXX` — `[::STUB::]` と併記されているか
6. Mock / Fake オブジェクト — `[::STUB::]` は付いているか
7. `#[allow(...)]` — 抑制理由に `[::STUB::]` があるか

不完全実装を発見した場合：
1. `[::STUB::]` 未付与 → その場でマーカーを追加する
2. `malfeasance-create.js` で犯罪として記録する
3. 直ちに解決する。解決不可能な場合は `false_positive` に変更し理由を `note` に記録する

```bash
node .claude/scripts/tickets/malfeasance-create.js "<file>" <line> "<description>"
```

記録後、必ず `scan-crimes.sh` を再実行し、犯罪が正しく Malfeasance.json に反映されたことを確認する：

```bash
.claude/scripts/tickets/scan-crimes.sh
```

### Step 6: コンパイル検証とユニットテスト検証

まずコンパイル検証を実行する。実行方法は以下の指針に従い、AI が状況に応じて判断すること：

- **作業ディレクトリ**: 変更範囲に応じて適切なディレクトリで実行する。`cd` が必要な
  場合はサブシェル `(cd <dir> && <command>)` を使い、後続に影響を与えないようにする。
- **コンパイル検証**: 選択したディレクトリに Makefile が存在し、`check` 系ターゲットが
  定義されていれば `make` を優先、なければ `cargo check` を使用する。
- **テスト実行**: 同様に、Makefile に `test` ターゲットが定義されていれば `make test`
  を優先、なければ `cargo test` を使用する。テスト範囲は変更の影響範囲に応じて判断する。

```bash
# 例: プロジェクトルートの Makefile を使う場合
(cd "$(git rev-parse --show-toplevel)" && make check-be)

# 例: 特定クレート内で cargo を直接使う場合
(cd crates/voiput && cargo check --all-targets)
```

コンパイルが通らない場合は修正してから先に進む。

続けて、Step 1 で得た Test Plan で定義されたテストが全て実装されていることを確認し、テストを実行する。実行の指針はコンパイル検証と同様とする：

テストが存在しない、または失敗がある場合 → 修正してから先に進む。
「ユニットテスト不可能な項目（例外）」として spec に明記されたものだけが未テストを許容される。

**警告・エラー完全解決の原則**:
- `cargo check`, `cargo test`（または `make` コマンド経由）で検出された警告・エラーは、**1つ残さず解決しなければならない**。未解決の状態で次ステップに進むことを禁止する。
- `cargo test`（または `make test`）が**1つでも失敗する状態**での次ステップ進行を禁止する。テストが通るまで修正すること。
- やむを得ず警告・エラーを残す場合（別チケットで解決予定など）は、**該当箇所に `[::STUB::]` マーカーとコメントアウトで「どのチケット（チケットID）のタイミングで、どのように解決されるか」を明記した上で、`#[allow(...)]` や `#[cfg(test)]` 等の適切な機構で警告・エラーを抑制し、他のチケットのコンパイルやテストを阻害しない状態にしなければならない**。
- 抑制が不十分で後続のビルドやテストを阻害する場合、それはバグとみなす。

**抑制と `[::STUB::]` の整合性検証**:
- `cargo check`（または `make check-*`）通過後、`#[allow(...)]` 等の抑制機構が使用されている箇所をすべて抽出し、それぞれに対応する `[::STUB::]` マーカーと解決予定チケットIDが同一箇所に明記されていることを確認する
- **抑制のみで `[::STUB::]` が欠如** → マーカーを追加し、解決予定チケットIDと解決方法をコメントに記入する
- **`[::STUB::]` のみで抑制が欠如** → コンパイル検証でエラーが出ているか確認する。エラーがあれば `#[allow(...)]` を追加し、エラーがなければ抑制不要（設計上の意図的スタブ）と判断して良い
- 整合性確認後、**再度コンパイル検証を実行する**

### Step 7: 実装の完全性を徹底検査

Step 1 で得た設計情報と Step 2 で得た探索情報及びソースコード解析情報を使用し、Step 1 で得た設計情報に書かれている全てを満たす実装が完全に完了していることを検査する。

検査は、Step 1 で得た設計情報に対して、危険・漏れ・矛盾・不足 に分けて4段階で積極的に探索する。
危険・漏れ・矛盾・不足 を発見することを重視し、見逃さないという粘着性を発揮すること。

発見した危険・漏れ・矛盾・不足は、Step 1 で得た設計情報を全て完全に満たし、全てのテストに合格し且つ一つのエラーも警告も無いという状態を Step 8 に進んでも良い唯一の条件とする。

### Step 8: 静的品質チェック

```bash
node ".claude/scripts/tickets/review/run-quality-checks.js" src/file1.rs src/file2.rs | node ".claude/scripts/tickets/review/generate-report.js"
```

### Step 9: 翻訳可能性チェック

`/plan-ticket` で定義された grep コマンドを全て再実行する。

### Step 10: レビュー報告書の保存

全チェック通過後、レビュー結果を `update-ticket.js` でチケットの JSON フィールドに保存する：

```bash
echo '{
  "instrumentation": "静的品質チェック: 合格\n翻訳可能性: 問題なし\nテスト: 全xx件成功",
  "rfcDiscrepancies": [],
  "notes": "レビュー報告書:\n- 静的品質チェック: 合格\n- 翻訳可能性: 問題なし\n- 依存関係: 整合性確認済\n- 見つかった問題と修正内容: ..."
}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS" --append
```

これにより、後でチケットを確認したときに「どのようにレビューされ、品質が担保されているか」を追跡できる。

### Step 11: reviewed に遷移

全チェック通過後、レビュー完了日と共に status を更新する：

```bash
echo "{\"status\":\"reviewed\",\"completedAt\":\"$(date +%Y-%m-%d)\"}" | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"
```
