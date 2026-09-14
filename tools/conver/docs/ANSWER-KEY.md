# Answer key

What the paired trees are, how each measurement is taken, and what the numbers
disagree with.

Read §1 and §2 to understand the instrument. Read §3 before quoting any count.
Read §5 and §6 before running a comparison.

---

## 1. The two trees

| Tree | What it is |
|---|---|
| `siprs-with-4layers` | the **answer key**. `siprs` taken through the forward rotation to RESIDUE 0, so it holds the RFC, the graph, the partition, the tickets, the contract annotations and the boundify headers that reverse rotation is trying to reconstruct. |
| `siprs-for-reverse` | the **subject**. The same project with those artefacts stripped by PX-203. This is what the analysis runs against. |

Neither tree is its own repository; both are tracked inside the conver
repository, so `git status --porcelain -- <tree>` is the non-modification check
and no new tooling is needed for it.

**Modifying `siprs-with-4layers` destroys the answer key permanently** and
invalidates every measurement ever taken against it. `reconcile` refuses to run
when the frozen digest no longer matches, and the test suite asserts the tree's
digest is unchanged before and after every comparison.

Run the freeze and the comparison from the project root:

```bash
node .claude/scripts/workspacify-reverse/run.mjs oracle freeze --frozen-at=<ISO-8601> --project-root .
node .claude/scripts/workspacify-reverse/run.mjs oracle compare --stage r3 \
  --candidate=<path> --project-root .
```

---

## 2. The eight artefacts

Each artefact records the **rule** it was measured by and a digest over the
material it was extracted from. A number without a rule cannot be reproduced,
and a number that cannot be reproduced cannot be argued with.

| Artefact | Rule | Digest over |
|---|---|---|
| `graph` | `RFC-ROOT-GRAPH.json`: `nodes.length`, `edges.length`, and every node id | the file's bytes |
| `dirsTree` | `RFC-ROOT-Dirs-Tree.json`: character count of the minified JSON, and every directory path under `trees.*` | the file's bytes |
| `tickets` | `Tickets.json`: `phases.length`, the ticket count across all phases, and the `verify_spec_*` tests under `tests/` | the file's bytes |
| `omissions` | `omissions/OMISSIONS-*.json`: the file names | each file's own digest |
| `verifies` | comment-anchored `@verifies` annotations | each annotation's `file` and `line` |
| `ticketMarkers` | files with a comment line carrying `[::TICKET::]` | the matching files |
| `designHeaders` | files with a comment line beginning an `Initial Design Artifact` header | the matching files |
| `rfcRoot` | `RFC-ROOT.md`: every markdown heading | the file's bytes |

`rfcRoot` is the eighth. The design's schema names seven; stage R8 compares
claims against `RFC-ROOT.md`, so the eighth is required by the declared stage
table rather than added for symmetry.

### Counting a comment, not a mention

`verifies`, `ticketMarkers` and `designHeaders` count a **file that carries the
annotation as a comment**. That is the definition `trace-patterns.mjs` already
uses for the L1 and L2 layers, and it is the only reading under which the count
means what it says: the string `Initial Design Artifact` occurs in 43 files of
ticket and RFC prose that carry no header at all.

---

## 3. Measured counts, and what they disagree with

Measured on 2026-09-10 against the frozen trees.

| Artefact | Measured | The design documents state |
|---|---|---|
| `graph` | 113 nodes, 153 edges | 113 / 153 — agree |
| `dirsTree` | 26,820 minified characters | 26,820 — agree |
| `tickets` | 21 phases, 146 tickets | 21 / 146 — agree |
| `omissions` | 8 files | 8 — agree |
| `verifies` | **127** files; 1,356 annotations; 198 distinct contract ids | 232 — **not reproduced** |
| `ticketMarkers` | **313** files; 3,980 markers | 379 — differs by counting rule |
| `designHeaders` | **100** files | 143 — differs by counting rule |
| tree listing | 4,272 files outside `target/` | 4,272 — agree |

Three counts disagree, and the bundle records each one with every definition
that was tried. They were not adjusted to match the documents.

- **`verifies` (stated 232)** — no definition tried reproduces it. The closest
  readings are 228 files containing the token and 127 files carrying it as a
  comment. The stated number could not be reproduced from this tree.
- **`ticketMarkers` (stated 379)** — 379 is the count of files *containing* the
  token, which includes 66 files of prose that carry no marker.
- **`designHeaders` (stated 143)** — 143 is the count of files *containing* the
  text, which includes 43 files of ticket and RFC prose that carry no header.

A test asserts that the discrepancy list names all three and that every entry
carries its reason and the definitions that were tried. A number that passes a
test because it was adjusted to match a document is worth less than a number
that fails honestly.

---

## 4. The known delta between the two trees

`siprs-for-reverse` is not a byte copy of the answer key. PX-203 removed the
forward artefacts, stripped provenance comments, renamed ten ticket-keyed test
files and deleted whole L3 test functions. Every one of those is intentional.

Without recording them, the first reconciliation would report them as findings
and waste a classification pass. So they are **measured**, never assumed, and
recorded in `tests/workspacify-reverse/oracle/KNOWN-DELTA.json` with the
evidence that established each one.

| Difference | Count | Measured how |
|---|---|---|
| files present only in the answer key | 1,491 | `listTreeFiles` on both trees |
| files present only in the subject | 10 | the renamed tests |
| files whose content differs | 146 | per-file digest |
| — of those, trace-stripped only | 144 | comment-stripped content is identical |
| — of those, substantive | 2 | `Cargo.toml`, `src/client.rs` |
| renamed test files | 10 | three recovery rules, below |
| removed L3 test functions | 9 | whole functions absent from the subject |

### 4.1 The ten renames, and how each was recovered

No single rule recovers all ten, so three are applied in order and a name no
rule can pair is **reported**, never guessed.

| Original | Renamed | Recovered by |
|---|---|---|
| `verify_spec_p9_1` | `verify_spec_e0606bc3` | Cargo.toml line alignment |
| `verify_spec_p10_1` | `verify_spec_a4ecaf0f` | Cargo.toml line alignment |
| `verify_spec_p8_2` | `verify_spec_0963da9b` | Cargo.toml line alignment |
| `verify_spec_p9_2` | `verify_spec_f330ed39` | Cargo.toml line alignment |
| `verify_spec_p7_3` | `verify_spec_26d77120` | comment-stripped content identical |
| `verify_spec_p8_3` | `verify_spec_36123930` | comment-stripped content identical |
| `verify_spec_p8_7` | `verify_spec_7c1bb4d6` | comment-stripped content identical |
| `verify_spec_p9_3` | `verify_spec_64eff610` | comment-stripped content identical |
| `verify_spec_p9_5` | `verify_spec_7e78be0d` | comment-stripped content identical |
| `verify_spec_p0_1` | `verify_spec_4b35a676` | whole-function removal |

The last one is the only unpaired name on both sides, and its difference is
exactly one removed function — `rfc_source_referenced`, which read `RFC-ROOT`
and was removed whole with its three lines.

### 4.2 The removed L3 test functions

Nine whole functions were removed from `src/client.rs`, each one reading
`RFC-ROOT.md`. The design record names one of them
(`purpose_scope_remains_audio_only`); the measurement finds nine, and lists
each with the document it read:

```
purpose_scope_remains_audio_only
conclusion_declares_all_requirements_implementable
io_boundaries_documented_as_reference
observability_section_documented_in_rfc
security_and_platform_sections_documented_in_rfc
audio_device_policy_and_usage_examples_documented_in_rfc
challenges_and_panic_policy_documented_in_rfc
rfc_contains_all_sections_through_61
readme_documents_mic_source_and_unsubscribe
```

The measurement is reported as measured. `Cargo.toml` is the only other file
whose non-comment content differs, and its difference is four `[[test]]` names.

**No line of production code changed.** That is what makes a later disagreement
attributable to the analysis rather than to a difference in the subject.

---

## 5. The stage-to-oracle table

Adding a stage means adding a row. Each row names the artefact and the unit,
because a comparison that does not name its unit cannot be argued with: 146
tickets and 146 strings are not the same claim.

| Stage | Artefact | Unit | Question |
|---|---|---|---|
| `r1` | `dirsTree` | directory | does the reconstructed structure match the partition? |
| `r2` | `dirsTree` | directory | does the reconstructed module boundary match? |
| `r3` | `verifies` | contract id | does a contract candidate match an annotated contract? |
| `r5` | `omissions` | omission file | does a recorded gap match an omission file? |
| `r6` | `ticketMarkers` | test name | does an absent-Red claim match a ticketed test? |
| `r8` | `rfcRoot` | heading | does a claim match the canonical RFC? |
| `partition` | `dirsTree` | directory | P22-11: does the partition match? |
| `grounding` | `graph` | node id | P22-14: does grounding match the 113-node graph? |
| `headers` | `designHeaders` | file | P22-15: does a generated header land on a file that has one? |
| `mapping` | `tickets` | ticket key | P22-16: does a test-to-ticket mapping match the 146 tickets? |

---

## 6. Disagreement kinds, and the analysis mode

Four kinds, and the fourth is not a disagreement:

| Kind | Meaning |
|---|---|
| `missing_from_analysis` | the answer key has it and the analysis did not produce it |
| `extra_in_analysis` | the analysis produced it and the answer key does not have it |
| `divergent` | both have it, and the two differ |
| `unobserved` | the analysis never looked — not agreement, not disagreement |

`unobserved` is a first-class entry with a region, the phase it stopped at and
the reason. It is never rendered as "no disagreement found" for that region.

`divergent` is detectable only where the answer key records what a member
*says*, not merely that it exists. It records titles for graph node ids and for
ticket keys, so `grounding` and `mapping` can report a divergence; the remaining
stages compare name sets, where a member can be missing or extra but not
divergent. Where a stage's input carries `{name, value}` entries, the evidence
quotes both values.

Every disagreement also carries the **analysis mode** that produced it, so a
finding from a corpus the toolchain could only read syntactically is
distinguishable from one it could resolve semantically. The ladder is ranked:

```
runtime_dynamic (3)  >  build_semantic (2)  >  source_static (1)  >  unobserved (0)
```

A language the chosen toolchain resolves semantically yields `build_semantic`;
one it can read only syntactically yields `source_static`. The toolchain itself
is decided once, in P22-4, and recorded in `docs/P22-ANALYSIS-TECH.md` and
`ENV-DEPS.json`; this harness reads that decision rather than making it.

**The returned shape has no `score`, `ratio`, `grade` or `verdict` field**, and
a test asserts that by inspecting the keys. Zero disagreements is reported as a
finding requiring scrutiny, because two independent derivations agreeing exactly
is a contamination signal rather than accuracy.
