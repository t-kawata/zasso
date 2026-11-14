# Implementation Leftovers

## Incomplete implementations

None. The shipped tree contains no placeholder body, no empty function, no
commented-out implementation, no mock object, and no suppression attribute.

## Deliberate scope limits

These are design boundaries, not unfinished work.

1. Retrieval, not proof. The skill reports what the source says, with hashes,
   spans, and trust metadata. It does not certify that the handbook's lab
   commands ran.
2. Description fallback. Sections that open with a fenced block and have no
   paragraph use the heading as their description. Inventing prose would
   break the "no synthesized claims" rule.
3. No invented graph edges. The source has no cross-section Markdown links
   outside fenced code, so the concept graph has no body edges. Directory
   indexes, sibling frontier, and search carry navigation instead.
4. Appendix scale. The appendix of exact source files is one large concept.
   Budgeted delivery of the whole appendix can exceed a small budget; the CLI
   refuses instead of truncating, and the manual teaches page-by-page reads.
5. Build tooling is not shipped. Regenerating the bundle requires the build
   scripts and the canonical verifier on the host; the installed skill only
   reads, validates, and rebuilds its indexes.
