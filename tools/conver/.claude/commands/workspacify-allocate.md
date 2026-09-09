---
description: WORKSPACIFY-TREE-MANIFEST.json を入力に実ディレクトリツリーと package 毎の RFC-SEED.md を生成する(第二段階)
argument-hint: <path-to-WORKSPACIFY-TREE-MANIFEST.json>
disable-model-invocation: true
---

# /workspacify-allocate

**Role**: 第一段階 `/workspacify-tree`（`.claude/commands/workspacify-tree.md` を参照・本コマンドの直接の前段）が発行した `WORKSPACIFY-TREE-MANIFEST.json` を唯一の引数として受け取り、**manifest と同じディレクトリ**へ実際の directory tree を生成し、各 package directory へ **ちょうど 1 つの `RFC-SEED.md`** を配置する第二段階を実行する。RFC seed は完成 RFC ではなく、directory 単位で `/grill-me-for-rfc` が正典 RFC を作るための種である。以後、各 directory で conver の 4 ループ（grill→graphify→boundify→split→make/plan/start/review）が回る。本コマンド自身は grill や実装ループを起動しない。

**正しい出力の重心**: 実 directory tree と RFC-SEED.md 群である。**`WORKSPACIFY-ALLOCATE-MANIFEST.json`（または任意の第二の機械正本・ledger・WIC/WIG JSON）を作ることが目的ではない**。これは原指示書の致命的な誤りであり、本コマンドはそれを実装しない。

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

## 出力の正本と制約

- **workspace root は manifest の親ディレクトリ**（カレントディレクトリや環境から推測しない）。manifest と同ディレクトリに `workspace.tree` 由来の directory tree を生成する
- 各 package directory に package ごと **ちょうど 1 つの `RFC-SEED.md`** を配置する。seed の無い package / package に対応しない seed / 重複 seed / manifest 外 path への seed は 0 件
- `RFC-SEED.md` の形式は PX-190 の seed grammar（15 必須見出し + Allocation Index 表）に従い、**WIC JSON block を含まない**
- 生成物は tree + seed のみ。以下は**作成・残置してはならない**: `WORKSPACIFY-ALLOCATE-MANIFEST.json` / `*.tmp` / `*.bak` / `*.log` / `.cache/` / `.workspacify-allocate/` / 各種 ledger / `workspace-integration-graph.json`
- 既存出力は **fresh-workspace only**: 生成対象 path が file / symlink / 非空 dir として存在すれば BLOCKED で停止し、既存内容を merge・上書き・削除しない

## 使用スクリプト

`.claude/scripts/workspacify-allocate/` 配下。

| スクリプト | 説明 |
|---|---|
| `run.mjs validate <manifest>` | 入力ロック: schema / self-hash / COMPLETE / final_audit / stage2_handoff / spec re-hash（G0/G1）。PASS/FAIL を exit code で返す |
| `run.mjs plan <manifest>` | directory plan（ancestor+leaf・leaf↔package bijection）+ path 安全性 + existing-output policy（G2） |
| `run.mjs packet <manifest> [--package=<id>]` | AI 執筆支援: package 毎の authoring packet（owned inventory・source excerpt・境界 context）を JSON 出力 |
| `run.mjs gate <manifest> --decisions=<path>` | decisions schema → 全 seed render → seed-local → seed-parity → semantic APPROVED presence（G3/G4/G5）。COMPLETE のみ exit 0 |
| `run.mjs finalize <manifest> --decisions=<path>` | 全ゲート再実行 → staging に tree+seeds → atomic publish → reload 再走査+再 parse+再 parity（G6）。成功時は tree と seed のみ公開 |
| `lib/*.mjs` | PX-189（tree-manifest-input / path-safety / directory-plan / tree-staging）、PX-190（allocation-model / seed-authoring-packet / seed-model / seed-render / seed-parse / seed-parity / seed-local-checks） |

## 状態とゲート

状態値: `PASS` / `FAIL` / `REVIEW_REQUIRED` / `BLOCKED` / `COMPLETE`

- `REVIEW_REQUIRED` は成功ではない。未解決 review が残る限り COMPLETE を出さない
- `BLOCKED`: 入力不在・不一致、path collision、既存出力衝突（fresh-workspace only）
- ゲート階層: G0 入力ロック → G2 tree plan・安全性 → G3 seed render・local → G4 seed parity → G5 AI 意味論承認 presence → G6 publish・reload。親ゲート未 PASS なら子を PASS にしない

## 設計判断と機械化の境界

- **機械(決定論)**: 入力 entry gate・spec re-hash・path 安全性・directory plan・authoring packet 生成・seed の自動 scaffolding・見出し/index parse・**seed↔manifest parity（bijection・排他）**・staging・atomic publish・reload
- **AI(意味論判断)**: 各 seed の semantic body（§4-13, §15）の執筆・境界の文言・grill question・`semantic_review.status === "APPROVED"` の記録
- 過度機械化を避ける: 機械は構造と**移転の忠実性**のみ検証し、**seed のプロース品質は評価しない**。WIC/WIG やグローバル結合グラフは実装しない（結合の正典化は directory 毎の graphify 契約 edge が担う）

## Step 1: validate(G0/G1)

**目的**: 入力 manifest と co-located 仕様書を「固定」する。schema / self-hash / COMPLETE / final_audit / stage2_handoff を検証し、manifest と同ディレクトリの仕様書を再 hash して `input.source_hash` と一致させる。ここが壊れると以後の source trace が無効になる。

```bash
node .claude/scripts/workspacify-allocate/run.mjs validate "<manifest>"
```

- **成功条件**: `{status:"PASS", workspaceRoot, sourceHash, manifestHash, gateSummary}` が出力され exit 0
- **失敗時**: 失敗 gate と理由（schema / self-hash / spec 不一致 / spec 不在）を読み、入力 manifest または co-located 仕様書を修正して再実行

## Step 2: plan(G2)

**目的**: workspace root（= manifest の親 dir）へ生成する directory 集合を決定論的に確定し、安全性と fresh-workspace 性を確認する。

```bash
node .claude/scripts/workspacify-allocate/run.mjs plan "<manifest>"
```

- **成功条件**: `{status:"PASS", plannedDirectoryCount, relativeDirs}` が出力され exit 0
- **AI の仕事**: plan の directory 集合を目視で確認し、想定外の path / 過剰な階層があれば第一段階へ戻す判断をする（本コマンドは workspace 設計を変更しない）
- **失敗時**: tree↔package 不一致・unsafe path・symlink・既存 file/symlink/非空 dir の BLOCKED 理由から原因を特定

## Step 3: authoring — packet と decisions の執筆(AI の意味論判断)

**目的**: Step 2 の plan と manifest をもとに、AI が package 毎の RFC-SEED.md 内容を**機械検証できる decisions JSON** として書き出す。機械は AI の頭の中を読めないため、seed の semantic body は必ず decisions を経由して gate に渡す。

### 3-1: authoring packet の取得

```bash
node .claude/scripts/workspacify-allocate/run.mjs packet "<manifest>"
# 特定 package のみ: --package=pkg-0001
```

packet は次を含む（AI 情報提供・機械生成）:
- package identity（id/name/path/layer/kind/seed_required）
- owned items: manifest inventory 由来の category / inventory_ref / canonical_name / source_refs / **source excerpt**（unresolvable は REVIEW_REQUIRED 表示）
- dependency context: incoming / outgoing / forbidden edges（manifest DAG のコピー）
- conformance/test 義務（test-support / conformance package）

### 3-2: decisions JSON の執筆

packet と仕様を読み、全 package（`seed_required: true`）の semantic body を decisions へ書く。

```json
{
  "seeds": [
    { "packageId": "pkg-0001", "aiSections": {
        "4": "alpha record とその valid の範囲...",
        "5": "consumer 義務...", "6": "provider 義務...",
        "7": "Integration Context (Stage-1 Manifest Edges): ...",
        "8": "not_applicable — 状態なし", "9": "not_applicable — 外部 I/O なし",
        "10": "...", "11": "...", "12": "...",
        "13": "grill question: ...", "15": "禁止依存..." } }
  ],
  "semantic_review": { "status": "APPROVED", "statement": "全 package の owner 割当・境界・過剰分割を確認した", "approver": "ai-session" }
}
```

- AI 最終承認チェックリスト（workspacify-tree Step 3 と同型。全項目を確認した場合のみ `semantic_review.status` を `APPROVED` にする）:
  - [ ] 各 seed の Allocation Index が manifest の owner 割当と一致する（機械が保証するが AI も確認）
  - [ ] semantic body が原典の MUST/MUST NOT/禁止/数式/schema/error を弱めていない
  - [ ] 他 package の semantic owner を再定義していない（依存は dependency_context/consumer_obligation として記述）
  - [ ] 不明点を TODO/TBD で放置せず §13 grill question に明記した
  - [ ] 過剰分割・不自然な境界がない（あれば第一段階へ戻す判断）
- decisions は仕様書ディレクトリ以外（例: `os.tmpdir()`）へ作成する。schema は `schemas/workspacify-allocate-decisions.schema.json` で機械検証される

## Step 4: gate ループ(G3/G4/G5)

**目的**: decisions と rendered seed が「客観ルールに適合しているか」を機械の実ゲートパイプラインで検証する。

```bash
node .claude/scripts/workspacify-allocate/run.mjs gate "<manifest>" "--decisions=<decision.json>"
```

- **成功条件**: `{status:"COMPLETE", gateSummary}` が出力され exit 0
- **ゲート内容**: decisions schema → 全 package renderSeed（§4-13/§15 body 必須・空/欠落は error）→ seed-local checks（15 見出し順・非空・index 一致・隣接 item 非 index）→ **seed↔manifest parity**（missing/extraneous/crossPackage/duplicate/unknown が 0）→ `semantic_review.status === "APPROVED"` presence
- **AI の仕事**: FAIL の原因（schema / 空 body / parity / APPROVED 未記録）に応じ decisions を修正し **exit 0 まで繰り返す**（自己修復ループ）。機械はプロース品質を評価しない

## Step 5: finalize と publish(G6)

**目的**: COMPLETE 確定後のみ、staging に tree + 全 seed を構築して **manifest の親ディレクトリへ原子公開**し、reload 検証する。

```bash
node .claude/scripts/workspacify-allocate/run.mjs finalize "<manifest>" "--decisions=<decision.json>"
```

- **実行条件**: 全ゲート PASS・semantic APPROVED のときのみ。そうでなければ COMPLETE にせず非0で終了
- **publish 手順**: `<root>/.workspacify-allocate-stage-<pid>-<rand>` に tree 構築 → verifyStaging → seed 書込 → top-level 毎 atomic rename（rollback 付き）→ staging 除去 → **reload 再走査 + 全 seed 再 parse + 再 parity** → 成功報告
- **成功時出力**: `{published:true, workspaceRoot, inputManifestHash, directoryCount, packageCount, seedCount, gateSummary}` のみ。**ALLOCATE-MANIFEST path は出力しない**
- **既存出力保護**: 生成対象 path が file/symlink/非空 dir なら BLOCKED で停止し、既存 tree を置換・破壊しない

## Step 6: 報告

- 成功時は **workspace root 絶対パス / input manifest hash / directory 数 / package 数 / seed 数 / gate summary のみ** を表示する
- 失敗時は **失敗 gate の id / 理由 / 修正すべき入力（manifest・decisions・co-located spec）** を表示する

## エラー復帰

- 失敗時は stderr の `[guide]`（原因と修正対象）を読み、入力または decisions を修正して gate を再実行する
- `REVIEW_REQUIRED` / `BLOCKED` は `COMPLETE` にならず、既存 workspace は常に保全される

## 付録A: RFC-SEED.md の必須見出しと Allocation Index 文法

`RFC-SEED.md` は package 毎に **ちょうど 1 つ** 置く。PX-190 の seed grammar に従い、以下の 15 見出しを **この順序** で持つ。各本文は非空か、`not_applicable — <理由>` の型付きで理由を添える。機械は本文を空にできない（AI が書くべき意味論を機械が捏造しないため）。

```text
# RFC Seed: <package-name>
## 1. Seed Status and Package Identity
## 2. Stage 1 Ownership and Forbidden Ownership
## 3. Allocated Specification Material        <- ここに Allocation Index 表
## 4. In-Scope Objects, Claims, Predicates, State and Invariants
## 5. Incoming Dependencies and Consumer Obligations
## 6. Outgoing Provider Obligations
## 7. Integration Context (Stage-1 Manifest Edges)
## 8. State Ownership and State-Transition Material
## 9. Side-Effect and External-I/O Boundaries
## 10. Canonicalization, Signatures and Proof Responsibilities
## 11. Failure, Rejection, Recovery and Finality Material
## 12. Required Unit, Integration, Exception and Malfeasance Test Material
## 13. Grill Questions and Explicitly Unresolved Design Choices
## 14. Source Traceability Index
## 15. Forbidden Dependencies, Non-Interference Boundaries and Non-Goals
```

§7 は **prose のみ** の「Integration Context (Stage-1 Manifest Edges)」であり、機械可読 WIC JSON block を埋め込まない（誤指示書 §10.4 は実装しない）。§3 の Allocation Index は manifest の owner 割当を機械抽出可能にする唯一の表であり、次の 3 列 Markdown 表である:

```markdown
### Allocation Index

| Category | Inventory ID | Canonical Name |
| --- | --- | --- |
| object | obj-000001 | Alpha Record |
| invariant | inv-1 | alpha-invariant |
```

機械はこの表を `seed-parse.mjs` で復元し、`seed-parity.mjs` で manifest の `workspace.ownership.entries` と **全 package 横断の bijection（欠落 0・重複 0・未知 0・他 seed への漏れ 0）** を検証する。表に載るのは自 package の所有 item のみ。他 package 所有 item は本文中に dependency_context / consumer_obligation として説明できても、**表には載せられない**。

## 付録B: decisions 入力のフィールド

`gate` / `finalize` は AI 執筆の decisions JSON を読む。schema は `schemas/workspacify-allocate-decisions.schema.json` で機械検証される。

| フィールド | 型 | 内容 |
|---|---|---|
| `seeds[].packageId` | string | package catalog の id（`seed_required: true` の全 package に 1 エントリ必須） |
| `seeds[].aiSections` | object | AI が執筆する semantic body。key は見出し番号（§4-13, §15 必須。§3 は任意の note）。欠落・空は render が error |
| `semantic_review.status` | `APPROVED`/`REVIEW_REQUIRED` | AI 意味論最終承認。`APPROVED` 以外は finalize 不可 |
| `semantic_review.statement` | string | 確認内容の要約 |
| `semantic_review.approver` | string | 判断したセッション識別子 |

## 付録C: run.mjs の出力例

```text
$ node .claude/scripts/workspacify-allocate/run.mjs validate ./WORKSPACIFY-TREE-MANIFEST.json
{"status":"PASS","workspaceRoot":"/work/specs","sourceHash":"ab12…","manifestHash":"cd34…","gateSummary":"G0:PASS G1:PASS"}

$ node .claude/scripts/workspacify-allocate/run.mjs gate ./WORKSPACIFY-TREE-MANIFEST.json --decisions=/tmp/decisions.json
{"status":"COMPLETE","gateSummary":"G0:PASS G2:PASS G3:PASS G4:PASS G5:PASS semantic:APPROVED"}

$ node .claude/scripts/workspacify-allocate/run.mjs finalize ./WORKSPACIFY-TREE-MANIFEST.json --decisions=/tmp/decisions.json
{"published":true,"workspaceRoot":"/work/specs","inputManifestHash":"cd34…","directoryCount":7,"packageCount":3,"seedCount":3,"gateSummary":"G0:PASS G2:PASS G3:PASS G4:PASS G5:PASS G6:PASS semantic:APPROVED"}
```

成功時は **workspace root 絶対パス / input manifest hash / directory 数 / package 数 / seed 数 / gate summary** のみを出力する。`WORKSPACIFY-ALLOCATE-MANIFEST.json` のパスは決して出力しない。

## 付録D: AI 意味論最終承認チェックリスト（詳細）

`semantic_review.status` を `APPROVED` にする前に、AI は **全項目** を確認する。1 つでも未達なら `APPROVED` にせず decisions を修正して gate へ戻す（未承認のまま機械は COMPLETE を出さない）。

- [ ] **owner 割当の妥当性**: 各 seed の Allocation Index が manifest の owner 割当と一致し、未割当・重複・他 seed 漏れがない（機械 parity が保証。AI も §1/§2/§3 を目視確認）
- [ ] **原典の規範の保持**: object/claim/invariant/state machine/error/required test の MUST / MUST NOT / 禁止 / 数式 / schema / error を根拠なく弱めていない（source trace を保持）
- [ ] **semantic owner の非再定義**: 他 package 所有の規範を再所有せず、依存は dependency_context / consumer_obligation として記述した
- [ ] **禁止依存・非干渉**: manifest の forbidden edge / non-goals を §15 に反映し、§7 に矛盾する結合を書いていない
- [ ] **不明点の明示**: 曖昧・未解決の設計判断を TODO/TBD で放置せず §13 Grill Questions に明記した
- [ ] **過剰分割・境界の最終判断**: 内部状態共有・中間値分割・相互依存必須・不変条件再実装の兆候があれば第一段階へ戻す判断をした

## 付録E: 第 5 層としての位置付け

conver は上流（分解）・実装（収束）・出荷・進化の 4 ループで構成される。`/workspacify-tree` + `/workspacify-allocate` は **新設の第 5 層** であり、単一の長大仕様を「workspace 分解 → 実体化」して、以後の 4 ループを **directory 単位** で回すための入口である。

- `/workspacify-tree`: 仕様を解析し workspace/package 分解を設計して `WORKSPACIFY-TREE-MANIFEST.json` を発行する（第一段階）
- `/workspacify-allocate`: その manifest を入力に実 directory tree + package 毎 RFC-SEED.md を生成する（第二段階・本コマンド）
- 以後、各 package directory の RFC-SEED.md を `/grill-me-for-rfc` の入力とし、正典 RFC → graphify → boundify → split → make/plan/start/review のループが **directory ごとに** 走る

本コマンドは grill・graphify・実装ループを起動しない。directory 毎の結合の正典化（WIC/WIG 相当）は、各 directory の graphify が契約 edge として行う仕事であり、allocate 時にグローバルな機械正本として凍結することは **しない**。

## 禁止事項

- **`WORKSPACIFY-ALLOCATE-MANIFEST.json`（または任意の第二の機械正本）を作成しない**
- **WIC/WIG/ContractEdge/proof-lifecycle/state-effects/semantic-flow グローバル機械を実装しない**（directory 毎の graphify が担う）
- **各 seed に機械可読 WIC JSON block を埋め込まない**
- hook（Claude Code / Git / shell）を使用しない
- 既存内容への merge・上書き・削除を行わない（fresh-workspace only）
- カレントディレクトリ・環境変数・branch から workspace root を推測しない
- プロース品質を機械で評価しようとしない（AI 判断の阻害を防ぐ）

## 成功の定義

成功は **① AI 意味論最終承認**（decisions の `semantic_review.status === "APPROVED"`）と **② 全機械ゲート PASS・未解決 review 0・reload 検証済み** の両立に集約される。最終確認は生成 tree の再走査と全 RFC-SEED.md の再 parse・再 parity PASS、および `WORKSPACIFY-ALLOCATE-MANIFEST.json` が存在しないこと。
