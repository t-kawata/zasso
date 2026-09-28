# INFO03 — Upstream port instruction: `workspacify-allocate` publication safety

| | |
|---|---|
| **Origin** | `~/shyme/gaia` (consumer install), sessions of 2026-09-25 and 2026-09-28 |
| **Work is done in** | `~/shyme/zasso/tools/conver` (source of truth for `.claude/`) |
| **Work item 1** | Publication safety — §1–§8, Appendix A/B. Three files under `.claude/scripts/workspacify-allocate/`; patch verified applicable with `git apply` (exit 0). |
| **Work item 2** | The staged decisions document must not be swept — §9–§11, Appendix C. One shared module, four call sites, six specification statements. |
| **Nature** | Item 1 is the port of an already-proven fix. Item 2 is a change request: the behaviour is currently *specified*, so the specification has to change with the code. |

---

## 0. What this document is

This file is written in the gaia repo and is addressed to the AI operating in
`~/shyme/zasso/tools/conver`. It carries **two work items**, each with its own defect,
its own change and its own gates:

* **Item 1 (§1–§8, Appendix A/B)** — two defects in the forward rotation's `finalize`
  path. The exact patch is given, together with the tests that must accompany it under
  conver's own conventions and the gates that must pass. It ends with the downstream
  resynchronisation gaia needs afterwards.
* **Item 2 (§9–§11, Appendix C)** — the successful run deletes the decisions document
  it read. This one is different in kind: the current behaviour is what the
  specification says, so the specification is part of what has to change.

Item 1 is independent of item 2 and can land first. Do not fold them into one commit:
one is a proved fix, the other is a change of intent that needs its own review.

The fix is already **proven in production**: it was implemented in gaia under the
same supreme law (Red → Green), the fixes passed review, and the forward rotation
published successfully with it in place. What remains is to port it to the source of
truth. Do not redesign it; read section 6 before changing any part of its shape.

---

## 1. The defects

Both live in the forward (allocate) rotation's `finalize` step.

### 1.1 `verifyDirectorySet` fails on a workspace root that is a host project directory

`verifyDirectorySet(root, plan)` compares **every** directory beneath the workspace
root against the plan, and requires the two sets to agree exactly.

The doctrine's own model is that the workspace root is a directory dedicated to the
workspace, holding the co-located specification and the stage-1 manifest as files
(the reference output shows a residue of `spec.md`, two manifests and `crates`). In
practice a consumer runs the rotation with `workspaceRoot = dirname(manifestPath)`,
and that directory is frequently the **host project's own root** — it holds the
specification and the manifest beside `.git`, `docs/`, `node_modules/`, other
sources, and everything else the project already had.

Observed in gaia: the root holds `.claude`, `.git`, `docs`, `node_modules`, `pods`,
`sim`, `specs`. `checkExistingOutputPolicy` (G2) passes correctly — the planned paths
themselves are fresh — and every gate up to and including G6 passes, so the tree and
the 28 seeds and the allocate manifest are **published**. Then the reload scan
reports those pre-existing directories as `unexpected` and fails the run at G6.4.

Two consequences, both bad:

* a workspace that the rotation's own entry gates declared eligible can never be
  finalised, and
* because the publication already happened, the failure leaves a **published tree**
  with no verdict — the exact partial state the "a failed run never publishes"
  doctrine forbids.

### 1.2 No rollback on a post-publication gate failure

`publishWorkspace` publishes with rollback: `publishStagedTree` renames one top-level
entry at a time and undoes every rename it already made if a later one fails. But
once `publishWorkspace` has returned successfully, the two gates that can still
refuse — G6.4 (reload directory scan) and G6.5 (`reloadAndVerify`) — only threw. The
G6.5 path called `removeWorkspaceArtifacts`, which removes staging directories only;
neither path removed the entries the run had just published.

So any reload divergence leaves the workspace holding a half-verified published tree,
which no operator agreed to and which the atomicity claim explicitly denies.

### 1.3 Why these are one fix

1.1 is a false positive that fires the failure path; 1.2 is that path's missing
cleanup. Fixing 1.1 alone would make the common case pass and leave the failure path
still unsafe for every other cause (a genuine reload divergence, a hash mismatch, a
graph change). Both are in scope.

---

## 2. Evidence that the fix is correct

Gathered in gaia with the fix in place. The porting AI does not need to re-derive any
of this; it needs to preserve it.

| Check | Result |
|---|---|
| `run.mjs gate` | `COMPLETE` — `G0:G2:G3:G4:G5:order:PASS semantic:APPROVED` |
| `run.mjs finalize` | `published: true`, 37 dirs, 28 packages, 28 seeds, 82 contracts, 11 waves, coverage 29/31, `G6:PASS` |
| `run.mjs finalize` against a root holding `.git`, `docs`, `sim`, `specs`, `pods`, `node_modules` | the reload scan reported `missing: 0, unexpected: 0` and the run reached `published: true` |
| Pre-flight check on a two-level mirror of the real root's directory shape | `ok: true`, `missing: 0`, `unexpected: 0` |
| Determinism | two runs of the same input produced byte-identical trees and allocate manifests |
| Surgical scope | editing the decisions changed exactly the intended seeds and no others; the WIG hash was unchanged |
| Backward compatibility | `preExisting` defaults to `[]`, so a caller that compares a root it fully controls keeps strict equality — the reverse rotation is untouched |
| Patch applicability | `git apply --check` against conver: **exit 0**, all three files |

The load-bearing design point, which must survive the port: the scan still has to
catch a directory **this run** created outside its plan. That is why the fix passes in
a *snapshot of what pre-existed* rather than dropping the `unexpected` computation.
`unexpected = dirs − planned − preExisting` still reports run-created leakage; a
version that simply stops reporting `unexpected` would delete the check the gate
exists for.

---

## 3. Required change

### 3.1 Apply the patch

From the conver repository root, on a branch dedicated to this change:

```bash
git apply /path/to/INFO03-appendix-A.patch     # or paste Appendix A into a file
```

The patch was dry-run against conver and applies cleanly. It touches exactly three
files and adds two exports:

| File | Change |
|---|---|
| `lib/tree-staging.mjs` | adds `snapshotDirectories(root)`; `verifyDirectorySet(root, plan)` gains an optional third parameter `{ preExisting = [] }` |
| `publish-allocate-manifest.mjs` | adds `publishedTopLevelNames({plan, renderedByPackage})` and `rollbackPublication({manifestDir, topLevelNames, preExistingEntries})`; `publishWorkspace` reuses the extracted name derivation |
| `run.mjs` | `runFinalize` snapshots the root's directories and entry names **before** publishing, passes the snapshot to the reload scan, and rolls the publication back on G6.4 and G6.5 |

No public surface is removed. The one signature change is an added optional
parameter, so every existing caller keeps its current behaviour.

### 3.2 Add the repository's provenance annotation

The patch's new code carries explanatory comments but **not** the repo's ticket
annotation, deliberately: choosing a ticket key is the porting AI's decision, and
inventing one would be a false provenance record.

Every file the change touches must carry, per this repo's convention:

```js
// [::TICKET::] <KEY> changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=<KEY> --for-spec --no-implementation-order`.
// <KEY> @verifies <C-ids>
```

Register the work as a ticket in conver through its own workflow
(`Tickets.json`, `.claude/scripts/tickets/add-ticket.js` / `add-px-phase.js`) before
writing the annotation. Do not copy a key from an existing file.

There is no `[::STUB::]` in this change: nothing in it is a placeholder, a mock or an
unimplemented path, so no stub marker and no malfeasance record is owed.

---

## 4. Required tests

### 4.1 Conver's test conventions (verified, use these)

* Location: `tests/workspacify-allocate/unit/`
* Extension: `.test.mjs`; the suite's runner collects by glob —
  `run-tests.mjs` calls `collectTestFilesUnder(SUITE_ROOT, { extensions: ['.test.mjs'] })`
  — so a new file needs **no registration**. Confirm against
  `tests/lib/test-discovery.mjs`.
* Harness: `import { test } from 'node:test'` + `import assert from 'node:assert/strict'`.
* Module import path from a unit test:
  `'../../../.claude/scripts/workspacify-allocate/<module>.mjs'`
* Temp-directory pattern: `mkdtempSync(join(tmpdir(), '<label>-'))` with the body in
  `try { … } finally { rmSync(dir, { recursive: true, force: true }); }`
* Test names are prefixed with the ticket key and the contract id, as in
  `unit/tree-staging.test.mjs` (`'C005 checkExistingOutputPolicy passes on a fresh workspace'`).

### 4.2 Write them first (Red)

The supreme law is the same in conver: write the failing tests before the
implementation, run them, and confirm they fail **because the implementation is
absent** — not because of a typo. For reference, in gaia the observed Red was: the
tree-staging cases failed 6/7 with `snapshotDirectories is not a function`, and the
rollback cases failed 4/4 with `publishedTopLevelNames is not a function`.

### 4.3 The tests to add

**Add to the existing `tests/workspacify-allocate/unit/tree-staging.test.mjs`**
(add `snapshotDirectories` to its import list):

```js
test('C0XX snapshotDirectories lists every directory as a sorted root-relative path', () => {
  const dir = tempDir('wt-snap-');
  try {
    mkdirSync(join(dir, 'crates/protocol/gaia-soul'), { recursive: true });
    mkdirSync(join(dir, 'docs/archive'), { recursive: true });
    assert.deepEqual(snapshotDirectories(dir), [
      'crates', 'crates/protocol', 'crates/protocol/gaia-soul', 'docs', 'docs/archive',
    ].sort());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C0XX snapshotDirectories names no file and skips the reserved root', () => {
  const dir = tempDir('wt-snap2-');
  try {
    mkdirSync(join(dir, 'crates'), { recursive: true });
    mkdirSync(join(dir, 'workspacify/allocate'), { recursive: true });
    writeFileSync(join(dir, 'spec.md'), '# spec\n');
    assert.deepEqual(snapshotDirectories(dir), ['crates']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C0XX verifyDirectorySet keeps strict equality when no snapshot is given', () => {
  const dir = tempDir('wt-strict-');
  try {
    mkdirSync(join(dir, 'crates/protocol/gaia-soul'), { recursive: true });
    mkdirSync(join(dir, 'docs'), { recursive: true });
    const verdict = verifyDirectorySet(dir, PLAN);
    assert.equal(verdict.ok, false, 'the default must stay strict');
    assert.ok(verdict.unexpected.includes('docs'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C0XX verifyDirectorySet passes when the only extra directories pre-existed the run', () => {
  const dir = tempDir('wt-pre-');
  try {
    mkdirSync(join(dir, 'docs/archive'), { recursive: true });
    mkdirSync(join(dir, 'sim/src'), { recursive: true });
    const preExisting = snapshotDirectories(dir);
    mkdirSync(join(dir, 'crates/protocol/gaia-soul'), { recursive: true });
    const verdict = verifyDirectorySet(dir, PLAN, { preExisting });
    assert.deepEqual(verdict.unexpected, [], "pre-existing content is not this run's leakage");
    assert.deepEqual(verdict.missing, []);
    assert.equal(verdict.ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C0XX verifyDirectorySet still reports a directory the run created outside its plan', () => {
  const dir = tempDir('wt-leak-');
  try {
    mkdirSync(join(dir, 'docs'), { recursive: true });
    const preExisting = snapshotDirectories(dir);
    mkdirSync(join(dir, 'crates/protocol/gaia-soul'), { recursive: true });
    mkdirSync(join(dir, 'crates/leaked'), { recursive: true });
    const verdict = verifyDirectorySet(dir, PLAN, { preExisting });
    assert.equal(verdict.ok, false);
    assert.deepEqual(verdict.unexpected, ['crates/leaked']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C0XX verifyDirectorySet still reports a planned directory that does not exist', () => {
  const dir = tempDir('wt-miss-');
  try {
    mkdirSync(join(dir, 'docs'), { recursive: true });
    const preExisting = snapshotDirectories(dir);
    mkdirSync(join(dir, 'crates'), { recursive: true });
    const verdict = verifyDirectorySet(dir, PLAN, { preExisting });
    assert.equal(verdict.ok, false);
    assert.deepEqual(verdict.missing, ['crates/protocol', 'crates/protocol/gaia-soul']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

**Add `tests/workspacify-allocate/unit/publish-rollback.test.mjs`** (new file; the
publish module currently has no unit test of its own — `px195-branch-coverage.test.mjs`
is its only importer):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  publishedTopLevelNames,
  rollbackPublication,
} from '../../../.claude/scripts/workspacify-allocate/publish-allocate-manifest.mjs';

function tempDir(label) {
  return mkdtempSync(join(tmpdir(), label));
}

const PLAN = { relativeDirs: ['crates', 'crates/protocol', 'crates/protocol/gaia-soul'] };
const RENDERED = new Map([['pkg-0002', { package: { path: 'crates/protocol/gaia-soul' } }]]);

test('C0XX publishedTopLevelNames names each top-level entry once, sorted', () => {
  assert.deepEqual(
    publishedTopLevelNames({ plan: PLAN, renderedByPackage: RENDERED }),
    ['WORKSPACIFY-ALLOCATE-MANIFEST.json', 'crates'],
  );
});

test('C0XX rollbackPublication removes the entries this run created', () => {
  const dir = tempDir('wt-roll-');
  try {
    mkdirSync(join(dir, 'crates/protocol/gaia-soul'), { recursive: true });
    writeFileSync(join(dir, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), '{}\n');
    const result = rollbackPublication({
      manifestDir: dir,
      topLevelNames: publishedTopLevelNames({ plan: PLAN, renderedByPackage: RENDERED }),
      preExistingEntries: new Set(),
    });
    assert.deepEqual(result.removed, ['WORKSPACIFY-ALLOCATE-MANIFEST.json', 'crates']);
    assert.deepEqual(readdirSync(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C0XX rollbackPublication never removes an entry that pre-existed the run', () => {
  const dir = tempDir('wt-roll2-');
  try {
    mkdirSync(join(dir, 'docs/archive'), { recursive: true });
    writeFileSync(join(dir, 'spec.md'), '# spec\n');
    mkdirSync(join(dir, 'crates'), { recursive: true });
    const result = rollbackPublication({
      manifestDir: dir,
      topLevelNames: ['crates', 'docs', 'spec.md'],
      preExistingEntries: new Set(['docs', 'spec.md']),
    });
    assert.deepEqual(result.removed, ['crates'], "pre-existing content is not this run's to delete");
    assert.deepEqual(readdirSync(dir).sort(), ['docs', 'spec.md']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C0XX rollbackPublication reports nothing removed when it placed nothing', () => {
  const dir = tempDir('wt-roll3-');
  try {
    const result = rollbackPublication({
      manifestDir: dir,
      topLevelNames: ['crates'],
      preExistingEntries: new Set(),
    });
    assert.deepEqual(result.removed, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

Replace `C0XX` with the contract ids your ticket declares, and add the ticket
annotation header to the new file.

### 4.4 An integration case worth adding, if the suite does not already have one

The unit tests above prove the parts. The defect was an **end-to-end** one, so a case
that drives `finalize` against a workspace root holding an unrelated pre-existing
directory (and asserts the run reaches `published: true`) is what would have caught
1.1. `integration/` and `acceptance/` are the homes for it; check whether
`acceptance/end-to-end-allocate.test.mjs` already builds its root that way before
adding a duplicate.

---

## 5. Gates that must pass

```bash
make check-conventions      # module-system table vs the filesystem
make test-workspacify       # tests/workspacify-tree + tests/workspacify-allocate
node .claude/scripts/workspacify-reverse/run.mjs regression check
```

The last one is the forward-rotation regression gate that `install.js` runs when
`tests/workspacify-tree/baselines/manifest-hashes.json` is present. Its baseline
covers stage-1 fixtures (`manifestHashes`, `fixtures`) and **command** file digests
(`commandFileDigests`) — the allocate scripts are not in it, so no baseline
regeneration is expected. Run it anyway and report the verdict: the gate exists to
prove the forward tree is unchanged, and this change alters the forward path.

Existing tests that exercise the touched functions, and which must keep passing
**unmodified**:

| Test | Why it should still pass |
|---|---|
| `unit/tree-staging.test.mjs` (reload-scan case asserting `unexpected` is `[]`) | its root is a fresh temp dir holding only the materialized plan; `preExisting` is not passed, so the default strict path runs |
| `unit/allocate-lib-branch-coverage.test.mjs` ("flags missing dirs and unexpected extra dirs") | same: no `preExisting`, so `'rogue'` is still reported |
| `unit/px195-branch-coverage.test.mjs` | imports the publish module; the extracted name derivation is behaviour-identical |
| `integration/materialize-tree.test.mjs`, `reverse/safety-inversion.test.mjs` | both use `verifyDirectorySet` / `publishStagedTree` without `preExisting` |

If one of these fails, the failure is a signal about the port, not a licence to edit
the test. Weakening a test to make an implementation pass is forbidden by the supreme
law in both repositories.

---

## 6. Do not change these

1. **Do not make `preExisting` the default.** It must stay `[]`. The strict equality is
   what the reverse rotation relies on for its A1 safety inversion ("every existing
   path is planned; a single extra path is `BLOCKED`"). If the reverse rotation ever
   passes a snapshot, it stops being able to detect an extra path — that is a
   regression in a different rotation.
2. **Do not drop the `unexpected` computation.** The scan's purpose is to catch what
   *this run* created. See section 2.
3. **Do not weaken `checkExistingOutputPolicy` or `publishStagedTree`'s
   destination-exists refusal.** They are what make the rollback's safety argument
   true: because the publish refuses to rename onto an existing destination, any entry
   absent from the pre-publish snapshot was created by this run, and no entry present
   in the snapshot can belong to it. If that refusal is relaxed, the rollback becomes
   capable of deleting pre-existing content.
4. **Do not change the published artefact schema.** No seed, no allocate-manifest
   field and no WIG summary is affected by this fix, and consumers of those artefacts
   are already built against them.
5. **Do not edit any file's `Initial Design Artifact` header**, and do not "tidy" the
   ticket annotations on lines you are not changing.

This list governs item 1 only. Work item 2 has its own constraints, stated where they
apply: the change must not be a flag (§9.4), the decisions document must not be
gitignored in gaia (§11), and the tests that encode the old rule are rewritten rather
than deleted (§9.4).

---

## 7. After the port lands: gaia must be resynchronised

gaia's install of these three files is currently a **local modification** relative to
what `.claude/.conver-install-state.json` recorded, because the fix was written there
first. `install.js`'s decision rule (`install-deps.cjs`, `decideFileAction`) is:

```js
if (!targetExists) return 'install';
if (targetDigest === sourceDigest) return 'unchanged';
if (previousSourceDigest && targetDigest === previousSourceDigest) return 'update';
return 'preserve';
```

Whether the next install repairs gaia on its own depends on whether the ported file
ends up **byte-identical** to gaia's local edit:

* **If it is identical** (the patch is applied verbatim and nothing else is added),
  then `targetDigest === sourceDigest`, the action is `unchanged`, and `nextState`
  re-records the path — nothing to do.
* **Otherwise the action is `preserve`.** This is the likely case, because section 3.2
  requires a `[::TICKET::] <KEY>` annotation that gaia's local edit does not carry, so
  the ported file differs from both the new source and the recorded
  `previousSourceDigest`. The upstream content would then **not** be delivered, and —
  because `nextState` records only non-preserved files — the three paths would drop
  out of the install state and stay untracked on every later install.

Do not rely on the first case. Check it, and repair if needed:

```bash
cd ~/shyme/gaia
# 1. Is the installed copy already what the source now ships?
diff ~/shyme/zasso/tools/conver/.claude/scripts/workspacify-allocate/run.mjs \
     .claude/scripts/workspacify-allocate/run.mjs && echo IDENTICAL || echo DIFFERS

# 2. If DIFFERS: drop the local copies so the installer records them afresh.
rm .claude/scripts/workspacify-allocate/lib/tree-staging.mjs \
   .claude/scripts/workspacify-allocate/publish-allocate-manifest.mjs \
   .claude/scripts/workspacify-allocate/run.mjs
# install.js takes -t for an explicit target and has no positional; -y is accepted
# and means nothing, because the installer never prompts.
node ~/shyme/zasso/tools/conver/install.js -t ~/shyme/gaia/.claude

# 3. Confirm the three paths are tracked again.
node -e "const s=require('./.claude/.conver-install-state.json');
  for (const k of ['scripts/workspacify-allocate/lib/tree-staging.mjs',
                   'scripts/workspacify-allocate/publish-allocate-manifest.mjs',
                   'scripts/workspacify-allocate/run.mjs'])
    console.log(k, s.files[k] ? 'recorded' : 'MISSING FROM STATE');"
```

Step 2 deletes the three files before reinstalling, so for that moment the forward
rotation is incomplete; do it as one uninterrupted sequence, and confirm with step 3
plus the suites below. If you would rather not depend on the installer at all, an
equivalent repair is to copy the three ported files into place and then rewrite their
three entries in `.conver-install-state.json` with the source digests.

Then re-run the two suites in gaia that cover this code, to confirm the installed copy
is the ported one:

```bash
cd ~/shyme/gaia/.claude && node tests/workspacify-allocate/tree-staging-reload.test.cjs \
  && node tests/workspacify-allocate/publish-rollback.test.cjs
```

Note that gaia's own copies of these tests are written in gaia's `.test.cjs`
convention (they are picked up by `.claude/tests/run-all.js`), which is a different
convention from conver's `tests/workspacify-allocate/unit/*.test.mjs`. Both should
exist after the port: conver's are the source of truth, gaia's are the consumer-side
duplicates that the installer carries. If one copy is preferred, retire gaia's — but
do not retire them before conver's are in place and green.

---

## 8. Working-tree caution

conver's working tree currently carries **unrelated uncommitted changes**
(`.claude/commands/workspacify-tree.md`, `.claude/scripts/workspacify-allocate/lib/wig.mjs`,
`.claude/scripts/workspacify-tree/lib/gate-advice.mjs`,
`.claude/scripts/workspacify-tree/lib/validation.mjs`,
`.claude/.conver-install-state.json`). None of them is part of this port. Apply this
change on its own branch so the two changesets do not become entangled in review or
in a single commit.

---

## 9. Second work item: the staged decisions document must not be swept

### 9.1 What happened

A successful forward `finalize` in gaia removed `workspacify/allocate/DECISIONS.json`
— the 2.36 MB authoring payload the run had **read**. The document is git-tracked, so
the working tree showed a deletion, and the operator had to restore the file by hand
before the pipeline could run again. One module removes it, and that module is called
from four places, so both rotations and both directions are affected.

### 9.2 Verdict: two defects at two levels

**A specification error.** The removal is *specified* behaviour, not a code bug
relative to the current text: Appendix C lists the six statements that require it, and
the worked example's `residue` omits the document for the same reason. The requirement
is that the document survives, so those statements are wrong and must be corrected in
the same change — otherwise the next review will restore the sweep as
"spec-compliant".

**An implementation defect**, which holds independently of that requirement:

* **It contradicts the rule the same final step states for its own cleanup.**
  `cleanup-workspace-artifacts.mjs` documents its scope as "removes only the paths the
  run itself created". The decisions document is not created by the run; it is an
  *input* the run read. `staging-decisions.mjs` was extracted so that both rotations
  would share one rule about residue, and it now carries an exception that the other
  module's own documentation denies — two cleanup paths, two rules, which is exactly
  the drift the extraction existed to prevent.
* **It destroys state the run cannot recreate.** The document's path is derived and not
  selectable, and `gate`/`finalize` refuse to run without it, so a successful run
  leaves a workspace that cannot be reproduced from its own inputs. The same
  specification calls the document "repairable after refusal" — a repair loop that
  presupposes the document is still there. `rmSync(…, { force: true })` leaves no copy
  and no backup.
* **It deleted version-controlled content.** The document is tracked in git, so a tool
  deleted a file the repository treats as its own content, on the operator's behalf and
  without being asked.

### 9.3 Scope

| Where | What |
|---|---|
| `.claude/scripts/workspacify-tree/lib/staging-decisions.mjs` | the module; its only export is `sweepStagingDecisions` |
| `.claude/scripts/workspacify-tree/run.mjs` | `:48` import, `:292` and `:576` calls — stage 1, forward and reverse |
| `.claude/scripts/workspacify-allocate/run.mjs` | `:28` import, `:517` and `:744` calls — stage 2, forward and reverse |

Line numbers are conver's, before item 1 is applied. Item 1 adds 13 lines to
`workspacify-allocate/run.mjs` above those calls, so after it they sit at `:530` and
`:757`. If the two items land in either order, re-locate by symbol rather than by
number.

### 9.4 The change

1. **Delete `staging-decisions.mjs`**, its two imports and its four call sites. The
   module has no other export, so nothing else moves.
2. **Do not add a `--keep-decisions` flag.** A flag would leave the destructive
   behaviour as the default — the opposite of the requirement — and would leave
   dead-by-default code inside the final step.
3. **Correct the six specification statements** — Appendix C.
4. **Update the tests that assert the sweep.** Find them by searching
   `tests/workspacify-tree/**` and `tests/workspacify-allocate/**` for
   `sweepStagingDecisions`, for the reserved decisions path, and for assertions that
   the path is absent after a successful run. Because the specification is changing,
   rewriting an assertion that encodes the old rule is legitimate; deleting the test,
   or weakening it beyond the new rule, is not. Add a test that asserts the opposite:
   after a successful run the document is still present and byte-identical to what the
   run read.

### 9.5 Why retention is safe — no other change is required

This is what decides whether the change is small or large, so it is given with its
evidence rather than as a conclusion:

| Concern | Why retention does not affect it |
|---|---|
| The reload directory scan (G6.4) | `verifyDirectorySet` and `snapshotDirectories` both walk through `walkTree`, which **skips the reserved root `workspacify`**; the retained document can never be reported as `unexpected` |
| `reloadAndVerify` (G6.5) | walks the plan's package paths only |
| The success residue | `listResidue` will now report `workspacify`; `residueIsPublishedOnly` accepts any directory at the root, so it stays satisfied |
| The fresh-workspace entry gate (G2) | `checkExistingOutputPolicy` inspects only the **planned** paths, and the reserve is not among them |
| Re-running the step | a run with the document present is the documented repair path, not a collision: "no pre-existing file may relocate it" governs the location, not the existence |

The published artefacts, the gates and the schemas are all untouched. The residue
gains one directory.

### 9.6 What the residue will look like afterwards

`finalize`'s reported `residue` will include `workspacify`. Every statement that
enumerates the expected residue — including the worked example in
`workspacify-allocate.md` — must say so (Appendix C).

---

## 10. Second work item — gates

```bash
make check-conventions
make test-workspacify            # forward: workspacify-tree + workspacify-allocate
make test-workspacify-reverse    # the reverse path is one of the four call sites
node .claude/scripts/workspacify-reverse/run.mjs regression check
```

Plus one new behavioural test, in the conventions of the suite that owns the step:
drive a successful `finalize` over a fixture workspace, then assert that
`workspacify/<stage>/DECISIONS.json` still exists with unchanged content, and that the
reported residue names its holder directory.

---

## 11. Second work item — gaia follow-up

* **Commit the restored document.** It is the authored input of record, its content is
  currently uncommitted, and the repaired version exists nowhere else — git's `HEAD`
  holds the pre-repair text. Retention only means something if the retained file is
  also version-controlled.
* **Do not gitignore it.** Item 2 decides the document is content rather than staging;
  ignoring it would reintroduce the same contradiction in a different place.
* **Re-verify after the resync:** `run.mjs gate` must still report `COMPLETE` with the
  document present. Verified in gaia after the restore.

---

## Appendix A — the patch

Apply from the conver repository root. Verified applicable: `git apply --check` exits 0.
SHA-256 of this patch text as generated: `287eaa64087e0ba184fba53b0a61c94f3a6e8fd80d2bcb09734844ed50f880c3`.

```diff
diff --git a/.claude/scripts/workspacify-allocate/lib/tree-staging.mjs b/.claude/scripts/workspacify-allocate/lib/tree-staging.mjs
index d948f92..df5c96c 100644
--- a/.claude/scripts/workspacify-allocate/lib/tree-staging.mjs
+++ b/.claude/scripts/workspacify-allocate/lib/tree-staging.mjs
@@ -134,23 +134,51 @@ export function publishStagedTree(stagingRoot, root, plan) {
   return { published: true };
 }
 
+/**
+ * Every directory beneath a root, as sorted root-relative POSIX paths.
+ *
+ * The reader that compares a workspace against a plan needs the directory set the
+ * root holds now; taking it through the same walk as the staging checks keeps one
+ * definition of what counts as a directory of the workspace and one exclusion of
+ * the reserved root.
+ *
+ * @param {string} root - directory to scan (absolute)
+ * @returns {string[]} sorted root-relative directory paths
+ */
+export function snapshotDirectories(root) {
+  return [...walkTree(root).dirs].sort();
+}
+
 /**
  * Verify that the workspace root realizes the plan's directory topology.
  *
  * Only directories are compared: every planned directory must exist and no
- * extra directory may appear. Pre-existing root-level files (the spec and the
- * manifest) are intentionally outside the directory-set contract; seed files
- * are verified separately by the seed checks in PX-190/PX-191.
+ * directory this run did not plan may appear.
+ *
+ * `preExisting` is the directory set the root held before the run published. A root
+ * that is not dedicated to this workspace - a host project directory holding the
+ * spec and the manifest beside its own sources - already contains directories the
+ * plan says nothing about, and they are the operator's content rather than this
+ * run's leakage. Naming them keeps the scan's verdict about what the run created:
+ * a directory absent from both the plan and the snapshot is still reported. The
+ * default is empty, so a caller that compares a root it fully controls keeps the
+ * strict equality it had.
+ *
+ * Root-level files are outside the contract entirely: the spec and the manifest
+ * are pre-existing files by construction, and seed files are verified separately
+ * by the seed checks in PX-190/PX-191.
  *
  * @param {string} root - workspace root (absolute)
  * @param {string[]} plan - root-relative planned directories
+ * @param {{ preExisting?: string[] }} [options] - directories present before the run published
  * @returns {{ ok: boolean, missing: string[], unexpected: string[] }}
  */
-export function verifyDirectorySet(root, plan) {
+export function verifyDirectorySet(root, plan, { preExisting = [] } = {}) {
   const expectedDirs = expandWithAncestors(plan);
+  const preExistingDirs = new Set(preExisting);
   const { dirs } = walkTree(root);
   const missing = expectedDirs.filter((relPath) => !dirs.includes(relPath));
-  const unexpected = dirs.filter((relPath) => !expectedDirs.includes(relPath));
+  const unexpected = dirs.filter((relPath) => !expectedDirs.includes(relPath) && !preExistingDirs.has(relPath));
   return { ok: missing.length === 0 && unexpected.length === 0, missing, unexpected };
 }
 
diff --git a/.claude/scripts/workspacify-allocate/publish-allocate-manifest.mjs b/.claude/scripts/workspacify-allocate/publish-allocate-manifest.mjs
index c2db35c..499f57c 100644
--- a/.claude/scripts/workspacify-allocate/publish-allocate-manifest.mjs
+++ b/.claude/scripts/workspacify-allocate/publish-allocate-manifest.mjs
@@ -8,7 +8,7 @@
  * The published set is exactly those three; anything else the run created is
  * removed by the cleanup step.
  */
-import { readdirSync, statSync, writeFileSync, rmSync } from 'node:fs';
+import { existsSync, readdirSync, statSync, writeFileSync, rmSync } from 'node:fs';
 import path from 'node:path';
 
 import { createStagingRoot, materializeDirectories, publishStagedTree } from './lib/tree-staging.mjs';
@@ -65,6 +65,61 @@ function expandPlannedDirectories(relativeDirs) {
   return [...expanded];
 }
 
+/**
+ * The top-level root entries a publication places.
+ *
+ * The publish moves top-level entries; seeds and the manifest live inside the tree,
+ * so planning their top-level names is enough to place them. Rollback judges the
+ * same set, which is why it is derived here once rather than in each of them.
+ *
+ * @param {{ plan: object, renderedByPackage: Map<string, object> }} input
+ * @returns {string[]} sorted top-level entry names
+ */
+export function publishedTopLevelNames({ plan, renderedByPackage }) {
+  return [...new Set([
+    ...(plan.relativeDirs ?? []).map((relativeDir) => relativeDir.split('/')[0]),
+    ...[...renderedByPackage.values()].map(({ package: pkg }) => pkg.path.split('/')[0]),
+    ALLOCATE_MANIFEST_FILE_NAME,
+  ])].sort();
+}
+
+/**
+ * Remove the top-level entries a publication created, leaving the root as it was.
+ *
+ * A run that published and then failed a later gate must not leave a tree behind:
+ * the workspace would show a half-verified state that no operator agreed to. The
+ * rollback therefore removes exactly the entries this run created.
+ *
+ * `preExistingEntries` is what the root held before the publish, and it is the
+ * safety of the whole operation: `publishStagedTree` refuses to rename onto an
+ * existing destination, so every entry absent from that set was created by this
+ * run and no entry present in it can belong to it. A name that pre-existed is
+ * never a candidate, which is what keeps the rollback from deleting the host
+ * project's own directories.
+ *
+ * `removed` is a record of what the rollback did, so it names only the entries that
+ * were actually there: a publication that failed before placing an entry leaves
+ * nothing to remove, and reporting it as removed would misdescribe the workspace.
+ *
+ * @param {{ manifestDir: string, topLevelNames: string[], preExistingEntries: Set<string> }} input
+ * @returns {{ removed: string[] }} the entries removed, sorted
+ */
+export function rollbackPublication({ manifestDir, topLevelNames, preExistingEntries }) {
+  const removed = [];
+  for (const name of topLevelNames) {
+    if (preExistingEntries.has(name)) {
+      continue;
+    }
+    const target = path.join(manifestDir, name);
+    if (!existsSync(target)) {
+      continue;
+    }
+    rmSync(target, { recursive: true, force: true });
+    removed.push(name);
+  }
+  return { removed: removed.sort() };
+}
+
 /**
  * Stage and publish the tree, the seeds and the allocate manifest.
  *
@@ -90,13 +145,7 @@ export function publishWorkspace({ manifestDir, plan, renderedByPackage, allocat
       return { published: false, reason: `staging verification failed: ${JSON.stringify(staged)}`, stagingRoot: null };
     }
 
-    // The publish moves top-level entries; seeds and the manifest live inside the
-    // tree, so planning their top-level names is enough to place them.
-    const topLevelNames = [...new Set([
-      ...plan.relativeDirs.map((relativeDir) => relativeDir.split('/')[0]),
-      ...renderedByPackage.values().map(({ package: pkg }) => pkg.path.split('/')[0]),
-      ALLOCATE_MANIFEST_FILE_NAME,
-    ])].sort();
+    const topLevelNames = publishedTopLevelNames({ plan, renderedByPackage });
     const published = publishStagedTree(staging.path, manifestDir, topLevelNames);
     if (!published.published) {
       rmSync(staging.path, { recursive: true, force: true });
diff --git a/.claude/scripts/workspacify-allocate/run.mjs b/.claude/scripts/workspacify-allocate/run.mjs
index ec23635..ea8bc90 100644
--- a/.claude/scripts/workspacify-allocate/run.mjs
+++ b/.claude/scripts/workspacify-allocate/run.mjs
@@ -10,7 +10,7 @@
  * package, and WORKSPACIFY-ALLOCATE-MANIFEST.json — the machine authority that
  * records what was proven. Intermediate artefacts are removed before it returns.
  */
-import { readFileSync, writeFileSync, rmSync } from 'node:fs';
+import { readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
 import path from 'node:path';
 import { fileURLToPath, pathToFileURL } from 'node:url';
 import process from 'node:process';
@@ -30,7 +30,7 @@ import { sweepStagingDecisions } from '../workspacify-tree/lib/staging-decisions
 import { loadTreeManifest, checkAllocateEntryGate, readManifestSource } from './lib/tree-manifest-input.mjs';
 import { buildDirectoryPlan } from './lib/directory-plan.mjs';
 import { checkPlannedPathSafety } from './lib/path-safety.mjs';
-import { checkExistingOutputPolicy, createStagingRoot, materializeDirectories, verifyStaging, publishStagedTree, verifyDirectorySet } from './lib/tree-staging.mjs';
+import { checkExistingOutputPolicy, createStagingRoot, materializeDirectories, verifyStaging, publishStagedTree, snapshotDirectories, verifyDirectorySet } from './lib/tree-staging.mjs';
 import { deriveExpectedAllocation, lookupInventoryItem } from './lib/allocation-model.mjs';
 import { buildAuthoringPacket } from './lib/seed-authoring-packet.mjs';
 import { SEED_FILE_NAME, ALLOCATE_MANIFEST_FILE_NAME, validateDecisionsAuthoringSurface } from './lib/seed-model.mjs';
@@ -43,7 +43,7 @@ import { deriveImplementationOrder, verifyOrderAgainstStage1 } from './lib/imple
 import { walkSeedContracts } from './walk-seed-contracts.mjs';
 import { adviseFailure } from '../workspacify-tree/lib/gate-advice.mjs';
 import { buildAllocateManifest, renderAllocateManifest } from './lib/allocate-manifest.mjs';
-import { publishWorkspace } from './publish-allocate-manifest.mjs';
+import { publishWorkspace, publishedTopLevelNames, rollbackPublication } from './publish-allocate-manifest.mjs';
 import { removeWorkspaceArtifacts } from './cleanup-workspace-artifacts.mjs';
 import { reloadAndVerify } from './lib/allocate-reload.mjs';
 import { renderSeed } from './lib/seed-render.mjs';
@@ -489,18 +489,31 @@ export function runFinalize(args) {
     },
   });
 
+  // The reload scan and the rollback both judge what this run created, so the root's
+  // own content is read before publication: the workspace root may be a host project
+  // directory that holds the spec and the manifest beside its own sources, and none
+  // of that is this workspace.
+  const preExistingDirs = snapshotDirectories(manifestDir);
+  const preExistingEntries = new Set(readdirSync(manifestDir));
+  const topLevelNames = publishedTopLevelNames({ plan, renderedByPackage });
+  const rollbackPublicationOfThisRun = () => rollbackPublication({ manifestDir, topLevelNames, preExistingEntries });
+
   const publishResult = publishWorkspace({ manifestDir, plan, renderedByPackage, allocateManifest });
   if (!publishResult.published) {
     throw new WorkSpacifyTreeError(publishResult.reason, { gateId: 'G6.6' });
   }
 
-  // Reload verification: the published artefacts must reproduce the proof.
-  const reloadDirs = verifyDirectorySet(manifestDir, plan.relativeDirs);
+  // Reload verification: the published artefacts must reproduce the proof. A gate that
+  // refuses after publication takes the publication back with it, so a failed run
+  // leaves the workspace as it found it rather than half-verified.
+  const reloadDirs = verifyDirectorySet(manifestDir, plan.relativeDirs, { preExisting: preExistingDirs });
   if (!reloadDirs.ok) {
+    rollbackPublicationOfThisRun();
     throw new WorkSpacifyTreeError(`reload directory scan failed: missing ${listOrNone(reloadDirs.missing)}, unexpected ${listOrNone(reloadDirs.unexpected)}`, { gateId: 'G6.4' });
   }
   const reloadVerdict = reloadAndVerify({ workspaceRoot: manifestDir, plan, manifest, manifestPath, expected: allocateManifest });
   if (!reloadVerdict.ok) {
+    rollbackPublicationOfThisRun();
     removeWorkspaceArtifacts({ workspaceRoot: manifestDir, stagingRoot: null });
     throw new WorkSpacifyTreeError(`reload verification failed: ${describeDivergences(reloadVerdict.divergences)}`, { gateId: 'G6.5' });
   }
```

---

## Appendix B — invariants the patch preserves

Stated so that review can check them rather than re-derive them.

| Invariant | How the patch preserves it |
|---|---|
| A failed run publishes nothing | G6.4 and G6.5 now remove the entries this run created before throwing |
| Pre-existing content is never deleted | `rollbackPublication` skips every name present in the pre-publish snapshot, and `publishStagedTree` refuses to rename onto an existing destination, so a snapshot entry cannot have been created by this run |
| The reload scan still detects run-created leakage | `unexpected` excludes only planned and pre-existing paths |
| The reverse rotation's A1 inversion is unchanged | it never passes `preExisting`; the default is `[]` |
| The published artefacts are byte-identical to before | the fix touches no rendering, no contract, no manifest field and no seed section |
| Callers of `verifyDirectorySet` are unaffected | the added parameter is optional and defaults to the previous behaviour |

---

## Appendix C — the six specification statements to correct (work item 2)

Paths are relative to the conver repository root. Line numbers are as of this writing;
match on the text rather than on the number.

| File | Line | Current text | Required |
|---|---|---|---|
| `.claude/commands/workspacify-allocate.md` | 52 | `- staging: scratch/intermediate files; not records; finalizer deletes them after reload verification.` | `- staging: scratch/intermediate files; not records; the finalizer removes the staging root after reload verification. The staged decisions document is not staging — it is the authored input of record and is retained.` |
| `.claude/commands/workspacify-allocate.md` | 191 | `- decisions: staging, repairable after refusal; finalizer deletes it and empty holder directories only after published-set reload verification.` | `- decisions: the authored input of record, repairable after refusal and retained after success; the finalizer leaves the document and its holder directory in place.` |
| `.claude/commands/workspacify-allocate.md` | 377 | `- final rescan; every seed re-parsed/contracts re-extracted; WIG rebuilt; order rederived; manifest self-hash valid; residue only published kinds + pre-existing files.` | `- final rescan; every seed re-parsed/contracts re-extracted; WIG rebuilt; order rederived; manifest self-hash valid; residue is the published kinds, the retained decisions document and pre-existing files.` |
| `.claude/commands/workspacify-allocate.md` | 312 | worked-example residue: `"residue":["WORKSPACIFY-ALLOCATE-MANIFEST.json","WORKSPACIFY-TREE-MANIFEST.json","crates","spec.md"]` | add the reserve so the example matches the new rule: `"residue":["WORKSPACIFY-ALLOCATE-MANIFEST.json","WORKSPACIFY-TREE-MANIFEST.json","crates","spec.md","workspacify"]` |
| `.claude/commands/workspacify-tree.md` | 107 | `It is staging, not record: success finalize sweeps it and empty containing dirs; refusal preserves it for repair.` | `It is the authored input of record: both refusal and success preserve it, and its containing directory.` |
| `.claude/commands/workspacify-tree.md` | 206 | "- Decisions: fixed `workspacify/tree/DECISIONS.json`; read once; success sweeps it" | "- Decisions: fixed `workspacify/tree/DECISIONS.json`; read once; retained after success" |

Two statements that read similarly and must **not** be changed:

* `workspacify-tree.md:177` — "next start sweeps stale temp" concerns a publish
  *temporary directory*, not the decisions document.
* `workspacify-reverse.md:229` — "sweep precedes fixed crossed boundaries" describes a
  different mechanism, the two-pass analysis.

Then confirm nothing is left, by searching all three command files rather than trusting
this table to be complete:

```bash
cd .claude/commands
grep -n "DECISIONS.json" workspacify-allocate.md workspacify-tree.md workspacify-reverse.md
grep -n "sweep\|delete"    workspacify-allocate.md workspacify-tree.md workspacify-reverse.md
```

`workspacify-reverse.md` refers to a reserved `DECISIONS.json` at `:52`, `:92` and
`:199` as the document its `gate` reads. Its `:199` says "`DECISIONS.json` is not
published", which stays true under retention — the document is not part of the
published set. No edit is therefore expected in that file; confirm it, and if any
statement there claims the document disappears, correct it the same way.
