---
type: Table
id: table/40-conformance-crate-14-sso-regression/1/21193ae43671
phase: conformance
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 21193ae43671f3c3bceb326e95f3f42f7de90c2ff63682d11fd2f29e5b9d5ded
source: docs/archive/IMPLEMENTATION-SPEC/40-CONFORMANCE.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CONF-42 | After SSO is added, existing operation signatures, subject IDs, and business data references are unchanged. | Invariant. | Provider set. | V3 regression test. |
| CONF-43 | An external ID token is rejected as an access token on every interface. | Rejection. | — | V3 test. |
| CONF-44 | An internal access token is rejected as an external ID token. | Rejection. | — | V3 test. |
