---
type: "Page"
title: "13. Native firewall and cooperative routing contract"
description: "Every SUT binds assigned inner IP. All product bootstrap/relay/candidate configuration references lab services. Disable public discovery/PKARR/mDNS/public relays unless specifically under test. Test"
sources: 
  - resource: "sources/pre-okf-original.md"
    id: "pre-okf-original-15"
    title: "13. Native firewall and cooperative routing contract"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-content-sha256: "786c22c2d872964d8bc94703cf35a5b3bd6cc4299eae38358c5bea08704968eb"
x-requires: 
  - "pages/pre-okf-original/12-native-tunnels"
x-source-alias: "sources/pre-okf-original.md"
x-source-span: "418-432"
x-topic: "pre-okf-original"
---
## 13. Native firewall and cooperative routing contract

Every SUT binds assigned inner IP. All product bootstrap/relay/candidate configuration references lab services. Disable public discovery/PKARR/mDNS/public relays unless specifically under test. Test mode must expose this configuration; if absent, implement small adapter rather than invent a CLI flag.

Windows listener rules example on S:
```powershell
New-NetFirewallRule -Name WanProbeUDP -DisplayName WanProbeUDP -Direction Inbound -Action Allow -Protocol UDP -LocalAddress 10.79.0.10 -LocalPort 9000 -RemoteAddress 10.77.0.0/16,10.78.0.0/16,10.79.0.0/24
New-NetFirewallRule -Name WanProbeTCP -DisplayName WanProbeTCP -Direction Inbound -Action Allow -Protocol TCP -LocalAddress 10.79.0.10 -LocalPort 9000 -RemoteAddress 10.77.0.0/16,10.78.0.0/16,10.79.0.0/24
```
Add actual product/RTP ports and executable constraints as needed. Remove rules by exact Name afterward. Do not disable Windows firewall globally. Windows explicit-block precedence means a blanket program deny plus narrower allow may not implement intended policy; test targeted policy on dedicated guest.

Mac Application Firewall/TCC may affect server/device access. Prepare signed binary permissions/test-media mode; do not flush all pf rules or change personal-host security globally. Stronger confinement: dedicated guest, remove IP management NIC after preparation, retain OOB guest agent, single test tunnel interface. Cooperative host-node routing is not hostile-process sandboxing; state scope honestly.

Loopback IPC between agent and local product may be valid control, but peer payload must not use localhost/host management IP. Candidate enumeration must not publish another node's management subnet as a permitted shortcut. Record rejected candidates and unexpected egress attempts.

[^pre-okf-original-15]

[^pre-okf-original-15]: 13. Native firewall and cooperative routing contract — sources/pre-okf-original.md, lines 418-432.

