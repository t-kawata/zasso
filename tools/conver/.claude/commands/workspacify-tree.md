---
description: 長大な Markdown 仕様書を解析し WORKSPACIFY-TREE-MANIFEST.json を唯一の正本として発行する(第一段階)
argument-hint: <path-to-specification.md>
disable-model-invocation: true
---

# /workspacify-tree

**Role**: 単一の Markdown 仕様書を入力として、構造解析・候補収穫・workspace 設計・完全性ゲートを実行し、将来の第二段階が唯一の引数として受け取れる `WORKSPACIFY-TREE-MANIFEST.json` を原子公開する。このコマンドは仕様を実装しない(§0)。設計判断は AI(=実行セッション)が行い、機械は収穫・検証・publish を担う。

## 言語方針

- 本ファイルは **日本語を正文** とし、日本語で実装・点検済みとする
- **英語への翻訳・製本は、ユーザーの明示的な指示があるまで行わない**(English translation only after an explicit user instruction)

## Arguments

- 第1引数(必須・唯一): 仕様書へのパス(`<path-to-specification.md>`)
  - 要件: 通常ファイル / UTF-8 復号可 / 非空 / ATX 見出しを1つ以上含む / 読取可能(§1.1)
  - 追加引数・対話・環境変数・hook・外部取得を要求しない

## 出力の正本と制約(§1.2/§1.3)

- 成功時に公開する正本成果物は **1つだけ**: **カレントディレクトリ**(コマンド実行時の作業ディレクトリ)の `WORKSPACIFY-TREE-MANIFEST.json`。`--output-dir` を明示した場合のみそこへ出力する
- 仕様書ディレクトリおよびカレントディレクトリへ、最終成果物以外の中間・報告ファイル(`*.md / *.json / *.tmp / .cache/` 等)を残さない。decision 等の作業ファイルは `os.tmpdir()` 配下へ置く
- hook は使用しない。Node.js プロセス(`run.mjs`)だけで完結する

## 使用スクリプト

`.claude/scripts/workspacify-tree/` 配下。

| スクリプト | 説明 |
|---|---|
| `run.mjs parse <spec>` | 入力ロック/正規化/hash/見出し/segment/再構成一致(G0/G1)。PASS/FAIL を exit code で返す |
| `run.mjs extract <spec>` | object/claim/規範/要件候補の収穫と source traceability(G2)。候補統計を出力 |
| `run.mjs gate --spec=.. --decisions=..` | decision 入力へ **実ゲートパイプラインを実行**し per-gate 結果を返す。COMPLETE のみ exit 0 |
| `run.mjs finalize --spec=.. --decisions=.. [--output-dir=..]` | ownership 適用 → 全ゲート → manifest 組み立て → self-hash → atomic publish |
| `lib/*.mjs` | errors/fs-safe/hash/normalization/markdown/headings/segmentation/extraction/traceability/alias-normalization/workspace-model/ownership/dag/dependencies/boundary-review/adapters/database-policy/manifest-schema/decision-input/decision-apply/validation/render/atomic-publish/report |

## 状態とゲート(§3)

状態値: `PASS` / `FAIL` / `REVIEW_REQUIRED` / `BLOCKED` / `COMPLETE`

- `REVIEW_REQUIRED` は成功ではない。未解決 review が残る限り COMPLETE を出さない
- `BLOCKED`: 既存 manifest の input hash と異なる仕様書への上書きを拒否(§13.2)

ゲート階層(§3.1): G0 入力ロック → G1 構造(見出し/segment/再構成) → G2 要件インベントリ → G3 workspace(カタログ/所有権/過剰分割) → G4 依存(DAG/層規則/循環) → G5 成果物完全性(schema/self-hash/atomic)。親ゲート未 PASS なら子を PASS にしない。

## 設計判断と機械化の境界

- **機械(決定論)**: 収穫・形式検証・所有権一意性・DAG/循環・禁止層・raw SQL・DB型漏れ・self-hash・atomic publish
- **AI(意味論判断)**: workspace ツリー設計、owner 割当、過剰分割の最終判断、adapter/DB 適用可否、reason_code 選択、禁止edge の代替経路、REVIEW_REQUIRED の承認

過度機械化を避ける: boundary-review は「リスク候補の発見」まで。抽出器は候補収穫まで。検証器は制約検査まで。

## Step 1: parse(G0/G1)

```bash
node .claude/scripts/workspacify-tree/run.mjs parse "<spec>"
```

- `reconstruction.status == PASS` かつ `source_hash` が出力されることを確認する
- FAIL 時はエラー内容(存在しない/ディレクトリ/空/非UTF-8/再構成不一致)を読み、入力仕様書を修正して再実行

## Step 2: extract(G2)

```bash
node .claude/scripts/workspacify-tree/run.mjs extract "<spec>"
```

- 出力された候補統計(harvested/confirmed/review_required/unresolved)を確認する
- AI は収穫候補(canonical_name/aliases/classification/source_refs)をレビューし、誤収穫・曖昧候補を特定する。収穫器は候補を削除しない

## Step 3: decision JSON の執筆(AI の設計判断)

仕様書ディレクトリ以外(例: `os.tmpdir()`)へ decision JSON を1ファイル作成する。スキーマは `schemas/workspacify-tree-decisions.schema.json` で機械検証される。

```json
{
  "workspace": [
    { "id": "pkg-0001", "name": "alpha-protocol", "path": "crates/protocol/alpha", "layer": "protocol", "kind": "production-library",
      "owns": { "objects": ["obj-000001", "obj-000003"], "claims": [] } }
  ],
  "ownership": [ { "objectId": "obj-000001", "packageId": "pkg-0001" } ],
  "dependencies": [],
  "adapters": { "ports": [], "databasePolicy": { "applicable": false, "raw_sql_prohibited": true } },
  "approvals": [ { "decisionId": "obj-000003", "rationale": "domain record; confirmed as object", "approver": "ai-session" } ]
}
```

### 各フィールドの意味とルール

| フィールド | 内容 |
|---|---|
| `workspace` | package 配列。`id/name/path/layer/kind` 必須。layer は `foundation/protocol/ports/adapters/core/interfaces/conformance`、kind は `production-library/adapter/binary/test-support/conformance` |
| `ownership` | 候補→package の一意割当。`objectId`(候補 id または canonical_name)に `packageId`。各 object family は protocol 層のちょうど1 owner(§9.3)。claim の場合は同様に primary owner を割当 |
| `dependencies` | 依存 edge 配列。`from/to/reasonCode/reason`。reasonCode は REASON_CODES 列挙。禁止 edge には `alternative`(port-injection 等)を必須(§11) |
| `adapters` | `ports`(port が提供する能力/実装)と `databasePolicy`(RDBMS 永続化が必要な場合のみ applicable)。domain/protocol は DB 固有型・raw SQL を参照しない(§10) |
| `approvals` | **REVIEW 承認台帳**。`decisionId`(承認する候補 id or canonical_name)/`rationale`/`approver` を必須とする。承認された REVIEW_REQUIRED 候補は CONFIRMED になり unresolved から外れる |

### 設計時の指針

- object は protocol/domain の1 owner。foundation/adapter/core/interface のみを owner にしない
- generic proof package は共通機構のみ所有し、domain claim 意味論を一括所有しない
- core は cross-domain 編成のみ。adapter は外部 I/O のみ。canonical validity を所有しない
- 過剰分割リスク(内部状態共有・中間値分割・相互依存必須・不変条件再実装・巨大 snapshot 受渡し)があれば統合を判断する
- DB 必要時: memory/SQLite/PostgreSQL/MySQL 共通 store port + SeaORM 2.x 方針。raw SQL 禁止。migration 原子性を domain 原子性にしない

## Step 4: gate ループ(G3/G4)

```bash
node .claude/scripts/workspacify-tree/run.mjs gate "--spec=<spec>" "--decisions=<decision.json>"
```

- 出力の per-gate 結果と `finalAudit` を読み、FAIL/REVIEW_REQUIRED の gate を特定する
- FAIL の原因(所有権重複/循環/禁止層/raw SQL/DB 型漏れ/schema 不正)に応じ decision を修正し、**gate が exit 0(COMPLETE)になるまで繰り返す**(自己修復ループ)
- 修正後は必ず `run.mjs extract` と gate を再実行し、回帰がないことを確認する

## Step 5: finalize と publish(G5/§13)

```bash
node .claude/scripts/workspacify-tree/run.mjs finalize "--spec=<spec>" "--decisions=<decision.json>"
```

- 全ゲート PASS・unresolved 0 のときのみ、manifest を canonical JSON 化し `integrity.manifest_hash` を計算して atomic publish する
- 出力先は既定で **カレントディレクトリ**(`--output-dir` で上書き可)
- publish は temp 書込→fsync→再読込(schema/self-hash)→rename の順(§13.1)
- 既存 `WORKSPACIFY-TREE-MANIFEST.json` があり input hash が異なる場合は **BLOCKED** で終了し、既存 manifest を置換・破壊しない(§13.2)

## Step 6: 報告

- 成功時は **manifest 絶対パス / source_hash / manifest_hash / gate summary のみ** を表示する
- 失敗時は **失敗 gate の id / 理由 / 修正すべき入力・設計項目** を表示する

## エラー復帰

- 各 Step でエラーが出たら、スクリプトが出力するメッセージ(原因と修正方法)に従い入力または decision を修正して再実行する
- `REVIEW_REQUIRED` / `BLOCKED` は `PASS` 扱いしない。未解決 review が残る限り COMPLETE を出さない
- 既存の成功済み manifest を壊してはならない

## 禁止事項(§15)

hook 使用 / Python / 外部 API・ネットワーク / 仕様書以外の必須入力 / 成功時の複数正本出力 / 仕様書ディレクトリへの中間ファイル残置 / REVIEW_REQUIRED や BLOCKED の PASS 扱い / unknown object・claim・edge の黙殺 / owner なし候補の黙殺 / 依存理由なし edge / 代替経路なし禁止 edge / core への domain rule 押し込み / adapter への canonical validator 押し込み / domain への DB・HTTP・payment 実装侵入 / DB 固有型の core 漏れ / raw SQL / migration 原子性の domain 原子性代替。

## 成功の定義(§2/§17)

入力 hash 記録 / 見出し完全解析 / segment 再構成完全一致 / 全候補に source traceability / 規範候補抽出 / workspace・package カタログ定義 / 各 object・claim がちょうど1 owner / owner なし・重複・traceability なし0件 / 依存許可・禁止・理由・代替 / DAG / dev 規則 / adapter・DB 方針 / 全自動ゲート PASS / 意味論レビュー残0 / manifest 再読込で schema・必須値・自己整合・hash 検証 PASS / atomic publish。
