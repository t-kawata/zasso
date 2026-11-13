---
type: List
id: list/90-migration-3-step-0-pin-the-rules-and-record-the-baseline/1/0a76ddee7b8e
phase: review
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 0a76ddee7b8e5058198670306b9aee150c6bf203399c43dd16d39a9b6aa1960f
source: sources/90-MIGRATION.md
---
1. Add `RULES-PROFILE.toml` with `spec_version`.
2. Declare implemented interfaces; mark the rest `false`.
3. Record baseline behavior tests for every operation that will be migrated.
   The baseline covers success, failure, authorization, and state change.
4. Record the current state as the migration baseline.
5. Do not change behavior in this step.
