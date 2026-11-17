---
type: "Procedure"
title: "EXEC_ASSETS/scripts/fixture.py"
description: "Generate an nftables finite NAT mapping fixture."
sources: 
  - resource: "EXEC_ASSETS/scripts/fixture.py"
    id: "exec-asset-scripts-fixture-py"
    title: "EXEC_ASSETS/scripts/fixture.py"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/scripts/fixture.py"
x-asset-sha256: "4faa80581efc790c4350c1a5c3c64f6ccdedad0ab5ff817a4c68872d80d3752a"
x-content-sha256: "b8a710cb47984170c1d11ee0ceca659051ab054f4b2c48c44bdfd0fc57273c68"
x-requires: 
  - "pages/pre-okf-original/24-nat-qualification-and-finite-fixtures"
x-source-span: "1-15"
x-topic: "exec-assets"
---
## EXEC_ASSETS/scripts/fixture.py

Generate an nftables finite NAT mapping fixture.

- role: Procedure
- interface: `eim|apdm <config>`
- governing section: [24. NAT qualification and finite fixtures](../pre-okf-original/24-nat-qualification-and-finite-fixtures.md)
- asset hash: `4faa80581efc790c4350c1a5c3c64f6ccdedad0ab5ff817a4c68872d80d3752a`
- source span: lines 1-15

```python
#!/usr/bin/env python3
"""Finite EIM/APDM mapping fixture; arbitrary dynamic-port applications unsupported."""
import argparse,json,ipaddress
p=argparse.ArgumentParser();p.add_argument('mode',choices=['eim','apdm']);p.add_argument('config');a=p.parse_args();cfg=json.load(open(a.config));wan=str(ipaddress.IPv4Address(cfg['wan']));cidr=str(ipaddress.IPv4Network(cfg['client_cidr']));slots={};rules=[];seen=set()
for f in cfg['flows']:
 src=str(ipaddress.IPv4Address(f['src']));dst=str(ipaddress.IPv4Address(f['dst']));sp=int(f['sport']);dp=int(f['dport']);assert 0<sp<65536 and 0<dp<65536
 flow=(src,sp,dst,dp);assert flow not in seen;seen.add(flow);key=(src,sp) if a.mode=='eim' else flow
 if key not in slots:slots[key]=44000+len(slots)
 assert slots[key]<65000
 rules.append(f'ip saddr {src} udp sport {sp} ip daddr {dst} udp dport {dp} counter snat to {wan}:{slots[key]}')
print('table ip fixture_nat { chain post { type nat hook postrouting priority 90; policy accept;')
for r in rules:print(r)
print('} }');print('table inet fixture_allow { chain forward { type filter hook forward priority -10; policy accept; ct state established,related accept')
for src,sp,dst,dp in sorted(seen):print(f'ip saddr {src} udp sport {sp} ip daddr {dst} udp dport {dp} accept')
print(f'ip saddr {cidr} meta l4proto udp counter drop');print('} }')
```

[^exec-asset-scripts-fixture-py]

[^exec-asset-scripts-fixture-py]: EXEC_ASSETS/scripts/fixture.py — lines 1-15.
