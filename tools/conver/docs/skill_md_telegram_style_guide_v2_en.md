# SKILL.md / Slash Command Telegram-Style Authoring Guide v2
## For workflow-type slash commands with multi-stage gates, self-healing, and forward/reverse duality

Building on the prior version (the deterministic/nondeterministic binary), this
extends and optimizes for workflow groups with the following 6 characteristics.
This guide contains no specific command names whatsoever. As a general-purpose
guide, it applies to any slash command group.

The 6 target characteristics:
1. Multi-stage gates (a verification hierarchy where a later stage cannot hold unless the earlier stage passes)
2. Self-healing loop (self-correct on failure, retry up to a bounded count)
3. Forward/reverse duality (two entry points converging on the same terminal state)
4. Separation of forced-autonomy directives (must not ask a human) from approval gates (must ask)
5. Distinction between staging (intermediate artifacts) and the published canon
6. Embedding dependencies on other commands self-containedly by role + contract, not by name

---

## 0. Core Principles

> The workflow and purpose-achievement defined in the original slash command Markdown must never be destroyed.
> The timing and execution method of script-execution instructions defined in the original slash command Markdown must never be changed.
> The structure and order of gates and loops defined in the original slash command Markdown must never be changed.
> Where descriptive prose is deliberately present in limited sections, its descriptive power must not be degraded.
> As a rule, do not explain. Declare.
> Parts that instruct the AI to act must be phrased as explicit commands.

All vocabulary, heading structure, and notation from the prior version
(`cmd`/`exit`/`out:`/`judge:`/`ask`/`no ...`, etc.) remain valid. This guide
adds **new vocabulary** on top of that and codifies **how to write
self-contained files**.

---

## 1. The Principle of Self-Containment (highest-priority constraint)

For this class of workflow, a single file must never implicitly presuppose
another workflow. When a dependency on another command exists, **referencing
another file by name is prohibited. Embed the dependency's "role, input
contract, output contract, completion condition" directly in place.**

### 1.1 Bad practice (relies on tacit knowledge)

```md
Depends on: the preceding command
```

This is meaningless to the reader (an AI that has not read the other command).

### 1.2 Good practice (self-contained via role + contract)

```md
Upstream (role, not name):
- produces: <artifact type>, schema: {nodes[], edges[], sourceFile}
- guarantee: every node has resolvable headingRefs
- if missing/invalid → stop; this workflow cannot start
```

- State "what kind of process produced this" as a **one-line role statement**.
- State "what that process guarantees" as a **one-line contract** (a guarantee usable as a precondition).
- Do not write command names or slash notation. Role names should be noun phrases
  (e.g., `upstream: graph builder`, `downstream: ticket splitter`).

### 1.3 Embed downstream dependencies the same way

```md
Downstream (role, not name):
- consumes: <output of this workflow>
- expects: schema-valid, no orphan nodes
- this workflow's Done: condition must satisfy that expectation
```

Self-containment check:
- Can an AI that has read this file alone understand that "this comes after
  something" and "this leads into something," while still being able to
  **execute this workflow without additionally reading that "something"**?
- When using "the output of the preceding stage," state its **shape (schema/
  guarantee)** here explicitly, rather than writing "go read the preceding stage."

---

## 2. Compressed Notation for Multi-Stage Gates (Gate Hierarchy)

A verification hierarchy with a **parent-child relationship**, where a later
gate is meaningless unless the earlier gate has passed, is compressed as
follows.

```md
Gates:
G0 input   : <verification content in one word> → fail: stop
G1 struct  : <...> → fail: stop
G2 content : <...> → fail: back to G1 fix
G3 cross   : <...> → fail: back to G2 fix
Rule: parent not PASS ⇒ child never PASS
```

- Fix gate names to the pattern `G<N> <one-word label>`.
- State the invariant "a child cannot PASS unless its parent has PASSed"
  **exactly once**; do not repeat it on every gate line.
- Limit failure transitions to one of two choices: `fail: stop` or
  `fail: back to G<N-1>`. Prose such as "please go back and fix the earlier
  stage" is prohibited.

### 2.1 Mixing gates with nondeterminism

Even when the gate's judgment itself is deterministic (a script's exit code),
the corrective action is often nondeterministic. In that case, separate the
judgment line from the decision line.

```md
G2 content: `check.sh` → exit 0 pass
  fail: judge: identify violated rule from error output; fix; re-run G2
```

---

## 3. Compressed Notation for the Self-Healing Loop

The structure "self-correct on error, and retry up to a bounded count" needs
only **three points: the bound, the condition, and the return target**. Do
not write the rationale or the mindset behind it.

```md
Heal-loop <name>:
  check: `verify.sh`
  ok → next
  fail → judge: fix per script output; re-run check
```

- Fix "correct according to the instructions the script printed" into the
  single line `judge: fix per script output`.
- When multiple checks run within the same loop, gather the list of checks
  into one place.

```md
Heal-loop integrity:
  checks: `axis1.sh`, `axis2.sh`, `axis3.sh`
  all ok → next
  any fail → judge: fix; re-run all
```

---

## 4. Compressed Notation for Forward/Reverse Duality

When the same workflow has two entry points — "create new (forward)" and
"reconstruct from an existing artifact (reverse)" — and both converge on the
same terminal state, **do not duplicate the entire flow.** Mark only the
branch points.

### 4.1 Bad practice (full-text duplication)

```md
## In Forward Mode
1. ...
2. ...
## In Reverse Mode
1. ...(nearly the same as forward, but subtly different)
2. ...
```

### 4.2 Good practice (differentiate only at branch points)

```md
Mode: forward | reverse
  detect: <detection condition in one line>

Flow:
1. Intake
   forward: <input format>
   reverse: <input format>
2. Build
   forward: create from scratch
   reverse: reconstruct from existing; do not overwrite existing bytes
3. Verify   (common to both modes)
4. Publish  (common to both modes)

Diff-only rule:
  For steps where the process is identical across modes, write "(common to
  both modes)"; write mode-specific text only at branch points.
```

- Fix the mode-detection condition exactly once at the start; do not
  re-evaluate it in later steps (if re-detection must be prohibited, state
  `no re-detect` explicitly).
- Vague differential phrasing such as "the same but slightly different" is
  prohibited. State differences explicitly as a `forward: X` / `reverse: Y`
  pair.
- State the constraint guaranteeing that both modes land on the same terminal
  state exactly once, under `Invariants:`.

```md
Invariants:
- forward and reverse converge to the same terminal schema
- reverse: no byte-level rewrite of pre-existing untouched files
```

---

## 5. Vocabulary Separation: Forced-Autonomy Directives vs. Approval Gates

This class of workflow contains **two similar-but-distinct kinds of "whether
to stop or not."** Without separating them by vocabulary, the AI will either
break autonomous execution by asking a human at every point of uncertainty,
or will act unilaterally in situations that should have required
confirmation.

| Kind | Meaning | Notation |
|---|---|---|
| Forced autonomy | Must not ask a human. Complete it at the AI's own discretion | `auto; never ask` |
| Approval gate | Irreversible / destructive / design-judgment actions must always stop for confirmation | `ask; stop` |
| Plain stop | No judgment needed. It's broken, so stop | `stop` |

```md
Step 3: Reticketize
- auto; never ask
- judge: group by <key>; one item per group
```

```md
Step 5: Publish
- destructive / irreversible → ask; stop
- after approval only → `publish.sh`
```

- In steps using `auto; never ask`, **fix the judgment criteria first, then**
  write `judge:` (do not let the AI act autonomously on ambiguous criteria).
- When `auto; never ask` and `ask; stop` coexist within the same file, do not
  place them adjacently — **always state which applies at the head of the
  relevant step** (do not make the reader infer the default black-or-white).

---

## 6. Distinguishing Staging (Intermediate Artifacts) from the Published Canon

When a distinction is needed between intermediate working files and the
finalized canonical artifact, separate the vocabulary and compress as
follows.

```md
Artifacts:
  staging: <intermediate file> (deleted on successful publish; not a record)
  published: <canonical file> (the record; survives)

Publish:
  - all gates pass → write published; delete staging
  - any gate fail → keep staging; do not touch published
```

- State clearly, in a **one-line classification**, "is this a record, or a
  work-in-progress draft?"
- By writing staging as "something that will later be deleted," you naturally
  constrain downstream processes from depending on staging.

---

## 7. Compressing Structured Criteria Tables (Multi-Perspective Pass/Fail Judgment)

The judgment logic "evaluate one target from multiple perspectives (A/B/C,
etc.), and it's a fail if any one perspective fails" is compressed into
tabular form.

```md
Criteria (all must pass):
| id | check | fail example pattern |
|---|---|---|
| A | <perspective 1> | <typical failure pattern as a noun phrase> |
| B | <perspective 2> | <...> |
| C | <perspective 3> | <...> |

judge: evaluate against source, not cached summaries
any fail → record as gap; do not silently pass
```

- Do not write explanatory prose for each perspective; write the **"typical
  failure pattern" as a noun phrase** (e.g., `too-broad assertion`,
  `happy-path only`, `circular reasoning`). This follows the empirical rule
  that labeling bad examples is more effective, per word spent, than writing
  out good examples at length.
- The recurring constraint "don't trust cached output — judge against the
  actual substance" may be fixed to the single line
  `judge: evaluate against source, not cached summaries`.

---

## 8. Compressing Order-Constrained Batch Processing

The constraint "process multiple fields/items in a fixed order, and no more
than a bounded number per single operation" is compressed into this form.

```md
Batch-write <target>:
  order: field1 → field2 → field3 → field4
  max-per-call: 3
  preserve (do not overwrite, append-only): fieldA, fieldB
```

- An order can be a simple arrow chain. Do not write the rationale (why this
  order).
- Gather fields that must not be overwritten (append-only) under `preserve`,
  and list the target fields. Do not repeat "please do not change X"
  individually for each one.

---

## 9. Compressing the Sweep / Residual Safety Net

A safety-net step that "sweeps up anything missed, in bulk, after the main
process" is written briefly, separated from the main process.

```md
Sweep (after main):
  scan: <the missed-item condition>
  found → treat as main-target; loop back to main
  none → next
```

---

## 10. Compressing Frontmatter, Arguments, and Derived Paths

### 10.1 Frontmatter

```yaml
---
name: kebab-case-name
description: <what it does>. <when to use it>.
argument-hint: <shape of the argument only>
---
```

- There is no need to change a slash command's YAML definition if it is
  already written. It is already complete.
- Use this guideline only when no YAML description exists.
- `argument-hint` should state the **shape**, not the type (e.g.,
  `<path/to/*.json>`).
- If automatic invocation must be prohibited, add one explicit flag line
  (do not explain the meaning of the value).

### 10.2 Arguments and Derived Paths

When multiple output paths are mechanically derived from a single input
argument, write the derivation rule not as code but as a **relational
expression** (do not include implementation code).

```md
In:
- arg: <input path>
Derived:
- output_a = dirname(arg) + "-A.json"
- output_b = dirname(arg) + "-B.json"
- missing derivable source field → stop
```

Do not paste the source script that performs the derivation into the body
text. The relational expression alone is sufficient — the AI can construct
the command itself from this.

---

## 11. Integrated Template (minimal form using every element of this guide)

```md
---
name: workflow-name
description: <what it does>. <when to use it>.
argument-hint: <shape of the argument>
---

# workflow-name

In:
- arg: <format>
- missing/invalid → stop

Upstream (role, not name):
- produces: <artifact schema>
- guarantee: <guarantee usable as a precondition>
- missing/invalid → stop

Downstream (role, not name):
- consumes: <this workflow's output>
- expects: <expected schema>

Invariants:
- <cross-mode convergence guarantee, prohibition of irreversible operations, etc.>

Mode: forward | reverse
  detect: <detection condition>

Artifacts:
  staging: <intermediate file>
  published: <canonical file>

Gates:
G0 <label> → fail: stop
G1 <label> → fail: back to G0
G2 <label> → fail: back to G1
Rule: parent not PASS ⇒ child never PASS

Flow:
1. <Step> (common to both modes, or forward:/reverse: branch)
   auto; never ask | ask; stop | stop
   `cmd` / judge: <criterion>
   Heal-loop:
     check: `verify.sh`
     fail → judge: fix per script output; re-run

2. Criteria check (if applicable)
   | id | check | fail pattern |
   |---|---|---|
   | A | ... | ... |

3. Sweep (after main)
   scan: <the missed-item condition>
   found → loop back

4. Publish
   destructive → ask; stop
   all gates pass → write published; delete staging

Done:
- <observable completion condition>
```

---

## 12. Checklist (v2 delta)

Add the following to the prior version's checklist.

- Are dependencies on other workflows self-contained via role + contract, rather than by name?
- Is the gate hierarchy's parent-child relationship (parent-fail ⇒ child-fail) stated exactly once?
- Are forward/reverse differences written as contrasts at branch points only, rather than as vague expressions like "the same but slightly different"?
- When `auto; never ask` and `ask; stop` coexist, is each stated explicitly at the head of its step?
- Are staging (things that disappear) and published (the canon) distinguished by vocabulary?
- Is the multi-perspective pass/fail judgment compressed using labels for bad examples, rather than explanations of good examples?
- Is order-constrained batch processing written using only an arrow chain plus a per-call cap?
- Is the sweep/residual step kept separate from the main process?
