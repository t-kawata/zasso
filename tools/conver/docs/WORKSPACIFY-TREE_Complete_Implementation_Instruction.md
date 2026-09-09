# `/workspacify-tree` 完全実装指示書

## 0. 任務

あなたはClaude Code環境で、長大なMarkdown仕様書を入力として解析し、その仕様を将来安全に実装へ移すための**第一段階の構造設計・完全性検査コマンド**を実装する。

実装するスラッシュコマンド名は必ず次である。

```text
/workspacify-tree <path-to-specification.md>
```

このコマンドは**汎用**である。特定のプロジェクト、製品、組織、プロトコル、既存ディレクトリ名、固有名詞に依存してはならない。コマンド、Node.jsスクリプト、JSON schema、エラーメッセージ、ドキュメント、テストfixture、変数名、出力例に、特定プロジェクトを示す語を埋め込んではならない。

この実装の目的は、長大な仕様書を「安全に分割して実装可能なworkspace/crate/package構造へ設計する第一段階」を、AIや人間が再現可能な形で実行することである。

このコマンドは、仕様を実装しない。I/O契約、API、データベースschema、具体的なソースコード、ネットワーク実装、外部サービス統合を実装しない。これらは将来の第二段階以降の仕事である。

## 1. 最重要の入出力契約

### 1.1 入力

`/workspacify-tree`の唯一の引数は、長大なMarkdown仕様書のファイルパスである。

```text
/workspacify-tree ./path/to/specification.md
```

追加の必須引数、対話的質問、環境変数、隠れた設定ファイル、hook、外部ネットワーク取得を要求してはならない。

入力ファイルは次を満たさなければならない。

- 通常ファイルであること
- UTF-8として復号可能であること
- 空でないこと
- Markdown ATX見出しを少なくとも一つ含むこと
- 読取り可能であること

入力が不適格なら、コマンドは非0 exit codeで終了し、最終成果物を作成または更新してはならない。

### 1.2 出力

成功時に公開する正本成果物は、**必ず一つだけ**である。

```text
<specification-directory>/WORKSPACIFY-TREE-MANIFEST.json
```

例：

```text
/work/specs/architecture.md
```

を入力した場合、成功時の正本出力は必ず次である。

```text
/work/specs/WORKSPACIFY-TREE-MANIFEST.json
```

このファイルのパスは、将来の第二段階スラッシュコマンドの**唯一の引数**になる予定である。したがって、第二段階が追加ファイル、会話文脈、暗黙のプロジェクト知識、別Markdown、人間の記憶へ依存せずに開始できるだけの情報を、単一JSONに含めなければならない。

成功時も、以下のような追加の正本・中間・報告ファイルを仕様書ディレクトリに出力してはならない。

```text
*.md
*.json
*.yaml
*.yml
*.csv
*.dot
*.log
*.tmp
.cache/
.workspacify-tree/
```

標準出力への人間向け要約は許可する。ただし、機械入力として信頼される成果物は`WORKSPACIFY-TREE-MANIFEST.json`だけである。

### 1.3 hook禁止

Claude Code hook、Git hook、shell hook、pre-commit hook、post-commit hook、filesystem watcher、background daemon、外部CI hookを使用してはならない。

実装は、スラッシュコマンドが明示的に起動するNode.jsプロセスだけで完結しなければならない。

## 2. 成功の定義

`/workspacify-tree`が成功と報告してよいのは、次の全条件を満たした場合だけである。

1. 入力仕様書が固定され、正規化後の内容hashが記録されている。
2. 見出し構造が完全に解析されている。
3. 見出し境界による分割結果を再連結すると、正規化済み入力と完全一致する。
4. object/entity/message/record/certificate/operation等の候補を抽出し、全候補にsource traceabilityがある。
5. proof/claim/assertion/verification requirement等の候補を抽出し、全候補にsource traceabilityがある。
6. MUST、MUST NOT、SHALL、SHALL NOT、REQUIRED、禁止、必須、不変条件、エラー、test等の規範候補を抽出している。
7. workspace tree、package/crate catalog、責務分割、層分割が定義されている。
8. 各抽出object familyに、ちょうど一つの規範的owner packageがある。
9. 各抽出claim familyに、ちょうど一つのprimary verifier owner packageがある。
10. ownerなし、owner重複、source traceabilityなしのobject/claimが0件である。
11. package間の直接依存許可表、禁止依存表、依存理由、循環時の代替接続先がある。
12. production dependency graphがDAGである。
13. dev dependency規則が存在し、production dependencyとの混同がない。
14. adapter/infrastructure/packageとdomain/protocol/packageの責務境界が定義されている。
15. database/infrastructureが必要と判断された場合、抽象port、実装adapter、backend隔離、migration方針が定義されている。
16. すべての自動ゲートがPASSである。
17. 意味論的レビューが必要な項目は0件、または明示的に承認済みである。
18. 生成した`WORKSPACIFY-TREE-MANIFEST.json`を再読込し、JSON Schema検証、必須値検査、自己整合検査、hash検査を通過している。
19. 最終成果物をatomic publishしている。

上記の一つでも満たさない場合、`status`を`COMPLETE`にしてはならない。`WORKSPACIFY-TREE-MANIFEST.json`の既存版を上書きしてはならず、非0 exit codeで停止する。

## 3. 状態とゲート

全処理は以下の状態値だけを使用する。

```text
PASS
FAIL
REVIEW_REQUIRED
BLOCKED
COMPLETE
```

- `PASS`：自動または承認済みの検査に通過した
- `FAIL`：要件違反、データ不整合、未定義参照、循環、出力不正
- `REVIEW_REQUIRED`：自動化不能な意味論的判断が未承認
- `BLOCKED`：前提成果物または入力が不足・不一致
- `COMPLETE`：全ゲートがPASS、未解決reviewが0、最終manifest再検証済み

`REVIEW_REQUIRED`は成功ではない。未解決reviewが残る限り、`COMPLETE`を出してはならない。

### 3.1 ゲート階層

```text
G0 Input lock
  G1 Specification structure
    G1.1 Readability/encoding
    G1.2 Heading extraction
    G1.3 Segmentation/reconstruction
    G1.4 Outline completeness
  G2 Requirement inventory
    G2.1 Object/entity candidate extraction
    G2.2 Claim/proof candidate extraction
    G2.3 Normative requirement extraction
    G2.4 Invariant/error/test candidate extraction
    G2.5 Source traceability
  G3 Workspace architecture
    G3.1 Initial structure generation
    G3.2 Owner assignment
    G3.3 Orphan/collision detection
    G3.4 Over-splitting review
    G3.5 Adapter/infrastructure coverage
    G3.6 Database policy when applicable
  G4 Dependency architecture
    G4.1 Allowed direct dependencies
    G4.2 Forbidden dependencies
    G4.3 Alternative paths for forbidden edges
    G4.4 Dev/build dependency policy
    G4.5 Manifest internal-reference validation
    G4.6 DAG/layer validation
  G5 Artifact integrity
    G5.1 Canonical JSON serialization
    G5.2 Schema validation
    G5.3 Reload validation
    G5.4 Cross-artifact consistency
    G5.5 Atomic publication
    G5.6 Completion decision
```

上位ゲートは、配下の全ゲートがPASSでなければPASSにしてはならない。

### 3.2 全工程共通ゲート

各工程は、必ず以下の順序で実行する。

```text
1. Entry gate: 入力hash、前提状態、schema versionを検査
2. Parse/analyze: 決定論的な処理を実行
3. Internal gate: 重複、欠落、未知値、曖昧性を検査
4. Render: メモリ上の成果物へ反映
5. Output gate: schema/必須値/相互整合を検査
6. Transition gate: 次工程へ進める状態か検査
```

途中で失敗した場合、最終manifestを公開してはならない。

## 4. 技術制約

### 4.1 使用言語

決定論的処理、解析、正規化、ハッシュ、JSON Schema検証、グラフ検査、レンダリング、atomic publishは、**Node.jsだけ**で実装する。

Pythonを使ってはならない。

Node.jsはLTSの現行系を対象とし、ESMを使用する。全スクリプトは`.mjs`とする。TypeScriptを使う場合でも、実行時の追加transpilerに依存せず、Node.jsから再現可能に実行できる構成にする。簡潔性と再現性のため、原則はplain JavaScript ESMとする。

### 4.2 外部依存

可能な限りNode.js標準ライブラリを使う。

- `node:fs/promises`
- `node:path`
- `node:crypto`
- `node:os`
- `node:process`
- `node:url`

外部npm packageを導入する場合は、用途を限定し、lockfileで固定する。Markdown解析、JSON Schema validation、CLI argument parsingで外部packageを用いる場合も、解析不能なブラックボックス挙動へ依存してはならない。

外部ネットワーク、Web API、LLM API、クラウドサービス、GitHub API、検索APIは使用しない。入力仕様書とローカルの実装だけで完結する。

### 4.3 ハッシュと正規化

入力仕様書は以下の順に正規化する。

1. UTF-8 BOMがあれば除去する
2. `\r\n`と`\r`を`\n`へ正規化する
3. 末尾の改行は内容として保持する。勝手に付加・削除しない
4. 正規化後のUTF-8 bytesにSHA-256を適用する

BLAKE3を追加依存なしに安全実装しようとしてはならない。標準ライブラリだけで確実に実装できるSHA-256を使用する。

すべてのsource rangeは、正規化済みテキストに対する1始まりのline/columnと、0始まりのUTF-8 byte offsetを記録する。

## 5. 実装配置

このコマンドを実装するリポジトリでは、次のように配置する。ここで示すディレクトリは、対象仕様の実装workspaceではない。Claude Code commandおよびNode.js automationのための管理領域である。

```text
.claude/
  commands/
    workspacify-tree.md

scripts/
  workspacify-tree/
    run.mjs
    lib/
      errors.mjs
      fs-safe.mjs
      hash.mjs
      markdown.mjs
      headings.mjs
      segmentation.mjs
      extraction.mjs
      normalization.mjs
      workspace-model.mjs
      ownership.mjs
      boundary-review.mjs
      adapters.mjs
      database-policy.mjs
      dependencies.mjs
      dag.mjs
      manifest-schema.mjs
      validation.mjs
      render.mjs
      atomic-publish.mjs
      report.mjs

schemas/
  workspacify-tree-manifest.schema.json

test/
  workspacify-tree/
    fixtures/
    unit/
    integration/
    property/
```

ファイル名は例であり、責務が明確なら近い構造でもよい。ただし、`run.mjs`に巨大なロジックを集めてはならない。解析、抽出、所有権、依存、DAG、schema、atomic publishを別moduleに分ける。

## 6. `/workspacify-tree` スラッシュコマンド

`.claude/commands/workspacify-tree.md`を作成する。

コマンドは次を満たす。

```text
/workspacify-tree <path-to-specification.md>
```

- 引数がちょうど一つでなければ使用方法を表示して非0終了する
- pathは引用符付きでも扱える
- pathをNode.jsスクリプトへ安全に渡す
- shell interpolation、`eval`、文字列連結によるコマンド実行を使わない
- Node.jsスクリプトのexit codeをそのまま返す
- hookを登録・実行しない
- 成功時は公開された`WORKSPACIFY-TREE-MANIFEST.json`の絶対パス、source hash、manifest hash、gate summaryだけを表示する
- 失敗時は、失敗したgate ID、失敗理由、修正すべき入力/設計項目を表示する

コマンド本体はNode.js実行を行うだけに保つ。仕様解析や設計判断をコマンドMarkdown内に埋め込まない。

## 7. 仕様書解析

### 7.1 Markdown見出し解析

ATX headingを行単位で解析する。

受理対象：

```text
# heading
## heading
### heading
#### heading
##### heading
###### heading
```

次を記録する。

```json
{
  "id": "h-000123",
  "level": 3,
  "text": "Example section",
  "line_start": 123,
  "line_end": 123,
  "byte_start": 4567,
  "byte_end": 4588,
  "parent_id": "h-000100",
  "children": []
}
```

解析規則：

- code fence内の`#`を見出しとして扱わない
- 空のheadingは`FAIL`
- 見出しtextは末尾の任意のclosing `#`をMarkdown規則に従って除去する
- heading levelのジャンプは警告候補として記録する。ただし仕様書の構造上正当な場合があるため、即時FAILにするかは設定可能にする
- 同じtextの見出しが複数あってもIDは行位置由来で一意にする
- 見出しtreeに親が見つからない場合はrootへ置く

### 7.2 分割と再構成

仕様書を`##`単位でsegment化する。ただし先頭の`#`題名と、最初の`##`より前の本文を失わない。

各segmentに以下を記録する。

```json
{
  "id": "s-0007",
  "heading_id": "h-000045",
  "title": "Example chapter",
  "level": 2,
  "line_start": 500,
  "line_end": 720,
  "byte_start": 12345,
  "byte_end": 20123,
  "sha256": "...",
  "subheading_ids": ["h-000046", "h-000047"]
}
```

必須検査：

```text
- segment byte rangeが重複しない
- segment byte rangeが入力全体を漏れなく覆う
- segmentをbyte_start順に再連結したbytesが正規化済み入力bytesと完全一致する
- 再連結hashがsource_hashと一致する
```

この検査に失敗した場合は`G1.3 FAIL`で停止する。

### 7.3 規範候補の抽出

以下の語句を英語・日本語で抽出対象とする。

```text
MUST
MUST NOT
SHALL
SHALL NOT
REQUIRED
PROHIBITED
MAY
fail-closed
invariant
error code
test requirement
必須
禁止
してはならない
しなければならない
不変条件
拒否コード
エラーコード
検査対象
実装必須
```

抽出結果は、語句、節、行範囲、前後文脈、原文snippet、候補分類を持つ。自動抽出した候補を最終的な規範要件と自動断定してはならない。曖昧な候補は`REVIEW_REQUIRED`として記録する。

## 8. object/entityとclaimの抽出

### 8.1 object/entity候補

仕様書中の以下を候補として抽出する。

- Markdown table内の`object`、`object type`、`object型`、`entity`、`record`、`certificate`、`credential`、`message`、`operation`、`policy`等の列
- inline codeのPascalCase識別子
- inline codeのsnake_case識別子
- canonical schema見出し周辺の識別子
- 種類一覧、列挙、データモデル、状態機械、エラーコード参照に現れる識別子

各候補は次を持つ。

```json
{
  "id": "obj-000123",
  "canonical_name": "ExampleRecord",
  "aliases": ["example_record"],
  "classification": "object|certificate|credential|policy|operation|record|unknown",
  "source_refs": [
    {
      "section_id": "h-000100",
      "line_start": 100,
      "line_end": 104,
      "byte_start": 1000,
      "byte_end": 1080,
      "snippet": "..."
    }
  ],
  "normalization_status": "CONFIRMED|REVIEW_REQUIRED",
  "owner_package": null
}
```

抽出器は候補を出すだけでよい。候補を削除して情報を失ってはならない。候補の統合はaliasとして追跡可能にする。

### 8.2 claim/proof候補

以下を対象に抽出する。

- `claim`、`proof`、`assertion`、`verification`、`validity`、`eligibility`等の明示列挙
- snake_caseのclaim識別子
- StateProofEnvelope等のproof containerに列挙された値
- verifier、predicate、acceptance conditionに現れる名前

各claim候補はcanonical name、source refs、primary owner、collaborating owners、review statusを持つ。

### 8.3 抽出の完了条件

object/claim抽出を完了とするには、少なくとも以下を満たす。

```text
- 全候補にsource_refsが1件以上ある
- canonical_nameが空でない
- 同じcanonical_nameが重複していない
- aliasの循環がない
- objectとclaimの同名衝突が明示的に分類されている
- unknown分類が0、または全件承認済みである
```

## 9. workspace architectureの生成とレビュー

### 9.1 層

生成するworkspace modelは、少なくとも次の抽象層を扱える必要がある。

```text
foundation
protocol/domain
ports
adapters/infrastructure
core/composition
interfaces
conformance
```

特定の言語・build toolに縛られない内部モデルを先に持ち、その後にRust workspace/crateというrenderingを行う。今回の実装ではRustを主対象にしてよいが、モデル自体はpackage architectureとして表現する。

### 9.2 package/crate catalog

全packageには以下を持たせる。

```json
{
  "id": "pkg-0012",
  "name": "example-package",
  "path": "crates/protocol/example-package",
  "layer": "protocol",
  "kind": "production-library|adapter|binary|test-support|conformance",
  "responsibilities": ["..."],
  "owns": {
    "objects": ["obj-0001"],
    "claims": ["claim-0001"],
    "invariants": [],
    "state_machines": []
  },
  "platform_constraints": [],
  "external_implementations": [],
  "status": "CONFIRMED|REVIEW_REQUIRED"
}
```

### 9.3 owner assignment

必須規則：

```text
- 各object familyはちょうど一つのprotocol/domain owner packageを持つ
- 各claim familyはちょうど一つのprimary verifier owner packageを持つ
- foundationだけ、adapterだけ、coreだけ、interfaceだけをownerとするobjectは禁止
- generic proof packageはproof containerの共通機構を所有できるが、domain claimの意味論を一括所有してはならない
- core packageはcross-domain operationを編成できるが、domain validatorを再実装してはならない
- adapter packageは外部I/Oを実装できるが、canonical domain validityを所有してはならない
```

自動検査：

```text
orphan_object_count == 0
orphan_claim_count == 0
owner_collision_count == 0
invalid_owner_layer_count == 0
```

### 9.4 過剰分割レビュー

次の条件を満たすpackage候補は、別packageではなく内部moduleへの統合候補として`REVIEW_REQUIRED`にする。

- 互いに同期的な内部状態を常に必要とする
- 一つの決定論的関数の入力・中間値・出力を分けて所有する
- 相互に直接依存しなければ妥当性判定できない
- 同じ不変条件を双方が再実装する
- 安定したI/Oではなく巨大な全状態snapshotを渡す必要がある
- 独立したversioning、test、implementationができない

ただし、以下は統合しない。

- cryptographic primitiveとdomain crypto usage
- encrypted contentとaccess authorization
- external payment railとpayment semantics
- settlementとpayout entitlement
- rights validityとpost-sale royalty settlement
- pure session semanticsとtransport adapter
- advisory/recommendationとnormative validity

自動化は「リスク候補の発見」までに留める。統合・分割の最終判断はreview decisionを必要とする。

## 10. adapterとdatabase方針

### 10.1 port/adapter境界

外部I/Oが必要な場合、domain/protocol packageは具体的DB、OS API、HTTP framework、payment SDK、identity vendor SDK、network libraryを直接参照してはならない。port packageが抽象を所有し、adapter packageが実装する。

少なくとも以下の能力を表現できるようにする。

```text
state/object/content storage
network transport / relay
key storage
payment rail
identity/credential service
clock
randomness
notification
observation/telemetry
```

### 10.2 database

仕様または入力設計がRDBMS永続化を必要とする場合、次を明示する。

- memory reference implementation
- SQLite adapter
- PostgreSQL adapter
- MySQL adapter
- 共通store Traitを所有するport package
- 4実装が同一black-box conformance suiteを通すこと
- domain/core/interfaceがDB固有型を参照しないこと

RDBMS adapterではSeaORM 2.xを使用する方針を記録する。初回基準versionはSeaORM 2.0.0と対応するmigration crate 2.0.0とする。ただし、manifestには「version policy」として記録し、実装段階でlockfileにより再現可能に固定する。

禁止：

```text
raw SQL text
Statement::from_string
execute_unprepared
driver-specific SQL fragments
stored procedures
```

許可：

```text
SeaORM entity
SeaORM ActiveModel
SeaORM typed query builder
sea-orm-migration
SeaQuery typed schema builder
```

migrationのbackend別DDL原子性を、domain/protocol operationのatomicityの根拠にしてはならない。migration失敗時はfail-closed起動停止とし、具体的な復旧I/O契約は第二段階へ引き渡す。

## 11. dependency matrix

### 11.1 直接依存許可

すべてのpackageについて、normal production dependencyを完全列挙する。未記載の直接依存は不許可である。

各edgeは以下を持つ。

```json
{
  "from": "consumer-package",
  "to": "dependency-package",
  "kind": "normal",
  "reason_code": "checkpoint-reference",
  "reason": "短く具体的な説明"
}
```

`reason_code`は自由文だけにせず、列挙として管理する。

例：

```text
canonical-value
canonical-object
cryptographic-verification
time-semantics
money-semantics
merkle-proof
checkpoint-reference
authority-binding
identity-lifecycle
forum-structure
trust-evaluation
credential-validation
asset-lifecycle
commercial-rights
payment-settlement
payout-entitlement
content-cryptography
access-authorization
publication-discovery
resource-input
operation-envelope
port-contract
adapter-implementation
composition
presentation
conformance
```

### 11.2 明示的禁止依存

次を少なくとも禁止する。

```text
foundation -> protocol/ports/adapters/core/interfaces/conformance
protocol -> ports/adapters/core/interfaces/conformance
ports -> adapters/core/interfaces
core -> adapters
interfaces -> protocol/ports/adapters
production -> conformance
```

さらに、設計上循環しやすい個別edgeを禁止する。各禁止edgeには理由と正規の代替経路を必須にする。

```json
{
  "from": "package-a",
  "to": "package-b",
  "reason": "would-create-domain-cycle",
  "alternative": {
    "kind": "proof-reference|immutable-input|operation-composition|port-injection|event-reference",
    "description": "具体的な代替経路"
  }
}
```

### 11.3 dev dependency

dev dependencyをnormal dependencyと同一視してはならない。

最低限の規則：

- testkitはfixture/generator/property testに限りdev dependencyとして許可
- conformance packageは全package/adapterを検査できるtest sink
- production packageはconformance packageに依存しない
- testkit型をproduction public APIに露出しない
- adapter integration testだけにadapter横断dev dependencyを許可

### 11.4 DAG

dependency graphの向きは必ず次で統一する。

```text
consumer -> direct dependency
```

検査器は以下を検出する。

```text
unknown package reference
self-loop
duplicate edge
undeclared normal dependency
forbidden edge
layer violation
cycle
normal/dev/build dependency kind mismatch
```

DAG検査はKahn algorithmまたはDFS color markingで実装する。cycleがあれば明示的なcycle pathを報告する。

## 12. WORKSPACIFY-TREE-MANIFEST.json

最終manifestはcanonical JSONとして生成する。

### 12.1 canonical JSON規則

- UTF-8
- LF改行
- 2 space indentation
- object keyは辞書順
- 配列は、意味論的順序があるものは仕様順、ないものはstable canonical key順
- trailing whitespaceなし
- 末尾に1個のLF
- JSON numberはfinite integerまたは仕様で必要な有限numberだけ
- 日時はUTC ISO 8601 `YYYY-MM-DDTHH:mm:ss.sssZ`
- hashはlowercase hex

### 12.2 必須トップレベル構造

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "artifact_kind": "workspacify-tree-manifest",
  "schema_version": "1.0.0",
  "status": "COMPLETE",
  "run": {},
  "input": {},
  "structure": {},
  "inventory": {},
  "requirements": {},
  "workspace": {},
  "adapters": {},
  "dependencies": {},
  "conformance": {},
  "stage2_handoff": {},
  "gates": {},
  "final_audit": {},
  "integrity": {}
}
```

### 12.3 必須フィールド

#### `run`

```json
{
  "run_id": "content-addressed-or-uuid",
  "generated_at": "UTC timestamp",
  "generator": {
    "command": "/workspacify-tree",
    "generator_version": "semver",
    "node_version": "process.version"
  }
}
```

#### `input`

```json
{
  "spec_path": "relative path from manifest directory",
  "source_encoding": "UTF-8",
  "newline_normalization": "LF",
  "hash_algorithm": "SHA-256",
  "source_hash": "lowercase hex",
  "source_bytes": 0,
  "source_characters": 0,
  "source_lines": 0,
  "title": "optional extracted title",
  "version_hint": "optional extracted version"
}
```

#### `structure`

```json
{
  "heading_count": 0,
  "segment_level": 2,
  "segment_count": 0,
  "headings": [],
  "segments": [],
  "reconstruction": {
    "status": "PASS",
    "reconstructed_hash": "...",
    "exact_match": true
  }
}
```

#### `inventory`

```json
{
  "objects": [],
  "claims": [],
  "terms": [],
  "normalization_decisions": [],
  "unresolved_candidates": []
}
```

#### `requirements`

```json
{
  "normative_candidates": [],
  "invariants": [],
  "error_codes": [],
  "required_tests": [],
  "source_traceability_complete": true
}
```

#### `workspace`

```json
{
  "tree": [],
  "packages": [],
  "ownership": {
    "object_owners": [],
    "claim_primary_owners": [],
    "invariant_owners": []
  },
  "boundary_reviews": []
}
```

#### `adapters`

```json
{
  "ports": [],
  "leaf_packages": [],
  "database_policy": {
    "applicable": true,
    "common_store_port": "...",
    "implementations": [],
    "orm_policy": {},
    "raw_sql_prohibited": true,
    "migration_policy": {}
  }
}
```

#### `dependencies`

```json
{
  "orientation": "consumer_to_direct_dependency",
  "normal_edges": [],
  "forbidden_layer_rules": [],
  "forbidden_edges": [],
  "dev_dependency_policy": [],
  "dag_report": {
    "node_count": 0,
    "edge_count": 0,
    "unknown_dependency_count": 0,
    "self_loop_count": 0,
    "duplicate_edge_count": 0,
    "forbidden_edge_count": 0,
    "layer_violation_count": 0,
    "cycle_count": 0,
    "topological_order": []
  }
}
```

#### `conformance`

```json
{
  "object_test_owners": [],
  "claim_test_owners": [],
  "invariant_test_owners": [],
  "backend_test_matrix": [],
  "interface_equivalence_test_matrix": [],
  "ci_rules": []
}
```

#### `stage2_handoff`

第二段階が必要とする情報を全てここに入れる。

```json
{
  "eligible": true,
  "entry_gate": {
    "required_status": "COMPLETE",
    "source_hash_must_match": true,
    "unresolved_count_must_be": 0,
    "review_required_count_must_be": 0,
    "cycle_count_must_be": 0
  },
  "contract_definition_order": [],
  "contract_boundaries": [],
  "non_goals_of_stage1": [
    "No trait method signatures are defined",
    "No concrete I/O contract is defined",
    "No protocol implementation is defined"
  ]
}
```

`contract_boundaries`は少なくとも次を含む。

```json
{
  "id": "boundary-001",
  "consumer_package": "...",
  "provider_package": "...",
  "dependency_reason_code": "...",
  "stage2_contract_scope": [
    "input",
    "output",
    "preconditions",
    "postconditions",
    "invariants",
    "errors",
    "state_ownership",
    "side_effect_ownership",
    "idempotency",
    "atomicity",
    "ordering",
    "finality",
    "canonicalization",
    "signature",
    "proof_verification",
    "tests"
  ]
}
```

#### `gates`と`final_audit`

全gate recordを保存する。`final_audit`は集計値を持つ。

```json
{
  "status": "PASS",
  "orphan_object_count": 0,
  "orphan_claim_count": 0,
  "owner_collision_count": 0,
  "unknown_dependency_count": 0,
  "forbidden_dependency_count": 0,
  "layer_violation_count": 0,
  "cycle_count": 0,
  "review_required_count": 0,
  "unresolved_count": 0
}
```

#### `integrity`

自己検証可能にする。

```json
{
  "canonicalization": "workspacify-tree-json-v1",
  "manifest_hash_algorithm": "SHA-256",
  "manifest_hash": "...",
  "input_hash_verified_at_finalize": true,
  "reload_validation": "PASS"
}
```

自己hashは、`integrity.manifest_hash`を空文字列としてcanonical serializationしたbytesのSHA-256と定義する。検証時も同じ方式を使う。

## 13. 最終処理

### 13.1 atomic publish

最終manifestの公開は以下の順で行う。

```text
1. 全解析・全gateをメモリ上で完了する
2. manifest_hashを空文字列としてcanonical JSONを作る
3. SHA-256を計算しintegrity.manifest_hashへ入れる
4. canonical JSONを再生成する
5. 同一ディレクトリ内の一意なtemporary fileへ書く
6. fsync相当の同期を可能な範囲で行う
7. temporary fileを再読込する
8. JSON parse、schema validation、必須値検証、self-hash検証を行う
9. 既存WORKSPACIFY-TREE-MANIFEST.jsonがあれば、その存在を検査ログへ記録するが、失敗時は置換しない
10. 全てPASSならrenameでWORKSPACIFY-TREE-MANIFEST.jsonへatomic publishする
11. 公開後の最終パスを再読込し、再度hashとschemaを検査する
```

temp fileは失敗時に削除する。既存の成功済みmanifestを壊してはならない。

### 13.2 既存manifestの扱い

既存の`WORKSPACIFY-TREE-MANIFEST.json`がある場合：

- 新しい入力仕様の正規化hashが同じなら、再生成してもよいがrevision historyをmanifestに残す
- hashが異なるなら、仕様が変更されている。前回成果物の上書きは許可しない
- hashが異なる場合は`BLOCKED`で終了し、明示的な将来の更新モードを別コマンドとして設計するまで既存manifestを保持する

初期実装では更新モードを作らない。安全側に倒し、異なる仕様書に対する上書きを拒否する。

## 14. テスト要件

実装そのものはTDDで行う。Red → Green → Refactorの順を守る。スタブだけでtestを通すことは禁止する。

### 14.1 unit tests

最低限以下をunit testする。

- UTF-8/BOM/newline正規化
- SHA-256計算
- ATX heading解析
- code fence内のheading無視
- heading tree構築
- segment byte range
- segment再連結完全一致
- object候補抽出
- claim候補抽出
- alias正規化とcollision検出
- ownerの一意性検査
- source traceability検査
- layer rule検査
- unknown/self/duplicate dependency検査
- DAG検査
- cycle path表示
- canonical JSON serialization
- manifest self-hash検証
- schema validation
- atomic publish失敗時の既存成果物保全

### 14.2 integration tests

fixtureとして少なくとも以下を用意する。

1. 小規模だが正しい仕様書
2. 長大な複数章仕様書
3. code fenceに`#`を含む仕様書
4. 同名headingを含む仕様書
5. object候補がtableと本文に重複する仕様書
6. claim候補がcode blockに列挙される仕様書
7. ownerなしobjectを含む入力
8. claim owner collisionを含む入力
9. dependency cycleを含むarchitecture model
10. forbidden layer edgeを含むarchitecture model
11. DB backend混入を含むarchitecture model
12.未解決reviewを含む入力
13. 出力先に旧manifestがあり、新入力hashが異なるケース
14. temp write失敗ケース
15. final manifestの改竄検出ケース

### 14.3 property tests

外部ライブラリを使わずに実装可能な範囲で、ランダム生成または系統的生成により以下を検査する。

- 任意の有向非巡回グラフがtopological orderを持つ
- cycleを加えると検出される
- segment化後の再連結が任意の入力で元の正規化textと一致する
- canonical JSONの再serializeがidempotentである
- manifest hash検証が1byte改竄を検出する

### 14.4 acceptance tests

最終acceptance testは、実際の長大な仕様書pathを入力として次を確認する。

```text
/workspacify-tree <spec.md>
exit code == 0
WORKSPACIFY-TREE-MANIFEST.json exists
manifest.status == COMPLETE
manifest.final_audit.status == PASS
manifest.final_audit.*_count == 0
manifest.dependencies.dag_report.cycle_count == 0
manifest.integrity.reload_validation == PASS
hash(spec) == manifest.input.source_hash
```

## 15. 実装の禁止事項

以下は禁止する。

- hookの使用
- Pythonの使用
- 外部API、ネットワーク、LLM API、Web検索の使用
- 入力仕様書以外を必須入力にすること
- 成功時に正本成果物を複数出力すること
- 仕様書ディレクトリへ中間ファイルを残すこと
- 最終manifestを再読込検証せず成功報告すること
- `REVIEW_REQUIRED`や`BLOCKED`を`PASS`扱いすること
- unknown object/claim/edgeを黙って捨てること
- ownerなしobject/claimを黙って補完すること
- 依存理由なしのedgeを許可すること
- 代替経路なしの重要禁止edgeを残すこと
- core packageへdomain ruleを押し込むこと
- adapter packageへcanonical domain validatorを押し込むこと
- domain/protocol packageへDB、OS、HTTP、payment、identity、network実装を侵入させること
- database固有型をcore/interfaceへ漏らすこと
- raw SQLを許可すること
- migration原子性をdomain operation原子性の代替にすること
- interfaceごとに別のdomain ruleを実装すること
- advisory出力をnormative validityの入力にすること

## 16. 完了報告形式

実装完了後、報告は次だけを明確に示す。

1. `/workspacify-tree`を実装したこと
2. Node.jsスクリプト群、JSON Schema、テストを実装したこと
3. hookを使用していないこと
4. 入力がMarkdown path一つだけであること
5. 成功時の唯一の正本成果物が`WORKSPACIFY-TREE-MANIFEST.json`であること
6. 代表fixtureと長大仕様fixtureで実行したテスト結果
7. manifest生成後のreloading/schema/self-hash検査結果
8. 失敗時に既存manifestを破壊しないこと
9. 将来の第二段階が`WORKSPACIFY-TREE-MANIFEST.json`のパス一つだけを引数に受けられること

「実装したはず」「おそらく動く」「手動で確認すればよい」という報告は禁止する。コマンド実行、test結果、生成manifestの再読込検証を実際に行った結果だけを報告する。

## 17. 最終チェックリスト

実装完了を宣言する前に、以下を全て満たしていることを確認する。

```text
[ ] /workspacify-tree <spec.md> の引数は一つだけ
[ ] hookを使っていない
[ ] 決定論的処理はNode.jsのみ
[ ] 外部ネットワーク/APIを使っていない
[ ] 成功時の正本出力はWORKSPACIFY-TREE-MANIFEST.json一つだけ
[ ] manifestは第二段階の唯一の入力として十分な情報を含む
[ ] source path/hash/encoding/newline ruleを記録する
[ ] heading treeを記録する
[ ] segment再連結一致を検査する
[ ] object/entity候補とsource traceabilityを記録する
[ ] claim/proof候補とsource traceabilityを記録する
[ ] 規範候補、不変条件、エラー、test候補を記録する
[ ] package treeとpackage catalogを記録する
[ ] object ownerとclaim primary ownerの一意性を検査する
[ ] adapter/port/database方針を記録する
[ ] memory/SQLite/PostgreSQL/MySQL共通store方針を記録する
[ ] SeaORM 2.xと生SQL禁止方針を記録する
[ ] 依存許可表を記録する
[ ] 禁止依存表を記録する
[ ] dev dependency規則を記録する
[ ] 禁止edgeの代替接続先を記録する
[ ] DAG検査を実装する
[ ] cycle/unknown/self/duplicate/layer violationを検査する
[ ] CI検査規則をmanifestに記録する
[ ] JSON Schemaを実装する
[ ] manifest self-hashを実装する
[ ] atomic publishを実装する
[ ] 生成後のmanifestを再読込して検査する
[ ] 既存manifestを失敗時に破壊しない
[ ] unit/integration/property/acceptance testがある
[ ] REVIEW_REQUIREDが残る場合はCOMPLETEにしない
[ ] stage2_handoffが存在する
[ ] contract_boundariesとcontract_definition_orderが存在する
```

この指示書の目的は、長大な仕様書の第一段階解析を「AIの一回限りの印象的な回答」ではなく、入力hash、構造解析、完全性ゲート、所有権、依存DAG、manifest再検証に支えられた再現可能な工程に変えることである。
