---
type: List
id: list/10-shared-contracts-7-transaction-outbox-and-events/1/e95509c5c3e3
phase: contract
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: e95509c5c3e33b36ea3324d1ac504b0811aecbb18de0b205dcb50b57c843647d
source: sources/10-CONTRACTS.md
---
- Repositories MUST be obtained from the `UnitOfWork`, so they share the same
  transaction. The project defines its concrete repository surface; the shared
  contract fixes that the unit of work owns repositories, outbox, and optional
  idempotency.
- Outbox intent is written in the same transaction as the business mutation.
- Publication happens after commit. The relay retries, deduplicates by
  `event_id`, and records terminal failures.
- Irreversible external effects use `ForwardRecover` or `IsolateAndRepair`;
  forced compensation is not required for effects that cannot be undone.
- A crash after commit but before publication leaves the outbox record for the
  relay; no event is lost.
