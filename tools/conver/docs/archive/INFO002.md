# INFO002 — `/workspacify-allocate` stops at G5: two machine checks that no authored payload can satisfy

| Field | Value |
| --- | --- |
| Document | INFO002 (defect report and repair instruction) |
| Written | 2026-09-18, by the session that ran `/workspacify-allocate ~/shyme/gaia/WORKSPACIFY-TREE-MANIFEST.json` |
| Verdict | **Defect in the scripts** (`.claude/scripts/workspacify-*`), not in the command definition, not in the authored payload |
| Blocking gates | `G5` (WIG). A second configuration blocks `G3` instead — the two are mutually exclusive, see §4.5 |
| Fix applied so far | **None.** This document is the repair instruction; no pipeline source file has been modified |
| Workspace root | `/Users/kawata/shyme/gaia` |
| Input manifest | `/Users/kawata/shyme/gaia/WORKSPACIFY-TREE-MANIFEST.json`, self-hash `166ec8abacf34319af71a3dda028ce2a9c6d3c8d32e211de871ef66d1a8ec835` |
| Source specification | `/Users/kawata/shyme/gaia/GaiaSekkeiShiyousho_v31.md`, SHA-256 `2705c93cd6d82c27b3a6b0ab8dd21d67b0ce38cd43a2b8b7f8c08851a4e39aa7` |
| Authored payload | `/Users/kawata/shyme/gaia/workspacify/allocate/DECISIONS.json` (28 seeds, 82 contracts, 2.3 MB) — complete, passes G0–G4, must **not** be re-authored |

## 0. How to use this document

You are the AI asked to fix the pipeline. Read §1 first, then implement §4.7 and §5.7 exactly, write the tests of §6 **before** the fix (project law: Red → Green → Refactor), run §8 to completion. Every path in this document is absolute; every command is copy-pasteable; every expected output is the literal one observed. Where a decision is genuinely the project owner's (only one such place exists: §4.8), the document states which option to take if nobody answers.

## 1. Verdict in one paragraph

`/workspacify-allocate` cannot publish this workspace, and no authored payload can change that. Two independent checks in `.claude/scripts/workspacify-allocate/lib/wig.mjs` are unsatisfiable against the stage-1 manifest that `/workspacify-tree` certified: `proof_lifecycle_break` demands a `proof_verification` clause for a boundary whose declared `stage2_contract_scope` does not contain that clause (the contract validator forbids it in the very same run — §4.5 proves both configurations fail), and `forbidden_semantic_flow_path` evaluates the manifest's `forbidden_layer_rules` **transitively**, so the canonical `interfaces → core → protocol` composition is a violation even though stage 1 audits the same rules **per declared pair** and certified this manifest with `layer_violation_count: 0` (§5). Both defects are in stage-2 code; both are one-function fixes; neither the manifest, the specification, the seeds nor the contracts may be touched.

## 2. Environment and exact inputs

```
Node:        v26.0.0   (darwin 25.2.0, zsh)
Workspace:   /Users/kawata/shyme/gaia          (== dirname of the manifest, per the command contract)
Manifest:    /Users/kawata/shyme/gaia/WORKSPACIFY-TREE-MANIFEST.json   (7,801,956 bytes, self-hash 166ec8ab…)
Spec:        /Users/kawata/shyme/gaia/GaiaSekkeiShiyousho_v31.md       (919,969 bytes, 13,976 lines, hash 2705c93c…)
Decisions:   /Users/kawata/shyme/gaia/workspacify/allocate/DECISIONS.json (2,359,583 bytes)
```

Manifest facts the two defects depend on (Appendix A carries them verbatim):

- 28 packages, 31 spec segments (29 material, 2 prose-only), 82 normal edges, 82 boundaries, 11 implementation waves, 1,301 owned inventory items.
- Exactly **one** edge in the whole workspace carries `connectionKind: "typed_protocol_input"`: `pkg-0014 → pkg-0001`, which is boundary-036.
- `dependencies.forbidden_layer_rules` is the five-row table of Appendix A.3; in this workspace only the `interfaces` row has transitive hits (3 of its 3 packages), and no row has a direct hit — which is why stage 1 certified the manifest.

Files this document identifies as defective (SHA-256 recorded so you can prove you are editing the same revision):

```
edc3ac788949a7a377a5c7e7c3c5aeda0132b7f1ac17f430c71a4fb66f2c6ae6  .claude/scripts/workspacify-allocate/lib/wig.mjs
f8827f98629f71a54d70f6bc017a167267bbde80d9f2b46ea6cc2726cfe59af3  .claude/scripts/workspacify-tree/lib/contract-clauses.mjs
805df4266f2d57ea8c0f0bb2fceb3942b6dc63add82b6f4599d9c7e98c03a11e  .claude/scripts/workspacify-allocate/lib/contract-model.mjs
387f0b03bd2340c1bec7ef4ed80766d93c6b2c3ee8974376bcf7f2475657a3b1  .claude/scripts/workspacify-tree/lib/dag.mjs
75cd388430ab17f429376c9acfb82e273731353c9c5d07bfb78f9e800a1d8d84  .claude/scripts/workspacify-tree/lib/workspace-model.mjs
```

## 3. The failing run, reproduced

```bash
cd /Users/kawata/shyme/gaia
node .claude/scripts/workspacify-allocate/run.mjs validate "$HOME/shyme/gaia/WORKSPACIFY-TREE-MANIFEST.json"
# {"status":"PASS","workspaceRoot":"/Users/kawata/shyme/gaia","sourceHash":"2705c93c…","manifestHash":"166ec8ab…","gateSummary":"G0:PASS G1:PASS"}

node .claude/scripts/workspacify-allocate/run.mjs gate "$HOME/shyme/gaia/WORKSPACIFY-TREE-MANIFEST.json"
# {"status":"FAIL","gateId":"G5","reason":"workspace integration graph violations: proof_lifecycle_break(contract-boundary-036): the contract requires proof semantics but names no verifier; forbidden_semantic_flow_path(pkg-0017): forbidden semantic flow: pkg-0017 -> pkg-0016 -> pkg-0013"}
```

`G0`, `G1`, `G2`, `G3` and `G4` pass on this payload: all 28 seeds render, parse and pass their local checks (14 headings each, allocation index bijective against the manifest ownership table, three reference paths agreeing with the files on disk), and all 82 boundaries are carried by both endpoints with identical clause groups, owners, connection kind and source refs. The two failures are the only thing standing between this payload and `finalize`.

## 4. Defect D1 — `proof_lifecycle_break`: the WIG demands a clause the contract validator forbids

### 4.1 Symptom

```
proof_lifecycle_break(contract-boundary-036): the contract requires proof semantics but names no verifier
```

boundary-036 is `pkg-0014 gaia-operation → pkg-0001 gaia-foundation`, declared by stage 1 as:

```json
{"consumer_package":"pkg-0014","dependency_reason_code":"operation-envelope","id":"boundary-036",
 "provider_package":"pkg-0001",
 "stage2_contract_scope":["input","output","preconditions","postconditions","invariants","errors","canonicalization","signature","tests"]}
```

with the normal edge `{"from":"pkg-0014","to":"pkg-0001","connectionKind":"typed_protocol_input","reason":"the request and receipt are canonical signed envelopes","reasonCode":"operation-envelope","kind":"permitted"}`.

The authored contract for that boundary carries exactly the declared scope: `input, output, preconditions, postconditions, invariants, errors, canonicalization, signature, tests`. It is complete and correct against the declaration.

### 4.2 Call chain

```
run.mjs:442   renderAllSeeds(...)                      → renders and locally checks every seed
run.mjs:330   buildIntegrationGraph(...)               → the WIG
run.mjs:331   runGraphViolations({ graph, manifest })  → the violation class is raised here
wig.mjs:88    declaresClause(edge.contract, manifest, 'proof_verification')
wig.mjs:137   return scope.includes(clause) || (clause === 'proof_verification' && scope.includes('signature'))
```

The same contract was already validated by the local checks at `run.mjs:302` → `seed-local-checks.mjs:79` → `contract-model.mjs:170` (`validateSeedContractEdges`) → `contract-model.mjs:118`:

```js
const outOfScopeClauses = clauseNames.filter((clause) => CONTRACT_CLAUSES.includes(clause) && !declaredScope.includes(clause));
```

and a single out-of-scope clause makes the local check fail, which `run.mjs:303-305` reports as `G3`.

### 4.3 The two rules, verbatim

`wig.mjs:85-90` — the requirement:

```js
    // A clause is only required when stage 1 declared it in the boundary scope.
    if (declaresClause(edge.contract, manifest, 'tests') && !hasClause(edge.contract, 'tests')) {
      add('missing_test_obligation', entry, 'the contract states no test obligation');
    }
    if (declaresClause(edge.contract, manifest, 'proof_verification') && !hasClause(edge.contract, 'proof_verification')) {
      add('proof_lifecycle_break', entry, 'the contract requires proof semantics but names no verifier');
    }
```

`wig.mjs:133-138` — the predicate that turns `signature` into a `proof_verification` obligation:

```js
/** Whether stage 1 declared this clause for the contract's boundary. */
function declaresClause(contract, manifest, clause) {
  const boundary = (manifest?.dependencies?.boundaries ?? []).find((entry) => `contract-${entry.id}` === contract?.contract_id);
  const scope = boundary?.stage2_contract_scope ?? [];
  return scope.includes(clause) || (clause === 'proof_verification' && scope.includes('signature'));
}
```

`contract-model.mjs:117-118` — the refusal that makes the requirement unsatisfiable:

```js
  const unknownClauses = clauseNames.filter((clause) => !CONTRACT_CLAUSES.includes(clause));
  const outOfScopeClauses = clauseNames.filter((clause) => CONTRACT_CLAUSES.includes(clause) && !declaredScope.includes(clause));
```

`contract-clauses.mjs:46-54` — where the declared scope comes from:

```js
const CLAUSES_BY_CONNECTION_KIND = Object.freeze({
  value_only: Object.freeze(['errors', 'canonicalization', 'tests']),
  typed_protocol_input: Object.freeze(['errors', 'canonicalization', 'signature', 'tests']),
  proof_verification: Object.freeze(['errors', 'canonicalization', 'signature', 'proof_verification', 'tests']),
  state_transition: Object.freeze(['errors', 'state_ownership', 'idempotency', 'atomicity', 'ordering', 'finality', 'tests']),
  external_effect: Object.freeze(['errors', 'idempotency', 'atomicity', 'ordering', 'finality', 'tests']),
  composition_obligation: Object.freeze(['errors', 'ordering', 'tests']),
  port_contract: Object.freeze(['errors', 'canonicalization', 'tests']),
});
```

and `workspacify-tree/run.mjs:837` computes a boundary's scope as `buildBoundaryContractScope(edge.connectionKind)`.

### 4.4 Root cause

The clause vocabulary distinguishes three things: `canonicalization`, `signature`, `proof_verification`. The scope table gives a `typed_protocol_input` boundary `signature` (it takes signed input) and gives a `proof_verification` boundary both `signature` and `proof_verification` (it also verifies a proof). `wig.mjs:137` adds a fourth rule of its own — "a scope that contains `signature` also requires `proof_verification`" — which the scope table does not express and which the contract validator refuses. For the one boundary whose kind is `typed_protocol_input`, the two rules are mutually exclusive: the WIG requires the clause, the validator rejects it.

### 4.5 Proof of unsatisfiability (run both configurations yourself)

Configuration 1 — the clause omitted (this is the current payload):

```bash
node .claude/scripts/workspacify-allocate/run.mjs gate "$HOME/shyme/gaia/WORKSPACIFY-TREE-MANIFEST.json"
# {"status":"FAIL","gateId":"G5","reason":"workspace integration graph violations: proof_lifecycle_break(contract-boundary-036): …"}
```

Configuration 2 — the clause added to both sides of the contract (the experiment was run and then reverted):

```bash
# add  "proof_verification": "<sentence>"  to contract-boundary-036's clauses on both sides
node .claude/scripts/workspacify-allocate/run.mjs gate "$HOME/shyme/gaia/WORKSPACIFY-TREE-MANIFEST.json"
# {"status":"FAIL","gateId":"G3","reason":"seed pkg-0001 local checks failed: package pkg-0001 contract contract-boundary-036 declares the out-of-scope clause \"proof_verification\""}
```

No third configuration exists: `clauses` is the only authored surface, and its two states are the two failures above.

### 4.6 Blast radius

- Exactly 1 of the 82 boundaries is affected (`boundary-036`); exactly 1 of the 10 connection kinds (`typed_protocol_input`) can produce the contradiction.
- Three further connection kinds — `checkpoint-reference`, `adapter-implementation`, `conformance` — have no row in `CLAUSES_BY_CONNECTION_KIND` and therefore fall back to the five core clauses (`contract-clauses.mjs:62-66`). That is by design and is *not* part of this defect, but a fixer who edits the table must not "complete" those rows: boundary-032 (`checkpoint-reference`) has an authored contract with exactly the five core clauses and the WIG's `tests` requirement correctly stays silent for it.
- Any future workspace that declares a `typed_protocol_input` edge hits this identical wall. The fix is not specific to this manifest.

### 4.7 Fix D1 (primary) — make the WIG read the declared scope, and nothing else

Edit `.claude/scripts/workspacify-allocate/lib/wig.mjs`, function `declaresClause` (currently lines 133-138). Replace it with:

```js
/**
 * Whether stage 1 declared this clause for the contract's boundary.
 *
 * The boundary's declared scope is the whole requirement. It already carries
 * `signature` for a boundary that takes signed input and `proof_verification` for
 * one that verifies a proof, so inferring either from the other would demand a
 * clause the contract validator refuses as out of scope in the same run — a
 * requirement no authored payload can satisfy.
 */
function declaresClause(contract, manifest, clause) {
  const boundary = (manifest?.dependencies?.boundaries ?? []).find((entry) => `contract-${entry.id}` === contract?.contract_id);
  const scope = boundary?.stage2_contract_scope ?? [];
  return scope.includes(clause);
}
```

Rationale, stated so a reviewer can audit the decision:

1. The declared scope is the machine's own declaration of what a boundary must state. A checker that requires a clause the same run's validator forbids is not strictness; it is an unsatisfiable predicate, and an unsatisfiable predicate catches nothing (it rejects 100% of payloads, including every correct one).
2. Strictness is preserved where the design places it: `proof_verification` remains required for every boundary whose scope declares it (the `proof_verification` kind, 7 edges in this workspace), and the five core clauses remain mandatory for all 82.
3. The obligation the check is named for — "requires proof semantics but names no verifier" — stays enforced for every boundary that actually requires proof semantics. For a signed-envelope boundary, the verifier is named in the `signature` clause, which the authored contract does state (`"…the presented signature is verified against the provider-bound public key…"`).

Nothing else in `wig.mjs` changes. `hasClause`, `missing_test_obligation` and the other violation classes are untouched.

### 4.8 Alternative D1-A — declare `proof_verification` in the scope table instead

Take this path **only if the project owner rules that a boundary taking signed input must also name a proof verifier**. If nobody answers, implement §4.7.

1. Edit `.claude/scripts/workspacify-tree/lib/contract-clauses.mjs:48`:

```js
  typed_protocol_input: Object.freeze(['errors', 'canonicalization', 'signature', 'proof_verification', 'tests']),
```

2. Re-publish stage 1 so the manifest records the new scope (the existing stage-1 decisions are still on disk at `/Users/kawata/shyme/gaia/workspacify/tree/DECISIONS.json`, 909,077 bytes — do **not** re-author them):

```bash
cd /Users/kawata/shyme/gaia
node .claude/scripts/workspacify-tree/run.mjs gate   "--spec=docs/GaiaSekkeiShiyousho_v31.md"
node .claude/scripts/workspacify-tree/run.mjs finalize "--spec=docs/GaiaSekkeiShiyousho_v31.md"
```

The republished manifest keeps the same boundary ids (they are `boundary-NNN` by normal-edge order, and the edge order does not change), so every contract id in the authored payload stays valid. `GaiaSekkeiShiyousho_v31.md` must still exist at the workspace root (stage 1 records only the basename; see §8.1).

3. Add the missing clause to `contract-boundary-036` in the authored payload (both sides) — the exact text is in Appendix C — then re-run §8 from `validate`.

Do **not** mix the two paths: with D1-A the WIG keeps its `signature ⇒ proof_verification` implication, and the clause must exist.

## 5. Defect D2 — `forbidden_semantic_flow_path`: reachability where the policy declares pairs

### 5.1 Symptom

```
forbidden_semantic_flow_path(pkg-0017): forbidden semantic flow: pkg-0017 -> pkg-0016 -> pkg-0013
```

### 5.2 The rule and the edges

`wig.mjs:181-215` (verbatim, abridged only in the inner DFS bookkeeping):

```js
/** A reachable path from a forbidden source to a forbidden target. */
function findForbiddenFlows({ graph, manifest }) {
  const rules = manifest?.dependencies?.forbidden_layer_rules ?? [];
  if (rules.length === 0) {
    return [];
  }
  const nodeById = new Map(graph.nodes.map((node) => [node.package_id, node]));
  const adjacency = new Map();
  for (const edge of graph.edges) {
    adjacency.set(edge.consumer_package, [...(adjacency.get(edge.consumer_package) ?? []), edge.provider_package]);
  }
  const paths = [];
  for (const rule of rules) {
    const sources = graph.nodes.filter((node) => node.layer === rule.from_layer).map((node) => node.package_id);
    const targets = new Set(graph.nodes.filter((node) => (rule.forbidden_to ?? []).includes(node.layer)).map((node) => node.package_id));
    for (const source of sources) {
      const stack = [[source]];
      const visited = new Set([source]);
      while (stack.length > 0) {
        const path = stack.pop();
        const current = path[path.length - 1];
        if (targets.has(current) && current !== source) {
          paths.push(path);
          break;
        }
        for (const next of adjacency.get(current) ?? []) {
          if (!visited.has(next)) {
            visited.add(next);
            stack.push([...path, next]);
          }
        }
      }
    }
  }
  return paths.slice(0, 1);
}
```

The graph it walks is the 82 declared boundaries (every boundary is carried by both endpoints, or `G4` fails first), so the edge set is stage 1's, not the author's. The manifest declares:

```
pkg-0017 gaia-rest  (interfaces) → pkg-0016 gaia-core (core)      boundary-059
pkg-0018 gaia-websocket (interfaces) → pkg-0016 gaia-core (core)  boundary-060
pkg-0019 gaia-cli   (interfaces) → pkg-0016 gaia-core (core)      boundary-061
pkg-0016 gaia-core  (core) → pkg-0013 gaia-time (protocol)        (one of core's 16 outgoing edges)
```

so `interfaces → core → protocol` is reachable from all three interface packages, against the `interfaces` row of `forbidden_layer_rules` (`forbidden_to: ["protocol","ports","adapters"]`).

### 5.3 Why this is a defect and not a real violation

Stage 1 audits the same table **per declared pair**. `workspacify-tree/lib/dag.mjs:96-113` walks each edge and calls `violatesLayerRule(fromPackage, toPackage)` (`dag.mjs:192-201`), which compares the *two endpoints' layers* and nothing else; this manifest passed that audit with `final_audit.layer_violation_count: 0` and `forbidden_edge_count: 0`. The table's own doc comment says what it is: `/** Layer pairs forbidden by §11.2 (target layer per source layer). */`. A *pair* rule is a statement about one edge; stage 2 additionally reads it as a statement about reachability, and under that reading the row is unsatisfiable for any workspace in which interfaces reach core (§31.1 makes that mandatory: interfaces are projections of core operations) and core reaches protocol (core consumes protocol packages).

Empirical confirmation over the whole table: with the transitive reading, `interfaces` is the only source layer with hits — all three of its packages — while `foundation`, `protocol`, `ports` and `core` have zero; with the pair reading, zero hits for every row, which is exactly what stage 1 certified.

### 5.4 Blast radius

Any workspace produced by `/workspacify-tree` — the table is generated from the compiled `LAYER_FORBIDDEN_TARGETS` (`workspacify-tree/run.mjs:820-825`, `workspace-model.mjs:25-32`), not authored — that has at least one interface package, one core package and one protocol package. That is every realistic Gaia workspace. The check as written cannot pass except on a degenerate workspace.

### 5.5 Fix D2 — evaluate the declared pairs, keep the violation class

Edit `.claude/scripts/workspacify-allocate/lib/wig.mjs`, function `findForbiddenFlows` (currently lines 181-215). Replace its body with the direct-pair evaluation:

```js
/**
 * A graph edge whose two endpoints are a pair the manifest forbids.
 *
 * The manifest declares layer PAIRS (`forbidden_layer_rules`), and stage 1 audits the
 * same table pair by pair. Reading it as reachability instead would flag every
 * composition that routes a higher layer through its mediator — interfaces reach
 * protocol through core by design — and a rule no workspace can satisfy proves
 * nothing. The mediated case is covered where it belongs: a layer that must not be
 * reached directly is still reported by `violatesLayerRule` on the offending edge.
 */
function findForbiddenFlows({ graph, manifest }) {
  const rules = manifest?.dependencies?.forbidden_layer_rules ?? [];
  if (rules.length === 0) {
    return [];
  }
  const layerByPackage = new Map(graph.nodes.map((node) => [node.package_id, node.layer]));
  const paths = [];
  for (const rule of rules) {
    for (const edge of graph.edges) {
      if (layerByPackage.get(edge.consumer_package) !== rule.from_layer) {
        continue;
      }
      if (!(rule.forbidden_to ?? []).includes(layerByPackage.get(edge.provider_package))) {
        continue;
      }
      paths.push([edge.consumer_package, edge.provider_package]);
    }
  }
  return paths.slice(0, 1);
}
```

The caller (`wig.mjs:107-109`) and the violation class `forbidden_semantic_flow_path` are unchanged, so the published WIG summary keeps the same shape and the check remains manifest-driven.

Alternatives considered and rejected:

- **Delete the check and rely on `layer_violation`** (which `runGraphViolations` already raises per edge via `violatesLayerRule`, `wig.mjs:81`). Rejected: the two read different sources of truth — `layer_violation` uses the compiled `LAYER_FORBIDDEN_TARGETS` plus the production→conformance ban, `findForbiddenFlows` uses the manifest's declaration. Keeping both means a manifest whose rules were narrowed is still caught by the compiled table. Do not delete either.
- **Exempt paths that pass through a "legitimate mediator"**. Rejected: there is no such notion in the policy, and inventing one would hide a real direct violation behind a hop.

### 5.6 What must still fail after the fix

The `layer_violation` class (direct pairs, compiled table) is unchanged and still fires on a direct `interfaces → protocol` edge, a `core → adapters` edge, a production package → conformance package edge, and so on. The fix narrows nothing about direct violations; it removes a reachability predicate that could never be satisfied.

## 6. Tests to write first (Red → Green)

Project law: write these tests, run them, watch them fail for the reason §4.5/§5 states, then apply the fix, then watch them pass. Do not modify them afterwards.

### 6.1 Where

`.claude/tests/` is walked by `node .claude/tests/run-all.js`, which matches `tests/**/*.test.{js,cjs}` relative to `.claude/` — note `.mjs` is **not** matched, and `.claude/package.json` declares CommonJS, so write `*.test.js` and load the ESM modules with a dynamic import, exactly as `.claude/tests/lib/changed-files-store.test.js:26` already does:

```js
const { pathToFileURL } = require('node:url');
const wig = await import(pathToFileURL(path.resolve(__dirname, '../../scripts/workspacify-allocate/lib/wig.mjs')).href);
```

Place both suites in one file: **`.claude/tests/lib/workspacify-wig.test.js`**.

### 6.2 D1 cases

Build the graph literal directly — `runGraphViolations({ graph, manifest })` needs only `graph.nodes`, `graph.edges` and a `manifest` with `dependencies.boundaries`, `dependencies.normal_edges`, `dependencies.forbidden_edges`, `dependencies.forbidden_layer_rules` and `workspace.packages`. `graph.edges[i]` is `{ contract_id, boundary_id, consumer_package, provider_package, connection_kind, contract }` where `contract` is the canonical edge (build it with `buildContractEdge` from `contract-model.mjs` so the fixture cannot drift from the real shape).

| # | Fixture | Expected |
| --- | --- | --- |
| D1.1 | Boundary scope `[input, output, preconditions, postconditions, invariants, errors, canonicalization, signature, tests]`; contract carries exactly those clauses | `ok === true`, no violation (RED today: `proof_lifecycle_break`) |
| D1.2 | Same boundary, but the contract also carries a `proof_verification` clause | `violations` does **not** contain `proof_lifecycle_break` (the scope declares no such clause, so the WIG must not demand one) |
| D1.3 | Boundary scope includes `proof_verification`; contract omits it | `ok === false`, `violations` contains `proof_lifecycle_break` (regression guard: the check is not weakened) |
| D1.4 | Boundary scope includes `tests`; contract omits the `tests` clause | `ok === false`, `missing_test_obligation` (regression guard) |
| D1.5 | The real manifest's boundary-036 record + its authored contract (Appendix C, absent variant) | `ok === true` after the fix |

D1.2 is the case the fix removes, and it is the negative half of the contradiction: a contract carrying a clause its scope does not declare is rejected by `validateContractEdge` (`contract-model.mjs:118` → `outOfScopeClauses`), which `seed-local-checks.mjs:84` turns into a `G3` failure. So the WIG must not require that clause. Assert both halves: the WIG reports no `proof_lifecycle_break` for D1.2, and `validateContractEdge` for the same edge returns `outOfScopeClauses: ['proof_verification']`. Together they document that D1's fix is the only consistent resolution of the pair.

### 6.3 D2 cases

| # | Fixture | Expected |
| --- | --- | --- |
| D2.1 | Nodes: `i` (interfaces), `c` (core), `p` (protocol). Edges `i→c`, `c→p`. Rule `{from_layer: 'interfaces', forbidden_to: ['protocol','ports','adapters']}` | `ok === true` (RED today: `forbidden_semantic_flow_path`) |
| D2.2 | Same nodes, plus a direct `i→p` edge | `ok === false`, `forbidden_semantic_flow_path` (regression guard: direct violations are still caught) |
| D2.3 | Same nodes as D2.1, rules empty | `ok === true` (unchanged behaviour) |
| D2.4 | `c→a` where `a` is an adapter, rule `{from_layer:'core', forbidden_to:['adapters']}` | `ok === false`, both `layer_violation` and `forbidden_semantic_flow_path` — assert at least that `ok === false` |

Fixtures must set `package.kind` to a production kind and give every node `responsibilities: []`, `path` and `name`, because `buildIntegrationGraph` copies those fields.

### 6.4 Run

```bash
node .claude/tests/run-all.js
# expect every suite green, and the new file listed in the output
```

## 7. Prohibited changes

Do not do any of the following; each one produces a green run that proves nothing.

- Do not edit `WORKSPACIFY-TREE-MANIFEST.json` — not its `forbidden_layer_rules`, not boundary-036's `stage2_contract_scope`, not anything. It is the locked, self-hashed stage-1 record; editing it breaks `G0` (self-hash) and destroys the provenance of every seed.
- Do not edit `GaiaSekkeiShiyousho_v31.md` or `docs/GaiaSekkeiShiyousho_v31.md`.
- Do not re-author or hand-edit the 28 seeds or the 82 contracts in `workspacify/allocate/DECISIONS.json` except for the single clause of Appendix C when — and only when — you take path D1-A.
- Do not weaken any other check to compensate: keep `missing_test_obligation`, keep `layer_violation`, keep all five core clauses mandatory, keep `validateContractEdge`'s out-of-scope refusal. The whole point of D1's fix is that the *scope* decides, not that a check disappears.
- Do not add an allow-list, an environment flag, or a `--skip` option to route around the two checks.
- Do not delete `workspacify/allocate/DECISIONS.json`; it is the repair artefact and the only complete copy of the authored payload. If you need a scratch copy, take one — never move the original.
- Do not touch `crates/` while fixing (see §8.1 for when it must be moved, and restore it afterwards if the run does not publish).

## 8. End-to-end re-run after the fix

### 8.1 Preconditions

1. The specification must sit **beside the manifest**, because stage 1 records only `path.basename(specPath)` (`workspacify-tree/run.mjs:904`) and stage 2 resolves that basename against the manifest directory (`tree-manifest-input.mjs:203-224`). It is already there:

   ```bash
   shasum -a 256 /Users/kawata/shyme/gaia/GaiaSekkeiShiyousho_v31.md
   # 2705c93cd6d82c27b3a6b0ab8dd21d67b0ce38cd43a2b8b7f8c08851a4e39aa7   (must equal input.source_hash)
   ```

2. Every planned path must be absent or an empty directory (`G2.4`). The repository currently holds a 89-directory, file-less placeholder skeleton at `crates/` (the v30 layout); the plan publishes a v31 `crates/` tree, so it must be moved aside first. Use this exact pair of commands so the operation is reversible:

   ```bash
   cd /Users/kawata/shyme/gaia
   find crates -type d | sort > /tmp/crates-pre-v31-dirs.txt      # record it first
   mv crates /tmp/crates-pre-v31                                  # then move it aside
   ```

   After a successful publication, keep the backup until you have inspected the published tree; to restore it, `rm -rf crates && mv /tmp/crates-pre-v31 crates`.

3. If you took path D1-A, §4.8 is already done (table edited, stage 1 republished, clause added).

### 8.2 The run

```bash
cd /Users/kawata/shyme/gaia
node .claude/scripts/workspacify-allocate/run.mjs validate "$HOME/shyme/gaia/WORKSPACIFY-TREE-MANIFEST.json"
node .claude/scripts/workspacify-allocate/run.mjs plan     "$HOME/shyme/gaia/WORKSPACIFY-TREE-MANIFEST.json"
node .claude/scripts/workspacify-allocate/run.mjs gate     "$HOME/shyme/gaia/WORKSPACIFY-TREE-MANIFEST.json"
node .claude/scripts/workspacify-allocate/run.mjs finalize "$HOME/shyme/gaia/WORKSPACIFY-TREE-MANIFEST.json"
```

### 8.3 Expected output at each step

```
validate → {"status":"PASS","workspaceRoot":"/Users/kawata/shyme/gaia","sourceHash":"2705c93c…","manifestHash":"166ec8ab…","gateSummary":"G0:PASS G1:PASS"}
plan     → {"status":"PASS","plannedDirectoryCount":37,"relativeDirs":[…37 entries…],"gateSummary":"G2:PASS"}
gate     → {"status":"COMPLETE","gateSummary":"G0:PASS G2:PASS G3:PASS G4:PASS G5:PASS order:PASS semantic:APPROVED"}
finalize → {"published":true,"workspaceRoot":"/Users/kawata/shyme/gaia",
            "allocateManifestPath":"/Users/kawata/shyme/gaia/WORKSPACIFY-ALLOCATE-MANIFEST.json",
            "allocateManifestHash":"<64 hex>","residue":[…],
            "inputManifestHash":"166ec8abacf34319af71a3dda028ce2a9c6d3c8d32e211de871ef66d1a8ec835",
            "directoryCount":37,"packageCount":28,"seedCount":28,"contractCount":82,"waveCount":11,
            "segmentCoverage":"29/31",
            "gateSummary":"G0:PASS G2:PASS G3:PASS G4:PASS G5:PASS order:PASS G6:PASS semantic:APPROVED"}
```

`segmentCoverage` is `29/31` and not `31/31` by design: 29 of the 31 segments carry inventory material and are referenced by the seeds, and the two prose-only segments (`s-000001`, `s-000028`) are recorded as `non_material_segments`; `source_coverage.uncovered` must be empty. `contractCount` is the WIG edge count (82), not the 164 per-side entries.

### 8.4 Acceptance checks on the published artefacts

```bash
cd /Users/kawata/shyme/gaia
find crates -name RFC-SEED.md | wc -l                       # 28
node -e "const m=require('./WORKSPACIFY-ALLOCATE-MANIFEST.json');console.log(m.status,m.source_coverage.uncovered.length,m.wig.violations.length,m.gates.map(g=>g.id+':'+g.status).join(' '),m.semantic_review.status)"
# COMPLETE 0 0 G4:PASS G5:PASS APPROVED
ls workspacify/allocate 2>/dev/null                          # must no longer hold DECISIONS.json (staging is swept on success)
python3 -c "import json,sys;d=json.load(open('WORKSPACIFY-ALLOCATE-MANIFEST.json'));print(len(d.seed_index),d.artifact_kind,d.completion_decision)"
# 28 workspacify-allocate-manifest COMPLETE
```

The published allocate manifest is the sole machine authority; `DECISIONS.json` and the staging directories are deleted by `finalize` after the reload verification passes.

## 9. Rollback

- The two fixes touch one function each in `wig.mjs`. Revert with `git checkout -- .claude/scripts/workspacify-allocate/lib/wig.mjs` (record the ticket first) and re-run `validate`/`gate` to return to the documented failure.
- If you took path D1-A, the changes are three: the table row in `contract-clauses.mjs`, a republished manifest (git-untracked; the previous one is not recoverable from git — keep a copy at `/tmp/WORKSPACIFY-TREE-MANIFEST.json.pre-d1a` before republishing), and the added clause in `DECISIONS.json`.
- A `finalize` that fails publishes nothing and removes what it staged; the workspace keeps the pre-run directory set (this was verified in the failing run: nothing was written outside `workspacify/allocate/`).

## Appendix A — manifest facts

### A.1 boundary-036 (`contract-boundary-036`)

```json
{"consumer_package":"pkg-0014","dependency_reason_code":"operation-envelope","id":"boundary-036",
 "provider_package":"pkg-0001",
 "stage2_contract_scope":["input","output","preconditions","postconditions","invariants","errors","canonicalization","signature","tests"]}
```

Consumer `pkg-0014 gaia-operation` (`crates/protocol/gaia-operation`, layer `protocol`, kind `production-library`); provider `pkg-0001 gaia-foundation` (`crates/foundation/gaia-foundation`, layer `foundation`, kind `production-library`). Edge reason: *"the request and receipt are canonical signed envelopes"*, reason code `operation-envelope`, connection kind `typed_protocol_input`.

### A.2 Edge kinds in this workspace

```
value_only 28 | state_transition 5 | proof_verification 7 | checkpoint-reference 4 |
port_contract 5 | composition_obligation 15 | adapter-implementation 7 | external_effect 2 |
conformance 8 | typed_protocol_input 1
```

### A.3 `dependencies.forbidden_layer_rules`

```json
[{"from_layer":"foundation","forbidden_to":["protocol","ports","adapters","core","interfaces","conformance"]},
 {"from_layer":"protocol","forbidden_to":["ports","adapters","core","interfaces","conformance"]},
 {"from_layer":"ports","forbidden_to":["adapters","core","interfaces"]},
 {"from_layer":"core","forbidden_to":["adapters"]},
 {"from_layer":"interfaces","forbidden_to":["protocol","ports","adapters"]}]
```

Generated by `workspacify-tree/run.mjs:820-825` from `LAYER_FORBIDDEN_TARGETS` (`workspace-model.mjs:25-32`). Transitive hits per row in this workspace: foundation 0, protocol 0, ports 0, core 0, **interfaces 3** (`pkg-0017`, `pkg-0018`, `pkg-0019`, each via `pkg-0016 → pkg-0013`). Direct (pair) hits: 0 in every row — which is what stage 1 certified.

### A.4 Layer axis

`foundation < protocol < ports < adapters < core < interfaces < conformance` (`workspace-model.mjs:11`). Note that `adapters` sits *below* `core`, so `core → ports → …` can never reach an adapter: the `core` row holds under both readings.

## Appendix B — what is already authored (do not re-author)

`workspacify/allocate/DECISIONS.json` (2,359,583 bytes) holds:

- `seeds[]` — 28 entries, one per package, each with `aiSections` keys `4`…`13` (1,528,545 characters total across the 28 seeds) and `contractEdges` (164 entries = 82 boundaries × 2 sides, each side mirrored byte-for-byte from one authored source so the bilateral gate compares identical content).
- `self_grill` — `passes: 2`, `converged: true`, 10 rounds covering all five focuses (`implementer`, `counterpart`, `test`, `grill`, `adversarial`), the pass-2 rounds empty, and 8 typed `residual` entries (`origin: "stage2_self_grill"`, addressed to `pkg-0006`, `pkg-0024`, `pkg-0014` ×2, `pkg-0005`, `pkg-0007`, `pkg-0015`, `pkg-0002`). The renderer appends each `grill_question` verbatim to section 12 of the target seed; the parity check requires it to be there.
- `semantic_review` — `status: "APPROVED"`, with the statement and approver recorded.

The authoring scratch material (packets, digests, per-package seed JSON, per-boundary contract batches, and the merge/build scripts) is under `/tmp/ws/`; it is not part of the workspace and `/tmp` may be cleared, but it is regenerable: `run.mjs packet <manifest>` reproduces the packets, and the decisions payload is the authoritative record of what was authored.

## Appendix C — the `proof_verification` clause for boundary-036 (path D1-A only)

If, and only if, you take §4.8, add this clause to `contract-boundary-036` on **both** sides (the renderer mirrors the authored entry, but if you edit the payload by hand, edit both `seeds[].contractEdges[]` entries with `contract_id == "contract-boundary-036"`):

```json
"proof_verification": "The provider publishes the verification procedure for the envelope signature as a pure function of the canonical bytes and the bound public key, so the consumer verifies a request or receipt with no shared session state; a verification that cannot be reduced to that function is refused rather than approximated."
```

Then confirm the addendum did not disturb the mirror:

```bash
node -e "
const d=require('/Users/kawata/shyme/gaia/workspacify/allocate/DECISIONS.json');
const sides=d.seeds.flatMap(s=>s.contractEdges).filter(e=>e.contract_id==='contract-boundary-036');
console.log(sides.length, JSON.stringify(sides[0].clauses.proof_verification)===JSON.stringify(sides[1].clauses.proof_verification));
"
# 2 true
```

## Appendix D — where each gate and check lives

| Gate | Raised by | Reads |
| --- | --- | --- |
| G0 / G1 | `tree-manifest-input.mjs` `loadTreeManifest`, `checkAllocateEntryGate`, `readManifestSource` | manifest schema, self-hash, `final_audit`, `stage2_handoff`, co-located spec hash |
| G2 / G2.2 / G2.4 | `directory-plan.mjs`, `path-safety.mjs`, `tree-staging.mjs` `checkExistingOutputPolicy` | `workspace.tree`, `workspace.packages`, filesystem |
| G3 (seed local checks) | `run.mjs` `renderOneSeed` → `seed-local-checks.mjs` → `contract-model.mjs` `validateSeedContractEdges` | parsed seed, manifest boundaries, `stage2_contract_scope` |
| G3.5 (coverage) | `coverage-proof.mjs` | parsed seeds' reference blocks and traceability rows, manifest segments |
| G3.6 / G3.7 | `seed-render.mjs`, `self-grill.mjs` | decisions payload shape, critic record, residual parity |
| G4 (bilateral) | `contract-gate.mjs` `runBilateralSymmetry` | the contract index built from parsed seeds |
| **G5 (WIG)** | **`wig.mjs` `runGraphViolations`** | **graph + manifest; the two defective predicates are `declaresClause` (D1) and `findForbiddenFlows` (D2)** |
| G5 (order) | `implementation-order.mjs` `verifyOrderAgainstStage1` | derived waves vs `dependencies.dag.implementation_order` (passes today) |
| G6 | `tree-staging.mjs`, `allocate-reload.mjs`, `cleanup-workspace-artifacts.mjs` | published artefacts, reload verification |
