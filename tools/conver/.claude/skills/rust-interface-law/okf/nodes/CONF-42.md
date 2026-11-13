---
type: Rule
id: CONF-42
phase: conformance
delivery: must
applies_to: all
requires: []
references: []
content_sha256: da9f6f3be707972bc946bfaaa0eceaf7ed269f8c423820af9c6a092fa4cef6a1
source: sources/15-RULE-REGISTRY.md
---
| `CONF-42` | P | conformance | CONF | Part III.12 | After SSO is added, existing operation signatures, subject IDs, and business data references are unchanged. | V3 regression test. | cargo test -p <project>-conformance |
