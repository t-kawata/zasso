---
description: "現在のブランチの未コミット変更・未pushコミットを処理してリモートにプッシュ（-u でブランチ自動作成）"
---

# CRITICAL — NON-INTERACTIVE, END-TO-END

Pipeline commands (/workspacify-*, /graphify-rfc, /split-to-tickets, /boundify-graph, /make-ticket, /plan-ticket, /start-ticket, /review-ticket, /resolve-ticket, /consolidate-stubs, /find-omissions, /crystalize-readme, /epush-branch, /jpush-branch) run uninterrupted through final Step. End turn only on final-Step completion or unresolvable external blocker. Waiting ≠ completion: Monitor/background/poll, resume. Never output progress-only.

No questions, confirmations, approvals, options, delegation. Read the evidence printed by Step 1; choose nothing beyond it. Prose synthesis is the only remaining work. Indeterminate → minimal, backward-compatible, reversible, conventional, lowest-risk. Ambiguity/failure ≠ stop: inspect, retry, monitor, isolate, fall back, continue. Final report only: outcome, artifacts, validation, assumptions, external blockers, risks.

**Never run tests, builds, linters, or formatters. This command commits and pushes only.**

# JPush Branch — Japanese Commit & Push

Current branch → remote. Spec evidence → Japanese message → commit → push.

## Step 1 — Evidence (one command)

Run once. It prints Markdown; every later Step reads it. Do not re-derive.

```bash
CLAUDE_DIR="$(git rev-parse --show-toplevel)/.claude"
node "$CLAUDE_DIR/scripts/tickets/collect-push-evidence.js"
```

## Step 2 — Dispatch (lookup only)

| State | Action |
|---|---|
| `conflicts` > 0 | Report "コンフリクトが解消されていません"; exit. |
| `uncommitted` = 0 and `unpushed` > 0 | Step 4. |
| `uncommitted` = 0 and `unpushed` = 0 | Report "変更はありません"; exit. |
| `uncommitted` > 0 | Step 3. |

## Step 3 — Message (prose only; Japanese)

- `Mode=exact` or `date-inferred` → subject `<Prefix>(<KEY>[,<KEY2>]): <変更概要>`
- `Mode=diff` → subject `<Prefix>: <変更概要>`
- Body: `- **変更内容**`, `- **変更理由**`, `- **影響範囲**` from `Spec evidence`, else `Changed surfaces`.
- `KEY` ← `Selected specs` basenames; multi-key file → split on `, `.
- Translate to Japanese; keep identifiers, paths, ticket keys verbatim.
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
