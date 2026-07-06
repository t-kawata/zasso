---
description: 例: /start-ticket P0-1。第1引数にチケットID（P{phaseID}-{ticketID}形式）を指定すると、そのチケットの実装を実行する。実装完了後にチケットのステータスを done に遷移させる。引数なしならチケットIDを質問する。
---

# /start-ticket

**第一級規則 — [::STUB::] マーカー絶対義務**: 不完全な実装（スタブ・モック・仮実装・プレースホルダー等、名称を問わず）には全て `[::STUB::]` マーカーを付与しなければならない。これは死守すべき絶対的法規であり、違反は「犯罪」として Malfeasance.json に記録される。本コマンドの全フェーズにおいて、Malfeasance.json を読み取り未解決の犯罪がないことを確認すること。違反を発見した場合は直ちに解決するか、その場でマーカーを追加・記録する。

**役割**: チケットの実装。

## ワークフローにおける位置づけ

このプロジェクトの作業の流れは `make → plan → start → review` である。ただし、各コマンドは必ずしも連続して実行されず、ユーザーの作業スタイルに応じて非連続的に使用される：

- **`/make-ticket`**: 複数のチケットをまとめて作成することが多い。作成後、すぐに計画・実装されるとは限らない。
- **`/plan-ticket` + `/start-ticket`**: ひとつのチケットに対して連続実行されることが多い（計画承認→即実装）。
- **`/review-ticket`**: 完了したチケットをまとめてレビューすることが多い。

**ルール**: 自分の役割を完了したら、必要に応じて次のアクションを提案してもよい（例：「品質レビューを行う場合は /review-ticket を実行してください」）。ただし、決定はユーザーに委ね、押し付けない。

## 引数の解釈

- 引数なし → ユーザーに「どのチケットを実装しますか？」と質問する
- `P{phaseID}-{ticketID}` 形式（例: `P0-1`） → チケットID
- 数字のみ → エラー: 「チケットIDは `P{phaseID}-{ticketID}` 形式（例: `P0-1`）で指定してください」

## 必須条件

チケットが存在すること（ステータスは任意）。`todo` 以外のステータスの場合はユーザーに注意を促すが、実装自体はブロックしない。

## Boy Scout Rule

実装中に翻訳可能性を損なっている既存コードを見つけたら、スコープ外でも積極的に直す：エラー握りつぶし→伝播、ハードコード値→定数化、汎用変数名→ドメイン名、複数責務関数→分割。**計画に含まれていなくても実施する。**

## 使用スクリプト一覧

`.claude/scripts/tickets/` 配下。詳細は `.claude/scripts/tickets/README.md` を参照。

| スクリプト | 引数 | 説明 |
|---|---|---|
| `get-ticket.js` | `<PATH of Tickets.json> P{phaseID}-{ticketID}` | チケット情報の取得 |
| `update-ticket.js` | `<PATH of Tickets.json> P{phaseID}-{ticketID}`（stdin: 更新JSON） | チケットフィールドの更新・status 変更 |
| `all-tickets.js` | `<PATH of Tickets.json> [status-filter]` | 全チケット一覧 |
| `review/run-quality-checks.js` | `<files...>` | 静的品質チェック |
| `review/generate-report.js` | （stdin経由） | 品質レポート生成 |

## ワークフロー

### Step 1: 存在確認

Tickets.json のパスを決定する（カレントディレクトリの Tickets.json を優先）。

```bash
node ".claude/scripts/tickets/get-ticket.js" "Tickets.json" "$ARGUMENTS"
```

`success` が `false` なら終了。存在すれば status を確認する。`todo` 以外の場合はユーザーに注意を促す。

### Step 2: 実装開始日の記録

実装開始日を `startedAt` フィールドに記録する：

```bash
echo "{\"startedAt\":\"$(date +%Y-%m-%d)\"}" | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"
```

### Step 3: チケットフィールド読み取り

`get-ticket.js` でチケットの全フィールドを読み取り、計画内容を把握する：

```bash
node ".claude/scripts/tickets/get-ticket.js" "Tickets.json" "$ARGUMENTS"
```

出力の `ticket` オブジェクトから `background`, `scope`, `testVerification`, `notes` 等を確認する。

### Step 4: 依存・関連チケットID の充足確認

実装を開始する前に、`relatedTicketIds` で記述された依存関係が充足されていることを確認する：

1. `get-ticket.js` でチケットの `relatedTicketIds` フィールドを読み取る
2. 「先行実装必須」と記載されたチケットがすべて `done` ステータスであることを確認する
3. 未完了の先行依存がある場合はユーザーに報告し、実装順序の調整または依存チケットの完了を待つ

```bash
# チケットを取得して関連チケットID を確認
node ".claude/scripts/tickets/get-ticket.js" "Tickets.json" "$ARGUMENTS"

# 各参照先チケットのステータス確認
node ".claude/scripts/tickets/get-ticket.js" "Tickets.json" "P{phaseID}-{ticketID}"
```

依存関係に問題がないことを確認した上で実装に進む。

### Step 5: 犯罪の緊急解決（最優先 — 第一級規則）

Malfeasance.json を読み取り、未解決の犯罪（`open`）が存在する場合、**本チケットの実装作業より優先して**解決する。これは最優先タスクであり、スキップを禁止する。

```bash
# 犯罪スキャンを実行（初回時は自動初期化）
.claude/scripts/tickets/scan-crimes.sh
```

1. 未解決の犯罪が存在する場合、直ちに解決に取り掛かる
2. 解決方法：
   - 該当コードに `[::STUB::]` マーカーが未付与なら、その場でマーカーを追加する
   - マーカー追加後、`malfeasance-update.js` で `status` を `resolved` に変更する
   - 実装が完了しているにも関わらずマーカーが残っている場合は、マーカーを削除して解決する
3. 技術的に解決不可能な場合は `malfeasance-update.js` で `status` を `false_positive` に変更し、理由を `note` に記録する
4. 全ての犯罪を解決（または適切に分類）するまで実装作業を開始してはならない

### Step 6: スタブの解決

実装を開始する前に、解決可能なスタブを確認する：

1. `find-all-stubs.js` でスタブを一覧する
2. このチケットで解決可能になったスタブ（依存先チケットが完了した等）を特定する
3. `[::STUB::]` 未付与のスタブを発見したらマーカーを追加し、`malfeasance-create.js` で犯罪として記録する
4. 解決可能なスタブは実装スコープに含めて実際の実装に置き換える
5. 解決不可能なスタブは実装サマリに記録して後続チケットに引き継ぐ

```bash
# スタブの検索
node .claude/scripts/tickets/review/find-all-stubs.js .
```

### グラフ探索（RFC設計グラフ構造探索コマンド）

spec 内の「RFC設計グラフ構造探索コマンド」セクションに記載された query.js コマンドを実行し、対象チケットのグラフ上の位置と依存関係を確認する。

- 全ノード一覧: `crud.js list-nodes --graph=<graph-path>`
- 起点ノードからの探索: `query.js --graph=<graph-path> --source=<rfc-path> --id=<nodeId> --hops=3`

グラフが存在しない場合（dump-ticket-graph-commands.js が「グラフファイルがありません」と記載した場合）は、このサブステップをスキップする。

---

### Step 7: 実装

`/plan-ticket` の計画に従って実装する。乖離が生じたらユーザーに相談する。

**スタブ解決の義務**: 実装中に依存完了により解決可能になった `[::STUB::]` を発見した場合、計画に含まれていなくても**その場で解決（実際の実装への置き換え）する**。解決が不可能な場合は `[::STUB::]` マーカーと理由を残し、実装サマリに記録する。

**テスト実装の義務**: 計画されたユニットテストを全て実装する。ユニットテストでカバーできない正当な理由がある項目のみ、E2Eテストまたは手動テストで代替する。テスト未実装のまま完了として**ならない**。

### Step 8: 不完全実装の能動的探索（必須）

実装が完了したら、その場で完了とする前に**自分が変更した全コードを精査し**、CLAUDE.md の「対象となるコード」に定義された 7 パターンの不完全実装が混入していないか確認する。これは**自動スクリプトでは検出できない漏れを発見するための能動的ステップ**であり、スキップを禁止する。

```bash
# 変更ファイル一覧を確認
git diff "$(git merge-base HEAD origin/master)" --name-only

# 確認後、各ファイルの変更行を精査する
```

**確認基準** — 以下のパターンが変更コードに含まれていないか、1行ずつ確認する：

1. `todo!()`, `unimplemented!()`, `panic!()` — `[::STUB::]` は付いているか
2. 空の関数本体（`fn foo() {}`）— 仮置きのままではないか
3. `return Ok(())` / `return None` / `return Default::default()` — エラー処理が未完了ではないか
4. コメントアウトされた実装コード — 残骸を残していないか
5. `TODO` / `FIXME` / `HACK` / `XXX` — `[::STUB::]` と併記されているか
6. Mock / Fake オブジェクト — `[::STUB::]` は付いているか
7. `#[allow(...)]` — 抑制理由に `[::STUB::]` があるか

不完全実装を発見した場合：
1. `[::STUB::]` 未付与 → その場でマーカーを追加する
2. `malfeasance-create.js` で犯罪として記録する
3. 直ちに解決する（実装完了・マーカー追加等）。解決不可能な場合は `malfeasance-update.js` で `status` を `false_positive` に変更し、理由を `note` に記録する

```bash
# 犯罪を記録
node .claude/scripts/tickets/malfeasance-create.js "<file>" <line> "<description>"
```

記録後、必ず `scan-crimes.sh` を再実行し、犯罪が正しく Malfeasance.json に反映されたことを確認する：

```bash
.claude/scripts/tickets/scan-crimes.sh
```

### Step 9: コンパイル検証とテスト

実装した内容のコンパイル検証とテストを実行する。実行方法は以下の指針に従い、
AI が状況に応じて判断すること：

- **作業ディレクトリ**: 変更範囲に応じて適切なディレクトリ（プロジェクトルート、
  該当クレートのディレクトリなど）で実行する。`cd` で移動が必要な場合は
  サブシェル `(cd <dir> && <command>)` を使い、後続コマンドのカレントディレクトリ
  に影響を与えないようにする。
- **コンパイル検証**: 選択したディレクトリに Makefile が存在し、`check` 系ターゲット
  （`check`, `check-be`, `check-all` 等）が定義されていれば `make` を優先して使用する。
  Makefile がない場合や該当ターゲットがない場合は `cargo check` を使用する。
  必要に応じて `--all-targets` や `--workspace` 等の適切なフラグを付与する。
- **テスト実行**: 同様に、Makefile に `test` ターゲットが定義されていれば `make test`
  を優先し、なければ `cargo test` を使用する。テスト範囲（クレート指定、ワークスペース
  全体など）は変更の影響範囲に応じて判断する。

```bash
# 例: プロジェクトルートで Makefile の check-be を使う場合
(cd "$(git rev-parse --show-toplevel)" && make check-be)

# 例: 特定クレート内で Makefile がない場合
(cd crates/voiput && cargo check --all-targets)
```

**警告・エラー完全解決の原則**:
- `cargo check`（または `make check-*`）で検出された警告・エラーは、**1つ残さず解決しなければならない**。未解決の状態で次ステップに進むことを禁止する。
- `cargo test`（または `make test`）が**1つでも失敗する状態**での次ステップ進行を禁止する。テストが通るまで修正すること。
- やむを得ず警告・エラーを残す場合（別チケットで解決予定など）は、**該当箇所に `[::STUB::]` マーカーとコメントアウトで「どのチケット（チケットID）のタイミングで、どのように解決されるか」を明記した上で、`#[allow(...)]` や `#[cfg(test)]` 等の適切な機構で警告・エラーを抑制し、他のチケットのコンパイルやテストを阻害しない状態にしなければならない**。
- 抑制が不十分で後続のビルドやテストを阻害する場合、それはバグとみなす。

**抑制と `[::STUB::]` の整合性検証**:
- `cargo check`（または `make check-*`）通過後、`#[allow(...)]` 等の抑制機構が使用されている箇所をすべて抽出し、それぞれに対応する `[::STUB::]` マーカーと解決予定チケットIDが同一箇所に明記されていることを確認する
- **抑制のみで `[::STUB::]` が欠如** → マーカーを追加し、解決予定チケットIDと解決方法をコメントに記入する
- **`[::STUB::]` のみで抑制が欠如** → コンパイル検証でエラーが出ているか確認する。エラーがあれば `#[allow(...)]` を追加し、エラーがなければ抑制不要（設計上の意図的スタブ）と判断して良い
- 整合性確認後、**再度コンパイル検証を実行する**

### Step 10: 品質チェック

実装後、変更ファイルを列挙して実行する：

```bash
node ".claude/scripts/tickets/review/run-quality-checks.js" src/file1.rs src/file2.rs
```

パイプでレポートを生成：

```bash
node ".claude/scripts/tickets/review/run-quality-checks.js" src/file1.rs | node ".claude/scripts/tickets/review/generate-report.js"
```

### Step 11: 実装成果の保存

コンパイル検証・テスト・品質チェック通過後、実装内容のサマリーを `update-ticket.js` でチケットの JSON フィールドに保存する：

```bash
echo '{
  "changes": [{"before":"旧状態","after":"新状態","description":"変更内容"}],
  "notes": "実装サマリー:\n- 変更ファイル: a.rs, b.rs\n- 主要な変更点: ...\n- テスト結果: 全xx件成功"
}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"
```

これにより、後でチケットを確認したときに「どのように実装されたか」を追跡できる。

### Step 12: done に遷移

コンパイル検証・テスト・品質チェック通過後：

```bash
echo '{"status":"done"}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"
```

品質問題がある場合は修正してから `done` にする。やむを得ない中断時は `todo` のまま（または `notes` に中断理由を記録）。
