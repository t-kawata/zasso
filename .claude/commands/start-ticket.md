---
description: 承認済みチケットの実装を実行する。ステータスを implementing に遷移させ、品質チェック通過後に done へ進める。引数なしならチケットIDを質問する。
---

# /start-ticket

**役割**: `approved` チケットの実装。

## ワークフローにおける位置づけ

このプロジェクトの作業の流れは `make → plan → start → review` である。ただし、各コマンドは必ずしも連続して実行されず、ユーザーの作業スタイルに応じて非連続的に使用される：

- **`/make-ticket`**: 複数のチケットをまとめて作成することが多い。作成後、すぐに計画・実装されるとは限らない。
- **`/plan-ticket` + `/start-ticket`**: ひとつのチケットに対して連続実行されることが多い（計画承認→即実装）。
- **`/review-ticket`**: 完了したチケットをまとめてレビューすることが多い。

**ルール**: 自分の役割を完了したら、必要に応じて次のアクションを提案してもよい（例：「品質レビューを行う場合は /review-ticket を実行してください」）。ただし、決定はユーザーに委ね、押し付けない。

## 引数の解釈

- 引数なし → ユーザーに「どのチケットを実装しますか？」と質問する
- 数字 → チケットID

## 必須条件

チケットが `approved` ステータスであること。

## Boy Scout Rule

実装中に翻訳可能性を損なっている既存コードを見つけたら、スコープ外でも積極的に直す：エラー握りつぶし→伝播、ハードコード値→定数化、汎用変数名→ドメイン名、複数責務関数→分割。**計画に含まれていなくても実施する。**

## 使用スクリプト一覧

`$_R/scripts/tickets/` 配下（詳細は `.claude/scripts/tickets/README.md` を参照）：

| スクリプト | 引数 |
|---|---|
| `resolve-ticket.js` | `<id>` |
| `check-status.js` | `<id> <status>` |
| `update-ticket-status.js` | `<id> <status>` |
| `review/run-quality-checks.js` | `<files...>` |
| `review/generate-report.js` | （stdin経由） |
| `update-frontmatter.js` | `<id> <key> <val>` |
| `read-artifact.js` | `<id> <type>` |
| `save-artifact.js` | `<id> <type>`（stdin） |

## ワークフロー

### Step 0: 初期化

```bash
_R="$(git rev-parse --show-toplevel)/.claude"
```

### Step 1: 存在確認 + approved 確認

```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/resolve-ticket.js" "$ARGUMENTS"
```

`exists` が false なら終了。存在すれば status を確認：

```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/check-status.js" "$ARGUMENTS" approved
```

`matches` が false なら「このチケットは <currentStatus> です。/plan-ticket で先に計画を策定し承認を受けてください」と伝えて終了。

### Step 2: implementing に遷移

```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/update-ticket-status.js" "$ARGUMENTS" implementing
```

### Step 3: spec + plan 読み取り

`read-artifact.js` で spec 全文と plan.md を機械的に読み取る：

```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/read-artifact.js" "$ARGUMENTS" spec
```

```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/read-artifact.js" "$ARGUMENTS" plan
```

### 依存・関連チケットID の充足確認

実装を開始する前に、「依存・関連チケットID」の依存関係が充足されていることを確認する：

1. spec から「依存・関連チケットID」の記述を読み取る
2. 「先行実装必須」と記載されたチケットがすべて `done` ステータスであることを `check-status.js` で確認する
3. 未完了の先行依存がある場合はユーザーに報告し、実装順序の調整または依存チケットの完了を待つ

```bash
_R="$(git rev-parse --show-toplevel)/.claude"
# spec から依存・関連チケットID を抽出
node "$_R/scripts/tickets/read-artifact.js" "$ARGUMENTS" spec | grep -A5 "依存・関連チケットID"

# 各参照先チケットのステータス確認
node "$_R/scripts/tickets/check-status.js" "<参照チケットID>" "done"
```

依存関係に問題がないことを確認した上で実装に進む。

### Step 4: 実装

`/plan-ticket` の計画に従って実装する。乖離が生じたらユーザーに相談する。

**テスト実装の義務**: 計画されたユニットテストを全て実装する。ユニットテストでカバーできない正当な理由がある項目のみ、E2Eテストまたは手動テストで代替する。テスト未実装のまま完了として**ならない**。

### Step 5: 品質チェック

実装後、変更ファイルを列挙して実行する：

```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/review/run-quality-checks.js" src/file1.rs src/file2.rs
```

パイプでレポートを生成：

```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/review/run-quality-checks.js" src/file1.rs | node "$_R/scripts/tickets/review/generate-report.js"
```

### Step 6: 実装成果の保存

品質チェック通過後、実装内容のサマリーを `save-artifact.js` にパイプして保存する：

```bash
_R="$(git rev-parse --show-toplevel)/.claude"
cat <<'IMPL_EOF' | node "$_R/scripts/tickets/save-artifact.js" "$ARGUMENTS" implementation
# 変更したファイル一覧と実装内容の概要
IMPL_EOF
```

これにより、後でチケットを確認したときに「どのように実装されたか」を追跡できる。

### Step 7: done に遷移

品質チェック通過後：

```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/update-ticket-status.js" "$ARGUMENTS" done
```

品質問題がある場合は修正してから `done` にする。やむを得ない中断時は `approved` に戻す。
