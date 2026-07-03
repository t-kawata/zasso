---
description: >
  例: /split-rfc-to-children /path/to/RFC_ROOT.md。
  正典RFCを安全なI/O境界の名前空間単位に分割。ディレクトリ構造=RFC_TREE。言語自動検出。
---

# /split-rfc-to-children

**役割**: 長大な正典RFCを、安全なI/O境界で区切られた独立した名前空間単位（crate/module/package）の子・孫RFCに分割する。ディレクトリ構造が RFC-TREE.json のツリーと完全一致し、git branch 衝突なく並行実装可能。

## 引数の解釈

- **第1引数（必須）**: 正典RFCのファイルパス。このファイルのディレクトリに RFC-TREE.json が生成される。

## 使用スクリプト一覧

| スクリプト | 説明 |
|---|---|
| `create-rfc-tree.js <正典RFC>` | RFC-TREE.json 雛形作成＋言語検出 |
| `validate-rfc-tree.js <RFC-TREE>` | スキーマ検証 |
| `add-rfc-tree-meta.js <RFC-TREE>` | stdin: メタデータ書き込み |
| `add-rfc-tree-goal.js <RFC-TREE>` | stdin: purpose/goals/successCriteria/nonScope |
| `add-rfc-tree-architecture.js <RFC-TREE>` | stdin: architecture/componentRelations/designDecisions |
| `add-rfc-tree-detail-1.js <RFC-TREE>` | stdin: typeDefinitions/apiSignatures/dependencyGraph/externalDependencies |
| `add-rfc-tree-detail-2.js <RFC-TREE>` | stdin: testRequirements/errorHandling/configuration |
| `write-rfc-tree-draft.js <RFC-TREE>` | stdin: 素案ツリーJSON一括書き込み |
| `write-rfc-tree-final.js <RFC-TREE>` | draft→final確定 |
| `get-rfc-tree-draft.js <RFC-TREE> [childId]` | 現在のdraftTreeを表示（確認用） |
| `patch-rfc-tree-child.js <RFC-TREE> <childId>` | stdin: 子ノードを1件ずつ追加・更新・削除（set/delete） |
| `generate-child-rfcs.js <RFC-TREE>` | ディレクトリ構造＋言語別ファイルを機械生成。2フェーズ（--phase=insert: Anchor Marker自動挿入, --phase=transfer: 機械転記） |
| `add-ref-pointer.js <RFC-TREE> <childId> <cmd>` | Anchor Marker の行範囲を登録（add/batch/remove/list） |
| `validate-ref-pointer.js <RFC-TREE>` | Anchor Marker リンク整合性検証（孤児マーカー・未参照・ペア不整合・重複ID） |
| `check-rfc-placeholders.js <RFC-TREE>` | 全RFCファイルの未記入マーカー検出 |
| `show-split-rfc-status.js <RFC-TREE>` | 進捗表示＋次Step指示（全完了でexit 0） |
| `update-split-rfc-status.js <RFC-TREE> <stepId> <status>` | 進捗ステータス更新（pending/in_progress/done） |
| `verify-rfc-coverage.js <RFC-TREE>` | ディレクトリ構造一致検証 |

## ワークフロー

### Step 0: 引数パース

```bash
CANONICAL_RFC="${ARGUMENTS%% *}"
RFC_DIR="$(dirname "$CANONICAL_RFC")"
TREE_PATH="$RFC_DIR/RFC-TREE.json"
SCRIPT_DIR=".claude/scripts/tickets"
if [ ! -f "$CANONICAL_RFC" ]; then echo "エラー: ファイルなし: $CANONICAL_RFC"; exit 1; fi
```

### Step 1: RFC 内の I/O 境界参考情報を参照

対象 RFC に I/O 境界参考情報セクションが存在する場合、それを表示する。この情報は後続の分割判断の参考として活用する。

```bash
echo "=== I/O 境界参考情報 ==="
node ".claude/scripts/grill-me-for-rfc/extract-io-boundary.js" "$CANONICAL_RFC" || echo "(I/O 境界参考情報なし)"
echo "========================"
```

### Step 2: RFC-TREE.json 作成

```bash
# 進捗表示
node "$SCRIPT_DIR/show-split-rfc-status.js" "$TREE_PATH"
# Step 2 を in_progress に更新
node "$SCRIPT_DIR/update-split-rfc-status.js" "$TREE_PATH" "2" "in_progress"

TREE_RESULT=$(node "$SCRIPT_DIR/create-rfc-tree.js" "$CANONICAL_RFC")
echo "$TREE_RESULT"
```

```bash
# Step 2 を done に更新
node "$SCRIPT_DIR/update-split-rfc-status.js" "$TREE_PATH" "2" "done"
```

### Step 3: RFC 理解（6 子ステップ）

```bash
# 進捗表示
node "$SCRIPT_DIR/show-split-rfc-status.js" "$TREE_PATH"
# Step 3 を in_progress に更新
node "$SCRIPT_DIR/update-split-rfc-status.js" "$TREE_PATH" "3" "in_progress"
```

RFCファイルを読み込み、**抽象度の高い層から順に**設計内容を完全に理解する。各サブステップの理解結果は独立したスクリプトで RFC-TREE.json に書き込む。AI は一度に多くのフィールドを書き込もうとせず、1スクリプトの担当範囲だけを丁寧に記述する。

#### 3a-1: 目的とゴールの把握（前回の再利用 + 検証）

前回の RFC-TREE.json に purpose/goals/successCriteria/nonScope が記録されていれば、その値を検証して正しければそのまま使用する。誤りがあれば修正する。前回データがなければ新規分析する。

```bash
RFC_GOAL=$(node "$SCRIPT_DIR/get-before-rfc-tree-understanding.js" "$TREE_PATH" "purpose")
```

- `$RFC_GOAL` が空でなければ前回の値を取得できた証拠 → RFC と照合して検証。正しければそのまま使用。誤りがあれば修正して使用する。
- `$RFC_GOAL` が空なら前回データなし → 以下の観点で新規分析する：

RFCの目的・ゴール・成功条件・非スコープを把握する：
- RFC全体の目的とスコープ — この設計で何を実現したいのか
- 解決すべき問題・課題 — なぜこの設計が必要なのか
- 成功条件 — 何が満たされたらこのRFCの目的は達成されたと言えるのか
- 非スコープ — このRFCが意図的に対象外とした領域はどこか

```bash
echo '{"purpose":"...","goals":"...","successCriteria":"...","nonScope":"..."}' | node "$SCRIPT_DIR/add-rfc-tree-goal.js" "$TREE_PATH"
```

#### 3a-2: メタ情報の記録（前回の再利用 + 検証）

前回の summary を取得し、検証して正しければそのまま使用する。

```bash
RFC_SUMMARY=$(node "$SCRIPT_DIR/get-before-rfc-tree-understanding.js" "$TREE_PATH" "summary")
```

- `$RFC_SUMMARY` が空でなければ前回の値を検証して正しければそのまま使用。
- 空なら新規作成。

```bash
echo '{"summary":"<RFC全体の要約>"}' | node "$SCRIPT_DIR/add-rfc-tree-meta.js" "$TREE_PATH"
```

#### 3b: アーキテクチャ把握（前回の再利用 + 検証）

```bash
# 進捗表示
node "$SCRIPT_DIR/show-split-rfc-status.js" "$TREE_PATH"
# Step 3 を in_progress に更新
node "$SCRIPT_DIR/update-split-rfc-status.js" "$TREE_PATH" "3" "in_progress"
```

前回の architecture/componentRelations/designDecisions を取得し、検証して正しければそのまま使用する。

```bash
RFC_ARCH=$(node "$SCRIPT_DIR/get-before-rfc-tree-understanding.js" "$TREE_PATH" "architecture")
```

- `$RFC_ARCH` が空でなければ前回の値を検証して正しければそのまま使用。
- 空なら以下の観点で新規分析する：

RFCが描くシステム全体の姿を理解する：
- アーキテクチャの概要と設計思想 — 全体はどのような構造か、なぜその構造なのか
- 主要コンポーネントとその責務 — どのような部品が何を担当するのか
- コンポーネント間の関係とデータの流れ — 情報はどのように伝達されるのか
- 設計上のトレードオフと選択理由 — なぜ他の方式ではなくこの方式を選んだのか

```bash
echo '{"architecture":"...","componentRelations":"...","designDecisions":"..."}' | node "$SCRIPT_DIR/add-rfc-tree-architecture.js" "$TREE_PATH"
```

#### 3c-1: 実装詳細（型・API・依存）— 前回の再利用 + 検証

前回の typeDefinitions/apiSignatures/dependencyGraph/externalDependencies を取得し、検証して正しければそのまま使用する。

```bash
RFC_TYPEDEF=$(node "$SCRIPT_DIR/get-before-rfc-tree-understanding.js" "$TREE_PATH" "typeDefinitions")
```

- `$RFC_TYPEDEF` が空でなければ前回の値を検証して正しければそのまま使用。
- 空なら以下の観点で新規分析する：

具体的な実装定義を漏れなく把握する：
- 型定義（構造体、列挙型、トレイト、型エイリアス）
- 関数シグネチャ（公開API、非公開関数、asyncの有無、エラー型）
- トレイト境界とジェネリクス制約
- 依存関係グラフ（コンポーネント間・モジュール間）
- 外部依存（I/O、LLM、DB、乱数生成、ネットワーク）

```bash
echo '{"typeDefinitions":"...","apiSignatures":"...","dependencyGraph":"...","externalDependencies":"..."}' | node "$SCRIPT_DIR/add-rfc-tree-detail-1.js" "$TREE_PATH"
```

#### 3c-2: 実装詳細（テスト・エラー処理・設定）— 前回の再利用 + 検証

前回の testRequirements/errorHandling/configuration を取得し、検証して正しければそのまま使用する。

```bash
RFC_TEST=$(node "$SCRIPT_DIR/get-before-rfc-tree-understanding.js" "$TREE_PATH" "testRequirements")
```

- `$RFC_TEST` が空でなければ前回の値を検証して正しければそのまま使用。
- 空なら以下の観点で新規分析する：

- テスト要件と検証方法
- エラー処理・異常系の定義
- 設定・構成パラメータ

```bash
echo '{"testRequirements":"...","errorHandling":"...","configuration":"..."}' | node "$SCRIPT_DIR/add-rfc-tree-detail-2.js" "$TREE_PATH"
```

#### 3-review: RFC理解の全体確認

```bash
# 進捗表示
node "$SCRIPT_DIR/show-split-rfc-status.js" "$TREE_PATH"
# Step 3 を in_progress に更新
node "$SCRIPT_DIR/update-split-rfc-status.js" "$TREE_PATH" "3" "in_progress"
```

```bash
node "$SCRIPT_DIR/validate-rfc-tree.js" "$TREE_PATH"
```

**目的とゴール（3a）を最初に理解しなければ、機械的な実装定義（3c）の抽出だけでは「分割すべきI/O境界」の発見漏れが発生する。必ず上位層から理解すること。**

```bash
# Step 3 を done に更新
node "$SCRIPT_DIR/update-split-rfc-status.js" "$TREE_PATH" "3" "done"
```

### Step 4: 素案ツリー作成

```bash
# 進捗表示
node "$SCRIPT_DIR/show-split-rfc-status.js" "$TREE_PATH"
# Step 4 を in_progress に更新
node "$SCRIPT_DIR/update-split-rfc-status.js" "$TREE_PATH" "4" "in_progress"
```

正典RFCを読み、安全なI/O境界で区切られた独立した名前空間（crate/module/package）単位に分割する。

```bash
grep -n "^#" "$CANONICAL_RFC"
```

**言語別分割指針:**
- [Rust] 子=workspace crate, I/O境界=pub trait, 結合=Cargo.toml path deps
- [Go] 子=go.mod module, I/O境界=exported interface, 結合=go.work
- [TS] 子=npm package, I/O境界=export, FE/BEは別package

#### ツリーJSONのスキーマ

各ノードは以下の必須フィールドを持つ。値のフォーマットを厳守すること。

**childNode（子）の必須フィールド:**

| フィールド | 型 | 必須 | フォーマット・制約 |
|-----------|-----|------|------------------|
| `childId` | string | ✅ | 2桁0埋め (`"01"`, `"02"`, ..., `"99"`)。フェーズ内の連番 |
| `slug` | string | ✅ | URL-friendly識別子（kebab-case）例: `"parser"`。ディレクトリ名に使用 |
| `directoryName` | string | ✅ | `{canonicalName}-{childId}-{slug}`（自動導出。例: `RFC-ROOT-01-parser`）
| `name` | string | ✅ | 人間可読な名前（例: `"Parser"`） |
| `namespaceUnit` | string | ✅ | 名前空間の種類: `"crate"` / `"module"` / `"package"` |
| `summary` | string | | この名前空間の責務概要 |
| `ioSchema` | string | ✅ | 安全なI/O境界のスキーマ定義。外部に公開するインターフェース（例: `"trait Parser { fn parse(&self, input: &str) -> Result<Ast, Error>; }"`） |
| `decouplingMethod` | string | ✅ | 親・兄弟との疎結合方法（例: `"pub trait + Cargo.toml path dep"`） |
| `rfcEvidence` | string | ✅ | 正典RFCの該当セクション（例: `"§3.2"`）。この名前空間の設計根拠 |
| `dependencyOn` | string[] | | 依存する子IDの配列（例: `["02", "03"]`）。**配列内の全IDがこのツリー内に実在すること。存在しないIDを参照する = 孤立 → エラー** |
| `children` | grandchildNode[] | | 孫ノードの配列。省略または空配列可 |

**grandchildNode（孫）の必須フィールド:**

| フィールド | 型 | 必須 | フォーマット・制約 |
|-----------|-----|------|------------------|
| `grandchildId` | string | ✅ | 2桁0埋め（子内での連番）。親の子IDとは独立 |
| `slug` | string | ✅ | URL-friendly識別子。例: `"lexer"`
| `directoryName` | string | ✅ | `{canonicalName}-{childId}-{grandchildId}-{slug}`（自動導出） |
| `name` | string | ✅ | 人間可読な名前 |
| `namespaceUnit` | string | ✅ | `"submodule"` / `"subpackage"` 等 |
| `ioSchema` | string | ✅ | I/O境界のスキーマ定義 |
| `decouplingMethod` | string | ✅ | 親・兄弟との疎結合方法 |
| `rfcEvidence` | string | ✅ | 正典RFCの該当箇所（根拠） |
| `parentEvidence` | string | ✅ | **親（子）RFCのどの箇所が根拠か**。つまり「なぜこの孫がこの子の配下にあるのか」の理由 |
| `dependencyOn` | string[] | | 依存する兄弟孫IDの配列 |

**全体制約:**
- **孤立ノード禁止**: 全ノードがツリーに接続されていること。dependencyOn が参照するIDは全て同一ツリー内に実在しなければならない
- **非循環**: ツリーは非循環有向グラフ（DAG）。A→B→A の循環依存禁止
- **最大3階層**: 親（正典）→ 子 → 孫 まで。孫まで無理に作る必要はない

**有効なツリーJSONの例:**

```json
[
  {
    "childId": "01",
    "slug": "parser",
    "directoryName": "RFC-ROOT-01-parser",
    "name": "Parser",
    "namespaceUnit": "crate",
    "summary": "ソースコードを解析しASTを生成する",
    "ioSchema": "pub trait Parser { fn parse(&self, input: &str) -> Result<Ast, Error>; }",
    "decouplingMethod": "pub trait + Cargo.toml path dep",
    "rfcEvidence": "§3.2",
    "dependencyOn": ["02"],
    "children": [
      {
        "grandchildId": "01",
        "slug": "lexer",
        "directoryName": "RFC-ROOT-01-01-lexer",
        "name": "Lexer",
        "namespaceUnit": "submodule",
        "ioSchema": "pub fn tokenize(input: &str) -> Vec<Token>",
        "decouplingMethod": "pub mod でcrate内に内包",
        "rfcEvidence": "§3.2.1",
        "parentEvidence": "§3.2 — Parser の内部実装としてトークン分割が必要"
      }
    ]
  },
  {
    "childId": "02",
    "slug": "evaluator",
    "directoryName": "RFC-ROOT-02-evaluator",
    "name": "Evaluator",
    "namespaceUnit": "crate",
    "summary": "ASTを評価・実行する",
    "ioSchema": "pub trait Eval { fn eval(&self, ast: &Ast) -> Result<Value, Error>; }",
    "decouplingMethod": "pub trait + Cargo.toml path dep",
    "rfcEvidence": "§4.1",
    "dependencyOn": ["01"]
  }
]
```

**書き込み前に上記スキーマに従っているか必ず確認すること。バリデーションエラーが発生した場合はエラーメッセージに従って修正し、通過するまで再試行すること。**

素案を書き込む：

```bash
echo '[<ツリーJSON>]' | node "$SCRIPT_DIR/write-rfc-tree-draft.js" "$TREE_PATH"
```

```bash
# Step 4 を done に更新
node "$SCRIPT_DIR/update-split-rfc-status.js" "$TREE_PATH" "4" "done"
```

### Step 5: 検証ループ（1子ずつ修正）

```bash
# 進捗表示
node "$SCRIPT_DIR/show-split-rfc-status.js" "$TREE_PATH"
# Step 5 を in_progress に更新
node "$SCRIPT_DIR/update-split-rfc-status.js" "$TREE_PATH" "5" "in_progress"
```

draftTree と正典RFCを照合し、漏れ・矛盾・不足がなくなるまで**1子ずつ**修正する。

**まず現在の draftTree を確認する：**

```bash
# 全ツリーの表示
node "$SCRIPT_DIR/get-rfc-tree-draft.js" "$TREE_PATH"

# 特定の子だけ確認
node "$SCRIPT_DIR/get-rfc-tree-draft.js" "$TREE_PATH" "01"
```

**バリデーションを実行する：**

```bash
node "$SCRIPT_DIR/validate-rfc-tree.js" "$TREE_PATH"
```

エラーが発生した場合、バリデーションのエラーメッセージに従って、以下のいずれかの方法で**1つの問題だけを修正し、再度バリデーションを実行する。** 全てのエラーを一度に修正しようとせず、1回の修正ごとにバリデーションを回すこと。

**子ノードのフィールドを修正する（最も頻繁に使う）:**

```bash
# ioSchema だけを修正
echo '{"ioSchema":"pub trait Parser { fn parse(&self, input: &str) -> Result<Ast, Error>; }"}' | node "$SCRIPT_DIR/patch-rfc-tree-child.js" "$TREE_PATH" "01" set

# 複数フィールドを一度に修正
echo '{"slug":"parser","namespaceUnit":"crate"}' | node "$SCRIPT_DIR/patch-rfc-tree-child.js" "$TREE_PATH" "01" set

# 新しい子を追加
echo '{"slug":"evaluator","name":"Evaluator","namespaceUnit":"crate","ioSchema":"trait Eval","decouplingMethod":"dep","rfcEvidence":"§4","dependencyOn":["01"]}' | node "$SCRIPT_DIR/patch-rfc-tree-child.js" "$TREE_PATH" "03" set
```

**子ノードを削除する（他ノードの dependencyOn が参照していないことを確認してから）:**

```bash
node "$SCRIPT_DIR/patch-rfc-tree-child.js" "$TREE_PATH" "03" delete
```

**修正サイクル（1問題ずつ）:**

```bash
# 1. 確認
node "$SCRIPT_DIR/get-rfc-tree-draft.js" "$TREE_PATH" "01"
# 2. 修正（問題の内容に応じて）
echo '{"ioSchema":"新しいスキーマ定義"}' | node "$SCRIPT_DIR/patch-rfc-tree-child.js" "$TREE_PATH" "01" set
# 3. 検証
node "$SCRIPT_DIR/validate-rfc-tree.js" "$TREE_PATH"
# 4. エラーがなければ次の問題へ。エラーがあれば 1. に戻る
```

**全てのエラーが解消されたら finalTree に確定する：**

```bash
node "$SCRIPT_DIR/write-rfc-tree-final.js" "$TREE_PATH"
```

```bash
# Step 5 を done に更新
node "$SCRIPT_DIR/update-split-rfc-status.js" "$TREE_PATH" "5" "done"
```

### Step 6: Anchor Marker 登録（必須）

```bash
# 進捗表示
node "$SCRIPT_DIR/show-split-rfc-status.js" "$TREE_PATH"
# Step 6 を in_progress に更新
node "$SCRIPT_DIR/update-split-rfc-status.js" "$TREE_PATH" "6" "in_progress"
```

<!-- この Step の前に完了しているべき Step: Step 5（finalTree確定） -->

RFC-TREE.json の各 childNode に、正典RFCの該当セクションの行範囲を `add-ref-pointer.js` で記録する。
この情報は後続のマーカー自動挿入と機械転記の位置特定に使用される。

```bash
# 子01 の責務セクション行範囲を記録
node "$SCRIPT_DIR/add-ref-pointer.js" "$TREE_PATH" "01" add --id "01-001" --lineStart 292 --lineEnd 306

# 複数マーカーを一括登録
node "$SCRIPT_DIR/add-ref-pointer.js" "$TREE_PATH" "01" batch \
  '[{"id":"01-001","lineStart":292,"lineEnd":306},{"id":"01-002","lineStart":350,"lineEnd":370}]'
```

**完了ガード**: refPointers が1件以上登録されていること

```bash
node -e "const t=require('${TREE_PATH}'); const c=t.finalTree.flatMap(n=>(n.refPointers||[]).map(r=>r.id)); if(c.length===0){console.error('[ERROR] refPointers が空です。add-ref-pointer.js で行範囲を登録してください。');process.exit(1)}else{console.log('[OK] '+c.length+' refPointers registered')}"
```

> **注**: 旧 Step 7（`generate-child-rfcs.js` を単独実行する手順）は完全に廃止された。
> 代わりに以下の Step 7（マーカー自動挿入＋機械転記）を実行すること。

```bash
# Step 6 を done に更新
node "$SCRIPT_DIR/update-split-rfc-status.js" "$TREE_PATH" "6" "done"
```

### Step 7: Anchor Marker 自動挿入 + 機械転記（必須）

```bash
# 進捗表示
node "$SCRIPT_DIR/show-split-rfc-status.js" "$TREE_PATH"
# Step 7 を in_progress に更新
node "$SCRIPT_DIR/update-split-rfc-status.js" "$TREE_PATH" "7" "in_progress"
```

<!-- この Step の前に完了しているべき Step: Step 6（Anchor Marker 登録） -->

`generate-child-rfcs.js` が2フェーズで動作する。
フェーズ1（insert）は lineStart/lineEnd から `[::REF-POINTER-BEGIN/END-*::]` マーカーを
正典RFCに自動挿入する。挿入後はマーカーIDが恒久的なリンクとして機能する。
フェーズ2（transfer）はマーカー範囲の内容を子RFCの該当セクションに機械転記する。

```bash
# 両フェーズ実行（デフォルト）
node "$SCRIPT_DIR/generate-child-rfcs.js" "$TREE_PATH"

# フェーズ1のみ（マーカー自動挿入）
node "$SCRIPT_DIR/generate-child-rfcs.js" "$TREE_PATH" --phase=insert

# フェーズ2のみ（機械転記）
node "$SCRIPT_DIR/generate-child-rfcs.js" "$TREE_PATH" --phase=transfer
```

**完了ガード**: 正典RFCにマーカーが挿入されたことを確認する

```bash
if ! grep -q 'REF-POINTER-BEGIN' "${CANONICAL_RFC}"; then
  echo "[ERROR] 正典RFCに Anchor Marker が見つかりません。Step 6 のマーカー挿入が失敗しています。"
  exit 1
fi
echo "[OK] ${CANONICAL_RFC} に Anchor Marker が確認されました"
```

続いてプレースホルダーと生成ファイルを確認する：

```bash
node "$SCRIPT_DIR/check-rfc-placeholders.js" "$TREE_PATH"
```

```bash
# Step 7 を done に更新
node "$SCRIPT_DIR/update-split-rfc-status.js" "$TREE_PATH" "7" "done"
```

### Step 8: リンク整合性検証（必須）

```bash
# 進捗表示
node "$SCRIPT_DIR/show-split-rfc-status.js" "$TREE_PATH"
# Step 8 を in_progress に更新
node "$SCRIPT_DIR/update-split-rfc-status.js" "$TREE_PATH" "8" "in_progress"
```

<!-- この Step の前に完了しているべき Step: Step 7（generate-child-rfcs.js） -->

正典RFCに埋め込まれたマーカーとRFC-TREE.jsonの参照に乖離がないか検証する。
エラーがゼロになるまで修正を繰り返す。

```bash
node "$SCRIPT_DIR/validate-ref-pointer.js" "$TREE_PATH"
```

```bash
# Step 8 を done に更新
node "$SCRIPT_DIR/update-split-rfc-status.js" "$TREE_PATH" "8" "done"
```

### Step 9: 詳細記述（必須）

```bash
# 進捗表示
node "$SCRIPT_DIR/show-split-rfc-status.js" "$TREE_PATH"
# Step 9 を in_progress に更新
node "$SCRIPT_DIR/update-split-rfc-status.js" "$TREE_PATH" "9" "in_progress"
```

<!-- この Step の前に完了しているべき Step: Step 8（validate-ref-pointer.js） -->

各子RFCの **AI記述部**（`<!-- AI記述部 -->` の下）に設計判断・補足説明を記述する。

**編集禁止領域**:
- `<!-- 機械転記ブロック -->` と `<!-- /機械転記ブロック -->` で囲まれた領域
- frontmatter（`---` で囲まれた YAML）
- Anchor Marker 注釈ブロック（`===== Anchor Marker System =====`）

```bash
node "$SCRIPT_DIR/check-rfc-placeholders.js" "$TREE_PATH"
```

```bash
# Step 9 を done に更新
node "$SCRIPT_DIR/update-split-rfc-status.js" "$TREE_PATH" "9" "done"
```

### Step 10: コメント削除（必須）

```bash
# 進捗表示
node "$SCRIPT_DIR/show-split-rfc-status.js" "$TREE_PATH"
# Step 10 を in_progress に更新
node "$SCRIPT_DIR/update-split-rfc-status.js" "$TREE_PATH" "10" "in_progress"
```

<!-- この Step の前に完了しているべき Step: Step 9（詳細記述） -->

各子RFC・孫RFCから、AI向けガイダンスコメント（`<!--【記述指針】-->`、`<!--【AI記述部】-->` 等）を
削除する。Anchor Marker（`REF-POINTER-BEGIN/END`）、機械転記ブロックマーカー、frontmatter は維持される。

```bash
node -e "
var walk = require('./.claude/scripts/tickets/check-all-rfcs-completeness');
var strip = require('./.claude/scripts/tickets/strip-rfc-comments');
var result = walk.walkAllRfcFiles('${TREE_PATH}');
result.files.forEach(function(f) {
  if (f.success) {
    var r = strip.stripHtmlComments(f.path);
    if (r.removed > 0) console.log('[STRIP] ' + r.path + ': ' + r.removed + ' comments');
  }
});
console.log('[STRIP] done');
"
```

```bash
# Step 10 を done に更新
node "$SCRIPT_DIR/update-split-rfc-status.js" "$TREE_PATH" "10" "done"
```

### Step 11: 完全性検証（必須）

```bash
# 進捗表示
node "$SCRIPT_DIR/show-split-rfc-status.js" "$TREE_PATH"
# Step 11 を in_progress に更新
node "$SCRIPT_DIR/update-split-rfc-status.js" "$TREE_PATH" "11" "in_progress"
```

<!-- この Step の前に完了しているべき Step: Step 10（コメント削除） -->

全子孫RFCの完全性を検証する。不完全なファイルがある場合は Step 9（詳細記述）に戻って修正する。

```bash
node "$SCRIPT_DIR/check-all-rfcs-completeness.js" "$TREE_PATH"
```

**通過条件**: `incomplete: 0` を返すこと。不完全ファイルが1件でもある場合は Step 9 に戻り、
該当ファイルの記述を補完した上で Step 10 から再実行する。

```bash
# Step 11 を done に更新
node "$SCRIPT_DIR/update-split-rfc-status.js" "$TREE_PATH" "11" "done"
```

### Step 12: 完了報告（必須）
<!-- この Step の前に完了しているべき Step: Step 11（完全性検証） -->

```bash
node "$SCRIPT_DIR/verify-rfc-coverage.js" "$TREE_PATH"
node "$SCRIPT_DIR/check-rfc-placeholders.js" "$TREE_PATH"
# 全ステップ完了確認（先に Step 12 を done にしてから）
node "$SCRIPT_DIR/update-split-rfc-status.js" "$TREE_PATH" "12" "done"
node "$SCRIPT_DIR/show-split-rfc-status.js" "$TREE_PATH"
# Step 11 を in_progress に更新
node "$SCRIPT_DIR/update-split-rfc-status.js" "$TREE_PATH" "11" "in_progress"
echo "=== /split-rfc-to-children 完了 ==="
```

**通過条件**: `verify-rfc-coverage.js` が `valid: true` を返すこと。
`valid: false` の場合は該当 issue を修正し、必要な Step から再実行する。
`valid: true` になるまで次の工程に進んではならない。
