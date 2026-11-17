# Implementation Leftovers

## Incomplete implementations

None. The shipped tree contains no placeholder body, no empty function, no
commented-out implementation, no mock object, and no suppression attribute.

## Deliberate scope limits

These are design boundaries, not unfinished work.

1. Retrieval, not proof. The skill reports what the specification says, with
   hashes, spans, and trust metadata. It does not certify that the lab commands
   ran on a target machine.
2. Description fallback. Sections that open with a table, a fenced block, or a
   list and have no paragraph use the heading as their description. Inventing
   prose would break the "no synthesized claims" rule.
3. Source-body graph edges. The guide source has no cross-section Markdown
   links outside fenced code, so guide navigation uses directory indexes,
   sibling frontier, `x-requires`, and search. Execution-asset concepts add
   outgoing body links to their governing guide sections.
4. Large sections. Section 7 and section 21 exceed a small context budget.
   Budgeted delivery refuses instead of truncating; the manual teaches
   page-by-page reads.
5. Execution assets are shipped and indexed. `EXEC_ASSETS/` is part of the
   installed tree, and every file has a concept under `pages/exec-assets/`
   with its exact text and SHA-256. The build tooling that regenerates the
   bundle is still not shipped; the installed skill reads, validates, and
   rebuilds its indexes.
6. Build tooling is not shipped. Regenerating the bundle requires the build
   procedure and the canonical verifier on the host; the installed skill only
   reads, validates, and rebuilds its indexes.
