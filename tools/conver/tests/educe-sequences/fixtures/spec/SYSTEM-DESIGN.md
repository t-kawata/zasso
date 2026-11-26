# Settlement Ledger Specification

## 1. Scope

This document specifies the settlement ledger: the record a settlement is written
into, the acts that move it, and the states it may hold.

## 2. The operation predicate

A procedure is a ledger operation only when it effects one of: balance change, acceptance of a signed transfer, opening of a settlement window, acceptance of an external result, finalisation, cancellation, expiry, recovery.

## 3. Row schema

Every ledger row carries exactly the fields: subject, predicate, object, contract.
A row missing any of the four is not a ledger row.

## 4. Operation status

The status of a ledger operation is one of Pending, Settled, Cancelled, Expired, Recovered.
The list is closed: no other status is a ledger status.

## 5. Admission

An operator admits a transfer by reading the signed instruction, verifying the
signature against the issuer key, and writing a Pending row.
Admission is complete when the row exists and the signature verifies.

### 5.1 Rejection

An operator rejects a transfer whose signature does not verify, and writes no row.

## 6. Settlement

A settler settles a pending row by debiting the payer, crediting the payee, and
marking the row Settled. The settler settles only rows that a prior admission wrote.

### 6.1 Partial settlement

An operator marks a row Expired when the settlement window closes before the payee
is credited. The expiry is recorded against the row that admission wrote.

## 7. Cancellation

An operator cancels a pending row by writing a Cancelled row that names the row it
supersedes, so the ledger retains both.

## 8. Recovery

An operator recovers a row whose settlement was interrupted by replaying the
admission, and the replayed row carries the same subject as the interrupted one.

## 9. Supplied rule

The status list in section 4 states at least five members; a ledger implementation
may add a member only by supplying a rule for LedgerStatus that names the line it reads.

## 10. Non-operations

Section 1 describes the document, and section 3 describes a row rather than an act.
Neither is a procedure an operator performs.
