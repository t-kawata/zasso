# P22-ANALYSIS-TECH — the source-analysis technology decision

> **Status: decided, and binding on P22-5, P22-6 and P22-7.**
> This document is the decision. Those sessions read it instead of choosing for themselves.
> Re-deciding it in a later ticket is a defect: two sessions independently choosing different
> parsers would produce mutually unreadable output, and no test would catch it, because each
> session's own tests would pass against its own choice.

- **Ticket**: P22-4 — `/workspacify-reverse` R0 to R2.
- **Input**: `docs/ABOUT-ANALYSIS-TECH.md`, including the expert answer received 2026-09-10 and
  the request-side verification record in its §7.
- **Machine-readable half**: `.claude/scripts/workspacify-reverse/lib/analysis-tech.mjs`.
  The capability matrix below is rendered from that module, and a test asserts this document
  contains the rendered text verbatim, so the prose and the code cannot drift apart.
- **Declared in**: `ENV-DEPS.json`, which is the single place a dependency is described.

---

## 1. The decision

**A four-layer architecture with declared capabilities, not a single tool.**

The expert answer's conclusion is that no single stack semantic-analyses six languages at equal
depth, and that designing as if one did is the failure mode. The decision follows it, and the
layers are:

| Layer | Responsibility | Where it lives | State after this ticket |
|---|---|---|---|
| **A — read-only collection** | File enumeration, digests, language and build-description discovery, the analysis scope record | `lib/analysis-tech.mjs` (`listArtefacts`) | **Implemented** |
| **B — common syntax** | CST/AST, positions, declarations, imports, mechanism markers | `lib/structure.mjs` (`parseSourceFile` and the Rust collectors) | **Implemented for Rust** |
| **C — language-adaptive semantics** | Name resolution, types, implementation relations, CFG, limited data flow | not built here | **Declared; `not_attempted`** |
| **D — evidence and propositions** | Provenance, coverage, analysis failures, lineage approximation, candidate ranking | `lib/analysis-tech.mjs` (vocabulary, matrix, ledger, contract) | **Implemented** |

**tree-sitter is the syntax layer**, and it is a syntax fallback rather than a semantic resolver.
It recovers no name resolution, no trait or interface implementation, no C++ template
instantiation, no Python runtime attribute and no JavaScript runtime property. Everything this
ticket reports is a fact read from source text and its syntax tree, which is why every adapter
reports `analysis_mode: "syntax_only"` and `files_semantically_resolved: 0`.

### Why tree-sitter, in evidence

| Claim | How it was checked |
|---|---|
| Grammars exist for all six target languages | The npm packages `tree-sitter-rust`, `tree-sitter-typescript`, `tree-sitter-javascript`, `tree-sitter-go`, `tree-sitter-python`, `tree-sitter-c` and `tree-sitter-cpp` were resolved and installed: all seven ship a prebuilt `.wasm`. |
| The parser actually extracts what R1 and R2.5 need | `web-tree-sitter@0.25.10` was driven over `siprs-for-reverse/src/*.rs` and produced `mod_item`, `use_declaration`, `macro_invocation`, `visibility_modifier`, `dynamic_type`, `foreign_mod_item` and `enum_variant` nodes, with `hasError === false` on the files read. |
| The toolchain is declared rather than assumed present | `.claude/scripts/workspacify-reverse/package.json` pins every version, and the package is a declared npm root in `ENV-DEPS.json`. |

Grammar versions are pinned because a grammar change changes the AST, and an AST change changes
every measurement taken from it.

### The six target languages

The design's §3.1 names "6 languages" and lists five rows — `Rust / TypeScript・JavaScript / Go /
Python / C・C++`. Those do not agree, and this document resolves the ambiguity explicitly rather
than leaving a later session to guess:

```
rust, typescript, javascript, go, python, c_cpp
```

Six entries, matching the six grammars the instrument loads. `typescript` and `javascript` are
separate because they are separate languages with separate module systems and separate grammars.
`c_cpp` is one entry because the design gives C and C++ a single instrument problem and a single
quality boundary — `compile_commands.json` — and splitting them would imply two answers where the
design has one.

---

## 2. The capability matrix

One value per language per extraction item. The permitted values are exactly:

```
success, partial, not_attempted, failed, unsupported_in_principle
```

**A gap in this matrix is a property of the instrument.** It is never evidence that the thing
sought is absent from the project being analysed. `unsupported_in_principle` says no instrument
can do it; `not_attempted` says this instrument version does not; `partial` says it does, and
here is the boundary of what it recovers. Collapsing any of those into "not there" is failure
F12, and the vocabulary exists so that a consumer cannot make that substitution by accident.

| Extraction item | rust | typescript | javascript | go | python | c_cpp |
|---|---|---|---|---|---|---|
| E1 | partial | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |
| E2 | partial | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |
| E3 | partial | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |
| E4 | partial | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |
| E5 | partial | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |
| E6 | partial | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |
| E7 | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |
| E8 | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |
| E9 | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |
| E10 | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |
| E11 | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |
| E12 | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |
| E13 | unsupported_in_principle | unsupported_in_principle | unsupported_in_principle | unsupported_in_principle | unsupported_in_principle | unsupported_in_principle |
| E14 | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |
| E15 | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |
| E16 | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |

### Reading the Rust row

`partial` rather than `success` for E1–E6 is deliberate and is not a hedge. A syntax tree is
genuinely not the whole answer:

- **E1** — `mod` declarations are visible; a module a macro generates is not.
- **E2** — `pub fn`, `pub struct`, `pub trait` and `pub const` are visible as the text writes
  them; `pub use` re-exports and macro-generated items are not. The instrument records the
  declared spelling (`pub`, `pub(crate)`) and does not decide external visibility, because that
  needs name resolution.
- **E3, E4** — declarations are visible; whether a type is *the* error type is a judgement. R1
  records the signals it found — the name matches `error`, the type implements a trait whose name
  contains `Error`, the type appears in the error position of a `Result` — and hands the
  classification to a human.
- **E5** — a `use` declaration's first segment is resolved to the source member that declares it.
  That is a syntactic import edge, not a resolved module edge and certainly not a runtime one.
- **E6** — the mechanisms are enumerated from the syntax tree with their `file:line`. Exhaustiveness
  over an arbitrary program is not decidable, and this instrument does not claim it.

### Reading the other five rows

`not_attempted` means exactly what it says: the grammar is installed and the syntax layer reaches
the language, but **this ticket writes no extractor for it**. The ticket measures R0 to R2.5 over
one Rust crate and nothing else. A later ticket that writes a TypeScript extractor changes these
cells; a later ticket that finds a cell impossible writes `unsupported_in_principle` and the
reason with it.

### E13 is `unsupported_in_principle` everywhere

Semantic equivalence of general programs is undecidable. E13 is **TCE** — trivial, syntactic,
compiler-normalisation equivalence — and only that is ever claimed. An AST-normalised match proves
syntactic equivalence under a named configuration and nothing more. `i < n` and `i <= n - 1` may
differ under integer overflow, type, side effects in `n`, language specification or undefined
behaviour, and a normalised match does not address any of that.

---

## 3. The adapter output contract

Every adapter — structure, dependency, execution surface, and every one written later — emits the
same three-part result. An adapter that returns a bare extraction list is rejected, because it
cannot be told apart from a complete result that happened to find little.

```
{
  analysis_mode: "syntax_only" | "partial_semantic" | "configured_semantic" | "runtime",
  coverage: {
    files_discovered: number,
    files_parsed: number,
    files_with_error_nodes: number,
    files_semantically_resolved: number,
    configs_enumerated: number,
    configs_analyzed: number
  },
  limitations: [
    { code: "...", scope: "...", effect: "..." }
  ]
}
```

A limitation must name a **code** (so it can be referred to), a **scope** (so it can be bounded)
and an **effect** (so it can be weighed against the conclusion it qualifies). An entry missing any
of the three is refused.

`analysis_mode` is lowered whenever a configuration cannot be resolved. `syntax_only` is the floor
of the scale, which is why a missing grammar is reported through `limitations` rather than by
lowering the mode further — the mode says how much was resolved, and the limitation says what
could not be.

### The analysis attempt ledger

```
analysis_attempt:
  target:          src/api/login.rs
  configuration:   syntax-only
  tool:            tree-sitter-rust
  phase:           parse | preprocess | name_resolution | typecheck | cfg | dataflow
  status:          success | partial | failed | skipped
  diagnostics:     [...]
  extracted_count: 0
  reason:          parser_error | grammar_unavailable | unreadable |
                   unsupported_language | no_extractor_for_language
```

**This exists so that `extracted_count: 0` cannot mean two things at once.** Without the ledger,
"analysed and found nothing" and "could not analyse" are the same record and therefore neither.
The ledger reports `extractedNothingCount` and `couldNotRunCount` in separate fields, and a test
asserts those fields exist separately — their counts may coincide, and one of each is exactly that
case, so what must hold is that a reader cannot collapse them.

### Evidence modes

```
evidence_mode: source_static | build_semantic | runtime_dynamic
```

`observed` may only ever mean *a fact read from the source text or its syntax tree*. Runtime
behaviour, dynamic dispatch targets, post-preprocessing composition and generated code are not
`observed` without execution, build or trace evidence. This is enforced mechanically:
`classifyWithDynamicEvidence` refuses `observed` for a proposition that touches a listed dynamic
mechanism, and demotes it to `inferred`.

---

## 4. Rejected alternatives, and why

| Candidate | Why it is not the syntax layer |
|---|---|
| **Joern** | Its official frontend has **no Rust** (`C, C#, Ghidra, Go, Java/Kotlin, JS/TS, PHP, Python, Ruby, Swift`). It cannot be the six-language semantic layer. Recorded as an auxiliary candidate-discovery backend for the languages it does cover, and declared `optional` for that reason. |
| **SCIP** | An **exchange format, not an analyser**. It carries symbol identity between tools and settles no language difference by itself. `rust-analyzer scip .` does emit a protobuf index in batch, so SCIP is worth adopting later as an interchange for definitions and references (E5, E10, E15, E16) — but it does not replace a syntax layer. |
| **CodeQL** | It **does** support Rust — GA October 2025, with Rust and C/C++ build-free scanning. The claim in the original consultation that it does not was wrong, and §7 corrects it. It is kept as a declared, `optional` layer-C capability rather than the foundation, because its measured limits are macro-heavy code, `async`/`await`, and false positives inside guarded `unsafe` — and because relying on it would put a proprietary build system between the analysis and a project that must not be built. |
| **The existing regex approach** (`rfc-graph/analyze-source-structure.js`) | Explicitly not equal to extracting guards, invariants and state machines. A regular expression over source text cannot separate a `cfg`-gated item from an ungated one, cannot tell a `dyn Trait` from the word "dyn" in a comment, and cannot give a node a reliable `file:line`. It stays where it is, doing the job it was written for. |
| **A single tool for all six languages** | The expert answer's central finding, and §7 does not weaken it: no such stack exists at equal depth. Designing as if one did is the failure this decision avoids. |

---

## 5. Tool manifest

| Item | Value |
|---|---|
| Syntax layer | `web-tree-sitter` 0.25.10 |
| Grammars | `tree-sitter-rust` 0.23.2, `tree-sitter-typescript` 0.23.2, `tree-sitter-javascript` 0.25.0, `tree-sitter-go` 0.25.0, `tree-sitter-python` 0.25.0, `tree-sitter-c` 0.24.1, `tree-sitter-cpp` 0.23.4 |
| Declared npm root | `.claude/scripts/workspacify-reverse` in `ENV-DEPS.json` |
| Declaration | `.claude/scripts/workspacify-reverse/package.json` |
| Node | 22 or later, so that `node --test` is available |
| Container / image digest | none — this layer runs in the host process, over a read-only walk |
| Environment variables | none affect a run |
| Exact command line | `node .claude/scripts/workspacify-reverse/run.mjs analyze <root> --through=<stage>` |

**Tool version pinning alone is insufficient**, and the design says so. The record that matters is
the combination of grammar version, target-tree hash, OS, architecture and the full command line.
`ANALYSIS-SCOPE.json` carries the target commit and the target-tree digest; `ANALYSIS-ATTEMPTS.json`
carries the tool identity per file.

### C/C++ has a hard quality boundary

With `compile_commands.json`, per-translation-unit flags, working directory and include conditions
can be replayed. Without it, a Clang AST is an approximation the analyser chose for itself. A run
that cannot find the database must say so in `limitations` and must not silently degrade. The
`c_cpp` column of the matrix is `not_attempted` today for that reason among others.

---

## 6. What §7 leaves unverified

§7 of `docs/ABOUT-ANALYSIS-TECH.md` records four items. This decision rests on none of the
unverified ones:

| Item | §7 verdict | Effect on this decision |
|---|---|---|
| CodeQL supports Rust | **Corrected** — the consultation was wrong | Candidate list corrected; CodeQL kept as an optional layer-C capability |
| Joern has no Rust frontend | **Confirmed** | Joern rejected as the six-language semantic layer |
| `rust-analyzer scip .` emits a protobuf index | **Confirmed** | SCIP recorded as a later interchange, not a syntax layer |
| The gofmt reproducibility sentence | **Unverified** — the direction is supported, the citation is not | No weight placed on it. TCE pins the tool *and* records its output, which is the safe form of the claim regardless |

Items §7 explicitly did not verify — that Clang has no faithful unparser, that `prettyplease` drops
comments, that Python's `ast.unparse()` does not round-trip, the PBT library recommendations, and
the adequacy of a 50k-LOC corpus — are **not relied on here**. P22-5 onward must measure them
before building on them.

---

## 7. What this means for P22-5, P22-6 and P22-7

1. **Do not re-decide the technology.** Read this document and build on it.
2. **Layer B is tree-sitter, and it is syntactic.** A claim that a name resolved, a type checked
   or a trait implementation was found is a layer-C claim, and layer C is not built here.
3. **`observed` is a narrow word.** It means a fact read from source text or its syntax tree.
   Anything that depends on what runs needs `runtime_dynamic` evidence, and the guard is mechanical.
4. **Publish gaps; do not hide them.** The matrix has five values so that a gap can be recorded as
   a property of the instrument. Adding a language means adding a row-ful of honest cells, not
   deleting the ones that read badly.
5. **The instrument is declared, not assumed.** A new tool is an entry in `ENV-DEPS.json` — never a
   new installation mechanism, and never a dependency left undeclared because it happened to be on
   the machine where it was developed.

---

## 8. The property-based testing engine (P22-7)

R6.5 generates property-based tests from R3's invariants. The engine each language's generated
property is written for is recorded here, as the ticket requires, and mirrors `PROPERTY_ENGINES` in
`.claude/scripts/workspacify-reverse/lib/property-tests.mjs`:

| Language | Engine |
|---|---|
| rust | `proptest` |
| typescript | `fast-check` |
| javascript | `fast-check` |
| go | `rapid` |
| python | `hypothesis` |
| c_cpp | `RapidCheck` |
| unknown | `unrecorded` |

**The engine is a secondary choice and this section is not the load-bearing part of R6.5.** What that
stage actually depends on is the closed vocabulary of property categories and the ordering of oracle
independence, and neither changes with the engine. Swapping `rapid` for `gopter`, or `RapidCheck` for
`libFuzzer`, changes which program runs a generated property — it does not change what the property
is allowed to assert.

**No engine is installed by this decision.** P22-7 writes each generated property as text and records
the engine it is written for; nothing in this repository shells out to a PBT library. That is why
this section adds no entry to `ENV-DEPS.json`: §7 item 5 governs *tools the analysis runs*, and a
recorded engine name is not one. The first ticket that actually executes a generated property is the
ticket that must declare the engine it executes it with.

The section below is the part that does carry weight, and it is why a generated property is never
evidence on its own. An oracle read off the implementation agrees with the implementation because it
was read off the implementation, so the categories that would be generated from an
implementation-derived oracle are reported separately and marked `requires_human_approval`. The
vocabulary and the refusal rules are specified in ABOUT-REVERSE 11.5 R-3.
