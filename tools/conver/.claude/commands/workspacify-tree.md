---
description: Analyze a Markdown specification and publish WORKSPACIFY-TREE-MANIFEST.json
argument-hint: <path-to-specification.md>
---

# /workspacify-tree

Analyze a long Markdown specification and publish exactly one
`WORKSPACIFY-TREE-MANIFEST.json` next to it. This is stage one: structure,
inventory, workspace design, and integrity gates. It never implements the
specification.

## Arguments

- `<path-to-specification.md>`: exactly one path to a readable, non-empty,
  UTF-8 Markdown file that contains at least one ATX heading.

## Workflow

1. **parse**: run `node .claude/scripts/workspacify-tree/run.mjs parse <spec>`.
   Confirms input lock, normalization hash, heading tree, segmentation, and
   reconstruction. Stop on FAIL.
2. **extract**: run `node .claude/scripts/workspacify-tree/run.mjs extract <spec>`.
   Review the harvested object/claim/normative candidates and confirm or reject
   each REVIEW_REQUIRED item.
3. **Author decisions**: write a decisions JSON (workspace packages, ownership,
   dependencies, adapters, REVIEW approvals) into a scratch file outside the
   specification directory.
4. **gate loop**: run `run.mjs gate --spec=<spec> --decisions=<file>` and iterate
   until it passes.
5. **finalize**: run `run.mjs finalize --spec=<spec> --decisions=<file>` to
   render, self-hash, reload-verify, and atomically publish the manifest.

## Success output

Only: manifest absolute path, source hash, manifest hash, and gate summary.

## Failure output

Failed gate id, reason, and a fix hint. An existing successful manifest is
never replaced when the input specification hash differs (BLOCKED).
