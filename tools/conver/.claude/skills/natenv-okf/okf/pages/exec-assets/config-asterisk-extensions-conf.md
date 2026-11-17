---
type: "Reference"
title: "EXEC_ASSETS/config/asterisk/extensions.conf"
description: "Asterisk dialplan for endpoints 1001/1002 and the echo extension."
sources: 
  - resource: "EXEC_ASSETS/config/asterisk/extensions.conf"
    id: "exec-asset-config-asterisk-extensions-conf"
    title: "EXEC_ASSETS/config/asterisk/extensions.conf"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/config/asterisk/extensions.conf"
x-asset-sha256: "c224c793cf000cbaff674f8c5d84d47b96ce0c0bfde11993d66c541386cf5332"
x-content-sha256: "56706da58d8efb64da2b6b3ec90c4578290145fa4d30c04cb9302085ce14045f"
x-requires: 
  - "pages/pre-okf-original/20-asterisk-reference-service-and-sip"
x-source-span: "1-9"
x-topic: "exec-assets"
---
## EXEC_ASSETS/config/asterisk/extensions.conf

Asterisk dialplan for endpoints 1001/1002 and the echo extension.

- role: Reference
- interface: none
- governing section: [20. Asterisk reference service and SIP](../pre-okf-original/20-asterisk-reference-service-and-sip.md)
- asset hash: `c224c793cf000cbaff674f8c5d84d47b96ce0c0bfde11993d66c541386cf5332`
- source span: lines 1-9

```ini
[general]
static=yes
writeprotect=yes
[lab]
exten => _100[12],1,Dial(PJSIP/${EXTEN},45)
 same => n,Hangup()
exten => 600,1,Answer()
 same => n,Echo()
 same => n,Hangup()
```

[^exec-asset-config-asterisk-extensions-conf]

[^exec-asset-config-asterisk-extensions-conf]: EXEC_ASSETS/config/asterisk/extensions.conf — lines 1-9.
