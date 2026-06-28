# conver — 二層ループ開発パイプライン

## インストール

conver の `.claude` ディレクトリ（スラッシュコマンド群・チケット管理スクリプト群）を別プロジェクトに導入するには、同梱の `install.js` を使用します。

### 依存関係

```bash
npm install
```

ランタイム依存は `@agentclientprotocol/sdk ^1.0.0` および `@agentclientprotocol/claude-agent-acp ^0.52.0` です。

### ビルド

```bash
npm run build
```

`tsc` が TypeScript ソースを `dist/` にコンパイルします（単一ファイルバンドルは `make deploy` で利用可能）。

```bash
# プロジェクトルート以外からの実行例
node ~/shyme/zasso/tools/conver/dist/conver.js -k <api_key> -s <slack_url>
```

| コマンド | 説明 |
|---------|------|
| `npm run build` | tsc で TypeScript をコンパイル |
| `npm run typecheck` | TypeScript の型チェックのみ（`tsc --noEmit`） |
| `make build-conver` | `npm run build` と同じ |
| `make typecheck` | `npm run typecheck` と同じ |
| `make test-conver` | 全56テストを実行 |
| `make run-conver` | `ARGS` を指定して conver.js を実行 |
| `make deploy TARGET=path` | esbuild バンドルをビルドし配置 |

```bash
# カレントディレクトリに関わらず正しく動作します
install.js -t /path/to/target/.claude
```

ターゲットに同名ファイルが存在する場合、1ファイルごとに上書き確認のプロンプトが表示されます。全ての上書きを自動承認するには `-y` フラグを指定します：

```bash
install.js -y -t /path/to/target/.claude
```

`install.js` はスクリプト自身の位置（`__dirname`）から相対的に `.claude` ディレクトリを特定するため、どのカレントディレクトリから実行しても正しく動作します。

## 概要

conver は、**二層ループ構造**にもとづく開発パイプラインを実現するスラッシュコマンド群を提供するプロジェクトです。

- **外側ループ**: 設計（RFC）の世代サイクル。人間が Claude Code にスラッシュコマンドを入力して実行します。
- **内側ループ**: チケットの実装サイクル。ACP クライアントによって自動化されます。

```
                       外側ループ（RFC世代サイクル）
  ┌──────────────────────────────────────────────────────────────────────────┐
  │                                                                          ▼
  grill → formulate ──→ [内側ループ] ──→ find ──→ formulate-for-next → grill(次)
   ▲                        │                      │                       │
   │                        │ 内側ループ            │                       │
   │                        │ (自動実行: ACP)       │                       │
   │                        ▼                      │                       │
   │                   make → plan → start → review → resolve                │
   │                                                                         │
   │                     ┌── check-final ──→ PASS: 🎉 完了                   │
   │                     │       │                                           │
   │                     │       └── FAIL: ループ継続                         │
   │                     │         ↓                                         │
   │                     │    formulate-for-next (or find)                    │
   └─────────────────────┴──────── 次世代へ継続 ──────────────────────────────┘
```

## conver.js — ACP-based チケット処理パイプライン

`conver.js` はこのプロジェクトの中心的な成果物です。`@agentclientprotocol/claude-agent-acp` を通じて Claude Code のセッションをプログラムから制御し、Tickets.json に定義されたチケットに対して make → plan → start → review → resolve → find の一連の工程を自動実行します。

### 使用方法

```bash
node dist/conver.js -k <DeepSeek_API_Key> -s <Slack_Webhook_URL> [options]
```

### CLI オプション

| フラグ | 説明 | デフォルト |
|--------|------|-----------|
| `-k`, `--api-key` | DeepSeek API Key（必須） | — |
| `-s`, `--slack-url` | Slack Incoming Webhook URL（必須） | — |
| `-t`, `--tickets` | Tickets.json のパス | `./Tickets.json` |
| `-c`, `--count` | 最大処理チケット数 | `999999` |
| `-r`, `--resolve-every` | Nチケット完了ごとに resolve | `3` |
| `-p`, `--push` | resolve 毎に jpush-branch 実行 | `1` |
| `-m`, `--model` | 使用モデル | `deepseek-v4-flash` |
| `-v`, `--verbose` | 詳細表示 | `1` |
| `--timeout` | 各コマンドのタイムアウト（秒） | `1800` |
| `-b`, `--bind-review-in-one-session` | review を同一セッションに結合（0/1） | `1` |
| `--version` | バージョン表示 | — |

### セッションアーキテクチャ

```
チケット P0-1（todo）の処理フロー（-b 1 デフォルト）:

   [Session A]  make-ticket → plan-ticket → start-ticket → review-ticket
        │
        ▼ dispose
   [Session B]  resolve-ticket（resolveEvery 間隔で実行）→ jpush-branch（任意）
        │
        ▼
   全チケット reviewed → [Session C] find-omissions-for-next-rfc
        │
        ▼
   次のチケット P0-2 へ
```

make/plan/start/review は1つの ACP セッションで実行されます（`-b 0` で review を分離可能）。
各チケットの status は以下の5値で管理され、進行状況に応じて必要な工程のみ実行します：

```
todo ──(make)──→ made ──(plan)──→ planned ──(start)──→ done ──(review)──→ reviewed
  ├─ make ✅    ├─ make ❌    ├─ make ❌     ├─ make ❌     └─ loadPendingTickets
  ├─ plan ✅    ├─ plan ✅    ├─ plan ❌     ├─ plan ❌     で除外
  ├─ start ✅   ├─ start ✅   ├─ start ✅    ├─ start ❌
  └─ review ✅  └─ review ✅  └─ review ✅   └─ review ✅
```

## 本質 — ベクトル空間上の収束計算

conver の二層ループは、**RFCが定義する設計ベクトル空間と実装コードが織りなす実装ベクトル空間の差をゼロに収束させる反復計算**です。

### 空間の定義

- **rfcUnderstanding**（14フィールド）が空間の座標軸を定義する
- **フェーズ・チケット**が作業単位の次元を区切る
- **実装コード**（型・関数・テスト・設定）が実装ベクトルを構成する

### OMISSIONS ベクトル

各 omission はある次元における「設計ベクトルと実装ベクトルの差」です：

| omission の属性 | 数学的な対応 |
|----------------|-------------|
| `type` | 差の方向（欠落/不一致/バグ/スタブ残存…） |
| `severity` | 差の大きさ（critical/high/medium/low） |
| `rfcSection` | 設計ベクトルの該当座標 |
| `affectedFiles` | 実装ベクトルの該当座標 |
| `suggestedResolution` | 収束させるための操作 |

### 収束計算

1. **rfcUnderstanding** で座標系を固定する（設計空間は移動しない）
2. **内側ループ**（make→plan→start→review→resolve）が実装ベクトルを設計に近づける
3. **find** が残差ベクトル（OMISSIONS）を計測する
4. **grill(next)** が残差を解消する新たな設計ベクトル（NEXT_RFC）を定義する
5. **check-final** が同一座標系で残差の最終計測を行い、全次元で許容範囲（low のみ）に収まっていることを確認する
6. ノルムがゼロになるまで反復する

### 完了条件の数学的定義

`check-final` が独立した二重計測により `||OMISSIONS|| = 0` を確認したとき、開発は完了です。

---

## 自動化の境界

| ループ | 実行主体 | コマンド | 説明 |
|--------|----------|----------|------|
| **内側** | `conver.js`（ACP クライアント、自動） | `make` → `plan` → `start` → `review` → `resolve` → `find` | チケットの実装〜完了までの一連の流れを自動実行。make/plan/start/reviewは1セッション、resolveは別セッション（`-b 0` で review 分離可能） |
| **外側** | 人間（手動） | `grill`, `formulate`, `formulate-for-next`, `grill-me-for-next-rfc-ja`, `check-final` | 設計判断・ループ継続判断は人間が行う |

内側ループは `conver.js` が自動的に回し続けます。外側ループの各ステップは、人間が Claude Code 上で該当のスラッシュコマンドを実行することで進行します。

---

## スラッシュコマンド一覧

### 外側ループ（人間実行）

#### `/grill-me-for-rfc <調査情報パス> <RFC出力パス>`

調査情報をもとに、RFC 設計書を対話型セッション（grill）で書き上げます。

**入力**: 調査情報のファイル/ディレクトリパス  
**出力**: IETF スタイルの RFC 設計書（.md）

**プロセス**:
1. `init.js` が DesignTree / Status.json / CheckList.md を初期化
2. AI がユーザーに設計判断を質問（Yes/No または選択肢形式）
3. DesignTree のノードを resolved にしていく
4. 全ノード解決 → CheckList.md 生成 → RFC 執筆
5. TBD / TODO / スタブ / 委譲 の混入禁止

**制約**:
- 「完全網羅・スコープ委譲禁止・スタブ禁止」
- 各設計判断にはコードスニペットを伴わせる
- セクション構成は IETF スタイル（Abstract, Motivation, Design, Implementation, Appendix）

#### `/formulate-tickets <設計書パス>`

設計書（RFC）を分析し、依存関係に基づくフェーズとチケットに分解して `Tickets.json` を生成します。

**入力**: RFC 設計書のファイルパス  
**出力**: 設計書と同階層の `Tickets.json`

**プロセス**:
1. 設計書を5層モデル（型定義→純粋関数→非同期→ライフサイクル→統合）で分析
2. 依存グラフに基づいてフェーズを設計
3. 各フェーズにチケットを追加（1チケット・1不変条件）
4. 全チケットは status `todo` で初期化

#### `/formulate-tickets-for-next <NEXT_RFCパス> [OMISSIONSパス]`

`/grill-me-for-next-rfc-ja` が出力した次世代RFC（NEXT_RFC.md）を分析し、既存の `Tickets.json` にフェーズ・チケットを追加・拡張します。

**入力**: 次世代RFCのパス（必須）+ OMISSIONS-XXX.json のパス（任意）  
**出力**: 既存 `Tickets.json` にチケット追加（上書きなし）

**`/formulate-tickets` との違い**:
- 既存の `Tickets.json` を読み取り、不足チケットを追加するのみ
- 既存のチケットやフェーズは一切変更しない
- 各追加チケットは対応する omission ID を参照可能

#### `/grill-me-for-next-rfc-ja <OMISSIONS.mdパス> <NEXT_RFC出力パス>`

`/find-omissions-for-next-rfc` が出力した `OMISSIONS-XXX.md` を入力として、次の世代の RFC を grill セッションで書き上げます。

**入力**: `OMISSIONS-XXX.md` のパス + 次RFCの出力パス  
**出力**: 次世代 RFC 設計書（.md）。親RFCパスと OMISSIONS パスをメタデータとして含む

**次RFCのメタデータ**:
```markdown
---
parent-rfc: <親RFCファイルのパス>
parent-omissions: <OMISSIONSファイルのパス>
---
```

#### `/check-final <最上位親RFCパス>`

`/find-omissions-for-next-rfc` と全く同一の分析を実行し、新たな漏れ・矛盾・不足が存在しないことを確認した上で、全チケットの完了状態を検証して開発完了を宣言する最終ゲート。

**自己分析**: find-omissions と同じ Step 1-6 を実行し、`OMISSIONS-XXX.json` を生成
- 新たな omission が1件も発見されなければ → 通過
- 発見された場合 → severity を評価し、high があれば FAIL、low/medium は理由を添えて許容

**追加検証**:
1. 全チケット reviewed 確認
2. 全9ステップの完了確認

---

### 内側ループ（ACP 自動実行）

#### `/make-ticket [チケットID | タイトル]`

実装仕様書（spec）を作成・詳細化します。

#### `/plan-ticket <チケットID>`

チケットの実装計画を策定し、承認を得ます。

#### `/start-ticket <チケットID>`

計画に従い実装を実行します。完了後 status を `done` に遷移します。

#### `/review-ticket <チケットID>`

`done` チケットの品質検証を行います。通過後 status を `reviewed` に遷移します。

#### `/resolve-ticket <ディレクトリパス>`

指定ディレクトリ配下の警告・エラー・スタブ・犯罪を一括解決します。

#### `/find-omissions-for-next-rfc <RFCファイルパス>`

RFC の設計内容と実際の実装コードを比較し、漏れ・矛盾・不足を発見して `OMISSIONS-XXX.json` に出力します。

**ワークフロー**（直列・直線的、全ステップを steps で追跡）:
1. スケルトン生成（create-omissions.js）
2. RFC理解（14フィールドの rfcUnderstanding を分析。前回の OMISSIONS があれば再利用）
3. ソースコード比較分析（4観点 + 発見即記録）
4. 発見漏れ確認
5. 最終検証
6. 完了報告（Markdown にも変換）

**発見する omission の種類**:
| 種別 | 説明 |
|------|------|
| missing_implementation | RFC で定義されているが未実装 |
| incomplete_implementation | 部分的にしか実装されていない |
| design_deviation | RFC の設計と異なる実装 |
| bug | 明らかなバグ |
| stub_remaining | `[::STUB::]` が残ったまま |
| test_missing | RFC で要求されているがテストがない |
| inconsistency | 設計全体で矛盾している状態 |

---

## チケットのステータス遷移（5値）

```text
todo ──(make)──→ made ──(plan)──→ planned ──(start)──→ done ──(review)──→ reviewed
```

- `list-phases-and-tickets.js` の表示:

| status | 表示 | 意味 |
|--------|------|------|
| `todo` | `[ ]` | 未着手 |
| `made` | `[_]` | spec作成完了 |
| `planned` | `[|]` | 実装計画承認済み |
| `done` | `[/]` | 実装完了（未レビュー） |
| `reviewed` | `[x]` | レビュー完了 |

- フェーズのチェックボックスは配下の全チケットが `reviewed` の場合のみ `[x]` になる（動的評価）

---

## データモデル

### OMISSIONS-XXX.json

`find` コマンド（および `check-final`）が出力する、設計と実装のギャップを記録したファイルです。`rfcUnderstanding` で設計空間の座標系を定義し、`omissions` で残差ベクトルを記録し、`steps` で収束計算の経路を追跡します。

```
OMISSIONS-XXX.json
├── parentRfcPath: string (親RFCのパス)
├── parentRfcTitle: string
├── generatedAt: string (YYYY-MM-DD)
├── summary: string
├── rfcUnderstanding: object (設計空間の座標軸、14フィールド)
│   ├── purpose, goals, successCriteria, nonScope          (2a. 目的とゴール)
│   ├── architecture, componentRelations, designDecisions  (2b. アーキテクチャ)
│   ├── typeDefinitions, apiSignatures, dependencyGraph,   (2c. 実装定義)
│   │   externalDependencies, testRequirements,
│   │   errorHandling, configuration
├── steps[] (収束計算の経路)
│   ├── id, label, status ("todo"|"in_progress"|"done")
│   └── children[] (階層構造)
└── omissions[] (残差ベクトル)
    ├── id: string (O-XXX形式)
    ├── type: enum (7種)
    ├── severity: enum (critical/high/medium/low)
    ├── rfcSection: string
    ├── description: string
    ├── details: string
    ├── affectedFiles: string[]
    ├── suggestedResolution: string
    └── resolvedInNextRfc: boolean
```

### Tickets.json

```
Tickets.json
├── title: string
├── metadata: { source, generatedAt, ... }
├── phases[]
│   ├── id: integer (-1 は PX: 独立フェーズ)
│   ├── name: string
│   └── tickets[]
│       ├── id: integer (フェーズ内連番)
│       ├── title: string
│       ├── status: "todo" | "made" | "planned" | "done" | "reviewed"
│       ├── scope[], testVerification[], notes
│       ├── startedAt, completedAt
│       └── changes[], instrumentation
```

### チケットID命名規則

- フェーズID: `P0`, `P1`, ... / `PX`（独立フェーズ）
- チケットID: `P{phaseID}-{ticketID}`（例: `P0-1`）

---

## スクリプトリファレンス

### チケットCRUD

`add-ticket.js` | `get-ticket.js` | `update-ticket.js` | `delete-ticket.js` | `bulk-add-tickets.js` | `bulk-update-tickets.js` | `bulk-delete-tickets.js`

### 表示・検索

`list-phases-and-tickets.js`（フェーズチェックは動的評価）| `all-tickets.js` | `search-tickets.js` | `get-ticket-as-markdown.js`

### OMISSIONS — スケルトン・追記・変換

`create-omissions.js`（`--check-final` で9ステップ版）| `add-omission.js`（発見即記録・ID自動採番）| `list-omissions.js` | `next-omissions-number.js` | `convert-omissions-to-markdown.js`

### OMISSIONS — RFC理解書き込み

`add-omissions-meta.js` | `add-omissions-rfc-goal.js` | `add-omissions-rfc-architecture.js` | `add-omissions-rfc-detail-1.js` | `add-omissions-rfc-detail-2.js`

### OMISSIONS — 表示・進捗管理

`show-omissions-rfc-understanding.js` | `show-omissions-steps.js` | `update-omissions-step.js`

### OMISSIONS — 前回データ再利用

`get-before-rfc-understanding.js` | `get-before-rfc-understanding.sh`

### フェーズ管理

`add-phase.js` | `add-px-phase.js` | `write-tickets-json-template.js`

### spec / 品質 / 犯罪 / スタブ

`create-spec.js` | `review/run-quality-checks.js` | `review/find-all-stubs.js` | `scan-crimes.sh` | `malfeasance-create.js` | `malfeasance-update.js`

### grill

`grill-me-for-rfc/init.js` | `grill-me-for-rfc/update-tree.js` | `grill-me-for-rfc/tree-query.js` | `grill-me-for-rfc/update-status.js` | `grill-me-for-rfc/session-status.js` | `grill-me-for-rfc/check-all-schema.js` | `grill-me-for-rfc/generate-checklist.js` | `grill-me-for-rfc/list-files.js` | `grill-me-for-rfc/validate-question-format.js`

### 共通ライブラリ

`lib/omissions-update.js` | `lib/tickets.js` | `lib/ticket-config.js` | `lib/validate-tickets.js` | `lib/validate-omissions.js` | `lib/malfeasance-utils.js` | `lib/validate-malfeasance.js`

---

## 第一級規則 — `[::STUB::]` マーカー絶対義務

不完全な実装（スタブ・モック・仮実装・プレースホルダー等）にはすべて `[::STUB::]` マーカーを付与しなければなりません。Malfeasance.json に記録し、解決するまで次ステップに進めません。

`[::STUB::]` は OMISSIONS の一種であり、`find` コマンドはこれを omission として記録します。

対象パターン: `todo!()` / `unimplemented!()` / `panic!()` / 空の関数本体 / `return Ok(())` / コメントアウトコード / `TODO` / `FIXME` / `HACK` / `XXX` / Mock / `#[allow(...)]`

---

## はじめかた

### スラッシュコマンド経由（Claude Code 内）

1. `/grill-me-for-rfc` で設計判断を確定し、RFC を書く
2. `/formulate-tickets` で RFC から `Tickets.json` を生成する
3. ACP クライアント（後述の `conver.js`）が内側ループを自動実行する
4. `find` が出力した `OMISSIONS-XXX.json` を確認する
   - 次の設計が必要なら `/grill-me-for-next-rfc-ja` → `/formulate-tickets-for-next` で次世代へ
   - 軽微なら `/check-final` で完了確認
5. `/check-final` が PASS を返したら 🎉 開発完了

### CLI 直接実行

```bash
# Tickets.json を用意した上で
node dist/conver.js -k <api_key> -s <slack_url>

# 最大5チケット処理、resolve 間隔2、push 有効
node dist/conver.js -k <api_key> -s <slack_url> -c 5 -r 2 -p 1
```
