# 55 — Implementation Contracts

**Status:** Normative
**Version:** 0.4.0
**Parent:** Part II

---

## 1. Purpose

This document makes adapter implementation methods enforceable.
Behavior rules state what an adapter must do. This document states which crate,
version, feature, API sequence, template, detector, and verification prove that
the adapter was built the admitted way.

The law runtime reads this document as source. It never treats generated atoms
as editable text.

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

## 3. Dependency Policy

| Rule | Requirement |
|---|---|
| Pin | Every admitted crate uses an exact version in the policy |
| Features | Only the listed features are admitted; default features are explicit |
| Kind | Normal, build, and dev dependencies are distinguished |
| Edge | Adapter edges reach the dispatcher and identity contracts only |
| Forbidden | Adapter-to-operation-implementation and core-to-protocol-SDK edges fail |
| Source | Registry, path, and git sources follow the project source policy |
| Failure | Missing package, unresolved feature, unknown source, or metadata failure fails closed |

---

## 4. Source Policy

| Rule | Requirement |
|---|---|
| Resolved identity | Required calls are resolved to crate and item identity, not string matches |
| Adapter entry | Adapter calls the dispatcher or adapter bridge only |
| No business logic | Adapter contains no domain decision, storage query, or transaction |
| No manual framing | JSON-RPC, SSE, and protocol envelopes use the admitted SDK |
| No hidden state | Authoritative session and task state live in the external store |
| Failure | Unresolved analysis, macro expansion, or generated code fails closed |

---

## 5. Template Policy

| Rule | Requirement |
|---|---|
| Catalog | Each interface has a template manifest and test/implementation templates |
| Placeholder | Every placeholder resolves from discovery and effective policy; unresolved placeholder rejects the plan |
| Rules | Every generated file carries `RULE: <id>` |
| Modes | `create`, `append`, `merge-required`; no overwrite |
| Equality | Generated output equals regeneration from the admitted template and inputs |
| Delivery | Template bodies are not delivered by `context`; only the reference is delivered |

---

## 6. Gate Policy

| Rule | Requirement |
|---|---|
| Report | `implementation-check` writes a JSON report with one status per rule |
| Merge | `gate --implementation` merges report statuses into the manifest closure |
| Missing | A missing report is `not_run`, never a pass |
| Tests | A missing test, zero selected tests, or failed detector is `failed` |
| Identity | A spec_version, dist hash, or policy hash mismatch fails unless a scoped exception exists |
| Honesty | V1 process proof is not rule-level proof |

---

## 7. Cross-Cutting Rules

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| IMP-01 | Dependency declarations MUST use the admitted crate, exact version, features, and default-features policy. | Admission. | Project-compatible pin inside the range. | metadata check. |
| IMP-02 | The gate MUST reject every unresolved dependency, feature, source, advisory, or license disposition. | Fail closed. | Disposition format. | negative fixtures. |
| IMP-03 | Adapter dependency edges MUST reach the dispatcher and identity contracts and MUST NOT reach operation implementations or business storage. | Edge rule. | Internal module split. | graph check. |
| IMP-04 | Core and operation-contract crates MUST NOT depend on protocol SDKs or generated transport types. | Forbidden. | — | graph check. |
| IMP-05 | Required source calls MUST be resolved by identity, and unresolved analysis MUST fail closed. | Resolved identity. | Detector implementation. | source detector. |
| IMP-06 | Generated adapter output MUST equal regeneration from the admitted template and inputs. | Equality. | Template content. | generated equality. |
| IMP-07 | Scaffold MUST NOT overwrite an existing file; an existing file without a marker becomes merge-required. | No overwrite. | Merge instructions. | scaffold fixture. |
| IMP-08 | Template bodies MUST NOT be delivered by context; only rule text, contract tables, and template references are delivered. | Delivery boundary. | Excerpt size. | delivery test. |
| IMP-09 | Missing implementation reports, missing tests, zero selected tests, and failed detectors MUST NOT pass. | Fail closed. | Evidence shape. | gate self-test. |
| IMP-10 | Every project MUST pin the law spec_version, dist hash, and policy hash; a mismatch fails unless a scoped exception exists. | Identity. | Exception scope. | identity check. |
| IMP-11 | Every implementation rule MUST have a detector or an explicit attestation row. | Coverage. | Detector choice. | registry check. |
| IMP-12 | Pipeline checkpoints MUST invoke template, implementation-check, gate, and attest through a bounded wrapper. | Process. | Wrapper name. | command inspection. |

---

## 8. Conformance Obligations

1. Every interface has one admitted crate, exact version, and feature set.
2. Every implementation rule has a detector or an attestation row.
3. Every project writes `effective-policy.json` and records its hash.
4. Every generated adapter carries RULE annotations and template provenance.
5. Every gate report distinguishes V1 process proof from V2/V3 implementation proof.
6. Every mismatch, missing report, missing test, or failed detector fails closed.
7. The conformance report names `IMP-01` through `IMP-12`.
