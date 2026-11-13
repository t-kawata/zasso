---
type: CodeBlock
id: codeblock/50-project-template-4-schema-source/2/977adab2bca0
phase: scope
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 977adab2bca07e5057afbf696ed987249d3243ea311f8182cd132f2d24712c2a
source: sources/50-PROJECT-TEMPLATE.md
---
```toml
# contract/proto-field-ledger.toml
[[message]]
name = "AccountAddRequest"
[[message.field]]
name = "context"
tag = 1
type = "Context"
[[message.field]]
name = "name"
tag = 2
type = "string"
optional = true

[[message.reserved]]
name = "AccountAddRequest"
tags = [7, 8]
names = ["legacy_email"]
```
