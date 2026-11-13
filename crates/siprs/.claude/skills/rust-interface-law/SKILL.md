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

Rule text: `okf/`. This file: procedure and entry contract. Never read `okf/` directly; never grep rule IDs.

## Outcome

| Command | Artifact | Meaning |
|---|---|---|
| `applies` | stdout | Exit 0 = interface unit matched; exit 3 = skip the law |
| `resolve` | `manifest.json` + `*.auto.toml` | Auto-discovered units, phases, `must`/`reference`/`omitted` nodes, `closure_sha256` |
| `context` | stdout + `ledger.json` | Exact rule bodies for one phase; stable delivery hash |
| `gate` | `gate-report.json` | Per-node status; exit 0 pass, 50 blocked |
| `attest` | `attestation.json` | One row per `must` node; `unset` blocks completion |
| `explain` | stdout | One rule: requirement, verification, enforcement, canonical code examples, implementation contract |
| `template` | stdout + plan JSON | Render an interface template plan with resolved placeholders; `--reconcile` marks `merge-required`; no write |
| `implementation-check` | `implementation-report.json` | Dependency, feature, edge, source, and template checks; exit 0 pass, 50 blocked |
| `law-identity` | stdout | Compare manifest spec_version, dist hash, and policy hash with the installed law |
| `law-implementation` | stdout + reports | Run implementation-check then gate with the report; exit 50 on either failure |
| `scaffold` | stdout + `scaffold-manifest.json` | Package-level file plan; dry-run by default; `--write` applies |

Only `machine_verified` is a machine pass. `human_attested` requires `approval_ref`. `unverifiable`, `not_run`, `failed` never pass.

## Zero preparation

`resolve` auto-discovers the workspace. No profile, map, or manifest is authored by hand.

| Source | Discovery |
|---|---|
| `Cargo.toml` with `[package]` | Crate name, directory |
| `crates/**/src/` | Crate candidate when no manifest exists |
| Path/name suffix | `rest`, `websocket`, `cli`, `grpc`, `mcp`, `a2a` |
| Path/name role | `operation`, `adapter`, `conformance`, else `core` |
| Git diff | Changed paths; omitted → all units |

Generated: `RULES-PROFILE.auto.toml`, `workspace-map.auto.toml` next to `manifest.json`. Override with `--profile`/`--map` only for nonstandard layouts.

## Path anchor — run once per session

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
SKILL_DIR="$REPO_ROOT/.claude/skills/rust-interface-law"
LAW="$SKILL_DIR/dist/skill.mjs"
[ -f "$LAW" ] || LAW="$SKILL_DIR/scripts/cli.mjs"
LAW_OUT="$REPO_ROOT/target/law"
mkdir -p "$LAW_OUT"
```

Invoke `node "$LAW" ...` with absolute `--root`/`--out`/`--ledger` paths. Never `cd` into the skill; never write outside `$LAW_OUT`.

## Explain and scaffold

`explain` gives one rule plus its canonical code patterns from the matching interface document:

```bash
node "$LAW" explain --rule WS-01 --root "$REPO_ROOT"
```

Output includes `## Dependency check`: every crate named by the canonical `[dependencies]` example is marked `workspace member`, `declared dependency`, `mapped to <project crate>`, or `MISSING`. Canonical roles (`identity-core`, `operation-contract`, `interface-contract`, `contract-macros`) map automatically to project crates; `MISSING` means no project crate fulfills the role.

`scaffold` writes a package-level template batch. AI writes the fixed-schema plan after structural reasoning; the script performs every file/directory operation.

```json
{
  "schema": "rust-interface-law.scaffold/v1",
  "package": "crates/app-rest",
  "interface": "rest",
  "unit": "app-rest",
  "files": [
    {
      "path": "crates/app-rest/src/state.rs",
      "mode": "create",
      "rules": ["REST-01"],
      "content": "// RULE: REST-01\npub struct RestState;\n"
    },
    {
      "path": "crates/app-rest/src/lib.rs",
      "mode": "append",
      "marker": "// [::LAW-SCAFFOLD::] modules",
      "rules": ["REST-01"],
      "content": "pub mod state; // RULE: REST-01\n"
    }
  ]
}
```

```bash
node "$LAW" scaffold --plan target/law/scaffold-plan.json --root "$REPO_ROOT"
node "$LAW" scaffold --plan target/law/scaffold-plan.json --root "$REPO_ROOT" --write
```

Safety invariants: package basename must end with `-<interface>`; paths stay inside the package; `create` never overwrites; `append` requires a marker appearing exactly once; every file annotates each listed rule; canonical placeholder crates (`operation-contract`, `identity-core`, `interface-contract`, `contract-macros`) are rejected unless they are workspace members; unknown rule, secret, unmarked incomplete code, traversal, or duplicate path rejects the whole plan; writes are rolled back on failure; backups and manifest live under `target/law/`.

## Applicability precheck

Run this before any law command. Do not run the law for unrelated work.

```bash
node "$LAW" applies --root "$REPO_ROOT" --paths "$CHANGED"
```

Exit 0 = `APPLIES`; continue. Exit 3 = `SKIP`; stop — no `resolve`, `context`, `gate`, or `attest`. Output lists matched units and their phases. `--include-shared` also matches `operation`, `core`, `adapter`, and `conformance` units.

## Procedure

1. Resolve changed paths (repo-relative, as `git diff --name-only` prints).

```bash
CHANGED="$(git -C "$REPO_ROOT" diff --name-only HEAD | paste -sd, -)"
node "$LAW" resolve \
  --root "$REPO_ROOT" \
  --paths "$CHANGED" \
  --out "$LAW_OUT/manifest.json"
```

Output: Markdown `# Resolved closure` with units, phases, `must`/`reference`/`omitted`, hash, manifest path, auto-discovery counts. Every `must` node receives a V1 process verification entry. No unit matched → map gap; stop.

2. Deliver one phase at a time, in `manifest.phases` order.

```bash
node "$LAW" context \
  --manifest "$LAW_OUT/manifest.json" \
  --phases <phase1,phase2> \
  --ledger "$LAW_OUT/ledger.json"
```

`--phase` = one phase; `--phases` = planned subset, manifest order enforced. Deliver only phases the ticket needs. Output: Markdown with `Situation`, `Project role mapping` (canonical crate role → project crate), `Required work` (one checklist item per rule), `Rule references` (requirement / verification / enforcement), `References` (code blocks), and `After implementation`. Implement from this output only. Out-of-order phase fails until its predecessor is in the ledger. `--format raw` prints node markers + bodies + hash.

3. Implement. Follow project TDD law.

Before implementation, render the interface template plan:

```bash
node "$LAW" template --interface <role> --unit <unit> --templates "$SKILL_DIR/templates" \
  --out "$LAW_OUT/template-plan.json" --reconcile --root "$REPO_ROOT"
```

Apply the plan with `scaffold --plan "$LAW_OUT/template-plan.json" --write`. A `merge-required` file is not written; merge it by hand. Template bodies are not delivered by `context`.

After implementation, run the implementation check and pass its report to the gate:

```bash
node "$LAW" implementation-check --root "$REPO_ROOT" --manifest "$LAW_OUT/manifest.json" \
  --out "$LAW_OUT/implementation-report.json"
```

4. Run the gate.

```bash
node "$LAW" gate \
  --manifest "$LAW_OUT/manifest.json" \
  --implementation "$LAW_OUT/implementation-report.json" \
  --out "$LAW_OUT/gate-report.json"
```

Output: Markdown `# Gate Report — PASS|FAIL` with counts, `## Blocking violations` (`file:line`, kind, exact action), `## Cannot be verified`, and `## Next action`. JSON is written to `--out`; exit 0 = all `machine_verified` or `human_attested`; exit 50 = blocked. `--format json` prints JSON.

V1 process gate is automatic: scans changed paths for unmarked `todo!`/`unimplemented!`/`panic!`/`TODO`/`FIXME`/`HACK`/`XXX` and secret patterns. `[::STUB::]` on the same or previous line exempts the line. V1 proves process cleanliness, not per-rule behavior. Empty changed paths fail closed (`no-changed-paths`).

Add rule-level proof with `--verify "$REPO_ROOT/contract/verify.toml"`; `[[verify]]` rows merge by `rule` (rows outside closure ignored). `[[verify]]` row: `rule`, `level`, one of `cmd` + `expected_cases` | `scan` | `review`; optional `timeout_ms`. `cmd` must print `{"selected":N,"failed":M}`.

5. Attest every `must` node in the phase.

```bash
node "$LAW" attest --manifest "$LAW_OUT/manifest.json" --phase <phase> \
  --init --out "$LAW_OUT/attestation.json"
# edit attestation.json: status=applied + evidence | human_attested + approval_ref | exception + exception_ref
node "$LAW" attest --manifest "$LAW_OUT/manifest.json" --phase <phase> \
  --rows "$LAW_OUT/attestation.json"
```

`--init` prints a Markdown checklist and writes the JSON template to `--out`. `unset` row → command fails. Completion is forbidden while gate or attestation fails.

After compaction: `context --replay` reproduces the same nodes and hash without re-reading phase order.

## Judgment boundary

| Decide | Do not decide |
|---|---|
| Open-part design | Applicable rule set |
| Exception draft | Closure or phase order |
| Fixed-boundary crossing | Link reachability |
| Amendment need | Gate pass/fail |

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| `no unit matched` | changed path outside discovered crates | extend `workspace-map.auto.toml` or pass `--map` |
| `auto: 0 units` | no Cargo manifest or `crates/**/src` | pass explicit `--map` |
| `predecessor phase not delivered` | phase skipped | deliver in order, or `--replay` |
| gate exit 50 | `unverifiable` / `not_run` / `failed` | inspect `evidence`, fix code, add `[[verify]]` row |
| `no-changed-paths` | `resolve` ran without `--paths` | pass changed paths; gate cannot verify nothing |
| `unset rule` | unfilled attestation row | fill status + evidence |
| `applied requires evidence` | empty evidence | record the executed check |
| scaffold `REJECTED` | plan violates a safety check | read the errors table; no files were written |
| `unknown rule` | explain/scaffold rule outside registry | use a rule id from `context` |

All artifacts stay under `$LAW_OUT`; no source-tree writes.
