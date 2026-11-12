---
type: CodeBlock
id: codeblock/10-shared-contracts-1-identifier-types/2/3c3b1fbca372
phase: contract
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 3c3b1fbca37231e7342a6232973b819b2426c40a88c49b50cb885c8cbdcdb963
source: docs/archive/IMPLEMENTATION-SPEC/10-CONTRACTS.md
---
```rust
#[derive(Clone, Default, PartialEq, Eq)]
pub struct ScopeSet(Vec<Scope>);

impl ScopeSet {
    pub fn new() -> Self;
    pub fn from_scopes(scopes: impl IntoIterator<Item = Scope>) -> Self;
    pub fn insert(&mut self, scope: Scope) -> bool;
    pub fn contains(&self, scope: Scope) -> bool;
    pub fn iter(&self) -> impl Iterator<Item = Scope> + '_;
    pub fn is_subset_of(&self, parent: &ScopeSet) -> bool;
}
```
