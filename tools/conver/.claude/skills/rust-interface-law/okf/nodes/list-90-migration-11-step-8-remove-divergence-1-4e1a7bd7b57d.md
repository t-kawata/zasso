---
type: List
id: list/90-migration-11-step-8-remove-divergence/1/4e1a7bd7b57d
phase: review
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 4e1a7bd7b57ded9b9341351f8777a11b25e8aaacf0838bfa19c0a2b9dab1255c
source: sources/90-MIGRATION.md
---
- duplicated operation implementations in interfaces;
- raw `Authorization` parsing outside adapters;
- JWT-library imports in core/operation;
- transport types in core/operation;
- ad-hoc error enums in adapters;
- duplicate `VerifiedIdentity`/principal types;
- direct database access from adapters.
