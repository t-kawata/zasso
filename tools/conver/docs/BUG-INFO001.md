# BUG-INFO001 — `explain-seed` cannot load: two imported names are never exported

| field | value |
|---|---|
| Bug id | BUG-INFO001 |
| Severity | Blocker — the whole tool fails at module load; no operation runs |
| Component | `.claude/scripts/explain-seed/` |
| Introduced by | commit `19f126c` (`v0.0.23`, 2026-09-29 14:26:07 +0900) |
| Discovered | 2026-09-29, while running `/explain-seed crates/foundation/gaia-foundation/RFC-SEED.md` |
| State at HEAD | clean tree, HEAD = `19f126c`. The defect is committed, not a local edit. |

This document is an instruction for the fixer. Every claim below was verified against the
working tree at `19f126c`; claims that were **not** verified are marked as such in §11.
Fix nothing outside §6, and read §10 before touching anything else.

---

## 1. What is broken

`run.mjs` and `lib/neighbour-decisions.mjs` import two names from `lib/frame.mjs` that
`lib/frame.mjs` does not export: `locateSections` and `HUMAN_SECTION_ID`. Node resolves the
import graph before any code runs, so the process dies with `SyntaxError` at instantiation
time. Because the failure precedes all reading, **every** operation (`info`, `check`,
`answers`) fails identically, and no seed or manifest is ever opened.

The omission is new in `v0.0.23`. `git log -S` shows `frame.mjs` never exported
`locateSections` and never declared `HUMAN_SECTION_ID` in any commit: this is an omission,
not a deleted export. There is no earlier revision to restore from.

---

## 2. Reproduction

```
node .claude/scripts/explain-seed/run.mjs info "crates/foundation/gaia-foundation/RFC-SEED.md"
```

Observed — exit code 1, stdout empty (0 bytes):

```
file:///Users/kawata/shyme/gaia/.claude/scripts/explain-seed/lib/neighbour-decisions.mjs:25
import { EXPLAIN_FILE_NAME, locateSections } from './frame.mjs';
                            ^^^^^^^^^^^^^^
SyntaxError: The requested module './frame.mjs' does not provide an export named 'locateSections'
    at #asyncInstantiate (node:internal/modules/esm/module_job:326:21)
    at async ModuleJob.run (node:internal/modules/esm/module_job:429:20)
    at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:642:26)
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/esm/loader:101:4)

Node.js v26.0.0
```

The fixed argument above is incidental — the fault is independent of which seed is named,
because it occurs before the path is read (§4).

---

## 3. Root cause — confirmed

Three unresolved named imports, all resolving to two names missing from one file.

| # | Consumer (file:line) | Name imported | Declared in `frame.mjs`? |
|---|---|---|---|
| 1 | `lib/neighbour-decisions.mjs:25` | `locateSections` | Yes, at `frame.mjs:217` — but **without** `export` |
| 2 | `run.mjs:52` (import block ends `run.mjs:56`) | `HUMAN_SECTION_ID` | **No** — the name is declared nowhere in `frame.mjs` |
| 3 | `run.mjs:54` (same block) | `locateSections` | same as #1 |

Current declarations:

```js
// .claude/scripts/explain-seed/lib/frame.mjs:215-217
/** The sections of a document that was written by an earlier run. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function locateSections(documentText) {
```

`locateSections` is a complete, correct function (body `frame.mjs:217-246`) returning
`{ bodies, duplicates, missing }`. It is already used internally by `frame.mjs` at lines 626,
678, 686 and 781. Only the `export` keyword is absent.

`HUMAN_SECTION_ID` exists as a *name* in exactly one place, and in the wrong file:

```js
// .claude/scripts/explain-seed/lib/neighbour-decisions.mjs:30
const HUMAN_SECTION_ID = 'E5';
```

The id it names is owned by `frame.mjs`, which spells it as a bare literal:

- `frame.mjs:81` — `Object.freeze({ id: 'E5', title: '人間が決めること（ここだけ）' })`, inside the exported `FRAME_SECTIONS`
- `frame.mjs:797` — `faultsOfDecisions({ body: decisions, openItems, section: 'E5' })`

So `'E5'` currently has three independent spellings across two files, and the only *name* for
it lives in a consumer rather than in the module that owns the section vocabulary.

---

## 4. Why the input files are not the cause

Do not look for this bug in `RFC-SEED.md`, `WORKSPACIFY-TREE-MANIFEST.json`,
`WORKSPACIFY-ALLOCATE-MANIFEST.json`, or the specification. The stack trace is
`#asyncInstantiate` — Node's module-link phase. No `fs` call has been made at that point, so
no input file has been opened, parsed, or judged. A different seed path produces the same
failure. The tool is unrunnable, not misreading.

---

## 5. Complete scope of breakage — verified enumeration

Method: for each of the 13 `.mjs` files under `.claude/scripts/explain-seed/`, every relative
named import (`import { … } from './…'`) was resolved against the target module's actual
exports (`export const|let|var|function|class`, `export { … }`, `export default`,
`export * from`). Re-run this check after your fix; it is cheap and it is the guard against
fixing only the first error and shipping a second one.

Result: **13 modules scanned, 3 unresolved named imports, 0 other defects.** The three are
exactly table §3 — items 1, 2 and 3. There is no fourth missing export.

Consequence: fixing §6 will let the module graph link. It does **not** follow that `info` then
exits 0 — see §11.

---

## 6. Required fix

### 6.1 Export the locator that already exists

Add `export` to the declaration at `frame.mjs:217`. Change nothing about its body, its
signature, or its return shape — four existing call sites inside `frame.mjs` (lines 626, 678,
686, 781) and one in `run.mjs:258` depend on it as it stands.

### 6.2 Give `HUMAN_SECTION_ID` one owner, in the module that owns the vocabulary

Required:

1. Declare it in `frame.mjs`, **before** `FRAME_SECTIONS` (declared at `frame.mjs:76`), as an
   exported constant with a doc comment in the house style (the file documents every exported
   name; state *why* the section is the human's, not that it is "E5"):

   ```js
   /** The one section whose items only the human can answer. */
   export const HUMAN_SECTION_ID = 'E5';
   ```

2. Use that constant for the two literals `frame.mjs` already spells by hand: the `id` of the
   `E5` entry in `FRAME_SECTIONS` (`frame.mjs:81`) and the `section` argument at
   `frame.mjs:797`.

3. Delete `const HUMAN_SECTION_ID = 'E5';` at `neighbour-decisions.mjs:30`, and add
   `HUMAN_SECTION_ID` to the import list it already has from `./frame.mjs` at line 25. A
   consumer must not hold a second definition of a name the owner exports; that duplicate is
   what the export exists to remove.

Leave the identifier `'E5'` inside a quoted member access or an object-literal key
(`located.bodies.E5` at `frame.mjs:637, 679, 795`; the `E5(material)` renderer at
`frame.mjs:522`) alone. Those are dispatch keys, not the identity constant.

### 6.3 Out of scope for this fix

Do **not** also refactor these. Each is a real observation, none is this bug, and each widens
the blast radius of a change whose whole purpose is to restore a loadable tool:

- `.claude/scripts/explain-seed/lib/digest.mjs:39-45` — a separate table listing which INFO
  sections each frame section rests on. It has its own `id` vocabulary; unifying it with
  `HUMAN_SECTION_ID` is a design question, not this defect.
- The renderer dispatch keys at `frame.mjs:522`.
- The stale-`INFO`/`EXPLAIN` question in §11.

---

## 7. TDD — Red first (mandatory, project law)

Project law (`CLAUDE.md` §1) requires a test that fails red **before** the fix, for the right
reason: absence of the implementation. The absence here is exactly two exports, so the red
state is literal and provable:

**Testable form (unit).**
A test that dynamically imports the module graph and asserts the two names resolve:

- `await import('…/lib/frame.mjs')` → `typeof frame.locateSections === 'function'`
- `await import('…/lib/frame.mjs')` → `frame.HUMAN_SECTION_ID === 'E5'`
- `frame.HUMAN_SECTION_ID` is the `id` of an entry in `frame.FRAME_SECTIONS` (guards the
  single-owner invariant from §6.2)
- `await import('…/run.mjs')` resolves without throwing (this is the import that currently
  dies; asserting only the two names above would miss a later re-import regression)

Importing `run.mjs` is side-effect free and safe to assert on: its top-level invocation is
guarded by `isProgramRun()` (`run.mjs:313-318`), which compares `process.argv[1]` against the
module's own URL. Under the test runner that comparison is false, so `main()` is never called
and `process.exitCode` is left alone.

Red today: the first two assertions are `undefined`, and the fourth throws the `SyntaxError`
in §2. Green after §6.

**Testable form (end-to-end).** A test that spawns the tool and asserts the exit code:

- `node .claude/scripts/explain-seed/run.mjs info <seed>` → exit 0, stdout non-empty

Red today: exit 1, stdout empty.

Harness facts (verified, so you do not have to rediscover them):

- Runner: `node .claude/tests/run-all.js`. It discovers `tests/**/*.test.{js,cjs}` — **`.mjs`
  is not matched**, so the test file must be `.test.js` or `.test.cjs`.
- Place it to mirror the tree: `.claude/tests/explain-seed/`.
- `.claude/package.json` declares `"type": "commonjs"`, so a `.test.js` there is CommonJS and
  cannot use static `import` against the ESM tool — use dynamic `await import()`.
- The runner keys on the child's **exit status**; a file's own `Passed:`/`Failed:` lines are
  parsed only opportunistically. Follow the local `assert`/`assertEq` + `passed`/`failed`
  counters + `process.exit(failed > 0 ? 1 : 0)` style of
  `.claude/tests/tickets/list-remaining-stubs.test.js`.

Do not weaken or skip a test to reach green (§1, D5).

---

## 8. Verification — exact commands

Run in this order and report the real output.

1. Static import check (re-run §5's enumeration). Expected: `unresolved named imports: 0`.
2. `node .claude/tests/run-all.js` — your new test file must pass, and no existing test may
   regress. If the suite already fails for unrelated reasons, record the pre-existing
   failures **before** your change so the comparison is honest.
3. The reproduction from §2. Expected: exit 0, non-empty stdout.

### Caution — `info` writes two tracked documents

`run.mjs info` is a write operation: it writes `INFO-RFC-SEED.md` and maintains
`EXPLAIN-RFC-SEED.md` beside the seed it is given. Both files exist and are tracked:

- `crates/foundation/gaia-foundation/INFO-RFC-SEED.md`
- `crates/foundation/gaia-foundation/EXPLAIN-RFC-SEED.md`

So before step 3, record `git status --porcelain`; after it, run `git diff --stat` and inspect
any change to those two documents. This bug ticket is **not** authorisation to regenerate
product documents. Treat churn in them as a separate finding to report, not as part of the
fix, and do not commit it under this ticket.

---

## 9. Acceptance criteria

| id | criterion |
|---|---|
| A1 | `node .claude/scripts/explain-seed/run.mjs info <seed>` exits 0 |
| A2 | `frame.mjs` exports `locateSections` and `HUMAN_SECTION_ID`; no other import is unresolved |
| A3 | `'E5'` has exactly one *named* owner (`frame.mjs`'s exported `HUMAN_SECTION_ID`); no consumer re-declares it |
| A4 | a test exists that was red before the fix and is green after, for the reason in §7 |
| A5 | no existing test regressed (`node .claude/tests/run-all.js`) |
| A6 | the `PX-222` provenance comment at `frame.mjs:216` is preserved, and any comment on code you changed is true (§12) |
| A7 | no `[::STUB::]`-requiring construct (`todo!()`, empty body, mock, suppression) is introduced |

---

## 10. Boundaries

- Change only `.claude/scripts/explain-seed/lib/frame.mjs`,
  `.claude/scripts/explain-seed/lib/neighbour-decisions.mjs`, and the new test file.
- Do not edit `RFC-SEED.md`, either manifest, or the specification to make anything pass.
- Do not delete, alter, or comment out any `[::TICKET::]` marker. §12 governs additions.
- Do not regenerate, repair by hand, or hand-author `INFO-RFC-SEED.md` / `EXPLAIN-RFC-SEED.md`
  (§8).
- No new dependency. No change to `run.mjs`'s argument surface or operations.

---

## 11. Open — declared uncertainty

These were **not** verified, and the fixer must not assume them:

1. **Whether `info` exits 0 after §6.** Only the module-link failure was confirmed. The tool
   was last known to work before `v0.0.23`; the `v0.0.23` change also added
   `neighbour-decisions.mjs` and `run.mjs`'s `answers` operation (`run.mjs:63, 300`), none of
   which has ever executed. If `info` or `check` fails after §6 for a *different* reason, that
   fault is **in scope for this ticket** — diagnose it and report it; do not stub around it and
   do not widen the acceptance criteria to hide it.
2. **Whether `check` exits 0.** It reads the same module graph, so it failed for the same
   reason; but its behaviour against the currently committed `EXPLAIN-RFC-SEED.md` is unknown.
3. **What a successful `info` writes.** See §8.

The committed `INFO-RFC-SEED.md` (mtime 2026-09-29 12:08:03) and `EXPLAIN-RFC-SEED.md`
(mtime 2026-09-29 14:12:26) both predate the `v0.0.23` commit at 14:26:07, so they were
produced by a pre-`v0.0.23` tool. They are therefore of unverified currency relative to the
current tool. Deciding whether to regenerate them is a separate call, made by the requester
after this fix — not by the fixer, and not under this ticket.

---

## 12. Provenance on the comments you touch (M5)

Project law requires a comment on ticket-modified code to carry a provenance marker naming
the ticket **and** a runnable command that resolves it. The form already used in this file is:

```js
// [::TICKET::] <KEY> changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=<KEY> --for-spec --no-implementation-order`.
```

`BUG-INFO001` is the identifier the requester chose for this document. It is **not** confirmed
to be a key the ticket tooling resolves — `Tickets.json` was searched and contains no
occurrence of `BUG` at all. Before writing a marker with it, confirm resolvability:

```
node .claude/scripts/tickets/show-ticket-context.js --ticket-key=BUG-INFO001 --for-spec --no-implementation-order
```

If it does not resolve, obtain a real key through the ticket tooling. Do not invent a
provenance marker that cannot be followed; an unresolvable marker violates M5 as surely as a
missing one.
