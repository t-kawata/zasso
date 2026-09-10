---
description: 長大な Markdown 仕様書を解析し WORKSPACIFY-TREE-MANIFEST.json を唯一の正本として発行する(第一段階)
argument-hint: <path-to-specification.md>
disable-model-invocation: true
---

# /workspacify-tree

**Role**: 単一の Markdown 仕様書を入力として、構造解析・候補収穫・workspace 設計・完全性ゲートを実行し、長大な仕様書を「安全に分割して実装可能なworkspace/crate/package構造へ設計するための第一段階」を実行する。将来の第二段階が唯一の引数として受け取れる `WORKSPACIFY-TREE-MANIFEST.json` を公開する。このコマンドは仕様を実装しない。設計判断は AI(=実行セッション)が行い、機械は収穫・検証・publish を担う。

## Language Protocol

| Context | Language | Reason |
|---------|----------|--------|
| Chat, proposals, explanations | **Japanese** | Japanese is mandatory **ONLY** when addressing the user directly. |
| Code comments | **English** | Must be written in the language AI understands most reliably. |
| Design docs, plans, tasks | **English** | Must be written in the language AI understands most reliably. |
| Runtime logs (`log::info!`, etc.) | **English** | International debugging environment and searchability |
| Everything else, i.e. any context where you are not speaking to the user | **English** | Must be written in the language AI understands most reliably. |

## Arguments

- 第1引数(必須・唯一): 仕様書へのパス(`<path-to-specification.md>`)
  - 要件: 通常ファイル / UTF-8 復号可 / 非空 / ATX 見出しを1つ以上含む / 読取可能
  - 追加引数・対話・環境変数・hook・外部取得を要求しない
  - 引数以外の自由入力があった場合には、それを追加情報として扱う

## 出力の正本と制約

- 成功時に公開する正本成果物は **1つだけ**: **カレントディレクトリ**(コマンド実行時の作業ディレクトリ)の `WORKSPACIFY-TREE-MANIFEST.json`

## 使用スクリプト

`.claude/scripts/workspacify-tree/` 配下。

| スクリプト | 説明 |
|---|---|
| `run.mjs parse <spec>` | 入力ロック/正規化/hash/見出し/segment/再構成一致(G0/G1)。PASS/FAIL を exit code で返す |
| `run.mjs extract <spec>` | object/claim に加え invariant / state machine / error code / required test を独立カテゴリとして収穫し、全候補に source traceability(G2)。候補統計を出力 |
| `run.mjs gate --spec=.. --decisions=..` | decision 入力へ **実ゲートパイプラインを実行**し per-gate 結果を返す。COMPLETE のみ exit 0 |
| `run.mjs finalize --spec=.. --decisions=..` | ownership 適用 → 全ゲート → manifest 組み立て → self-hash → カレントディレクトリへ publish |

## 状態とゲート

状態値: `PASS` / `FAIL` / `REVIEW_REQUIRED` / `BLOCKED` / `COMPLETE`

- `REVIEW_REQUIRED` は成功ではない。未解決 review が残る限り COMPLETE を出さない
- `BLOCKED`: 既存 manifest の input hash と異なる仕様書への上書きを拒否

ゲート階層: G0 入力ロック → G1 構造(見出し/segment/再構成) → G2 要件インベントリ → G3 workspace(カタログ/所有権/過剰分割/責務必須) → G4 依存(DAG/層規則/循環/**実装順序の証明**) → G5 成果物完全性(schema/self-hash)。親ゲート未 PASS なら子を PASS にしない。

## 設計判断と機械化の境界

- **機械(決定論)**: 収穫・形式検証・所有権一意性・DAG/循環・禁止層・raw SQL・DB型漏れ・self-hash
- **AI(意味論判断)**: workspace ツリー設計、owner 割当、過剰分割の最終判断、adapter/DB 適用可否、reasonCode 選択、禁止edge の代替経路、REVIEW_REQUIRED の承認

過度機械化を避ける: boundary-review は「リスク候補の発見」まで。抽出器は候補収穫まで。検証器は制約検査まで。

## 第二段階(ALLOCATE)への引渡し契約

第一段階の出力は、第二段階が機械検証だけで結合契約の充足を判定できる材料でなければならない。

- **証明して渡す**: 依存先の実装順序、boundary ごとの clause 群（事前条件・事後条件・不変条件を含む）、segment とそこが運ぶ material、package の責務、契約 item の順。いずれも決定論的に再計算できなければならない（同じ仕様書と decision から同じ manifest）。
- **禁止**: 検証を通らない manifest を publish してはならない。未検証の順序・clause・segment 参照を書くだけで渡してはならない。
- **二重ゲート**: finalize は publish の直前に第二段階の entry gate を権威として呼び、受理されない manifest は G5 で停止する。stage-1 と stage-2 の検査は同一の述語であり、片側だけの抜け道は存在しない。
- **失敗時は助言に従う**: どのゲートも失敗時に「何が問題か・なぜ重要か・どう直すか」を出力する。。

## Step 1: parse(G0/G1)

**この Step の目的**: 入力仕様書を「固定」する。読めるか / UTF-8 か / 空でないかを検査し、正規化(改行統一・末尾改行保持)と SHA-256 を確定させ、見出しツリーと `##` 単位の segment に分割した上で「segment を再結合すると元の bytes と完全一致する」ことを機械証明する。ここが壊れると以後すべての source traceability が無効になるため、最初の関門である。

```bash
node .claude/scripts/workspacify-tree/run.mjs parse "$ARGUMENTS"
```

- **出力の意味**: `source_hash` = 正規化後入力全体の SHA-256(以後の entry gate が参照する不変の指紋)。`reconstruction` = segment 再構成の検証結果
- **成功条件(次の Step へ進める)**: `reconstruction.status == PASS` かつ `source_hash` が出力されている
- **失敗時**: エラー内容(存在しない / ディレクトリ / 空 / 非UTF-8 / 再構成不一致)から原因を特定し、入力仕様書を修正して再実行する

## Step 2: extract(G2)

**この Step の目的**: 固定された構造から「実装対象になり得る候補」を漏れなく収穫し、全候補に原文位置(source traceability)を付与する。収穫は決定論的パターン(テーブルの object 列 / inline code / claim コードブロック / 規範語句)で行い、invariant / error code / required test は `terms` に畳まず**独立カテゴリ**として分離する。ここで AI がレビューしなければ、後の設計で「仕様に書いてあったのに抽出漏れ」が起きる。

```bash
node .claude/scripts/workspacify-tree/run.mjs extract "$ARGUMENTS"
```

- **出力の意味**: 候補統計 `harvested`(収穫数)/ `confirmed`(確定)/ `review_required`(AI 確認待ち)/ `unresolved`(未解決)に加え、`spec_pulse`(仕様書観察の候補。`candidate_ids` と各候補の `kind` / `chapter_ref` / `observation` / `evidence_refs`)。Step 3 で settle すべき候補はここで読める
- **AI の仕事**: 収穫候補の `canonical_name / aliases / classification / source_refs` を確認し、誤収穫・曖昧候補を特定して Step 3 の `approvals` で確定/却下する。収穫器は候補を削除しない(情報を失わない)
- **成功条件**: 全候補に source_refs があり、review_required / unresolved の一覧が把握できている

## Step 3: decision JSON の執筆(AI の設計判断)

**この Step の目的**: Step 2 の候補と仕様内容をもとに、AI が「どういう workspace に分割し、誰が何を所有し、誰が誰に依存してよいか」を設計判断し、**機械が検証できる構造化された decision JSON として書き出す**。機械は AI の頭の中を読めないため、判断は必ずこのファイルを経由して gate に渡す。設計判断はここで完結させる(過度機械化しない)。

### 情報レベルを上げる反復手順

decision は一度で完成させず、**Step 4 のゲート結果を見ながら下記 ①→⑦ を順に濃化し、情報レベルを上げる**。各段階の不足は finalAudit の count が指し示す(次 Step の表参照)。

1. **候補分類の確定**: extract の REVIEW_REQUIRED / unresolved を確認し、`approvals` で確定・却下する(unknown を残さない)
2. **package 設計**: 各 package に `layer / kind / responsibilities(非空) / seed_required / owns` を与え、`tree` を leaf ディレクトリで package path と一致させる
3. **owner 割当の完全化**: object / claim に加え **invariant / state machine / error code / required test** まで一意 owner を割り当て、`unallocated == 0` を目指す。**`owns` に載せた object / claim は `ownership` にも必ず1件ずつ登録する**(片側だけの宣言は G3 が拒否し、`final_audit.ownership_disagreement_count` に件数が出る。かつては `owns` が欠落を覆い隠し、owner の無い item が PASS で publish されていた)
4. **依存と契約境界の全網羅**: 全 package 間の許容 edge を `reasonCode` 付きで列挙し、禁止 edge には `alternative`、dev policy を明記。`boundaries`(decisions の key。manifest では `stage2_handoff.contract_boundaries` として公開される)の consumer/provider は必ず catalog 内。機械は宣言したグラフを敵対的に読み、`dependency_reviews` として観察(不要な直列化 / 禁止 edge の代替経路 / 分離不能な相互依存 / 過大な被依存)を返す。**全候補に自分で decision を記録する**(`keep` / `replace_with_port` / `merge` / `split` / `residual`)。`residual` は判断を放棄するのではなく「公開したグラフを既定として残し、後日の per-directory grill に問いを引き渡す」という決定である
5. **仕様書観察の settle**: 機械は仕様書そのものも敵対的に読み `structure.spec_pulse` として観察を返す(抽出漏れ / 孤立した章 / 過大な章 / 規範記述の薄い章 / 表記の揺れ / 表と散文の食い違い / 未定義参照)。**全候補を自分で settle する**: `spec_defects`(`candidate_id` / `ai_interpretation` / `chosen_default` / `rationale`)で解釈を確定するか、解けないものを `residual_questions`(`candidate_id` / `topic` / `alternatives`(非空) / `chosen_default` / `why_unresolved`)として後日の per-directory grill へ引き渡す。未 settle の候補が1つでもあれば G3 が停止する。自由記述に `TODO` / `TBD` / `ask the human` / `waiting for approval` / `human review required` / `confirm with the operator` を書くことは禁止(人間への差し戻しの表明であり、機械が拒否する)。解けない問いは residual として後日の grill へ引き渡す
6. **approval 台帳の完備**: 判断の根拠を `approvals`(decisionId/rationale/approver)へ残し、機械検証に掛ける
7. **AI 意味論最終承認**: 下記「AI 最終承認チェックリスト」の全項目を AI が確認し、`semantic_review` へ `{ status: "APPROVED", statement, approver }` を記録する。1つでも未達なら APPROVED にせず gate へ戻して再設計する(AI 判断の記録が無い限り機械は COMPLETE を出さない)

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
  "approvals": [ { "decisionId": "obj-000003", "rationale": "domain record; confirmed as object", "approver": "ai-session" } ],
  "semantic_review": { "status": "APPROVED", "statement": "alpha protocol owns obj-000001/obj-000003 and invariant req-000001; no DB persistence; not over-split.", "approver": "ai-session" }
}
```

> 複数 package の例では、全 package を `workspace`・`tree`・`ownership` へ宣言し、`dependencies` の各 edge と `boundaries` を一対一で揃えること(gate が双方向網羅を強制する)。

### 各フィールドの意味とルール

| フィールド | 内容 |
|---|---|
| `workspace` | package 配列。`id/name/path/layer/kind/responsibilities(非空)/seed_required` 必須。`owns` は objects / claims / invariants / state_machines / error_codes / required_tests を保持。layer は `foundation/protocol/ports/adapters/core/interfaces/conformance`、kind は `production-library/adapter/binary/test-support/conformance` |
| `ownership` | 候補→package の一意割当。`objectId`(候補 id または canonical_name)に `packageId`。各 object family は protocol 層のちょうど1 owner。claim の場合は同様に primary owner を割当 |
| `dependencies` | 依存 edge 配列。`from/to/reasonCode/reason`。**キーは `reasonCode`**(`reason_code` は機械が読まない別のキーであり、G4 が未知キーとして拒否する)。reasonCode は `.claude/scripts/workspacify-tree/lib/dependencies.mjs` の `REASON_CODES`(canonical-value / merkle-proof / payment-settlement など 26 語)から選ぶ — 語彙外の値は G4 が拒否する。禁止 edge (`kind: "forbidden"`) には `alternative`(port-injection 等)を必須とし、**同じ pair を normal と forbidden の両方で宣言すると G4 が pair を名指しして拒否する** |
| `tree` | ディレクトリツリー。leaf ディレクトリの path 集合は package の path 集合と一致させる(非空 workspace では必須) |
| `boundaries` | 依存 edge と一対一対応する契約境界の宣言。`consumer`/`provider` は必ず catalog 内。edge と境界の双方向網羅は gate が強制する(片側だけの宣言は通らない) |
| `adapters` | `ports`(port が提供する能力/実装)と `databasePolicy`(RDBMS 永続化が必要な場合のみ applicable)。domain/protocol は DB 固有型・raw SQL を参照しない |
| `dependency_reviews` | 依存レビューへの回答。`candidate_id` / `decision`(`keep` / `replace_with_port` / `merge` / `split` / `residual`)/ `rationale` / `alternatives(非空)` 必須。`residual` は `why_unresolved` も必須。`replace_with_port` は該当 edge・boundary を削除した上で記録する(宣言が残ったままでは G3 が拒否する)。全候補を自分で決め切ること。人間への差し戻しは禁止 |
| `approvals` | **REVIEW 承認台帳**。`decisionId`(承認する候補 id or canonical_name)/`rationale`/`approver` を必須とする。承認された REVIEW_REQUIRED 候補は CONFIRMED になり unresolved から外れる |
| `semantic_review` | **AI 最終承認台帳(非決定論)**。`{ status: "APPROVED", statement, approver }`。下記「AI 最終承認チェックリスト」の全項目を AI が確認した場合のみ `APPROVED` にする。欠落・未承認は G2/G3 が REVIEW_REQUIRED を返し COMPLETE を出さない |

### 設計時の指針

- object は protocol/domain の1 owner。foundation/adapter/core/interface のみを owner にしない
- generic proof package は共通機構のみ所有し、domain claim 意味論を一括所有しない
- core は cross-domain 編成のみ。adapter は外部 I/O のみ。canonical validity を所有しない
- 過剰分割リスク(内部状態共有・中間値分割・相互依存必須・不変条件再実装・巨大 snapshot 受渡し)があれば統合を判断する
- DB 必要時: memory/SQLite/PostgreSQL/MySQL 共通 store port + SeaORM 2.x 方針。raw SQL 禁止。migration 原子性を domain 原子性にしない

### AI 最終承認チェックリスト(非決定論・機械は APPROVED の存在のみ強制)

**このチェックリストの目的**: Step 4 の gate が検証するのは客観ルールのみであり、意味論的正しさ(この owner 割当は本当に妥当か、この依存理由は正しいか)は AI にしか判断できない。finalize の前に AI は下記の**全項目**を確認し、すべて満たす場合のみ `semantic_review.status` を `APPROVED` にする。1つでも未達なら `APPROVED` にせず、decision を修正して gate へ戻す(未承認のままでは機械が COMPLETE を出さない)。

- [ ] **owner 割当の妥当性**: object / claim / invariant / state machine / error code / required test の各 owner が package の `responsibilities` と整合し、`unallocated == 0` である
- [ ] **reasonCode の正当性**: 全依存 edge の `reasonCode` が実在し、edge の理由と一致する。禁止 edge には代替経路(port-injection 等)が明記されている
- [ ] **adapter・DB 適用可否**: adapter は外部 I/O のみ。RDBMS 永続化が必要な場合のみ `databasePolicy.applicable` とし、raw SQL 不使用・DB 固有型が domain/protocol へ漏れないことを確認する
- [ ] **過剰分割の最終判断**: 内部状態共有・中間値分割・相互依存必須・不変条件再実装・巨大 snapshot 受渡しの兆候が無いか確認し、必要なら package を統合する
- [ ] **境界の catalog 内整合**: 宣言した全 `boundaries` の `consumer` / `provider` が workspace の package catalog に存在する
- [ ] **依存証明の妥当性**: `implementation_order` が全 edge で provider を consumer より先の level に置き、`contract_definition_order` は契約 item の順である(両者を混同していない)。`dependencies.dag` の `cycle_count` は 0 である

全項目を確認したら、decision の `semantic_review` へ記録する: `{ "status": "APPROVED", "statement": "<確認内容の要約>", "approver": "<セッション識別子>" }`。`statement` には確認した項目を要約し、`approver` には判断したセッションを明記する。

## Step 4: gate ループ(G3/G4)

**この Step の目的**: Step 3 の decision(設計)が「客観ルールに適合しているか」を機械の実ゲートパイプラインで検証する。適合していなければ FAIL/REVIEW_REQUIRED の原因を突き止め、decision を修正して再検証し、**全ゲート PASS・未解決 0(COMPLETE)** に収束させる。ここが PASS しない限り publish してはならない。なお、意味論的正しさの最終判断(`semantic_review.status === "APPROVED"`)が記録されていない decision も G2/G3 が REVIEW_REQUIRED を返し COMPLETE にしない。

```bash
node .claude/scripts/workspacify-tree/run.mjs gate "--spec=$ARGUMENTS" "--decisions=<decision.json>"
```

- **出力の意味**: per-gate 結果(`G0..G5` の PASS/FAIL/REVIEW_REQUIRED)と `finalAudit`(各 count)。`COMPLETE`(exit 0)は全ゲート PASS・unresolved 0 を意味する
- **`finalAudit` の count と修正対象の対応表**(stdout に出る `finalAudit` の値のみ):
  | count | 意味 | 修正対象(Step 3 手順) |
  |---|---|---|
  | `review_required_count` / `unresolved_count` | 未承認の候補 | ① approvals で確定/却下 |
  | `spec_defect_count` / `residual_question_count` | 仕様書観察が未 settle | ⑤ spec_defects / residual_questions |
  | `dependency_review_count` / `unresolved_review_count` | 依存レビューが未回答 | ④ dependency_reviews |
  | `missing_responsibilities_count` | responsibilities 未記入 | ② package 設計 |
  | `unallocated_count` | owner 未割当の invariant/error/test 等 | ③ owner 割当 |
  | `ownership_disagreement_count` | `owns` と `ownership` が片側だけの item | ③ owner 割当(両方に登録する) |
  | `orphan_object_count` / `orphan_claim_count` / `owner_collision_count` | owner の欠落・重複 | ③ owner 割当 |
  | `unknown_dependency_count` / `layer_violation_count` / `cycle_count` | 依存の不備・循環 | ④ boundary・依存網羅 |
  | `forbidden_dependency_count` | 禁止 edge が宣言されている | ④ 禁止 edge の `alternative` |
  | `raw_sql_count` / `db_type_leak_count` | adapter/DB 方針違反 | adapters・databasePolicy |
  | `status` | `semantic_review.status` が APPROVED でない / 記録が無い | ⑦ AI 意味論最終承認: チェックリスト全項目を確認し `semantic_review` へ APPROVED を記録 |
- **表に無い原因は gate の理由文に出る**: tree↔catalog の path 不一致、edge と契約境界の不整合、カテゴリ owner 表の欠落は、失敗時に guide が `reasons` として文章で列挙する(per-gate の内訳 count は stdout に出ない)ので、その文面から該当 Step を判断する
- **AI の仕事**: FAIL の原因(所有権重複 / 循環 / 禁止層 / raw SQL / DB 型漏れ / schema 不正 / 上表の不足)に応じ decision を修正し、**exit 0(COMPLETE)になるまで繰り返す**(自己修復ループ)。到達水準はこの doc が列挙する ①〜⑦ がすべて埋まることである
- **回帰確認**: decision を修正したら `run.mjs extract` と gate を再実行し、抽出結果との不整合が無いことを確認する

## Step 5: finalize と publish(G5)

**この Step の目的**: COMPLETE が確定した decision と解析結果から manifest を組み立て、正準 JSON + self-hash を計算し、**唯一の正本 `WORKSPACIFY-TREE-MANIFEST.json` をカレントディレクトリへ原子公開**する。第二段階はこのファイルだけを引数にできる。

```bash
node .claude/scripts/workspacify-tree/run.mjs finalize "--spec=$ARGUMENTS" "--decisions=<decision.json>"
```

- **実行条件**: 全ゲート PASS・unresolved 0 のときのみ。そうでなければ COMPLETE にせず非0で終了
- **成功条件(到達確認)**: 生成 manifest が第二段階 ALLOCATE の entry 検査を通過すること。情報レベルは「workspace ツリー・唯一 owner・依存マトリクス・DAG・実装順序がすべて完成している」ことである。この最終検査は finalize が publish 直前に自分で実行する(第二段階と同じ述語。別途コマンドを打つ必要はない)
- **出力先**: **常にカレントディレクトリ**
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

成功は **① AI 意味論最終承認**(`semantic_review.status === "APPROVED"` を decision へ記録)と **② 全機械ゲート PASS・未解決 review 0** の両立に集約される。機械ゲートのみ・AI 承認のみの片落ちは成功ではない。最終確認は生成 manifest の再読込(schema / 必須値 / self-hash)、`semantic_review` 記録の存在、そして第二段階 entry gate の受理(finalize が publish 直前に自分で実行する)である。
