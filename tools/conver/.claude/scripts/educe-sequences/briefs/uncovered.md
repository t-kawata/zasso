# The census

{{PREDICATE}}

Every operation named below is one an interface is expected to implement, and this run has
not yet accounted for it. For each, read the specification and answer whether a named actor
performs it: if one does, report the operation and the step that performs it, with the line
you read and the quote from that line. If none does, say which escape covers it — a rule
this design supplies where the specification is silent, or an exclusion — and name the line
that says so.

A step may be placed only in an entry whose **outcome** claims a sequence — `direct`,
`viaNeighbour` or `singleStep`. `singleStep` names two different decisions: as an operation
**position** it says this operation is performed by one step, and as an entry **outcome** it
says this single-step sequence is drawn. Reporting a single-step operation therefore means
ruling its entry `outcome: singleStep` as well as recording the operation's
`position: singleStep`; recording one without the other leaves the step hanging off an entry
no diagram carries, and the run refuses it by name. An entry you cannot rule on is
`notASequence`, and a step placed inside one is not recorded at all.

{{QUESTION}}

The worklist is {{WORKLIST_PATH}}.

{{VERBATIM_QUOTE}}

{{NO_LINE_WINDOW}}

What the artifact already reads in this neighbourhood, for orientation and for nothing else.
It is not evidence: the verdict is made against the line you read, quoted and signed.

{{TREE}}
