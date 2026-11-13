---
type: Paragraph
id: paragraph/50-project-template-10-implementation-policy-and-templates/1/4978566a9b89
phase: scope
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 4978566a9b89561dfbf22da15159c3a7b6fc32e7aed96a4193030fac91da9cb9
source: sources/50-PROJECT-TEMPLATE.md
---
Each profile pins its interface SDK in `[workspace.dependencies]` with an exact version and an explicit feature set. The chosen values are written to `target/law/effective-policy.json` and hashed.
