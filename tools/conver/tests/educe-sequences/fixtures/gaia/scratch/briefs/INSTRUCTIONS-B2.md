# Task — find the line that DEFINES this operation's act

A previous reader was asked whether the recorded evidence line defines each operation, and answered
for 257 rows. For 20 of them it answered "this line only mentions the operation, and I can find no
line that defines it". That answer is suspect for a specific reason:

**The registry invents most of its operation names.** Only 38 of the 254 operation kind names appear
literally in the specification. So a search for the NAME proves nothing — an operation whose act the
specification states in prose, without ever writing the name, will look undefined to a reader who
searches by name. That is the trap this task exists to avoid.

## Inputs

| path | what |
|---|---|
| /Users/kawata/shyme/gaia/GaiaSekkeiShiyousho_v32.md | the specification (Japanese). The only source of truth. |
| /tmp/seqwork/B-recheck.jsonl | your rows |

Each row carries \`kind\`, \`purpose\`, \`result_object_classes\`, \`required_authority\`,
\`external_dependency_class\`, the \`recorded_evidence\` lines, the \`recorded_defining_section\` where
one was named, and what the previous reader said.

## Per row — search by the ACT, never by the name

Work out what the operation DOES from its \`purpose\` and \`result_object_classes\`. An operation that
produces a \`StorageReceipt\` is defined by the line that says who signs a storage receipt and when.
Then find the line that states that act.

Start with \`recorded_defining_section\` when it is present — the section is named, so read it and find
the sentence. When it is absent, search the specification for the act's vocabulary (the result
object, the actor, the verb) in Japanese and in English.

Classify:

- \`definition\` — you found the line that states the act. Give it as \`defining_line\` and quote it.
- \`no_line\` — having searched for the ACT and not the name, the specification still contains no line
  that states it. Say what you searched for. **This is a real and important finding, not a failure.**
- \`not_an_operation\` — the registry row records something the specification does not treat as an act
  anyone performs (a read, a policy value, a state). Say which, with the line.

Do not accept \`recorded_evidence\` as a definition because the operation's name appears there. A line
that forbids the operation, or lists it among permitted operations, or cites it in a conformance
matrix, states that the operation exists — never what it is.

## Output

Write **only** /tmp/seqwork/out-B-recheck.jsonl, one JSON object per line, one per row:

\`\`\`json
{"kind": "RequestTimeAttestation", "verdict": "definition", "defining_line": 5801,
 "quote": "an exact substring of line 5801", "reason": "why this line states the act"}
\`\`\`

\`\`\`json
{"kind": "RequestTimeAttestation", "verdict": "no_line",
 "searched": "what you searched for", "reason": "what the specification does say about this act"}
\`\`\`

Every row in your batch must appear. Do not edit any repository file. Do not write any other file.

Your final message: a compact table — kind, verdict, defining_line — and nothing else.
