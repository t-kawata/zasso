---
type: "Section"
title: "8. Implementer Checklist"
description: "1. Add `contract-macros` and `validation-contract`."
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-18/8-implementer-checklist"
    title: "8. Implementer Checklist"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-18/8-implementer-checklist"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "7942-7942"
---
## 8. Implementer Checklist

1. Add `contract-macros` and `validation-contract`.
2. Add `#[contract::input]` to every request type; derive `schemars::JsonSchema`.
3. Add `ContractValidate` to the `Operation::Request` bound. Implement
   `validate_json` before the idempotency claim and `prepare_validated` only on
   the acquired branch; replay uses `replay_authorize` only.
4. Add `*-docgen` with the four subcommands and both inventory dumps.
5. Add the completeness, English, secret, and determinism checks.
6. Add the CI commands.
7. Run `--check all` and make it pass.
8. Do not hand-write constraint tables or infer rules from code.

A project that skips a step is non-compliant, even if its documentation looks
complete.

---

# PART IV — DOCUMENT MAP AND SELF-CONTAINMENT

This package is self-contained. It requires no external document, file, or
repository. Every cross-reference in this document points to a part of this
same file. The expert reviewer does not need access to the source repository,
the project workspaces, or any separate specification.

| Part | Document |
|---|---|
| I | Expert Review Request |
| II | Normative Rules |
| III.1 | Foundation: Unify Seams, Not Substance |
| III.2 | Shared Contracts |
| III.3 | Core Crate |
| III.4 | Operation Crate |
| III.5 | Identity Crates |
| III.6 | REST Adapter |
| III.7 | WebSocket Adapter |
| III.8 | CLI Adapter |
| III.9 | gRPC Adapter |
| III.10 | MCP Adapter |
| III.11 | A2A Adapter |
| III.12 | Conformance Crate |
| III.13 | Project Template |
| III.14 | Migration |
| III.15 | Rule Registry |
| III.16 | Documentation Generation |
| III.17 | Validation Contract |
| III.18 | Implementation Blueprint |
| IV | Document Map and Self-Containment |

**End of package.**

