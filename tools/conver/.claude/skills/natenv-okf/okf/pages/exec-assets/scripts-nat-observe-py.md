---
type: "Procedure"
title: "EXEC_ASSETS/scripts/nat-observe.py"
description: "Observe NAT mapping from one preserved UDP socket."
sources: 
  - resource: "EXEC_ASSETS/scripts/nat-observe.py"
    id: "exec-asset-scripts-nat-observe-py"
    title: "EXEC_ASSETS/scripts/nat-observe.py"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/scripts/nat-observe.py"
x-asset-sha256: "901f069be9072e9165e7f85655fb4284cb7222a5e83f0de7b500349c9712df0e"
x-content-sha256: "938f22072c7d8a530527e441d0134c568f8d9dd068611fd08d38c4702452079c"
x-requires: 
  - "pages/pre-okf-original/24-nat-qualification-and-finite-fixtures"
x-source-span: "1-14"
x-topic: "exec-assets"
---
## EXEC_ASSETS/scripts/nat-observe.py

Observe NAT mapping from one preserved UDP socket.

- role: Procedure
- interface: `--bind --source-port --destination ... --listen-seconds`
- governing section: [24. NAT qualification and finite fixtures](../pre-okf-original/24-nat-qualification-and-finite-fixtures.md)
- asset hash: `901f069be9072e9165e7f85655fb4284cb7222a5e83f0de7b500349c9712df0e`
- source span: lines 1-14

```python
#!/usr/bin/env python3
import argparse,socket,json,time
p=argparse.ArgumentParser();p.add_argument('--bind',required=True);p.add_argument('--source-port',type=int,default=42000);p.add_argument('--destination',action='append',required=True);p.add_argument('--listen-seconds',type=float,default=0);a=p.parse_args()
s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM);s.bind((a.bind,a.source_port));s.settimeout(3);obs=[]
for i,d in enumerate(a.destination):
 host,port=d.rsplit(':',1);payload=('same-socket-%d'%i).encode();s.sendto(payload,(host,int(port)));raw,peer=s.recvfrom(65535);r=json.loads(raw);assert bytes.fromhex(r['payload'])==payload;obs.append({'destination':d,'observed':r['peer']})
print(json.dumps({'event':'mapping','socket_preserved':True,'observations':obs,'filtering':'NOT_QUALIFIED'}),flush=True)
if a.listen_seconds:
 deadline=time.monotonic()+a.listen_seconds
 while time.monotonic()<deadline:
  s.settimeout(max(.01,deadline-time.monotonic()))
  try:b,peer=s.recvfrom(65535);print(json.dumps({'event':'injection_received','peer':peer,'payload':b.hex()}),flush=True)
  except socket.timeout:break
s.close()
```

[^exec-asset-scripts-nat-observe-py]

[^exec-asset-scripts-nat-observe-py]: EXEC_ASSETS/scripts/nat-observe.py — lines 1-14.
