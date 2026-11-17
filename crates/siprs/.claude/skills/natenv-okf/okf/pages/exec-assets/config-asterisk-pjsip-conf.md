---
type: "Reference"
title: "EXEC_ASSETS/config/asterisk/pjsip.conf"
description: "Asterisk PJSIP transports, endpoints, contacts, and RTP settings."
sources: 
  - resource: "EXEC_ASSETS/config/asterisk/pjsip.conf"
    id: "exec-asset-config-asterisk-pjsip-conf"
    title: "EXEC_ASSETS/config/asterisk/pjsip.conf"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/config/asterisk/pjsip.conf"
x-asset-sha256: "eadbeccf641c59f2695ab473b5fd4d4d311e62a808e398f7aeb9fb8fcf2a0ad3"
x-content-sha256: "c575ac638782e37ea321b4907d7b0ab8f7e964b49aa8f39e0e52b9ca86c2c256"
x-requires: 
  - "pages/pre-okf-original/20-asterisk-reference-service-and-sip"
x-source-span: "1-47"
x-topic: "exec-assets"
---
## EXEC_ASSETS/config/asterisk/pjsip.conf

Asterisk PJSIP transports, endpoints, contacts, and RTP settings.

- role: Reference
- interface: none
- governing section: [20. Asterisk reference service and SIP](../pre-okf-original/20-asterisk-reference-service-and-sip.md)
- asset hash: `eadbeccf641c59f2695ab473b5fd4d4d311e62a808e398f7aeb9fb8fcf2a0ad3`
- source span: lines 1-47

```ini
[global]
type=global
user_agent=closed-wan-test
[transport-udp]
type=transport
protocol=udp
bind=0.0.0.0:5060
[transport-tcp]
type=transport
protocol=tcp
bind=0.0.0.0:5060
[common](!)
type=endpoint
context=lab
disallow=all
allow=ulaw
allow=alaw
direct_media=no
rtp_symmetric=yes
force_rport=yes
rewrite_contact=yes
[1001](common)
auth=auth1001
aors=1001
[auth1001]
type=auth
auth_type=userpass
username=1001
password=lab-1001
[1001]
type=aor
max_contacts=1
remove_existing=yes
qualify_frequency=10
[1002](common)
auth=auth1002
aors=1002
[auth1002]
type=auth
auth_type=userpass
username=1002
password=lab-1002
[1002]
type=aor
max_contacts=1
remove_existing=yes
qualify_frequency=10
```

[^exec-asset-config-asterisk-pjsip-conf]

[^exec-asset-config-asterisk-pjsip-conf]: EXEC_ASSETS/config/asterisk/pjsip.conf — lines 1-47.
