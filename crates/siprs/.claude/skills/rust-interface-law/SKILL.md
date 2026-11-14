---
name: rust-interface-law
description: >
  Supreme law for Rust interface-layer implementation. Use when implementing,
  reviewing, or modifying CLI, REST, WebSocket, gRPC, MCP, or A2A adapters,
  operations, contracts, identity, validation, documentation, or conformance.
  Auto-discovers the Rust workspace; no prior configuration required. Resolves
  the applicable rule closure, delivers phase-scoped rule text, and blocks
  completion until machine gates pass. Do not use for non-Rust work.
---

# Rust Interface Law

Rule text: the OKF v0.2 bundle under `okf/`. This file is the procedure and
entry contract. Use the CLI to traverse the bundle; do not grep raw bundle files.
Never invent a rule id: the registry and `source/rule-concepts.json` are the
identity source.

## Outcome

| Command | Artifact | Meaning |
|---|---|---|
| `applies` | stdout | Exit 0 = interface unit matched; exit 3 = skip the law |
| `resolve` | `manifest.json` + `*.auto.toml` | Units, phases, `must`/`reference`/`omitted` nodes, `concept_id`, `closure_sha256` |
| `context` | stdout + `ledger.json` | Rule bodies plus outgoing, incoming, sources, trust, freshness |
| `gate` | `gate-report.json` | Per-rule status; exit 0 pass, 50 blocked |
| `attest` | `attestation.json` | One row per `must` rule with `rule`, `concept_id`, and evidence |
| `explain` | stdout | One rule: requirement, verification, enforcement, one-hop neighborhood |
| `expand` | stdout | Traversal envelope for one concept id; same output as `show` |
| `template` | stdout + plan JSON | Interface template plan; `--reconcile` marks `merge-required`; no write |
| `implementation-check` | `implementation-report.json` | Dependency, feature, edge, source, and template checks |
| `law-identity` | stdout | Compare manifest spec_version, dist hash, and policy hash |
| `law-implementation` | stdout + reports | implementation-check then gate; exit 50 on either failure |
| `scaffold` | stdout + `scaffold-manifest.json` | Package-level plan; dry-run by default; `--write` applies |

Only `machine_verified` is a machine pass. `human_attested` requires
`approval_ref`. `unverifiable`, `not_run`, and `failed` never pass.

## Procedure

1. Run `applies`. 2. Run `resolve`. 3. Deliver `context` one phase at a time. 4. Implement. 5. Run `implementation-check`, `gate`, and `attest`.

## Start Here

Run `applies` first. If it exits 3, stop. If it exits 0, run `resolve` and then
`context` for the phases the ticket needs.

```bash
LAW=".claude/skills/rust-interface-law/dist/skill.mjs"
LAW_OUT="target/law"
mkdir -p "$LAW_OUT"
node "$LAW" applies --root "$REPO_ROOT" --paths "$CHANGED"
```

## Traversal Contract

Every node page and edge read returns a Traversal Envelope. A directory listing
returns one executable command per entry, and a search row carries its
expand_command. Do not decide coverage yourself; read `coverage` and `guidance`.

```json
{
  "protocol": "okf-traversal/v1",
  "node": { "id": "rules/c/rest-01", "type": "Rule", "title": "...", "body": "..." },
  "coverage": {
    "profile": "law-implement",
    "requiredFacets": ["requirement", "applies_to", "verification", "enforcement", "source", "prerequisites"],
    "present": ["requirement", "applies_to", "verification", "enforcement"],
    "missing": ["source", "prerequisites"],
    "sufficient": false,
    "insufficient": false,
    "overfetchRatio": 0.82
  },
  "frontier": [
    { "id": "rules/o/app-01", "kind": "prerequisite", "command": "node \"$LAW\" expand --id rules/o/app-01", "priority": 0 },
    { "id": "sources/part-iii-6/6-http-rules", "kind": "source-section", "command": "node \"$LAW\" expand --id sources/part-iii-6/6-http-rules", "priority": 1 }
  ],
  "guidance": {
    "state": "expand",
    "reason": "missing facet: source,prerequisites",
    "mustRun": "node \"$LAW\" context --rule REST-01",
    "stopWhen": "coverage.missing is empty",
    "ifBack": "node \"$LAW\" expand --id rules/c/rest-01",
    "hop": 0,
    "maxHops": 3
  },
  "backTo": null
}
```

| `guidance.state` | When the script returns it | What you do |
|---|---|---|
| `stop` | `coverage.missing` is empty | Implement or answer; no further read |
| `expand` | a required facet is missing and a hop remains | Run `guidance.mustRun` exactly |
| `back` | maximum hop reached, or no frontier fills the missing facet | Run `guidance.ifBack` and continue from the parent |

`coverage.missing` is the only definition of insufficiency. `overfetchRatio` is
a report, not a failure. A budget that cannot fit required facets returns
`insufficient: true` and never truncates them.

An absent id is an error: the CLI exits 2 and prints candidates. An empty edge
list with exit 0 is never a valid answer for an absent id.

## Directory Traversal

The bundle is a tree. Start at the root index, then enter the class or source
directory that matches the task.

```bash
node "$LAW" list --path /
node "$LAW" list --path rules/adapter
node "$LAW" list --path sources
```

## Rule Page

`show` returns the rule body, its outgoing links, its incoming links, its
sources, its trust tier, and its freshness in one call.

```bash
node "$LAW" show rules/c/rest-01 --root "$REPO_ROOT"
```

## Outgoing and Incoming

`outgoing` follows the rule body links. `incoming` follows the backlinks.
`neighbors` returns both.

```bash
node "$LAW" outgoing rules/c/rest-01
node "$LAW" incoming rules/c/rest-01
node "$LAW" neighbors rules/c/rest-01
```

## Multi-Hop Reach

Repeat `outgoing` on returned ids until the required set is covered. Stop when
the next hop adds no new rule. Do not read every rule page by default.

```bash
node "$LAW" outgoing <rule-id>
node "$LAW" outgoing <returned-rule-id>
```

## Required Context

`required` computes the `x-requires` closure and returns rule records
(`id`, `rule_id`, `title`, `phase`, `applies_to`, `verification`,
`enforcement`, `body`). `context` adds bodies, one-hop edges, and the source
section the rule came from. A required set is complete or the command fails; it
is never truncated.

```bash
node "$LAW" required --rule REST-01 --root "$REPO_ROOT"
node "$LAW" context --rule REST-01 --budget 1000000 --root "$REPO_ROOT"
node "$LAW" required --phase adapter --root "$REPO_ROOT"
```

## Zero Results

An empty `search` or `list` is an answer. Widen the query, list the parent
directory, or check `applies` before assuming the rule does not exist.

```bash
node "$LAW" search --query "authorization" --root "$REPO_ROOT"
node "$LAW" list --path rules
```

## Budget Exceeded

`BUDGET_EXCEEDED` means the requested closure is too large. Narrow the entry
set or request one phase at a time. Never accept a truncated rule list.

```bash
node "$LAW" context --rule REST-01 --budget 1 --root "$REPO_ROOT"
```

## Trust and Freshness

Every rule page carries `trustTier`, `status`, `stale`, and `staleAfter`.
A stale or deprecated rule is never presented as current.

```bash
node "$LAW" trust --tier unverified --root "$REPO_ROOT"
node "$LAW" freshness --root "$REPO_ROOT"
```

## Sources and Citation

Every rule concept carries `sources[]` objects. Cite the rule id and the source
id. A rule without a source is a defect.

```bash
node "$LAW" sources rules/c/rest-01 --root "$REPO_ROOT"
```

## Gate and Attest

`gate` decides completion. `attest` records every `must` rule. A gate failure
is exit 50. An `unset` attestation row blocks completion. `applied` requires
evidence; `human_attested` requires `approval_ref`.

```bash
node "$LAW" implementation-check --root "$REPO_ROOT" --manifest "$LAW_OUT/manifest.json" \
  --out "$LAW_OUT/implementation-report.json"
node "$LAW" gate --manifest "$LAW_OUT/manifest.json" \
  --implementation "$LAW_OUT/implementation-report.json" --out "$LAW_OUT/gate-report.json"
node "$LAW" attest --manifest "$LAW_OUT/manifest.json" --phase <phase> \
  --init --out "$LAW_OUT/attestation.json"
```

## Failure Modes

| Symptom | Cause | Action |
|---|---|---|
| `no unit matched` | changed path outside discovered crates | extend `workspace-map.auto.toml` or pass `--map` |
| `auto: 0 units` | no Cargo manifest or `crates/**/src` | pass explicit `--map` |
| `predecessor phase not delivered` | phase skipped | deliver in order, or `--replay` |
| gate exit 50 | `unverifiable` / `not_run` / `failed` | inspect `evidence`, fix code, add `[[verify]]` |
| `no-changed-paths` | `resolve` ran without `--paths` | pass changed paths |
| `unset rule` | unfilled attestation row | fill status + evidence |
| `applied requires evidence` | empty evidence | record the executed check |
| `unknown rule` | rule id outside the registry | use an id from `list` or `search` |
| `rule concept missing` | `source/rule-concepts.json` drift | rebuild the bundle |
| `BUDGET_EXCEEDED` | closure over budget | narrow the entry set |

### Scenario 1 — Which rules apply to a REST adapter?

```bash
node "$LAW" applies --root "$REPO_ROOT" --paths crates/app-rest/src/lib.rs
node "$LAW" list --path rules/adapter
```

Expected: exit 0, the REST unit, and the adapter-phase rules.

### Scenario 2 — What does REST-01 require?

```bash
node "$LAW" show rules/c/rest-01 --root "$REPO_ROOT"
```

Expected: the body, verification, enforcement, sources, trust, and freshness.

### Scenario 3 — What does REST-01 depend on?

```bash
node "$LAW" required --rule REST-01 --root "$REPO_ROOT"
```

Expected: the complete `x-requires` closure in phase order.

### Scenario 4 — Which rules link to an identity rule?

```bash
node "$LAW" incoming rules/c/id-01 --root "$REPO_ROOT"
```

Expected: every rule whose body links to the identity rule.

### Scenario 5 — What is the context for a WebSocket adapter?

```bash
node "$LAW" context --phase websocket --root "$REPO_ROOT"
```

Expected: the WebSocket rules and their dependencies.

### Scenario 6 — Which rules are stale?

```bash
node "$LAW" freshness --root "$REPO_ROOT"
```

Expected: rules past `stale_after` or deprecated. A stale rule is never current.

### Scenario 7 — Which rules are unverified?

```bash
node "$LAW" trust --tier unverified --root "$REPO_ROOT"
```

Expected: every rule with no `verified` event.

### Scenario 8 — What does the gate require for REST-01?

```bash
node "$LAW" explain --rule REST-01 --root "$REPO_ROOT"
node "$LAW" gate --manifest "$LAW_OUT/manifest.json" --out "$LAW_OUT/gate-report.json"
```

Expected: the same rule id, verification, and enforcement in both outputs.

### Scenario 9 — Which rules mention authorization?

```bash
node "$LAW" search --query "authorization" --root "$REPO_ROOT"
```

Expected: rule ids with snippets, no raw grep.

### Scenario 10 — What must be delivered before phase 2?

```bash
node "$LAW" required --phase contract --root "$REPO_ROOT"
```

Expected: the phase-2 prerequisites in manifest order.

### Scenario 11 — Which rules are orphaned or unreachable?

```bash
node "$LAW" lint --root "$REPO_ROOT"
```

Expected: zero `INDEX_ORPHAN` and zero unreachable rules.

### Scenario 12 — What is the full one-hop neighborhood of a rule?

```bash
node "$LAW" neighbors rules/c/rest-01 --root "$REPO_ROOT"
```

Expected: body-linked outgoing rules and backlinked incoming rules.
