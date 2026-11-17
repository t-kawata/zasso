---
type: "Reference"
title: "EXEC_ASSETS/README.md"
description: "Execution-asset overview and the seven-step run order."
sources: 
  - resource: "EXEC_ASSETS/README.md"
    id: "exec-asset-readme-md"
    title: "EXEC_ASSETS/README.md"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/README.md"
x-asset-sha256: "2fcd1d68ab9beecefcb2db55715f79a5436a615fba0a9bb980c826cc0ee472ca"
x-content-sha256: "4da066350d4939fc6a9f1e994d75fd3b18b98c5d2d14998c05ea59ec5369dab4"
x-requires: 
  - "pages/pre-okf-original/0-execution-contract"
x-source-span: "1-15"
x-topic: "exec-assets"
---
## EXEC_ASSETS/README.md

Execution-asset overview and the seven-step run order.

- role: Reference
- interface: none
- governing section: [0. Execution contract](../pre-okf-original/0-execution-contract.md)
- asset hash: `2fcd1d68ab9beecefcb2db55715f79a5436a615fba0a9bb980c826cc0ee472ca`
- source span: lines 1-15

```markdown
# Native-OS WAN/NAT/VoIP/P2P execution assets

The separate English guide is the sole operational specification. This archive contains current executable/configuration assets only. No OS images, credentials, generated keys, product binaries, historical documentation, or alternate implementation generations.

1. Read the guide; choose OS backend, media/template and address plan.
2. Run bootstrap for host and Ubuntu infrastructure; provision same-OS guests.
3. On Ubuntu: python3 generate.py --endpoint <reachable-underlay-IP> --variant single
4. ./lab config; ./lab build; ./lab up; python3 doctor.py
5. Distribute private/a.conf, b.conf, s.conf to distinct native nodes; activate tunnels.
6. Run probe, cut/recovery, then actual product scenarios.
7. Stop products/captures, collect, disable tunnels, ./lab down, stop VMs.

Mac default NAT: host scripts/outer-relay.py carries WireGuard ciphertext when guests cannot reach the infrastructure directly. Preserve OOB management.

bootstrap scripts automate their stated stages, not proprietary OS media acquisition or unknown product dependencies. validate.py is static-only; doctor.py is infrastructure CLI-only. Neither implies native path/product acceptance.
```

[^exec-asset-readme-md]

[^exec-asset-readme-md]: EXEC_ASSETS/README.md — lines 1-15.
