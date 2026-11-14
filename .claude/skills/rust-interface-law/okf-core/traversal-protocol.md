# Traversal Contract

Every node page and edge read returns one Traversal Envelope; a directory listing
returns one command per entry and a search row carries its expand_command. The caller reads `coverage`
and `guidance`; it never re-derives completeness from prose.

## AI-facing view

The CLI renders the envelope as Markdown with four fixed sections: Page,
Coverage, Frontier, and Decision. Each section carries a one-line description
of what it contains. Every frontier entry, the full body, and every command
appear; nothing is truncated. The AI reads this view. The JSON envelope below
is the verification contract used by tests and verifiers, not the AI-facing
format.

## Envelope

- `protocol`: `okf-traversal/v1`
- `node`: id, path, type, title, description, body, sources, trustTier, freshness
- `coverage`: profile, requiredFacets, present, missing, sufficient, insufficient, estimatedBytes, overfetchRatio
- `frontier`: entries with id, title, type, kind, why, command, estBytes, priority
- `guidance`: state, reason, decideAfter, mustRun, stopWhen, ifBack, hop, maxHops, budget
- `backTo`: the previous id in the stack, or null at the root

## Guidance states

| State | Condition | Caller action |
|---|---|---|
| `stop` | `coverage.missing` is empty | Implement or answer; no further read |
| `expand` | a required facet is missing and a hop remains | Run `guidance.mustRun` exactly |
| `back` | maximum hop reached, or no frontier fills the missing facet | Run `guidance.ifBack` |

`coverage.missing` is the only definition of insufficiency. A budget that
cannot fit required facets returns `insufficient: true` and never truncates a
facet. `overfetchRatio` is a report, not a failure.

## Frontier kinds

`prerequisite`, `dependent`, `source-section`, `sibling-rule`, `backlink`,
`parent`, `child`, `directory`, `source`, `action`.

## Failure

An absent id exits 2 and prints candidate ids. An empty edge list with exit 0
is never a valid answer for an absent id.
