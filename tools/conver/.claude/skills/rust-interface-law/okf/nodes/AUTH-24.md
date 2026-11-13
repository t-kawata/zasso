---
type: Rule
id: AUTH-24
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 088f7566718be8deb412aafdc04b9ed96a580d2233b8dcf8a8d53909fa792445
source: sources/15-RULE-REGISTRY.md
---
| `AUTH-24` | C | all | AUTH | Part II | CLI MUST store tokens in an OS-protected store or a `0600` file, never in argv or shell history. | V2 argv scan; V3 test. | negative-auth suite |
