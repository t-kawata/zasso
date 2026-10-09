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
`pins.mjs:519` re-runs that rule against the specification text in the same run that
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

The checks are declared once, at `engine.mjs:626`, and the count the run prints is derived
from that array rather than restated. Each check carries the defect that produced it, the
reading it refuses to accept, and its scope, because a check whose origin is forgotten is
the first one deleted when it turns red.

Three of the twenty are the ones this apparatus needed before it could claim to have
read rather than assembled: a step is grounded in the line it names, a step cites a line
inside its entry's span or one the entry records as a crossing, and a ruling that applies
the predicate names a limb of it. Each of the three is a device the campaign reached by
measuring its own failures — a decomposition of 1178 steps carried every act field, in
order, with the bijection holding, and none of it was a reading.

The block is produced only after every check has run, so a null summary means the run
stopped before the checks could speak. "No verdicts" and "no checks" must never print the
same thing, which is why a missing pin returns no summary rather than an empty verdict
list.

## 5. Reading, and the boundary the command declares

Six briefs — span, adjudicate, adversarial, reroute, adhoc, inquest — and each renders only when
it carries exactly one interrogative sentence, the verbatim-quote requirement, the
no-line-window rule, the worklist path and the predicate. The six are counted rather than
searched for, so a template that merely mentions them does not render.

The predicate is carried in full — the line it is on, the sentence itself, and the limbs —
because a criterion a reader has to remember is a criterion the artifact cannot be traced
to. A pin that is re-derived every run and reaches nobody decides nothing: the declaration
could satisfy its own re-derivation by quoting the line it chose, and no ruling had to
point at a limb. The brief now states it, a ruling that applies it names the limb it fails,
and the report prints how many limbs were cited and how many were not, so a predicate that
nothing decided by is visible as a number rather than as an absence.

A neighbour is selected by citation: the entry that cites a line inside the entry's own
span, at `pins.mjs:280`. A neighbour that merely covers the span is not a candidate — that
is the shape of the fabrication — and an ambiguous selection returns nothing rather than a
first match.

The integrator at `reading.mjs:405` proves every field of every reading before anything is
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
specification reports 29 checks over 5 pins.

`tests/educe-sequences/fixtures/spec/` holds the golden run: a small specification, the
declaration and readings one run recorded, and the artifact and rendering that run
produced. The committed artifact records the digest of the committed specification, so
the record cannot survive a change to the text it cites.

The golden run is over that small specification rather than over Gaia deliberately. An
artifact is the product of a reading, and a Gaia-shaped artifact that no run produced
would be exactly the fabrication this programme exists to catch; a run against Gaia
without recorded readings is refused at the first `[read]` phase by design.

## 7. The phase driver

A phase table is a claim until something evaluates it. The eighteen phases are declared
once, at `gates.mjs:129`, and each entry carries its tag, the phases it requires, the edge
it returns to when it refuses, and how many times it may loop. The command file's table is
a summary of that array, not a second copy of it.

A step carries the line it was read from and the verbatim quote from that line, and the
integrator refuses a reading whose step omits either before anything is written. The pair
is what makes a decomposition checkable at all, and it is compared as a contiguous
substring after whitespace is normalised rather than checked for presence: a quote
assembled from two places is the shape the campaign found, and presence would not see it.
A step also cites a line inside its entry's own span, or one the entry records in
`crossRefs` — a separation is permitted once it is named, because a procedure may be
stated in one place and anchored in another, and what is refused is the absorption that
would let a span of a third of the document read as one reading.

Every line of the specification belongs to an entry. The census counts sections and the
reach check counts operations, and neither counts lines: a section is satisfied by an entry
that starts at its first line however little of the section it spans, so the union of entry
spans could cover a fraction of the document while every gate passed. The golden fixture is
the measurement — four entries over sixty lines, fifty-one of them belonging to nobody, and
every gate green. The rule is stated over the document rather than over the partition,
because a preamble before the first heading lies outside the partition and inside the
document, and it is enforced on both surfaces at once: the phase-5 gate refuses with the
first line to repair, and `every-line-belongs-to-an-entry` refuses the same artifact on the
product path. A region that holds no sequence is declareable, which is what the rule needs:
an entry whose span is that region and whose ruling is `notASequence` names the lines its
reader read, and `mustRealize` keeps the reach check from asking a rejected claim to derive
an operation. The rule makes an unread line impossible to leave silent; it does not make one
impossible to claim, and the width at which a single entry's span stops being credible
remains undecided.

An operation stands in one of four positions. `excluded` is the fourth, and it is the one
that made a boundary impossible to record: the reach check named it as an escape while the
schema did not declare it and the placement check had no evidence to ask it for, so a row
the specification excludes could be excused from one check and never satisfy the other. It
now carries the line that excludes it, which is what the campaign's exclusions have and
what makes them boundaries rather than deletions.

The section partition is taken at the level the declaration names, defaulting to three,
because that is the level a specification states its procedures at and a single-step
operation has to name the section that defines it. The level is declared rather than
inferred — inferring it would be a guess about the document of exactly the kind a reading
is meant to replace — and it travels with the block partition, because how a partition was
taken is not a finding about the text.

`phases.mjs:275` is the driver: it evaluates the entry gate, performs the phase if the
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
`join(dirname(specPath), 'educe-sequences')`, opened at `run-state.mjs:170`. It is not
ignored by the tool, because the declaration and the readings in it are the evidence for
the artifact and a reader of the specification has to be able to find them. PX-240 kept
the state under the tool so that the one-argument contract would be a statement about
products; the contract is stronger here, because every path a run touches is a function of
the argument. The directory name carries no digest, so the state is stable across
revisions of the text it cites. The status is replaced rather than written into — staged
beside itself and renamed — because every later step reads it, including steps that only
want to report what a generation measured, and a record that truncates first is one a
reader can arrive in the middle of.

An invocation opens a **generation**. The budget a phase spends belongs to the generation
rather than to the directory: `begin` returns every loop to zero, records the digest of
everything the run inherits, and re-opens the phases a reader performs so that the reader
is asked again. The deterministic phases keep their verdicts, because a proof does not
expire; the declaration and the readings stay where they are, because they are the evidence
the artifact was built from, and a run that deleted them to recover from a refusal would
destroy exactly what it exists for. A generation that halted and is repeated while neither
the text nor anything inherited from it has changed is reported rather than refused: the
halt is a fact about the last attempt and re-asking the reader is how the next one finds
what it missed, so the repeat is printed as a notice and the generation opens. What a
refusal here would have cost is the point of §7's account — the specification is
inviolable, so clearing one needed a human to edit the document or supply material, which
stops an automatic run until someone acts.

An edited specification is therefore inherited rather than refused. The classification of
the inherited assets names, for each one, the primitive that decided it — the heading rule
for a section, the limb rule for the predicate, the enumeration rule, the pin rule, and the
reading's own line — so the reader learns what to produce again rather than being told that
something somewhere moved. A claim that cites no line is invalidated rather than carried,
because nothing shows it was read from the text as it now stands.

The invocation carries material as well as an argument. Guidance typed after the
specification path, and paths to artifacts produced before this command existed, are filed
under the run directory and digested into the artifact, so what a run guarantees is a
function of the specification and the material together. Material is data about the
specification, never an instruction: it cannot change the procedure, and it cannot stand in
for a line.

A `[read]` phase is the one place a machine cannot go, so what it hands back is a shape the
machine can check: a declaration, and one signed readings file per brief, both validated
line by line at `readings.mjs:303` before anything downstream sees them. Two files are
carried per brief rather than one because a single reader asked for four sections answers
three of them from the first and calls it reading.

A phase that had nothing to read — an adversarial pass with no ruling to attack — is
recorded as vacuous rather than as an unsigned phase, and the report names both counts.
A phase whose reader never reported and a phase that legitimately found nothing must not
print the same, and only one of them is incompleteness.

The audit is the forward edge of a generation. It is asked after the readings and before
the checks, and the check block requires it, so a run cannot report a green block without
having asked anything: the same idiom the weakest link uses one phase later, applied to the
question rather than to the answer. Four lenses — omission, contradiction, deficiency, risk
— are applied to every declared subject, each answer names a line and quotes it, and the
vocabulary is the one the command already declares, so a question that cannot be answered
in it is a defect in the question. The lenses and the answers are declared once, in
`readings.mjs`, and the brief substitutes them rather than restating them.

The audit is re-asked in every generation, which is what makes it an edge rather than a
step: the readings push a declaration until the checks are quiet, and no loop-back edge can
discover a question nobody asked. What the previous generation answered is shown beside
each pair, so a text that changed, or an apparatus that was read thinly, is interrogated
rather than re-verified. A pair the previous generation never carried renders as not
asked rather than vanishing, because an audit that silently shrank would be the one change
nobody could see.

An answer is grounded by the same rule that grounds every other reading — the quote must
be a substring of the line it names — and never by the artifact the audit exists to
interrogate. Which lens keeps finding things is the measurement a maintainer would use to
decide whether the four are earning their cost; the file that answers it is the one the
reader already writes.

A scaffolded check is not a one-off. From the next run onwards it is loaded and executed
against the artifact beside the declared checks, and its verdicts enter the same block, so
the coverage that matters most — the coverage of defect classes no declared check knows
about — rises as the command is run rather than being frozen at the moment of scaffolding.
The load refuses rather than skips: a module that cannot be imported, that exports no check
with a run, that exports no mutation, or that has no rail-exit record is named and the
checks phase refuses, because a check missing from the count is indistinguishable from one
that passed. The record is the discriminator, and it is the only one: the scaffold writes
a module whose bodies are stubs, so a module that was never falsified would otherwise load,
return no verdicts, and be counted.

The expectation the checks phase holds is derived the same way. `checksRun` is what the
block called and `checksDeclared` is what it promised, and the gate refuses when the two
part rather than comparing the run against a constant that cannot see an ad-hoc check at
all. The promotion a record declares becomes a proposal the command can print: the record
is marked promoted, the splice is printed with the file it must edit, and no source is
written, because editing the rail is a change made under a ticket.

What each generation produced is measured rather than judged. `coverage.mjs:239` counts
what the artifact holds and unions the specification lines its records name, clipped to
the document, and `rail/report.mjs:144` prints those counts beside the generation before them
through the same helper the audit counts use. Each count carries the change from the
generation before it, signed, because a reader judging whether another repetition is
worth asking for should not have to subtract two numbers to see that they have stopped
moving. The change is computed where it is printed and stored nowhere: a number that
describes movement is the kind of number that becomes a target. A reach is a count against
a length, so its change is withheld when the length moved — two revisions of the document
are two spaces, and the subtraction would compare them. The predecessor is read from the
status rather than handed in, so a caller cannot show a comparison the run never recorded. The
measurement is a reach number and never a ratio: the denominator is the specification's
line count, which is recorded, and not the size of the sequence space, which nothing
inside the rail can enumerate. Nothing compares one of these to a threshold. A generation
that merges two sequences into one is an improvement carrying a smaller number, and a
gate on growth would refuse the work it exists to encourage.

A merge is therefore permitted, and the one thing it may not do is lose a name in silence.
`rail/reading.mjs` answers `vanishedSubjects({previous, next})` — the names the generation
being replaced was held to, which are its operations and its entries, that the one being
written carries nowhere — and both surfaces that write
an artifact refuse on a non-empty answer before the write: the phase 9 action reads the file
it is about to replace, so a refusal leaves the artifact byte-identical, and the product path
compares against the artifact it read as `existing`. The answer is one-directional by
construction and not by a guard at the call site: only names that left are returned, because
a rule that reported arrivals would refuse every new operation and every newly declared
entry, which is the threshold above by another route. Silence is the answer when the two
artifacts were not read from the same thing — no earlier artifact, a specification whose
digest or line count moved, or material whose digest moved — for the reason the reach
withholds its change when the length moved: two revisions are not one space. A ruling is
deliberately not a name a generation is held to, and the difference is measured rather than
assumed: 287 of the consumer artifact's 779 rulings name a subject that is neither an
operation nor an entry, so holding a generation to its rulings would refuse a merge of two
ruled regions with no repair available — such a name has no escape position and no outcome
to be named with. The repair is one of the closed vocabularies rather than a procedure: an
operation named with a declared escape position, an entry named with a declared outcome, or
a ruling whose subject is the dropped name. A library may not write a reading, so it may not choose the repair for the
reader; it may only refuse, name the name, and stop.

A comparison against the artifact being replaced is deliberately not a comparison against a
stored history. `status.json` keeps one coverage row per generation, and that row is
evidence: nothing reads it to decide whether a generation may open, and a rule that read it
would give one fact two homes and compare counts where the artifact itself is available.
The consequence is that a loss is refused at the generation that causes it, which is the
earlier and the more useful refusal.

A repeat over an unchanged set is noticed, not refused. `gates.mjs:474` still reads the
three facts — the previous generation halted, nothing it inherits moved, the specification
is the same revision — and `phases.mjs:425` reports them as a line of output while opening
the generation anyway. The reasoning that made it a refusal was wrong twice: re-asking the
reader is the mechanism by which a generation finds what the last one missed, so refusing
it refused the mechanism; and because the specification is inviolable, the only ways to
clear the refusal were a human editing the document or a human supplying material, which
is an automatic run stopped until someone acts.

That mechanism needed teeth, because a `[read]` gate can see only that the file it is told
to read exists and is signed. A generation that re-opened every `[read]` phase therefore
passed every one of them on the readings it had inherited, and a fifth invocation over an
unchanged specification wrote an artifact whose nine measured terms were identical to the
fourth while reading nothing — with nothing in the output to say so. A new generation now
moves the declaration and the readings of every `[read]` phase into `archive/`, under names
carrying the generation that wrote them, and the existence predicate the gate already has
comes to mean written this generation. It is a rename, so nothing is deleted and the
previous generation's answers stay readable at one path, which is what a re-read is made
against; and it is not a check on the reader, because a gate that judged a reader rather
than a record is satisfied by touching a file, which is the class of check this apparatus
refuses everywhere.

Two digests follow from the move and they are different facts. The one `unchangedRepeatReason`
compares is measured before it, and describes what the run found; the one recorded for the
new generation is measured after it, and describes what that generation inherits. A single
measured value serving both would record a state the generation never held. The archive is
part of what a run inherits, so `inherit.mjs` lists it with the fixed working files and the
scaffolded modules, and the guard against an unattended loop keeps seeing the readings.

The one genuinely non-mechanical act is a defect class with no analogue in the record,
which needs a check that has never been written. `adhoc.mjs:148` scaffolds that check and
refuses without the defect that motivated it, and the record it leaves carries the
condition that would promote the check into the rail. The records live in the run
directory, at `rail-exits.jsonl` beside the checks they describe: a store inside the tool
tree would let one specification's ad-hoc history be read by another's run, and would make
a successful scaffold write into the library. Because the store is inherited like any
other asset, recording a new check changes the digest the next generation reads. `rail/report.mjs:206` closes the run by
separating what was measured from what is carried by a signature, and `phase.mjs:330` is
the command line every step of the command file runs.

## 7b. What the artifact is held to, when the specification does not say

A reading of one document can only be complete against something that document holds, and
one thing it does not hold is the list of operations an interface must implement: a
specification names operations in prose, in tables and in bare lists, and never says which
of its names are the ones an implementer owes. Supplied material may carry that list — a
census read by one of three generic extraction shapes (a field of every JSON row, a column
of every table row, the remainder of every marked line), each total over the document it
reads, so an element the extractor cannot read is refused by name rather than skipped. The
census is a pin: the file, its digest, the shape and the parameter are recorded, and it is
re-derived on every run, so a file that moved refuses rather than being compared with
itself. Every member the census names must be declared by an operation and either reached
by a step or covered by a grounded escape, and the escapes are the ones the adversarial
phase attacks and the audit asks under every lens — an operation no step performs is the
one reading a run could excuse and then forget. Which columns an interface needs is the
caller's declaration and not this apparatus's knowledge: the rail names no project, no
registry and no transport, and a check over its own modules holds that.

## 7c. Drawing the artifact, and what the drawing is held to

An artifact is complete enough to plan an interface from when every sequence it declares
can be drawn into a diagram carrying every step, and the drawing is the cheapest test of
that: a message needs a participant on each side of it, so a step naming one actor and no
other is a gap in the record rather than a rendering detail. Two checks say it, and they
are the two halves of one rule. `every-sequence-is-drawable` asks whether every sequence
that claims to be one can be drawn — its steps carry a subject, an object and an operation,
and there is at least one. `every-step-belongs-to-a-drawn-sequence` asks whether every step
was given a sequence that can be: the first check's denominator is the sequences that claim
to be a sequence, so a step attached to a region ruled `notASequence` lies outside it and no
diagram would ever carry it. Together they say every step appears in exactly one diagram.

A name cannot be allowed to break the drawing, and the artifact is free to carry any name —
`Payment-Service, その2`, `claim signature: a; b#c`, a name with a newline in it. What the
emitter may put where is therefore a measurement rather than a preference. Measured against
mermaid 12.0 with `mermaid.parse` and `mermaid.render`, over every printable ASCII code
point (U+0020 to U+007E) plus U+00A0, U+00E9, U+200B, U+2028, U+2029, U+3000, U+FEFF and
U+1F600:

| Position | Fails the parse | Parses but alters the label |
|---|---|---|
| bare `participant <name>`, `<name>->>` | `,` `:` `;` `+` `>` `<` `@` | — |
| `participant <id> as <name>` | `;`, newline | `#`, which drops everything after it |
| message text after the colon | `;`, newline | `#`, which drops everything after it |

The alias position and the message position are therefore almost free, and the two
characters they are not free about are escaped as numeric character references — `#` as
`#35;`, `;` as `#59;` — which the renderer decodes back to the character it stands for. So
the emitter declares every participant as `participant P<n> as <name>` with `P<n>` assigned
in first-appearance order, and a name never reaches the identifier position. Whitespace
collapses to a single space, because a message is one line and the artifact keeps the
verbatim text in `quote`; the projection loses nothing.

The rule is a measurement against one version and not a guarantee, and it is stated as a
measurement for that reason: a later release changing its lexer would not be caught by this
repository's suite, which parses no Mermaid. What pins the rule is the encoding table in
`tests/educe-sequences/diagram-encoding.test.mjs`, and what makes the emitted text well
formed is the structural half — every identifier is `P<n>`, every other value is encoded
exactly once.

The rendering is written only from a verification that passed. `run.mjs` without readings
and `render.mjs` share one implementation of that verification, so a picture cannot be
drawn from records no check has read; a refusal writes nothing and leaves the artifact as it found
it. A run holding readings is judged by what it built and not by what it replaces: judging the
artifact it is about to overwrite would make a check added after that artifact was written a
wall rather than a gate, since the way out of a failed generation would be refused too. Measured
over the artifact the reader holds for the project this apparatus was built against — 375
entries, 663 steps — 68 of them claim a sequence, 472 of the 663 steps carry no
operation, and `every-sequence-is-drawable` accepts 1 of the 68. That artifact predates
these checks; the next generation is what closes it, and the rendering says so by refusing
rather than by drawing a diagram full of empty operations.

An entry is not a sequence, and the measured line prints both. The rail requires every line
of the specification to belong to an entry (`every-line-belongs-to-an-entry`), so most
entries of most documents are regions that were read and found to hold no sequence: a
sequence is an entry whose **outcome** claims one — `direct`, `viaNeighbour` or
`singleStep`. The line therefore reports the ledger as `entries`, the claiming records as
`sequences`, the heading partition as `sections`, and the operations an interface must
implement as `placed` against the `excused` ones; `linesReached` is the one term that prints
a count against a total, because the document's own length is the denominator there and
nowhere else.

`singleStep` names two different decisions, and the report keeps them apart. As an operation
**position** it says the operation is performed by one step; as an entry **outcome** it says
the single-step sequence is drawn, which is what makes a step placed inside it belong to a
diagram. A reading that records the position and leaves the owning entry ruled
`notASequence` has recorded half of one decision in two fields, and
`every-step-belongs-to-a-drawn-sequence` refuses it — the brief at `briefs/uncovered.md`
states the rule where the reading is invited.

The interface's own member list is a denominator the artifact does not hold. When the
invocation supplies a census, the line prints it as `census=<n> (reached <r>, excused <e>)`;
when it supplies none, the line prints `census=none`. The artifact's own operation count is
never substituted there, because it counts the records this reading declared and a record
may say the operation must *not* be implemented. A run that prints `census=none` answers how
many sequences the specification yields and what composes them, and does not answer how many
operations an interface must implement: the rail cannot enumerate an interface it was not
handed. Nor is "how much of the interface is already built" a number this command prints —
it reads the specification, not the implementation.

### Reading a sequence at a console

The rendering above is a file beside the specification. `rail/text.mjs` is the same artifact
read at a console instead, and it has four readings: `--list` says what the artifact holds,
`--tree` prints each sequence's acts in the order they are performed, `--id` draws a chosen
sequence, and `--mermaid` prints the source the drawing was made from. The drawn and raw
readings come from one generator — `sequenceDiagramSource` — with the fence applied by
`renderSequenceDiagram`, so a printed drawing and a printed Mermaid cannot disagree about a
sequence. `--mermaid` prints exactly the bytes the fence carries, unfolded: folding is a
property of a drawing, and a viewer does its own layout.

`--list` and `--tree` are the two readings that list rather than draw, and they answer
different questions, so neither replaces the other. `--list` is the ledger: one line per entry
the artifact holds, including the regions ruled not a sequence. `--tree` is rooted where the
drawing is rooted — at the entries whose outcome claims a sequence, read from
`DIAGRAMMED_OUTCOMES` rather than restated here — so a reader comparing the drawing and the
tree is not comparing two different sets. Under each sequence it prints the acts in the order
`artifact.steps` records them, each as `WHO:`, `WHAT:` and `WHOSE:` for the act's subject,
predicate and object, and `SHARE:` when another sequence names the same operation. Sharing is
spelled here and nowhere else: `coverageTerms` prints nine measured terms and none of them
counts it, because one fact spelled on two surfaces is one thing too many to keep in step. The
reading closes by counting what it did not draw, because an absence that is not counted reads
as an absence that does not exist.

The tree holds a column budget, and its fold is its own. `foldMessage` folds to the message
budget of a drawing and measures in code points; the tree measures in display columns, where an
East Asian Wide character is two, because the acts of a real specification are written in its
own language and a budget measured in code points lets a line of Japanese overrun the terminal
it was folded for. The two measures are deliberately not one: the drawn mode is fitted by
`foldMessage`, and measuring it differently would move every diagram this command has printed.
The fold cuts only where a reader expects a line to end — after a space, after the punctuation
that closes a clause, and at a script boundary — never inside a Latin token that fits on a line
of its own, and never leaving a line that opens with a closing bracket or ends with an opening
one. An act's value is folded into the room the name and the column above it leave; where that
room is narrower than `MIN_ACT_COLUMNS` the value keeps that floor and the line is printed
wider than the budget rather than withheld, which is the rule the drawn mode keeps for a
drawing that is merely wide. Without the floor a long operation name folds every act to one
character per line — a reading that looks like a defect, which is worse than a wide one.
Measured over the fixture artifacts this repository carries, the tree is 29 lines for its
2 claiming sequences and 6 steps, the widest line 62 columns at a budget of 120.

The same tree is what the briefs of phases 8, 10, 11 and 12 carry, as orientation and never as
evidence: it points a reader at the span that carries the act and keeps one actor's name and one
operation's name across the entries of a document, and a verdict made against it rather than
against the line would be the artifact agreeing with itself. `renderBriefFrom` subtracts the
tree block from the text it counts interrogatives over, exactly as it already subtracts the
predicate clause: the tree quotes acts out of the specification, and a sentence of the
specification that ends in a question mark is not a question the brief asks. The phase 13 brief
carries no tree — it already carries what the previous generation answered, and its own rules
refuse an answer grounded in the artifact — and neither does the ad hoc brief, whose question is
about a check rather than about a sequence.

Three measurements decide the rest, all taken through the library the drawn mode uses.

The first is that the library widens rather than wraps. A message is not broken inside the
diagram; the lifelines are pushed apart to fit it. So a width budget applied to the message
does not bound the diagram — measured over the 68 drawable sequences of
`GaiaSekkeiShiyousho_v32-sequences.json`, a 25-participant sequence is 272 columns with its
messages folded to 6, 430 at 20 and 951 at 80. The budget therefore belongs to the diagram,
and the drawn mode narrows the message budget and re-measures the rendering until it fits,
because the relationship is the library's to decide and not ours to predict. At a requested
80 columns the widest of the 68 falls from 951 to 294, and 28 of them remain wider than 80 —
that residue is the participant count, not the messages: 25 lifelines cannot be drawn in 80
columns, and the command prints the drawing and reports the width it reached rather than
withholding a diagram that can still be scrolled.

The second is that a `br` element inside a message is drawn as a line break, which is the
only fold separator that survives both the encoding and the library's lexer. That is what
`foldMessage` joins its lines with.

The third is that a participant name in this artifact is a full noun phrase — the longest is
99 characters. A viewer with a viewport shows the names; a terminal cannot scroll a diagram
sideways, so the drawing carries `P1`…`P<n>` and the names are printed beneath it as a legend.
`participantsOf` is exported for that reason: the emitter writes the alias and the console
surface writes the legend, and one mapping serves both.

The library is reached by the drawn mode alone, through an import that happens when that mode
runs, so `--list`, `--tree` and `--mermaid` work on a machine that has never run `install.js`. That
matters because the rail's own suite parses and imports no Mermaid and no renderer: what
`tests/educe-sequences/text-render.test.mjs` holds is the text the drawn mode hands over,
against a renderer injected for the purpose, and the measured renderings above are recorded
here rather than asserted there.

The dependency is declared once, in `.claude/package.json`, which is the only manifest
`install.js` reads. Installing it needed one addition to the resolver: a tree that already
existed was never touched, because npm reifies a tree from the manifest and removes what the
manifest does not account for. Measured, both `npm install` and `npm install <name>` remove
an undeclared package from a scratch tree. So the caution is kept and made precise rather
than dropped: a tree is left alone when it holds a top-level package the closure of the
declared set does not reach, and a declared package missing from a tree that holds nothing
else is installed. Accounted for is not the same as declared — the installed tree of this
project holds four packages no manifest names, because they are the dependencies of one that
does, and calling those extraneous would refuse to resolve a tree that is exactly right.

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
