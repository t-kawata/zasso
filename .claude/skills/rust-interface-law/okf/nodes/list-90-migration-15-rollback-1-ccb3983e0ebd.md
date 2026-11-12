---
type: List
id: list/90-migration-15-rollback/1/ccb3983e0ebd
phase: review
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: ccb3983e0ebdc642fded8a9ffd7e4d2c08ece976ed3688b1a470aaf27d3c3cd1
source: docs/archive/IMPLEMENTATION-SPEC/90-MIGRATION.md
---
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
