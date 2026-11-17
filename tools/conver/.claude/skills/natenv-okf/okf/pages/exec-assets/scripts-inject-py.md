---
type: "Procedure"
title: "EXEC_ASSETS/scripts/inject.py"
description: "Out-of-band UDP injector for NAT filtering tests."
sources: 
  - resource: "EXEC_ASSETS/scripts/inject.py"
    id: "exec-asset-scripts-inject-py"
    title: "EXEC_ASSETS/scripts/inject.py"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/scripts/inject.py"
x-asset-sha256: "c665fd96de3b5846374d2f2fff41d354be12353d75e8f20d803f90e5c46ec5eb"
x-content-sha256: "91570b9ada14d191e0df9ff4b5c1c302dc8182eab523ddf6b5099fb91ccbf713"
x-requires: 
  - "pages/pre-okf-original/24-nat-qualification-and-finite-fixtures"
x-source-span: "1-4"
x-topic: "exec-assets"
---
## EXEC_ASSETS/scripts/inject.py

Out-of-band UDP injector for NAT filtering tests.

- role: Procedure
- interface: `--bind --source-port --target --tag`
- governing section: [24. NAT qualification and finite fixtures](../pre-okf-original/24-nat-qualification-and-finite-fixtures.md)
- asset hash: `c665fd96de3b5846374d2f2fff41d354be12353d75e8f20d803f90e5c46ec5eb`
- source span: lines 1-4

```python
#!/usr/bin/env python3
import argparse,socket,json
p=argparse.ArgumentParser();p.add_argument('--bind',required=True);p.add_argument('--source-port',type=int,required=True);p.add_argument('--target',required=True);p.add_argument('--tag',required=True);a=p.parse_args();host,port=a.target.rsplit(':',1)
s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM);s.bind((a.bind,a.source_port));s.sendto(a.tag.encode(),(host,int(port)));print(json.dumps({'sent':a.tag,'source':[a.bind,a.source_port],'target':[host,int(port)]}));s.close()
```

[^exec-asset-scripts-inject-py]

[^exec-asset-scripts-inject-py]: EXEC_ASSETS/scripts/inject.py — lines 1-4.
