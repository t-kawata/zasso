---
description: >
  例: /drill-rfc-down /path/to/RFC_ROOT.md。
  既存RFCに対して grill 方式の質問攻めで考慮不足・設計不足の穴を塞ぐ。
  追記のみ。破壊的変更禁止。
---

# /drill-rfc-down

**役割**: 既存RFCに grill 方式で質問攻めし考慮不足を塞ぐ。追記のみ、破壊的変更禁止。

## 引数

- **第1引数（必須）**: 追記対象のRFCファイルパス

## 使用スクリプト一覧

| スクリプト | 引数 | 説明 |
|---|---|---|---|
| `init-for-drill-rfc-down.js` | `<target>` | 既存セッションファイル確認。なければinit.js呼び出し |
| `update-tree.js` | `<dir> <op> [args]` | DesignTree操作。add/resolve/delete/show/open-count |
| `update-status.js` | `<dir> <state>` | Status.json の state を更新 |
| `session-status.js` | `<dir>` | 現在の工程・未解決ノード数を表示 |
| `validate-question-format.js` | `<text>` | 質問文のフォーマットをスキーマ検証 |
| `generate-checklist.js` | `<dir>` | 解決済みDesignTreeからCheckList.mdを生成 |
| `check-all-schema.js` | `<dir>` | Status.json / DesignTree.json / CheckList.md の整合性検証 |
| `tree-query.js` | `<dir> <op>` | 未解決ノード一覧の取得 |
| `list-files.js` | `<dir>` | research-path が指すファイルパスの一覧を出力 |

## ワークフロー

### STEP 0: 初期化

```bash
TARGET_RFC="${ARGUMENTS%% *}"
RFC_DIR="$(dirname "$TARGET_RFC")"
SCRIPT_DIR=".claude/scripts/grill-me-for-rfc"
if [ ! -f "$TARGET_RFC" ]; then echo "エラー: $TARGET_RFC"; exit 1; fi
node "$SCRIPT_DIR/init-for-drill-rfc-down.js" "$TARGET_RFC"
node "$SCRIPT_DIR/session-status.js" "$RFC_DIR"
```

### STEP 1: DesignTree 初期ノード生成

対象RFCを読み、考慮不足箇所をノードとして追加:

```bash
node "$SCRIPT_DIR/update-tree.js" "$RFC_DIR" add '{"id":"Q1","title":"...","status":"open","children":[]}'
```

### STEP 2: grillセッション

## ★ 第一級規則（絶対に遵守すること）

1. **質問は必ず、以下の構造を順に含むこと。各部分の長さは設計判断の複雑さに応じて十分に説明すること。**

   0. **質問ID**: 質問の先頭に `Q<番号>` 形式のIDを付与する（例: `Q1`, `Q2`...）。ターン内で重複しない一意の番号にすること。
   1. **背景と理由の説明**: なぜこの設計判断が必要か、どのような選択肢があるか、それらのトレードオフは何かを、設計判断が理解できる十分な長さで説明する。簡潔にまとめようとしないこと。
   2. **選択肢の改行リスト**: 各選択肢を1行ずつ、マークダウンリスト形式で縦に並べる。同じ行に2つ以上の選択肢を並べてはならない。
   3. **AIが推す1つの選択肢とその理由**: 上記のうちどの選択肢を推すのかを明示し、他の選択肢ではなくこれを選ぶ具体的な根拠を説明する。理由がないまま推奨だけ述べることは禁止。

**ユーザーは Yes/No または ABC の選択肢のみで回答する。AIは自由回答を絶対に求めてはならない（ユーザーが自発的に自由回答をした場合の受け取りは妨げない）。**

2. **質問の粒度は粗くまとめること。「1設計判断＝1質問」ではなく、1質問あたり3〜5ノードを扱い、1ターンあたり最大5〜10質問を提示する。**

   - 1質問は「認証方式の選択」のようなサブ領域をカバーし、その中で3〜5件の関連判断をまとめて聞く
   - 1ターンはより大きな設計領域（例: 認証周り全体）をカバーし、5〜10質問で構成する
   - 「まず大枠（アーキテクチャレベル）を決める → その後詳細を詰める」の2パス構成を意識する
   - ターンごとに「このターンで確定したこと」を一言まとめてから次のターンに移る
3. **grillセッション中はRFCを書かない。質問と回答のみに集中する。**
4. **ユーザーが回答したら、該当するDesignTreeノードを即座に更新すること。**

### 質問形式の自動検証ゲート（絶対遵守）

ユーザーに質問を提示する前に、**必ず `validate-question-format.js` を通過しなければならない。通過していない質問をユーザーに提示することを禁止する。**

```bash
node .claude/scripts/grill-me-for-rfc/validate-question-format.js "ここに質問文を入れる"
```

- 検証が `valid: true` を返すまで、質問をユーザーに提示してはならない
- 検証が `valid: false` を返した場合、エラーメッセージに従って質問を修正し、再検証すること
- この検証をスキップすることは第一級規則違反であり、許されない

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

### STEP 3: grillセッション終了判定

`open-count` が0になったと判断した時点で、ユーザーに終了を提案する。
終了提案と同時に「RFC要件チェックリストの生成を開始してよいか」をユーザーに確認する。

```bash
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" open-count
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state CHECKLIST_PENDING
```

### STEP 4: チェックリスト生成

ユーザーが承認したら、スクリプトでCheckList.mdを機械生成した後、**AIが必ず目視チェックして補足事項を追記する**こと。CheckList.md には、対象RFCとの関係性およびgrillで対応した設計判断の漏れがないかの確認項目も含める。

```bash
node .claude/scripts/grill-me-for-rfc/generate-checklist.js "$RFC_DIR" --no-backup
```

生成されるチェックリストの構造（2段階）:

```
## 問題領域名  ← トップレベルノード
- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO という表現が含まれていないこと
- [ ] 対象RFCとの関係性が明確である
- [ ] grillで解決した設計判断が全て反映されている

  ### 子ノード名  ← DesignTreeノード単位
  - [ ] <子ノードのtitle> が設計として完全に記述されている
  - [ ] コードスニペットが含まれている
  - [ ] TBD / TODO という表現が含まれていないこと
```

**★ スクリプト生成後、AIが以下を行うこと:**

- 全チェック項目を目視確認し、DesignTree上では解決済みだが記述が曖昧なノードに補足説明を追記する
- プロジェクト固有の制約（言語・フレームワーク・パフォーマンス要件など）をチェック項目として追記する
- 追記完了後にユーザーへCheckList.mdの確認・承認を求める

```bash
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state CHECKLIST_APPROVED
```

### STEP 5: 対象RFCに追記（編集ポリシー厳守）

**追記最優先。全文書き換え・セクション削除・上書き禁止。**

- 追記可能 → 対象箇所に新しい設計判断を追記
- 追記不可能 → 最小限の部分修正
- 絶対禁止: 全文書き換え・削除・出力先の変更

```bash
wc -l "$TARGET_RFC"
```

### STEP 6: CheckList照合・推敲

追記後、CheckList.mdの全項目を機械的に照合する。

```bash
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state REVIEWING
```

- 未達項目があれば修正し、全項目が ✅ になるまで推敲を繰り返す。
- **TBD / TODO / 別バージョンで対応 という表現を検出したら即座に警告し、該当箇所を埋めるまで完成を宣言しない。**
- 全項目クリアしたらユーザーに報告する。

---

### STEP 7: 再grill判定

追記によって新たに発見された未解決ノードや設計ツリーの拡張が必要な箇所があれば、STEP 2に戻り再grillを行う。

```bash
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state GRILLING
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" inc-loop
```

- **ループが3回を超えた時点で、ユーザーに「長期化している理由と現状」を報告してから継続する。**
- 再grillが不要と判断した場合のみ、完成を宣言する。

---

### STEP 7a: I/O 境界参考情報の追記

設計ツリー上の全判断が解決したRFCに、将来の `/split-rfc-to-children` で安全に分割するための I/O 境界参考情報を追記する。

```bash
# テンプレート挿入
node "$SCRIPT_DIR/insert-io-boundary-template.js" "$TARGET_RFC"

# AI による内容記入（[::IO-INFO-STUB::] マーカーを手がかりに、RFC既存記述から内容を生成して埋める）
```

**AI はテンプレート内の `<!-- [::IO-INFO-STUB::] ... -->` マーカーを1つずつ読み、その指示に従ってRFCの既存記述から適切な内容を生成し、マーカーを置き換える。マーカーが1つも残らなくなるまでこの作業を繰り返す。**

記入漏れ検証:

```bash
node "$SCRIPT_DIR/check-io-stubs.js" "$TARGET_RFC"
if [ $? -ne 0 ]; then
  echo "エラー: 未記入の [::IO-INFO-STUB::] マーカーが残っています。AI による内容記入が不完全です。"
  exit 1
fi
```

---

### STEP 8: 完成宣言

以下の全条件が満たされた場合にのみ完成を宣言する:

- DesignTree の全ノードが `resolved`（`open-count` = 0）
- CheckList の全項目が ✅
- RFC本文に TBD / TODO / スタブ / 委譲 が0件
- 追記内容が対象RFCと整合している

```bash
node .claude/scripts/grill-me-for-rfc/update-status.js "$RFC_DIR" set-state DONE
node "$SCRIPT_DIR/check-all-schema.js" "$RFC_DIR"
```

### STEP 9: 完了報告

```bash
echo "=== /drill-rfc-down 完了 ==="
echo "対象: $TARGET_RFC"
wc -l "$TARGET_RFC"
