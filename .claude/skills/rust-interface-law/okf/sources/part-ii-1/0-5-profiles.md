---
type: "Section"
title: "0.5 Profiles"
description: "A project declares which profiles it implements:"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-ii-1/0-5-profiles"
    title: "0.5 Profiles"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-ii-1/0-5-profiles"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "471-471"
---
### 0.5 Profiles

A project declares which profiles it implements:

```toml
# RULES-PROFILE.toml
[project]
name = "<project-c>"
spec_version = "0.3.2"

[profiles]
rust = true
rest = true
websocket = true
cli = true
grpc = true
mcp = false
a2a = false

[auth]
jwt = true
sso = "disabled"   # disabled | planned | enabled
local_only = false
```

Profiles are booleans in `[profiles]`. An unimplemented interface is `false`,
not omitted. `sso = "planned"` is allowed only with a target in the project's
`SYSTEM-DESIGN.md`; it is not an implementation.

| Profile | Required |
|---|---|
| `rust` | Yes for every target of this document |
| `rest`, `websocket`, `cli`, `grpc`, `mcp`, `a2a` | Only when implemented |
| `auth-jwt` | Yes |
| `auth-sso` | When SSO is implemented |
| `local-only` | Only for single-process local tools; see AUTH-20 |

An unimplemented interface profile MUST be declared as absent. Silence is not
an absence.

### 0.6 Verification levels

