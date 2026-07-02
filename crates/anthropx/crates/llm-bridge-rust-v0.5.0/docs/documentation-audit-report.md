# Documentation Audit Report

**Date**: 2026-06-11
**Auditor**: Documentation completeness review
**Scope**: `llm-bridge-rust` repository — specs, docs, READMEs, API docs, guides, examples
**Method**: File-by-file inventory against project claims in README, specs, and CLAUDE.md

---

## Executive Summary

The project has a solid core of design specs and two well-written bilingual READMEs, but **several documents referenced from the READMEs do not exist**, the `docs/` directory is almost entirely about agent tooling rather than the project itself, the `apps/server` described in the README is actually a stub, and the rustdoc `missing_docs` lint is silently defeated. The Phase 0–5 work is complete, but many spec status headers and the `docs/index.md` have not been updated to reflect that.

Severity scale: **P0** = broken reference or misleading claim; **P1** = missing document that users/contributors expect; **P2** = stale status or incomplete content; **P3** = nice to have.

---

## 1. `specs/` Directory

### 1.1 Individual Spec Status Headers

| Spec file | Current status header | Actual state | Verdict |
|---|---|---|---|
| `00-protocol-transform-prd.md` | `draft v2` | PRD has been fulfilled by Phase 0–5 delivery | **P2** — should be `accepted` / `fulfilled` |
| `10-protocol-transform-design.md` | `active v2` | Core design is implemented; still the reference contract | OK — consider `frozen` |
| `11-lossy-downgrade-checklist.md` | `frozen for Phase 1` | Implemented | OK |
| `12-image-download-security.md` | `frozen for Phase 1` | Implemented | OK |
| `13-responses-previous-response-id-design.md` | `draft v1` | Interface spec only; no implementation yet | OK |
| `62-example-chat-roundtrip.md` | `draft v1` | `chat-roundtrip.rs` example exists and runs | **P2** — should be `implemented` |
| `63-http-proxy-example.md` | `draft v1` | `http-proxy.rs` example exists and runs | **P2** — should be `implemented` |
| `90-protocol-transform-roadmap.md` | `active v4` | M0–M4 all completed (Phase 0–5 done) | **P2** — should mark each milestone `Closed` |
| `91-protocol-transform-impl-plan.md` | `active v3` | §0 says "Phase 1-5 全部完成" | **P2** — overall status should read `completed`; individual phases should be ticked |
| `92-extend-usage-cache-reasoning-fields.md` | `Implemented` | Accurate | OK |
| `93-compressor-crate.md` | `Proposed` | Crate does not exist under `crates/` | OK — accurately reflects state |
| `99-protocol-transform-key-decisions.md` | `active v2` | Still the reference decisions log | OK |

### 1.2 `specs/index.md`

- Status header: `draft v2`. Should be updated to reflect that the spec set is now largely implemented.
- §5 "Milestone mapping" does not note that M0–M4 have been closed.
- Missing: any cross-reference to the `responses-to-anthropic/` fixture directory or the Responses API design work in spec 13.
- **P2** — needs a "Current state" section summarizing what has been delivered.

### 1.3 `specs/README.md`

Content is a single line: `All specs that for AI to generate code.`

- **P2** — this is the entry point for a new reader; should summarise the spec numbering scheme, link to `index.md`, and state which milestone the project is currently in.

---

## 2. `docs/` Directory

### 2.1 `docs/index.md`

This is the most problematic file in the documentation set.

1. Opening line reads: *"This directory contains reusable project documentation for the **template repository**."* — this project is not a template repository; the text was never rewritten after scaffolding. **P0**.
2. Every entry in the index links to an agent/tool workflow document (Ruflo, CodeGraph, SPARC, pre-commit, TDD, high-risk-task). There is **no entry** for any project-facing documentation (installation, configuration, deployment, architecture, user guide, contribution guide).
3. The "推荐阅读顺序" section is entirely about SPARC agent usage — not about how a user or contributor should learn this project.

**P0** — `docs/index.md` must be rewritten to reflect the actual project.

### 2.2 `docs/research/`

Referenced explicitly by `specs/91-protocol-transform-impl-plan.md` §0:

> "已完成（Phase 0）：`docs/research/` 下的 prior-art memo"

This directory **does not exist**. Either the memo was never written, or it was placed elsewhere. The impl-plan claims a deliverable that cannot be found. **P0**.

### 2.3 Missing project-facing documentation in `docs/`

The following documents are absent and expected for a published Rust library:

| Document | Purpose | Severity |
|---|---|---|
| `docs/installation.md` | Detailed install guide (cargo add, feature flags, MSRV verification) | P1 |
| `docs/configuration.md` | Runtime configuration (env vars for `http-proxy`, feature flags) | P1 |
| `docs/deployment.md` | How to deploy the bridge in production (container, binary, proxy patterns) | P1 |
| `docs/architecture.md` | Longer-form architecture walkthrough than the README provides | P1 |
| `docs/migration.md` | Breaking-change migration guide between 0.1 → 0.2 → future versions | P2 |
| `docs/troubleshooting.md` | Common error messages, downgrade warnings, and how to read debug logs | P2 |

---

## 3. `README.md` / `README.zh-CN.md`

### 3.1 Broken references

Both READMEs contain this paragraph:

> Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on PRs, testing, and code style. For security vulnerabilities, see [SECURITY.md](SECURITY.md).

- `CONTRIBUTING.md` does **not exist**. **P0**.
- `SECURITY.md` does **not exist**. **P0**.

### 3.2 Misleading claims about `apps/server`

- README project structure diagram: `apps/server/ — Bridge server — HTTP/SSE access boundary`.
- Architecture diagram labels `crates/core` as "single source of protocol semantics" and mentions `apps/server` as the "HTTP/SSE boundary".
- Reality: `apps/server/src/main.rs` is `fn main() { println!("Hello, world!"); }` — a **stub**. There is no HTTP/SSE server. The actual HTTP proxy example lives in `crates/core/examples/http-proxy.rs`.

**P0** — either implement the server, move the `http-proxy` example into `apps/server`, or rewrite the README to describe `apps/server` as a placeholder.

### 3.3 Streaming status contradiction

| Location | Claim for "Anthropic SSE → OpenAI SSE" |
|---|---|
| `README.md` (L141) | `✓ Implemented` |
| `README.zh-CN.md` (L152) | `✓ 已实现` |
| `crates/core/examples/README.md` (L44) | `开发中` (under development) |

The transform code (`crates/core/src/stream/anthropic_to_openai.rs`) **does exist**, and the main README is correct. The examples README is stale. **P0** — fix the examples README to match.

### 3.4 Missing `rust-toolchain.toml`

CLAUDE.md §"Rust Baseline" requires:

> Use Rust 2024 and **pin the latest stable toolchain in `rust-toolchain.toml`**.

No `rust-toolchain.toml` exists at the repository root. The README states MSRV 1.85+ but there is no pin file. **P1**.

### 3.5 Other minor issues

- README claims "All examples are self-contained and require no network access (except `http-proxy` which needs API keys)." Accurate. ✓
- README version string `"0.2"` in `cargo add` snippet matches the workspace version `0.2.4`. ✓
- README does not mention the `crates/compressor` proposal (spec 93), even though it is on the roadmap. **P3** — could add a "Future directions" section.

---

## 4. API Documentation (rustdoc)

### 4.1 `missing_docs` lint is defeated

`crates/core/src/lib.rs`:

```rust
#![warn(missing_docs)]
// The missing_docs lint on enum variant fields is a known Rust bug; doc comments are correct above.
#![allow(missing_docs)]
```

The `allow` is placed immediately after the `warn`, rendering the warning a no-op for the entire crate. The comment references "enum variant fields" but the `allow` scope is crate-wide. **P1** — narrow the `allow` to the specific lint (`missing_docs` on enum variant fields, if that is the actual bug) or fix the comments and remove the `allow`.

### 4.2 Public API rustdoc quality

A count of `pub` items in the three main modules:

- `model.rs`: 19 public items
- `stream/mod.rs`: 6 public items
- `transform/mod.rs`: 9 public items

Many public types and functions lack `# Examples` sections:

- `TransformRequest` / `TransformResponse` — no runnable rustdoc example.
- `transform_stream()` — the primary streaming entry point, no rustdoc example.
- `anthropic_to_openai()`, `openai_to_anthropic()` — no rustdoc examples.
- `StreamState` — no rustdoc example.

The crate-level doc comment is a single paragraph and does not link to the examples directory, the specs, or the protocol matrix.

**P1** — add `# Examples` to every public entry-point function and to the crate-level doc.

### 4.3 Suppressed clippy lints

`stream/mod.rs` suppresses `must_use_candidate`, `map_entry`, `collapsible_if`, `match_same_arms`, `unnecessary_wraps`, `uninlined_format_args`. These are documented as "too noisy", but CLAUDE.md requires `cargo clippy -- -D warnings -W clippy::pedantic` to pass. The per-module `allow` blocks are acceptable but should be reduced over time. **P3**.

---

## 5. Usage Guides (Installation, Configuration, Deployment)

| Guide | Status |
|---|---|
| Installation | Only a `cargo add llm-bridge-core` one-liner in the README. No feature-flag matrix, no MSRV verification steps. **P1** |
| Configuration | `http-proxy` env vars are documented in `examples/README.md`. No library-level configuration guide. **P1** |
| Deployment | No deployment guide at all. **P1** |
| Production integration | No guide showing how to embed `crates/core` into a real HTTP server (beyond the proxy example). **P2** |
| Protocol downgrade reference | Spec 11 defines the lossy-downgrade checklist, but there is no user-facing "what happens to field X" reference page. **P2** |

---

## 6. Development Guide

### 6.1 `CONTRIBUTING.md` — missing

Referenced from both READMEs. Should contain:

- PR workflow (branch naming, commit conventions — project uses Conventional Commits per CHANGELOG)
- Required checks before opening a PR (`make ci`)
- Code style rules (or pointer to CLAUDE.md §Code Style)
- How to add fixtures
- How to run tests (`cargo nextest run`)
- How to generate the changelog (`git cliff`)

**P0**.

### 6.2 `SECURITY.md` — missing

Referenced from both READMEs. Should contain:

- Supported versions
- How to report a vulnerability (private disclosure process)
- Bug-bounty or acknowledgment policy
- Scope (the crate is a protocol translator — what threat model does it operate under?)

**P0**.

### 6.3 Human-facing development environment setup

`CLAUDE.md` and `AGENTS.md` are instructions for AI agents, not humans. There is no `docs/development.md` or similar that explains:

- Required toolchain (Rust 1.85+, cargo-nextest, cargo-clippy, cargo-audit, cargo-deny, git-cliff, cargo-release)
- Recommended editor setup
- How to run the pre-commit hooks (`docs/pre-commit-usage.md` exists but is not linked from README)
- How to run specific test subsets

**P1**.

---

## 7. Examples

### 7.1 Examples that exist vs. what the README claims

| Example file | Listed in README? | Listed in `examples/README.md`? | Runs? |
|---|---|---|---|
| `basic_nonstream.rs` | ✓ | ✓ | ✓ |
| `all_transforms.rs` | ✓ | ✓ | ✓ |
| `streaming_text.rs` | ✓ | ✓ | ✓ |
| `streaming_tool_use.rs` | ✓ | ✓ | ✓ |
| `error_handling.rs` | ✓ | ✓ | ✓ |
| `chat-roundtrip.rs` | ✓ | ✓ | ✓ |
| `http-proxy.rs` | ✓ | ✓ | ✓ |

### 7.2 Missing examples for implemented features

The core library supports several transform paths that have **no dedicated example**:

- Anthropic SSE → OpenAI Chat Completions SSE (code exists; streaming_text only shows the reverse)
- OpenAI Responses SSE → Anthropic SSE (code exists; no example)
- Anthropic SSE → OpenAI Responses SSE (code exists; no example)
- Non-streaming Anthropic → OpenAI Responses (code exists; no example)
- Non-streaming OpenAI Responses → Anthropic (code exists; no example)

**P2** — add at least one example per transform direction, or consolidate into an `all_streaming_transforms.rs`.

### 7.3 Stale streaming status table in `examples/README.md`

As noted in §3.3, the table says "Anthropic SSE → OpenAI SSE: 开发中" while the README says "✓ Implemented". **P0**.

---

## 8. Fixtures

### 8.1 `fixtures/protocol-transform/README.md` is stale

The README lists only three subdirectories:

```
- anthropic-to-openai/
- openai-to-anthropic/
- end-to-end/
```

The actual directory layout also includes:

- `responses-to-anthropic/` (2 streaming fixtures)

**P2** — update the README to list all fixture directories.

### 8.2 Missing fixture directories

The roadmap and design spec call for fixture coverage of all implemented directions. Missing:

- `anthropic-to-responses/` (non-streaming and streaming fixtures for Anthropic → OpenAI Responses)
- `openai-responses-to-anthropic/` could be renamed from `responses-to-anthropic/` for consistency

The fixture naming convention in the README also does not mention the `responses` variants already present under `anthropic-to-openai/` (e.g. `non-stream-responses-basic.json`, `stream-responses-tool-use.json`). **P2**.

---

## 9. Milestone Status Cross-Check

Cross-referencing `specs/90-protocol-transform-roadmap.md`, `specs/91-protocol-transform-impl-plan.md`, and the READMEs:

| Milestone / Phase | Roadmap 90 | Impl plan 91 | README.md | Consistent? |
|---|---|---|---|---|
| M0 / Phase 1 (non-streaming core) | Exit criteria listed, not marked closed | §0 "Phase 1-5 全部完成" | "Done" | ⚠ roadmap not explicitly closed |
| M1 / Phase 2 (streaming spine) | Exit criteria listed, not marked closed | §0 "Phase 1-5 全部完成" | "Done" | ⚠ roadmap not explicitly closed |
| M2 / Phase 3 (provider compat) | Exit criteria listed, not marked closed | §0 "Phase 1-5 全部完成" | "Done" | ⚠ roadmap not explicitly closed |
| M3 / Phase 4 (hardening) | Exit criteria listed, not marked closed | §0 "Phase 1-5 全部完成" | "Done" | ⚠ roadmap not explicitly closed |
| M4 / Phase 5 (Responses API) | Exit criteria listed, not marked closed | §5 exit criteria listed | "Done" | ⚠ roadmap not explicitly closed |
| Spec 92 (Usage extension) | Not in roadmap | "已实现" in §0 | Mentioned in status | ✓ |
| Spec 93 (Compressor) | Not in roadmap | Not referenced | Not mentioned | ✓ — still proposed |

**P2** — the roadmap should have each milestone explicitly marked `Closed` with a date and a pointer to the delivering commit or release tag.

---

## 10. Prioritized Remediation Plan

### P0 — Fix immediately (broken links, misleading claims)

1. **Create `CONTRIBUTING.md`** — covers PR workflow, `make ci`, Conventional Commits, fixture contributions, testing requirements.
2. **Create `SECURITY.md`** — covers supported versions, vulnerability disclosure, threat model for a protocol translator.
3. **Rewrite `docs/index.md`** — remove "template repository" text, add project-facing documentation entries.
4. **Fix `apps/server` description in READMEs** — either implement it, relocate the `http-proxy` example there, or label it as a placeholder.
5. **Fix `crates/core/examples/README.md` streaming table** — change "Anthropic SSE → OpenAI SSE: 开发中" to "✓ 已实现".
6. **Resolve the `docs/research/` missing reference** — either create the prior-art memo directory or remove the reference from `specs/91-protocol-transform-impl-plan.md` §0.

### P1 — High priority (expected documents missing, rustdoc quality)

7. **Create `rust-toolchain.toml`** — pin stable toolchain per CLAUDE.md requirement.
8. **Fix `crates/core/src/lib.rs` `missing_docs` defeat** — narrow the `allow` to the specific enum-variant-field case or remove it.
9. **Add rustdoc `# Examples`** to `TransformRequest`, `TransformResponse`, `transform_stream`, `anthropic_to_openai`, `openai_to_anthropic`, and the crate root.
10. **Create `docs/installation.md`** — cargo add, feature flags, MSRV verification.
11. **Create `docs/configuration.md`** — env vars, runtime options.
12. **Create `docs/deployment.md`** — production deployment patterns.
13. **Create `docs/development.md`** — toolchain, pre-commit, testing, how to run individual fixtures.

### P2 — Medium priority (stale statuses, incomplete references)

14. **Update `specs/00-protocol-transform-prd.md` status** to `accepted` / `fulfilled`.
15. **Update `specs/62-*` and `specs/63-*` status** to `implemented`.
16. **Close M0–M4 in `specs/90-protocol-transform-roadmap.md`** with dates and delivery references.
17. **Update `specs/91-protocol-transform-impl-plan.md` overall status** to `completed`.
18. **Refresh `specs/index.md`** — update status, add a "current state" summary, link to Responses fixtures.
19. **Expand `specs/README.md`** — explain the numbering scheme, link to `index.md`.
20. **Update `fixtures/protocol-transform/README.md`** — add `responses-to-anthropic/`, document the `responses-*` fixture variants.
21. **Add missing examples** for the four transform directions that currently have code but no example.
22. **Create `docs/architecture.md`** — longer-form architecture walkthrough.
23. **Create `docs/troubleshooting.md`** — common errors and downgrade warnings.
24. **Create `docs/migration.md`** — version-to-version migration notes.

### P3 — Nice to have

25. Add a "Future directions" section to the README mentioning spec 93 (compressor) and the async `Stream<Item = Bytes>` wrapper.
26. Reduce per-module `#![allow(...)]` clippy suppressions in `stream/mod.rs` and `transform/mod.rs`.
27. Add a `docs/research/` prior-art memo (if still useful) or formally retire the reference.
28. Add rustdoc examples to every remaining public type in `model.rs`.

---

## 11. Summary Counts

| Severity | Count |
|---|---|
| P0 (broken / misleading) | 6 |
| P1 (missing expected docs) | 7 |
| P2 (stale / incomplete) | 11 |
| P3 (nice to have) | 4 |
| **Total findings** | **28** |

The most urgent cluster is the **P0 broken references** (`CONTRIBUTING.md`, `SECURITY.md`, the "template repository" text in `docs/index.md`, the `apps/server` misdescription, and the stale streaming status in `examples/README.md`). These should all be fixable in a single documentation-focused PR.
