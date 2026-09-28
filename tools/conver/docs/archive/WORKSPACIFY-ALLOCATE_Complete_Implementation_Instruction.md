# `/workspacify-allocate` 完全実装指示書

## 0. 任務

あなたは Claude Code 環境で、第一段階 `/workspacify-tree` が公開した単一の `WORKSPACIFY-TREE-MANIFEST.json` を入力として読み取り、将来安全に実装へ移すための**第二段階の配賦・結合完全性検査コマンド**を実装する。

実装するスラッシュコマンド名は必ず次である。

```text
/workspacify-allocate <path-to-WORKSPACIFY-TREE-MANIFEST.json>
```

このコマンドは**汎用**である。特定のプロジェクト、製品、組織、プロトコル、業界、既存workspace名、crate名、package名、固有object名、固有サービス名に依存してはならない。コマンド、Node.jsスクリプト、JSON Schema、エラーメッセージ、ドキュメント、テストfixture、変数名、出力例、policy名に、特定プロジェクトを示す語を埋め込んではならない。

このコマンドは、第一段階manifestに定義されたworkspace/package/directory treeを安全に生成し、各package directoryへ一つずつ **RFC seed** を配置する。RFC seedは完成済みの正典RFCではない。後続の対話的設計工程（例: grill）が、各packageの正典RFCを作成するための種である。

ただし、RFC seedは単なる仕様書引用集、章番号一覧、要約、抜粋、TODOメモであってはならない。各seedは、当該packageが第一段階で所有すると定められた規範的意味論、関連source trace、隣接packageとの結合、値・object・proof・状態遷移・副作用境界・失敗規則・試験義務を、後続の正典RFC作成に十分な濃度で保持しなければならない。

このコマンドは、最終的な実装コード、I/O trait、API、データベースschema、外部サービス統合、ネットワーク実装を実装しない。それらはRFC seedから後続工程で作られる正典RFCとチケットに基づく仕事である。

このコマンドの最重要任務は、単にseedを出力することではない。全seedに埋め込まれた機械可読な結合契約を抽出し、全体の **Workspace Integration Graph** を構築・解析して、結合の矛盾、衝突、禁止経路、責務空白、proof lifecycle断裂、状態mutation競合、external side effect競合、test obligation欠落を検出することである。

> 全directoryのRFC seedが揃う前に、結合関連の最終検査をPASS又はCOMPLETEとしてはならない。全seedを横断したWorkspace Integration Graphが、manifest由来のDAG、owner、dependency policy、contract policy、non-interference policyと整合し、すべての必須ゲートを通過した場合だけ、`/workspacify-allocate`は成功を報告してよい。

---

## 1. 最重要の入出力契約

### 1.1 入力

`/workspacify-allocate`の唯一の引数は、第一段階が公開したmanifestのファイルパスである。

```text
/workspacify-allocate ./path/to/WORKSPACIFY-TREE-MANIFEST.json
```

追加の必須引数、対話的質問、環境変数、隠れた設定ファイル、hook、外部ネットワーク取得、外部API、別Markdown、人間の会話記憶を要求してはならない。

入力manifestは次を満たさなければならない。

- 通常ファイルであること
- UTF-8として復号可能であること
- 空でないこと
- JSONとしてparseできること
- 第一段階のmanifest schemaに適合すること
- `artifact_kind == "workspacify-tree-manifest"`であること
- `status == "COMPLETE"`であること
- `final_audit.status == "PASS"`であること
- 未解決、review required、orphan object、orphan claim、owner collision、unknown dependency、forbidden dependency、layer violation、cycleが0件であること
- `stage2_handoff.eligible == true`であること
- manifest self-hashが正しいこと
- 記録された仕様書pathが存在し、入力仕様書を正規化して再hashした値が`input.source_hash`と一致すること
- `workspace.tree`、`workspace.packages`、`workspace.ownership`、`dependencies`、`stage2_handoff.contract_boundaries`、`stage2_handoff.contract_definition_order`が存在し、自己整合していること

入力が不適格なら、コマンドは非0 exit codeで終了し、workspace tree、RFC seed、最終allocation manifestのいずれも作成または更新してはならない。

### 1.2 workspace rootの決定

workspace rootは、入力manifestの`workspace.root_path`又は同等のschema必須fieldから決定する。第一段階manifestがworkspace rootを相対pathで記録する場合、その基準点はmanifestの親directoryとする。

以下は禁止する。

- workspace rootをカレントディレクトリから暗黙に推測すること
- 引数、環境変数、ユーザー名、Git branch、既存directory名から別rootを推測すること
- manifestにないpathを生成対象にすること
- workspace root外へpath traversalすること
- symbolic link経由でworkspace root外の場所に書くこと

### 1.3 出力

成功時に公開する第二段階の最終正本成果物は、必ず一つだけである。

```text
<workspace-root>/WORKSPACIFY-ALLOCATE-MANIFEST.json
```

加えて、各package directoryには、packageごとにちょうど一つのRFC seedを配置する。

```text
<workspace-root>/<package-path>/RFC-SEED.md
```

例：

```text
manifest.workspace.root_path = "../generated-workspace"
package.path = "packages/domain/example"
```

の場合、配置されるseedは必ず次である。

```text
<resolved-workspace-root>/packages/domain/example/RFC-SEED.md
```

`WORKSPACIFY-ALLOCATE-MANIFEST.json` は、全seedのpath、hash、source coverage、WIC抽出結果、Workspace Integration Graph、全gate結果、tree生成結果、input tree manifest hash、completion decisionを含む唯一の機械的最終正本である。

package-localな`RFC-SEED.md`は、後続の人間・AIが読む入力である。packageごとに別の機械正本、別のreport、別のcache、別のledger、別のJSONを置いてはならない。seed内に必要な機械可読情報は、後述する規定のJSON code blockとして埋め込む。

成功時も、workspace root又はpackage directoryに、以下のような追加の正本・中間・報告ファイルを残してはならない。

```text
*.tmp
*.bak
*.partial
*.log
.cache/
.workspacify-allocate/
allocation-ledger.json
contract-ledger.json
workspace-integration-graph.json
seed-manifest.json
```

中間データ、ledger、抽出contract集合、graph、report、staging treeは、OSの一時directory又はprocess固有の安全な一時領域にだけ作成し、成功時には削除する。最終manifestは必要な要約・hash・gate record・contract graph情報を内包する。

標準出力への人間向け要約は許可する。ただし、機械入力として信頼される第二段階成果物は`WORKSPACIFY-ALLOCATE-MANIFEST.json`だけである。

### 1.4 atomicityと既存workspaceの保全

このコマンドはdirectory treeと多数のseedを生成するため、失敗時の部分出力を厳格に防がなければならない。

原則は以下である。

```text
1. 全解析、全allocation、全seed render、全局所gate、全体WIG gateをメモリ及び一時領域で完了する
2. workspace rootの既存状態をpreflightで検査する
3. 既存の成功済みWORKSPACIFY-ALLOCATE-MANIFEST.jsonがある場合、そのinput tree manifest hashを検査する
4. 入力tree manifest hashが異なる場合、更新モード未実装の初期版ではBLOCKEDで停止する
5. 生成対象pathが既存の非空directory、通常ファイル、symbolic link、又は期待外のentryと衝突する場合、BLOCKEDで停止する
6. 全gate PASS後に限り、同一filesystem上のstaging rootで生成したtreeを安全にpublishする
7. publish中に失敗した場合、既存の成功済みworkspaceを復元又は未変更に保つ
8. publish後に全seedと最終manifestを再読込し、hash・schema・tree整合を再検証する
```

初期実装では、既存package directory内に任意のファイルがある場合、黙ってmerge又は上書きしてはならない。安全側に倒し、明示的な将来の更新モードが設計されるまで`BLOCKED`で停止する。

### 1.5 hook禁止

Claude Code hook、Git hook、shell hook、pre-commit hook、post-commit hook、filesystem watcher、background daemon、外部CI hookを使用してはならない。

実装は、スラッシュコマンドが明示的に起動するNode.jsプロセスだけで完結しなければならない。

---

## 2. 成功の定義

`/workspacify-allocate`が成功と報告してよいのは、次の全条件を満たした場合だけである。

1. 入力tree manifestが固定され、schema、self-hash、status、Stage 2 handoff、source hashが再検証されている。
2. manifestが定義するworkspace rootと全package pathが安全であり、path traversal、absolute path escape、symbolic link escape、collisionがない。
3. manifestのworkspace treeを再現するdirectory treeが一括生成されている。
4. manifestに列挙された全packageに、ちょうど一つの`RFC-SEED.md`が配置されている。
5. seedがないpackage、packageに対応しないseed、重複seed、manifest外pathへのseedが0件である。
6. 第一段階manifestのinventoryにある全object、claim、normative candidate、invariant、error、required test及びsource traceが、allocationとして少なくとも一つのseedへ配賦されている。
7. 規範的意味論を持つobject family、claim family、invariant、state machineについて、第一段階で決まった唯一ownerに反するsemantic owner配賦がない。
8. 各seedが、owner material、dependency context、consumer obligation、composition obligation、test obligationを区別している。
9. 各seedに機械可読なWorkspace Integration Contract（WIC）が存在し、schemaに適合する。
10. 各WICが、相手package、方向、値・object・proof・状態遷移・副作用境界・失敗・testを、必要な範囲で構造化している。
11. 全seedからWICを完全抽出できる。
12. seedから抽出した全WICによりWorkspace Integration Graph（WIG）を構築できる。
13. WIGが、第一段階manifestのdependency DAG、allowed/forbidden edge、package layer、owner policy、contract boundaryと整合する。
14. WIGにunknown package、self-loop、duplicate contract ID、reverse edge、undeclared edge、forbidden edge、layer violation、cycleがない。
15. WIGにobject/schema/validator/claim verifier/state-machine owner collisionがない。
16. WIGにproof lifecycleの断裂、proof verifier欠落、proof binding/freshness/revocation責務空白がない。
17. WIGにcanonical stateの複数直接mutation、矛盾するtransition、idempotency scope競合、必要ordering/finality欠落がない。
18. WIGにexternal side effectの複数開始者競合、adapterによる規範判断、callback bypass、retry/recovery責務空白がない。
19. manifestが定義するnon-interference / forbidden semantic-flow policyに違反する到達可能経路がない。
20. 全ContractEdgeにunit、integration、exception、malfeasanceのtest obligationがあり、source・契約条項・失敗規則へtraceできる。
21. 全自動gateがPASSである。
22. 意味論的reviewが必要な項目は0件、又は第一段階manifestが明示的に承認済みとして渡したものだけである。
23. 生成した`WORKSPACIFY-ALLOCATE-MANIFEST.json`を再読込し、JSON Schema検証、必須値検査、self-hash検証、seed hash検証、tree再走査、WIC再抽出、WIG再構築を通過している。
24. 全出力をatomic publishしている。

上記の一つでも満たさない場合、`status`を`COMPLETE`にしてはならない。既存の成功済み`WORKSPACIFY-ALLOCATE-MANIFEST.json`、既存workspace tree、既存RFC seedを上書き又は破壊してはならず、非0 exit codeで停止する。

---

## 3. 状態とゲート

全処理は以下の状態値だけを使用する。

```text
PASS
FAIL
REVIEW_REQUIRED
BLOCKED
COMPLETE
```

- `PASS`：自動検査、又は第一段階で承認済みの事項の検査に通過した
- `FAIL`：schema違反、coverage欠落、owner衝突、結合矛盾、禁止経路、cycle、出力不正
- `REVIEW_REQUIRED`：入力manifestが明示する未承認の意味論的判断、又はallocationが安全に自動決定できない事項
- `BLOCKED`：入力不在・不一致、manifest未完成、path collision、既存出力衝突、前提gate不足
- `COMPLETE`：全gateがPASS、未解決reviewが0、最終manifest再検証済み、atomic publish済み

`REVIEW_REQUIRED`は成功ではない。未解決reviewが残る限り、`COMPLETE`を出してはならない。

### 3.1 ゲート階層

```text
G0 Entry and environment lock
  G0.1 Single-argument validation
  G0.2 Input manifest readability and schema
  G0.3 Tree manifest self-hash and source-hash revalidation
  G0.4 COMPLETE / final-audit / stage2-handoff eligibility
  G0.5 Workspace-root and output-path safety
  G0.6 Existing-output collision policy

G1 Stage 2 input inventory and allocation basis
  G1.1 Source trace inventory completeness
  G1.2 Object / claim / requirement / invariant / error / test inventory validation
  G1.3 Package catalog and owner-map validation
  G1.4 Contract-boundary and contract-definition-order validation
  G1.5 Requirement-to-package allocation coverage basis

G2 Workspace tree generation
  G2.1 Deterministic package-path plan
  G2.2 Path containment and symlink safety
  G2.3 Directory tree staging generation
  G2.4 Tree reconstruction and catalog equivalence
  G2.5 Package-to-seed cardinality plan

G3 RFC seed allocation and local validation
  G3.1 Normative material allocation
  G3.2 Unique semantic-owner preservation
  G3.3 Dependency-context and consumer-obligation allocation
  G3.4 Composition-obligation allocation
  G3.5 Source traceability and coverage
  G3.6 Seed required-section validation
  G3.7 Local dependency and forbidden-owner validation
  G3.8 Local WIC schema validation

G4 ContractEdge and bilateral boundary validation
  G4.1 ContractEdge completeness
  G4.2 Consumer/provider direction validation
  G4.3 Owner / state / side-effect responsibility validation
  G4.4 Object / value / canonicalization / signature validation
  G4.5 Proof / transition / effect boundary validation
  G4.6 Bilateral seed symmetry validation
  G4.7 Test-obligation validation

G5 Workspace Integration Graph validation
  G5.1 WIC extraction completeness
  G5.2 Contract identity and manifest equivalence
  G5.3 Directed dependency / layer / DAG validation
  G5.4 Object/schema/validator/claim-owner collision validation
  G5.5 Proof lifecycle closure validation
  G5.6 State ownership / transition / idempotency conflict validation
  G5.7 Side effect / port / adapter / callback validation
  G5.8 Forbidden semantic-flow and non-interference validation
  G5.9 Cross-seed test closure validation

G6 Artifact integrity and publication
  G6.1 Canonical seed rendering and seed hash validation
  G6.2 Final manifest canonical JSON and self-hash
  G6.3 Reload validation
  G6.4 Tree rescan and exact output-set validation
  G6.5 WIC re-extraction and WIG rebuild equivalence
  G6.6 Atomic publication
  G6.7 Completion decision
```

上位gateは、配下の全gateがPASSでなければPASSにしてはならない。

### 3.2 全工程共通ゲート

各工程は、必ず以下の順序で実行する。

```text
1. Entry gate: 入力hash、前提状態、schema version、前段gateを検査
2. Parse/analyze: 決定論的処理を実行する
3. Internal gate: 重複、欠落、未知値、曖昧性、policy違反を検査する
4. Render: メモリ上又はstaging領域の成果物へ反映する
5. Output gate: schema、必須値、hash、相互整合を検査する
6. Transition gate: 次工程へ進める状態か検査する
```

途中で失敗した場合、最終allocation manifestを公開してはならない。

---

## 4. 技術制約

### 4.1 使用言語

決定論的処理、manifest解析、hash、JSON Schema検証、directory tree生成、path安全性検査、allocation ledger生成、seed rendering、WIC抽出、WIG構築、グラフ検査、policy到達可能性検査、report、atomic publishは、**Node.jsだけ**で実装する。

Pythonを使ってはならない。

Node.jsはLTSの現行系を対象とし、ESMを使用する。全スクリプトは`.mjs`とする。TypeScriptを使う場合でも、実行時の追加transpilerに依存せず、Node.jsから再現可能に実行できる構成にする。簡潔性と再現性のため、原則はplain JavaScript ESMとする。

### 4.2 AIとスクリプトの責務分離

このコマンドは、すべてをスクリプトで自動決定するものではない。

AIが担う仕事：

- 第一段階manifestと原典仕様へのsource traceabilityを読み、意味を理解する
- source unit、object、claim、normative requirement、invariant、error、test requirementを各seedへ配賦する意味論的判断を行う
- semantic owner、dependency context、consumer obligation、composition obligation、test obligationを区別する
- RFC seedの人間可読な規範材料を記述する
- WICのinput/output/proof/state/effect/failure/test内容を、原典の意味を損なわずに記述する
- treeまたはdependency policyの変更が必要なら、黙って変更せず`REVIEW_REQUIRED`又は`TREE_CHANGE_REQUIRED`相当のreview itemとして残す
- スクリプトのFAILを読んで、seed又はallocationの意味論を修正する

Node.jsスクリプトが担う仕事：

- AIが作った構造化allocation、seed、WICがschema、coverage、owner、DAG、policy、hash、path安全性、結合完全性を満たすか検査する
- 決定論的なdirectory tree生成、seed配置、WIC抽出、WIG構築、canonical rendering、atomic publishを行う
- FAIL、BLOCKED、REVIEW_REQUIRED時に次工程とpublishを停止する

Node.jsは、仕様の意味を勝手に断定してownerや契約内容を捏造してはならない。AIは、スクリプトが検査できるはずの構造的欠落・矛盾・禁止経路を「文章としてもっともらしい」ことで通過させてはならない。

### 4.3 外部依存

可能な限りNode.js標準ライブラリを使う。

```text
node:fs/promises
node:fs
node:path
node:crypto
node:os
node:process
node:url
node:assert
```

外部npm packageを導入する場合は、用途を限定し、lockfileで固定する。JSON Schema validation、CLI argument parsing、Markdown parserで外部packageを用いる場合も、解析不能なブラックボックス挙動へ依存してはならない。

外部ネットワーク、Web API、LLM API、クラウドサービス、GitHub API、検索APIは使用しない。入力manifest、manifestが参照するローカル仕様書、ローカルの実装だけで完結する。

### 4.4 ハッシュと正規化

第一段階manifestの入力仕様書hash規則をそのまま再利用する。

```text
1. UTF-8 BOMがあれば除去する
2. \r\nと\rを\nへ正規化する
3. 末尾の改行は内容として保持する。勝手に付加・削除しない
4. 正規化後のUTF-8 bytesにSHA-256を適用する
```

BLAKE3を追加依存なしに安全実装しようとしてはならない。標準ライブラリだけで確実に実装できるSHA-256を使用する。

seed、WIC、最終manifestのhashもSHA-256を使用する。hashはlowercase hexとする。

---

## 5. 実装配置

このコマンドを実装するリポジトリでは、次のように配置する。ここで示すディレクトリは、対象仕様の実装workspaceではない。Claude Code commandおよびNode.js automationのための管理領域である。

```text
.claude/
  commands/
    workspacify-allocate.md

scripts/
  workspacify-allocate/
    run.mjs
    lib/
      errors.mjs
      fs-safe.mjs
      path-safety.mjs
      hash.mjs
      canonical-json.mjs
      tree-manifest-input.mjs
      source-inventory.mjs
      allocation-model.mjs
      allocation-review.mjs
      seed-model.mjs
      seed-render.mjs
      seed-parse.mjs
      wic-schema.mjs
      wic-extract.mjs
      contract-edge.mjs
      wig-build.mjs
      wig-validate.mjs
      proof-lifecycle.mjs
      state-effects.mjs
      semantic-flow.mjs
      test-closure.mjs
      dependency-policy.mjs
      tree-staging.mjs
      atomic-publish.mjs
      final-manifest-schema.mjs
      validation.mjs
      report.mjs

schemas/
  workspacify-allocate-manifest.schema.json
  workspace-integration-contract.schema.json
  allocation-record.schema.json
  semantic-flow-policy.schema.json

test/
  workspacify-allocate/
    fixtures/
    unit/
    integration/
    property/
```

ファイル名は例であり、責務が明確なら近い構造でもよい。ただし、`run.mjs`に巨大なロジックを集めてはならない。入力検査、path安全性、allocation、seed rendering、WIC、WIG、proof、state/effect、semantic flow、test closure、atomic publishを別moduleに分ける。

---

## 6. `/workspacify-allocate` スラッシュコマンド

`.claude/commands/workspacify-allocate.md`を作成する。

コマンドは次を満たす。

```text
/workspacify-allocate <path-to-WORKSPACIFY-TREE-MANIFEST.json>
```

- 引数がちょうど一つでなければ使用方法を表示して非0終了する
- pathは引用符付きでも扱える
- pathをNode.jsスクリプトへ安全に渡す
- shell interpolation、`eval`、文字列連結によるコマンド実行を使わない
- Node.jsスクリプトのexit codeをそのまま返す
- hookを登録・実行しない
- 成功時は公開された`WORKSPACIFY-ALLOCATE-MANIFEST.json`の絶対パス、input tree manifest hash、allocation manifest hash、workspace root、package count、seed count、gate summaryだけを表示する
- 失敗時は、失敗したgate ID、失敗理由、影響するpackage/contract/source trace、修正すべき入力又はseedを表示する

コマンドMarkdown内に、仕様解析、配賦判断、WIC生成、グラフ検査の実装を埋め込んではならない。コマンド本体はNode.js実行を行うだけに保つ。

---

## 7. 第一段階manifestのentry検査

### 7.1 manifest schemaとself-hash

入力manifestを読み、第一段階manifest schemaへ再検証する。

以下を検査する。

```text
artifact_kind == "workspacify-tree-manifest"
status == "COMPLETE"
final_audit.status == "PASS"
integrity.canonicalizationが既知値
integrity.manifest_hash_algorithm == "SHA-256"
integrity.manifest_hashが正しい
integrity.reload_validation == "PASS"
```

self-hashは、第一段階規約どおり`integrity.manifest_hash`を空文字列としてcanonical JSON serializationしたbytesのSHA-256と照合する。

### 7.2 final auditとhandoff

以下の集計値は全て0でなければならない。

```text
orphan_object_count
orphan_claim_count
owner_collision_count
unknown_dependency_count
forbidden_dependency_count
layer_violation_count
cycle_count
review_required_count
unresolved_count
```

`stage2_handoff`について、少なくとも次を検査する。

```text
eligible == true
entry_gate.required_status == "COMPLETE"
entry_gate.source_hash_must_match == true
entry_gate.unresolved_count_must_be == 0
entry_gate.review_required_count_must_be == 0
entry_gate.cycle_count_must_be == 0
contract_definition_orderが配列として存在
contract_boundariesが配列として存在
```

### 7.3 source file再hash

`input.spec_path`をmanifest親directory基準で安全に解決し、通常ファイル、UTF-8、正規化可能、非空であることを検査する。第一段階と同じ正規化規則でSHA-256を計算し、`input.source_hash`と一致することを要求する。

仕様書の変更後に古いtree manifestを使うことを禁止する。

### 7.4 package catalogとdependency policy

以下を検査する。

- `workspace.packages`のpackage ID、name、pathが一意である
- `workspace.tree`とpackage catalogのpath集合が整合する
- 各packageにlayer、kind、responsibilities、owner情報がある
- owner tableのobject/claim/invariant参照がinventoryに解決する
- `dependencies.orientation == "consumer_to_direct_dependency"`
- normal edge、forbidden edge、layer rule、dev dependency policyが存在する
- `contract_boundaries`のconsumer/providerがpackage catalogに存在する
- `contract_definition_order`が未知packageを含まない

これらの一つでも失敗すればG0又はG1で停止する。

---

## 8. workspace directory treeの安全な生成

### 8.1 path正規化

package pathは相対POSIX-style pathとしてmanifestに記録される。実際のOS pathへ変換する前に以下を検査する。

```text
- 空文字列でない
- absolute pathでない
- drive letter、UNC path、NUL byteを含まない
- ".." segmentを含まない
- 正規化後に空又は"."にならない
- path separator混在を正規化後に再検査する
- workspace root外へ解決しない
- symbolic linkをたどってworkspace root外へ出ない
```

`path.resolve(workspaceRoot, packagePath)`が`workspaceRoot`の子孫であることを、文字列prefixだけでなく`path.relative`とrealpathを使って検査する。

### 8.2 directory plan

manifestの`workspace.tree`とpackage catalogから、生成対象のdirectory集合を決定論的に作る。

- 親directoryを含む
- 同じpathは一度だけ生成する
- file/directory同名collisionを拒否する
- package pathの祖先に別packageがある場合、tree manifestが許す親namespaceかを検査する
- package directoryはtree上の対応nodeを持つ
- treeに存在するがpackageでないnamespace directoryはseedを持たない
- packageは必ず一つのseed配置先を持つ

### 8.3 staging generation

最終workspace rootを直接変更してはならない。workspace rootの親と同一filesystem上に、process固有で予測困難なstaging directoryを作る。

```text
<workspace-root-parent>/.workspacify-allocate-stage-<pid>-<random>
```

このstaging pathは最終出力ではないため、成功後に残してはならない。

staging root内に、workspace rootと同じ相対treeを作る。directory生成後に以下を検査する。

```text
- 期待するdirectory集合と実際のdirectory集合が一致する
- unexpected fileが0件
- unexpected symlinkが0件
- package pathごとにdirectoryが一つだけある
- tree hash又はcanonical tree listingがplanと一致する
```

### 8.4 existing output policy

最終workspace rootが存在しない場合だけ、初期版はpublishを許可する。

最終workspace rootが存在する場合：

- `WORKSPACIFY-ALLOCATE-MANIFEST.json`がない場合は`BLOCKED`
- manifestがある場合でも、更新モード未実装の初期版は`BLOCKED`
- 既存treeをmerge、上書き、削除、補完してはならない

この制約は不便だが、安全性のために必要である。将来の更新モードは、明示的な差分manifest、precondition hash、rollback contract、再allocation policyを別途設計してから追加する。

---

## 9. allocation model

### 9.1 allocationの目的

allocationは、第一段階manifestに記録された仕様情報を、各packageのRFC seedへ配賦する作業である。

allocationは、単なる章番号振り分けではない。source traceを保ったまま、次の責務を区別する。

```text
semantic_owner
  object固有schema、validator、状態機械、不変条件、claim verifierの規範的所有

dependency_context
  他package所有の規範を再定義せず、当該seedの入力・前提として説明する文脈

consumer_obligation
  providerが定めたobject/proof/contractを、consumerが何を提示・検証・伝播・再検証するか

composition_obligation
  直接dependencyを作らず、composition/core/operation packageが横断順序・外部副作用・callbackを編成すべき責務

test_obligation
  特定のowner又は境界において検査しなければならないsource由来の試験責務

rationale_only
  規範的ownerやruntime挙動を追加しない設計背景
```

### 9.2 allocation record

内部ledgerの各allocation recordは少なくとも次を持つ。内部ledgerは最終出力ファイルとして残さないが、最終manifestに集計・hash・source coverageを含める。

```json
{
  "allocation_id": "alloc-000001",
  "source_ref": {
    "section_id": "h-000123",
    "line_start": 100,
    "line_end": 110,
    "byte_start": 1000,
    "byte_end": 1200,
    "source_hash": "..."
  },
  "inventory_ref": "obj-000123-or-claim-000123-or-requirement-000123",
  "target_package": "example-package",
  "seed_section": "in-scope-objects",
  "allocation_role": "semantic_owner",
  "semantic_owner_package": "example-package",
  "reason": "短く具体的な配賦理由",
  "linked_contract_ids": [],
  "review_status": "PASS|REVIEW_REQUIRED"
}
```

### 9.3 allocationの必須検査

- 全inventory itemにsource traceがある
- 全object familyにちょうど一つのsemantic owner allocationがある
- 全claim familyにちょうど一つのprimary verifier owner allocationがある
- 全invariantにowner又は明示されたcomposition ownerがある
- 全error codeにreject owner又はpropagation ownerがある
- 全required testに少なくとも一つのtest obligation allocationがある
- owner packageが第一段階manifestのowner tableと一致する
- foundation、adapter、core、interface、conformanceだけをdomain objectのsemantic ownerにしない
- dependency contextだけでowner不在を隠していない
- consumer obligationだけでproviderの規範を再所有していない
- source unit / normative candidate / inventory itemのunallocated countが0である
- owner collision countが0である

### 9.4 review required

次の場合、AIは勝手に配賦を決めず、`REVIEW_REQUIRED`を残す。

- 第一段階manifestがownerを定めていないが、規範的意味論のownerが必要である
- 一つのsourceが複数packageのsemantic ownerを必要とするように見える
- direct dependencyがmanifestに存在しないが、結合が必要である
- package分割又は統合を変えなければ安全なowner配賦ができない
- forbidden edgeを回避するcomposition pathがmanifestにない
- inventoryのunknown / unresolved itemが残っている

`REVIEW_REQUIRED`がある限り、seedを最終化してはならない。

---

## 10. RFC seedの形式

### 10.1 packageごとの唯一seed

各production package、adapter package、port package、core package、interface package、conformance package、test-support packageについて、manifestのpackage catalogが指定する場合に一つの`RFC-SEED.md`を作る。

packageにseedが不要という例外を設ける場合、第一段階manifestに`seed_required: false`と、理由、代替のowner/consumer責務、Stage 2 policyが明示されていなければならない。初期実装では安全側に倒し、全packageにseedを要求してよい。

### 10.2 seed必須見出し

全seedは、以下の見出しをこの順序で持たなければならない。

```text
# RFC Seed: <package-name>

## 1. Seed Status and Package Identity
## 2. Stage 1 Ownership and Forbidden Ownership
## 3. Allocated Specification Material
## 4. In-Scope Objects, Claims, Predicates, State and Invariants
## 5. Incoming Dependencies and Consumer Obligations
## 6. Outgoing Provider Obligations
## 7. Workspace Integration Contract
## 8. State Ownership and State-Transition Material
## 9. Side-Effect and External-I/O Boundaries
## 10. Canonicalization, Signatures and Proof Responsibilities
## 11. Failure, Rejection, Recovery and Finality Material
## 12. Required Unit, Integration, Exception and Malfeasance Test Material
## 13. Grill Questions and Explicitly Unresolved Design Choices
## 14. Source Traceability Index
## 15. Forbidden Dependencies, Non-Interference Boundaries and Non-Goals
```

見出しの本文は空にできない。該当事項がない場合も、型付きの`not_applicable`、根拠、source ref、検証規則を記載する。

### 10.3 seedは引用集ではない

seedは原典の単なるコピー又は章番号リストではない。AIは、対象packageの責務に必要な原典材料を、source traceを保ちながら再構成して記述する。

ただし以下は禁止する。

- 原典で確定済みのMUST/MUST NOT/禁止/数式/schema/errorを、根拠なく弱める又は省略する
- 他packageのsemantic ownerを再定義する
- 不明点を`TODO`、`TBD`、`後で決める`、`別途定義する`だけで放置する
- source traceを失う抽象要約
- connectionを自由文だけで述べ、WICへ記録しないこと

### 10.4 WIC block

全seedの第7節には、抽出可能なJSON code blockを一つだけ置く。

```markdown
## 7. Workspace Integration Contract

```json
{
  "schema_version": "1.0.0",
  "seed_package": "example-package",
  "seed_path": "packages/example-package",
  "no_external_contracts": false,
  "no_external_contracts_reason": null,
  "integration_contracts": []
}
```
```

このJSON blockが結合契約の機械的正本である。第5、第6、第8〜第12節の人間可読説明は、このblockに記録されたcontract IDを参照し、矛盾してはならない。

leaf packageで外部contractが本当にない場合：

```json
{
  "no_external_contracts": true,
  "no_external_contracts_reason": {
    "reason": "package has no declared direct dependencies and no declared direct consumers in the input manifest",
    "source_refs": ["..."]
  },
  "integration_contracts": []
}
```

空配列だけでは不十分である。

---

## 11. Workspace Integration Contract schema

### 11.1 ContractEdge

各`integration_contracts[]`は以下を必須とする。

```json
{
  "contract_id": "contract-unique-stable-id",
  "consumer_package": "consumer-package-name",
  "provider_package": "provider-package-name",
  "consumer_path": "packages/consumer-package-name",
  "provider_path": "packages/provider-package-name",
  "direction": "consumer_to_provider",
  "connection_kind": "typed_protocol_input|proof_verification|state_transition|external_effect|composition_obligation|port_contract|value_only",

  "semantic_owner_package": "provider-or-owner-package",
  "state_owner_package": "package-or-typed-not-applicable",
  "side_effect_owner_package": "package-or-typed-not-applicable",
  "port_owner_package": "package-or-typed-not-applicable",
  "adapter_owner_package": "package-or-typed-not-applicable",

  "inputs": [],
  "outputs": [],
  "proofs": [],
  "state_transition": {},
  "side_effect_boundary": {},

  "preconditions": [],
  "postconditions": [],
  "invariants": [],
  "failures": [],

  "idempotency": {},
  "atomicity": {},
  "ordering": {},
  "finality": {},
  "canonicalization": {},
  "signatures": {},
  "proof_responsibility": {},

  "tests": {
    "unit": [],
    "integration": [],
    "exception": [],
    "malfeasance": []
  },

  "source_refs": []
}
```

空配列、空object、空文字列は許可しない。該当しない場合は、以下の型付き形式だけを許す。

```json
{
  "applicability": "not_applicable",
  "reason": "具体的理由",
  "source_refs": ["source reference"],
  "validated_by": "policy-or-validator-id"
}
```

### 11.2 input/output

各input/outputは少なくとも次を持つ。

```json
{
  "name": "CanonicalTypeOrValueName",
  "kind": "value|signed_object|immutable_reference|event|proof_container|capability|error",
  "canonical_type_owner_package": "owner-package",
  "required": true,
  "version": "optional version or null",
  "reference_kind": "hash|id|inline|none",
  "source_refs": ["..."]
}
```

`canonical_type_owner_package`は第一段階manifestのowner tableと一致しなければならない。

### 11.3 proof

各proofは少なくとも次を持つ。

```json
{
  "name": "ProofName",
  "kind": "claim|assertion|merkle_proof|credential|authorization|freshness_proof|other",
  "producer_package": "package",
  "presenter_package": "package",
  "verifier_package": "package",
  "reverifier_package": "package-or-null",
  "required": true,
  "binding": {
    "subject_binding": true,
    "object_binding": true,
    "hash_binding": true,
    "signature_required": true,
    "freshness_required": true,
    "revocation_check_required": false
  },
  "failure_owner_package": "package",
  "source_refs": ["..."]
}
```

proofがないcontractでも、`proof_responsibility`に型付きnot-applicableと根拠が必要である。

### 11.4 state transition

状態を扱うcontractでは、少なくとも次を持つ。

```json
{
  "applicability": "required",
  "canonical_state": "StateName",
  "pre_state_owner_package": "package",
  "trigger": "CanonicalTriggerName",
  "transition_owner_package": "package",
  "post_state": "CanonicalPostStateName",
  "persistence_semantics": "append_only|transactional|checkpointed|other",
  "idempotency_scope": "canonical expression",
  "ordering_requirements": ["sequence|previous_hash|epoch|checkpoint_time|causal_reference"],
  "finality_requirements": ["..."],
  "source_refs": ["..."]
}
```

状態を扱わないcontractでは、型付きnot-applicableを使う。

### 11.5 side effect boundary

外部副作用を扱うcontractでは、少なくとも次を持つ。

```json
{
  "applicability": "required",
  "initiator_package": "package",
  "protocol_decider_package": "package",
  "port_package": "package",
  "adapter_package": "package",
  "external_effect_kind": "storage_write|network_send|payment_request|identity_query|notification|other",
  "correlation_key": "canonical expression",
  "callback_receiver_package": "package-or-null",
  "callback_verifier_package": "package-or-null",
  "retry_owner_package": "package",
  "recovery_or_compensation_owner_package": "package",
  "source_refs": ["..."]
}
```

adapterは`protocol_decider_package`、`state_owner_package`、`finality owner`になれない。portは抽象能力を所有できるが、domain/protocol規範を所有できない。

### 11.6 安全性・整合性・試験

以下は内容又は型付きnot-applicableを必須とする。

```text
preconditions
postconditions
invariants
failures
idempotency
atomicity
ordering
finality
canonicalization
signatures
proof_responsibility
```

`tests`には、必ず以下の配列を持たせる。

```text
unit
integration
exception
malfeasance
```

各test obligationは、少なくとも対象contract ID、対象条項、期待結果、source refを持つ。

---

## 12. ContractEdgeの局所検査

全seedを揃える前にも、各seedと各contractに対し以下を検査する。

### 12.1 schemaと必須field

- WIC JSONがschema適合する
- contract IDがseed内で一意
- consumer/provider path/nameがpackage catalogに存在する
- directionが既知値
- input/output/proof/state/effect/testが必要な形で存在する
- 空文字列、空object、空配列、未解決TODOがない
- not-applicableにreason/source refs/validatorがある

### 12.2 ownerと依存方向

- semantic ownerが第一段階owner tableと一致する
- consumerがproviderのcanonical schema又はvalidatorを再所有していない
- state ownerがfoundation/adapter/interfaceだけになっていない
- adapterがsemantic owner、state owner、protocol deciderになっていない
- consumer→providerがallowed dependency又は許可されたcomposition patternに一致する
- forbidden edgeをWICが要求していない

### 12.3 source traceability

- seed本文の規範段落がsource refsを持つ
- WICの全contractがsource refsを持つ
- input/output/proof/transition/effect/failure/testが少なくとも一つのsource又はmanifest inventory itemへtraceする
- source refがmanifestのsection/line/byte range/hashに解決する
- source hashが入力仕様の再hashと整合する

### 12.4 bilateral symmetryの予備検査

provider/consumer双方のseedが既に生成済みの場合、次を検査する。

- contract ID、consumer/provider、directionが一致する
- input/output object名、canonical owner、error名、proof verifier、idempotency scope、finality状態、signature actorが矛盾しない
- consumer側が要求するprovider outputをprovider側が提供する
- provider側が要求するconsumer inputをconsumer側が提示する

全seedが揃った後の最終検査を、この局所検査で代替してはならない。

---

## 13. Workspace Integration Graph

### 13.1 目的

全seedが生成された後、各seedのWIC blockを走査してcontract集合を抽出し、Workspace Integration Graph（WIG）を構築する。

WIGは単なるpackage dependency graphではない。少なくとも以下のedge種別を保持する。

```text
dependency
contract
input_flow
output_flow
proof_production
proof_presentation
proof_verification
state_transition
state_mutation
side_effect_initiation
side_effect_callback
composition
semantic_flow
advisory_flow
test_obligation
```

WIGは内部中間成果物であり、別JSONとしてworkspace rootへ残してはならない。最終manifestにcanonical summary、hash、counts、gate results、必要なinspection dataを記録する。

### 13.2 全seed後にのみ行うこと

以下の検査は、全package seedが揃うまで実行又はPASS判定してはならない。

- contract IDのworkspace全体一意性
- 全consumer/provider方向の整合
- 全package graphのcycle
- object/schema/validator/claim verifier/state ownerの全体衝突
- proof producer→presenter→verifier→failure処理の閉包
- state mutation競合、idempotency scope競合、finality競合
- external side effect開始者・callback責務の全体衝突
- forbidden semantic-flow到達可能性
- test obligationの全体閉包

途中seedは`provisional`であり、全体WIG gateを通過するまで`COMPLETE`又はplacement-approvedとして扱ってはならない。

---

## 14. Workspace Integration Graphの必須ゲート

### 14.1 G5.1 — WIC抽出完全性

全package directoryを再走査し、以下を検査する。

```text
- package catalogの全packageにRFC-SEED.mdがある
- RFC-SEED.mdがあるpathは全てpackage catalogに存在する
- 各seedにWIC JSON blockがちょうど一つある
- WIC JSONがschema適合する
- WIC seed_package/seed_pathがpackage catalogと一致する
- contract_idがworkspace全体で一意
- seed本文の外部結合言及がWIC contract IDへ解決する
- no_external_contractsが空contractの唯一の根拠であり、reason/source refsがある
```

### 14.2 G5.2 — contract identityとmanifest等価性

内部allocation model、seed WIC、最終manifestへ記録するcontract summaryの間で、次がcanonical-equalでなければならない。

```text
contract_id
consumer/provider package
consumer/provider path
direction
connection kind
semantic/state/side-effect/port/adapter owner
input/output/proof identifiers
state transition identifier
side effect identifier
source refs
test obligation identifiers
```

手編集された要約だけを正しく見せ、seedのWICと矛盾させることを禁止する。

### 14.3 G5.3 — directed dependency / layer / DAG

以下を検査する。

```text
- consumer/providerがcatalogに存在
- consumer -> providerがallowed normal edgeに一致
- self-loopなし
- unknown edgeなし
- duplicate edgeなし
- forbidden edgeなし
- layer violationなし
- normal/dev/build kind mismatchなし
- composition obligationはmanifestで許されたcomposition packageを経由する
- dependency/contract/state/effect/semantic flowの合成で禁止cycleなし
```

cycleがあれば、package列、contract ID列、edge種別を含む具体的なcycle pathを報告する。

### 14.4 G5.4 — object/schema/owner collision

以下を検査する。

```text
- 同一canonical object typeに複数semantic ownerがない
- 同一canonical schemaに複数ownerがない
- 同一validatorに複数規範ownerがない
- 同一claim familyに複数primary verifier ownerがない
- 同一state machineに複数ownerがない
- input/outputのcanonical type ownerが第一段階owner tableと一致
- provider出力をconsumerがcanonical schemaとして再定義していない
- object version/hash/reference kind/canonicalization profile/domain separation IDが矛盾しない
- signature actor/key kind/payload scope/verifierが矛盾しない
```

### 14.5 G5.5 — proof lifecycle closure

proofは、名前が書かれているだけでは不十分である。全proofについて次の有向責務連鎖を検査する。

```text
producer
  -> presentation or envelope or immutable reference
    -> verifier
      -> optional reverifier
        -> accept/reject and failure handling
```

以下を検査する。

```text
- producer/presenter/verifierが存在しcatalogに解決する
- producerがproofの根拠object/state/authorizationを正当に生成又は参照する
- presenterがproofを入力又はenvelopeとして運ぶ責務を持つ
- verifierがacceptance predicateでproofを要求する
- 必要なreverifierがある場合、その責務がある
- subject/object/hash/signature/freshness/revocation bindingの検査ownerがある
- missing/tampered/substituted/expired/revoked/replayed proofのreject ownerがある
- proofを必要とするtransitionが未検証proofを迂回する経路を持たない
```

### 14.6 G5.6 — state ownership、transition、idempotency、finality

各state transitionについて、少なくとも次を要求する。

```text
canonical state
pre-state owner
trigger
transition owner
post-state
persistence semantics
idempotency scope
ordering requirements
finality requirements
```

全体横断で以下を検査する。

```text
- 一つのcanonical stateを複数packageが直接mutationしない
- transition ownerがstate ownerと異なる場合、許可されたcomposition/delegation contractがある
- 同一state owner、同一trigger、重なるidempotency scopeから矛盾するpost-stateが生じない
- pending/reserved/accepted/finalized/reversed/expired/compensated等、必要なlifecycle責務に空白がない
- orderingが必要なtransitionにsequence/previous hash/epoch/checkpoint/causal reference等がある
- finalityが必要なtransitionにfinality owner、finality predicate、reversal/compensation責務がある
- 前段transitionを飛ばして後段stateに到達する経路がない
```

### 14.7 G5.7 — side effect、port、adapter、callback

各external side effectについて、以下を要求する。

```text
initiator
protocol decider
port owner
adapter owner
external effect kind
correlation key
callback receiver
callback verifier
retry owner
recovery or compensation owner
```

全体横断で以下を検査する。

```text
- adapterがcanonical validity、authority、state transition、finalityを決定していない
- protocol/domainが具体DB、OS、HTTP、payment、identity、network SDKへのdirect dependencyを持たない
- core/compositionがadapterへdirect dependencyを持たずport injectionを使う
- callbackがcanonical operation、validator、state ownerを迂回してmutationしない
- 同一external effectを複数ownerが競合して開始しない
- duplicate/replay/out-of-order/invalid signature/correlation mismatch/authorization expiry/partial failureの処理責務がある
- retryが二重effect又は新しい不正state transitionを作らない
- external observationとcanonical protocol factを混同しない
```

### 14.8 G5.8 — forbidden semantic flowとnon-interference

第一段階manifestは、必要に応じて`stage2_handoff.semantic_flow_policies`を持てる。各policyは、source class、target class、edge kinds、許可例外、理由を定義する。

例は汎用形であり、特定プロジェクト語を使わない。

```json
{
  "policy_id": "non-interference-001",
  "forbidden_source_classes": [
    "commercial",
    "external_identity",
    "advisory",
    "transport",
    "adapter"
  ],
  "forbidden_target_classes": [
    "normative_trust",
    "normative_validity",
    "authority",
    "finality"
  ],
  "edge_kinds": [
    "semantic_flow",
    "state_transition",
    "proof_verification",
    "side_effect_initiation",
    "composition"
  ],
  "allowed_exceptions": [],
  "reason": "Configured source classes must not influence configured normative target classes"
}
```

スクリプトはWIGのdata/proof/state/effect/composition/semantic/advisory edgeを合成して到達可能性解析を行う。

以下を検査する。

```text
- policyにより禁止されたsource classからtarget classへの経路が0
- advisory outputがnormative validity、right mutation、authority、finalityへ影響しない
- transport reachability又はadapter/vendor resultがnormative decisionを直接決めない
- lifecycle predecessor stateがpolicyで禁止されたsuccessor privilege/stateへ継承しない
- encryption/content classとauthorization/access classがpolicyに反して互いのsemantic ownerを侵食しない
- forbidden direct edgeをcompositionの偽装で実現する経路がない
```

一つでも禁止経路が見つかれば、経路上のpackage、contract ID、edge種別、source refsを含めてFAILとする。

### 14.9 G5.9 — cross-seed test closure

全ContractEdgeに対して以下を検査する。

```text
- unit test obligation: owner側schema、validator、predicate、canonicalization又はstate transition
- integration test obligation: consumer/provider間のinput/output/proof/state/effect接続
- exception test obligation: input不足、期限切れ、resource limit、外部失敗、競合、partial failure
- malfeasance test obligation: tampering、substitution、replay、ordering attack、signature/authority abuse、callback forgery、policy-defined abuse
```

加えて以下を検査する。

```text
- 各input/output/precondition/postcondition/invariant/failureに少なくとも一つのtest obligationがtraceする
- 各state transitionに正常系integrationとexception又はmalfeasanceがある
- 各proofにmissing/tampered/substituted/expired/revoked/replayedの該当testがある
- 各callbackにduplicate/replay/out-of-order/invalid signature/correlation mismatch/expiry testがある
- 各semantic flow policyに、禁止到達不能を確認するnegative graph testがある
- owner unit、bilateral integration、cross-boundary exception/malfeasanceに責務空白がない
```

---

## 15. final allocation manifest

最終manifestはcanonical JSONとして生成する。

### 15.1 canonical JSON規則

- UTF-8
- LF改行
- 2 space indentation
- object keyは辞書順
- 配列は意味論的順序があるものは仕様順、ないものはstable canonical key順
- trailing whitespaceなし
- 末尾に1個のLF
- JSON numberはfinite integer又は仕様で必要な有限numberだけ
- 日時はUTC ISO 8601 `YYYY-MM-DDTHH:mm:ss.sssZ`
- hashはlowercase hex

### 15.2 必須トップレベル構造

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "artifact_kind": "workspacify-allocate-manifest",
  "schema_version": "1.0.0",
  "status": "COMPLETE",
  "run": {},
  "input_tree_manifest": {},
  "workspace": {},
  "allocation": {},
  "seeds": {},
  "integration": {},
  "gates": {},
  "final_audit": {},
  "integrity": {}
}
```

### 15.3 `run`

```json
{
  "run_id": "content-addressed-or-uuid",
  "generated_at": "UTC timestamp",
  "generator": {
    "command": "/workspacify-allocate",
    "generator_version": "semver",
    "node_version": "process.version"
  }
}
```

### 15.4 `input_tree_manifest`

```json
{
  "path": "relative path from workspace root or absolute normalized input record",
  "artifact_kind": "workspacify-tree-manifest",
  "schema_version": "1.0.0",
  "input_manifest_hash": "...",
  "source_spec_hash": "...",
  "source_spec_path": "...",
  "input_revalidation": "PASS"
}
```

### 15.5 `workspace`

```json
{
  "root_path": "...",
  "tree_hash": "...",
  "planned_directory_count": 0,
  "actual_directory_count": 0,
  "package_count": 0,
  "unexpected_entry_count": 0,
  "path_safety": "PASS"
}
```

### 15.6 `allocation`

```json
{
  "source_inventory_count": 0,
  "allocated_source_count": 0,
  "unallocated_source_count": 0,
  "object_owner_collision_count": 0,
  "claim_owner_collision_count": 0,
  "invariant_owner_collision_count": 0,
  "review_required_count": 0,
  "allocation_ledger_hash": "...",
  "coverage": {
    "objects": "PASS",
    "claims": "PASS",
    "requirements": "PASS",
    "invariants": "PASS",
    "errors": "PASS",
    "tests": "PASS"
  }
}
```

### 15.7 `seeds`

```json
{
  "seed_filename": "RFC-SEED.md",
  "seed_count": 0,
  "expected_seed_count": 0,
  "missing_seed_count": 0,
  "unexpected_seed_count": 0,
  "duplicate_seed_count": 0,
  "seed_records": [
    {
      "package": "...",
      "path": "...",
      "seed_path": ".../RFC-SEED.md",
      "seed_hash": "...",
      "wic_hash": "...",
      "source_ref_count": 0,
      "contract_id_count": 0,
      "local_gate_status": "PASS"
    }
  ]
}
```

### 15.8 `integration`

```json
{
  "wic_schema_version": "1.0.0",
  "contract_count": 0,
  "contract_hash": "...",
  "workspace_integration_graph_hash": "...",
  "graph_counts": {
    "package_nodes": 0,
    "contract_edges": 0,
    "input_edges": 0,
    "output_edges": 0,
    "proof_edges": 0,
    "state_edges": 0,
    "side_effect_edges": 0,
    "semantic_flow_edges": 0,
    "test_edges": 0
  },
  "integration_audit": {
    "unknown_package_count": 0,
    "reverse_edge_count": 0,
    "forbidden_edge_count": 0,
    "layer_violation_count": 0,
    "cycle_count": 0,
    "owner_collision_count": 0,
    "proof_lifecycle_gap_count": 0,
    "state_conflict_count": 0,
    "side_effect_conflict_count": 0,
    "callback_bypass_count": 0,
    "forbidden_semantic_flow_count": 0,
    "test_closure_gap_count": 0
  }
}
```

### 15.9 `gates`と`final_audit`

全gate recordを保存する。`final_audit`は集計値を持つ。

```json
{
  "status": "PASS",
  "unallocated_source_count": 0,
  "owner_collision_count": 0,
  "missing_seed_count": 0,
  "unexpected_seed_count": 0,
  "wic_schema_failure_count": 0,
  "contract_collision_count": 0,
  "unknown_dependency_count": 0,
  "forbidden_dependency_count": 0,
  "layer_violation_count": 0,
  "cycle_count": 0,
  "proof_lifecycle_gap_count": 0,
  "state_conflict_count": 0,
  "side_effect_conflict_count": 0,
  "callback_bypass_count": 0,
  "forbidden_semantic_flow_count": 0,
  "test_closure_gap_count": 0,
  "review_required_count": 0,
  "unresolved_count": 0
}
```

### 15.10 `integrity`

自己検証可能にする。

```json
{
  "canonicalization": "workspacify-allocate-json-v1",
  "manifest_hash_algorithm": "SHA-256",
  "manifest_hash": "...",
  "input_tree_manifest_hash_verified_at_finalize": true,
  "seed_hashes_verified_at_finalize": true,
  "wic_reextraction_verified_at_finalize": true,
  "wig_rebuild_verified_at_finalize": true,
  "reload_validation": "PASS"
}
```

自己hashは、`integrity.manifest_hash`を空文字列としてcanonical serializationしたbytesのSHA-256と定義する。検証時も同じ方式を使う。

---

## 16. 最終処理

### 16.1 atomic publish

最終成果物の公開は以下の順で行う。

```text
1. 入力manifestを再検証する
2. 全allocation、全seed、全WIC、全WIG、全gateをメモリとstaging rootで完了する
3. final manifestのintegrity.manifest_hashを空文字列としてcanonical JSONを作る
4. SHA-256を計算してintegrity.manifest_hashへ入れる
5. final manifest canonical JSONを再生成する
6. staging root内の全seedを再読込し、seed hash、WIC schema、source trace、WIC抽出を検査する
7. staging rootのtreeを再走査し、期待treeと一致することを検査する
8. staging rootからWIGを再構築し、最初のWIG hashと一致することを検査する
9. staging root内の最終manifest temporary fileへ書く
10. temporary fileを再読込し、JSON parse、schema validation、必須値検証、self-hash検証を行う
11. 全てPASSならstaging rootをworkspace rootへatomic rename又は安全なpublish手順で反映する
12. publish後の最終workspace rootを再読込する
13. 全seed hash、WIC再抽出、WIG再構築、final manifest schema/self-hashを再検証する
14. 成功時だけCOMPLETEを報告する
```

temp file、staging rootは成功後に残してはならない。失敗時は削除する。ただし既存の成功済みworkspaceを壊してはならない。

### 16.2 既存allocation manifestの扱い

既存の`WORKSPACIFY-ALLOCATE-MANIFEST.json`がある場合：

- 初期実装では常に`BLOCKED`で終了する
- 既存manifest、seed、workspace treeを上書きしない
- 更新モードは別コマンド又は明示的な将来設計として扱う

この安全側の制約を、成功率向上のために勝手に緩めてはならない。

---

## 17. テスト要件

実装そのものはTDDで行う。Red → Green → Refactorの順を守る。スタブだけでtestを通すことは禁止する。

### 17.1 unit tests

最低限以下をunit testする。

```text
- 一引数CLI検査
- tree manifest schema/self-hash/source-hash検査
- COMPLETE/final audit/stage2 handoff検査
- package catalog/tree/owner/dependency boundary整合
- workspace rootとpackage pathのpath traversal防止
- absolute/UNC/drive/NUL/.. path拒否
- symlink escape検出
- directory planの重複/collision検出
- allocation record schema
- source coverage
- semantic owner一意性
- dependency contextとsemantic ownerの区別
- WIC JSON code block抽出
- WIC schema検査
- empty/not-applicable検査
- contract ID一意性
- consumer/provider方向検査
- input/output canonical owner検査
- signature/canonicalization検査
- proof producer/presenter/verifier/reverifier閉包
- proof binding/freshness/revocation/failure owner検査
- state owner/transition/idempotency/finality衝突検査
- side effect initiator/decider/port/adapter/callback/retry/recovery検査
- callback bypass検出
- semantic flow到達可能性
- forbidden semantic-flow検出
- test closure検査
- canonical JSON serialization
- final manifest self-hash検証
- seed hash検証
- atomic staging/publish失敗時の既存出力保全
```

### 17.2 integration tests

fixtureとして少なくとも以下を用意する。fixture名、package名、object名、policy名に特定プロジェクト語を使ってはならない。

1. 小規模だが正しいtree manifestからworkspaceと全seedを生成するケース
2. 複数layer、複数package、複数contract boundaryを持つケース
3. value-only dependencyを持つケース
4. proof lifecycleを持つケース
5. state transitionとidempotencyを持つケース
6. external side effectとcallbackを持つケース
7. composition obligationを持つケース
8. object ownerなしを含む入力
9. claim primary owner collisionを含む入力
10. unallocated requirementを含む入力
11. reverse dependencyを含むWIC
12. forbidden layer edgeを含むWIC
13. package cycleを含むWIC
14. 同じobjectに二ownerを宣言するWIC
15. producer又はverifierがないproof
16. proof期限又はbinding検査ownerがないcontract
17. 同一stateを二packageがmutationするcontract群
18. idempotency scope競合を含むcontract群
19. adapterがprotocol deciderになっているcontract
20. callback bypassを含むcontract
21. forbidden semantic flowを含むpolicy/contract群
22. test obligation欠落を含むcontract
23. seed本文とWICが矛盾するケース
24. package directoryが既存であるケース
25. existing allocation manifestがあるケース
26. staging write失敗ケース
27. final manifest改竄検出ケース
28. seed改竄後のhash/WIG再構築不一致検出ケース

### 17.3 property tests

外部ライブラリを使わずに実装可能な範囲で、ランダム生成又は系統的生成により以下を検査する。

```text
- 任意の有向非巡回package graphがtopological orderを持つ
- cycleを加えると検出される
- forbidden edgeを加えると検出される
- object ownerを複製するとcollisionが検出される
- proof lifecycleの任意の一辺を削除するとgapが検出される
- state transitionのidempotency scopeを重ね矛盾post-stateを与えるとconflictが検出される
- forbidden source/target class間にpathを加えるとsemantic-flow検査がFAILする
- canonical JSONの再serializeがidempotentである
- final manifest hash検証が1byte改竄を検出する
- package pathへの任意の..又はabsolute escapeを拒否する
```

### 17.4 acceptance tests

最終acceptance testは、実際の長大仕様書に対し第一段階を完了させたmanifest pathを入力として、次を確認する。

```text
/workspacify-allocate <WORKSPACIFY-TREE-MANIFEST.json>
exit code == 0
workspace root exists
all manifest packages have exactly one RFC-SEED.md
no unexpected RFC-SEED.md exists
WORKSPACIFY-ALLOCATE-MANIFEST.json exists
manifest.status == COMPLETE
manifest.final_audit.status == PASS
manifest.final_audit.*_count == 0
manifest.integration.integration_audit.*_count == 0
manifest.integrity.reload_validation == PASS
all seed hashes equal manifest seed records
re-extracted WIC graph hash == manifest integration graph hash
input tree manifest hash == manifest input_tree_manifest hash
```

---

## 18. 実装の禁止事項

以下は禁止する。

- hookの使用
- Pythonの使用
- 外部API、ネットワーク、LLM API、Web検索の使用
- 入力tree manifest以外を必須入力にすること
- manifest外のworkspace root又はpackage pathへ書くこと
- 既存workspaceを黙ってmerge、上書き、削除すること
- path traversal、absolute path escape、symbolic link escapeを許すこと
- 成功前に最終workspace rootへ部分seedをpublishすること
- WICを持たないseedを許すこと
- 全seedが揃う前にWIGの最終PASS又はCOMPLETEを出すこと
- source traceなしのallocationを許すこと
- ownerなし又はowner collisionのobject/claim/invariantを黙って補完すること
- providerの規範をconsumerが再所有すること
- adapterをcanonical domain validator、state owner、protocol decider、finality ownerにすること
- core/compositionがdomain validatorを再実装すること
- domain/protocol packageにDB、OS、HTTP、payment、identity、network実装を侵入させること
- callbackがcanonical operation/validator/state ownerを迂回してmutationすること
- proof producer/presenter/verifier/failure責務の欠落を許すこと
- state mutation、idempotency、ordering、finalityの衝突を許すこと
- external effectの二重開始又はretryによる二重effectを許すこと
- semantic-flow policy違反をWARN扱いすること
- advisory出力をnormative validity、authority、right mutation、finalityの入力にすること
- TODO、TBD、"later"、"separately defined"だけで確定済み規範を放置すること
- `REVIEW_REQUIRED`、`BLOCKED`を`PASS`扱いすること
- 最終manifestを再読込検証せず成功報告すること
- seed、WIC、WIG、manifestのhash不一致を許すこと

---

## 19. 完了報告形式

実装完了後、報告は次だけを明確に示す。

1. `/workspacify-allocate`を実装したこと
2. Node.jsスクリプト群、JSON Schema、seed renderer、WIC extractor、WIG validator、テストを実装したこと
3. hookを使用していないこと
4. 入力が`WORKSPACIFY-TREE-MANIFEST.json`のpath一つだけであること
5. workspace treeをmanifestから安全に一括生成すること
6. 各packageへ`RFC-SEED.md`を一つずつ配置すること
7. 全seedが揃うまで結合関連の最終検査を完了扱いにしないこと
8. WIC抽出、WIG構築、proof/state/effect/semantic-flow/test closure検査を実装したこと
9. 成功時の唯一の第二段階正本成果物が`WORKSPACIFY-ALLOCATE-MANIFEST.json`であること
10. 代表fixtureと長大仕様fixtureで実行したテスト結果
11. publish後のseed再読込、WIC再抽出、WIG再構築、manifest schema/self-hash検査結果
12. 失敗時に既存workspaceと既存manifestを破壊しないこと

「実装したはず」「おそらく動く」「手動で確認すればよい」という報告は禁止する。コマンド実行、test結果、生成workspaceの再走査、seed再読込、WIC再抽出、WIG再構築、最終manifest再検証を実際に行った結果だけを報告する。

---

## 20. 最終チェックリスト

実装完了を宣言する前に、以下を全て満たしていることを確認する。

```text
[ ] /workspacify-allocate <tree-manifest.json> の引数は一つだけ
[ ] hookを使っていない
[ ] 決定論的処理はNode.jsのみ
[ ] 外部ネットワーク/APIを使っていない
[ ] input tree manifestのschema/self-hash/source hashを再検証する
[ ] input tree manifestがCOMPLETE/PASS/eligibleでなければ停止する
[ ] workspace rootとpackage pathの安全性を検査する
[ ] path traversal、absolute escape、symlink escapeを拒否する
[ ] existing workspaceを黙って上書きしない
[ ] staging rootで全出力を作り、成功時だけpublishする
[ ] manifestのtreeからdirectory treeを一括生成する
[ ] 全packageにちょうど一つのRFC-SEED.mdを置く
[ ] seedがないpackage、unexpected seed、duplicate seedを検出する
[ ] 全inventory itemにsource traceを保持する
[ ] object/claim/invariant ownerの一意性を保持する
[ ] semantic owner、dependency context、consumer obligation、composition obligation、test obligationを区別する
[ ] 全seedに必須15節がある
[ ] 全seedに機械可読WIC blockがある
[ ] WICに相手、方向、value/object/proof/state/effect境界がある
[ ] WICにpre/post/invariant/failure/idempotency/atomicity/ordering/finalityがある
[ ] WICにcanonicalization/signature/proof responsibilityがある
[ ] WICにunit/integration/exception/malfeasance testがある
[ ] 全seedが揃う前にWIG final PASSを出さない
[ ] WICを全seedから抽出する
[ ] WIGを構築する
[ ] package方向、allowed/forbidden edge、layer、DAGを検査する
[ ] object/schema/validator/claim/state-machine owner衝突を検査する
[ ] proof lifecycle閉包を検査する
[ ] state ownership、transition、idempotency、ordering、finality競合を検査する
[ ] side effect、port、adapter、callback、retry/recovery境界を検査する
[ ] callback bypassを検査する
[ ] forbidden semantic flow/non-interferenceを到達可能性解析で検査する
[ ] cross-seed test closureを検査する
[ ] WIC、allocation、seed、manifestの契約等価性を検査する
[ ] final manifest self-hashを実装する
[ ] publish後にtree、seed hash、WIC、WIG、manifestを再読込検証する
[ ] 既存workspaceを失敗時に破壊しない
[ ] unit/integration/property/acceptance testがある
[ ] REVIEW_REQUIREDが残る場合はCOMPLETEにしない
[ ] WORKSPACIFY-ALLOCATE-MANIFEST.jsonが唯一の第二段階正本である
```

この指示書の目的は、第一段階が設計したworkspace treeを、単にmkdirして仕様断片を置く処理へ落とすことではない。長大な仕様書を各directoryへ安全に配賦し、全directory間の結合を値・object・proof・状態遷移・副作用・policy・testまで含めて機械的に検査し、将来の正典RFC作成と独立ループ開発が破綻しない土台を作ることである。
