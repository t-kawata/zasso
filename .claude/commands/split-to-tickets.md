---
description: 設計書（Requirements / Functional Specification / RFC / 設計ドキュメント）を分析し、依存関係に基づいたフェーズ（段階）・フェーズ・個別チケットに分解する。各チケットは「1チケット・1不変条件」を徹底し、安全な I/O 境界を持つ実装単位に分解する。
argument-hint: </path/to/RFC-*.md> </path/to/*-GRAPH.json> </path/to/*-Dirs-Tree.json>
---

# /split-to-tickets

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
| `update-split-step-status.js` | `--status=<path> <start-step\|end-step\|fail-step\|reset-to-step\|status> <STEP_ID>` | SPLIT-Status.json の進行管理（6サブコマンド） |

全スクリプトは書き込み前にスキーマ検証（`validate-tickets.js`）を実行し、失敗時は保存しない。

## 分析手順

### Step 0: 初期化（引数パース + Malfeasance.json 初期化 + 出力先決定）及びRFC読込

#### 0-1. 初期化

```bash
# 全引数を配列でパース（第1引数=RFC, 第2引数=GRAPH.json, 第3引数=Dirs-Tree.json）
IFS=' ' read -r DOC_PATH GRAPH_PATH DIRS_TREE_PATH <<< "$ARGUMENTS"
DOC_DIR="$(dirname "$DOC_PATH")"
BASENAME="$(basename "$DOC_PATH" .md)"
STATUS_PATH="${DOC_DIR}/${BASENAME}-SPLIT-Status.json"
bash .claude/scripts/tickets/init-split-to-ticket.sh --doc-path="$DOC_PATH"
```

※ 0-1. 以降のStepでは、進行ステータスの管理に `update-split-step-status.js` を使用する。

各Stepの開始・終了時の呼び出し例：

```bash
# Step の開始（STEP_ID は "0-1", "4-2" 等の実際のステップ識別子）
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step <STEP_ID>
# ... 処理 ...
# Step の正常終了（currentStep が次の Step に進む）
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step <STEP_ID>
# 異常終了時（currentStep は変更なし）
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" fail-step <STEP_ID>
# エラー修正後、復帰
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step <STEP_ID>
```

#### 0-2. Malfeasance.json 作成

```bash
# Step 0-1 を開始
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "0-1"
```

Malfeasance.json は不完全な実装（`[::STUB::]` 未付与）を「犯罪」として記録する台帳である。`DOC_DIR` 内で初期化する。

```bash
# 犯罪記録台帳が存在しなければ空の状態で作成する
node .claude/scripts/tickets/ensure-malfeasance.js "$DOC_DIR"

# Step 0-1 正常終了
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "0-1"
```

### エラー時の復帰
スクリプトが出力するエラーメッセージに従って修正した後、`reset-to-step "0-1"` でステータスを戻し、Step 0 のコマンドを最初から再実行する。

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "0-1"
```

#### 0-3. RFC 読込（analyze-source-structure.js で構造把握 → セクションごとに順次読込）

```bash
# Step 0-2 を開始
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "0-2"

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

```bash
# Step 0-2 正常終了
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "0-2"
```

### エラー時の復帰
```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "0-2"
```

---

### Step 1: RFC 内の I/O 境界参考情報を参照

```bash
# Step 1 を開始
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "1"
```

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

```bash
# Step 1 正常終了
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "1"
```

### エラー時の復帰
```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "1"
```

---

### Step 2: RFC の設計における関係グラフ構造の確認

```bash
# Step 2 を開始
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "2"
```

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

```bash
# Step 2 正常終了
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "2"
```

### エラー時の復帰
```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "2"
```

---

### Step 3: boundify によるディレクトリ・ファイル構造の確認

```bash
# Step 3 を開始
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "3"
```

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

```bash
# Step 3 正常終了
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "3"
```

### エラー時の復帰
```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "3"
```

---

### Step 4: 第一次フェーズ設計（機械的フェーズグルーピング）

#### 4-1. スクリプトによるフェーズ分割

```bash
# Step 4-1 を開始
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "4-1"
```

GRAPH.json と Dirs-Tree.json を入力とし、`phasify-graph-and-dirs-files-tree.js` が数学的に安全な重み付きトポロジカルソートと SCC 縮約により全ノードを実装フェーズにグルーピングする。結果は Tickets.json の phase[].nodeIds に書き込まれる。

```bash
node .claude/scripts/rfc-graph/phasify-graph-and-dirs-files-tree.js \
  "$GRAPH_PATH" \
  "$DIRS_TREE_PATH"
```

出力末尾のサマリー行で合格（✅）を確認する。不合格（⚠️）の場合は不合格原因を報告して split を中断。

```bash
# Step 4-1 正常終了
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "4-1"
```

### エラー時の復帰
```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "4-1"
```

#### 4-2. 全フェーズの名前とサマリー書き込み

```bash
# Step 4-2 を開始（4-2 ループ全体の開始）
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "4-2"
```

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

# Step 4-2 正常終了（4-2 ループ完了）
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "4-2"
```

### エラー時の復帰
```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "4-2"
```

### Step 5: 第一次チケット定義（チケット化）

```bash
# Step 5-1 を開始（5-1 ノード詳細表示ループの開始）
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "5-1"
```

4-2 で書き込まれた全フェーズに対して、以下の 5-1 → 5-2 を**1フェーズずつ逐次実行する**。
全フェーズを一括で処理してはならない。

#### 5-1: フェーズ内ノードの詳細取得

`show-phase-nodes.js` が指定フェーズに割り当てられた全ノードの詳細（ID・タイトル・種別・要約・実装先ファイルパス）を Markdown 形式で出力する。

```bash
node .claude/scripts/rfc-graph/show-phase-nodes.js \
  --tickets="$TICKETS_PATH" \
  --graph="$GRAPH_PATH" \
  --dirs-tree="$DIRS_TREE_PATH" \
  --phase="P{n}"
```

AI が出力を理解し、各ノードの I/O 境界性と実装先ファイルパスを考慮して、1回の実装で安全に行えるノードの組み合わせを判断する。

5-1 の各フェーズループが全て完了したら、5-2 に進む。

```bash
# Step 5-1 正常終了（5-1 ループ完了）
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "5-1"

# Step 5-2 を開始（5-2 チケット化ループの開始）
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "5-2"
```

#### 5-2: チケット化（add-tickets-for-phase.js）

`add-tickets-for-phase.js` は、stdin から受け取ったチケット配列を一括で追加し、追加後に当該フェーズの全 `nodeIds` がチケット化されたかを検証する。検証が通らなければ書き込みは行われず（ロールバック）、exit 1 で終了する。

```bash
echo '<tickets-array-json>' | node .claude/scripts/tickets/add-tickets-for-phase.js \
  "$TICKETS_PATH" \
  "$DIRS_TREE_PATH" \
  "P{n}" \
  "$GRAPH_PATH"
```

#### チケットのフィールド定義・詳細度指針

各フィールドのスキーマは `tickets-schema.json` `#/definitions/ticket` に定義されている。
`id`, `phaseId`, `status` はスクリプト自動設定のため入力禁止。それ以外の全フィールドは `additionalProperties: true` により追加可能。

**記述の長さと情報密度に関する厳格な指針**:

AI がチケットを登録する際、**簡素で短い記述は「横着」とみなす**。以下は最低要件である。

| フィールド | 最低目安 | 基準（実在の Tickets.json 実例） |
|-----------|---------|------------------------------|
| `background` | **300文字以上** | 622文字 — 調査結果（箇条書き）、コードレベルの具体的言及を含む複数段落 |
| `scope` | **各項目を型シグネチャ付きで列挙** | 828文字 — ファイル名＋処理内容＋種別を1項目ずつ具体的に |
| `testVerification` | **項目ごとにテスト内容を明示** | 870文字 — 「UT: 〜」の形式で正常系・異常系・境界値を列挙 |
| `notes` | **複数セクション構成、500文字以上** | 1342文字 — 実装サマリー・テスト結果・翻訳可能性・リスクを構造化 |
| `relatedTicketIds` | **依存方向と理由を明記** | 251文字 — 「P17-1 (依存: …), P19-1 (被依存: …)」形式 |

以下の JSON は上記の指針を満たした記述例である。**簡素なプレースホルダー（`<...>` 形式）で済ませてはならない。**
`default_files` は `--dirs-tree` 指定時にスクリプトが自動設定するため、AI が入力してはならない。

```json
[
  {
    "title": "認証トークン生成 — Ed448-Goldilocks 署名生成・検証API",
    "nodeIds": ["N0001", "N0003"],
    "default_files": [
      "src/auth/keystore.rs",
      "src/auth/token.rs"
    ],
    "background": "フェーズ0「認証基盤」の中核。N0001 は Ed448-Goldilocks を使用したトークン生成処理（鍵ペア生成・署名・検証）を定義し、N0003 はトークンリフレッシュ機構（期限切れ検出・再署名）を定義する。両者は同一の鍵ストア（src/auth/keystore.rs）を共有し、鍵のシリアライズ形式も共通であるため、同一チケットで実装することで不変条件（鍵の一貫性）を検証しやすくなる。鍵長は448ビット固定、署名アルゴリズムはEdDSA。実装先は src/auth/token.rs および src/auth/keystore.rs。",
    "scope": [
      "pub fn generate_keypair() -> Result<(PrivateKey, PublicKey), CryptoError> — Ed448鍵ペア生成。システムエントロピーを source に、OS提供のCSPRNGを使用。",
      "pub fn sign(payload: &[u8], private_key: &PrivateKey) -> Result<Signature, CryptoError> — 指定ペイロードに対するEd448署名生成。署名長は114バイト固定。",
      "pub fn verify(payload: &[u8], signature: &Signature, public_key: &PublicKey) -> Result<bool, CryptoError> — 署名検証。タイミング攻撃対策のため比較は定数時間で行う。",
      "pub struct Token { pub payload: Vec<u8>, pub signature: Signature, pub expires_at: SystemTime } — トークン型。有効期限を保持し、検証時に現在時刻との比較を行う。",
      "pub fn refresh(token: &Token, private_key: &PrivateKey) -> Result<Token, CryptoError> — 期限切れトークンの再署名。有効期限内のトークンには新たな期限を設定して再署名する。"
    ],
    "testVerification": [
      "UT: generate_keypair が毎回異なる鍵ペアを生成する（同一性の否定）",
      "UT: sign → verify が正しい署名に対して true を返す（Happy Path）",
      "UT: verify が改ざんされたペイロードに対して false を返す（改ざん検知）",
      "UT: verify が異なる鍵ペアの署名に対して false を返す（鍵バインディング）",
      "UT: refresh が期限内トークンに新しい期限を設定し再署名する",
      "UT: refresh に期限切れトークンを渡すとエラーを返す",
      "UT: Token の expires_at が過去の場合に verify が false を返す（期限切れ検知）",
      "境界値: 空ペイロードの署名生成・検証",
      "境界値: 最大ペイロード長（65535バイト）での署名・検証"
    ],
    "testExceptions": ["SecretKey のメモリゼロクリア（mlock/mprotect）はカーネル依存のためユニットテスト不可。CI の integration test で valgrind 確認。"],
    "referenceSection": "RFC-ROOT.md (§3.1 認証トークン形式, §3.2 鍵管理)",
    "relatedTicketIds": "P0-2 (依存: エラー型 CryptoError の定義), PX-YY (Ed448ライブラリラッパー, 先行実装必須), P0-4 (被依存: Session管理が本チケットの Token を入力として使用)",
    "notes": "結合テスト計画:\n[::STUB::] P0-4（Session管理）実装後に、自チケットが出力する Token と P0-4 が入力として受ける Token の結合テストを追加する。完全性の基準: P0-4 が Token::verify を呼び出した結果に基づいて正しく Session を確立・拒絶すること。\n\n注意事項:\n- PrivateKey のシリアライズは PKCS#8 v2 形式に従う\n- PublicKey のシリアライズは SPKI 形式に従う\n- 定数時間比較には borrow::subtle の ConstantTimeEq トレイトを使用すること"
  }
]
```

**チケット構成のルール**:
- 1つ以上のノードを束ねて1チケットとする（単一ノードでも可）
- 全 `nodeIds` を重複なく、過不足なくチケット化する
- 各チケットの `nodeIds` 配列には、そのチケットに含まれるノードIDを全て列挙する
- チケット化は当該フェーズ内で完結し、他フェーズのノードを含んではならない

5-1 → 5-2 が完了したら次のフェーズ（P1, P2, ...）に進む。

全フェーズ終了後、以下のスクリプトで全フェーズのチケット化が完了していることを確認する。
不合格の場合は全てのフェーズが完了するまで Step 6 への進行を禁止する。

```bash
node .claude/scripts/tickets/verify-all-ticket-coverage.js "$TICKETS_PATH"

# Step 5-2 正常終了（5-2 ループ完了）
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "5-2"
```

### エラー時の復帰
```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "5-2"
```

### Step 5-3: フェーズ統合

チケット化が完了した全フェーズに対して、チケット数が3未満のフェーズを自動統合する。
`consolidate-phase-tickets.js` が後方から走査し、閾値未満のフェーズを安全にマージする。

```bash
# Step 5-3 を開始
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "5-3"
```

`consolidate-phase-tickets.js` が全フェーズのチケット数を確認し、3未満のフェーズを後方のフェーズにマージする。6つのサブステップ（ガード→バリデーション→後方統合→ID振り直し→relatedTicketIds再生成→status.json更新→最終検証）を逐次実行する。

```bash
node .claude/scripts/tickets/consolidate-phase-tickets.js \
  "$TICKETS_PATH" \
  "$STATUS_PATH"
```

出力末尾の ✅ または ⚠️ を確認する。不合格の場合はエラー原因を確認して修正した上で 5-3 を再実行する。

```bash
# Step 5-3 正常終了
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "5-3"
```

### エラー時の復帰
```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "5-3"
```

### Step 6: フェーズ・チケットチェックリストの出力

```bash
# Step 6 を開始
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "6"
```

全てのチケットの追加が完了したら、list-phases-and-tickets.js でチェックリストを出力して報告する：

```bash
node .claude/scripts/tickets/list-phases-and-tickets.js "$TICKETS_PATH"

# Step 6 正常終了（全Step完了）
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "6"
```

### エラー時の復帰
```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "6"
```

出力例:
```
- [] P0: 純粋ロジック・状態機械の完全隔離検証
    - [ ] P0-1: 純粋データ型の定義
    - [ ] P0-2: エラー型の定義
    - [ ] P0-3: プロセス状態とレジストリ型の定義
- [] P1: 非同期ランタイム・Mock可能な実行基盤
    - [ ] P1-1: RestartPolicy::on_crash_default と next_delay の実装
```

## 注意事項
- 出力先 Tickets.json が既に存在する場合は上書き前にユーザーに確認を取ること。
