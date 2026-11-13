---
type: CodeBlock
id: codeblock/10-shared-contracts-1-identifier-types/1/b726716eec16
phase: contract
delivery: must
applies_to: all
requires: []
references: []
content_sha256: b726716eec162f2ec7fb22f260e586db4238163e827a7a1df4a4810fe18d07e9
source: sources/10-CONTRACTS.md
---
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
