# INFO001 — `/workspacify-tree` の検査欠陥と修正方法

対象: `.claude/scripts/workspacify-tree/`（conver ツールチェーン配下の stage-one 回転）
調査日: 2026-09-18
調査契機: `docs/GaiaSekkeiShiyousho_v31.md` に対する 2 回目の `/workspacify-tree` 実行（永続化バックエンド要件の追加）
証拠の再取得: 付録 A のコマンドを上から順に実行すれば、本文中の実測値はすべて再現できる。

---

## 0. 要約 

`/workspacify-tree` には **「計算するが判定しない」** という同一族の欠陥が 4 件ある。いずれも検査ロジック自体は正しく実装され、 export され、 コマンド文書にも存在が前提とされているが、**パイプラインから呼ばれていない**か、**呼ばれているが `status` の述語に含まれていない**。

その結果、`status: COMPLETE` / `final_audit.status: PASS` は「全検査に合格した」ことを意味しない。実際に、`migration atomicity` 違反を宣言した入力が `COMPLETE` を返すことを実測で確認した（§3.3）。

| # | 欠陥 | 所在 | 実測される影響 |
|---|---|---|---|
| D1 | G5 述語が `migration_atomicity_misuse_count` を判定しない | `lib/validation.mjs:155` | 違反宣言ありでも `COMPLETE` |
| D2 | `checkPortAdapterBoundary` が未接続（dead code） | `lib/adapters.mjs:19` | 未接続 adapter / port 欠落を検出しない |
| D3 | `collisionWith` 未供給 + `detectAliasCycles` 未接続 | `run.mjs:696`, `lib/alias-normalization.mjs:85` | object↔claim 名衝突 23 件を検出しない |
| D4 | tree 回転の staging decisions が導出も掃除もされない | `run.mjs:149/204`, `lib/reserved-root.mjs:93` | 文書と実装が矛盾。`DECISIONS.json` が残留 |

危険度: **D1 が最も高い**。他の 3 件は「検出漏れ（危険な入力を通す）」だが、D1 は「明示的な自己申告違反を通す」ため、成果物の安全性主張そのものを無効化する。

---

## 1. 発見の経緯

1 回目の `/workspacify-tree` は `databasePolicy.applicable: false` で公開された。仕様書に RDBMS の記述が 1 件も無いことを根拠にした判断である。

2 回目で「SQLite / PostgreSQL / MySQL を必須とし、共通 trait で抽象化する」という要件が追加情報として与えられ、`applicable: true` に反転した。**この反転が G5 の検査を有効化し、同時に「その検査が本当に効いているか」を検証可能にした。** 検証は違反注入（mutant）で行い、次の 3 件を試した:

| 注入内容（`gaia-storage` = protocol 層に付与） | 期待 | 実測 |
|---|---|---|
| `dbSpecificTypes: ['sqlx::PgPool']` | G5 FAIL | `db_leak=1` → G5 **FAIL** ✓ |
| `rawSqlFragments: ['SELECT * FROM checkpoint']` | G5 FAIL | `raw_sql=1` → G5 **FAIL** ✓ |
| `migrationAsAtomicity: true` | G5 FAIL | `db_leak=0 raw_sql=0` → G5 **PASS** ✗ |

3 件目が落ちないことで D1 が判明した。この時点で「検査が存在するのに gate されていない」というパターンを疑い、`workspacify-tree` 配下の export 済み検査関数の接続状況を全数走査して D2 / D3 / D4 を検出した。

---

## 2. 欠陥 D1 — G5 が migration atomicity 違反を判定しない

### 2.1 症状

`CheckDatabasePolicy` は 3 種類の違反を計算する:

1. `raw_sql_count` — raw SQL の使用
2. `db_type_leak_count` — domain/protocol/core/interfaces 層への DB 固有型の漏洩
3. `migration_atomicity_misuse_count` — migration の atomicity を domain 操作の atomicity の代用とみなす誤用

このうち **3 番目だけが G5 の述語に含まれていない。**

### 2.2 該当コード

`lib/validation.mjs:153-158`:

```js
{
  id: 'G5',
  status: dbResult.raw_sql_count === 0 && dbResult.db_type_leak_count === 0 && approvalCount >= 0 ? GATE_STATUS.PASS : GATE_STATUS.FAIL,
  counts: { raw_sql_count: dbResult.raw_sql_count, db_type_leak_count: dbResult.db_type_leak_count, approval_count: approvalCount },
  reasons: dbResult.details,
},
```

`status` は 2 項目しか見ていない。`counts` にも `migration_atomicity_misuse_count` が無いため、`final_audit` にも現れない（`lib/validation.mjs:396-397` は `dbResult` から `raw_sql_count` と `db_type_leak_count` だけを転記している）。**違反は計算され、`details` に行が積まれ、しかし判定にも報告にも到達しない。**

### 2.3 再現手順と実測

```bash
cd /Users/kawata/shyme/gaia
node -e "
const fs=require('fs');
const d=JSON.parse(fs.readFileSync('workspacify/tree/DECISIONS.json','utf8'));
d.workspace.find(p=>p.name==='gaia-storage').migrationAsAtomicity=true;
fs.writeFileSync('/tmp/wt-probe.json', JSON.stringify(d));
"
node .claude/scripts/workspacify-tree/run.mjs gate \
  "--spec=docs/GaiaSekkeiShiyousho_v31.md" "--decisions=/tmp/wt-probe.json"
```

実測結果:

```json
{"status":"COMPLETE","gates":"G0:PASS G1:PASS G2:PASS G3:PASS G4:PASS G5:PASS",
 "finalAudit":{"status":"PASS","raw_sql_count":0,"db_type_leak_count":0, ... }}
```

`gaia-storage` は `layer: "protocol"`、`migrationAsAtomicity: true` は `lib/database-policy.mjs:44` の条件（`pkg.layer === 'domain' || pkg.layer === 'protocol'`）に合致するため、`migrationAtomicityMisuseCount` は 1 に増える。それでも `COMPLETE` が返る。

### 2.4 危険性

- コマンド文書 Step-3 の設計ガイダンスが明記する規則「**migration atomicity ≠ domain atomicity**」が、機械的には完全に無効化されている。AI がこの規則を守るのは、gate が守らせるからではなく、AI が自主的に守る場合だけである。
- 自己申告フィールド（`migrationAsAtomicity`）を **正直に true と書いた入力が通り、書かなかった入力と同じ `COMPLETE` を得る**。これは CLAUDE.md が禁じる "disguised green"（偽装された緑）の典型である。
- `unresolved_count: 0` / `review_required_count: 0` と並んで `final_audit` に現れないため、**運用者が違反の存在に気づく経路が無い**。

### 2.5 修正方法

2 ファイル、3 箇所。いずれも「既に計算されている値を述語と報告に通す」だけで、新しい判定ロジックは追加しない。

**修正 1 — `lib/validation.mjs:338-345`（早期 return の形を揃える）**

```js
function evaluateDatabase(adapters, packages) {
  const adapterPolicy = adapters?.databasePolicy;
  if (!adapterPolicy) {
    return { raw_sql_count: 0, db_type_leak_count: 0, migration_atomicity_misuse_count: 0, details: [] };
  }
  const result = checkDatabasePolicy({ databasePolicy: adapterPolicy, packages });
  return result;
}
```

この 1 行を揃える理由: `adapters.databasePolicy` が存在しない場合、`dbResult.migration_atomicity_misuse_count` が `undefined` になり、修正 2 の `=== 0` が偽になって G5 が FAIL する。`lib/database-policy.mjs:24` の早期 return は既にこのフィールドを含んでいるので、**同じ検査関数の 2 つの出口が同じキー集合を返していない**状態を解消するのがこの修正である。

**到達可能性についての正確な記述**: `lib/validation.mjs:341` のこの分岐は、現行の CLI 経路からは**到達しない**。`run.mjs:166` / `run.mjs:320` は常に `buildPipelineAdapters`（`run.mjs:886-892`）を通り、そこが `databasePolicy: adapters.databasePolicy ?? {}` を返すため、`adapters?.databasePolicy` は最悪でも `{}`（truthy）になり、`checkDatabasePolicy` 側の早期 return（`applicable: false`）に落ちるからである。

したがって修正 1 は**現行コマンドの動作を変えない**。必要になるのは次の 2 つの場合である:

- `runGatePipeline` は export された関数で `input = {}` を既定に持つため、`adapters` を渡さない直接呼び出しではこの分岐が実際に踏まれる。
- `buildPipelineAdapters` が将来 `databasePolicy: adapters.databasePolicy`（`?? {}` なし）に変えられた瞬間、**`applicable: false` の全実行が G5 FAIL に転落する**。修正 1 はこの潜在的トラップを先に塞ぐ。

**修正 2 — `lib/validation.mjs:154-157`（G5 述語と counts）**

```js
{
  id: 'G5',
  status:
    dbResult.raw_sql_count === 0 &&
    dbResult.db_type_leak_count === 0 &&
    dbResult.migration_atomicity_misuse_count === 0 &&
    approvalCount >= 0
      ? GATE_STATUS.PASS
      : GATE_STATUS.FAIL,
  counts: {
    raw_sql_count: dbResult.raw_sql_count,
    db_type_leak_count: dbResult.db_type_leak_count,
    migration_atomicity_misuse_count: dbResult.migration_atomicity_misuse_count,
    approval_count: approvalCount,
  },
  reasons: dbResult.details,
},
```

**修正 3 — `lib/validation.mjs:396-398`（final_audit への転記）**

```js
  raw_sql_count: dbResult.raw_sql_count,
  db_type_leak_count: dbResult.db_type_leak_count,
  migration_atomicity_misuse_count: dbResult.migration_atomicity_misuse_count,
```

### 2.6 修正の検証

修正は **厳密に厳しくする方向にのみ作用する**（`COMPLETE` を `FAIL` に変え得るが、その逆はない）。回帰確認は次の 4 件で足りる:

| 入力 | 期待 |
|---|---|
| 現行 `workspacify/tree/DECISIONS.json` | `COMPLETE`（全 28 パッケージが `migrationAsAtomicity: false`） |
| §2.3 の注入入力 | `G5:FAIL`、`migration_atomicity_misuse_count: 1` |
| `databasePolicy` を `{applicable: false}` にした入力 | `COMPLETE`（1 回目の成果物の再現性） |
| `adapters.databasePolicy` を欠く入力 | `COMPLETE` |

3・4 番目は 1 回目の成果物（`applicable: false`）が壊れていないことの確認である。**ただし CLI 経路では 4 番目も `checkDatabasePolicy` の早期 return に落ちるため、修正 1 の有無に関わらず PASS する。** 修正 1 そのもの（早期 return のキー欠落）を検証するには `runGatePipeline` を `adapters` 抜きで直接呼ぶ:

```bash
node --input-type=module -e "
import { runGatePipeline } from '/Users/kawata/shyme/gaia/.claude/scripts/workspacify-tree/lib/validation.mjs';
const r = runGatePipeline({ structure: { reconstruction: { status: 'PASS' } } });
console.log('final_audit に misuse キーが存在するか:', 'migration_atomicity_misuse_count' in r.finalAudit);
"
```

実測（修正前）: `false`

この呼び出しでは親 gate の伝播により G5 は `BLOCKED` になるため、`gates[].status` は観測点にならない。**観測点は `final_audit` にキーが現れるかどうか**である。修正 1 と修正 3 の両方を適用した後、この呼び出しは `true`（値 `0`）を返す。

（この測定で分かるのはキーの有無までである。`migration_atomicity_misuse_count` を述語に加えた結果 G5 が FAIL へ転ぶことは、§2.3 の CLI 経路の注入テストで確認する。）

---

## 3. 欠陥 D2 — `checkPortAdapterBoundary` が未接続

### 3.1 症状

`lib/adapters.mjs:19-47` に port/adapter 境界検査が実装されている。二つの違反を検出する:

- `violations` — `kind === 'adapter'` のパッケージがどの port の `implementedBy` にも現れない（unattached adapter）
- `missingPorts` — protocol/domain 層のパッケージが `externalImplementations` を宣言しているのに、その capability を提供する port が無い

**この関数はどのファイルからも import されていない。**

```bash
grep -rn "\bcheckPortAdapterBoundary\b" .claude/scripts/ --include=*.mjs
# → .claude/scripts/workspacify-tree/lib/adapters.mjs のみ（定義自身）
```

### 3.2 危険性

1 回目の `/workspacify-tree` は `port-storage-provider` を `implementedBy: []`（実装ゼロの抽象）で公開した。**D2 はまさに、その欠陥を検出するために書かれた検査である。** 接続されていれば 1 回目の実行は G3 で止まっていた。

実測（現行の 2 回目成果物に対して検査を手で呼ぶ）:

```bash
node -e "
const d=require('/Users/kawata/shyme/gaia/workspacify/tree/DECISIONS.json');
import('/Users/kawata/shyme/gaia/.claude/scripts/workspacify-tree/lib/adapters.mjs')
 .then(({checkPortAdapterBoundary})=>{
   console.log(JSON.stringify(checkPortAdapterBoundary({ports:d.adapters.ports, packages:d.workspace})));
 });"
# 2 回目成果物: {"violations":[],"missingPorts":[]}          ← 合格する
# 検証用に port-store の implementedBy を空にすると:
#   {"violations":[pkg-0025, pkg-0026, pkg-0027, pkg-0028 の 4 件], ...}  ← 正しく検出する
```

つまり **検査は正しく動作し、現行成果物も合格する。にもかかわらず呼ばれていない。**

### 3.3 修正方法

`lib/validation.mjs` の `runGatePipeline` 内で `checkPortAdapterBoundary` を import し、G3 の述語・counts・reasons に加える。

```js
import { checkPortAdapterBoundary } from './adapters.mjs';
// ...
const portResult = checkPortAdapterBoundary({ ports: adapters?.ports ?? [], packages });
```

```js
// G3 述語に追加
portResult.violations.length === 0 &&
portResult.missingPorts.length === 0 &&
```

```js
// G3 counts に追加
unattached_adapter_count: portResult.violations.length,
missing_port_count: portResult.missingPorts.length,
```

```js
// G3 reasons に追加
.concat(portResult.violations.map((v) => `${v.packageId} is an adapter that no port implements through, so it is reached outside the boundary`))
.concat(portResult.missingPorts.map((c) => `capability ${c} is declared as an external implementation but no port provides it`))
```

**注意**: `missingPorts` は `pkg.externalImplementations` を読むが、現行の decisions スキーマも設計もこのフィールドを書かない。したがって修正後も `missing_port_count` は常に 0 になる。これは「漏れが無い」ではなく「**宣言する手段が無いので検査対象が空**」である。この半分を実効化するには、protocol/domain パッケージが外部 capability を宣言するフィールドを設計語彙に追加する必要がある（別チケット）。unattached adapter の半分は即座に実効化される。

---

## 4. 欠陥 D3 — 名寄せ衝突検査が未接続

### 4.1 症状（2 箇所）

**(a)** `run.mjs:696` が `normalizeAliases(objects)` をオプション無しで呼ぶ。`lib/alias-normalization.mjs:24` のシグネチャは `normalizeAliases(candidates, { collisionWith = [] } = {})` であり、`collisionWith` には「claim 側の候補」を渡す設計になっている。渡していないため、`collisions`（object と claim が正規化キーで衝突する集合）は常に空配列になる。

**(b)** `lib/alias-normalization.mjs:85` の `detectAliasCycles` は、名寄せで作られた別名写像の循環を検出する。**どのファイルからも import されていない。**

### 4.2 危険性

**(a) の実測**（`/tmp/wt-collide.mjs`、付録 A-5）:

```
current call  -> candidates: 1137 | collisions returned: 0
fixed call    -> candidates: 1137 | collisions detected: 23
```

`forum_id`、`soul_id`/`SoulId`、`ForumMembershipEkyc`、`ForumEkycParticipationProof`、`PayoutClaimRequest` など **23 件**が、object としても claim としても収穫されている。同一概念が「対象物」と「検証可能な主張」の両方として別 ID を持ち、それぞれ別パッケージに所有されうる状態である。所有権の一意性（G3）はこれを検出しない — ID が異なるからである。

**(b)** 現行仕様では循環 0 件（`alias-cycle input size: 25 | cycles found: 0`）。したがって **(b) は将来のための安全網であり、現行成果物には影響しない。**

重要な副産物: **(a) の修正は候補数 1137 を変えない**（`candidate count unchanged: true`）。すなわち ID の採番・所有権・境界は不変であり、**公開済み manifest を無効化しない**。

### 4.3 修正方法

**(a)** `run.mjs` の `buildInventory` 内、`normalizeAliases` に claim を渡し、返り値の `collisions` を inventory に載せる:

```js
const normalizedObjects = normalizeAliases(objects, { collisionWith: claims });
// ...
return {
  objects: normalizedObjects.candidates,
  claims,
  // ...
  object_claim_collisions: normalizedObjects.collisions,
};
```

続いて G3 の述語に `collisions.length === 0`（または AI が承認で解消する対象として counts に載せる）を追加する。**「衝突は必ず不整合」とは限らない**（`forum_id` が object と claim の両方として現れるのは自然な場合がある）ため、D1/D2 のような単純な `=== 0` ではなく、`approvals` による解消を要求する形が適切である。すなわち `collisions` の各 `normalized_key` を `approvals` の対象に加え、未解消数を `object_claim_collision_count` として gate する。

**(b)** `buildInventory` の `normalization_decisions` から `{name, alias}` 対を作り、`detectAliasCycles` を呼んで G2 または G3 に接続する:

```js
import { normalizeAliases, detectAliasCycles } from './lib/alias-normalization.mjs';
// ...
const aliasCycles = detectAliasCycles(
  normalizedObjects.decisions.map((d) => ({ name: d.to, alias: d.from }))
);
```

### 4.4 修正の検証

| 確認 | 期待 |
|---|---|
| 候補数 | 1137 のまま（変わらない） |
| `collisions.length` | 23（現行仕様） |
| `detectAliasCycles(...).length` | 0（現行仕様） |
| 既存 manifest の再現性 | 所有権・境界・実装順序が不変であること |

---

## 5. 欠陥 D4 — tree 回転の staging decisions が導出も掃除もされない

### 5.1 症状（2 箇所、同一原因）

**(a) パスが導出されていない。** `lib/reserved-root.mjs:83-95` は次を export する:

```js
/**
 * The decisions document the tree rotation reads, as a function of its subject.
 *
 * The subject is the directory the command is run in, because that is where the
 * manifest is published and therefore what the run is about. Nothing else is an
 * input: no argument, no environment variable and no pre-existing file can move
 * it, which is what makes the gate's approval and the finalize's application
 * answers about the same file.
 */
export function reservedTreeDecisionsPath(root) { ... }
```

しかし `run.mjs` は `lib/reserved-root.mjs` を **一切 import していない**:

```bash
grep -n "reserved-root\|RESERVED_" .claude/scripts/workspacify-tree/run.mjs
# → 出力なし
```

`runGate`（`run.mjs:149`）と `runFinalize`（`run.mjs:204`）は `--decisions=<path>` を**引数から**受け取る:

```js
if (!specPath || !decisionsPath) {
  throw new Error('gate requires --spec=<path> and --decisions=<path>');
}
```

すなわち、コメントが保証すると主張している「引数では動かせない」という性質は、**実装には存在しない**。呼び出し側が任意のパスを渡せる。

**(b) 掃除されていない。** `lib/staging-decisions.mjs:31` の `sweepStagingDecisions` は import 元が 1 つだけである:

```bash
grep -rn "sweepStagingDecisions" .claude/scripts/ --include=*.mjs
# → .claude/scripts/workspacify-allocate/run.mjs:28,517,744
#    .claude/scripts/workspacify-tree/lib/staging-decisions.mjs:31（定義）
```

`workspacify-allocate/run.mjs:457,637` が導出するのは `reservedAllocateDecisionsPath(manifestDir)`、つまり `workspacify/allocate/DECISIONS.json` である。`RESERVED_TREE_SUBDIRECTORY = 'tree'` と `RESERVED_ALLOCATE_SUBDIRECTORY = 'allocate'` は別ディレクトリなので、**allocate が掃除するのは自分の staging であって tree の staging ではない。**

結果、`workspacify/tree/DECISIONS.json` は成功した finalize の後も残留する（実測: 2 回目の finalize 成功後も 881KB のファイルが現存）。コマンド文書 Step-3 は次を約束している:

> It is staging, not record: **success finalize sweeps it and empty containing dirs**; refusal preserves it for repair.

### 5.2 危険性

- **文書と実装の矛盾。** コマンド文書は「finalize が掃除する」と書くが、実装は掃除しない。
- **`--decisions` の必須が文書に無い。** 文書 Step-4 / Step-5 のコマンド例は `--spec=` のみを示すが、実装は `--decisions=` が無いと `gate GENERAL` で停止する。**文書どおりに実行すると必ず失敗する。**（本調査でも実際にこの停止を踏んだ。）
- **reserved root の汚染。** `workspacify/` は reverse モードの予約領域である（`RESERVED_ROOT_NAME = 'workspacify'`、走査はこの名前を除外する）。tree の staging が残留したまま `/workspacify-reverse` を実行すると、`DEAD` な入力が予約領域に同居する。
- **承認と適用の同一性が壊れる。** コメントの主張（gate が承認したファイルと finalize が適用するファイルは同一）は、`--decisions` が自由に指定できる以上、呼び出し側の記憶に依存する。

### 5.3 修正方法

**(a)** `runGate` / `runFinalize` の `--decisions` を、`reservedTreeDecisionsPath(process.cwd())` を既定値とする形にする。後方互換のため、引数が渡された場合はそれを使いつつ、**導出パスと一致しない場合は拒否する**のが正しい（コメントが保証する性質を実装に移す）：

```js
import { reservedTreeDecisionsPath } from './lib/reserved-root.mjs';

function resolveDecisionsPath(args) {
  const derived = reservedTreeDecisionsPath(process.cwd());
  const provided = optionValue(args, '--decisions');
  if (provided && path.resolve(provided) !== path.resolve(derived)) {
    throw new Error(
      `the decisions document is derived, not chosen: expected ${derived}, received ${provided}`
    );
  }
  return derived;
}
```

**(b)** `runFinalize` の publish 成功後（`publishAcceptedManifest` が `published: true` を返した直後）に掃除する:

```js
import { sweepStagingDecisions } from './lib/staging-decisions.mjs';
// ...
const published = publishAcceptedManifest({ ... });
if (!published.published) { /* 既存どおり失敗経路 */ }
sweepStagingDecisions(reservedTreeDecisionsPath(process.cwd()));
```

`sweepStagingDecisions` は `force: true` の `rmSync` と、空になった親 2 階層の `rmdirSync` を行うため、`workspacify/tree/` と、他に何も無ければ `workspacify/` も消える。**失敗時は呼ばない**（`refusal preserves it for repair` の契約を保つ）。

**(c)** コマンド文書 `Step-4` / `Step-5` のコマンド例を実装に合わせる。導出パスを採用するなら `--decisions` の記述は不要になり、文書は現状のままで正しくなる。

### 5.4 修正の検証

| 確認 | 期待 |
|---|---|
| 正常系 finalize | `workspacify/tree/` が消える。他に要素が無ければ `workspacify/` も消える |
| 失敗系 finalize（gate 未達） | `workspacify/tree/DECISIONS.json` が残る |
| 導出パスと異なる `--decisions` | 明示的なエラーで停止する |
| 既存成果物の再現 | 同一 decisions から同一 manifest_hash が出ること |

---

## 6. 共通原因と再発防止

### 6.1 原因

4 件はすべて同一の形をしている:

> **検査・導出・掃除のロジックが実装され、export され、コメントで契約を宣言されているが、パイプラインの実行経路から呼ばれていない。または呼ばれているが `status` を決める述語に含まれていない。**

`runGatePipeline` の `status` は `gates.every(g => g.status === PASS)` で決まる。したがって **gate の `status` に反映されない計算は、実行されていても存在しないのと同じ**である。D1 は「同じ gate の中で計算されながら述語から漏れた」、D2/D3 は「gate の外で完結してしまった」、D4 は「gate の外の後処理から漏れた」という差はあるが、根は同じ。

この形の欠陥は通常のレビューで見つかりにくい。**コードは正しく、コメントは正直で、テストも通りうる**（検査関数を単体で呼べば期待どおり動くため）。見つかるのは「出力が主張と食い違ったとき」だけである。

### 6.2 再発防止

1. **検査を追加したら、同じ commit で gate の述語・`counts`・`final_audit` の 3 箇所すべてに通す。** どれか 1 つでも欠けると、計算はされるが誰にも見えない。D1 は `counts` と `final_audit` の両方から漏れていた。
2. **早期 return を持つ検査関数は、全経路で同じキー集合を返す。** D1 の修正 1 がこれである。`lib/database-policy.mjs:24` は守っており、`lib/validation.mjs:341` は守っていない。
3. **mutant テストを定型にする。** 「違反を 1 件注入して gate が FAIL することを確認する」を、gate されたすべての count について行う。本調査で D1 が見つかったのは、たまたまこの手順を踏んだからである。
4. **`grep -rn "\bSYMBOL\b" .claude/scripts/ --include=*.mjs` の結果が定義ファイル 1 件だけなら、その export は死んでいる。** CI に組み込むなら、`lib/` の export のうち参照が定義元のみのものを列挙する検査が有効。
5. **コメントが「〜できない」「〜される」と保証している性質は、テストで固定する。** D4(a) のコメントは「引数では動かせない」と書くが、実装は動かせる。コメントが嘘になっている状態は、CLAUDE.md の「Comments must not lie」に反する。

---

## 7. 適用順序と影響範囲

| 順序 | 欠陥 | 既存成果物への影響 | 再実行の要否 |
|---|---|---|---|
| 1 | D1（修正 1→2→3） | `migrationAtomicity: false` が全パッケージにあるため `COMPLETE` 維持 | 不要 |
| 2 | D2 | 現行成果物は `violations: []` `missingPorts: []` のため G3 PASS 維持 | 不要 |
| 3 | D3(a) | 候補数 1137 不変。ただし `collisions` を gate するなら 23 件の承認が必要になる | **条件付きで必要**（承認を追加して再 gate） |
| 4 | D3(b) | 循環 0 件のため影響なし | 不要 |
| 5 | D4 | 既存 manifest は不変。staging の残留が止まる | 不要 |

D3(a) のみが成果物に触れる。`collisions` を `approvals` で解消する設計を採る場合、`workspacify/tree/DECISIONS.json` に 23 件の承認を追加して gate を再実行する必要がある。承認不要（`counts` に載せるだけ）とするなら再実行は不要。

---

## 付録 A — 再現コマンド

```bash
cd /Users/kawata/shyme/gaia

# A-1 前提の確認: 検査が生きている 2 次元（FAIL することを確認）
node -e "
const fs=require('fs');
const d=JSON.parse(fs.readFileSync('workspacify/tree/DECISIONS.json','utf8'));
d.workspace.find(p=>p.name==='gaia-storage').dbSpecificTypes=['sqlx::PgPool'];
fs.writeFileSync('/tmp/p1.json', JSON.stringify(d));"
node .claude/scripts/workspacify-tree/run.mjs gate "--spec=docs/GaiaSekkeiShiyousho_v31.md" "--decisions=/tmp/p1.json"
# 期待: {"status":"FAIL", ... "db_type_leak_count":1 ... G5:FAIL}

# A-2 D1 の再現: 3 次元目は FAIL しない
node -e "
const fs=require('fs');
const d=JSON.parse(fs.readFileSync('workspacify/tree/DECISIONS.json','utf8'));
d.workspace.find(p=>p.name==='gaia-storage').migrationAsAtomicity=true;
fs.writeFileSync('/tmp/p3.json', JSON.stringify(d));"
node .claude/scripts/workspacify-tree/run.mjs gate "--spec=docs/GaiaSekkeiShiyousho_v31.md" "--decisions=/tmp/p3.json"
# 実測: {"status":"COMPLETE", ... }   ← 欠陥

# A-3 D2 の再現: 検査関数は正しいが呼ばれていない
grep -rn "\bcheckPortAdapterBoundary\b" .claude/scripts/ --include=*.mjs
node -e "
const d=require('/Users/kawata/shyme/gaia/workspacify/tree/DECISIONS.json');
import('/Users/kawata/shyme/gaia/.claude/scripts/workspacify-tree/lib/adapters.mjs')
 .then(({checkPortAdapterBoundary})=>
   console.log(JSON.stringify(checkPortAdapterBoundary({ports:d.adapters.ports, packages:d.workspace}))));"
# 実測: {"violations":[],"missingPorts":[]}

# A-4 D3(b) の再現
grep -rn "\bdetectAliasCycles\b" .claude/scripts/ --include=*.mjs
# 実測: 定義ファイルのみ

# A-5 D3(a) の再現（候補数と衝突数を比較）
node /tmp/wt-collide.mjs
# 実測: current=0 collisions / fixed=23 collisions / candidate count unchanged

# A-6 D4 の再現（パス導出と掃除の未接続）
grep -n "reserved-root\|RESERVED_" .claude/scripts/workspacify-tree/run.mjs      # 出力なし
grep -rn "sweepStagingDecisions" .claude/scripts/ --include=*.mjs                 # allocate のみ
ls -la workspacify/tree/DECISIONS.json                                            # finalize 成功後も残留
```

A-5 は一時スクリプトを要する。内容は `harvestObjectCandidates` と `harvestClaimCandidates` を回し、`normalizeAliases(objects)` と `normalizeAliases(objects, { collisionWith: claims })` の返り値を比較するだけである。

## 付録 B — 証拠の再取得

- 本ドキュメントの行番号は 2026-09-18 時点の `.claude/scripts/workspacify-tree/` に対するものである。ファイルが編集されるとずれるため、参照前に `grep -n` で再確認すること。
- `docs/GaiaSekkeiShiyousho_v31.md` の `source_hash` は `2705c93cd6d82c27b3a6b0ab8dd21d67b0ce38cd43a2b8b7f8c08851a4e39aa7`。付録 A の再現はこの版に対して行った。
- 公開済み manifest の `manifest_hash` は `166ec8abacf34319af71a3dda028ce2a9c6d3c8d32e211de871ef66d1a8ec835`。
