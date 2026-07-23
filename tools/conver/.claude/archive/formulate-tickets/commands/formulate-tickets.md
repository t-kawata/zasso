---
description: 例: /formulate-tickets conver/RFC-001-process-registry.md。第1引数に設計書のパス（必須）を指定すると、実装チケットのきめ細やかなフェーズ分けと詳細定義を生成し、同階層に Tickets.json を自動生成する。
---

# /formulate-tickets

**役割**: 設計書（Requirements / Functional Specification / RFC / 設計ドキュメント）を分析し、依存関係に基づいたフェーズ（段階）・フェーズ・個別チケットに分解する。各チケットは「1チケット・1不変条件」を徹底し、外部I/Oを排除したメモリ内完結の検証可能な単位に区切る。

「不変条件」とは、そのチケットが実装する I/O 境界において外部と交わす契約（contract）の正しさを意味する。チケットの完了は、この I/O 境界での契約がテストによって検証されたことをもって判断する。内部実装の詳細（プライベート関数・中間状態・キャッシュ戦略等）は完了判定に影響しない。

生成結果は `Tickets.json` として保存され、後続のコマンド（`/plan-ticket`、`/start-ticket`、`/review-ticket` 等）から CRUD スクリプト群を介して参照・更新される。

## このコマンドの目的

設計書の記述をそのまま実装しようとすると、依存関係の誤った順序や未検証の結合が発生し、後戻りが膨大になる。このコマンドは設計書を以下の観点で分析・分解する：

1. **依存関係の抽出**: 型定義 → トレイト境界 → 純粋関数 → 非同期ランタイム → 統合の5層の依存グラフを構築する
2. **フェーズ分割**: 外部依存（I/O、LLM、DB、乱数）を段階的に導入する順序でフェーズを設計する
3. **チケット詳細化**: 各チケットに対し「不変条件＋実装スコープ＋テスト検証＋計装方法」を精密フォーマットで記述する

## 引数の解釈

- **第1引数（必須）**: 設計書のファイルパス（プロジェクトルートからの相対パス、または絶対パス）
  - 例: `conver/RFC-001-process-registry.md`
  - 例: `/absolute/path/to/design-doc.md`

## 出力先

- 設計書と同じ階層に `Tickets.json` を自動生成する
- 例: `docs/RFC-001-process-registry.md` → `docs/Tickets.json`
- 既に存在する場合は上書き前に確認すること

## 使用スクリプト一覧

`.claude/scripts/tickets/` 配下。

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

### Step 0: 初期化（引数パース + Malfeasance.json 初期化 + 出力先決定）

```bash
DOC_PATH="${ARGUMENTS%% *}"
DOC_DIR="$(dirname "$DOC_PATH")"
bash .claude/scripts/tickets/init-formulate.sh --doc-path="$DOC_PATH"
```

Malfeasance.json は不完全な実装（`[::STUB::]` 未付与）を「犯罪」として記録する台帳である。
CLAUDE.md と同じ階層に存在しなければならないため、`DOC_DIR` 内で初期化する。

```bash
# 犯罪記録台帳が存在しなければ空の状態で作成する（CLAUDE.md と同じ階層に）
node .claude/scripts/tickets/ensure-malfeasance.js "$(dirname "${ARGUMENTS%% *}")"
```

---

### Step 1: RFC 内の I/O 境界参考情報を参照

この I/O 境界参考情報は、grill / drill によって詳細な設計書として RFC を書き上げた段階で作成されたものである。
RFC 執筆者の設計意図が最も新鮮なタイミングで記述された I/O 境界であり、チケット分割において最大限尊重しなければならない。
ただし、後続の /graphify-rfc によってさらに発散的に細分化する I/O 境界分割の設計が行われており、必ずしも RFC 執筆時点の I/O 境界と一致する状態にはないことに注意すること。

対象 RFC に I/O 境界参考情報セクションが存在する場合、それを表示する。

```bash
echo "=== I/O 境界参考情報 ==="
node ".claude/scripts/grill-me-for-rfc/extract-io-boundary.js" "$DOC_PATH" || echo "(I/O 境界参考情報なし)"
echo "========================"
```

---

### Step 2: RFC の設計における関係グラフ構造の確認

このグラフ構造は、/graphify-rfc によって RFC の I/O 境界想定よりもさらに細かい安全な I/O 境界単位に細分化されたノード群とその関係性である。
Step 1 で表示された RFC 執筆時点の I/O 境界参考情報よりも 1 ステージ進んだものであり、チケット分解の主要な判断材料となる。

graphify-rfc スラッシュコマンドで生成されたグラフが存在する場合、show-graph-summary-markdown.js でグラフサマリーを表示する：

```bash
echo "=== グラフ構造サマリー ==="
GRAPH_PATH="$DOC_DIR/$(basename "$DOC_PATH" .md)-GRAPH.json"
if [ -f "$GRAPH_PATH" ]; then
  node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="$GRAPH_PATH" --source="$DOC_PATH" --with-cli-examples
else
  echo "(グラフ構造サマリーなし)"
fi
echo "========================"
```

グラフファイルが存在しない場合はスキップする。グラフファイルのパスは graphify-rfc スラッシュコマンドの導出ルール（`<source-dir>/<basename>-GRAPH.json`）に従って計算する。

---

### Step 3: boundify によるディレクトリ・ファイル構造の確認

このディレクトリ・ファイル構造は、grill / drill → /graphify-rfc → /boundify-graph の直列パイプラインによって最終的に生成された現時点の実装ディレクトリ・ファイル構成である。

**現時点のディレクトリ・ファイル構造は変更を禁止する。** ただし、crate や package、class などが他のプログラムから利用されるためのインターフェースを公開するためのディレクトリやファイルの**追加**に関しては、必要に応じて許可する。
追加を行う場合は、チケット内に当該 *-GRAPH.json および *-Dirs-Tree.json には定義されていない追加ディレクトリまたは追加ファイルであることを**必ず明記しなければならない**。

```bash
echo "=== boundify ディレクトリ・ファイル構造 ==="
DIRS_TREE_PATH="$DOC_DIR/$(basename "$DOC_PATH" .md)-Dirs-Tree.json"
if [ -f "$DIRS_TREE_PATH" ]; then
  node .claude/scripts/rfc-graph/show-dirs-files-tree.js "$DIRS_TREE_PATH"
else
  echo "(Dirs-Tree.json なし)"
fi
echo "========================================"
```

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
bash .claude/scripts/tickets/write-claude-md-formulate.sh \
  --claude-md="$CLAUDE_MD" \
  --doc-path="$DOC_PATH" \
  --title="<設計書タイトル — Step 1 で抽出した実際のタイトルに置き換える>"
```

生成された `CLAUDE_MD` はチケット作業中の任意のタイミングで Claude Code が自動的に読み込み、
設計全体のコンテキストとして利用される。これにより「木（個別チケット）」の作業中も
「森（設計全体）」を常に念頭に置くことができる。

---

### Step 6: 依存グラフの構築（5層モデル）

抽出した全要素を以下の5層に分類する。**例の部分は設計書から実際に抽出した要素で置き換えること**：

| 層 | 内容 | 外部依存 |
|---|---|---|
| Layer 0（型定義） | 構造体、列挙型、トレイト | なし |
| Layer 1（純粋関数） | 外部I/Oなしの純粋ロジック | なし |
| Layer 2（非同期ランタイム） | async関数、タスク管理 | 非同期ランタイム（tokio等） |
| Layer 3（ライフサイクル管理） | 複数リソースの調整 | 非同期ランタイム |
| Layer 4（統合・プラットフォーム） | 外部システム結合、UI | プラットフォームAPI |

この層構造に従い、Layer 0 → Layer 1 → ... → Layer 4 の順にフェーズを設定する。

#### I/O 境界マッピング（言語別）

各層の I/O 境界が、どの言語のどの構文要素に対応するかを以下の表に示す。
チケット作成時は、この表を参照して自チケットの I/O 境界が属する層と言語要素を
`scope` フィールドに型シグネチャ付きで明記する。

| 層 | I/O 境界の契約 | Rust | Go | TypeScript |
|----|---------------|------|----|------------|
| Layer 0（型定義） | 値の構造と制約 | `struct`, `enum`, `trait` | `struct`, `interface` | `interface`, `type` |
| Layer 1（純粋関数） | 引数→戻り値の決定論的変換 | `pub fn` | `func`（大文字公開） | `export function` |
| Layer 2（非同期ランタイム） | Future/Channel の入出力 | `async fn`, `tokio::spawn` | `go` + `chan` | `async function`, `Promise` |
| Layer 3（ライフサイクル管理） | プロセス生存・終了通知 | `JoinHandle`, `mpsc` | `sync.WaitGroup`, `context` | `AbortSignal`, `EventEmitter` |
| Layer 4（統合・プラットフォーム） | 外部システムとの通信 | HTTP/TCP 経由の `pub fn` | `http.Handler`, `io.ReadWriter` | `fetch`, `WebSocket` |

#### kind → Layer マッピング（グラフ構造がある場合）

graphify-rfc スラッシュコマンドで生成されたグラフが存在する場合、Step 2 で表示された `show-graph-summary-markdown.js` の kind 別ノード一覧を使って、各要素の Layer を機械的に割り当てることができる：

| kind | Layer | 理由 |
|------|-------|------|
| `requirement` / `data_model` / `glossary` / `rationale` | Layer 0/1 | 純粋要件・型定義・用語。外部依存なし |
| `state_machine` | Layer 0/1 | 純粋ロジック。外部依存なし |
| `api_contract` | Layer 2 | HTTP等の非同期I/Oを前提 |
| `error_policy` / `security` | Layer 2/3 | 非同期エラーハンドリング・暗号認証（外部ライブラリ依存） |
| `config` | Layer 3/4 | 設定ファイル読込（外部I/O） |
| `test_policy` / `build_ci` | Layer 4 | テストフレームワーク・CI/CDツール依存 |
| `architecture` | Layer 3/4 | システム全体の構成定義 |

グラフが存在しない場合 → 従来通り AI が自力で抽出した要素を5層に分類する。

---

### Step 7: 発散的チケット分解（グラフ構造がある場合のみ）

graphify-rfc スラッシュコマンドで生成されたグラフが存在する場合、Step 2 で得たグラフサマリーを参照し（必要に応じて再度 `show-graph-summary-markdown.js --with-cli-examples` を呼び出してもよい）、グラフの全ノードを走査して最少粒度のチケット候補を列挙する。このStepは「発散」フェーズであり、安全側に振って細かく分解する。統合は次の Step 8_CORRECT で行う。

```bash
# グラフの全ノードを走査し、各ノードを1チケット候補とする
# 必要に応じて再度 show-graph-summary-markdown.js を実行してグラフデータを確認する
# kind → Layer マッピング（上記）で Layer を割り当てる
# エッジ（depends_on）をチケット間の依存関係としてそのまま転用する
# 例: N0001(requirement) → N0003(api_contract) [depends_on]
#     → チケット(N0001)はチケット(N0003)に先行実装必須

# エッジ（part_of）は同一フェーズ内の包含関係として使用する
# エッジ（precedes）は実装順序の決定に使用する
```

**グラフがない場合**: 「グラフがないため発散フェーズをスキップします」と表示し、何もせず次の Step 8_CORRECT に進む。

---

### Step 8: チケット統合チェック（収束） — I/O 境界による候補の束ね直し

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

### Step 9: フェーズ設計

このステップは Step 8（チケット統合チェック）を通過した後の候補に対して、依存グラフに基づいてフェーズを設計する。Step 8 で統合しきれなかった単位は個別チケットとして扱う。

**第1段階: 純粋ロジック・状態機械の完全隔離検証**
- 外部からの揺らぎ（I/O、乱数、非同期実行）を完全に遮断
- Layer 0（型定義）と Layer 1（純粋関数）のみ
- 全テストがメモリ内完結・決定論的・ミリ秒単位

**第2段階: Mock / Fake による制御された実行の導入**
- 非同期ランタイムを導入するが、実I/OはMock/ Fakeで代替
- 仮想クロックで時間を制御
- タイムアウト・競合状態の検証
- Layer 2（非同期ランタイム）が対象

**第3段階: ライフサイクル・エラー処理の統合**
- 複数リソースの協調動作
- 再起動ループ・グレースフルシャットダウン
- 異常系（クラッシュ、タイムアウト）の網羅
- Layer 3（ライフサイクル管理）が対象

**第4段階: プラットフォーム固有・統合・E2E**
- プラットフォーム別実装
- 外部システム結合、UI統合
- クロスプラットフォームE2E検証
- Layer 4（統合・プラットフォーム）が対象

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

### Step 10: Tickets.json スケルトン生成

メタデータを渡してスケルトンを生成する。phases は空配列。

書き出しとスキーマ検証を自動実行する。エラー時は exit 1。

```bash
node .claude/scripts/tickets/write-tickets-json-template.js "$TICKETS_PATH" '{
  "title": "<設計書タイトル> 実装チケット分解設計書",
  "source": "<DOC_PATH>",
  "generatedAt": "<YYYY-MM-DD>",
  "analyzedSections": "<セクション一覧>",
  "resolvedPaths": {
    "rfcPath": "<DOC_PATH>",
    "graphPath": "<DOC_PATHの .md を -GRAPH.json に置換>",
    "dirsTreePath": "<DOC_PATHの .md を -Dirs-Tree.json に置換>"
  }
}'
```

書き出しとスキーマ検証を自動実行する。エラー時は exit 1。

### Step 11: フェーズの追加

Step 7〜Step 10 で設計したフェーズを add-phase.js で追加する。ID は 0 から自動採番。

```bash
echo '{"name":"純粋ロジック・状態機械の完全隔離検証","externalDependencies":"なし"}' | node .claude/scripts/tickets/add-phase.js "$TICKETS_PATH"
echo '{"name":"非同期ランタイム","externalDependencies":"tokio"}' | node .claude/scripts/tickets/add-phase.js "$TICKETS_PATH"
```

全フェーズ追加後、list-phases-and-tickets.js で一覧を確認する：

```bash
node .claude/scripts/tickets/list-phases-and-tickets.js "$TICKETS_PATH"
```

### Step 12: チケットの追加

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
  "testUnit": [
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
echo '{"title":"純粋データ型の定義","scope":[...],"testUnit":[...]}' \
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

### Step 13: フェーズ・チケットチェックリストの出力

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
