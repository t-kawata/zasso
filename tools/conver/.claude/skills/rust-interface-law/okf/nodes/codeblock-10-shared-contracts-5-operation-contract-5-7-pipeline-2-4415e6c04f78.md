---
type: CodeBlock
id: codeblock/10-shared-contracts-5-operation-contract-5-7-pipeline/2/4415e6c04f78
phase: contract
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 4415e6c04f78b7f4c039483aaf23a0317d99b503c5d0bb72383921a4eaa2eea3
source: docs/archive/IMPLEMENTATION-SPEC/10-CONTRACTS.md
---
```rust
pub enum AuthorizationTarget {
    Resource(std::sync::Arc<dyn ResourceRef>),
    Tenant(TenantId),
    Global,
}

#[derive(Clone)]
pub struct AuthorizationTargetSnapshot {
    pub action: Action,
    pub resource_id: Option<ResourceId>,
    pub tenant: Option<TenantId>,
    pub owner: Option<SubjectId>,
}

#[derive(Clone)]
pub struct ReplayRecord {
    pub request_id: RequestId,
    pub operation: OperationId,
    pub request_hash: [u8; 32],
    pub target: AuthorizationTargetSnapshot,
    pub result: OperationResultBody,
}
```
