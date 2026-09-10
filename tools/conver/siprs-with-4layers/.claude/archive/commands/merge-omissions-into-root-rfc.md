---
description: >
  例: /merge-omissions-into-root-rfc /path/to/RFC_OMISSIONS-001.md /path/to/RFC_ROOT.md。
  第1引数にマージ元の RFC-OMISSIONS-XXX.md、第2引数にマージ先の RFC-ROOT.md を指定すると、
  RFC-OMISSIONS の各 §N セクションの内容を RFC-ROOT の該当する既存セクションに溶け込みマージする。
  新しいセクションは絶対に追加しない。該当セクションが存在しない場合はエラーで停止する。
---

# /merge-omissions-into-root-rfc

**役割**: `find-omissions` → `formulate-tickets-for-next` のサイクルで生成された `RFC-OMISSIONS-XXX.md` の内容を、正典である `RFC-ROOT.md` の**既存セクションのみに**溶け込みマージする。新しいセクションは絶対に追加しない。

## このコマンドの目的

本コマンドは二層ループ開発パイプラインにおいて、RFC-ROOT.md を常に最新の唯一の正典として保つために使用する。

```
find-omissions → formulate-tickets-for-next → RFC-OMISSIONS-XXX.md
                                                  ↓
                            merge-omissions-into-root-rfc
                                                  ↓
                                    RFC-ROOT.md（常に最新の正典）
```

### 「溶け込みマージ」の絶対ルール

**新しいセクションを追加してはならない。** RFC-ROOT.md に存在するセクションだけがマージ先である。

| パターン | 説明 | 使用条件 |
|---------|------|---------|
| A: 修正 | 該当セクションの内容を新しい設計判断で書き換える | 旧記述と新記述の差分が明確 |
| B: 追記 | 該当セクションの末尾に新しい内容を追加する | 既存内容と矛盾せず追記可能 |
| **C: 新規追加** | **禁止** | **該当セクションがない場合はエラー停止** |

上の2パターン（修正・追記）のみを使用し、**絶対にパターンC（新規セクション追加）を使用してはならない。**

## 引数の解釈

- **第1引数（必須）**: マージ元の RFC-OMISSIONS-XXX.md のパス
  - 例: `/path/to/RFC_OMISSIONS-001.md`
- **第2引数（必須）**: マージ先の RFC-ROOT.md のパス
  - 例: `/path/to/RFC_ROOT.md`

## 使用スクリプト一覧

`.claude/scripts/tickets/` 配下。

| スクリプト | コマンド | 説明 |
|---|---|---|
| `merge-omissions-into-root-rfc.js validate` | `<source> <target>` | 両ファイルの存在確認 + parent-rfc 整合性チェック |
| `merge-omissions-into-root-rfc.js extract` | `<file>` | RFC-OMISSIONS から `### §N` セクションを抽出 |
| `merge-omissions-into-root-rfc.js frontmatter` | `<file>` | YAML frontmatter 読み取り |
| `merge-omissions-into-root-rfc.js list-sections` | `<file>` | 抽出したセクション一覧を整形表示 |
| `merge-omissions-into-root-rfc.js list-omissions` | `<file>` | omission ID とタイトルの一覧表示 |
| `merge-omissions-into-root-rfc.js add-history` | `<target> <source> <ids> [date]` | merge-history エントリ追記（重複防止） |

## ワークフロー

### Step 0: 引数パース

```bash
# ARGUMENTS から第1引数と第2引数を抽出
SOURCE_RFC="${ARGUMENTS%% *}"
TARGET_RFC="${ARGUMENTS#* }"

# 引数不足チェック
if [ "$SOURCE_RFC" = "$TARGET_RFC" ] || [ -z "$TARGET_RFC" ]; then
  echo "エラー: 第1引数(source)と第2引数(target)の両方を指定してください"
  echo "使用法: /merge-omissions-into-root-rfc <RFC-OMISSIONS-XXX.md> <RFC-ROOT.md>"
  exit 1
fi

SCRIPT_DIR=".claude/scripts/tickets"
echo "マージ元: $SOURCE_RFC"
echo "マージ先: $TARGET_RFC"
```

---

### Step 1: バリデーション

helper script で両ファイルの存在確認と parent-rfc 整合性チェックを行う：

```bash
node "$SCRIPT_DIR/merge-omissions-into-root-rfc.js" validate "$SOURCE_RFC" "$TARGET_RFC"
```

失敗時はエラーメッセージが表示されスクリプトが異常終了する。

```bash
echo "✅ バリデーション通過"
```

---

### Step 2: セクション抽出

```bash
node "$SCRIPT_DIR/merge-omissions-into-root-rfc.js" list-sections "$SOURCE_RFC"
```

---

### Step 3: AI による溶け込みマージ（核となる工程）

**このステップは AI が意味的に判断する。helper script は一切介入しない。**

抽出された各セクションに対して、以下の手順を**1セクションずつ**実行する。

#### 3a: マッピング先の特定

各 `§N` セクションの内容を読み、意味的に最も近い RFC-ROOT の既存セクションを特定する。

```bash
# ターゲット RFC のセクション構造を確認
grep -n "^### " "$TARGET_RFC"
```

**マッピングの判断基準:**
- セクションタイトルの類似性（例: 「CLI インターフェース」は同様のタイトルを探す）
- 内容のトピック一致性（例: 「型名の修正」は型定義に関するセクションへ）
- omission の `rfcSection` フィールドがあれば参照する

**絶対ルール:**
- **該当する既存セクションが RFC-ROOT.md に存在しない場合は、エラーとして報告し処理を停止する。**
- **新しいセクションを絶対に追加してはならない。**
- 複数の §N が同じセクションにマッピングされても構わない（その場合は内容をまとめてマージする）。

#### 3b: マージ実行

マッピング先が確定したら、該当セクションの内容を読み込み、以下のいずれかのパターンで編集する：

**パターンA — 修正（書き換え）:**
- 対象: 旧記述を新しい記述で完全に置き換える場合
- 手順: 該当箇所の旧記述を新しい設計判断の記述で置き換え、前後の文脈が自然につながるように調整する
- 例: `### 4. 型定義` の `AcpMonadClient` → `AcpClientApp` に書き換え

**パターンB — 追記（追加）:**
- 対象: 新しい設計判断を既存セクションに追加する場合
- 手順: 該当セクションの末尾に空行で区切って新しい内容を追記する。追記箇所を示すために `**<日付> 追記:**` のような日付マーカーを挿入する
- 例: `### 1. CLI インターフェース` の末尾にログ出力書式を追記

**⚠️ 注意 — 正典を破壊しないための絶対条件:**

1. **編集前後に該当セクション全体を必ず Read する。** 編集前の状態を正確に把握せずに編集を開始してはならない。編集後も Read で結果を確認し、意図しない変更がないことを検証する。
2. **前後の文脈の整合性を保つ。** 特にパターンA（修正）では、置き換えた記述とその前後の段落のつながりが自然か、用語の定義が統一されているかを必ず確認する。設計書として辻褄が合わなくなる編集は禁止。
3. **削除より追記を優先する。** 既存の記述を削除すると、それに依存する他セクションの記述が浮遊し、設計書全体の整合性が崩れるリスクがある。やむを得ず削除する場合は、削除により影響を受ける全箇所を特定し、整合性を回復するまで編集を完了してはならない。
4. **一度に複数セクションを編集しない。** 1つの §N に対して1つの編集を行い、その都度 Read で結果確認と整合性検証を行う。複数セクションの一括編集は禁止。

編集には Edit ツールを使用する。場合によって長大ファイルとなるため、編集前に Read で該当箇所を正確に読み込んでから編集すること。

---

### Step 4: フロントマター更新

全セクションのマージが完了したら、helper script で merge-history を追記する：

```bash
# 解決された omission ID をカンマ区切りで連結
# 例: O-001,O-002,O-003,O-004,O-005
RESOLVED_IDS="O-001,O-002,O-003,O-004,O-005"

node "$SCRIPT_DIR/merge-omissions-into-root-rfc.js" add-history "$TARGET_RFC" "$SOURCE_RFC" "$RESOLVED_IDS"
```

正常終了すれば merge-history が追記された。`skipped: true` が返った場合は既に同一ソースの履歴が存在するためスキップされた（問題なし）。

```bash
# 確認
node "$SCRIPT_DIR/merge-omissions-into-root-rfc.js" frontmatter "$TARGET_RFC"
```

---

### Step 5: 新しいセクションがないことの確認

```bash
echo "=== 新しいセクションが追加されていないことの確認 ==="
grep -n "^### " "$TARGET_RFC"
```

---

### Step 6: 完了報告

```bash
echo "=== /merge-omissions-into-root-rfc 完了 ==="
echo "マージ元: $SOURCE_RFC"
echo "マージ先: $TARGET_RFC"
echo "新しいセクション追加: なし ✅"

echo ""
echo "マージされた omission:"
node "$SCRIPT_DIR/merge-omissions-into-root-rfc.js" list-omissions "$SOURCE_RFC"

echo ""
echo "merge-history:"
node "$SCRIPT_DIR/merge-omissions-into-root-rfc.js" frontmatter "$TARGET_RFC"
```
