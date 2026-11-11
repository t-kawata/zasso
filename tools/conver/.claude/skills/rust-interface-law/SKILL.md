---
name: rust-interface-law
description: >
  Supreme law for Rust interface-layer implementation. Use when implementing,
  reviewing, or modifying CLI, REST, WebSocket, gRPC, MCP, or A2A adapters,
  operations, contracts, identity, validation, documentation, or conformance.
  Resolves the applicable rule closure from RULES-PROFILE.toml and blocks
  completion until gates pass. Do not use for non-Rust work.
---

# Rust Interface Law

Supreme law for Rust interface-layer implementation. Rule text lives in the OKF bundle; this file contains procedure only.

## Procedure

1. Resolve the applicable closure.

```bash
node scripts/cli.mjs resolve \
  --profile RULES-PROFILE.toml \
  --map contract/workspace-map.toml \
  --paths <changed-paths> \
  --out target/law/manifest.json
```

2. Read only the delivered context, phase by phase.

```bash
node scripts/cli.mjs context \
  --manifest target/law/manifest.json \
  --phase <contract|operation|adapter|docs|conformance> \
  --ledger target/law/ledger.json
```

3. Implement. Follow the project TDD law. Do not read `okf/` directly. Do not grep for rule IDs. Use `context --replay` after compaction.

4. Run the gate.

```bash
node scripts/cli.mjs gate \
  --manifest target/law/manifest.json \
  --scans contract/scans.toml \
  --out target/law/gate-report.json
```

5. Attest.

```bash
node scripts/cli.mjs attest --manifest target/law/manifest.json --phase <phase> --init > target/law/attestation.json
node scripts/cli.mjs attest --manifest target/law/manifest.json --phase <phase> --rows target/law/attestation.json
```

Completion is forbidden while the gate or attestation fails.

## Judgment Boundary

| Decide | Do not decide |
|---|---|
| Open-part design | Applicable rule set |
| Exception draft | Closure or order |
| Fixed-boundary crossing | Link reachability |
| Amendment need | Gate pass/fail |

## Invariants

- `machine_verified` is the only machine pass.
- `human_attested` requires `approval_ref`.
- `unverifiable` and `not_run` never pass.
- CI from the pinned bundle is authoritative; the local Stop hook is a self-check.
