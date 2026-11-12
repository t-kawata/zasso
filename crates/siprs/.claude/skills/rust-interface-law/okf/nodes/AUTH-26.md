---
type: Rule
id: AUTH-26
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 34bb783985ec7d680bd80b4d24304c153d740c1a484ef8ddca044b6dad06f249
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `AUTH-26` | C | all | AUTH | Part II | MCP MUST implement the authentication discovery/challenge required by the adopted MCP specification, and MUST NOT pass a received token through to a downstream API. | V3 protocol test. | negative-auth suite |
