---
description: 長大な Markdown 仕様書を解析し WORKSPACIFY-TREE-MANIFEST.json を唯一の正本として発行する(第一段階)
argument-hint: <path-to-specification.md>
disable-model-invocation: true
---

# /workspacify-tree

**Role**: 単一の Markdown 仕様書を入力として、構造解析・候補収穫・workspace 設計・完全性ゲートを実行し、長大な仕様書を「安全に分割して実装可能なworkspace/crate/package構造へ設計するための第一段階」を実行する。将来の第二段階が唯一の引数として受け取れる `WORKSPACIFY-TREE-MANIFEST.json` を原子公開する。このコマンドは仕様を実装しない。設計判断は AI(=実行セッション)が行い、機械は収穫・検証・publish を担う。

## Arguments

- 第1引数(必須・唯一): 仕様書へのパス(`<path-to-specification.md>`)
  - 要件: 通常ファイル / UTF-8 復号可 / 非空 / ATX 見出しを1つ以上含む / 読取可能
  - 追加引数・対話・環境変数・hook・外部取得を要求しない

## 出力の正本と制約

- 成功時に公開する正本成果物は **1つだけ**: **カレントディレクトリ**(コマンド実行時の作業ディレクトリ)の `WORKSPACIFY-TREE-MANIFEST.json`

## 使用スクリプト

`.claude/scripts/workspacify-tree/` 配下。

| スクリプト | 説明 |
|---|---|
| `run.mjs parse <spec>` | 入力ロック/正規化/hash/見出し/segment/再構成一致(G0/G1)。PASS/FAIL を exit code で返す |
| `run.mjs extract <spec>` | object/claim に加え invariant / state machine / error code / required test を独立カテゴリとして収穫し、全候補に source traceability(G2)。候補統計を出力 |
| `run.mjs gate --spec=.. --decisions=..` | decision 入力へ **実ゲートパイプラインを実行**し per-gate 結果を返す。COMPLETE のみ exit 0 |
| `run.mjs finalize --spec=.. --decisions=..` | ownership 適用 → 全ゲート → manifest 組み立て → self-hash → カレントディレクトリへ atomic publish |
| `lib/*.mjs` | errors/fs-safe/hash/normalization/markdown/headings/segmentation/extraction/traceability/alias-normalization/decision-input/decision-apply/inventory-report/workspace-model/ownership/dag/dependencies/boundary-review/adapters/database-policy/manifest-schema/validation/entry-parity/render/atomic-publish/report |

## 状態とゲート

状態値: `PASS` / `FAIL` / `REVIEW_REQUIRED` / `BLOCKED` / `COMPLETE`

- `REVIEW_REQUIRED` は成功ではない。未解決 review が残る限り COMPLETE を出さない
- `BLOCKED`: 既存 manifest の input hash と異なる仕様書への上書きを拒否

ゲート階層: G0 入力ロック → G1 構造(見出し/segment/再構成) → G2 要件インベントリ → G3 workspace(カタログ/所有権/過剰分割) → G4 依存(DAG/層規則/循環) → G5 成果物完全性(schema/self-hash/atomic)。親ゲート未 PASS なら子を PASS にしない。

## 設計判断と機械化の境界

- **機械(決定論)**: 収穫・形式検証・所有権一意性・DAG/循環・禁止層・raw SQL・DB型漏れ・self-hash・atomic publish
- **AI(意味論判断)**: workspace ツリー設計、owner 割当、過剰分割の最終判断、adapter/DB 適用可否、reason_code 選択、禁止edge の代替経路、REVIEW_REQUIRED の承認

過度機械化を避ける: boundary-review は「リスク候補の発見」まで。抽出器は候補収穫まで。検証器は制約検査まで。

## Step 1: parse(G0/G1)

**この Step の目的**: 入力仕様書を「固定」する。読めるか / UTF-8 か / 空でないかを検査し、正規化(改行統一・末尾改行保持)と SHA-256 を確定させ、見出しツリーと `##` 単位の segment に分割した上で「segment を再結合すると元の bytes と完全一致する」ことを機械証明する。ここが壊れると以後すべての source traceability が無効になるため、最初の関門である。

```bash
node .claude/scripts/workspacify-tree/run.mjs parse "<spec>"
```

- **出力の意味**: `source_hash` = 正規化後入力全体の SHA-256(以後の entry gate が参照する不変の指紋)。`reconstruction` = segment 再構成の検証結果
- **成功条件(次の Step へ進める)**: `reconstruction.status == PASS` かつ `source_hash` が出力されている
- **失敗時**: エラー内容(存在しない / ディレクトリ / 空 / 非UTF-8 / 再構成不一致)から原因を特定し、入力仕様書を修正して再実行する

## Step 2: extract(G2)

**この Step の目的**: 固定された構造から「実装対象になり得る候補」を漏れなく収穫し、全候補に原文位置(source traceability)を付与する。収穫は決定論的パターン(テーブルの object 列 / inline code / claim コードブロック / 規範語句)で行い、invariant / error code / required test は `terms` に畳まず**独立カテゴリ**として分離する。ここで AI がレビューしなければ、後の設計で「仕様に書いてあったのに抽出漏れ」が起きる。

```bash
node .claude/scripts/workspacify-tree/run.mjs extract "<spec>"
```

- **出力の意味**: 候補統計 `harvested`(収穫数)/ `confirmed`(確定)/ `review_required`(AI 確認待ち)/ `unresolved`(未解決)
- **AI の仕事**: 収穫候補の `canonical_name / aliases / classification / source_refs` を確認し、誤収穫・曖昧候補を特定して Step 3 の `approvals` で確定/却下する。収穫器は候補を削除しない(情報を失わない)
- **成功条件**: 全候補に source_refs があり、review_required / unresolved の一覧が把握できている

## Step 3: decision JSON の執筆(AI の設計判断)

**この Step の目的**: Step 2 の候補と仕様内容をもとに、AI が「どういう workspace に分割し、誰が何を所有し、誰が誰に依存してよいか」を設計判断し、**機械が検証できる構造化された decision JSON として書き出す**。機械は AI の頭の中を読めないため、判断は必ずこのファイルを経由して gate に渡す。設計判断はここで完結させる(過度機械化しない)。

### 情報レベルを上げる反復手順(到達目標: Gaia 台帳級)

decision は一度で完成させず、**Step 4 のゲート結果を見ながら下記 ①→⑤ を順に濃化し、情報レベルを上げる**。各段階の不足は finalAudit の count が指し示す(次 Step の表参照)。

1. **候補分類の確定**: extract の REVIEW_REQUIRED / unresolved を確認し、`approvals` で確定・却下する(unknown を残さない)
2. **package 設計**: 各 package に `layer / kind / responsibilities(非空) / seed_required / owns` を与え、`tree` を leaf ディレクトリで package path と一致させる
3. **owner 割当の完全化**: object / claim に加え **invariant / state machine / error code / required test** まで一意 owner を割り当て、`unallocated == 0` を目指す
4. **依存と契約境界の全網羅**: 全 package 間の許容 edge を `reason_code` 付きで列挙し、禁止 edge には `alternative`、dev policy を明記。`contract_boundaries` の consumer/provider は必ず catalog 内
5. **approval 台帳の完備**: 判断の根拠を `approvals`(decisionId/rationale/approver)へ残し、機械検証に掛ける

仕様書ディレクトリ以外(例: `os.tmpdir()`)へ decision JSON を1ファイル作成する。スキーマは `schemas/workspacify-tree-decisions.schema.json` で機械検証される。

```json
{
  "workspace": [
    { "id": "pkg-0001", "name": "alpha-protocol", "path": "crates/protocol/alpha", "layer": "protocol", "kind": "production-library",
      "responsibilities": ["owns alpha records and their validity"],
      "seed_required": true,
      "owns": { "objects": ["obj-000001", "obj-000003"], "claims": [], "invariants": ["req-000001"], "state_machines": [], "error_codes": [], "required_tests": [] } }
  ],
  "tree": [
    { "name": "crates", "path": "crates", "kind": "dir", "children": [
        { "name": "protocol", "path": "crates/protocol", "kind": "dir", "children": [
            { "name": "alpha", "path": "crates/protocol/alpha", "kind": "dir", "children": [] } ] } ] }
  ],
  "ownership": [ { "objectId": "obj-000001", "packageId": "pkg-0001" } ],
  "dependencies": [],
  "boundaries": [],
  "adapters": { "ports": [], "databasePolicy": { "applicable": false } },
  "approvals": [ { "decisionId": "obj-000003", "rationale": "domain record; confirmed as object", "approver": "ai-session" } ]

> 複数 package の例では、全 package を `workspace`・`tree`・`ownership` へ宣言し、`dependencies` の各 edge と `boundaries` を一対一で揃えること(gate が双方向網羅を強制する)。

}
```

### 各フィールドの意味とルール

| フィールド | 内容 |
|---|---|
| `workspace` | package 配列。`id/name/path/layer/kind/responsibilities(非空)/seed_required` 必須。`owns` は objects / claims / invariants / state_machines / error_codes / required_tests を保持。layer は `foundation/protocol/ports/adapters/core/interfaces/conformance`、kind は `production-library/adapter/binary/test-support/conformance` |
| `ownership` | 候補→package の一意割当。`objectId`(候補 id または canonical_name)に `packageId`。各 object family は protocol 層のちょうど1 owner。claim の場合は同様に primary owner を割当 |
| `dependencies` | 依存 edge 配列。`from/to/reasonCode/reason`。reasonCode は REASON_CODES 列挙。禁止 edge には `alternative`(port-injection 等)を必須 |
| `tree` | ディレクトリツリー。leaf ディレクトリの path 集合は package の path 集合と一致させる(非空 workspace では必須) |
| `boundaries` | 依存 edge と一対一対応する契約境界の宣言。`consumer`/`provider` は必ず catalog 内(PX-183 以降は edge と境界の双方向網羅を gate が強制) |
| `adapters` | `ports`(port が提供する能力/実装)と `databasePolicy`(RDBMS 永続化が必要な場合のみ applicable)。domain/protocol は DB 固有型・raw SQL を参照しない |
| `approvals` | **REVIEW 承認台帳**。`decisionId`(承認する候補 id or canonical_name)/`rationale`/`approver` を必須とする。承認された REVIEW_REQUIRED 候補は CONFIRMED になり unresolved から外れる |

### 設計時の指針

- object は protocol/domain の1 owner。foundation/adapter/core/interface のみを owner にしない
- generic proof package は共通機構のみ所有し、domain claim 意味論を一括所有しない
- core は cross-domain 編成のみ。adapter は外部 I/O のみ。canonical validity を所有しない
- 過剰分割リスク(内部状態共有・中間値分割・相互依存必須・不変条件再実装・巨大 snapshot 受渡し)があれば統合を判断する
- DB 必要時: memory/SQLite/PostgreSQL/MySQL 共通 store port + SeaORM 2.x 方針。raw SQL 禁止。migration 原子性を domain 原子性にしない

## Step 4: gate ループ(G3/G4)

**この Step の目的**: Step 3 の decision(設計)が「客観ルールに適合しているか」を機械の実ゲートパイプラインで検証する。適合していなければ FAIL/REVIEW_REQUIRED の原因を突き止め、decision を修正して再検証し、**全ゲート PASS・未解決 0(COMPLETE)** に収束させる。ここが PASS しない限り publish してはならない。

```bash
node .claude/scripts/workspacify-tree/run.mjs gate "--spec=<spec>" "--decisions=<decision.json>"
```

- **出力の意味**: per-gate 結果(`G0..G5` の PASS/FAIL/REVIEW_REQUIRED)と `finalAudit`(各 count)。`COMPLETE`(exit 0)は全ゲート PASS・unresolved 0 を意味する
- **finalAudit の count と修正対象の対応表**:
  | count | 意味 | 修正対象(Step 3 手順) |
  |---|---|---|
  | `review_required_count` / `unresolved_count` | 未承認の候補 | ① approvals で確定/却下 |
  | `missing_responsibilities_count` | responsibilities 未記入 | ② package 設計 |
  | `tree_catalog_mismatch_count` | tree と catalog の path 不一致 | ② tree 修正 |
  | `unallocated_count` | owner 未割当の invariant/error/test 等 | ③ owner 割当 |
  | `uncovered_edge_count` / `orphan_boundary_count` | edge と契約境界の不整合 | ④ boundary・依存網羅 |
  | `unresolved_boundary_count` / `forbidden_dependency_count` | 境界・依存不備 | ④ boundary・依存網羅 |
  | カテゴリ owner 網羅(entry-parity) | inventory の invariant/state/error/test に owner 表行が無い | ③ owner 割当 + finalize 後の `checkTreeEntryGate` で確認 |
- **AI の仕事**: FAIL の原因(所有権重複 / 循環 / 禁止層 / raw SQL / DB 型漏れ / schema 不正 / 上表の不足)に応じ decision を修正し、**exit 0(COMPLETE)になるまで繰り返す**(自己修復ループ)。情報レベルはこの反復で gaia 台帳級へ到達させる
- **回帰確認**: decision を修正したら `run.mjs extract` と gate を再実行し、抽出結果との不整合が無いことを確認する

## Step 5: finalize と publish(G5)

**この Step の目的**: COMPLETE が確定した decision と解析結果から manifest を組み立て、正準 JSON + self-hash を計算し、**唯一の正本 `WORKSPACIFY-TREE-MANIFEST.json` をカレントディレクトリへ原子公開**する。第二段階はこのファイルだけを引数にできる。

```bash
node .claude/scripts/workspacify-tree/run.mjs finalize "--spec=<spec>" "--decisions=<decision.json>"
```

- **実行条件**: 全ゲート PASS・unresolved 0 のときのみ。そうでなければ COMPLETE にせず非0で終了
- **成功条件(到達確認)**: 生成 manifest が第二段階 ALLOCATE の entry 検査を通過すること。到達目標の具体例は `Gaia_v30_Stage1_Coverage_Ledger_Rev3.md`(workspace ツリー・唯一 owner・依存マトリクス・DAG まで完成した情報レベル)。第一段階側のパリティ検査は `checkTreeEntryGate`(lib/entry-parity.mjs)で機械確認できる(全カテゴリ owner 網羅・tree 必須・edge↔boundary 網羅を含む拡張版)。
- **出力先**: **常にカレントディレクトリ**(`--output-dir` は存在しない)
- **publish 手順**: temp 書込→fsync→再読込(schema/self-hash)→rename。temp は成功時 rename・失敗時削除・次回起動時に stale を機械スイープ
- **既存 manifest 保護**: 既存 `WORKSPACIFY-TREE-MANIFEST.json` があり input hash が異なる場合は **BLOCKED** で終了し、既存 manifest を置換・破壊しない

## Step 6: 報告

**この Step の目的**: 実行結果を人間と次工程が解釈できる最小の形で出力する。余計な情報を出さない。

- 成功時は **manifest 絶対パス / source_hash / manifest_hash / gate summary のみ** を表示する
- 失敗時は **失敗 gate の id / 理由 / 修正すべき入力・設計項目** を表示する

## エラー復帰

- 失敗時は stderr の `[guide]`(原因と修正対象)を読み、入力または decision を修正して gate を再実行する
- `REVIEW_REQUIRED` / `BLOCKED` は `COMPLETE` にならず、既存 manifest は常に保全される

## 禁止事項

禁止は「ゲートが機械強制するもの」と「Step 3 の設計時の指針」へ集約済み。AI が追加で自己判断する禁止は設けない。

## 成功の定義

全自動ゲート PASS・未解決 review 0 に集約される。最終確認は生成 manifest の再読込(schema / 必須値 / self-hash)と `checkTreeEntryGate` PASS。
