---
type: "Reference"
title: "EXEC_ASSETS/config/coturn.conf"
description: "coturn realm, credentials, relay range, and listener configuration."
sources: 
  - resource: "EXEC_ASSETS/config/coturn.conf"
    id: "exec-asset-config-coturn-conf"
    title: "EXEC_ASSETS/config/coturn.conf"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/config/coturn.conf"
x-asset-sha256: "11cb4673d4d77d9e561711ebf271228303596836e2b40c5e3725aeae65149b44"
x-content-sha256: "00e5250b32323821d9a58fc53a4ff2659c9e4423695617e7048d332b0ce6b166"
x-requires: 
  - "pages/pre-okf-original/22-coturn-stun-turn-tls"
x-source-span: "1-15"
x-topic: "exec-assets"
---
## EXEC_ASSETS/config/coturn.conf

coturn realm, credentials, relay range, and listener configuration.

- role: Reference
- interface: none
- governing section: [22. coturn, STUN, TURN, TLS](../pre-okf-original/22-coturn-stun-turn-tls.md)
- asset hash: `11cb4673d4d77d9e561711ebf271228303596836e2b40c5e3725aeae65149b44`
- source span: lines 1-15

```ini
listening-ip=10.77.0.30
relay-ip=10.77.0.30
listening-port=3478
min-port=50000
max-port=50199
fingerprint
lt-cred-mech
realm=lab
user=lab:lab-secret
no-cli
no-tls
no-dtls
log-file=stdout
simple-log
verbose
```

[^exec-asset-config-coturn-conf]

[^exec-asset-config-coturn-conf]: EXEC_ASSETS/config/coturn.conf — lines 1-15.
