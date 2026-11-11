---
type: Paragraph
id: paragraph/21-operation-crate-7-authorization/1/c05f26a6651e
phase: operation
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: c05f26a6651edd22a632049cdd277961f15e9da40468b5083baedc53ad535474
source: docs/archive/IMPLEMENTATION-SPEC/21-OPERATION.md
---
`AuthorizationTarget` is `Resource`, `Tenant`, or `Global`. `prepare` loads the
resource and passes it to the authorizer. For create operations, the target is
the tenant or global; there is no fabricated resource.
