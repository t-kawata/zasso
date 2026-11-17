---
type: "Reference"
title: "EXEC_ASSETS/inventory.example.json"
description: "Inventory schema for nodes, VMs, SSH targets, and credential paths."
sources: 
  - resource: "EXEC_ASSETS/inventory.example.json"
    id: "exec-asset-inventory-example-json"
    title: "EXEC_ASSETS/inventory.example.json"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/inventory.example.json"
x-asset-sha256: "80f884e3798de11aba1b9e1e60a3f1af9d1b98ad676164dfc3ddf17cdcdb776a"
x-content-sha256: "6181b7554e5c0b6db5f478f6c3a5dd8e14cbf239e1e8a384e6562f253c437ed3"
x-requires: 
  - "pages/pre-okf-original/5-control-plane-and-agent-execution"
x-source-span: "1-24"
x-topic: "exec-assets"
---
## EXEC_ASSETS/inventory.example.json

Inventory schema for nodes, VMs, SSH targets, and credential paths.

- role: Reference
- interface: none
- governing section: [5. Control plane and agent execution](../pre-okf-original/5-control-plane-and-agent-execution.md)
- asset hash: `80f884e3798de11aba1b9e1e60a3f1af9d1b98ad676164dfc3ddf17cdcdb776a`
- source span: lines 1-24

```json
{
  "nodes": {
    "infra": {
      "backend": "ssh",
      "target": "lab@192.168.240.2"
    },
    "win-b": {
      "backend": "direct",
      "vm": "wan-b",
      "credential_clixml": "C:\\WanSecrets\\guest.xml"
    },
    "mac-b": {
      "backend": "tart",
      "vm": "wan-b"
    },
    "linux-host": {
      "backend": "local",
      "shell": [
        "/bin/bash",
        "-se"
      ]
    }
  }
}
```

[^exec-asset-inventory-example-json]

[^exec-asset-inventory-example-json]: EXEC_ASSETS/inventory.example.json — lines 1-24.
