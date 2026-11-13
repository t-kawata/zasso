---
type: List
id: list/10-shared-contracts-6-idempotency/1/dc5e271d5416
phase: contract
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: dc5e271d54166f77f6170e89174d1bc53aaa4f8c753c104e6590c47df84a129c
source: sources/10-CONTRACTS.md
---
- `claim` is atomic. Concurrent claims for the same namespace and key produce
  exactly one `Acquired`; the others receive `InFlight`, `Replay`, or
  `Conflict`.
- `ClaimToken` is the ownership proof. `complete`, `fail`, and `renew` MUST
  reject a stale generation or fencing token. An expired worker that resumes
  after a new owner acquired the work MUST NOT commit a side effect or a
  result.
- `SameTransaction` mode: the dispatcher gives the handler an
  `ExecutionScope` backed by the transaction-bound store. The handler MUST call
  `scope.complete` or `scope.fail` before `uow.commit`. The dispatcher verifies
  `scope.is_completed()`; a handler that commits without completing is a
  protocol violation.
- `External` mode: the dispatcher completes after `execute` and renews the
  lease while the operation is running. A crash after business commit but
  before result storage is recovered by `recover_expired` and the operation's
  declared recovery policy.
- Replay MUST call `Operation::replay_authorize` against the recorded
  `AuthorizationTargetSnapshot`. It MUST NOT re-run `prepare`; delete,
  create, and approve operations would otherwise reject a legitimate retry
  after their own first success.
- External side effects MUST carry the fencing token or provide an equivalent
  deduplication/reconciliation mechanism.
- The request hash uses canonical JSON (RFC 8785 JCS or a declared
  project-equivalent canonicalizer).
