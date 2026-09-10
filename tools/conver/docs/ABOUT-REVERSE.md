# ABOUT-REVERSE — 既存プロジェクトを conver の4層ループへ反転させる「逆回転」パイプライン

> **この文書の目的**: conver を初めて見る専門家が、背景・文脈・設計意図をすべて理解したうえで、**逆回転（リバースエンジニアリング）パイプラインの設計を批判的にレビューし、不足している解析・手法・ステップを提案できる**ようにすること。
>
> **この文書が明示的に求めているもの**: 我々の提案は**出発点にすぎない**。リバースエンジニアリングはエンジニアリングの中で最大級に難しく、成功率が極めて低い。以下を求めている。
>
> 1. 我々の提案の**妥当性の検証**と**見落としの指摘**
> 2. 世界中で実績のある**リバースエンジニアリング手法・解析手法**の情報提供（第7章）
> 3. **どこに・どのような解析を入れると・どのような理由で精度が向上するか**の具体案
> 4. 決定論的解析に限らず、**非決定論的な AI の判断を極限まで助ける**ための解析・補助・ステップ設計（第7.4節）
>
> **読み進め方**: conver を初めて見る読者は 1章 → 2章と進み、**初出語で止まったら 1.6 節**を参照されたい。設計を具体的に批判するには **2.6 節（成果物の具体形）と 2.7 節（既存実装の現物構成）** が要る。逆回転の配置を評価するには **6.10 節（データフロー）と 6.11 節（Worked example）** を、失敗の議論には **7.6 節（失敗モード）** を、着手判断には **3.6 節（適格条件）と 7.7 節（段階的戦略）** を参照されたい。**7.8 節に、我々が明示的に答えを求めている問いをチェックリストとしてまとめた。**

---

## 1. 背景 — conver とは何か

### 1.1 解こうとしている課題

ソフトウェアは「一度作って完成」ではない。市場が変化するたびに、機能追加・方向転換・新要件対応という形で**開発へ再投資**し続けなければならない。長期開発で最も恐ろしいのは、**変化がシステムを矛盾だらけにすること**である。過去の設計判断がどこに記録されたか分からなくなり、実装が設計から乖離し、テストが嘘をつき始める。そうなると再投資はリスクにしかならず、ビジネスは変化を諦めるか、破壊的な作り直しを強いられる。

conver はこれを、**「正典 RFC」を中心とした4つのループ**で解決する。Claude Code 上で動作する強力なスラッシュコマンドハーネスの総体である。

### 1.2 4つのループ

| ループ | 実行者 | コマンド | 責務 |
|---|---|---|---|
| **上流ループ（分解）** | 人間＋AI | `/grill-me-for-rfc` → `/graphify-rfc` → `/boundify-graph` → `/split-to-tickets` | 正典 RFC を書く → 論理グラフ化 → ディレクトリ境界生成 → チケット分解 |
| **実装ループ（収束）** | **AI 自動**（`conver.js` が ACP 経由で駆動） | `/make-ticket` → `/plan-ticket` → `/start-ticket` → `/review-ticket` → `/resolve-ticket` → `/consolidate-stubs` → `/find-omissions` | チケット実装 → 品質検証 → スタブ解決 → 契約ギャップ計測 → 収束 |
| **出荷ループ（商品化判定）** | 人間＋AI | `/crystalize-readme` | 使い方 README をセクション単位で「ユーザーにとって素敵か」判定。書けない部分を RESIDUE として残す |
| **進化ループ（再投資）** | 人間＋AI | `/drill-rfc-down` | RESIDUE／会話／資料を grill で確定し、RFC・GRAPH・Dirs-Tree・Tickets を**差分**として矛盾なく更新 |

### 1.3 収束の設計思想 — 3種のギャップを、3つの計測器で分ける

**RFC 設計書が正典（canon）である。** 実装ループはチケット単位で実装を RFC に近づけ、`/find-omissions` が「設計と実装のギャップ」を計測する。

| ギャップの起因 | 計測器 | 対処 | ループ |
|---|---|---|---|
| **実装起因**（契約がテストに翻訳されていない、未実装、バグ） | `/find-omissions` | omission チケットとして `Tickets.json` にマージ → 再実装 | 実装ループ内 |
| **商品起因**（「ユーザーにとって素敵な使い方」として不完全・危険・欠落） | `/crystalize-readme` | README に RESIDUE として記録 → `/drill-rfc-down` がチケット化 | 出荷ループ経由 |
| **設計起因**（RFC 自体の考慮不足、市場変化による進化要求） | `/drill-rfc-down`（grill） | 正典 RFC・GRAPH・Dirs-Tree・Tickets を差分更新 | 進化ループ経由 |

### 1.4 再投資可能性 — 5つの整合性

**再投資可能性（reinvestment capability）** とは、ビジネスが市場変化に応じて**何度でも安全に開発へ再投資できる**構造のことである。その安全性は、次の5つの整合性が**同時に**満たされることで成り立つ。

| # | 整合性 |
|---|---|
| 1 | **正典 RFC が安全に変化・進化できる**（変化の起点は常に RFC、grill で設計判断として確定・追跡される） |
| 2 | **グラフ（`*-GRAPH.json`）に一切の矛盾を発生させない** |
| 3 | **グラフを実体化した Dirs-Tree（`*-Dirs-Tree.json`）に一切の矛盾を発生させない** |
| 4 | **実装が以上と完全に一致する** |
| 5 | **テストコードがそれを完全に保証する** |

**進化とはこれら5つを壊すことではなく、全てをロックステップで一段上げること**である。

### 1.5 順回転の大前提

**4つのループはすべて「正典 RFC が既に根元に存在する」ことを前提にしている。** これが順回転（forward rotation）の大前提であり、同時に**最大の制約**である。RFC が無ければ、graphify も boundify も split も、ましてや収束判定も始まらない。

### 1.6 初出語の定義 — 読者が最初に押さえるべき登場人物

以降を読み進めるために必要な最小限の語をここで定義する。網羅的な用語集は第10章にある。

| 語 | 定義 |
|---|---|
| **チケット（ticket）** | 実装の最小単位。`Tickets.json` に `P{phaseID}-{ticketID}` の複合キーで格納される |
| **フェーズ（phase）** | 依存関係に基づいてチケットを束ねた実装の段階。重み付きトポロジカルソートと SCC 縮約で機械的に決まる。3 チケット未満のフェーズは後方へ自動マージされる |
| **`Tickets.json`** | 実装ループの**単一情報源**。`phases[] → tickets[]` の構造を持ち、各チケットが `status`（`todo` → `made` → `planned` → `done` → `reviewed`）を遷移する |
| **契約（Contract）** | ノード間の I/O 境界に付与される **Precondition / Postcondition / Invariant**。`/graphify-rfc` がグラフのエッジに annotation として付ける |
| **`*-GRAPH.json`** | RFC を I/O 境界単位の細粒度ノード（`N0001`〜）と属性付きエッジに分割した論理グラフ。**常にチケット粒度より細かく分割（発散）**し、後段のコマンドが粗い粒度で束ね直す |
| **`*-Dirs-Tree.json`** | グラフを物理ディレクトリ境界へ写したもの。`languageRules` による言語別可視性を持つ |
| **spec** | `/make-ticket` が作るチケット単位の実装仕様書（`specs/P{id}-{n}.md`）。契約を**テスト可能な形へ翻訳**した内容を含む |
| **omission** | `/find-omissions` が検出する「契約がテストへ正しく翻訳されていない」ギャップ。`Tickets.json` にマージされ、実装ループへ戻る |
| **RESIDUE** | `/crystalize-readme` が README 内に残す「書けないセクション」。**「なぜ書けないか」のメモではなく、実装を補強するためのチケットの素材**である |
| **residual** | workspacify の self-grill が解けなかった問い。`grill_question` を伴い、**後段の人間 grill へ構造化して引き継がれる** |
| **`[::STUB::]`** | 不完全実装を示す必須マーカー。`Malfeasance.json` に記録され、解決するまで次の工程に進めない（conver の第一級規則） |

> **注意**: conver は「契約 → テスト」の翻訳を**機械的に計測**する。したがって契約は、**テスト可能な形に翻訳できない限り仕様として未完成**とみなされる。この厳格さが、後述する逆回転の難しさの源泉でもある（**逆回転では、この翻訳が「既に済んでいる」ように見えてしまう**）。

---

## 2. 第五層 — workspacify とは何か

### 2.1 位置づけ

`/workspacify-tree` と `/workspacify-allocate` は、4つのループを**包み込む外殻**である。ループ間の辺ではなく、**第5層**にあたる。

4ループが「1つのモジュール内の設計と実装」を扱うのに対し、workspacify は**「仕様書全体を、どのモジュールにどう切るか」**を決め、その**切断面（結合契約）を機械可読な形で確定させる**。

```
spec.md ─[/workspacify-tree]→ WORKSPACIFY-TREE-MANIFEST.json      (stage 1: 分割設計)
                                      │
        [/workspacify-allocate]→ 実ディレクトリ + 各pkg/RFC-SEED.md
                                  + WORKSPACIFY-ALLOCATE-MANIFEST.json (stage 2: 実体化)
                                      │
                    以後は 各ディレクトリで 4ループ:
                    /grill-me-for-rfc → /graphify-rfc → /boundify-graph → /split-to-tickets
                      → 実装ループ → /crystalize-readme → /drill-rfc-down
```

### 2.2 `/workspacify-tree`（stage one）

- **入力**: Markdown 仕様書 1枚のみ（ATX 見出しを1つ以上含む）
- **出力**: カレントディレクトリに `WORKSPACIFY-TREE-MANIFEST.json`（**単一の正典**）
- **6 Step**: `parse`(G0/G1 入力ロック) → `extract`(G2 候補ハーベスト) → decision JSON 執筆 → `gate`(G3/G4 自己修復ループ) → `finalize`(G5 原子的公開) → report
- **ゲート階層**: G0 入力ロック → G1 構造 → G2 要求インベントリ → G3 ワークスペース（カタログ／owner 一意性／過分割／必須責務）→ G4 依存（DAG／層規則／循環／**実装順序の証明**）→ G5 成果物完全性。**親が PASS でない子は決して PASS にならない**

### 2.3 `/workspacify-allocate`（stage two）

- **入力**: stage one の manifest のみ（**受け取った証明済み素材を再計算・再解釈しない**）
- **出力は3種のみ**: 実ディレクトリツリー / 各パッケージの `RFC-SEED.md` / `WORKSPACIFY-ALLOCATE-MANIFEST.json`
- **ゲート階層**: G0 入力ロック → G2 転送基礎・安全性 → G3 seed レンダ・局所検査 → **G3.7 self-grill と residual の到達** → G4 双方向契約 → G5 **WIG**（Workspace Integration Graph: 誰も履行できない結合・二重 owner・二重変更・検証者なき証明を違反として検出）＋実装順序 → G6 公開・reload・cleanup
- **`RFC-SEED.md`** は完成 RFC ではなく `/grill-me-for-rfc` の**種**。14見出し固定で、**§1（Identity/Position）と §2（Coupling Contracts）は機械注入 — AI は書けない**

**self-grill（G3.7）** は最重要の機構である。AI が自分自身を敵対的に5焦点（`implementer` / `counterpart` / `test` / `grill` / `adversarial`）でレビューし、**最終パスで findings が 0 になるまで収束**させる。解けなかった問いだけが residual となり、後段の**人間 grill へ構造化して引き継がれる**。`TODO` / `TBD` / `ask the human` / `waiting for approval` 等は**全文禁止**（人間への差し戻し表現を機械が拒否する）。

### 2.4 順回転が物理的に保証しているもの

| 保証 | 実装 |
|---|---|
| **何も存在しないこと** | `fresh-workspace only`。既存パスがあれば **BLOCKED**。マージ・上書き・削除をしない |
| **壊れない公開** | temp → fsync → read-back → rename の原子的公開 |
| **片側バイパスの不在** | stage one の finalize が **stage two の entry gate をそのまま呼ぶ**（同一述語・二重ゲート） |
| **AI の承認なき COMPLETE の不在** | `semantic_review.status === "APPROVED"` が無ければ機械は COMPLETE を出さない |

### 2.5 三層の境界 — 機械 / AI / 人間

| 層 | 担うもの | 性質 |
|---|---|---|
| **機械** | 解析・確定判断・検証・**給仕** | 決定論。極限まで拡大する |
| **AI** | 意味論的・非決定論的な理解・解釈・判断 | **面積を極小化**し、材料を最大化する |
| **人間** | **パイプラインが成功したかどうかの最終判定** | **機械的判定を放棄する** |

既存の設計は「**決定論で確定できることはスクリプトが確定判断を下し、AI はその結論を受け入れるのみ。非決定論が不可欠なことだけを AI が判断する（ただし決定論の結果を制約として与える）**」という原則で貫かれている。加えて重要なのは、**過剰機械化の回避**である。抽出器は候補のハーベストまで、検証器は制約の確認まで、境界レビューは「リスク候補の発見」までしか行わない。

### 2.6 workspacify の入出力の具体形

配置を批判するには、**現在の成果物が実際にどのような形をしているか**を知る必要がある。以下は実装済みスキーマに基づく主要フィールドである。

**`WORKSPACIFY-TREE-MANIFEST.json`（stage one の成果物・単一の正典）**

| フィールド | 内容 |
|---|---|
| `artifact_kind` / `schema_version` / `status` | `workspacify-tree-manifest` / バージョン / `COMPLETE` |
| `input` | `{ path, source_hash }` — 入力仕様書とその SHA-256。**以後の全段が entry gate でこのハッシュを再検証する** |
| `workspace[]` | パッケージ配列。`id` / `name` / `path` / `layer`（`foundation` / `protocol` / `ports` / `adapters` / `core` / `interfaces` / `conformance`）/ `kind` / `responsibilities`（非空必須）/ `seed_required` / `owns`（`objects` / `claims` / `invariants` / `state_machines` / `error_codes` / `required_tests`） |
| `tree[]` | ディレクトリツリー。**葉ディレクトリのパス集合がパッケージのパス集合と一致**することが必須 |
| `ownership[]` | `{ objectId, packageId }` — 候補の一意な所有者。全カテゴリで `unallocated == 0` が要求される |
| `dependencies[]` | `{ from, to, reasonCode, reason }`。**`reasonCode` は 26 語の閉じた語彙**（`canonical-value` / `merkle-proof` / `payment-settlement` 等）から選ぶ。語彙外は G4 が拒否する |
| `boundaries[]` | 依存エッジと1対1に対応する契約境界。**エッジと境界の双方向カバレッジが強制される**（片側宣言は通らない） |
| `adapters` | `ports` と `databasePolicy`（RDBMS 永続化が必要な場合のみ `applicable: true`）。生 SQL と DB 型の漏洩は機械検出される |
| `implementation_order` | `{ serial, levels }` — **provider が consumer より前**。DAG の循環数は 0 でなければならない |
| `stage2_handoff` | stage two へ渡す証明済み素材（`contract_boundaries` / `residual_questions` / `eligible`） |
| `semantic_review` | `{ status: "APPROVED", statement, approver }` — **無ければ機械は COMPLETE を出さない** |
| `final_audit` | 各カウント（`unallocated_count` / `ownership_disagreement_count` / `cycle_count` / `raw_sql_count` …）。**FAIL の原因はここに数値で現れる** |

**`WORKSPACIFY-ALLOCATE-MANIFEST.json`（stage two の機械最終権威）**

| フィールド | 内容 |
|---|---|
| `input_tree_manifest` | `{ path, hash, spec: { path, sha256 } }` — 証明済みの stage one 成果物 |
| `seed_index[]` | `{ package, path, sha256 }` — 公開された全 seed |
| `source_coverage` | `segments_total` / `segments_covered` / `material_segments` / `non_material_segments` / `uncovered`（**常に空**） |
| `contract_registry[]` | 検証済みの結合契約（`contract_id` / `boundary_id` / `consumer` / `provider` / `connection_kind` / `owners` / `clauses` / `source_refs`） |
| `wig` | `summary`（層別・種別のノード/エッジ数）/ `counts` / `hash` / `violations`（**常に空**） |
| `implementation_order` | stage one の証明と一致することが検証される |
| `self_grill` | `passes` / `converged` / `focuses` / `rounds[]`（pass, focus, status, finding_count）/ `residual_count` |
| `handoff_summary` | 人間 grill への引き継ぎ。`unresolved[]` / `grill_questions[]` / `risky_boundaries[]` |
| `integrity` | 正規化方式 / ハッシュアルゴリズム / `manifest_hash`（自己ハッシュ）/ `reload_validation` |

**`RFC-SEED.md` の14見出し（固定順）**

```text
§1  Identity and Position in the Whole System      <- 機械注入
§2  Coupling Contracts (I/O Boundary)              <- 機械注入
§3  Source Coverage and Allocation Index           <- 機械注入
§4  In-Scope Objects, Claims, Predicates, State and Invariants
§5  Incoming Dependencies and Consumer Obligations
§6  Outgoing Provider Obligations
§7  State Ownership and State-Transition Material
§8  Side-Effect and External-I/O Boundaries
§9  Canonicalization, Signatures and Proof Responsibilities
§10 Failure, Rejection, Recovery and Finality Material
§11 Required Unit, Integration, Exception and Malfeasance Test Material
§12 Grill Questions and Explicitly Unresolved Design Choices
§13 Forbidden Dependencies, Non-Interference Boundaries and Non-Goals
§14 Source Traceability Index                      <- 機械注入
```

§3 の **Allocation Index** は、manifest の所有者割当と**全パッケージ横断の全単射**（欠落 0 / 重複 0 / 未知 0 / 他 seed への漏洩 0）であることが機械検証される唯一の表である。**自パッケージが所有する項目だけを載せる**：

```markdown
| Category | Inventory ID | Canonical Name |
| --- | --- | --- |
| object | obj-000001 | Alpha Record |
| invariant | inv-1 | alpha-invariant |
```

### 2.7 既存実装の現物構成 — どこに何を足すのか

**具体的な提案をするには、現時点の実装の姿が必要である。**

**`/workspacify-tree`（`.claude/scripts/workspacify-tree/`）**

| 種別 | ファイル |
|---|---|
| エントリ | `run.mjs`（サブコマンド: `parse` / `extract` / `gate` / `finalize`） |
| スキーマ | `schemas/workspacify-tree-manifest.schema.json` / `schemas/workspacify-tree-decisions.schema.json` |
| 入力・正規化 | `lib/normalization.mjs` / `lib/hash.mjs` / `lib/headings.mjs` / `lib/segmentation.mjs` / `lib/markdown.mjs` |
| 抽出・在庫 | `lib/extraction.mjs` / `lib/inventory-report.mjs` / `lib/traceability.mjs` |
| モデル | `lib/workspace-model.mjs` / `lib/ownership.mjs` / `lib/segment-ownership.mjs` / `lib/dependencies.mjs` / `lib/dag.mjs` |
| 境界・契約 | `lib/boundary-review.mjs` / `lib/contract-clauses.mjs` / `lib/dependency-review.mjs` / `lib/spec-pulse.mjs` / `lib/spec-defects.mjs` |
| 決定入力 | `lib/decision-input.mjs` / `lib/decision-apply.mjs` / `lib/entry-parity.mjs` |
| ポリシー | `lib/adapters.mjs` / `lib/database-policy.mjs` / `lib/alias-normalization.mjs` |
| 出力 | `lib/render.mjs` / `lib/report.mjs` / `lib/canonical-json.mjs` / `lib/manifest-schema.mjs` |
| 安全・助言 | `lib/fs-safe.mjs` / `lib/atomic-publish.mjs` / `lib/gate-advice.mjs` / `lib/errors.mjs` / `lib/validation.mjs` |

**`/workspacify-allocate`（`.claude/scripts/workspacify-allocate/`）**

| 種別 | ファイル |
|---|---|
| エントリ | `run.mjs`（`validate` / `plan` / `packet` / `gate` / `finalize`）、`publish-allocate-manifest.mjs`、`walk-seed-contracts.mjs`、`cleanup-workspace-artifacts.mjs` |
| スキーマ | `schemas/workspacify-allocate-decisions.schema.json` |
| 入力検証 | `lib/tree-manifest-input.mjs` / `lib/manifest-format.mjs` |
| 計画・安全 | `lib/directory-plan.mjs` / `lib/path-safety.mjs` / `lib/tree-staging.mjs` |
| seed | `lib/seed-model.mjs` / `lib/seed-render.mjs` / `lib/seed-parse.mjs` / `lib/seed-parity.mjs` / `lib/seed-local-checks.mjs` / `lib/seed-authoring-packet.mjs` / `lib/reference-block.mjs` |
| 契約・証明 | `lib/contract-model.mjs` / `lib/contract-gate.mjs` / `lib/coverage-proof.mjs` / `lib/wig.mjs` / `lib/implementation-order.mjs` |
| self-grill | `lib/self-grill.mjs` |
| 公開・再検証 | `lib/allocate-manifest.mjs` / `lib/allocate-reload.mjs` / `lib/allocation-model.mjs` |

> **専門家への示唆**: 逆回転で最も重い追加は `/workspacify-reverse`（**新規ディレクトリ**）に集中する。既存2コマンドへの変更は、`mode === "reverse"` の分岐と新ゲートの追加に留めるのが、順回転保護の観点から安全である。**既存の `lib/` は「計測器」としてよく整備されており、逆回転で不足するのは主に「材料屋」の層である。**

---

## 3. 逆回転が必要な理由

### 3.1 順回転の入口が閉じている

| コマンド | 現行の入力要件 | 既存プロジェクトに対して |
|---|---|---|
| `/workspacify-tree` | **ATX 見出しを含む Markdown 仕様書** | そんな文書は存在しない |
| `/workspacify-allocate` | **fresh-workspace only**（既存パスは BLOCKED） | **原理的に通れない** |

つまり、**既に実装が進んだプロジェクト**は、conver の恩恵を一切受けられない。これが逆回転を必要とする理由である。

### 3.2 逆回転の全流れ

```
/workspacify-reverse      ← 新設。既存プロジェクトを解析し ORIGIN-LONG-SPEC.{json,md} を生成
  → /workspacify-tree     ← リバースモード。既存ディレクトリ構造を完全に守って TREE-MANIFEST を生成
  → /workspacify-allocate ← リバースモード。既存構造を守り、全ディレクトリに RFC-SEED.md を配置
  → /grill-me-for-rfc     ← RFC-SEED から、既存実装を完全に踏まえた正典 RFC をディレクトリ単位で作成
  → /graphify-rfc
  → /boundify-graph
  → /split-to-tickets
  → { /make-ticket → /plan-ticket → /start-ticket → /review-ticket
      → /resolve-ticket → /consolidate-stubs → /find-omissions }
  → /crystalize-readme
  → /drill-rfc-down
```

**順回転は既に完全に機能している。逆回転の実装は順回転を破壊してはならない。**

### 3.3 逆回転の成功条件は「RESIDUE 0」であり、それは人間が判断する

`/crystalize-readme` の **RESIDUE が 0** になることが成功条件である。これは**ループを複数回回したうえで、人間が確認する以外に到達手段がない**。

`/find-omissions` の omission 0 は**成功条件ではない**。omission は自動ではほぼ到達せず、**人間が「このまま `/crystalize-readme` へ入るか」を判断する材料**（示唆）である。これは conver の手動訓練の心得——「**2周目が必要かどうかを AI に判断させるな。人間が完全に判断せよ**」——と同じ思想である。

> **したがって、リバースエンジニアリングの成否を機械が判定するゲートを作ってはならない。**
> 機械が出してよいのは「**証明できた / 証明できなかった**」だけであり、「**成功した / 失敗した**」は機械の語彙ではない。既存の `REVIEW_REQUIRED` / `BLOCKED` は「成否の判定」ではなく「**機械が、証明できないことを証明したふりをしない**」という規律として理解する。

### 3.4 「追認 RFC」という最大の失敗モード

逆回転で最も陥りやすい失敗は、**既存コードを文章化しただけの追認 RFC** を生成してしまうことである。そうすると5つの整合性は表面上すべて成立するが、`/find-omissions` は**循環論法で全通過**する。これは conver の最高法規が禁じる**偽の green** そのものである。

逆回転に本当に要求されるのは「実装と一致する RFC を書く」ことではなく、**「実装の正しさを判定できる規範的 RFC を再建する」**ことである。説明のつかない既存挙動は、黙って追認せず **omission / RESIDUE として露出させる**。

### 3.5 Red の再建 — 逆回転に固有の最深の論点

conver の最高法規は「**red 無き green は違反**」「偶然 green になったテストは無効」と定める。しかし**既存実装のテストは最初から green である**。したがって逆回転では、`/start-ticket` の Red フェーズが要求する「実装が無いから失敗する」という証拠を、**遡って生成し直さなければならない**。

既存アーキテクチャに唯一の同型物がある——`/find-omissions` の **B基準（違反検出：違反を注入したら必ず失敗するか）** である。逆回転では、**違反注入／mutation によって red を再証明する工程**を実装ループに組み込まねばならない。これが無ければ、リバースエンジニアリングから始めた全体が**最初から偽の green** になる。

### 3.6 逆回転の適格条件 — どういうプロジェクトなら成立しうるか

**すべてのプロジェクトが逆回転の対象になるわけではない。** 成功率が極めて低いという事実を踏まえ、**着手前に適格性を評価すべきである**。

**適格の必要条件（1つでも欠ければ成功率は大きく下がる）**

| 条件 | 理由 |
|---|---|
| **ビルドできる** | ビルドできないプロジェクトは、依存関係も公開面も機械的に確定できない |
| **テストが存在し、実行できる** | テストが無ければ Red 再建の土台が無く、契約の裏付けをゼロから作ることになる |
| **git 履歴が存在する** | 「意図か偶然か」の判別材料（`git blame` / 共同変更 / コミットメッセージ）が失われる |
| **主要言語が解析可能** | SCIP / Tree-sitter / LSP / 各言語の型基盤を持つ言語（Rust / Go / TypeScript / Java / Python 等） |
| **ディレクトリ構造に意味がある** | 完全に平坦、または全面的に自動生成された構造では、境界の推定が原理的に不可能 |
| **ドキュメント・コメントが何らか残っている** | 「なぜ」の手がかりがゼロだと、AI の判断がすべて推測になる |

**危険信号（該当が多いほど、ゼロからの作り直しを選ぶべき可能性が高い）**

- テストが無い、または通らない
- 履歴が無い（スカッシュ済み、別 VCS からの移行）
- コード生成物がコードベースの大半を占める
- 動的言語 + メタプログラミング（reflection / eval / DI コンテナ）が支配的
- 業務知識が特定の個人に閉じている
- 大規模すぎて、機械的解析のコストが現実的でない

> **この評価自体を機械化し、`/workspacify-reverse` の R0 で提示すべきである。** 繰り返すが、これは「成功するかどうかの判定」ではない——**人間が着手可否を判断するための材料**である（3.3節）。9章の未解決問題 6（スコープの動的縮小）と 7.7 節（段階的戦略）を参照。

---

## 4. なぜこれほど困難か

### 4.1 人間のプロでも成功率が極めて低い

リバースエンジニアリングは、プロの現場でも**最も成功率が低い挑戦の一つ**である。事実、ほとんどのケースでは**リバースエンジニアリングを成功させることを諦め、新規にゼロから作り直すことが選択される**。

### 4.2 順方向と逆方向の非対称性

| | 順方向（既に機能） | 逆方向（これから作る） |
|---|---|---|
| 起点 | spec.md（規範テキスト） | **既存実装のみ（src / tests / git 履歴 / 設定 / ドキュメント）** |
| RFC | **公理**として与えられる | **推認**しなければならない（演繹ではなく**アブダクション**） |
| graphify / boundify / split | RFC から**機械的に導出** | 既存ディレクトリ構造に一致するよう**逆算** |
| プロベナンス | 構成によって証明される | **既に切れている。復元は不可能**。張り直すしかない |
| 正しさの基準 | RFC との一致 | **RFC 自身の妥当性**を誰も保証していない |

逆回転は「既存スクリプトを逆順に回す」ことではない。**起源が欠落した証明の鎖を張り直す（再証明する）**作業である。

### 4.3 コードは「なぜ」を語らない

コードは「何をしているか」を語るが、「**なぜそうなっているか**」を語らない。しかも：

- 意図的な設計判断と、歴史的偶然の産物が、**同じ見た目**をしている
- 動的ディスパッチ、reflection、DI、コード生成、マクロ、feature flag、環境変数、非同期キュー、plugin は**静的検索だけで欠落しやすい**
- コメントは嘘をつく。テストは仕様の一部しか写していない。コミットメッセージは当時の文脈を欠く

### 4.4 判断面積が広すぎると AI は失敗する

**AI が如何に賢いエンジニアリングエキスパートであろうとも、AI 自身が判断しなければならない領域が多すぎれば失敗する。** これは逆回転の成否を分ける中心的命題である。

### 4.5 設計原理

> **機械的に解析可能な部分は極限までスクリプトに機械的に解析させる。**
> **エンジニアリングエキスパートとして AI が非決定論的・意味論的に高度な理解・解釈・判断をしなければならない部分だけを AI に思考させる。**
> **さらに、その残った判断領域に対して、高度な解析スクリプトが十分な情報提供を極めて親切に行えるように張り巡らせる。**

すなわち成否を分けるのは「AI の賢さ」ではなく、**AI に残る判断の面積をどれだけ削り、残った面積にどれだけ濃い材料を供給できるか**である。

**スクリプトの役割は二重である**：

- **計測器** — 決定論的に**確定判断を下す**（owner 一意性、循環、パス一致、ハッシュ、網羅性…）。AI はその結論を受け入れるのみ
- **材料屋** — 非決定論的判断の**直前で、その判断に必要な情報を親切に差し出す**

前者だけのスクリプトは「AI を検査するが育てない」。逆回転では**後者の質が成否を決める**。なぜなら**既存コードは沈黙しており、文脈（なぜそうなっているか）が失われている**ので、掘り起こして差し出す量と質が、そのまま AI の判断品質になるからである。

### 4.6 リバースエンジニアリング自身の成否判定は人間の仕事

**`/crystalize-readme` の RESIDUE 0 は、ループを複数回回して人間が確認する以外に方法がない。機械的判定は諦める。**

したがって今回の実装が完全集中すべきは、**「成功を証明する装置」ではなく「人間が成功を判断できるようにする装置」**を作ることである。具体的には：

1. **決定論的解析の極大化** — 既存プロジェクトから機械的に取り出せるものは、構造・依存・契約・不変条件・テスト・状態遷移・エラー・所有者候補・証拠に至るまで**残らず**取り出す
2. **AI の判断面積の極小化** — 機械が確定できる判断を AI に渡さない
3. **残った判断面積への給仕の極大化** — 判断の直前に必要な材料を極めて親切に差し出す
4. **既存ツリーの絶対不可侵** — 破壊しない。追加は `RFC-SEED.md` と manifest のみ

---

## 5. 出力形式の原則（重要）

### 5.1 JSON と Markdown の使い分け

**JSON は AI にとっても読みにくい。** 形式は「AI が読んで判断する」という用途から逆算して選ぶ。

| 用途 | 形式 | 理由 |
|---|---|---|
| 他スクリプトが消費する／スキーマ検証する／ハッシュを取る／ゲートの述語になる | **JSON** | **構造的な理由がある場合のみ** |
| **AI が読んで理解・解釈・判断する** | **Markdown + 意味論を含む自然言語の英語。極めて親切に** | これが原則 |

### 5.2 「極めて親切」の定義

出力は、読んだ AI が**そのまま判断に入れる**ものでなければならない。次を含む：

- 何を見つけたか
- どこに証拠があるか（`file:line` / `sha256` は prose の中に埋め込む）
- **なぜそれが重要か**
- **何が判断を要するか**
- どんな選択肢があり、それぞれ何が起きるか
- 何が未解決で、誰に渡るのか

例：

> `src/auth` holds 2 invariants and receives 14 inbound references from 3 directories; it reads as a boundary. However, the call into `src/db` crosses from protocol into adapter without a port. Decide whether this is an intended layering or an accident of history — the git history shows it was introduced in a single commit with no design note.

これは**テンプレート＋抽出語彙で機械的に生成できる**。意味論的**判断**は AI の領分だが、**判断材料の提示は意味論を含んでよい**。

### 5.3 既存アーキテクチャに先例がある

各ゲートが失敗時に stderr へ出す **`[guide]`（何が問題か / なぜ重要か / どう直すか）** がまさにこの思想である。これを「失敗時の例外」ではなく、**全 AI 向け出力に一般化する**。

### 5.4 evidence の必須化

- 全ての解析結果は `file:line` と `sha256` を持ち、**R0 の tree hash に紐づく**
- 陳腐化した証拠（索引後に変更されたファイル）を検出する
- 機械可読が必要な箇所のみ sidecar JSON を併置する

### 5.5 provenance 3値

逆回転で生まれる全ての記述は、次のいずれかに分類され、**その分類自体が機械検証される**：

| 分類 | 意味 | 必須 |
|---|---|---|
| `observed` | コードから機械的に確定した事実 | **evidence 必須** |
| `inferred` | AI の設計判断としての推認 | **根拠必須** |
| `unresolved` | 判断できなかったもの | **`grill_question` 必須**（後段の人間 grill へ） |

---

## 6. 提案する解析スクリプトと配置

### 6.0 前提となる不変条件（順回転の保護）

| 不変条件 | 内容 |
|---|---|
| **モードは入力から決まる** | 既存入力に `mode` フィールドが無ければ `forward`。逆方向の分岐は全て `mode === "reverse"` の内側に閉じる |
| **加算のみ** | 既存出力のキー・順序・正規化を変えない。新規キーは逆方向時のみ出現 |
| **回帰の証明可能性** | 既存の順方向フィクスチャで、改修前後で `manifest_hash` が**バイト一致**することを回帰テストにする。これが「順回転を壊していない」の唯一の証明 |
| **モードの伝播** | `mode: "reverse"` と由来情報が `TREE-MANIFEST` → `ALLOCATE-MANIFEST` → `RFC-SEED.md §1`（機械注入）→ `/grill-me-for-rfc` と**途切れず伝播**し、各段で決定論的に再計算できる |

### 6.1 全体配置図

| 段 | 追加の性格 | 解析ロジックの量 |
|---|---|---|
| `/workspacify-reverse` | **全面新設** | **最大**（R0〜R8 の9段） |
| `/workspacify-tree` | リバースモード＋新ゲート4本 | 大 |
| `/workspacify-allocate` | リバースモード＋安全保証の反転＋packet 拡張 | 大 |
| `/grill-me-for-rfc` | 逆方向質問の機械生成 | 中 |
| `/graphify-rfc` | 実在ファイル接地検証＋契約突合 | 中 |
| `/boundify-graph` | 既存構造の保存＋ヘッダ後付け | 中 |
| `/split-to-tickets` | 既存テスト→チケット対応＋**Red 再建チケット生成** | 大 |
| 実装ループ以降 | 最小（Red 再建手順のみ） | 小 |

**重みは上流7段、特に `/workspacify-reverse` に集中する。**

### 6.2 `/workspacify-reverse`（新設）— R0〜R8

出力は `ORIGIN-LONG-SPEC.json` と、そこから機械生成される `ORIGIN-LONG-SPEC.md`（`/workspacify-tree` の正規入力形式）。

| 段 | スクリプト | 決定論 | 何を確定し、何を給仕するか |
|---|---|---|---|
| **R0 入力ロック** | `lock-project-root.mjs` | 100% | ルート境界の確定、除外規則（`.git`/`node_modules`/`target`/`dist`/`vendor`/生成物）、追跡/未追跡の区別、**tree hash**（以後の全 evidence の基準点） |
| | `classify-project.mjs` | 100% | 言語・ビルド系・パッケージマネージャ・テストフレームワーク・スキーマ系の同定 |
| **R1 構造実測** | `measure-tree.mjs` | 100% | 実測ディレクトリツリー・ファイル数・言語分布・行数・最終更新 |
| | `classify-artifacts.mjs` | 100% | 手書き／生成物／テスト／設定／スキーマ／マイグレーションの同定（生成物は以後の母集団から外す） |
| **R2 依存実測** | `extract-import-graph.mjs` | 100% | ファイル間依存の実測 |
| | `detect-cycles.mjs` | 100% | SCC 縮約と循環の全数列挙 |
| | `measure-cohesion.mjs` | 100% | ディレクトリ境界候補ごとの内部結合／外部結合、クラスタリング |
| | `extract-external-deps.mjs` | 100% | 外部依存の実測（lockfile 含む） |
| **R3 意味論素材** | `extract-public-api.mjs` | 100% | 公開面（export / public fn / 型シグネチャ）の実測 |
| | `extract-types.mjs` | 100% | 型・スキーマ・enum の実測 |
| | `extract-errors.mjs` | 100% | エラー型・エラーコード・例外の全数 |
| | `extract-guards.mjs` | 90% | precondition 痕跡（guard clause / assert / 入力検査） |
| | `extract-invariants.mjs` | 90% | invariant 痕跡（`assert!` / `debug_assert` / 不変条件コメント） |
| | `extract-state-machines.mjs` | 90% | 状態フィールド・遷移関数・enum 遷移の痕跡 |
| | `extract-effects.mjs` | 100% | 副作用・外部 I/O（ファイル／ネット／DB／時刻／乱数／env）の実測 |
| | `extract-tests.mjs` | 100% | テスト名・アサーション・対象・`@verifies` の実測 |
| | `extract-contract-candidates.mjs` | 80% | **給仕の核**。呼び出し境界ごとに pre/post/invariant の候補を証拠付きで差し出す |
| **R4 意図の考古学** | `mine-history.mjs` | 90% | git 変遷（生成・移動・削除）、変動頻度＝不安定領域、コミット種別分布、**共同変更（logical coupling）** |
| | `extract-rationale.mjs` | 80% | コメント／doc／ADR／CHANGELOG／TODO から「なぜ」を抽出 |
| **R5 欠落と矛盾** | `detect-dead-code.mjs` | 100% | 参照ゼロ・未使用 export |
| | `detect-untested-surface.mjs` | 100% | **テストの無い公開面＝Red 不在候補**（最重要） |
| | `detect-tautological-tests.mjs` | 90% | 循環論法・無意味アサーションの候補 |
| | `detect-comment-code-drift.mjs` | 80% | コメントと実装の矛盾候補 |
| | `inventory-stubs.mjs` | 100% | `[::STUB::]`／TODO／FIXME／空実装の全数 |
| **R6 Red 再建基盤** | `plan-red-reconstruction.mjs` | 100% | 各テストに対し「どの実装を変異させれば落ちるべきか」の候補と手順を列挙（**実行はしない**） |
| | `measure-coverage.mjs` | 100% | カバレッジ実測（取得可能な場合のみ） |
| **R7 仕様構造化** | `validate-origin-spec.mjs` | 100% | AI が書いた `ORIGIN-LONG-SPEC.json` を機械検証：スキーマ／全 `observed` に evidence 実在／全 `unresolved` に `grill_question`／provenance 3値 |
| | `packet-origin.mjs` | 100% | 判断点ごとに材料を束ねて差し出す（**Markdown の給仕**） |
| **R8 仕様出力** | `emit-origin-spec-md.mjs` | 100% | JSON→MD。ATX 見出しで入力要件を満たす。**MD→JSON の再パース一致（往復証明）** |

**AI が判断する面積（ここだけ）**: パッケージ境界の最終確定、所有者割当、レイヤ推定、契約の意味確定、過分割の判定、`observed`/`inferred`/`unresolved` の分類。

### 6.3 `/workspacify-tree`（リバースモード）

既存 G0〜G5 は不変。追加は4本：

| 追加 | 内容 |
|---|---|
| **T1 構造一致** | manifest の package パス集合 ≡ 実測ディレクトリ集合（双方向）。相違は FAIL して**名前を挙げる** |
| **T2 行動損失ゼロ** | 既存ソースファイルが全て所有されている。順方向の「転送損失ゼロ」の逆向き対応物 |
| **T3 接地** | 全ノードが実在ファイルパスに接地している |
| **T4 実装順序の実測** | 順方向は「設計から証明」。逆方向は「実測 DAG から証明」し、**両者の一致を要求** |

**給仕**: tree 設計の判断を AI からほぼ奪う（実測が tree を決める）。AI に残るのは「実測された境界が正しいか」のみ。材料として凝集度・依存密度・変遷履歴・**境界跨ぎの呼び出し回数**を差し出す。

### 6.4 `/workspacify-allocate`（リバースモード）

| 変更 | 内容 |
|---|---|
| **A1 安全保証の反転** | `fresh-workspace only` → **「既存構造が証明済み計画と完全一致。1つでも余分なら BLOCKED」** |
| **A2 追加のみ** | トップレベル rename を**しない**。書き込みは `RFC-SEED.md` と manifest のみ |
| **A3 packet 拡張** | 各パッケージに「既存実装の抜粋／契約候補／既存テスト／既存 I/O」を束ねる。**給仕の極大化の中心** |
| **A4 RFC-SEED 逆方向節** | 新設（14見出し契約の変更を伴う）。逆由来の来歴と既存実装の実態 |
| **A5 既存流用** | seed parity（Allocation Index ↔ ownership）はそのまま効く |

> **注意**: 現行の「トップレベルエントリの原子的 rename」は、逆方向では rename 対象が**既存の `src/` や `tests/` そのもの**になる。無改修で通すと既存ツリーを破壊する。ここは**同等の強度のまま逆向きに張り直す**必要がある。

### 6.5 `/grill-me-for-rfc`（逆対応）

| 変更 | 内容 |
|---|---|
| **G1 質問の機械生成** | RFC-SEED の逆方向節から grill の初期質問候補を機械生成し、AI が確定する |
| **G2 追認の防止** | **「この挙動は意図か、偶然か」を必ず問う質問を機械が強制挿入**。これが無いと追認 RFC になる |
| **G3 residual 引き継ぎ** | 上流の未解決を逐語で引き継ぐ（既存の規律をそのまま） |

### 6.6 `/graphify-rfc`（逆対応）

| 変更 | 内容 |
|---|---|
| **GF1 接地検証** | 全ノード→実在ファイルの接地を新規ゲート化 |
| **GF2 契約突合** | R3 の契約候補と RFC 由来の契約を突合。**差分＝「説明のつかない既存挙動」**として omission / RESIDUE 候補に落とす（黙って追認しない） |

### 6.7 `/boundify-graph`（逆対応）

| 変更 | 内容 |
|---|---|
| **B1 既存構造の保存** | 新規ファイル生成をしない |
| **B2 ヘッダ後付け** | 既存 `refresh-file-headers.js`（既存ヘッダ更新・本体不変）の前例を流用 |
| **B3 対応表** | 生成しなかったファイル＝既存ファイルの対応表を出力 |

### 6.8 `/split-to-tickets`（逆対応）— 2番目に重い

| 変更 | 内容 |
|---|---|
| **S1 テスト・マッピング** | 既存テストを `testUnit` / `testIntegration` / `testExceptions` へ機械マッピング |
| **S2 契約↔テスト対応** | 対応の無い契約を検出＝**Red 不在** |
| **S3 実装の実測埋め込み** | `default_files` を実測で埋める。既存実装ありフラグ |
| **S4 Red 再建チケット生成** | テストの無い契約に対し、**Red を再建するチケット**を自動生成（R6 の計画を入力に） |

### 6.9 横断の仕掛け

1. **給仕インターフェースの統一** — 全ての AI 判断点の直前に `packet` を置く。`packet` は「所有候補・出典抜粋・境界文脈・禁止事項・未解決」を **Markdown で**差し出す。既存 `workspacify-allocate packet` を共通形に昇格させる
2. **provenance 3値** — 全項目が `observed` / `inferred` / `unresolved` のいずれか（5.5節）
3. **evidence の必須化と陳腐化検出**（5.4節）

### 6.10 R0〜R8 のデータフロー — どの出力がどの入力になるか

スクリプト名の列挙だけでは配置の妥当性を判断できない。**データの流れ**を示す。

```text
                      (既存プロジェクトルート)
                                │
  R0 lock-project-root ─────────┼──→ tree hash / 除外規則 / 追跡ファイル一覧
  R1 measure-tree ──────────────┼──→ 実測ツリー / 言語分布 / 生成物判定
  R2 extract-import-graph ──────┼──→ ファイル間依存 / SCC / 凝集度 ──┐
  R3 extract-* (9本) ───────────┼──→ 公開面 / 型 / エラー / 契約候補  │
  R4 mine-history ──────────────┼──→ 変遷 / 共同変更 / 「なぜ」       │
  R5 detect-* (5本) ────────────┼──→ 死コード / Red不在 / 矛盾        │
  R6 plan-red-reconstruction ───┼──→ 変異候補と手順                  │
                                ▼                                    ▼
                       R7 packet-origin ──→ 【AI の判断】──→ ORIGIN-LONG-SPEC.json
                                                                    │
                       R8 emit-origin-spec-md ◄─────────────────────┘
                                │
                                ▼
                        ORIGIN-LONG-SPEC.md ──→ /workspacify-tree（リバースモード）
```

| 産出元 | 産物 | 消費者 |
|---|---|---|
| R0 | `tree hash` / 除外規則 / 追跡一覧 | **全段の evidence の基準点**、R5 の生成物判定、R8 の往復証明 |
| R1 | 実測ディレクトリツリー | R2 のクラスタリング入力、**T1（構造一致）の期待値** |
| R2 | ファイル間依存 / SCC / 凝集度 / 実装順序 | R3 の契約候補スコープ、**T4（実装順序の実測）**、AI の境界判断材料 |
| R3 | 公開面 / 型 / エラー / guard / invariant / 状態機械 / 副作用 / テスト / **契約候補** | R5 の Red 不在判定、R6、R7、**GF2（契約突合）**、S1〜S3 |
| R4 | 変遷 / 共同変更 / コミット種別 / 「なぜ」 | R7 の判断カード（偶然か意図か）、R5 の矛盾判定 |
| R5 | 死コード / Red 不在 / 循環論法 / コメント齟齬 / スタブ全数 | R6、**S2**、**S4**、residual 候補 |
| R6 | 変異候補と手順 / カバレッジ | **S4（Red 再建チケット）** |
| R7 | `ORIGIN-LONG-SPEC.json` + provenance 3値 | R8、そして下流の全段 |
| R8 | `ORIGIN-LONG-SPEC.md` | `/workspacify-tree` |

> **設計上の要点**: **R0 の tree hash が全ての evidence の基準点**である。逆回転の途中で対象が変われば、それ以前の evidence はすべて無効になる。これを機械的に検出するのが 5.4 節の「陳腐化検出」であり、R0 で worktree を固定することが強く推奨される理由である。

### 6.11 Worked example — 1つの境界を R0〜R8 がどう扱うか

抽象論だけでは配置の妥当性を判断できない。具体例で示す。

**シナリオ**: 既存プロジェクトに `src/auth/`（認証）と `src/db/`（永続化）があり、`auth` が `db` を直接呼んでいる。両者の間にポートが無い。

| 段 | AI に差し出される材料の実例 |
|---|---|
| R1 | `src/auth` は 14 ファイル / 1,820 行。`src/db` は 9 ファイル / 2,140 行。両者とも手書き（生成物判定に非該当） |
| R2 | `auth → db` の依存は **23 箇所**。逆向きは 0。`auth` の外部結合は 3 ディレクトリ、内部結合は 41。SCC に属さない（循環なし） |
| R3 | `auth` が持つ invariant 痕跡 2 件（`assert!(token.expires_at > now)` 等）。`db` が持つエラー型 4 件。**契約候補**: `auth → db` の境界に pre/post 候補 6 件（うち 2 件はアサーションから直接導出） |
| R4 | `auth → db` の直接呼び出しは**単一コミットで導入**され、コミットメッセージは `wip`。以降 3 年間変更なし。設計ノート無し |
| R5 | `db` の公開面のうち **5 件がテスト無し**（＝ Red 不在候補）。`auth` 側の `revokeSession()` にテストはあるが、アサーションは戻り値のみで DB 状態を見ていない（＝ 循環論法候補） |
| R6 | `revokeSession()` のテストは、`db.delete()` の呼び出しを除去しても**落ちない**と予測される（＝ その変異に対する red が無い） |
| R7 | **判断カード**（AI に差し出される）— **問い**: 「`auth → db` の直接依存は意図か偶然か」。**選択肢**: (a) 層違反として port を挿入する / (b) 現状を維持し境界として認める / (c) `residual` として人間 grill へ渡す。**支持する証拠**: R2 の一方向 23 箇所（一貫している）/ R3 の pre/post 候補 6 件 / R4 の 3 年間安定。**反例**: R4 の `wip` コミットと設計ノートの不在は、偶然の産物である可能性を示す |

**AI が決めるのは最後の1行だけ**であり、そこに至るまでの材料はすべて機械が揃える。これが 4.5 節の設計原理の具体的な姿である。

---

## 7. 我々の提案が届いていない領域（レビュー依頼の核心）

**以下の認識が本節の出発点である：我々の提案は1回の設計会話から出たものであり、この領域を進めるのに十分な厚みを持っていない。リバースエンジニアリングは、あなた（読者）の知見を必要としている。**

### 7.1 我々の提案の構造的な穴

| 穴 | 内容 |
|---|---|
| **動的解析が完全に不在** | 提案は静的解析のみである。実行時挙動・実データ・実トレースを見ていない。**動的ディスパッチ、reflection、DI、コード生成、マクロ、feature flag、環境変数、非同期キュー、plugin は静的検索だけで欠落する** |
| **不変条件の「推論」が無い** | 痕跡の抽出（`extract-invariants`）はあるが、**実行観測から不変条件を推論する**手法が無い |
| **状態機械の「推論」が無い** | 痕跡の抽出はあるが、**ログ／トレースから有限状態機械を自動推論する**手法が無い |
| **要求の復元が無い** | コードから**ゴールモデル／要求**を復元する要求工学的な逆方向手法が無い |
| **アーキテクチャ復元の理論が無い** | 凝集度によるクラスタリングだけである。**リフレクションモデル、DSM、アーキテクチャ違反検出**の体系が無い |
| **言語横断のシンボル解決が無い** | 正規表現と簡易パースに依存している。**正確な名前解決**の基盤が無い |
| **バイナリ・実行時成果物が対象外** | コンパイル済み成果物、コンテナイメージ、DB スキーマ実体、設定実体が対象外 |
| **テストの意味の復元が無い** | テストが**何を仕様として主張しているか**を復元する手段が無い |
| **人間の暗黙知の取り込みが無い** | ドメイン専門家の知識を構造化して取り込む経路が無い（residual → 人間 grill のみ） |
| **再現性の保証が無い** | 決定論的部分の再現性（同じ入力から同じ `ORIGIN-LONG-SPEC` が出るか）の検証設計が無い |

### 7.2 我々が検討すべき既存手法（情報提供の依頼）

以下は我々が**名前は知っているが、conver 逆回転への組み込み方を設計できていない**手法の一覧である。**どれを・どの段に・どう組み込むべきか、また我々が挙げていない手法は何か**について、読者の知見を求めている。

**(a) 精密なシンボル解決・コード表現**

- **SCIP / LSIF / Kythe** — 言語非依存のコードインテリジェンス索引。正確な定義・参照・型の解決
- **Tree-sitter** — 言語横断の構文木。パース誤りの無い構造抽出
- **LSP** — 各言語の言語サーバを解析器として利用
- **Joern（CPG: Code Property Graph）** — AST + CFG + PDG を統合したグラフ。データフロー・テイント・到達可能性
- **CodeQL / Semgrep** — クエリベースの意味パターン検索。「〜という構造が存在するか」を証明可能に問う
- **言語別の型・SSA 基盤** — Rust（`cargo metadata` / rustdoc JSON / MIR / clippy）、Go（`go/packages` / `go/types` / `x/tools/go/ssa`）、TypeScript（Compiler API / ts-morph）、Python（`ast` / `libcst` / mypy / pyright）、Java（Soot / WALA / Tai-e / Doop）

**(b) 不変条件・仕様の推論**

- **Daikon** — 実行トレースからの**動的不変条件推論**。`extract-invariants` の痕跡抽出を「推論」へ引き上げる
- **状態機械推論** — Synoptic / Perracotta / Texada / MINT / k-tails / ReverX。ログから有限状態機械を復元
- **API 誤用マイニング** — 典型的な使用パターンと違反の抽出
- **仕様マイニング** — テスト・実行履歴からの事前条件／事後条件の抽出

**(c) 動的解析**

- **実行トレース / システムコール** — strace / ltrace / eBPF / DTrace
- **デバッガ / record & replay** — gdb / lldb / rr。決定論的再生による再現可能な観測
- **カバレッジ誘導ファジング** — AFL++ / libFuzzer。到達不能・異常経路の発見
- **コンコリック実行 / シンボリック実行** — KLEE / angr / SAGE / DART / CUTE。経路制約からの事前条件復元
- **プロファイリング / 実行時結合** — 実際の呼び出し関係（静的解析の到達可能性を実測で補正）

**(d) ミューテーション・テスト品質**

- **Mutation testing** — Stryker / PIT / mutmut / cargo-mutants。**Red 再建の中核**
- **プロパティベーステスト** — QuickCheck / Hypothesis / fast-check / proptest。復元した不変条件の検証
- **差分カバレッジ / MC-DC** — テストが実際に何を保証しているかの測定

**(e) アーキテクチャ・進化の復元**

- **ソフトウェアリフレクションモデル** — 設計意図と実装の差分を明示的に扱う
- **依存構造行列（DSM）とクラスタリング** — ACDC / LIMBO / アーキテクチャ違反検出
- **論理結合・共同変更のマイニング** — git 履歴から「一緒に変わるべきもの」を推定
- **コードオーナーシップの復元** — 誰がどの領域の判断者か
- **要求工学の逆方向** — ゴールモデル復元（KAOS / i*）、requirements recovery / reengineering
- **設計判断の復元** — ADR（Architecture Decision Record）の逆抽出

**(f) バイナリ・非ソース成果物**

- Ghidra / IDA / BSim（バイナリ類似性）、デコンパイル成果物の索引化
- コンテナイメージ、DB スキーマ実体、実設定、IaC 定義の解析

### 7.3 どこに何を入れると精度が上がるか（我々の暫定案 — 要検証）

| 段 | 追加候補 | 期待される精度向上 |
|---|---|---|
| R1 | **SCIP / Tree-sitter / LSP による正確な索引** | 正規表現ベースの抽出誤りを排除。全 evidence の信頼性が上がる |
| R2 | **Joern(CPG) / CodeQL によるデータフロー・テイント** | import グラフでは見えない**実行時の依存**を捕捉。境界推定の誤りが減る |
| R2 | **実行時プロファイリングによる実結合** | 静的な到達可能性と実呼び出しの乖離を解消 |
| R3 | **Daikon による動的不変条件推論** | 痕跡ではなく**推論**。契約候補の質が根本的に上がる |
| R3 | **状態機械推論（Synoptic / Texada）** | ログから状態遷移を復元。追認 RFC の最大の穴を埋める |
| R4 | **論理結合マイニング** | 歴史的偶然か設計意図かの判別材料になる |
| R5 | **Mutation testing** | **Red 不在の検出**と Red 再建の計画精度 |
| R6 | **シンボリック実行による事前条件復元** | 境界値・失敗経路の契約を機械的に導出 |
| R7 | **リフレクションモデル / DSM** | 設計意図と実装の乖離を**明示的な差分として**提示できる |
| R7 | **要求復元（ゴールモデル）** | 「なぜこのモジュールが存在するか」の言語化。AI の判断面積を削る |
| 全体 | **再現性検証（同一入力→同一 ORIGIN-LONG-SPEC）** | 決定論的部分の信頼性を証明 |

### 7.4 非決定論的な AI の判断を極限まで助ける設計（提案）

決定論では解けない領域に対して、**AI の判断そのものを助ける**仕掛けを提案する。これらは「計測」ではなく「思考支援」であり、**本設計の成否を分ける**と考えている。

1. **判断カード（decision card）** — 判断点ごとに「問い / 選択肢 / 各選択肢の帰結 / 支持する証拠 / 反例 / 現状の既定値」を Markdown で差し出す。AI は自由記述ではなく**構造化された問い**に答える
2. **対立仮説の強制** — 各判断に対し**必ず2つ以上の解釈**を立てさせ、棄却理由を記録させる。「意図的な設計」と「歴史的偶然」の両方を必ず検討させる
3. **反例生成器（adversarial verifier）** — AI の仮説を壊す証拠を探す専用のステップ。既存の self-grill の `adversarial` 焦点を、逆回転では**証拠探索つきで**強化する
4. **「偶然か意図か」の判別手続き** — 機械が次の材料を束ねて差し出す：(a) `git blame` の時系列（一度に入ったか、段階的か）、(b) コミットメッセージ、(c) 対応するテストの有無、(d) 呼び出し側の一貫性、(e) 類似箇所での一貫性。**判断は AI が行うが、材料は機械が揃える**
5. **確信度の構造化** — evidence の強さを段階化（直接観測 / 複数証拠の一致 / 単一の弱い痕跡 / 推測のみ）。`unresolved` への落とし方を機械が助言する
6. **質問の依存グラフ** — grill の質問順序を機械が設計する。前提が未確定の質問を先に投げない
7. **判断の差分追跡** — AI の判断を記録し、再実行時に**同じ判断が再現されるか**を比較する。判断の揺れは設計の弱点のシグナルである
8. **語彙の事前供給** — 解析で抽出したドメイン語彙（型名・エラーコード・契約名・ディレクトリ名）を、判断前に AI へ提示する。**用語の揺れが判断の揺れを生む**

### 7.5 読者への具体的な依頼

1. 7.1 の穴のうち、**我々が見落としているもの**は何か
2. 7.2 の手法のうち、**逆回転のどの段に・どの順序で**入れるべきか。また**挙げていない手法**は何か
3. 7.3 の暫定案のうち、**効果が薄いもの・危険なもの**は何か
4. 7.4 の思考支援の設計は十分か。**AI の判断面積をさらに削る**設計はあるか
5. **成功率が低いという事実**に対して、設計で打てる手は他にあるか（早期打ち切り、段階的検証、スコープ縮小、部分成功の定義など）

### 7.6 逆回転の失敗モード・カタログ

成功率が低いという事実を設計に反映するには、**どこでどう失敗するか**を先に列挙しておく必要がある。以下は我々が現時点で想定している失敗モードである。**この一覧に漏れがあることが十分にありうる**（7.8 節 D）。

| # | 失敗モード | 症状 | 検出手段 | 設計で打てる手 |
|---|---|---|---|---|
| **F1** | **追認 RFC** | 5つの整合性が表面上成立し、`/find-omissions` が循環論法で全通過する | 契約候補と RFC 由来契約の差分（GF2）。**差分ゼロは正常ではなく異常** | 判断カードで「偶然か意図か」を強制。差分を omission として必ず露出させる |
| **F2** | **赤の偽装** | 既存テストが green のまま Red 再建が省略される | R6 の変異候補に対する red の不在（`detect-untested-surface` / `detect-tautological-tests`） | S4 で Red 再建チケットを必ず生成。**red の証拠が無いチケットを `reviewed` にしない** |
| **F3** | **境界の誤推定** | 実装の偶然のディレクトリ割りが正典として固定される | T1（構造一致）は通るが、R2 の凝集度が低い / 境界跨ぎ呼び出しが過多 | 凝集度・境界跨ぎ回数を材料に差し出し、`/workspacify-tree` の AI 判断で過分割・誤境界を棄却 |
| **F4** | **静的解析の盲点** | DI / reflection / コード生成 / feature flag 経由の依存が丸ごと欠落する | 動的解析との差分。プロファイリングで観測された呼び出しがグラフに無い | 動的解析（7.2節 (c)）を必須または強く推奨に。少なくとも差分レポートを必ず出す |
| **F5** | **証拠の陳腐化** | 解析中に対象が変わり、evidence が指す行が別物になる | tree hash の不一致（5.4節） | R0 のハッシュを全 evidence に紐づけ、不一致を機械検出。worktree 固定を推奨 |
| **F6** | **契約の空文化** | 契約は書かれるがテストに翻訳されず、次の周回で omission が爆発する | `/find-omissions` の A / B / C 基準 | 契約の段階で「テスト可能な形に翻訳できるか」を機械検証（`testUnit` への対応付け） |
| **F7** | **判断疲れ** | AI の判断点が多すぎ、後半で判断が雑になる | 判断の差分追跡（7.4節 7）で揺れを検出 | 判断面積の削減（機械化）と給仕の強化。**判断カードの枚数そのものを指標にする** |
| **F8** | **スコープ爆発** | 大規模プロジェクトで解析が終わらない | 段ごとの所要時間・件数の計測 | 段階的・増分戦略（7.7節）へ切り替える |
| **F9** | **暗黙知の欠落** | 業務ルールがコードに現れず、RFC が技術的記述に終始する | `unresolved` の偏り（業務用語がゼロ） | residual を人間 grill へ確実に渡す。ドメイン専門家への質問を構造化して生成する |
| **F10** | **順回転の破壊** | 逆回転のための改修で順方向の出力が変わる | **順方向フィクスチャの `manifest_hash` のバイト不一致** | `mode` 分岐の徹底と加算のみの原則（6.0節）。回帰テストを必須ゲートにする |

> **F1 と F2 は「静かに成功する」失敗である。** 逆回転が最も危険なのは、派手に壊れるときではなく、**正しく見えたまま偽物ができる**ときである。

### 7.7 段階的・増分戦略 — 「全部やる」以外の道

成功率が低い以上、**全域を一度に逆回転させる設計は賭けである**。次の段階的戦略を検討すべきである。

| 戦略 | 内容 | 長所 | 短所 |
|---|---|---|---|
| **スパイク方式** | 1ディレクトリで全工程を1周し、成否を人間が判定してからスコープを広げる | **「成功するか否か」を最も安く知れる** | 判定は人間の仕事（3.3節） |
| **ディレクトリ単位** | 対象を1モジュールに限定し、R0〜R8 をその範囲で実行する | 成功確率が高い。既存 workspacify の「ディレクトリ単位で回す」思想と一致 | モジュール間の境界契約が後回しになる |
| **境界優先** | 依存密度の高い境界から順に逆回転する | 効果の大きい箇所から確実に | 全体像が見えるまで時間がかかる |
| **テスト優先** | テストが充実した領域から着手する | Red 再建が容易 | テストが薄い領域（＝最も危険な領域）が最後になる |
| **並行逆回転** | 複数ディレクトリを並行して逆回転する | 時間短縮 | 境界契約の整合が後段で爆発しやすい |

> **推奨**: **スパイク方式から始める。** 1ディレクトリで `/workspacify-reverse` から `/crystalize-readme` まで1周し、そこに RESIDUE がどう出るかを人間が確認する。ここで成立しなければ、スコープを広げても成立しない可能性が高い。**これは「成功を機械が判定する」のではなく、「人間が判断する材料を最も安く得る」設計である。**

**部分成功の定義（9章の未解決問題 6 に対する暫定案）**

| 水準 | 状態 |
|---|---|
| **L0** | 解析は走るが、RFC が追認に終始している（F1） |
| **L1** | 一部のディレクトリで RESIDUE 0 に到達 |
| **L2** | 全ディレクトリで RESIDUE 0。ただし Red 再建が未完（F2） |
| **L3** | RESIDUE 0、かつ Red 再建の証拠が全チケットに存在し、**人間が成功と判断** |

**L3 以外を「成功」と呼んではならない。** ただし L1・L2 は**価値のある中間成果**であり、人間が次にどこへ投資するかを決める材料になる。

### 7.8 専門家へのレビュー観点チェックリスト

以下は、本設計に対して我々が明示的に答えを求めている問いである。**すべてに答える必要はない。確信のあるものから指摘してほしい。**

**A. 原理について**

- [ ] 4.5 節の設計原理（決定論の極大化・非決定論の極小化・給仕の極大化）は正しい方向か。**原理自体に欠陥はないか**
- [ ] 3.3 節「成功の判定は人間が行う」は妥当か。それとも機械化できる部分が残っているか
- [ ] 6.0 節の「順回転を壊さない」ための不変条件（モード分岐・加算のみ・ハッシュ一致）で十分か

**B. 解析の配置について**

- [ ] 6.2 節の R0〜R8 の**順序**は妥当か。入れ替えるべき段はあるか
- [ ] 6.10 節のデータフローに**欠けている辺**はないか
- [ ] 7.3 節の「段 × 追加候補」の対応で、**誤った段に置いているもの**はないか
- [ ] 各段で**新たに必要になる決定論的ゲート**は何か

**C. 手法について**

- [ ] 7.2 節に**挙げていない手法**は何か（とくに実務で効果が実証されているもの）
- [ ] 挙げた手法のうち、**逆回転には向かないもの**は何か
- [ ] 動的解析を**どこまで必須**にすべきか（コストと精度のトレードオフ）

**D. 失敗について**

- [ ] 7.6 節の失敗モードに**漏れ**はないか（**F1〜F10 のどれよりも危険な失敗があるか**）
- [ ] 各失敗モードの「設計で打てる手」は十分か
- [ ] **この挑戦を中止すべき判断基準**は何か（早すぎる撤退も、遅すぎる撤退も避けたい）

**E. 判断支援について**

- [ ] 7.4 節の8つの仕掛けは十分か。**AI の判断面積をさらに削る**設計はあるか
- [ ] 判断カードの粒度は適切か（粗すぎれば判断が雑に、細かすぎれば枚数が爆発する）
- [ ] 人間の専門家（ドメイン知識保有者）を**どこでループに入れる**のが最も効果的か
- [ ] 3.6 節の適格条件は妥当か。**見落としている前提条件**はないか

---

## 8. zg（zvec-grep）の活用

詳細は別紙 **`ZG-FOR-REVERSE.md`** を参照。ここでは conver 逆回転への組み込み方と、環境構築の要点を記す。

### 8.1 zg とは

`zg` は **zvec-grep** の CLI である。ローカルワークスペースを索引化し、4つの検索経路を単一の操作系に統合する。

| 検索経路 | 使う場面 | 代表例 |
|---|---|---|
| ripgrep 互換（`--rg`） | 文字列・識別子・パス・正規表現を**漏れなく**探す | `AuthService`、`/v1/token`、エラーコード |
| BM25（`--fts`） | 既知の語を関連度順に集める | `session revoke`、`TLS handshake` |
| ベクトル（`--vector`） | 実装上の命名を知らず、**概念から**探す | 「資格情報はどこで検証されるか」 |
| ハイブリッド（既定の `zg query`） | 語と意味の両方で、入口不明の構造を探索する | 「起動時に設定を復元する流れ」 |

**これが逆回転に効く理由**: 索引検索はファイル・シンボル・行などの**出所情報を伴う候補**を返す。したがって、LLM や人間の「もっともらしい説明」を採用するのではなく、**検索結果のパス・行・原文を一次証拠として読み、結論を検証する**用途に向く。これは本設計の「evidence 必須」原則と完全に一致する。

### 8.2 逆回転への組み込み方（提案）

| 段 | zg の使い方 | 注意 |
|---|---|---|
| R1 / R2 | `--rg` による識別子・パス・エラー文字列の**完全列挙** | 決定論的な確定に使える |
| R3 | 既定ハイブリッド／`--vector` で**契約候補・不変条件・状態機械の候補を発見** | **候補発見であり完全列挙ではない** |
| R4 | コミットメッセージ・CHANGELOG・コメントから「なぜ」の候補を収集 | 候補発見 |
| R5 | エラーコード・設定キー・feature flag の全参照列挙 | `--rg -F` で完全確認 |
| 全段 | 発見した結論は**必ず原文を開いて検証**し、パス・行を証拠として記録 | 検索ヒットだけで制御フローを確定しない |

> **重要な位置づけ**: zg のベクトル／BM25 検索は**モデル依存であり決定論ではない**。したがって zg は **「給仕（材料屋）」の層**に置く。**確定（証明）には使わない**。確定は `--rg` による完全列挙と、AST／型に基づく決定論的解析で行う。この切り分けは 2.5 節の三層の境界と一致する。

### 8.3 環境構築（完全情報）

**(1) Node.js 22 以上と zg の導入**

```bash
node --version          # 22 以上が必要
npm --version
npm install -g @zvec/zvec-grep
zg version
zg help
zg help index
zg help query
```

`npm` 成功後も `zg: command not found` なら、npm のグローバル bin が `PATH` に無い。mise / nvm / fnm / Volta 等の設定を確認し、再ログイン後に `command -v zg` を実行する。

> **オプションはリリースで変わり得る。本節の例を流用する前に、導入した版の `zg help <command>` を正とすること。**

**(2) 対象の固定と衛生確認**

```bash
git clone <authorized-repository-url> target-repo
cd target-repo
git status --short
git rev-parse HEAD
git submodule status --recursive
find . -maxdepth 3 \( -name '.env' -o -name '*.pem' -o -name '*.key' \) -print
```

解析の再現性を優先するなら、**専用 worktree または固定コミット**を使う。ビルドや依存取得の**前に**初回索引を行えば、`node_modules` 等のノイズを持ち込む危険を減らせる。

**(3) 埋め込みモデルの選択**（ローカルモデルの既定ダウンロード先は `~/.zvec-grep/models`）

| プロジェクト特性 | 推奨開始モデル | 留意点 |
|---|---|---|
| 主にコード、初回の速度重視 | `local/potion-code-16m-v2` | Potion 系は GPU で高速化されない |
| 日本語を含む仕様・コメント・多言語文書 | `local/potion-multilingual-128m` または `local/multilingual-e5-small` | 初回時間・メモリを測定する |
| 多言語かつ長いコード・文書 | `local/jina-embeddings-v2-base-code` | ONNX Q8。CPU/GPU 設定を検証する |
| 品質優先の多言語コード・文書 | `local/embeddinggemma-300m` または `local/qwen3-embedding-0.6b` | 端末性能・レイテンシを測る |

Transformer/GGUF 系は `ZVEC_GREP_DEVICE=auto|cpu|metal|vulkan|cuda` を設定できる。Apple Silicon なら `metal`、CUDA 環境なら `cuda` を試す価値がある。**モデルを変えるとベクトル空間が変わるため、既存索引のまま比較してはいけない。モデル変更には再構築が必要である。**

**(4) 初回索引**

```bash
cd /absolute/path/to/target-repo
zg index --embedding local/potion-code-16m-v2
zg status
```

`.zvec-grep/` がワークスペース直下に作られる。**Git 管理しない**：

```bash
printf '\n# local zg index\n.zvec-grep/\n' >> .gitignore
```

> 既に追跡済みの `.zvec-grep/` がある場合は、チームの合意を得て `git rm -r --cached .zvec-grep` を行う。これは Git の追跡状態を変更する操作なので、勝手に実行しない。

成功後、4経路を一度ずつ実行して対象が期待通り読めているか確認する：

```bash
zg query --human --limit 8 "起動時に設定を読み込み、永続化状態を復元する処理"
zg query --fts --human --limit 10 "authentication session token"
zg query --vector --human --limit 8 "where access credentials are validated and rejected"
zg query --rg -n -F "AuthService" src
```

失敗・スキップが疑われる場合：

```bash
zg index --debug
zg status --mode direct --debug
zg query --debug "authentication flow"
```

大規模リポジトリでは、いきなり全域を索引せず、`zg help index` で関連ディレクトリ・glob・型・ignore・深さ・最大ファイルサイズを確認してスコープする。**スコープ設定は最初の索引に保存され、既存索引はその設定を再利用する**（広げたい場合は `--reset-paths`）。

**(5) エージェント接続（任意）**

```bash
zg install
zg install --target opencode --yes    # 非対話で特定エージェントのみ
```

設定後、エージェントを再起動する。既定で公開される MCP ツールは `zvec_grep_search` のみであり、**索引作成・再構築・削除は明示的 CLI 操作に留められる**（エージェントが勝手に永続索引を変更しない）。

**(6) 索引の鮮度を保つ運用**

| 状況 | 実行 |
|---|---|
| 通常のソース変更を反映 | `zg index`（増分更新） |
| 今のクエリだけ最新で検索したい | `zg query --refresh wait "..."` |
| 対話検索で待ち時間を減らしたい | `zg query --refresh background "..."`（freshness を確認） |
| 状態や失敗を確認 | `zg status`、必要時 `zg status --mode direct --debug` |
| 埋め込みモデルを変更 | `zg index --rebuild --embedding <new-model>` |
| 保存済みスコープを置換 | `zg index --reset-paths ...` |
| 索引を廃棄 | `zg index --drop --yes`（破壊的） |

`--rebuild` を「更新のたび」に使わない。**再構築はモデル変更または保存済み設定を意図的に替える場合に限定する。**

Git hook（`post-merge` / `post-checkout`）で更新を自動化する場合は、並行実行を避けるロック付きラッパーを介する。`.git/hooks/` は通常 Git 管理されないため、チーム配布には `core.hooksPath` やセットアップスクリプトを用いる。バックグラウンド実行は `possibly_stale` な結果を返し得るので、直後の厳密な調査は `--refresh wait` を使う。

**(7) 調査品質のチェックリスト**

- 検索ヒットだけで制御フローを確定しない。呼び出し元・呼び出し先・条件分岐・例外・テストを読む
- 動的ディスパッチ、reflection、DI、コード生成、macro、feature flag、環境変数、非同期キュー、plugin は**静的検索だけで欠落しやすい**。実行時検証を計画する
- `possibly_stale` の結果を設計レビューの確定根拠にしない
- **変更作業をするエージェントと、証拠を集めるエージェントの役割を分ける**。前者にはテスト・diff を、後者にはパス・行・根拠を要求する

**(8) 限界とセキュリティ**

- PDF、Office 文書、アーカイブ、コンパイル成果物、DB、音声・動画、空ファイル、バイナリ判定ファイル、サイズ上限超過ファイルは**既定で索引化されない**
- `zg` は逆コンパイラ、動的トレーサ、デバッガ、SAST の**代替ではない**。バイナリや実行時挙動の解明には Ghidra/IDA、デバッガ、eBPF、テストなどを併用する
- 機密コードでは**ローカル埋め込みモデルのみ**を用いる。**リモート埋め込みは、認証情報の設定だけでは送信許可にならず、明示的な許可が必要である**
- 索引とモデルキャッシュを、共有キャッシュ・外部 artifact・リモートログへ不用意に出さない
- 対象は**自組織のソース、明示的に許可を得た顧客・OSS・監査対象**に限る。アクセス制御の回避、ライセンス違反、秘密情報の持出し、第三者サービスへの不正アクセスを目的とした利用は対象外

---

## 9. 未解決の設計問題

1. **`ORIGIN-LONG-SPEC` の実在ファイル接地** — 逆回転の `ORIGIN-LONG-SPEC` は既存実装を記述するが、順方向の RFC は「これから作るもの」を記述する。同じスキーマで扱えるのか、`languageRules` 相当の拡張が要るのか
2. **逆方向情報の `RFC-SEED.md` への格納先** — §1・§2 は機械注入で AI は書けない。逆由来の来歴と既存実装の実態を、機械注入セクションの新設（例: 追加見出し）で持たせるか、§1 を拡張するか。いずれも **14見出し契約**（`seed-parse` / スキーマ / authoring surface）の変更を伴う
3. **Red 再建の実行主体とタイミング** — `/split-to-tickets` が生成した Red 再建チケットを、実装ループのどこで実行するか。違反注入は既存実装を一時的に壊すため、**作業ツリーの隔離**が必要
4. **既存ファイルへの `[::TICKET::]` プロベナンス注釈の一括後付け** — `drill-rfc-down` の `refresh-file-headers.js` に前例はあるが、プロジェクト全体への一括適用の是非
5. **動的解析の実行許可とコスト** — テスト実行・ファジング・シンボリック実行は時間と計算資源を要する。どこまでを必須とし、どこからを任意とするか
6. **スコープの動的縮小** — 大規模プロジェクトで「全部やる」が不可能なとき、**部分成功をどう定義するか**
7. **再現性の保証水準** — 決定論的部分について「同一入力から同一 `ORIGIN-LONG-SPEC`」をどこまで要求するか
8. **既存実装の「正しさ」の扱い** — 既存実装が仕様に反している可能性を、どの段でどう表面化させるか（追認を避ける機構の具体化）

---

## 10. 用語集

| 語 | 意味 |
|---|---|
| **順回転（forward rotation）** | `spec.md` から始まり、正典 RFC を公理として4層ループを回す既存の流れ |
| **逆回転（reverse rotation）** | 既存実装から始まり、`ORIGIN-LONG-SPEC` を経て4層ループへ合流させる新しい流れ |
| **正典（canon）** | 設計判断の唯一の起点となる RFC |
| **正典 RFC** | 各ディレクトリの設計判断を集約した RFC |
| **workspacify** | 第5層。仕様書をワークスペース／ディレクトリ構造へ分解し、結合契約を機械可読に確定する |
| **RFC-SEED.md** | 各パッケージに1つ置かれる RFC の種。`/grill-me-for-rfc` の入力 |
| **self-grill** | AI が自分自身を敵対的にレビューし、findings が 0 になるまで収束させる機構 |
| **residual** | 解けなかった問い。`grill_question` を伴い、後段の人間 grill へ構造化して引き継がれる |
| **RESIDUE** | `/crystalize-readme` が README 内に残す「書けないセクション」。証拠＋実装補強設計 |
| **omission** | `/find-omissions` が検出する「契約がテストへ正しく翻訳されていない」ギャップ |
| **WIG** | Workspace Integration Graph。抽出された契約が作る結合グラフ。履行不能な結合等を違反として検出 |
| **追認 RFC** | 既存コードを文章化しただけの RFC。5つの整合性が表面的に成立するが実質は偽の green |
| **Red 再建** | 既存実装のテストが最初から green である問題に対し、違反注入等で red の証拠を遡って生成すること |
| **給仕** | 非決定論的判断の直前に、判断に必要な材料を親切に差し出すスクリプトの役割 |
| **`[::STUB::]`** | 不完全実装を示す必須マーカー。`Malfeasance.json` に記録され、解決まで次に進めない |
| **契約（Contract）** | I/O 境界に付与される Precondition / Postcondition / Invariant。テスト可能な形に翻訳されて初めて仕様として成立する |
| **provenance 3値** | 逆回転で生まれる全記述の分類。`observed`（証拠必須）/ `inferred`（根拠必須）/ `unresolved`（`grill_question` 必須） |
| **判断カード** | AI の判断点ごとに「問い / 選択肢 / 帰結 / 証拠 / 反例 / 既定値」を Markdown で差し出す仕掛け（7.4節） |
| **アブダクション** | 最良の説明への推論。順方向の演繹に対し、逆方向が本質的に必要とする推論形式 |
| **CPG（Code Property Graph）** | AST + CFG + PDG を統合したコードグラフ。Joern が代表実装。データフロー・テイント解析に使う |
| **SCIP / LSIF / Kythe** | 言語非依存のコードインテリジェンス索引。定義・参照・型を正確に解決する |
| **DSM（依存構造行列）** | モジュール間依存を行列で表し、クラスタリングと違反検出に使う |
| **リフレクションモデル** | 設計意図と実装の差分を明示的に扱うアーキテクチャ復元手法 |
| **動的不変条件推論** | 実行トレースから不変条件を推論する手法。Daikon が代表実装 |
| **ミューテーションテスト** | 実装に人工的な欠陥を注入し、テストがそれを検出できるか測る。**Red 再建の中核** |
| **コンコリック実行** | 具体実行とシンボリック実行を組み合わせ、経路制約から事前条件を復元する |
| **ゴールモデル** | 要求工学における目的・目標の階層構造。KAOS / i* が代表。コードからの逆抽出が課題 |
| **仕様マイニング** | テスト・実行履歴・API 使用例から事前条件／事後条件を抽出する手法群 |
| **論理結合（logical coupling）** | git 履歴上「一緒に変更される」ファイル群。設計上の結合の傍証になる |
| **スパイク方式** | 1ディレクトリで全工程を1周し、成否を人間が判定してからスコープを広げる戦略（7.7節） |
| **部分成功 L0〜L3** | 逆回転の中間成果の水準。**L3（RESIDUE 0 かつ Red 再建の証拠が全チケットに存在）以外を成功と呼ばない**（7.7節） |
| **F1〜F10** | 逆回転の失敗モード・カタログ（7.6節）。**F1（追認 RFC）と F2（赤の偽装）は静かに成功する失敗である** |

---

## 付録: 参考文献

- [Zvec-Grep documentation](https://zvec.org/en/docs/zvec-grep/)
- [Manage an Index](https://zvec.org/en/docs/zvec-grep/indexing/)
- [Search Guide](https://zvec.org/en/docs/zvec-grep/search/)
- [Embedding Models](https://zvec.org/en/docs/zvec-grep/embedding-models/)
- [Supported Content](https://zvec.org/en/docs/zvec-grep/supported-content/)
- [Connect AI Agents](https://zvec.org/en/docs/zvec-grep/agents/)
- [CLI Reference](https://zvec.org/en/docs/zvec-grep/cli/)
- [Troubleshooting](https://zvec.org/en/docs/zvec-grep/troubleshooting/)

`zg` の手順は公開ドキュメントを基にした運用テンプレートである。実行前には必ず利用中のバージョンで `zg help`、`zg help index`、`zg help query` を実行し、オプションと挙動を確認すること。
