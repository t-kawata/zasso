---
type: "Section"
title: "5.4 Streams"
description: "```rust"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-2/5-4-streams"
    title: "5.4 Streams"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-2/5-4-streams"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "1986-1986"
---
### 5.4 Streams

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

Stream semantics are fixed:

- `None` from `next` means normal EOF.
- `Some(Err(_))` means abnormal termination.
- `cancel` is idempotent and must release resources.
- Backpressure is explicit; the producer must not buffer unboundedly.
- The dispatcher owns cancellation propagation from the interface to the
  operation.

### 5.5 Erased registry

