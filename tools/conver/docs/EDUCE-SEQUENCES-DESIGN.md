# /educe-sequences — design

This document is written so that a reader can re-derive it rather than trust it. Every
number below is held to the repository by `tests/conventions/design-measurements.test.mjs`
and every citation by `tests/conventions/design-citations.test.mjs`.

## 1. What the command is for

A specification describes a space, not a list of operations. Surfacing the sequences and
operations it implies is a reading, and the portable asset is therefore the procedure
together with the checks — never the values, which belong to one specification and are
recorded in that specification's artifact.

The failure this design is shaped around is measured, not imagined. A step file was
produced in which every step carried all four required fields, the ordering held and the
bijection held, and none of it was a reading: an operation had been bound to a *window*
because its name or its result object appeared nearby. That shape passes every structural
check. Only an entry-level question catches it, which is why the signature requirement is
the centre of the command rather than an addition to it.

## 2. The one-argument contract

`/educe-sequences <spec-file>` takes exactly one positional argument and derives its
output location from it: `<dir>/<basename>-sequences.json`. There is no pin argument, no
output flag and no environment variable, and a verification of an existing artifact
therefore needs nothing beyond the specification path. The derivation is
`artifactPathFor` and `renderPathFor` in `paths.mjs`, and only the final extension is
removed, so `spec.v32.final.md` yields `spec.v32.final-sequences.json`.

An earlier revision made the pin file a second argument. That was removed because a pin
is a finding, and an input that carries a finding keeps the finding outside the artifact
where no reader can check it.

## 3. The pins, and why they are re-derived

The artifact carries the pins: the predicate line and its limbs, the row-schema line and
its fields, the enumerations with their ranges, the forms, and the section partition.
Each pin is recorded together with the rule it was read by, and `rederiveAll` at
`pins.mjs:246` re-runs that rule against the specification text in the same run that
consumes it.

This is the property that keeps the single-input design from becoming a self-referential
one. An artifact that supplies its own premises and then checks itself proves nothing, so
a check may not consume a pin that was not re-derived in the same run; a run with
re-derivation disabled is refused rather than allowed to proceed. An artifact whose
predicate line is edited to a line that does not carry its limbs fails its own
verification.

A form detector is deliberately the weakest pin: it proposes candidates and is refused if
it claims to decide any of them. A check may propose and may never decide, and no check
treats a name appearing near a region, a plain span intersection or a coverage relation as
evidence about what a line says.

## 4. The checks

The checks are declared once, at `engine.mjs:213`, and the count the run prints is derived
from that array rather than restated. Each check carries the defect that produced it, the
reading it refuses to accept, and its scope, because a check whose origin is forgotten is
the first one deleted when it turns red.

The block is produced only after every check has run, so a null summary means the run
stopped before the checks could speak. "No verdicts" and "no checks" must never print the
same thing, which is why a missing pin returns no summary rather than an empty verdict
list.

## 5. Reading, and the boundary the command declares

Five briefs — span, adjudicate, adversarial, reroute, adhoc — and each renders only when
it carries exactly one interrogative sentence, the verbatim-quote requirement, the
no-line-window rule and the worklist path. The five are counted rather than searched for,
so a template that merely mentions them does not render.

A neighbour is selected by citation: the entry that cites a line inside the entry's own
span, at `pins.mjs:82`. A neighbour that merely covers the span is not a candidate — that
is the shape of the fabrication — and an ambiguous selection returns nothing rather than a
first match.

The integrator at `reading.mjs:220` proves every field of every reading before anything is
written, and a refusal leaves the artifact byte-identical to its state before the call. A
partial write is the failure that module exists to make impossible.

Everything on the library side of a `[read]` phase is deterministic and tested. The
reading itself is not, and the command states that residual in writing rather than
implying that its checks measure it. A claim with no reader reddens the run; the honesty
of the reader's signature is carried the way any signed record is carried.

## 6. The fixture

`tests/educe-sequences/fixtures/gaia/` is a frozen evidence corpus: the Gaia
specification and the artifacts, the reference checker the rules were extracted from, and
the scratch corpus of reader briefs, integrators and the splice case. Its bytes are
recorded in `MANIFEST.json` and held by `tests/conventions/educe-sequences-fixture.test.mjs`,
so a hand-edited fixture fails rather than silently changing what the golden test
measures. Drift from the source repository is reported, never absorbed.

The corpus holds 29 files totalling 3100101 bytes, and a green run of the golden
specification reports 13 checks over 5 pins.

`tests/educe-sequences/fixtures/spec/` holds the golden run: a small specification, the
declaration and readings one run recorded, and the artifact and rendering that run
produced. The committed artifact records the digest of the committed specification, so
the record cannot survive a change to the text it cites.

The golden run is over that small specification rather than over Gaia deliberately. An
artifact is the product of a reading, and a Gaia-shaped artifact that no run produced
would be exactly the fabrication this programme exists to catch; a run against Gaia
without recorded readings is refused at the first `[read]` phase by design.

## 7. The phase driver

A phase table is a claim until something evaluates it. The seventeen phases are declared
once, at `gates.mjs:108`, and each entry carries its tag, the phases it requires, the edge
it returns to when it refuses, and how many times it may loop. The command file's table is
a summary of that array, not a second copy of it.

`phases.mjs:173` is the driver: it evaluates the entry gate, performs the phase if the
library can perform it, and evaluates the exit gate. A refusal spends one loop, reports the
back-edge, the loops spent, and the file a reader must produce, and leaves the phase
`refused` rather than `done`. That last part is the ordering: `requires` is satisfied by
`done` alone, so a phase that failed cannot open the phases that depend on it, and `next`
still proposes it. A refusal recorded as a completion would let a run walk past the failure
it had just written down.

The loop count is a limit rather than a tally because the entry gate reads it. A phase that
has already spent its `maxLoops` refusals is refused entry with a `halted` verdict that
names the count and repeats the last refusal verbatim; it spends no further loop, names no
back-edge, and asks the reader for nothing, because the reason a phase loops is that its
input is defective and re-asking is what already failed. The command line prints the count
against the limit for every phase, so "no phase is above its limit" is a glance at
`status` rather than a comparison the reader holds sixteen numbers to make. A halt exits 3
where a refusal exits 1, which is what lets a Step tell "go back" from "stop" without
parsing the prose.

The run's working state — where it has reached, which loops it has spent, which briefs have
reported — lives in a run directory **beside the specification**, at
`join(dirname(specPath), 'educe-sequences')`, opened at `run-state.mjs:91`. It is not
ignored by the tool, because the declaration and the readings in it are the evidence for
the artifact and a reader of the specification has to be able to find them. PX-240 kept
the state under the tool so that the one-argument contract would be a statement about
products; the contract is stronger here, because every path a run touches is a function of
the argument. The directory name carries no digest, so an edited specification is refused
against the state it already has rather than quietly opening a second one.

A `[read]` phase is the one place a machine cannot go, so what it hands back is a shape the
machine can check: a declaration, and one signed readings file per brief, both validated
line by line at `readings.mjs:123` before anything downstream sees them. Two files are
carried per brief rather than one because a single reader asked for four sections answers
three of them from the first and calls it reading.

A phase that had nothing to read — an adversarial pass with no ruling to attack — is
recorded as vacuous rather than as an unsigned phase, and the report names both counts.
A phase whose reader never reported and a phase that legitimately found nothing must not
print the same, and only one of them is incompleteness.

The one genuinely non-mechanical act is a defect class with no analogue in the record,
which needs a check that has never been written. `adhoc.mjs:126` scaffolds that check and
refuses without the defect that motivated it, and the record it leaves carries the
condition that would promote the check into the rail. `rail/report.mjs:51` closes the run by
separating what was measured from what is carried by a signature, and `phase.mjs:159` is
the command line every step of the command file runs.

## 8. What is not here

- The grill intake. The grill reads its prior material by fixed file name, so giving it
  the artifact at RFC-writing time needs a change on the grill side; that is a separate
  ticket.
- A second specification. Whether the rail generalises is open and can only be closed by
  a second run; the mutation corpus falsifies the engine against the one specification
  that exists, and the rail-exit count makes the debt visible on every run.
- A real consumer. Both directions of the coverage check are proven against a synthetic
  consumer, and that check deliberately stays outside the ones that gate a run: a check
  that gates a run cannot require a consumer that does not exist here. The first real
  consumer is the first genuine test of the direction.
- A seventh shape. The library carries the six shapes the Gaia record reduces to, and each
  is exercised by at least one declared check. A defect that fits none of them is what the
  ad-hoc surface is for, and its rail-exit record carries the condition that would promote
  a seventh.
