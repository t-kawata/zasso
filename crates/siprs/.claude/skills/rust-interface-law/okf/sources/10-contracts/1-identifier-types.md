---
type: "Section"
title: "1. Identifier Types"
description: "All identifiers are newtypes. Open identifiers provide explicit constructors so"
sources: 
  - resource: "sources/10-CONTRACTS.md"
    id: "10-contracts-1-identifier-types"
    title: "1. Identifier Types"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/10-CONTRACTS.md"
x-source-span: "18-151"
---
## 1. Identifier Types

All identifiers are newtypes. Open identifiers provide explicit constructors so
that other crates do not need private-field access.

```rust
pub type BoxFuture<'a, T> =
    std::pin::Pin<Box<dyn std::future::Future<Output = T> + Send + 'a>>;

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct SubjectId(uuid::Uuid);

impl SubjectId {
    pub const fn from_uuid(value: uuid::Uuid) -> Self { Self(value) }
    pub const fn as_uuid(&self) -> uuid::Uuid { self.0 }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct TenantId(uuid::Uuid);
impl TenantId {
    pub const fn from_uuid(value: uuid::Uuid) -> Self { Self(value) }
    pub const fn as_uuid(&self) -> uuid::Uuid { self.0 }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct SessionId(uuid::Uuid);
#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ActorId(uuid::Uuid);
#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct RequestId(uuid::Uuid);
#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct TraceId(uuid::Uuid);

#[derive(Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct IdempotencyKey(Box<str>);
impl IdempotencyKey {
    pub fn parse(value: impl Into<Box<str>>) -> Result<Self, ContractError>;
    pub fn as_str(&self) -> &str;
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct OperationId(&'static str);
impl OperationId {
    pub const fn new(value: &'static str) -> Self { Self(value) }
    pub const fn as_str(&self) -> &'static str { self.0 }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Scope(&'static str);
impl Scope {
    pub const fn new(value: &'static str) -> Self { Self(value) }
    pub const fn as_str(&self) -> &'static str { self.0 }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Audience(&'static str);
impl Audience {
    pub const fn new(value: &'static str) -> Self { Self(value) }
    pub const fn as_str(&self) -> &'static str { self.0 }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct InterfaceId(&'static str);
impl InterfaceId {
    pub const fn new(value: &'static str) -> Self { Self(value) }
    pub const fn as_str(&self) -> &'static str { self.0 }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ErrorCode(&'static str);
impl ErrorCode {
    pub const fn new(value: &'static str) -> Self { Self(value) }
    pub const fn as_str(&self) -> &'static str { self.0 }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ErrorDomain(&'static str);
impl ErrorDomain {
    pub const fn new(value: &'static str) -> Self { Self(value) }
    pub const fn as_str(&self) -> &'static str { self.0 }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Action(&'static str);
impl Action {
    pub const fn new(value: &'static str) -> Self { Self(value) }
    pub const fn as_str(&self) -> &'static str { self.0 }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct AuthMethod(&'static str);
impl AuthMethod {
    pub const fn new(value: &'static str) -> Self { Self(value) }
    pub const fn as_str(&self) -> &'static str { self.0 }
}

#[derive(Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct TokenId(Box<str>);
impl TokenId {
    pub fn parse(value: impl Into<Box<str>>) -> Result<Self, ContractError>;
    pub fn as_str(&self) -> &str;
}
```

`ScopeSet` is a public, constructible value:

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

`ResourceId` is intentionally open. A project may use a UUID, a content hash, a
composite key, or a string:

```rust
#[derive(Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ResourceId(Box<str>);
impl ResourceId {
    pub fn new(value: impl Into<Box<str>>) -> Self;
    pub fn as_str(&self) -> &str;
}
```

---

