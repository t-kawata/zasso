---
type: CodeBlock
id: codeblock/10-shared-contracts-5-operation-contract-5-4-streams/1/8c24f3e4be24
phase: contract
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 8c24f3e4be244493e25ca75451d6f10ad8bff9050b8d7a42eb2065474bebf6f0
source: docs/archive/IMPLEMENTATION-SPEC/10-CONTRACTS.md
---
```rust
pub struct RequestStream<T> {
    // The receiving side of an adapter-fed stream.
}

pub struct RequestStreamSender<T> {
    // The adapter's sending side.
}

impl<T> RequestStream<T> {
    pub fn channel(capacity: usize) -> (RequestStreamSender<T>, Self);
    pub fn next(&mut self) -> BoxFuture<'_, Option<Result<T, OperationError>>>;
    pub fn cancel(&mut self) -> BoxFuture<'_, ()>;
    pub fn is_cancelled(&self) -> bool;
}

impl<T> RequestStreamSender<T> {
    pub fn push(&mut self, item: T) -> BoxFuture<'_, Result<(), OperationError>>;
    pub fn close(&mut self) -> BoxFuture<'_, Result<(), OperationError>>;
    pub fn cancel(&mut self) -> BoxFuture<'_, ()>;
}

pub struct ResponseStream<T> {
    // The receiving side consumed by the adapter.
}

pub struct ResponseStreamSender<T> {
    // The operation's sending side.
}

impl<T> ResponseStream<T> {
    pub fn channel(capacity: usize) -> (ResponseStreamSender<T>, Self);
    pub fn next(&mut self) -> BoxFuture<'_, Option<Result<T, OperationError>>>;
    pub fn cancel(&mut self) -> BoxFuture<'_, ()>;
    pub fn backpressure(&self) -> std::time::Duration;
}

impl<T> ResponseStreamSender<T> {
    pub fn push(&mut self, item: T) -> BoxFuture<'_, Result<(), OperationError>>;
    pub fn close(&mut self) -> BoxFuture<'_, Result<(), OperationError>>;
    pub fn fail(&mut self, error: OperationError) -> BoxFuture<'_, Result<(), OperationError>>;
}
```
