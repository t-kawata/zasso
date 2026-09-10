---
description: WORKSPACIFY-TREE-MANIFEST.json を入力に実ディレクトリツリーと package 毎の RFC-SEED.md を生成する(第二段階)
argument-hint: <path-to-WORKSPACIFY-TREE-MANIFEST.json>
disable-model-invocation: true
---

# /workspacify-allocate

**Role**: 第一段階 `/workspacify-tree`（`.claude/commands/workspacify-tree.md` を参照・本コマンドの直接の前段）が発行した `WORKSPACIFY-TREE-MANIFEST.json` を唯一の引数として受け取り、**manifest と同じディレクトリ**へ実際の directory tree を生成し、各 package directory へ **ちょうど 1 つの `RFC-SEED.md`** を配置する第二段階を実行する。RFC seed は完成 RFC ではなく、directory 単位で `/grill-me-for-rfc` が正典 RFC を作るための種である。本コマンド自身は grill や実装ループを起動しない。

## Language Protocol

| Context | Language | Reason |
|---------|----------|--------|
| Chat, proposals, explanations | **Japanese** | Japanese is mandatory **ONLY** when addressing the user directly. |
| Code comments | **English** | Must be written in the language AI understands most reliably. |
| Design docs, plans, tasks | **English** | Must be written in the language AI understands most reliably. |
| Runtime logs (`log::info!`, etc.) | **English** | International debugging environment and searchability |
| Everything else, i.e. any context where you are not speaking to the user | **English** | Must be written in the language AI understands most reliably. |

## Arguments

- 第1引数(必須・唯一): 第一段階が公開した manifest へのパス(`<path-to-WORKSPACIFY-TREE-MANIFEST.json>`)
  - 要件: 通常ファイル / UTF-8 復号可 / 非空 / JSON parse 可 / tree-manifest schema 適合 / `artifact_kind == "workspacify-tree-manifest"` / `status == "COMPLETE"` / `final_audit.status == "PASS"` / `stage2_handoff.eligible == true` / self-hash 一致 / 記録された仕様書が manifest と同ディレクトリにあり re-hash が `input.source_hash` と一致
  - 追加引数・対話・環境変数・hook・外部取得を要求しない。`--decisions` は gate/finalize の AI 執筆入力を指す（後述）
  - 引数以外の自由入力があった場合には、それを追加情報として扱う

## 出力の正本と制約

- 公開する成果物は **3 種のみ**: directory tree / 各 package の `RFC-SEED.md` / **`WORKSPACIFY-ALLOCATE-MANIFEST.json`**（機械的最終正本）。生成先は **manifest の親ディレクトリ**
- `WORKSPACIFY-ALLOCATE-MANIFEST.json` は「証明の記録」であり**目的ではない**。目的は tree と seed を公開し、その結合が成立していることを機械的に証明すること
- `RFC-SEED.md` は 14 見出し（§1 全体内位置 / §2 結合契約 / §3 移転と配賦 / §4-13 AI 執筆 / §14 原典追跡）に従う。**§1 と §2 は機械注入**であり AI は書けない
- 各 seed は 3 参照（原典仕様書 / stage-1 manifest / stage-2 manifest）を §1 に持ち、stage-2 manifest は**canonical パスのみ**（hash を埋め込むと循環する）
- 中間物（staging / scratch）は実行中のみ許容し、**最終工程でスクリプトが機械的に削除**する。残置物は公開 3 種と既存ファイルだけ
- 生成対象 path が既存なら **BLOCKED**（fresh-workspace only）。既存内容を merge・上書き・削除しない

## 第一段階からの引渡し契約(受領側の前提)

第二段階は「第一段階が証明した材料」だけを根拠に動く。前提は次の 4 点のみ。

- **証明済みの材料を受け取る**: 依存先の実装順序、boundary ごとの必須 clause（事前条件・事後条件・不変条件を含む）、segment とその material、package の責務、契約 item の順。第二段階はこれらを再計算・再解釈せず、独自の順序や clause を作らない。
- **不足・矛盾は第二段階で補わない**: Step 1 で中断し、第一段階の manifest と decision を修正して再発行した上で validate からやり直す。
- **二重ゲート**: 第一段階も同じ entry gate を通しているため、ここで拒否された場合は manifest が差替え・改竄されている（生成物ではなく入力を疑う）。
- **失敗時は助言に従う**: どの前提が欠けたかは entry gate が「何が問題か・なぜ重要か・どう直すか」を述べる。。

## 使用スクリプト

`.claude/scripts/workspacify-allocate/` 配下。

| スクリプト | 説明 |
|---|---|
| `run.mjs validate <manifest>` | 入力ロック: schema / self-hash / COMPLETE / final_audit / stage2_handoff / spec re-hash（G0/G1）。PASS/FAIL を exit code で返す |
| `run.mjs plan <manifest>` | directory plan（ancestor+leaf・leaf↔package bijection）+ path 安全性 + existing-output policy（G2） |
| `run.mjs packet <manifest> [--package=<id>]` | AI 執筆支援: package 毎の authoring packet（owned inventory・source excerpt・境界 context）を JSON 出力 |
| `run.mjs gate <manifest> --decisions=<path>` | decisions schema/authoring surface → 自己 grill ループ(G3.7: 5 focus・収束・残余の形・第一段階残余の逐語搬送・禁止語彙) → 全 seed render → seed-local（3 参照・契約完全性）→ parity → 移転漏れゼロ（material segment の被覆＋non-material の記録） → 双方向契約(G4) → WIG(G5) → 実装順序一致 → APPROVED presence。COMPLETE のみ exit 0 |
| `run.mjs finalize <manifest> --decisions=<path>` | 全ゲート再実行 → manifest 構築 → tree + seeds + allocate manifest を原子公開 → reload 再検証 → cleanup（G6）。成功時は 3 種のみ公開 |

## 状態とゲート

状態値: `PASS` / `FAIL` / `REVIEW_REQUIRED` / `BLOCKED` / `COMPLETE`

- `REVIEW_REQUIRED` は成功ではない。未解決 review が残る限り COMPLETE を出さない
- `BLOCKED`: 入力不在・不一致、path collision、既存出力衝突（fresh-workspace only）
- ゲート階層: G0 入力ロック → G2 移転基準・依存証明・安全性 → G3 seed render・local（参照/契約/被覆） → **G3.7 自己 grill と残余の到達** → G4 双方向契約 → G5 WIG（Workspace Integration Graph: 抽出した契約が作る結合グラフ。誰かが守れない結合・二重 owner・二重変更・検証者のいない証明を違反として検出する）・実装順序 → G6 publish・reload・cleanup。親ゲート未 PASS なら子を PASS にしない

## 設計判断と機械化の境界

- **機械(決定論)**: 入力 entry gate・spec re-hash・path 安全性・移転基準の導出・authoring packet 生成・**§1/§2 の機械注入**・見出し/index/契約 parse・seed-local checks・parity・**移転漏れゼロ証明**・**双方向契約**・**WIG 検証**・**実装順序の導出と stage-1 proof との等価検証**・allocate manifest の構築と自己 hash・reload 再検証・cleanup
- **AI(意味論判断)**: 各 seed の §4-13 の執筆・契約 clause の内容・境界の文言・**自己 grill ループの実行と収束の判断**・grill question・`semantic_review.status === "APPROVED"` の記録
- 過度機械化を避ける: 機械は構造・移転の忠実性・結合の完全性のみ検証し、**seed のプロース品質は評価しない**。WIG は中間物であり workspace に残さず、canonical summary と hash だけを allocate manifest に記録する

## Step 1: validate(G0/G1)

**目的**: 入力 manifest と co-located 仕様書を「固定」する。schema / self-hash / COMPLETE / final_audit / stage2_handoff を検証し、manifest と同ディレクトリの仕様書を再 hash して `input.source_hash` と一致させる。ここが壊れると以後の source trace が無効になる。

```bash
node .claude/scripts/workspacify-allocate/run.mjs validate "$ARGUMENTS"
```

- **成功条件**: `{status:"PASS", workspaceRoot, sourceHash, manifestHash, gateSummary}` が出力され exit 0
- **失敗時**: **ここで中断する。以降の Step へ進んではならない。**

## Step 2: 移転基準と依存証明(G1.5/G2)

**目的**: tree を決めるのではない（それは第一段階で確定済み）。ここで確定するのは **①segment→owner の被覆表 ②inventory→package の配賦表 ③edge→boundary→必須 clause 表 ④実装順序の輪郭**であり、あわせて path 安全性と fresh-workspace 性を前提検査する。

```bash
node .claude/scripts/workspacify-allocate/run.mjs plan "$ARGUMENTS"
```

- **成功条件**: `{status:"PASS", plannedDirectoryCount, relativeDirs}` が出力され exit 0
- **AI の仕事**: 被覆表と配賦表を確認し、原典の取りこぼし・過剰分割・不自然な境界があれば第一段階へ戻す判断をする（本コマンドは workspace 設計を変更しない）
- **失敗時**: tree↔package 不一致・unsafe path・symlink・既存 file/symlink/非空 dir の BLOCKED 理由から原因を特定

## Step 3: authoring — packet と decisions の執筆(AI の意味論判断)

**目的**: Step 2 の plan と manifest をもとに、AI が package 毎の RFC-SEED.md 内容を**機械検証できる decisions JSON** として書き出す。機械は AI の頭の中を読めないため、seed の semantic body は必ず decisions を経由して gate に渡す。

### 3-1: authoring packet の取得

```bash
node .claude/scripts/workspacify-allocate/run.mjs packet "$ARGUMENTS"
# 特定 package のみ: --package=pkg-0001
```

packet は次を含む（AI 情報提供・機械生成）:
- package identity（id/name/path/layer/kind/seed_required/**responsibilities**）
- owned items: category / inventory_ref / canonical_name / source_refs(**segment id**) / source excerpt（unresolvable は unresolved_items として表示）
- **contract_context**: 宣言された boundary ごとの相手 package（責務付き）・`required_clauses`（core を mandatory として明示）・方向・相手 material の segment 抜粋
- forbidden_edges: 契約にしてはならない依存とその相手
- conformance/test 義務（test-support / conformance package）

### 3-2: 起草順 — 契約を先に起草し、散文は後

**契約は散文より先に起草する。** seed の質を決めるのは結合契約であり、散文はその従属物だからである。

1. packet の `contract_context` から boundary ごとの clause 群（`required_clauses` の core は mandatory）を先に書き、`contractEdges` を確定させる
2. 相手側 seed の契約と突き合わせる（機械は G4 の双方向契約検査で照合する）。片側だけ・clause 不一致はここで潰す
3. 契約が固まってから §4〜§13 の散文を書く。散文は §2 の clause を参照し、矛盾してはならない

### 3-3: 自己 grill ループ（AI が自分に対して敵対的レビューを行う）

**このループは AI 自身が回す。人間への差し戻し・問い合わせ・承認待ちは完全に禁止である**（人間による grill は公開後の per-directory 作業として後日行われる）。契約を起草したら、`self_grill` として次を回す:

- **5 つの focus** を各 pass で回す: `implementer`（この契約で実装者は書けるか）/ `counterpart`（相手側 seed と噛み合うか）/ `test`（§11 の test 義務が契約を検証できるか）/ `grill`（人間 grill に出せる問いか）/ `adversarial`（この結合を壊しにいく: 過剰結合・漏れた clause・暗黙の前提）
- **収束条件**: 新しい finding が 0 になった pass で終了する。`self_grill.rounds` の**最終 pass は findings が空**でなければならない（= 収束の証拠）。focus が適用外なら `status: "not_applicable"` と `reason` を書く（境界が 1 つでもあるなら adversarial は `ran` でなければならない）
- **解けなかった問いだけが residual**: `topic` / `alternatives`(非空) / `chosen_default` / `why_unresolved` / `grill_question` / `package_id` / `origin`。機械が `grill_question` を該当 seed の §12 へ**追記する**ので、AI が転記する必要はない（転記ミスも起きない）
- **第一段階の残余は逐語で運ぶ**: `WORKSPACIFY-TREE-MANIFEST.json` の `stage2_handoff.residual_questions` の各 `candidate_id` を `origin`（`stage1_pulse` / `stage1_dependency_review`）と `origin_candidate_id` で指し、`topic` は原文のまま写す。1 件でも落とすと G3.7 が candidate id を名指しして停止する
- **TODO / TBD / ask the human / waiting for approval / human review required / confirm with the operator は payload 全体で禁止**。解けないなら residual にして `grill_question` を書く

### 3-4: decisions JSON の執筆

packet と仕様を読み、全 package（`seed_required: true`）の semantic body を decisions へ書く。

```json
{
  "seeds": [
    { "packageId": "pkg-0001",
      "aiSections": {
        "4": "alpha record とその valid の範囲...",
        "5": "consumer 義務...", "6": "provider 義務...",
        "7": "not_applicable — 状態なし", "8": "not_applicable — 外部 I/O なし",
        "9": "...", "10": "...", "11": "...",
        "12": "grill question: ...", "13": "禁止依存..." },
      "contractEdges": [
        { "contract_id": "contract-boundary-001", "direction": "consumer_to_provider",
          "connection_kind": "value_only",
          "owners": { "semantic": "pkg-0002", "state": "not_applicable", "side_effect": "not_applicable", "port": "not_applicable", "adapter": "not_applicable" },
          "clauses": { "input": "...", "output": "...", "preconditions": ["..."], "postconditions": ["..."], "invariants": ["..."], "tests": ["..."] },   // キーは語彙外だと機械が拒否する(黙って捨てない)
          "source_refs": ["s-000002"] } ] }
  ],
  "self_grill": {
    "passes": 2,
    "converged": true,
    "rounds": [
      { "pass": 1, "focus": "implementer", "status": "ran", "findings": ["boundary-001 の errors clause が §10 に反映されていない"] },
      { "pass": 1, "focus": "counterpart", "status": "ran", "findings": [] },
      { "pass": 1, "focus": "test", "status": "ran", "findings": [] },
      { "pass": 1, "focus": "grill", "status": "ran", "findings": [] },
      { "pass": 1, "focus": "adversarial", "status": "ran", "findings": [] },
      { "pass": 2, "focus": "implementer", "status": "ran", "findings": [] },
      { "pass": 2, "focus": "counterpart", "status": "ran", "findings": [] },
      { "pass": 2, "focus": "test", "status": "ran", "findings": [] },
      { "pass": 2, "focus": "grill", "status": "ran", "findings": [] },
      { "pass": 2, "focus": "adversarial", "status": "ran", "findings": [] }
    ],
    "residual": [
      { "topic": "第一段階が残した観測(逐語)", "origin": "stage1_pulse", "origin_candidate_id": "pulse-000001",
        "package_id": "pkg-0001", "alternatives": ["pkg-0001 に置く", "pkg-0002 へ移す"],
        "chosen_default": "第一段階の割当のまま", "why_unresolved": "owner の選択が契約面を変える",
        "grill_question": "この規則の owner は pkg-0001 か pkg-0002 か" }
    ]
  },
  "semantic_review": { "status": "APPROVED", "statement": "全 package の owner 割当・境界・過剰分割を確認した", "approver": "ai-session" }
}
```

- AI 最終承認チェックリスト（workspacify-tree Step 3 と同型。全項目を確認した場合のみ `semantic_review.status` を `APPROVED` にする）:
  - [ ] 各 seed の Allocation Index が manifest の owner 割当と一致する（機械が保証するが AI も確認）
  - [ ] semantic body が原典の MUST/MUST NOT/禁止/数式/schema/error を弱めていない
  - [ ] 他 package の semantic owner を再定義していない（依存は dependency_context/consumer_obligation として記述）
  - [ ] 自己 grill ループを収束まで回し、解けなかった問いだけを residual として §12 の grill question に残した(放置も、人間への問い合わせも禁止)
  - [ ] 過剰分割・不自然な境界がない（あれば第一段階へ戻す判断）
- decisions は仕様書ディレクトリ以外（例: `os.tmpdir()`）へ作成する。schema は `schemas/workspacify-allocate-decisions.schema.json` で機械検証される

## Step 4: gate ループ(G3/G4/G5/order)

**目的**: decisions と rendered seed が「客観ルールに適合しているか」を機械の実ゲートパイプラインで検証する。

```bash
node .claude/scripts/workspacify-allocate/run.mjs gate "$ARGUMENTS" "--decisions=<decision.json>"
```

- **成功条件**: `{status:"COMPLETE", gateSummary}` が出力され exit 0
- **ゲート内容**: decisions schema ＋ authoring surface（§1/§2 を書いていないこと・§4-13 が揃うこと）→ **自己 grill ループ(G3.7)**（5 focus の網羅・最終 pass の収束・residual の形・第一段階残余の逐語搬送・禁止語彙）→ 全 package renderSeed → seed-local checks（14 見出し順・非空・index 一致・**3 参照の一致**・**契約の完全性**・segment id 実在）→ seed↔manifest parity → **移転漏れゼロ**（`owned_inventory_ids` が非空の segment が参照され、空の segment は non-material として記録される）→ **双方向契約（G4）** → **WIG（G5）** → **実装順序が stage-1 proof と一致** → **残余の到達(G3.7 再検査)**（各 `grill_question` が該当 seed §12 に逐語で存在）→ `semantic_review.status === "APPROVED"` presence
- **AI の仕事**: FAIL の原因（schema / 空 body / parity / 未被覆 segment / 片側だけの契約 / clause 不一致 / WIG 違反 / 順序不一致 / **G3.7: focus 欠落・未収束・形の崩れた residual・第一段階残余の落ち・禁止語彙** / APPROVED 未記録）に応じ decisions を修正し **exit 0 まで繰り返す**（自己修復ループ）。機械はプロース品質を評価しない

## Step 5: 正本の構築と原子公開(G6)

**目的**: 全ゲート PASS・意味論承認済みのときだけ、tree + seeds + `WORKSPACIFY-ALLOCATE-MANIFEST.json` を staging に構築して**まとめて原子公開**し、公開物そのものを再検証する。

```bash
node .claude/scripts/workspacify-allocate/run.mjs finalize "$ARGUMENTS" "--decisions=<decision.json>"
```

- **実行条件**: 全ゲート PASS・`semantic_review.status === "APPROVED"`。そうでなければ COMPLETE にせず非 0 で終了
- **公開手順**: staging に tree + 全 seed + manifest を構築 → staged 集合の検証（計画 dir・全 seed・manifest 以外が無いこと）→ top-level 毎に atomic rename（rollback 付き）→ **reload 再検証** → **中間物の機械削除** → 報告
- **reload 再検証**: tree 再走査 → 全 seed 再 parse → 契約再抽出 → WIG 再構築（hash 比較）→ 実装順序再導出 → 被覆再証明 → manifest 自己 hash 検証。乖離は artefact と package を名指しして失敗
- **成功時出力**: `{published:true, workspaceRoot, allocateManifestPath, allocateManifestHash, inputManifestHash, directoryCount, packageCount, seedCount, contractCount, waveCount, gateSummary, residue}`
- **既存出力保護**: 生成対象 path が file/symlink/非空 dir なら BLOCKED で停止し、既存 tree を置換・破壊しない

## Step 6: 報告

- 成功時は **workspace root 絶対パス / input manifest hash / directory 数 / package 数 / seed 数 / gate summary のみ** を表示する
- 失敗時は **失敗 gate の id / 理由 / 修正すべき入力（manifest・decisions・co-located spec）** を表示する

## エラー復帰

- 失敗時は stderr の `[guide]`（原因と修正対象）を読み、入力または decisions を修正して gate を再実行する
- `REVIEW_REQUIRED` / `BLOCKED` は `COMPLETE` にならず、既存 workspace は常に保全される

## 付録A: RFC-SEED.md の必須見出しと Allocation Index 文法

`RFC-SEED.md` は package 毎に **ちょうど 1 つ** 置く。以下の **14 見出し**をこの順序で持ち、**§1 と §2 は機械が注入**する（AI は書けない）。各本文は非空か、`not_applicable — <理由>` の型付きで理由を添える。機械は本文を空にできない（AI が書くべき意味論を機械が捏造しないため）。

```text
# RFC Seed: <package-name>
## 1. Identity and Position in the Whole System      <- 機械注入 (3 参照 / 実装順序 / 契約 id / 被覆 segment)
## 2. Coupling Contracts (I/O Boundary)              <- 機械注入 (boundary ごとの clause 群)
## 3. Source Coverage and Allocation Index           <- 機械注入 (Allocation Index 表 + 被覆)
## 4. In-Scope Objects, Claims, Predicates, State and Invariants
## 5. Incoming Dependencies and Consumer Obligations      (contract_id を参照)
## 6. Outgoing Provider Obligations                       (contract_id を参照)
## 7. State Ownership and State-Transition Material
## 8. Side-Effect and External-I/O Boundaries
## 9. Canonicalization, Signatures and Proof Responsibilities
## 10. Failure, Rejection, Recovery and Finality Material
## 11. Required Unit, Integration, Exception and Malfeasance Test Material
## 12. Grill Questions and Explicitly Unresolved Design Choices
## 13. Forbidden Dependencies, Non-Interference Boundaries and Non-Goals
## 14. Source Traceability Index                     <- 機械注入 (segment id 付き)
```

§1 は **機械注入の JSON**（3 参照パス・実装順序・契約 id・被覆 segment）であり、§2 は **結合契約の JSON**（boundary ごとの clause 群）である。この 2 節が結合の機械的正本であり、§5〜§11 の prose は §2 の contract id を参照して矛盾してはならない。§3 の Allocation Index は manifest の owner 割当を機械抽出可能にする唯一の表であり、次の 3 列 Markdown 表である:

```markdown
### Allocation Index

| Category | Inventory ID | Canonical Name |
| --- | --- | --- |
| object | obj-000001 | Alpha Record |
| invariant | inv-1 | alpha-invariant |
```

機械はこの表を `lib/seed-parse.mjs` で復元し、`lib/seed-parity.mjs` で manifest の `workspace.ownership.entries` と **全 package 横断の bijection（欠落 0・重複 0・未知 0・他 seed への漏れ 0）** を検証する。表に載るのは自 package の所有 item のみ。他 package 所有 item は本文中に dependency_context / consumer_obligation として説明できても、**表には載せられない**。

## 付録B: decisions 入力のフィールド

`gate` / `finalize` は AI 執筆の decisions JSON を読む。schema は `schemas/workspacify-allocate-decisions.schema.json` で機械検証される。

| フィールド | 型 | 内容 |
|---|---|---|
| `seeds[].packageId` | string | package catalog の id（`seed_required: true` の全 package に 1 エントリ必須） |
| `seeds[].aiSections` | object | AI が執筆する semantic body。key は見出し番号で **§4〜§13 の 10 個が必須**（§1/§2/§3/§14 は機械注入。key に含めれば schema と authoring surface が拒否）。欠落・空は render が error |
| `seeds[].contractEdges` | array | その package が担う boundary ごとの**結合契約**。`contract_id` / `direction` / `connection_kind` / `owners`（semantic/state/side_effect/port/adapter）/ `clauses`（キーは契約 clause の閉じた語彙のみ。**語彙外のキーは契約 id とキー名を名指しして拒否され、黙って捨てられることはない**。値は `stage2_contract_scope` を満たす。**core 5 clause は必須**）/ `source_refs`（segment id）。宣言 boundary に対する契約が無ければ local gate が FAIL、宣言外の contract_id は拒否される |
| `semantic_review.status` | `APPROVED`/`REVIEW_REQUIRED` | AI 意味論最終承認。`APPROVED` 以外は finalize 不可 |
| `semantic_review.statement` | string | 確認内容の要約 |
| `semantic_review.approver` | string | 判断したセッション識別子 |

## 付録C: run.mjs の出力例

```text
$ node .claude/scripts/workspacify-allocate/run.mjs validate ./WORKSPACIFY-TREE-MANIFEST.json
{"status":"PASS","workspaceRoot":"/work/specs","sourceHash":"ab12…","manifestHash":"cd34…","gateSummary":"G0:PASS G1:PASS"}

$ node .claude/scripts/workspacify-allocate/run.mjs gate ./WORKSPACIFY-TREE-MANIFEST.json --decisions=/tmp/decisions.json
{"status":"COMPLETE","gateSummary":"G0:PASS G2:PASS G3:PASS G4:PASS G5:PASS order:PASS semantic:APPROVED"}

$ node .claude/scripts/workspacify-allocate/run.mjs finalize ./WORKSPACIFY-TREE-MANIFEST.json --decisions=/tmp/decisions.json
{"published":true,"workspaceRoot":"/work/specs","allocateManifestPath":"/work/specs/WORKSPACIFY-ALLOCATE-MANIFEST.json",
 "allocateManifestHash":"ef56…","residue":["WORKSPACIFY-ALLOCATE-MANIFEST.json","WORKSPACIFY-TREE-MANIFEST.json","crates","spec.md"],
 "inputManifestHash":"cd34…","directoryCount":7,"packageCount":3,"seedCount":3,"contractCount":2,"waveCount":2,
 "segmentCoverage":"5/5","gateSummary":"G0:PASS G2:PASS G3:PASS G4:PASS G5:PASS order:PASS G6:PASS semantic:APPROVED"}
```

失敗時は `{status:"FAIL", gateId, reason}` を stdout に、人間可読な案内（次の行動）を stderr に出す。成功時は **workspace root / allocate manifest のパスと hash / input manifest hash / directory・package・seed・contract 数 / wave 数 / segment 被覆 / gate summary / 残置物** を出力する。

## 付録D: AI 意味論最終承認チェックリスト（詳細）

`semantic_review.status` を `APPROVED` にする前に、AI は **全項目** を確認する。1 つでも未達なら `APPROVED` にせず decisions を修正して gate へ戻す（未承認のまま機械は COMPLETE を出さない）。

- [ ] **owner 割当の妥当性**: 各 seed の Allocation Index が manifest の owner 割当と一致し、未割当・重複・他 seed 漏れがない（機械 parity が保証。AI も §1/§2/§3 を目視確認）
- [ ] **原典の規範の保持**: object/claim/invariant/state machine/error/required test の MUST / MUST NOT / 禁止 / 数式 / schema / error を根拠なく弱めていない（source trace を保持）
- [ ] **semantic owner の非再定義**: 他 package 所有の規範を再所有せず、依存は dependency_context / consumer_obligation として記述した
- [ ] **結合契約の完全性**: 各 boundary の契約が §2 にあり、**事前条件・事後条件・不変条件**を含む core clause が空でない。相手側 seed と矛盾しない（機械は双方向対称・WIG・順序で検証するが、意味が正しいかは AI が判断する）
- [ ] **禁止依存・非干渉**: manifest の forbidden edge / non-goals を §13 に反映し、§2 の契約に矛盾する結合を書いていない
- [ ] **実装順序の尊重**: §1 の `implementation_order` が示す provider 先行の順序に反する前提（未実装の相手に依存する記述）を書いていない
- [ ] **不明点の明示**: 曖昧・未解決の設計判断を放置せず、自己 grill ループの `residual` として `grill_question` を書き §12 に残した(TODO/TBD は payload 全体で禁止)
- [ ] **過剰分割・境界の最終判断**: 内部状態共有・中間値分割・相互依存必須・不変条件再実装の兆候があれば第一段階へ戻す判断をした

## 付録F: WORKSPACIFY-ALLOCATE-MANIFEST.json の構造

公開される機械的最終正本。第三段階（各 directory の実装ループ）が読む。

| フィールド | 内容 |
|---|---|
| `artifact_kind` / `schema_version` / `status` | `workspacify-allocate-manifest` / `1.0.0` / `COMPLETE` |
| `input_tree_manifest` | `{path, hash, spec:{path, sha256}}` — 証明の対象となった第一段階 manifest と原典仕様書 |
| `seed_index[]` | `{package, path, sha256}` — 公開した全 seed（path は workspace 相対） |
| `source_coverage` | `segments_total` / `segments_covered` / `material_segments` / `non_material_segments` / `uncovered`（常に空） |
| `contract_registry[]` | 検証済みの結合契約（contract_id・boundary_id・consumer/provider・connection_kind・owners・clauses・source_refs） |
| `wig` | `summary`（node/edge/層別・種別ごとの数）・`counts`・`hash`・`violations`（常に空） |
| `implementation_order` | `{serial, levels}` — provider 先行。stage-1 proof と一致検証済み |
| `allocation` | package / seed / parse 済み package 数 |
| `gates[]` | G4・G5 の結果 |
| `self_grill` | 自己 grill ループの証明: `passes` / `converged` / `focuses` / `rounds[]`（pass・focus・status・finding_count）/ `residual_count` |
| `handoff_summary` | 人間 grill への申し送り: `unresolved[]`（residual_id・package_id・topic・why_unresolved）/ `grill_questions[]`（residual_id・package_id・question）/ `risky_boundaries[]`（残余を持つ package が端点の boundary。ここから読む） |
| `semantic_review` | AI 意味論最終承認（`status` / `approver`） |
| `completion_decision` | `COMPLETE` |
| `integrity` | `canonicalization` / `manifest_hash_algorithm` / `manifest_hash`（canonical 直列化の自己 hash） / `reload_validation` |

seed からは **canonical パスで参照**され、hash は埋め込まない（manifest が全 seed の hash を持つため循環する）。

## 付録E: 前後工程との関係

`/workspacify-tree` + `/workspacify-allocate` は、単一の長大仕様を「workspace 分解 → 実体化」して、以後の工程を **directory 単位** で回すための入口である。

- `/workspacify-tree`: 仕様を解析し workspace/package 分解を設計して `WORKSPACIFY-TREE-MANIFEST.json` を発行する（第一段階）
- `/workspacify-allocate`: その manifest を入力に実 directory tree + package 毎 RFC-SEED.md を生成する（第二段階・本コマンド）
- 以後、各 package directory の RFC-SEED.md を `/grill-me-for-rfc` の入力とし、正典 RFC → `/graphify-rfc` → `/boundify-graph` → `/split-to-tickets` → `/make-ticket`・`/plan-ticket`・`/start-ticket`・`/review-ticket` のループが **directory ごとに** 走る

本コマンドは `/grill-me-for-rfc`・`/graphify-rfc`・実装ループを起動しない。allocate 時に**結合契約を機械可読な形で確定し、双方向対称・WIG・実装順序まで検証**する。その後 directory 毎の `/graphify-rfc` が契約 edge を正典化し、実装ループが回る。WIG は中間物であり workspace に残さない（canonical summary と hash のみ allocate manifest に記録する）。

## 禁止事項

- **中間物（別ファイル化した WIG・契約・作業用の一時ファイル）を公開物として残さない**（公開は tree / seeds / allocate manifest の 3 種のみ）
- **第二の機械正本（別ファイル化した WIG や契約）を作らない** — 正本は allocate manifest 1 つ
- **§1/§2 を AI に書かせない**（機械注入のみ。decisions に含めれば拒否される）
- hook（Claude Code / Git / shell）を使用しない
- 既存内容への merge・上書き・削除を行わない（fresh-workspace only）
- カレントディレクトリ・環境変数・branch から workspace root を推測しない
- プロース品質を機械で評価しようとしない（AI 判断の阻害を防ぐ）

## 成功の定義

成功は **① AI 意味論最終承認**（decisions の `semantic_review.status === "APPROVED"`）と **② 全機械ゲート PASS・移転漏れゼロ・双方向契約成立・WIG 違反 0・実装順序が stage-1 proof と一致・reload 検証 PASS** の両立に集約される。最終確認は生成 tree の再走査、全 RFC-SEED.md の再 parse・再契約抽出・再 WIG・再順序、allocate manifest の自己 hash、そして残置物が公開 3 種と既存ファイルだけであること。
