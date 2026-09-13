# spec-only-project — the pattern-4 representative

A subject that is **empty, plus a long specification document**. Nothing has been
implemented, so nothing has to be reconstructed, and design §1.1's entry point
for this pattern is `workspacify-tree` with no reverse rotation.

What it carries:

| Path | Why it is here |
|---|---|
| `docs/SPECIFICATION.md` | the long specification, above the detection's declared threshold |
| everything else | absent — no source, no build manifest, no conver artefact of any kind |

**This directory represents the pattern, not a project's scale.** A fuller
representative would need a real specification with a real history behind it and
enough structure for the forward rotation to partition. What the detection reads
is artefact presence and the shape of the subject — a specification and no
implementation — and that is what this directory exercises.
