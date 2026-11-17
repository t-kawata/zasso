---
type: "Reference"
title: "EXEC_ASSETS/compose.timeout.json"
description: "Compose overlay for UDP conntrack timeout experiments."
sources: 
  - resource: "EXEC_ASSETS/compose.timeout.json"
    id: "exec-asset-compose-timeout-json"
    title: "EXEC_ASSETS/compose.timeout.json"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/compose.timeout.json"
x-asset-sha256: "2328ad9d9d58218a0139cb4739d4abb155502418e5509afb14ae436cbf2b8111"
x-content-sha256: "cb23af4716c75082706b7c2c2d7bdacf105ef6a99aa08c5ab942dc10dbb7d432"
x-requires: 
  - "pages/pre-okf-original/25-fault-injection-timeouts-recovery"
x-source-span: "1-10"
x-topic: "exec-assets"
---
## EXEC_ASSETS/compose.timeout.json

Compose overlay for UDP conntrack timeout experiments.

- role: Reference
- interface: `docker compose -f compose.json -f compose.timeout.json`
- governing section: [25. Fault injection, timeouts, recovery](../pre-okf-original/25-fault-injection-timeouts-recovery.md)
- asset hash: `2328ad9d9d58218a0139cb4739d4abb155502418e5509afb14ae436cbf2b8111`
- source span: lines 1-10

```json
{
  "services": {
    "ra": {
      "sysctls": {
        "net.netfilter.nf_conntrack_udp_timeout": "10",
        "net.netfilter.nf_conntrack_udp_timeout_stream": "10"
      }
    }
  }
}
```

[^exec-asset-compose-timeout-json]

[^exec-asset-compose-timeout-json]: EXEC_ASSETS/compose.timeout.json — lines 1-10.
