---
description: "Commit uncommitted changes and push unpushed commits for the current branch (-u creates remote branch)"
---

# CRITICAL — NON-INTERACTIVE, END-TO-END

Pipeline commands (/workspacify-*, /graphify-rfc, /split-to-tickets, /boundify-graph, /make-ticket, /plan-ticket, /start-ticket, /review-ticket, /resolve-ticket, /consolidate-stubs, /find-omissions, /crystalize-readme, /epush-branch, /jpush-branch) run uninterrupted through final Step. End turn only on final-Step completion or unresolvable external blocker. Waiting ≠ completion: Monitor/background/poll, resume. Never output progress-only.

No questions, confirmations, approvals, options, delegation. Read the evidence printed by Step 1; choose nothing beyond it. Prose synthesis is the only remaining work. Indeterminate → minimal, backward-compatible, reversible, conventional, lowest-risk. Ambiguity/failure ≠ stop: inspect, retry, monitor, isolate, fall back, continue. Final report only: outcome, artifacts, validation, assumptions, external blockers, risks.

**Never run tests, builds, linters, or formatters. This command commits and pushes only.**

# EPush Branch — English Commit & Push

Current branch → remote. Spec evidence → English message → commit → push.

## Step 1 — Evidence (one command)

Run once. It prints Markdown; every later Step reads it. Do not re-derive.

```bash
CLAUDE_DIR="$(git rev-parse --show-toplevel)/.claude"
node "$CLAUDE_DIR/scripts/tickets/collect-push-evidence.js"
```

## Step 2 — Dispatch (lookup only)

| State | Action |
|---|---|
| `conflicts` > 0 | Report "Conflicts are not resolved"; exit. |
| `uncommitted` = 0 and `unpushed` > 0 | Step 4. |
| `uncommitted` = 0 and `unpushed` = 0 | Report "Nothing to push"; exit. |
| `uncommitted` > 0 | Step 3. |

## Step 3 — Message (prose only)

- `Mode=exact` or `date-inferred` → subject `<Prefix>(<KEY>[,<KEY2>]): <Goal summary>`
- `Mode=diff` → subject `<Prefix>: <summary from Changed surfaces>`
- Body: `- **What**`, `- **Why**`, `- **Impact**` from `Spec evidence`, else `Changed surfaces`.
- `KEY` ← `Selected specs` basenames; multi-key file → split on `, `.
- Claim only what `Spec evidence` or `Changed surfaces` shows.
- Do not run tests, builds, linters, or formatters.

## Step 4 — Commit

```bash
git add .
git commit -m "<message>"
```

## Step 5 — Push

```bash
git push -u origin "$(git branch --show-current)"
```

Non-fast-forward → `git fetch --quiet origin`, report. No rebase, no force.

## Step 6 — Report

commit sha, branch, push result, `Mode`. Failure → error text.
