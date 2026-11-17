---
type: "Reference"
title: "EXEC_ASSETS/config/fixture.json"
description: "Finite NAT mapping and filtering fixture parameters."
sources: 
  - resource: "EXEC_ASSETS/config/fixture.json"
    id: "exec-asset-config-fixture-json"
    title: "EXEC_ASSETS/config/fixture.json"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/config/fixture.json"
x-asset-sha256: "cd5d8a6d827aedf4a06828bc80c99a99c56e64b3c0e8a966a1b050ef8849dd2a"
x-content-sha256: "2368b7fde5d3d3c19617576bac5417519db649232532375bfa4e26d8879858bd"
x-requires: 
  - "pages/pre-okf-original/24-nat-qualification-and-finite-fixtures"
x-source-span: "1-24"
x-topic: "exec-assets"
---
## EXEC_ASSETS/config/fixture.json

Finite NAT mapping and filtering fixture parameters.

- role: Reference
- interface: none
- governing section: [24. NAT qualification and finite fixtures](../pre-okf-original/24-nat-qualification-and-finite-fixtures.md)
- asset hash: `cd5d8a6d827aedf4a06828bc80c99a99c56e64b3c0e8a966a1b050ef8849dd2a`
- source span: lines 1-24

```json
{
  "wan": "10.77.0.2",
  "client_cidr": "10.78.1.0/24",
  "flows": [
    {
      "src": "10.78.1.10",
      "sport": 42000,
      "dst": "10.77.0.20",
      "dport": 9000
    },
    {
      "src": "10.78.1.10",
      "sport": 42000,
      "dst": "10.77.0.20",
      "dport": 9001
    },
    {
      "src": "10.78.1.10",
      "sport": 42000,
      "dst": "10.77.0.21",
      "dport": 9000
    }
  ]
}
```

[^exec-asset-config-fixture-json]

[^exec-asset-config-fixture-json]: EXEC_ASSETS/config/fixture.json — lines 1-24.
