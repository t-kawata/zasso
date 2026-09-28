# Holdout protocol

How generality is judged for the reverse rotation, and what invalidates a result.

This document is read top to bottom. If you are running a reverse rotation for
the first time, read §1 to §4 before you touch anything, and keep §5 open while
you work.

---

## 1. Why there is a holdout at all

The reverse rotation was developed against `siprs`. Every measurement taken
during its development — layer counts, rename behaviour, `include_str!`
detection — was taken on that one project. A method that only handles siprs's
single-crate Rust layout with a `vendor/` directory would pass every existing
test while being useless in general, and no test would catch it, because the
test would be measuring the method against the project it was tuned to.

So generality is measured, not asserted. It is measured on a project the method
has never seen, frozen before the analysis exists.

The requirement is absolute and comes from the design's failure catalogue: **an
implementation or analysis test tuned to siprs such that it only appears to
succeed must never be produced.**

---

## 2. What makes a project eligible

ABOUT-REVERSE §3.6 lists the necessary conditions. A project that fails any of
them is very unlikely to complete a reverse rotation:

| Condition | Why it matters |
|---|---|
| it builds | dependencies and public surface cannot be fixed mechanically otherwise |
| its tests exist and run | without tests there is no foundation for rebuilding Red |
| it has version-control history | "intent or accident" has no evidence without `git blame`, co-change and commit messages |
| its primary language is analysable | the toolchain must be able to read it |
| its directory structure carries meaning | a flat or fully generated structure cannot be partitioned |
| some documentation or comment survives | with no "why", every judgement is a guess |

ABOUT-REVERSE §3.6 also lists danger signals — no tests, no history, a
codebase dominated by generated code, dynamic metaprogramming, knowledge held
by one person, or a size that makes mechanical analysis impractical.

**This list is a condition for a human to assess, not a scoring function.**
ABOUT-REVERSE §7.7.2 rejects a fixed threshold explicitly: a threshold is a
false criterion, unrelated to the domain, the regulation and the scale of the
project. The machine's job is to put the material in front of you.

---

## 3. What the machine supplies, and what only you decide

`run.mjs holdout` reports, for each declared candidate:

- **capability** — whether a build manifest is present, whether the tree is a
  repository, whether documentation survives, whether the primary language is
  analysable, and where the project keeps the bulk of its own source
- **observability** — how many files the toolchain would actually read, which
  languages are present, how many test files there are, and the test command the
  manifest implies
- **falsifiability** — how a reconstruction could be refuted: test count,
  commit count, whether a design document survives
- **risk** — the danger signals above, each one detected rather than assumed
- **reasons** — one plain-English line per dimension

It does **not** report whether the project is eligible. There is no `eligible`
field, and a test asserts that no field of that shape exists — because the
moment the machine can say "eligible", the decision has moved away from you and
the design's central principle has been quietly inverted.

Zero holdouts is a lawful state. `run.mjs holdout` exits 0 and says that none
were selected, because that is a fact about the checkout and not a failure.

---

## 4. Freezing

Freezing records a content digest. It does not copy the project.

1. Check the project out at the path its declaration names in
   `tests/workspacify-reverse/holdout/CANDIDATES.json`, at the commit that
   declaration records:

   ```bash
   git clone --depth 1 <url> tests/workspacify-reverse/holdout/corpus/<id>
   ```

   The trees are not committed: the ledger freezes a digest, and the commit in
   the declaration reproduces the bytes. A holdout that is absent from a
   checkout is recorded as not selected rather than fabricated.
2. Run:

   ```bash
   node .claude/scripts/workspacify-reverse/run.mjs holdout freeze \
     --frozen-at=<ISO-8601> --project-root .
   ```

3. Confirm with `run.mjs holdout` that every frozen digest recomputes and that
   `verifyIsolation` reports each holdout root clean.

**The ledger is append-only.** Re-freezing a holdout whose content has changed
is refused, and the refusal names both digests. To re-freeze legitimately,
either restore the tree or declare it under a new id.

**The freeze is the moment of selection.** Everything after it is subject to §5.

---

## 5. The blind protocol

### 5.1 Executor isolation

The executor that runs the analysis must not be able to reach the answer key.
Concretely, no ground-truth artefact may be reachable from the target root:

- `*-GRAPH.json` (a graphify or boundify graph)
- `RFC-*.md` (a design RFC)
- `Tickets.json` (the ticket ledger)
- `README.md` (the project readme)

These are the shapes a forward rotation leaves behind, and the shapes the
reverse rotation would otherwise be able to read directly.

```bash
node .claude/scripts/workspacify-reverse/run.mjs holdout isolation <target-root>
```

Exit 0 means clean. Exit 1 names every reachable artefact by filename.

A dependency's own `README.md` — a vendored library's, say — is reported
separately and does not fail the check. It is not your answer key, and treating
it as one would make the check unusable on every vendored project.

A **holdout** is checked with the narrower vocabulary, without `README.md`. A
holdout has not been forward rotated, so its own readme is the project's
documentation — exactly the material the analysis is meant to read — and not a
derived answer key. Nothing is lost: a holdout that *had* been forward rotated
would carry the graph, the RFC and the tickets as well, and all three are still
reported by name.

### 5.2 No reachable ground truth

The answer key itself, `siprs-with-4layers`, is held **outside the target
root** and is never written to. `reconcile` refuses to run against an oracle
whose digest has changed since it was frozen; a comparison against a modified
answer key measures nothing.

### 5.3 First run only

**The first run is the result. Report it and nothing else.**

Any adjustment to the analysis after seeing holdout results invalidates those
results. This is not a rule of etiquette: the point of the holdout is that the
method was fixed before the answer was known, and a method adjusted afterwards
has been fitted to the answer. The number stops meaning what it appears to mean.

If you adjust the analysis, say so, and report the run that produced the
adjustment as a development run rather than a measurement.

---

## 6. Reading the result

A comparison against the answer key produces a **disagreement list**. It never
produces a score, a ratio presented as a grade, or a pass/fail verdict. Whether
reverse engineering succeeded is a judgement you make after several loop
rounds, and the tooling has no field that could carry a verdict.

Each disagreement carries one of four kinds:

| Kind | Meaning |
|---|---|
| `missing_from_analysis` | the answer key has it and the analysis did not produce it |
| `extra_in_analysis` | the analysis produced it and the answer key does not have it |
| `divergent` | both have it, and the two differ |
| `unobserved` | the analysis never looked at that region |

The fourth is not a disagreement. A stage that could not semantically resolve
its input has not agreed with the answer key and has not disagreed with it — it
never looked. Summing that into a disagreement count destroys the only signal
that matters.

`divergent` is only detectable where the answer key records *what* a member
says, which it does for graph node ids (their titles) and ticket keys (their
titles). The other stages compare name sets, so a member can be missing or
extra there but not divergent. Where a stage's input carries `{name, value}`
entries, a shared name whose value differs is reported as divergent and the
evidence quotes both values.

Two results require scrutiny rather than a conclusion:

- **zero disagreements** — two independent derivations agreeing exactly is a
  contamination signal, not accuracy;
- **many `unobserved` regions** — the run measured less than its size suggests,
  and what it did not measure is listed so you can see how much.

Classifying each disagreement — the analysis missed something the forward
rotation had, the analysis found something the forward rotation did not have,
or the forward rotation's own artefact was a free choice rather than a necessary
one — depends on intent, which neither tree records. That work is yours.

---

## 7. Where the artefacts live

| Path | What it is |
|---|---|
| `tests/workspacify-reverse/holdout/CANDIDATES.json` | the declared candidates |
| `tests/workspacify-reverse/holdout/HOLDOUTS.json` | the frozen ledger, append-only |
| `tests/workspacify-reverse/oracle/ORACLE-BUNDLE.json` | the frozen answer key |
| `tests/workspacify-reverse/oracle/KNOWN-DELTA.json` | the measured difference between the two trees |
| `docs/ANSWER-KEY.md` | what the answer key contains, and how each count is measured |

Both frozen artefacts are regenerated rather than hand-edited, so neither can
state something the trees do not:

```bash
node .claude/scripts/workspacify-reverse/run.mjs oracle freeze
node .claude/scripts/workspacify-reverse/run.mjs oracle delta
```

`oracle delta` reads both trees and rewrites `KNOWN-DELTA.json` from the
measurement. `oracle compare` reads that file, so a hand-written delta would
label every difference discovered since as `expected` without anything noticing;
a test asserts the checked-in file matches a fresh measurement.
