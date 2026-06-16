---
description: 実装済みチケットの品質レビュー。/plan-ticket で定義された全レビュー方法を再実行し、品質通過後に reviewed へ遷移する。引数なしならチケットIDを質問する。
---

# /review-ticket

**役割**: `done` チケットの品質検証。`/plan-ticket` のレビュー方法を全て再実行する。

## ワークフローにおける位置づけ

このプロジェクトの作業の流れは `make → plan → start → review` である。ただし、各コマンドは必ずしも連続して実行されず、ユーザーの作業スタイルに応じて非連続的に使用される：

- **`/make-ticket`**: 複数のチケットをまとめて作成することが多い。作成後、すぐに計画・実装されるとは限らない。
- **`/plan-ticket` + `/start-ticket`**: ひとつのチケットに対して連続実行されることが多い（計画承認→即実装）。
- **`/review-ticket`**: 完了したチケットをまとめてレビューすることが多い。

**ルール**: 自分の役割を完了したら、必要に応じて次のアクションを提案してもよい。ただし、決定はユーザーに委ね、押し付けない。

## 引数の解釈

- 引数なし → ユーザーに「どのチケットをレビューしますか？」と質問する
- 数字 → チケットID

## Boy Scout Rule — レビュー観点

**実装者が既存コードの改善を行ったか検証する。** 新コードの品質だけでなく、既存コードに対する改善痕跡（エラー伝播への修正、定数化、関数分割等）も確認する。翻訳可能性チェック（grep パターンは言語に応じて選択）：

- 関数定義を grep し、動詞句でない関数名がないか
- 変数宣言を grep し、1文字変数や汎用名が新たに追加されていないか
- マジックナンバーが直接書かれていないか
- デバッグ出力が残っていないか
- コメントは「なぜ」のみか（「何を」はコード自身が語るべき）

## 使用スクリプト一覧

`$_R/scripts/tickets/` 配下（詳細は `.claude/scripts/tickets/README.md` を参照）：

| スクリプト | 引数 |
|---|---|
| `resolve-ticket.js` | `<id>` |
| `check-status.js` | `<id> <status>` |
| `update-ticket-status.js` | `<id> <status>` |
| `review/run-quality-checks.js` | `<files...>` |
| `review/generate-report.js` | （stdin経由） |
| `validate-structure.js` | （なし） |
| `update-frontmatter.js` | `<id> <key> <val>` |
| `read-artifact.js` | `<id> <type>` |
| `save-artifact.js` | `<id> <type>`（stdin） |

## ワークフロー

### Step 0: 初期化

```bash
_R="$(git rev-parse --show-toplevel)/.claude"
```

### Step 1: 存在確認 + done 確認

```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/resolve-ticket.js" "$ARGUMENTS"
```

`exists` が false なら終了。存在すれば status を確認：

```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/check-status.js" "$ARGUMENTS" done
```

`matches` が false なら「このチケットはまだ実装完了（done）していません。先に /start-ticket で実装を完了してください」と伝えて終了。

### Step 2: spec + implementation 読み取り

```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/read-artifact.js" "$ARGUMENTS" spec
```

```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/read-artifact.js" "$ARGUMENTS" implementation
```

spec の Acceptance Criteria と実装サマリを確認する。spec の Test Plan に記載されたユニットテストが全て実装されているか確認する。

### 依存・関連チケットID の整合性検証

spec に記述された「依存・関連チケットID」が実装を通じて正しく維持されたか検証する：

1. spec から「依存・関連チケットID」の記述を読み取る
2. 各参照先チケットの spec を `read-artifact.js` で読み、相互の依存関係記述に矛盾がないかクロスチェックする（Aの spec が B に依存と書いているのに、Bの spec が A に依存と書いていない、など）
3. 実際の実装順序が依存関係と整合しているか確認する
4. 不足や矛盾があればレビュー報告書に記録する

```bash
_R="$(git rev-parse --show-toplevel)/.claude"
# spec から依存・関連チケットID を抽出
node "$_R/scripts/tickets/read-artifact.js" "$ARGUMENTS" spec | grep -A5 "依存・関連チケットID"

# 各参照先チケットの spec も読み取り、相互参照の矛盾を確認
for ref_id in <抽出した参照ID一覧>; do
  node "$_R/scripts/tickets/read-artifact.js" "$ref_id" spec | grep -A5 "依存・関連チケットID"
done
```

### [::STUB::] の一覧と評価

`find-all-stubs.js` で全スタブを抽出し、以下の3分類で評価する：

```bash
_R="$(git rev-parse --show-toplevel)/.claude"
# 全スタブの一覧取得
node "$_R/scripts/tickets/review/find-all-stubs.js" "<プロジェクトルートまたは対象ディレクトリ>"
```

**分類基準**:

1. **解決可能なスタブ** — 依存先チケットが完了し、現状で実際の実装に置き換えられるもの
   → **その場で実装し、`[::STUB::]` マーカーを除去する**

2. **別チケットが必要なスタブ** — 解決には別の新規チケットが必要なもの
   → **新規チケットの作成をユーザーに提案する**

3. **保留妥当なスタブ** — 将来的なチケットで解決予定であり、現在はスタブのままが正しいもの
   → **理由を明確にし、解決予定チケットIDを確認してユーザーに報告する**

**未マークスタブの発見時**: コードの内容から明らかにスタブと判断されるにも関わらず `[::STUB::]` が付与されていない場合、**その場でマーカーを追加する**。その後、上記の分類に従って評価する。

スタブ評価の結果はレビュー報告書に必記録すること。

### Step 3: コンパイル検証とユニットテスト検証

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

### Step 4: 静的品質チェック

```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/review/run-quality-checks.js" src/file1.rs src/file2.rs | node "$_R/scripts/tickets/review/generate-report.js"
```

### Step 4: 構造整合性チェック

```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/validate-structure.js"
```

出力の `valid` が false なら issues を修正してから続行。

### Step 5: 翻訳可能性チェック

`/plan-ticket` で定義された grep コマンドを全て再実行する。

### Step 6: レビュー報告書の保存

全チェック通過後、レビュー結果を `save-artifact.js` にパイプして保存する：

```bash
_R="$(git rev-parse --show-toplevel)/.claude"
cat <<'REVIEW_EOF' | node "$_R/scripts/tickets/save-artifact.js" "$ARGUMENTS" review
# 各チェックの結果（静的品質チェック、構造整合性チェック、翻訳可能性チェックの結果と合否、見つかった問題と修正内容）
REVIEW_EOF
```

これにより、後でチケットを確認したときに「どのようにレビューされ、品質が担保されているか」を追跡できる。

### Step 7: reviewed に遷移

全チェック通過後：

```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/update-ticket-status.js" "$ARGUMENTS" reviewed
```

## 不通過時の判断

- **軽微**: AI がその場で修正し再チェック
- **重大**: ユーザーに報告して修正方針を相談。差し戻しが必要な場合は implementing に戻す：

  ```bash
  _R="$(git rev-parse --show-toplevel)/.claude"
  node "$_R/scripts/tickets/update-ticket-status.js" "$ARGUMENTS" implementing
  ```
