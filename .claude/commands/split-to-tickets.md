---
description: 設計書（Requirements / Functional Specification / RFC / 設計ドキュメント）を分析し、依存関係に基づいたフェーズ（段階）・フェーズ・個別チケットに分解する。各チケットは「1チケット・1不変条件」を徹底し、安全な I/O 境界を持つ実装単位に分解する。
argument-hint: </path/to/RFC-*.md> </path/to/*-GRAPH.json> </path/to/*-Dirs-Tree.json>
---

# /formulate-tickets

**役割**: 設計書（Requirements / Functional Specification / RFC / 設計ドキュメント）を分析し、依存関係に基づいたフェーズ（段階）・フェーズ・個別チケットに分解する。各チケットは「1チケット・1不変条件」を徹底し、安全な I/O 境界を持つ実装単位に分解する。

「不変条件」とは、そのチケットが実装する I/O 境界において外部と交わす契約（contract）の正しさを意味する。チケットの完了は、この I/O 境界での契約がテストコードによる単体テスト及び結合テストによって漏れなく検証されたことをもって判断する。全チケットはテストコードによる単体テスト及び結合テストによってスタブ無しの完全な実装を保証できる単位でなければならない。

生成結果は `Tickets.json` として保存され、後続のコマンド（`/make-ticket`,`/plan-ticket`、`/start-ticket`、`/review-ticket` 等）からスクリプト群を介して参照・更新される。

## 引数の解釈

- **第1引数（必須）**: 設計書（RFC）のファイルパス
  - 例: `conver/RFC-001-process-registry.md`
  - 例: `/absolute/path/to/design-doc.md`
- **第2引数（必須）**: I/O 境界の関係性グラフファイルパス
  - 例: `conver/RFC-001-process-registry-GRAPH.json`
  - 例: `/absolute/path/to/design-doc-GRAPH.json`
- **第3引数（必須）**: I/O 境界の関係性グラフから安全に区切られたディレクトリツリーファイルパス
  - 例: `conver/RFC-001-process-registry-Dirs-Tree.json`
  - 例: `/absolute/path/to/design-doc-Dirs-Tree.json`

## 出力先

- 設計書と同じ階層に `Tickets.json` を自動生成する
- 例: `docs/RFC-001-process-registry.md` → `docs/Tickets.json`
- 既に存在する場合は上書き前に確認すること

## 使用スクリプト一覧

`.claude/scripts/tickets/` 配下。詳細は `.claude/scripts/tickets/README.md` を参照。

| スクリプト | 引数 | 説明 |
|---|---|---|
| `write-tickets-json-template.js` | `<PATH of Tickets.json> '<metadata-json>'` | Tickets.json スケルトン生成（phases: []） |
| `add-phase.js` | `<PATH of Tickets.json>`（stdin: フェーズJSON） | フェーズ追加。phaseID は 0 から自動採番 |
| `add-ticket.js` | `<PATH of Tickets.json> P{phaseID}`（stdin: チケットJSON） | チケット追加（単一）。ticketID はフェーズ内で自動インクリメント |
| `bulk-add-tickets.js` | `<PATH of Tickets.json>`（stdin: 一括JSON） | チケット追加（一括）。phaseId/phaseName でフェーズ指定 |
| `get-ticket.js` | `<PATH of Tickets.json> P{phaseID}-{ticketID}` | 単一取得。複合キーで検索 |
| `search-tickets.js` | `<PATH of Tickets.json> <query>` | 全文検索（title/background/scope/referenceSection） |
| `all-tickets.js` | `<PATH of Tickets.json> [status-filter]` | 全一覧。status フィルタ可能 |
| `update-ticket.js` | `<PATH of Tickets.json> P{phaseID}-{ticketID}`（stdin: 更新JSON） | 更新。phaseId/ticketID は変更不可 |
| `bulk-update-tickets.js` | `<PATH of Tickets.json>`（stdin: 一括更新JSON） | 複数一括更新 |
| `delete-ticket.js` | `<PATH of Tickets.json> P{phaseID}-{ticketID}` | 単一削除 |
| `bulk-delete-tickets.js` | `<PATH of Tickets.json>`（stdin: 削除キー一覧） | 複数一括削除 |
| `list-phases-and-tickets.js` | `<PATH of Tickets.json>` | チェックリスト形式で表示 |

全スクリプトは書き込み前にスキーマ検証（`validate-tickets.js`）を実行し、失敗時は保存しない。

## 分析手順

### Step 0: 初期化（引数パース + Malfeasance.json 初期化 + 出力先決定）及びRFC読込

#### 0.1. 初期化

```bash
# 全引数を配列でパース（第1引数=RFC, 第2引数=GRAPH.json, 第3引数=Dirs-Tree.json）
IFS=' ' read -r DOC_PATH GRAPH_PATH DIRS_TREE_PATH <<< "$ARGUMENTS"
DOC_DIR="$(dirname "$DOC_PATH")"
bash .claude/scripts/tickets/init-split-to-ticket.sh --doc-path="$DOC_PATH"
```

#### 0.2. Malfeasance.json 作成

Malfeasance.json は不完全な実装（`[::STUB::]` 未付与）を「犯罪」として記録する台帳である。`DOC_DIR` 内で初期化する。

```bash
# 犯罪記録台帳が存在しなければ空の状態で作成する
node .claude/scripts/tickets/ensure-malfeasance.js "$DOC_DIR"
```

#### 0.3. RFC 読込

```bash
echo "=== RFC 全文読込 ==="
cat "$DOC_PATH"
echo "===================="
```

上記で表示された RFC を最初から最後まで注意深く読み、以下の観点で内容を理解すること：

1. **目的とスコープ**: この RFC が何を実現しようとしているのか、どこまでが範囲でどこからが範囲外か
2. **技術スタック**: 使用する言語、フレームワーク、外部依存関係
3. **主要なデータ型**: 構造体、列挙型、トレイトの定義とその関係
4. **アーキテクチャ**: モジュール間の依存関係、データフロー、制御フロー
5. **I/O 境界**: 外部との契約（公開API、ファイルI/O、ネットワークI/O、DBアクセス等）
6. **テスト戦略**: テスト方法、検証基準、結合計画

---

### Step 1: RFC 内の I/O 境界参考情報を参照

この I/O 境界参考情報は、grill / drill によって詳細な設計書として RFC を書き上げた段階で作成されたものである。
RFC 執筆者の設計意図が最も新鮮なタイミングで記述された I/O 境界の素案であり、チケット分割において最大限尊重しなければならない。
ただし、後続の /graphify-rfc によってさらに発散的に細分化する I/O 境界分割の設計が行われており、必ずしも RFC 執筆時点の I/O 境界と一致する状態にはないことに注意すること。

対象 RFC に I/O 境界参考情報セクションが存在する場合、それを表示する。

```bash
echo "=== I/O 境界参考情報 ==="
node ".claude/scripts/grill-me-for-rfc/extract-io-boundary.js" "$DOC_PATH" || echo "(I/O 境界参考情報なし。事前に grill/drill が必要。split を中断しなさい。)"
echo "========================"
```

I/O 境界参考情報が存在しない場合は、事前の grill/drill を促して split 中断。

---

### Step 2: RFC の設計における関係グラフ構造の確認

このグラフ構造は、/graphify-rfc によって RFC の I/O 境界想定よりもさらに細かい安全な I/O 境界単位に細分化されたノード群とその関係性である。
Step 1 で表示された RFC 執筆時点の I/O 境界参考情報よりも 1 ステージ進んだものであり、チケット分解の主要な判断材料となる。

/graphify-rfc で生成されたグラフが存在する場合、show-graph-summary-markdown.js でグラフ構造サマリーを表示する：

```bash
echo "=== グラフ構造サマリー ==="
if [ -f "$GRAPH_PATH" ]; then
  node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="$GRAPH_PATH" --source="$DOC_PATH" --with-cli-examples
else
  echo "(グラフ構造サマリーなし。事前に graphify が必要。split を中断しなさい。)"
fi
echo "========================"
```

グラフ構造サマリーが存在しない場合は、事前の graphify を促して split 中断。

---

### Step 3: boundify によるディレクトリ・ファイル構造の確認

このディレクトリ・ファイル構造は、grill / drill → /graphify-rfc → /boundify-graph-to-dirs の直列パイプラインによって最終的に生成された現時点の実装ディレクトリ・ファイル構成である。

**現時点のディレクトリ・ファイル構造は変更を禁止する。** ただし、crate や package、class などが他のプログラムから利用されるためのインターフェースを公開するためのディレクトリやファイルの**追加**に関しては、必要に応じて許可する。
追加を行う場合は、チケット内に当該 *-GRAPH.json および *-Dirs-Tree.json には定義されていない追加ディレクトリまたは追加ファイルであることを**必ず明記しなければならない**。

```bash
echo "=== boundify ディレクトリ・ファイル構造 ==="
if [ -f "$DIRS_TREE_PATH" ]; then
  node .claude/scripts/rfc-graph/show-dirs-files-tree.js "$DIRS_TREE_PATH"
else
  echo "(*-Dirs-Tree.json なし。事前の boundify が必要。split を中断しなさい。)"
fi
echo "========================================"
```

*-Dirs-Tree.jsonが存在しない場合は、事前の boundify を促して split 中断。

---

### Step 4: 設計書の検証と情報抽出

```bash
# ファイル存在確認
if [ ! -f "$DOC_PATH" ]; then
  echo "エラー: 指定された設計書が見つかりません: $DOC_PATH"
  exit 1
fi
```

設計書を読み取り、以下の情報を抽出する：
1. **タイトルと概要**: 設計書の目的、スコープ、技術スタック
2. **型定義**: 構造体、列挙型、トレイト、型エイリアス — すべてのデータ型をリストアップする
3. **関数シグネチャ**: 公開API、非公開関数、メソッド — 引数・戻り値・asyncの有無
4. **依存関係グラフ**: 型Aが型Bに依存 → チケットB→Aの順序で実装
5. **外部依存**: ネットワークI/O、ファイルI/O、LLM、DB、乱数生成 — 後段フェーズに回す
6. **内部依存**: 関数Aが関数Bを呼ぶ、型Xが型Yをフィールドに持つ — 先行実装が必要

### Step 5: CLAUDE.md の生成 — 設計全体マップの作成

設計書と同階層に `CLAUDE.md` を生成する。このファイルは個別チケットの作業中に設計全体を
俯瞰するためのマップとして機能する。

```bash
# CLAUDE.md の出力先（DOC_DIR は Step 0 で設定済み）
CLAUDE_MD="$DOC_DIR/CLAUDE.md"

# 既存ファイルの上書き確認
if [ -f "$CLAUDE_MD" ]; then
  echo "注意: $CLAUDE_MD は既に存在します。/formulate-tickets により上書きされます。"
fi
```

Step 1 で抽出した情報をもとに、以下の内容で `CLAUDE.md` を生成する：

```bash
bash .claude/scripts/tickets/write-claude-md-split-to-ticket.sh \
  --claude-md="$CLAUDE_MD" \
  --doc-path="$DOC_PATH" \
  --title="<設計書タイトル — Step 1 で抽出した実際のタイトルに置き換える>"
```

生成された `CLAUDE_MD` はチケット作業中の任意のタイミングで Claude Code が自動的に読み込み、
設計全体のコンテキストとして利用される。これにより「木（個別チケット）」の作業中も
「森（設計全体）」を常に念頭に置くことができる。

---
