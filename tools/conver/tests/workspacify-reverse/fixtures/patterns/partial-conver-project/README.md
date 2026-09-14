# partial-conver-project — the pattern-3 representative

A subject that was developed with individual conver commands (`/make-ticket`,
`/plan-ticket`, `/start-ticket`, `/review-ticket`, `/resolve-ticket`) and never
through the full four-layer loop. It holds **some** conver artefacts and not the
set, which is exactly what design §1.1 names as pattern 3.

What it carries:

| Path | Why it is here |
|---|---|
| `docs/RFC-AUTH.md` | a design document a single command produced |
| `docs/Tickets.json` | the ledger written beside that document, at the document's own directory rather than at the workspace root |
| `src/auth.rs`, `Cargo.toml` | the project the commands were driving, so the subject is a project and not only a pile of documents |
| everything else | absent — no graph, no Dirs-Tree, no DesignTree, no manifest, no seed |

**This directory represents the pattern, not a project's scale.** A fuller
representative would need a real development history, a real test suite, and
enough directories for a partition to be non-trivial. What the detection reads is
artefact presence, and presence is what this directory exercises. What it does
not exercise is the partition measurement over a large tree.
