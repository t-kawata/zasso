# Progress-GIF Timeline Contract

The progress GIF replays the command history. It does not project final artifact state.

## 1. Clocks

| Priority | Source | Confidence | Use |
|---|---|---|---|
| 1 | `.conver-history.jsonl` finish | exact | every stage |
| 2 | status completion (`completedAt`, `updatedAt`, `measuredAt`, `receipt.recordedAt`) | exact | grill, drill, graphify/boundify/split fallback |
| 3 | ticket explicit timestamp (`made_at`, `planned_at`, `done_at`, `reviewed_at`, `completedAt`) | exact | make/plan/start/review per ticket |
| 4 | git first commit (`git log --reverse --format=%cI -- <path>`) | approx | explain, educe, pre-history |
| — | artifact mtime | never | a checkout copies mtimes; it is not a command clock |

`.conver-history.backfill.jsonl` carries the provenance of a one-time rebuild. The live
`.conver-history.jsonl` remains append-only. A live record wins over a backfill record with
the same `backfillId`.

## 2. Record shape

```json
{
  "v": 1,
  "runId": "backfill-explain-pkg-1-0123456789ab",
  "event": "finish",
  "command": "backfill:git",
  "stage": "explain",
  "packageId": "pkg-1",
  "at": "2026-11-02T00:00:00.000Z",
  "status": "COMPLETE",
  "addedTicketKeys": [],
  "source": "git",
  "confidence": "approx",
  "backfillId": "0123456789abcdef",
  "role": "pipeline",
  "ticketKey": "PX-1",
  "delta": 0.25
}
```

`source` is one of `history|status|ticket|git`. `confidence` is `exact|approx|unknown`.
`role` is one of `pipeline|maintenance|revision|evolution`. `ticketKey` and `delta` are
optional.

## 3. Roles

| Role | Ladder | Headline | Examples |
|---|---|---|---|
| `pipeline` | advances | moves | first graphify, make/plan/start/review, post-review resolve/consolidate/find |
| `maintenance` | no | no | `consolidate-stubs` before review |
| `revision` | no | no | graphify/smooth rerun after the first run |
| `evolution` | advances drill | moves | drill, amend |

Blocked or repair drill runs are evolution markers with no drill progress. A package with no
successful drill has `drill = 0` while its attempts remain visible.

## 4. Per-package gating

Displayed implementation progress satisfies:

```
make <= plan <= start <= review <= resolve <= consolidate <= find
```

The stored fraction may arrive out of order; the display reveals it only when the preceding
stage catches up. An idle package has all implementation stages at zero. Upstream stages keep
their real order; a real out-of-order command (for example an early single-package graphify)
is drawn as it happened.

## 5. Fail-closed validation

`validate-timeline.js --root=<workspace>` reports:

| Code | Severity | Meaning |
|---|---|---|
| `MISSING_STAGE_RECORD` | error | a history-mode stage event has no record |
| `COLLAPSED_ORDER_TIME` | error | one order time holds evidence spread beyond `MAX_COLLAPSE_MS` |
| `ORDER_SKEW` | error | `orderT` differs from `evidenceT` beyond `MAX_ORDER_SKEW_MS` |
| `PREVIOUS_PROGRESS_MISMATCH` | error | history-to-history previous render no longer matches `progressAt` |
| `FINAL_STATE_MISMATCH` | warning | history final state differs from the artifact projection by more than `FINAL_STATE_TOLERANCE` |

`draw-progress-gif.js` writes no HTML when an error-severity violation exists. Every snapshot
records `timelineHealth`:

```json
{
  "mode": "history",
  "violations": [],
  "warnings": ["FINAL_STATE_MISMATCH"],
  "eventCount": 1166,
  "backfillCount": 734,
  "finalStateParity": "mismatch"
}
```

## 6. No-history fallback

A workspace with no history and no backfill keeps the ordinal estimated timeline. Frames
carry `timelineMode: "estimated"`; the no-history golden frames remain byte-identical.

## 7. Operations

```bash
# One-time rebuild; dry-run first, then apply.
node .claude/scripts/conver/backfill-history.js --root=<workspace> --dry-run
node .claude/scripts/conver/backfill-history.js --root=<workspace> --apply

# Validate before rendering.
node .claude/scripts/conver/validate-timeline.js --root=<workspace>

# Render.
node .claude/scripts/conver/draw-progress-gif.js -t <workspace>
```

The backfill is idempotent by `backfillId`. Re-running `--apply` appends no duplicate. A
missing git or unreadable status/ticket is a `[backfill]` warning, never a failure.
