---
description: 例: /review-ticket P0-1。第1引数にチケットID（P{phaseID}-{ticketID}形式）を指定すると、実装済みチケットの品質レビューを実行。/plan-ticket で定義された全レビュー方法を再実行し、品質通過後に reviewed へ遷移する。引数なしならチケットIDを質問する。
---

# /review-ticket

**第一級規則 — [::STUB::] マーカー絶対義務**: 不完全な実装（スタブ・モック・仮実装・プレースホルダー等、名称を問わず）には全て `[::STUB::]` マーカーを付与しなければならない。これは死守すべき絶対的法規であり、違反は「犯罪」として Malfeasance.json に記録される。本コマンドの全フェーズにおいて、Malfeasance.json を読み取り未解決の犯罪がないことを確認すること。違反を発見した場合は直ちに解決するか、その場でマーカーを追加・記録する。

**役割**: `done` チケットの品質検証。`/plan-ticket` のレビュー方法を全て再実行する。

## ワークフローにおける位置づけ

このプロジェクトの作業の流れは `make → plan → start → review` である。ただし、各コマンドは必ずしも連続して実行されず、ユーザーの作業スタイルに応じて非連続的に使用される：

- **`/make-ticket`**: 複数のチケットをまとめて作成することが多い。作成後、すぐに計画・実装されるとは限らない。
- **`/plan-ticket` + `/start-ticket`**: ひとつのチケットに対して連続実行されることが多い（計画承認→即実装）。
- **`/review-ticket`**: 完了したチケットをまとめてレビューすることが多い。

**ルール**: 自分の役割を完了したら、必要に応じて次のアクションを提案してもよい。ただし、決定はユーザーに委ね、押し付けない。

## 引数の解釈

- 引数なし → ユーザーに「どのチケットをレビューしますか？」と質問する
- `P{phaseID}-{ticketID}` 形式（例: `P0-1`） → チケットID
- 数字のみ → エラー: 「チケットIDは `P{phaseID}-{ticketID}` 形式（例: `P0-1`）で指定してください」

## Boy Scout Rule — レビュー観点

**実装者が既存コードの改善を行ったか検証する。** 新コードの品質だけでなく、既存コードに対する改善痕跡（エラー伝播への修正、定数化、関数分割等）も確認する。翻訳可能性チェック（grep パターンは言語に応じて選択）：

- 関数定義を grep し、動詞句でない関数名がないか
- 変数宣言を grep し、1文字変数や汎用名が新たに追加されていないか
- マジックナンバーが直接書かれていないか
- デバッグ出力が残っていないか
- コメントは「なぜ」のみか（「何を」はコード自身が語るべき）

## 使用スクリプト一覧

`.claude/scripts/tickets/` 配下。詳細は `.claude/scripts/tickets/README.md` を参照。

| スクリプト | 引数 | 説明 |
|---|---|---|
| `get-ticket.js` | `<PATH of Tickets.json> P{phaseID}-{ticketID}` | チケット情報の取得 |
| `update-ticket.js` | `<PATH of Tickets.json> P{phaseID}-{ticketID}`（stdin: 更新JSON） | チケットフィールドの更新・status 変更 |
| `review/run-quality-checks.js` | `<files...>` | 静的品質チェック |
| `review/generate-report.js` | （stdin経由） | 品質レポート生成 |

## ワークフロー

### Step 1: 存在確認 + done 確認

Tickets.json のパスを決定する（カレントディレクトリの Tickets.json を優先）。

```bash
node ".claude/scripts/tickets/get-ticket.js" "Tickets.json" "$ARGUMENTS"
```

`success` が false なら終了。存在すれば `.ticket.status` を確認：
- `done` → レビューを続行
- それ以外 → 「このチケットはまだ実装完了（done）していません。先に /start-ticket で実装を完了してください」と伝えて終了

### Step 2: チケットフィールド読み取り

```bash
node ".claude/scripts/tickets/get-ticket.js" "Tickets.json" "$ARGUMENTS"
```

出力の `ticket` オブジェクトから `scope`, `testVerification`, `testExceptions`, `changes`, `notes` 等を読み取り、Acceptance Criteria と実装内容を確認する。`testVerification` に記載されたユニットテストが全て実装されているか確認する。

### Step 3: 依存・関連チケットID の整合性検証

`relatedTicketIds` フィールドで記述された依存関係が実装を通じて正しく維持されたか検証する：

1. `get-ticket.js` でチケットの `relatedTicketIds` を読み取る
2. 各参照先チケットを `get-ticket.js` で読み、相互の依存関係記述に矛盾がないかクロスチェックする（A が B に依存と書いているのに、B が A に依存と書いていない、など）
3. 実際の実装順序が依存関係と整合しているか確認する
4. 不足や矛盾があればレビュー報告書に記録する

```bash
# チケットから relatedTicketIds を抽出
node ".claude/scripts/tickets/get-ticket.js" "Tickets.json" "$ARGUMENTS"

# 各参照先チケットも読み取り、相互参照の矛盾を確認
for ref_id in <抽出した参照ID一覧>; do
  node ".claude/scripts/tickets/get-ticket.js" "Tickets.json" "$ref_id"
done
```

### Step 4: 犯罪の緊急解決（最優先 — 第一級規則）

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

### Step 5: [::STUB::] の一覧と評価

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

### Step 6: 不完全実装の能動的探索（必須）

コンパイル検証に入る前に、レビュー対象の**変更コード全体を精査し**、CLAUDE.md の「対象となるコード」に定義された 7 パターンの不完全実装が混入していないか確認する。これは**自動スクリプトでは検出できない漏れを発見するための能動的ステップ**であり、スキップを禁止する。

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

### Step 7: コンパイル検証とユニットテスト検証

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

続けて、plan のテスト計画および spec の Test Plan で定義されたユニットテストが全て実装されていることを確認し、テストを実行する。実行の指針はコンパイル検証と同様とする：

テストが存在しない、または失敗がある場合 → 修正してから先に進む。
「ユニットテスト不可能な項目（例外）」として spec に明記されたものだけが未テストを許容される。

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
}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"
```

これにより、後でチケットを確認したときに「どのようにレビューされ、品質が担保されているか」を追跡できる。

### Step 11: reviewed に遷移

全チェック通過後、レビュー完了日と共に status を更新する：

```bash
echo "{\"status\":\"reviewed\",\"completedAt\":\"$(date +%Y-%m-%d)\"}" | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"
```

## 不通過時の判断

- **軽微**: AI がその場で修正し再チェック
- **重大**: ユーザーに報告して修正方針を相談。差し戻しが必要な場合は `todo` に戻す：

  ```bash
  echo '{"status":"todo"}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"
  ```
