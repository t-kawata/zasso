---
type: Rule
id: CONF-23
phase: conformance
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 358ff1b00f849124d4261d4cc7818657d6b0b191ff842d29a892e98ccd795a68
source: sources/15-RULE-REGISTRY.md
---
| `CONF-23` | P | conformance | CONF | Part III.12 | Protocol-owned resources (WS subscriptions, A2A tasks, MCP sessions) are authorized by the adapter; business resources are not. | V3 test. | cargo test -p <project>-conformance |
