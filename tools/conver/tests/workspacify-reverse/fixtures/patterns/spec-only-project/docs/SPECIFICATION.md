# Session service — specification

## 1. Purpose

This document specifies a session service that issues, refreshes and revokes
session tokens for client applications. Nothing described here has been built.
The specification is the whole of the subject: it is written so that the ordinary
forward rotation can partition it and produce an implementation.

## 2. Vocabulary

| Term | Meaning |
|---|---|
| subject | the principal a session belongs to, identified by a stable string |
| credential | the evidence a client presents once, when it asks for a session |
| session | a token, its subject, and the instant it stops being accepted |
| lifetime | the number of seconds a newly issued session is accepted for |
| revocation | ending a session before its lifetime has run out |

## 3. Requirements

### 3.1 Issuing

The service shall issue a session when, and only when, the presented credential
verifies. A session issued from a credential that does not verify is a defect,
not a degraded result, and the service shall report the rejection rather than
returning an anonymous session.

### 3.2 Refreshing

The service shall refresh a session that has not yet stopped being accepted, and
shall refuse to refresh one that has. A refreshed session carries the subject of
the session it was derived from and nothing else of it.

### 3.3 Revoking

The service shall end a session on request. A revoked session shall not be
accepted again, whichever process accepts it.

### 3.4 Acceptance

The service shall accept a session at an instant strictly before the instant it
stops being accepted, and shall refuse it at or after that instant.

## 4. Invariants

1. A session that has been revoked is never accepted, at any instant, by any
   process.
2. Refreshing a session that has stopped being accepted produces no session.
3. The subject of a session never changes over the session's life.
4. Two sessions issued for the same subject at different instants are distinct
   sessions and neither implies the other.
5. Acceptance depends only on the session and the instant, never on the order in
   which sessions were issued or revoked.

## 5. Failure modes

| Mode | The service must |
|---|---|
| the credential does not verify | refuse, and report which credential was refused |
| the session has stopped being accepted | refuse, and report the instant it stopped |
| the session was revoked | refuse, and report that it was revoked rather than that it expired |
| the store holding revocations is unreachable | refuse rather than accept, because acceptance on a missing revocation record is the one failure that cannot be undone |

## 6. Out of scope

- federated identity
- password reset
- the transport the tokens travel over
- how a credential is verified; that question belongs to the credential service

## 7. What would falsify this specification

Each requirement above is stated so that it can be contradicted. A service that
accepts a revoked session falsifies §4.1. A service that returns a session when
refreshing an expired one falsifies §3.2 and §4.2. A service whose acceptance
depends on the order of issue and revocation falsifies §4.5. A service that
refuses every credential falsifies §3.1 in the other direction: the requirement
is that verification decides, not that nothing is ever issued.
