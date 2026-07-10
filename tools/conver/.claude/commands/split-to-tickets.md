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

#### 0.3. RFC 読込（analyze-source-structure.js で構造把握 → セクションごとに順次読込）

```bash
echo "=== RFC 構造分析 ==="
node ".claude/scripts/rfc-graph/analyze-source-structure.js" "$DOC_PATH"
echo "======================"
```

RFC 文書は極めて長大な文書であるため、一度に全文を読もうとしてはならない。
上記の構造分析結果でセクション一覧（行範囲付き）を把握した上で、**上から順に**セクションを読み進めること。

一度にいくつのセクションをまとめて読むかは AI の判断に委ねるが、以下の観点で内容を記憶に留めながら読了すること：

- **目的とスコープ**: この RFC が何を実現しようとしているのか、どこまでが範囲か
- **技術スタック**: 使用する言語、フレームワーク、外部依存関係
- **主要なデータ型**: 構造体、列挙型、トレイトの定義とその関係
- **アーキテクチャ**: モジュール間の依存関係、データフロー、制御フロー
- **I/O 境界**: 外部との契約（公開API、ファイルI/O、ネットワークI/O、DBアクセス等）
- **テスト戦略**: テスト方法、検証基準、結合計画

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

### Step 4: 第一次フェーズ設計（機械的フェーズグルーピング）

#### 4.1. スクリプトによるフェーズ分割

GRAPH.json と Dirs-Tree.json を入力とし、`phasify-graph-and-dirs-files-tree.js` が数学的に安全な重み付きトポロジカルソートと SCC 縮約により全ノードを実装フェーズにグルーピングする。結果は Tickets.json の phase[].nodeIds に書き込まれる。

```bash
node .claude/scripts/rfc-graph/phasify-graph-and-dirs-files-tree.js \
  "$GRAPH_PATH" \
  "$DIRS_TREE_PATH"
```

出力末尾のサマリー行で合格（✅）を確認する。不合格（⚠️）の場合は不合格原因を報告して split を中断。

#### 4.2. 全フェーズの名前とサマリー書き込み

4.1 で Tickets.json に書き込まれた全フェーズに対して、以下の手順でフェーズ名（name）とサマリー（summary）を設定する。必要なスクリプトは2つ：`show-all-nodes-title-summary.js`（表示）と `write-phase-name-summary.js`（書き込み）。

全フェーズに対して、以下の①→②→③を**1フェーズずつ逐次実行する**。全フェーズを一括で出力してはならない。

```bash
# ① 該当フェーズのノード一覧を表示（例: フェーズ P0）
node .claude/scripts/rfc-graph/show-all-nodes-title-summary.js \
  --tickets="$TICKETS_PATH" \
  --graph="$GRAPH_PATH" \
  --phase="P0"
```

①の出力例：
```
N0001: [§1 目的 — 本crateの責務定義] RustからPJSUAを安全に...
N0002: [§1a M20実装優先度マップ] M20追補の全実装項目を...
```

② AI が①の出力を読み、このフェーズにふさわしい名前とサマリーを生成する。

```bash
# ③ 生成した name/summary を Tickets.json に書き込む
echo '{"name":"認証基盤","summary":"認証トークン生成・検証・Session管理"}' | \
  node .claude/scripts/rfc-graph/write-phase-name-summary.js \
    "$TICKETS_PATH" \
    "P0"
```

①→②→③が完了したら次のフェーズ（P1, P2, ...）に進む。全フェーズ終了後、以下のスクリプトで全フェーズの name/summary が埋まっていることを確認する。不合格の場合は全てのフェーズが完了するまで Step 5 への進行を禁止する。

```bash
node .claude/scripts/rfc-graph/check-phase-names-summaries.js "$TICKETS_PATH"
```

### Step 5: 第一次チケット定義

<!--
グルーピングされたノードで構成された各フェーズ内で、関連していて連続した実装が安全で合理的であると判断されるノードを束ねることでチケットを構成していく。全チケットは安全な I/O 境界を持つ単位でなければならない。
-->

### Step 6: 第二次フェーズ設計（フェーズ収束）

### Step 7: 第二次チケット定義（チケット収束）

---

### Step 5: チケット統合チェック（収束） — I/O 境界による候補の束ね直し

Step 7 で発散させたチケット候補に対して、安全に統合できるものを束ねる。これにより情報密度を落とさずにチケット数を節約する。

**グラフがある場合**、以下の機械的判定を統合判断に追加する：

1. **ノードID重複**: 複数のチケット候補が同じグラフノードIDを参照している → 1チケットに統合する（同じ設計要素を分割しすぎ）
2. **validates エッジ**: validates で結ばれた2ノードは同じチケットに統合してよい（検証と実装は一体）
3. **単一 kind 集中**: 同一フェーズ内の全チケット候補が1つの kind に集中している → 粒度が細かすぎるので統合を検討する

**グラフがない場合**、従来通り以下の質問ベースの判定のみを行う：

1. 「この2つの候補は、同じファイルを読み、同じファイルに書き出すか？」
   → YES: 1チケットに統合する
2. 「この候補は単独では呼ばれず、別の候補の出力を入力としてのみ動作するか？」
   → YES: パイプライン全体を1チケットに統合する
3. 「この2つの候補は、テストも含めて異なる不変条件で検証できるか？」
   → NO: 同じ不変条件のもとで検証できるなら統合する

統合の判断基準:
- 統合前: 「型A」「関数B」「関数C」が3つの候補として存在
- 統合後: 「ファイル読み込みから結果出力までのパイプライン」が1つのI/O境界

#### チケット分解の基準

各チケットは **I/O 境界の単位で区切る**。ただし、その前に Step 8（チケット統合チェック）で過剰分解された候補を統合する。判断フロー:

   Step 5 で列挙された候補（発散）
     ↓
   Step 7 で発散（Expand）
     ↓
   Step 8 で「同じI/O境界なら統合」（収束）
     ↓
   収束後に残った単位を I/O 境界としてチケット化

I/O 境界とは、そのチケットが外部に公開する抽象化されたインターフェースを指し、以下の具象言語要素で表現される：

- **Rust**: `pub fn`, `pub async fn`, `trait` の各メソッド, `struct` の `pub` コンストラクタ, `pub mod`, `crate`
- **Go**: `func`（大文字開始の公開関数）, `interface` の各メソッド, `package`
- **TypeScript**: `export function`, `export class` の公開メソッド, `export` された `interface` / `type`, モジュール

チケットが完了したかどうかは、この I/O 境界に対するテストが全て PASS したかで判断する。
内部実装の詳細（プライベート関数、バッファ管理、キャッシュ戦略）が未完成であっても、
公開 I/O 境界の契約を満たしていれば「チケット完了」とみなす。

各フェーズ内で、依存関係のある単位をフェーズとして区切る。フェーズはアルファベットと数字の組み合わせでIDを付与する（例: `P0`, `P1`, ..., `P4`）。

### Step 7: Tickets.json スケルトン生成

メタデータを渡してスケルトンを生成する。phases は空配列。

書き出しとスキーマ検証を自動実行する。エラー時は exit 1。

```bash
node .claude/scripts/tickets/write-tickets-json-template.js "$TICKETS_PATH" '{
  "title": "<設計書タイトル> 実装チケット分解設計書",
  "source": "<DOC_PATH>",
  "generatedAt": "<YYYY-MM-DD>",
  "analyzedSections": "<セクション一覧>"
}'
```

書き出しとスキーマ検証を自動実行する。エラー時は exit 1。

### Step 8: フェーズの追加

Step 7〜Step 8 で設計したフェーズを add-phase.js で追加する。ID は 0 から自動採番。

```bash
echo '{"name":"純粋ロジック・状態機械の完全隔離検証","externalDependencies":"なし"}' | node .claude/scripts/tickets/add-phase.js "$TICKETS_PATH"
echo '{"name":"非同期ランタイム","externalDependencies":"tokio"}' | node .claude/scripts/tickets/add-phase.js "$TICKETS_PATH"
```

全フェーズ追加後、list-phases-and-tickets.js で一覧を確認する：

```bash
node .claude/scripts/tickets/list-phases-and-tickets.js "$TICKETS_PATH"
```

### Step 9: チケットの追加

各フェーズのチケットを依存関係の順序に従って追加する。チケット ID はフェーズ内で 1 から自動インクリメント。
R/U/D 操作では P{フェーズID}-{チケットID} 形式（例: P0-1）で特定する。

#### チケットのフィールド定義

id と status はスクリプトが自動設定する。省略可能な全フィールドは additionalProperties で許容。

```json
{
  "title": "<I/O境界の契約を1文で表す>",
  "referenceSection": "<参照設計書パス> (§<該当セクション番号>)",
  "background": "<このI/O境界の契約が何か、実装の背景と目的>",
  "scope": ["<型シグネチャ付き公開I/O: 実装する公開インターフェースの一覧>"],
  "relatedTicketIds": "<入力元I/O: PX-YY / 出力先I/O: PX-ZZ — 結合するI/O境界の前後関係>",
  "testVerification": [
    "正常系: 公開I/Oに対する契約の充足を検証",
    "異常系: 契約違反時の動作を検証",
    "境界値: I/O境界における極値の振る舞いを検証"
  ],
  "testExceptions": ["<ユニットテスト不可能な項目とその理由 — なければ空配列>"],
  "instrumentation": "<計装方法（ログ・メトリクス等）>",
  "notes": "結合テスト計画:\n[::STUB::] 出力先チケット({出力先ID})実装後に、自チケットの出力I/Oと{出力先ID}の入力I/Oとの結合テストを追加する。完全性の基準: <例: 暗号文を正しく復号できるまで転送>"
}
```

#### 単一追加（add-ticket.js）

```bash
echo '{"title":"純粋データ型の定義","scope":[...],"testVerification":[...]}' \
  | node .claude/scripts/tickets/add-ticket.js "$TICKETS_PATH" "P0"
```

#### 一括追加（bulk-add-tickets.js）

```bash
echo '[
  {"phaseId":0,"tickets":[{"title":"..."},{"title":"..."}]},
  {"phaseId":1,"tickets":[{"title":"..."}]}
]' | node .claude/scripts/tickets/bulk-add-tickets.js "$TICKETS_PATH"
```

#### チケットIDの採番

チケットIDは以下の命名規則に従い、各 CRUD スクリプトが自動採番する：

- **フェーズID**: `P0`, `P1`, `P2`, ...（フェーズを通して連番）
- **チケットID**: `P<数字>-<連番>`（例: `P0-1`, `P0-2`, ...）

採番は依存順序を反映すること。つまり、先に実装すべきチケットほど小さいフェーズ番号・チケット番号を持つ。

必要に応じて抽象トレイトを定義するチケットを先行配置する（例: `M-2`, `M-1` のようにマイナス番号で事前準備フェーズを表現してもよい）。

### Step 10: フェーズ・チケットチェックリストの出力

全てのチケットの追加が完了したら、list-phases-and-tickets.js でチェックリストを出力して報告する：

```bash
node .claude/scripts/tickets/list-phases-and-tickets.js "$TICKETS_PATH"
```

出力例:
```
- [] Phase 0: 純粋ロジック・状態機械の完全隔離検証
    - [ ] P0-1: 純粋データ型の定義
    - [ ] P0-2: エラー型の定義
    - [ ] P0-3: プロセス状態とレジストリ型の定義
- [] Phase 1: 非同期ランタイム・Mock可能な実行基盤
    - [ ] P1-1: RestartPolicy::on_crash_default と next_delay の実装
```

チェックボックスはチケットの status に応じて表示が変わる：
- `status: "todo"` → `[ ]`
- `status: "done"` → `[/]`
- `status: "reviewed"` → `[x]`

## 注意事項

- 本コマンドは設計書の解析結果をチケットとして生成するに過ぎない。生成されたチケットの内容は必要に応じて調整・修正すること。
- 出力先 Tickets.json が既に存在する場合は上書き前にユーザーに確認を取ること。
- Tickets.json の内容は CRUD スクリプト群を介して後から修正可能。各操作はスキーマ検証を通ることを保証する。
