---
type: "Reference"
title: "EXEC_ASSETS/config/asterisk/rtp.conf"
description: "Asterisk RTP port range."
sources: 
  - resource: "EXEC_ASSETS/config/asterisk/rtp.conf"
    id: "exec-asset-config-asterisk-rtp-conf"
    title: "EXEC_ASSETS/config/asterisk/rtp.conf"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/config/asterisk/rtp.conf"
x-asset-sha256: "963a0c2e39150d3729e11eeff3643ff1c25933a7b4c448def6d5008ba7523a37"
x-content-sha256: "0e1312d8da5fb13489974c98ecfc7ddfe0359eb0b24f867f6975494cd56b9cf0"
x-requires: 
  - "pages/pre-okf-original/20-asterisk-reference-service-and-sip"
x-source-span: "1-4"
x-topic: "exec-assets"
---
## EXEC_ASSETS/config/asterisk/rtp.conf

Asterisk RTP port range.

- role: Reference
- interface: none
- governing section: [20. Asterisk reference service and SIP](../pre-okf-original/20-asterisk-reference-service-and-sip.md)
- asset hash: `963a0c2e39150d3729e11eeff3643ff1c25933a7b4c448def6d5008ba7523a37`
- source span: lines 1-4

```ini
[general]
rtpstart=10000
rtpend=10199
icesupport=no
```

[^exec-asset-config-asterisk-rtp-conf]

[^exec-asset-config-asterisk-rtp-conf]: EXEC_ASSETS/config/asterisk/rtp.conf — lines 1-4.
