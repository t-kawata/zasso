---
type: "Section"
title: "2. `RULES-PROFILE.toml`"
description: "```toml"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-13/2-rules-profile-toml"
    title: "2. `RULES-PROFILE.toml`"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-13/2-rules-profile-toml"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "5747-5747"
---
## 2. `RULES-PROFILE.toml`

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

Profiles are booleans. An unimplemented interface is `false`, not omitted.
`sso = "planned"` is allowed only with a target in `SYSTEM-DESIGN.md`; it is not
an implementation.

---

## 3. Operation Catalog

