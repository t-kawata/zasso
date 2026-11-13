---
type: "Section"
title: "10. Implementation Policy and Templates"
description: "Each profile pins its interface SDK in `[workspace.dependencies]` with an exact version and an explicit feature set. The chosen values are written to `target/law/effective-policy.json` and hashed."
sources: 
  - resource: "sources/50-PROJECT-TEMPLATE.md"
    id: "50-project-template-10-implementation-policy-and-templates"
    title: "10. Implementation Policy and Templates"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/50-PROJECT-TEMPLATE.md"
x-source-span: "399-413"
---
## 10. Implementation Policy and Templates

Each profile pins its interface SDK in `[workspace.dependencies]` with an exact version and an explicit feature set. The chosen values are written to `target/law/effective-policy.json` and hashed.

| Profile | Template files |
|---|---|
| rest | `templates/rest/` |
| websocket | `templates/websocket/` |
| cli | `templates/cli/` |
| grpc | `templates/grpc/` |
| mcp | `templates/mcp/` |
| a2a | `templates/a2a/` |

A false profile does not require its template files. A true profile requires the template manifest, implementation template, test template, and `RULE:` annotations.

