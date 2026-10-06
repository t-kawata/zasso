# Fixtures copied from a real run

## `EXPLAIN-RFC-SEED.md`

A verbatim copy of the explanation document `/grill-me-for-rfc` wrote for
`~/shyme/gaia/crates/network/gaia-network`, taken on 2026-10-06 (239 lines, 11
pre-decided items). It is here so the reader can be asserted against a document the
frame actually produced, rather than against a shape a test author believed the frame
produced — which is what let the reader and the writer drift apart unnoticed.

Do not edit it. It is generated output, and a copy that has been adjusted is no longer
evidence of what the producer emits. If a new shape needs covering, add a document
generated in the shape under test rather than editing this one.

The suite does not read `~/shyme/gaia`: the tests must pass where that workspace is
absent, so this copy is the only thing they depend on. To refresh it, run
`/grill-me-for-rfc` in that workspace and copy the result again — but note that the
provenance comment in `tests/question-gate/unit/prior-decisions.test.mjs` names the
date the current copy was taken.
