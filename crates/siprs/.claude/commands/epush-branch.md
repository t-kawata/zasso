---
description: "Commit uncommitted changes and push unpushed commits for the current branch (-u creates remote branch)"
---

# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION

Pipeline commands (/workspacify-*, /graphify-rfc, /split-to-tickets, /boundify-graph, /make-ticket, /plan-ticket, /start-ticket, /review-ticket, /resolve-ticket, /consolidate-stubs, /find-omissions, /crystalize-readme, /epush-branch, /jpush-branch) MUST run uninterrupted through the final Step. DO NOT end the turn except on final-Step completion or an external blocker that cannot be resolved internally. Waiting is NOT completion: use Monitor / background tasks / polling, then resume immediately; NEVER say “waiting,” “I will report later,” or equivalent. Intermediate status is not output. Time limits change validation method only—narrow by impact, target tests, parallelize/background work—and NEVER reduce completion criteria or justify deferral.

Strictly prohibit questions, confirmations, approvals, options, and human decision delegation. Decide autonomously from code, types, tests, docs, and local conventions. If indeterminate, choose the minimal, backward-compatible, reversible, conventional, lowest-risk change. Once started: analyze → decide → implement → validate → fix → revalidate → complete. Ambiguity, uncertainty, failures, and missing preferences are not stopping conditions: inspect, retry, monitor, isolate, safely fall back, and continue. If about to ask, defer, wait, or provide progress-only output, delete it and perform the next concrete action. Final report ONLY: final outcome, artifacts, validation, assumptions/rationale, unavoidable external blockers, and remaining risks.

# EPush Branch — English Commit & Branch Push

Process the current branch's changes and push to remote. Handles two scenarios automatically:

1. **Uncommitted changes** → analyze with `git diff`, generate an English commit message, and commit
2. **Unpushed commits** → verify with `git log @{u}..HEAD`, then push

Push uses `git push -u origin <branch-name>`, so the remote branch is created automatically even if it does not exist yet.

## Process

### Step 1: Check overall state

```bash
git fetch origin
git status --short
git branch --show-current
git log @{u}..HEAD --oneline 2>&1
```

Branch based on output:
- Uncommitted changes exist → go to Step 2
- No uncommitted changes, unpushed commits exist → go to Step 5
- Neither → exit without action

### Step 2: Analyze changes

```bash
git diff
git diff --cached
git status
```

Classify changes into:
- New files / features added
- Existing code modified
- Files deleted
- Configuration / dependencies changed
- Tests or documentation changed

### Step 3: Generate commit message

Based on the classification, generate an English commit message in conventional commits format:

```
<prefix>: <brief description>

- **What**: ...
- **Why**: ...
- **Impact**: ...
```

Choose **prefix** from `feat` / `fix` / `refactor` / `docs` / `test` / `chore` / `perf` / `style` according to the change type.

### Step 4: Commit

```bash
git add .
git commit -m "<generated message>"
```

### Step 5: Push

```bash
git push -u origin <current branch name>
```

### Step 6: Report result

Report the push result concisely. On failure, display the error and exit. If nothing changed, report that and exit.

## Edge Cases

- **Unresolved conflicts**: If `git status` shows `UU` or `AA` markers, report "Conflicts are not resolved" and exit.
- **No uncommitted changes and no unpushed commits**: Report "Nothing to push" and exit.
