---
type: CodeBlock
id: codeblock/50-project-template-2-rules-profile-toml/1/f9fc26c407b3
phase: scope
delivery: must
applies_to: all
requires: []
references: []
content_sha256: f9fc26c407b3bdbcbdcbece547e0f258c39f19642a9607365b5268cedfb622e1
source: docs/archive/IMPLEMENTATION-SPEC/50-PROJECT-TEMPLATE.md
---
```toml
[project]
name = "<project-c>"
spec_version = "0.3.2"

[profiles]
rust = true
rest = true
websocket = true
cli = true
grpc = true
mcp = true
a2a = true

[auth]
jwt = true
sso = "disabled"   # disabled | planned | enabled
local_only = false

[docs]
generate = true    # MUST be true for every project
english = true     # MUST be true
out_dir = "docs/generated"

[roles]
# Additional, non-runtime roles. Dependency edges still obey ARC-02..ARC-08.
tooling = []
test-support = ["<project>-core", "<project>-operation"]
build-support = []
```
