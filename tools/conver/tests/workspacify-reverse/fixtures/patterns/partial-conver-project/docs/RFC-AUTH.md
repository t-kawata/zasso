# RFC: authentication

## Goal

Clients authenticate once and receive a session token that the API accepts on
every later request.

## Scope

- issuing a token from a verified credential
- refreshing a token that has not expired
- revoking a token before it expires

## Out of scope

- federated identity
- password reset
