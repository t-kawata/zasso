---
type: "Section"
title: "15. Rollback"
description: "- Every step is additive until the old path is retired."
sources: 
  - resource: "sources/90-MIGRATION.md"
    id: "90-migration-15-rollback"
    title: "15. Rollback"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/90-MIGRATION.md"
x-source-span: "291-308"
---
## 15. Rollback

- Every step is additive until the old path is retired.
- Baseline tests from Step 0 are the rollback oracle.
- The old path stays behind a feature flag or a separate router until the new
  path passes conformance.
- A profile change alone is not a rollback: it does not undo router wiring,
  DB migrations, generated files, or data changes. The rollback procedure must
  include:
  1. the feature flag that selects the old path;
  2. the DB compatibility window (forward and backward);
  3. the generated artifacts to restore;
  4. the data migration reverse or compensation;
  5. the conformance baseline result to compare against.
- Removing the old path is a separate, conformance-backed change.

---

