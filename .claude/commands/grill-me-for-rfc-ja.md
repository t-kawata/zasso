# /grill-me-for-rfc

## 概要

調査情報をもとに、RFC設計書を「完全網羅・スコープ委譲禁止・スタブ禁止」の強い制約のもとで書き上げるためのインタラクティブなgrillセッションを行うコマンド。

## 使い方

```
/grill-me-for-rfc <調査情報パス> <RFC出力ファイルパス>
（改行後に補足情報を自由記述可能）
```

- `<調査情報パス>`: 調査済みファイルまたはディレクトリのパス
- `<RFC出力ファイルパス>`: 生成するRFC設計書のファイルパス（.md）
- 自由記述: 補足情報や制約など（任意）

---

## 引数から変数への機械的な束縛

コマンドに渡された2つの引数は、以降の全ステップで以下の変数として参照する：

| 変数 | 導出元 | 値 |
|------|--------|-----|
| `$RESEARCH_PATH` | 第1引数 | 調査情報のファイルまたはディレクトリパス |
| `$RFC_OUTPUT_PATH` | 第2引数 | RFC設計書の出力先ファイルパス（.md） |
| `$RFC_DIR` | `dirname "$RFC_OUTPUT_PATH"` から機械的に導出 | RFC関連ファイル（Status.json / DesignTree.json / CheckList.md 等）を格納するディレクトリ |

**`init.js` が実行された時点で `$RESEARCH_PATH` と `$RFC_OUTPUT_PATH` は `Status.json` に永続化されるため、以降の全ステップでは `$RFC_DIR` のみを意識すればよい。**

### スキーマ自動検証 (Schema Validation Gate)

ファイル操作を行う全スクリプト（`init.js` / `update-tree.js` / `update-status.js` / `generate-checklist.js`）は、処理成功後に自動的に `check-all-schema.js` を内部呼び出しし、Status.json / DesignTree.json / CheckList.md のスキーマ整合性を検証する。

- **検証に失敗した場合はスクリプトが `exit(1)` する**。その場合、AIはエラー内容を読み、該当ファイルを修正してからスクリプトを再実行しなければならない。
- **検証が通るまで次のステップに進んではならない。** スキーマエラーを無視して先に進むことは禁止。
- `check-all-schema.js` は単独でも実行可能。任意のタイミングで `node .claude/scripts/grill-me-for-rfc/check-all-schema.js "$RFC_DIR"` を実行できる。

### セッション状況確認 (Session Status)

`session-status.js` は Status.json と DesignTree.json から現在の工程・次のアクションを機械的に導出する。迷ったらまずこれを実行する：

```bash
node .claude/scripts/grill-me-for-rfc/session-status.js "$RFC_DIR"
```

出力例：
```
📋 Session Status
  State: GRILLING
  現在の工程: STEP 2 — Grill セッション中
  次のアクション: tree-query.js tree で未解決ノードを確認し、質問を生成する
  ノード: 5 総数 / 3 open
  ループ回数: 0
```

---

## 実行手順

### STEP 0: 初期化

```bash
node .claude/scripts/grill-me-for-rfc/init.js "$RESEARCH_PATH" "$RFC_OUTPUT_PATH"
```

- RFC出力ファイルと同じディレクトリに以下の雛形を生成する:
  - `CheckList.md` — RFC要件チェックリスト（後でSTEP 4で充填）
  - `DesignTree.json` — 設計ツリー（空ノード）
  - `Status.json` — 進捗ステータス（初期state: GRILLING）
- **再開モード**: `Status.json` が存在する場合、ユーザーに「前回の続きから再開しますか？」と確認する（RFC出力ファイルの有無は問わない。RFCはSTEP 5で初めて書かれるため）。
- **上書き確認モード**: RFC出力ファイルは存在するが `Status.json` がない場合、ユーザーに上書き確認をする。承諾を得たら古いRFCファイルを削除してから `init.js` を再実行すること。

```bash
node .claude/scripts/grill-me-for-rfc/list-files.js "$RFC_DIR"
```

- 調査情報パスがファイルならそのパスを、ディレクトリならフラットな全ファイルパス一覧をJSON配列で出力する。
- 出力されたパス一覧の全ファイルを読み込み、調査情報として把握する。

---

### STEP 1: DesignTree 初期ノード生成

調査情報を読み終えた後、最初のgrill質問を出す前に、把握した調査内容から設計ツリーの初期ノード案を生成して書き込む:

```bash
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" add '{"id":"...","title":"...","status":"open","questions":[],"children":[]}'
```

---

### STEP 2: grillセッション

## ★ 第一級規則（絶対に遵守すること）

1. **質問は必ずユーザーがYes/No または ABC選択肢で回答できる「AIの提案」形式にすること。**
   - 良い例: 「Aのアプローチを取りますか？ A) Yes  B) No  C) 別案」
   - 悪い例: 「どのようなアプローチを取りたいですか？」（自由記述を強いる形式は禁止）
2. **質問は複数まとめて出してよい。ただし多くなりすぎないよう注意し、関連する質問は統合すること。**
3. **grillセッション中はRFCを書かない。質問と回答のみに集中する。**
4. **ユーザーが回答したら、該当するDesignTreeノードを即座に更新すること。**

## DesignTree 更新（回答受け取り後に必ず実行）

```bash
# 1件resolve
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" resolve "<node_id>" "<回答サマリー>"

# 複数件を一括resolve（1ターンで複数質問に回答された場合）
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" batch-resolve '["id1","id2","id3"]' "<回答サマリー>"

# 新ノードを追加（設計ツリーの拡張）
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" add '<node_json>'

# 子ノードを追加（設計ツリーの洗練）
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" add-child "<parent_id>" '<node_json>'

# ノードタイトルを洗練
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" refine "<node_id>" "<new_title>"

# ノードを削除（子孫も全て削除）
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" delete "<node_id>"

# open状態のノード数確認
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" open-count
```

## DesignTree 可視化・検索

ツリー構造の俯瞰や特定ノードの検索には `tree-query.js` を使用する（読み取り専用、スキーマ検証不要）。

```bash
# ツリー全体を階層表示（🔲 = open, ✅ = resolved）
node .claude/scripts/grill-me-for-rfc/tree-query.js "$RFC_DIR" tree

# キーワード検索（ノードの id / title を部分一致）
node .claude/scripts/grill-me-for-rfc/tree-query.js "$RFC_DIR" search "<キーワード>"

# ルートから特定ノードまでの経路を表示
node .claude/scripts/grill-me-for-rfc/tree-query.js "$RFC_DIR" path "<node_id>"

# 統計情報（総数 / open / resolved / 最大深度 / 進行度）
node .claude/scripts/grill-me-for-rfc/tree-query.js "$RFC_DIR" stats
```

## ステータス更新

```bash
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state GRILLING
```

---

### STEP 3: grillセッション終了判定

`open-count` が0になったと判断した時点で、ユーザーに終了を提案する。
終了提案と同時に「RFC要件チェックリストの生成を開始してよいか」をユーザーに確認する。

```bash
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" open-count
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state CHECKLIST_PENDING
```

---

### STEP 4: CheckList.md 生成

ユーザーが承認したら、スクリプトでCheckList.mdを機械生成した後、**AIが必ず目視チェックして補足事項を追記する**こと。

```bash
node .claude/scripts/grill-me-for-rfc/generate-checklist.js "$RFC_DIR"
```

生成されるチェックリストの構造（2段階）:

```
## §N セクション名  ← トップレベルノード
- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

  ### §N.M 子ノード名  ← DesignTreeノード単位
  - [ ] <子ノードのtitle> が設計として完全に記述されている
  - [ ] コードスニペットが含まれている
  - [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと
```

**★ スクリプト生成後、AIが以下を行うこと:**

- 全チェック項目を目視確認し、DesignTree上では解決済みだが記述が曖昧なノードに補足説明を追記する
- プロジェクト固有の制約（言語・フレームワーク・パフォーマンス要件など）をチェック項目として追記する
- 追記完了後にユーザーへCheckList.mdの確認・承認を求める

```bash
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state CHECKLIST_APPROVED
```

---

### STEP 5: RFC執筆

ユーザーがCheckListを承認したらRFCを書き始める。

## RFC強制制約（絶対に遵守すること）

- **TBD / TODO / 後続バージョンで対応 / スタブ / 委譲 という表現・概念を一切含めてはならない。**
- **1枚のRFCがDesign Treeを完全網羅した完結した設計として書き切られなければならない。**
- **各設計判断には必ずコード例（コードスニペット）を伴わせること。**
- RFCのセクション構成はIETFスタイルに準拠する:
  - Abstract（概要）
  - Motivation（動機・背景）
  - Design（設計）
  - Implementation（実装詳細）
  - Appendix（付録・参考）

```bash
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state WRITING
```

---

### STEP 6: CheckList照合・推敲

RFC執筆後、CheckList.mdの全項目を機械的に照合する。

```bash
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state REVIEWING
```

- 未達項目があれば修正し、全項目が ✅ になるまで推敲を繰り返す。
- **TBD / TODO / 別バージョンで対応 という表現を検出したら即座に警告し、該当箇所を埋めるまでRFC完成を宣言しない。**
- 全項目クリアしたらユーザーに報告する。

---

### STEP 7: 再grill判定

RFC執筆によって新たに発見された未解決ノードや設計ツリーの拡張が必要な箇所があれば、STEP 2に戻り再grillを行う。

```bash
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state GRILLING
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" inc-loop
```

- **ループが3回を超えた時点で、ユーザーに「長期化している理由と現状」を報告してから継続する。**
- 再grillが不要と判断した場合のみ、RFC完成を宣言する。

---

### STEP 8: RFC完成宣言

以下の全条件が満たされた場合にのみ完成を宣言する:

- DesignTree の全ノードが `resolved`（`open-count` = 0）
- CheckList の全項目が ✅
- RFC本文に TBD / TODO / スタブ / 委譲 が0件

```bash
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state DONE
```
