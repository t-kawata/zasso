---
type: "Section"
title: "2. Policy Model"
description: "An implementation policy has four parts."
sources: 
  - resource: "sources/55-IMPLEMENTATION-CONTRACTS.md"
    id: "55-implementation-contracts-2-policy-model"
    title: "2. Policy Model"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/55-IMPLEMENTATION-CONTRACTS.md"
x-source-span: "21-51"
---
## 2. Policy Model

An implementation policy has four parts.

| Part | Content |
|---|---|
| `interfaces` | One crate, exact version, feature set, default-features policy, and forbidden list per interface |
| `profiles` | Deployment profiles and the capabilities each profile must prove |
| `edges` | Required and forbidden dependency edges |
| `template` | Template catalog path and placeholder contract |

The skill baseline policy lives in `source/implementation-policy.toml`.
A project may override a version only inside the admitted compatibility range.
An incompatible override is a conflict, not a new baseline.

### 2.1 Effective policy

Resolution order:

1. Read the skill baseline.
2. Read the project manifest.
3. If the project has no dependency, use the baseline exact pin.
4. If the project has a compatible dependency, use the project pin.
5. If the project pin is incompatible, fail closed with a policy conflict.
6. Write `effective-policy.json` with the resolved pins, features, and hashes.

The effective policy is the only version source used by templates and checks.
Rule text MUST NOT hard-code one crate version for every project.

---

