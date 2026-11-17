---
type: "Procedure"
title: "EXEC_ASSETS/scripts/outer-relay.py"
description: "macOS host ciphertext relay for WireGuard underlay datagrams."
sources: 
  - resource: "EXEC_ASSETS/scripts/outer-relay.py"
    id: "exec-asset-scripts-outer-relay-py"
    title: "EXEC_ASSETS/scripts/outer-relay.py"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/scripts/outer-relay.py"
x-asset-sha256: "776e6ca02f1b976386caf9a43af69723f8e1397069b0b507bcc9730cbf3de2a5"
x-content-sha256: "c69e4b356a58cf2a85ddfb4e249034514216467428422c5e92143f8efade7ad5"
x-requires: 
  - "pages/pre-okf-original/10-mac-underlay-host-ciphertext-relay"
x-source-span: "1-21"
x-topic: "exec-assets"
---
## EXEC_ASSETS/scripts/outer-relay.py

macOS host ciphertext relay for WireGuard underlay datagrams.

- role: Procedure
- interface: `--bind --infra --allow`
- governing section: [10. Mac underlay: host ciphertext relay](../pre-okf-original/10-mac-underlay-host-ciphertext-relay.md)
- asset hash: `776e6ca02f1b976386caf9a43af69723f8e1397069b0b507bcc9730cbf3de2a5`
- source span: lines 1-21

```python
#!/usr/bin/env python3
"""One native endpoint per port. Forward WireGuard ciphertext, never inner sockets."""
import argparse,ipaddress,selectors,socket,json
p=argparse.ArgumentParser();p.add_argument('--bind',required=True);p.add_argument('--infra',required=True);p.add_argument('--allow',action='append',required=True);a=p.parse_args();nets=[ipaddress.ip_network(n) for n in a.allow];sel=selectors.DefaultSelector()
for port in (51821,51822,51823):
 f=socket.socket(socket.AF_INET,socket.SOCK_DGRAM);f.bind((a.bind,port));f.setblocking(False)
 b=socket.socket(socket.AF_INET,socket.SOCK_DGRAM);b.connect((a.infra,port));b.setblocking(False)
 st={'port':port,'front':f,'back':b,'peer':None};sel.register(f,selectors.EVENT_READ,(st,True));sel.register(b,selectors.EVENT_READ,(st,False))
print(json.dumps({'status':'ready','bind':a.bind,'infra':a.infra,'ports':[51821,51822,51823]}),flush=True)
while True:
 for key,_ in sel.select():
  st,front=key.data
  try:
   if front:
    data,peer=st['front'].recvfrom(65535)
    if not any(ipaddress.ip_address(peer[0]) in n for n in nets):continue
    st['peer']=peer;st['back'].send(data)
   else:
    data=st['back'].recv(65535)
    if st['peer'] is not None:st['front'].sendto(data,st['peer'])
  except OSError as e:print(json.dumps({'port':st['port'],'error':str(e)}),flush=True)
```

[^exec-asset-scripts-outer-relay-py]

[^exec-asset-scripts-outer-relay-py]: EXEC_ASSETS/scripts/outer-relay.py — lines 1-21.
