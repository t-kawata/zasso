---
type: "Reference"
title: "EXEC_ASSETS/compose.tls.json"
description: "Compose overlay for coturn TLS fixtures."
sources: 
  - resource: "EXEC_ASSETS/compose.tls.json"
    id: "exec-asset-compose-tls-json"
    title: "EXEC_ASSETS/compose.tls.json"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/compose.tls.json"
x-asset-sha256: "60f3b844d9e6ece24187175b2292d71f49273770ea7a641b7fd17a538df6e33c"
x-content-sha256: "d04ec480cb1d5e4ccf2b8fb80d2968594429cc2cf57790c338416dd5697a7e7b"
x-requires: 
  - "pages/pre-okf-original/22-coturn-stun-turn-tls"
x-source-span: "1-11"
x-topic: "exec-assets"
---
## EXEC_ASSETS/compose.tls.json

Compose overlay for coturn TLS fixtures.

- role: Reference
- interface: `docker compose -f compose.json -f compose.tls.json`
- governing section: [22. coturn, STUN, TURN, TLS](../pre-okf-original/22-coturn-stun-turn-tls.md)
- asset hash: `60f3b844d9e6ece24187175b2292d71f49273770ea7a641b7fd17a538df6e33c`
- source span: lines 1-11

```json
{
  "services": {
    "turn": {
      "command": [
        "turnserver",
        "-c",
        "/lab-config/coturn-tls.conf"
      ]
    }
  }
}
```

[^exec-asset-compose-tls-json]

[^exec-asset-compose-tls-json]: EXEC_ASSETS/compose.tls.json — lines 1-11.
