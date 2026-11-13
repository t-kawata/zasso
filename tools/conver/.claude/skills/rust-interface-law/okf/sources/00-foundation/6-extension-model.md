---
type: "Section"
title: "6. Extension Model"
description: "1. Add the operation to the catalog with the §11 template."
sources: 
  - resource: "sources/00-FOUNDATION.md"
    id: "00-foundation-6-extension-model"
    title: "6. Extension Model"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/00-FOUNDATION.md"
x-source-span: "130-206"
---
## 6. Extension Model

### 6.1 Add an operation

1. Add the operation to the catalog with the §11 template.
2. Generate the handler skeleton and interface bindings.
3. Implement `Operation::execute` in `*-operation`.
4. Add authorization inside the handler.
5. Add conformance cases (normal, failure, authorization).
6. Regenerate the interface bindings and matrix.

No shared contract changes.

### 6.2 Add a scope

1. Declare the `Scope` constant.
2. Add it to the authorization policy.
3. Add a conformance case for allowed and denied access.

No adapter changes.

### 6.3 Add an error code

1. Add the `ErrorCode` constant.
2. Map it to an existing protocol category.
3. Add mapping tests for every implemented interface.

No change to `OperationError` or the category table.

### 6.4 Add an auth method

1. Implement `CredentialVerifier`.
2. Resolve the internal `SubjectId`.
3. Call the existing `TokenIssuer`.
4. Add conformance cases for success, failure, and audience.

No change to operations or `VerifiedIdentity`.

### 6.5 Add an SSO provider

1. Implement `SsoProvider` in `identity-sso`.
2. Verify the external token inside the provider.
3. Resolve `(issuer, subject)` through `ExternalIdentityRepository`.
4. Call `TokenIssuer` with the internal subject.
5. Add regression tests proving existing operations are unchanged.

No change to business tables or operations.

### 6.6 Add an interface

1. Implement `InterfaceDriver` for the new protocol.
2. Add an `InterfaceId` constant and an audience value.
3. Bind every applicable operation through generated entries.
4. Extend the conformance matrix.
5. Declare the profile in `RULES-PROFILE.toml`.

No change to operations.

### 6.7 Add a streaming mode

1. Declare the mode in the operation catalog.
2. Implement the corresponding stream driver.
3. Define EOF, error, cancellation, and backpressure.
4. Add cross-interface streaming conformance.

Existing operations are unaffected.

### 6.8 Add storage

1. Implement the core ports.
2. Keep the domain and operation contracts unchanged.
3. Add persistence conformance tests.

No contract change.

---

