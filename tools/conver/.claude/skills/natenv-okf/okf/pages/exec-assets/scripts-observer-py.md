---
type: "Procedure"
title: "EXEC_ASSETS/scripts/observer.py"
description: "UDP/TCP echo and data observer on ports 9000/9001."
sources: 
  - resource: "EXEC_ASSETS/scripts/observer.py"
    id: "exec-asset-scripts-observer-py"
    title: "EXEC_ASSETS/scripts/observer.py"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/scripts/observer.py"
x-asset-sha256: "e1024bb2879cd53ca32a49342388238a826614a947fce7ed091783bec48a2d94"
x-content-sha256: "e6684d10354ad1ce4bcad06654dea24815430f49b77a77c2f7941366f8178bba"
x-requires: 
  - "pages/pre-okf-original/15-minimum-path-acceptance"
x-source-span: "1-22"
x-topic: "exec-assets"
---
## EXEC_ASSETS/scripts/observer.py

UDP/TCP echo and data observer on ports 9000/9001.

- role: Procedure
- interface: `--bind`
- governing section: [15. Minimum path acceptance](../pre-okf-original/15-minimum-path-acceptance.md)
- asset hash: `e1024bb2879cd53ca32a49342388238a826614a947fce7ed091783bec48a2d94`
- source span: lines 1-22

```python
#!/usr/bin/env python3
import argparse,socket,threading,json
p=argparse.ArgumentParser();p.add_argument('--bind',required=True);a=p.parse_args();sockets=[]
for port in (9000,9001):
 for typ in (socket.SOCK_DGRAM,socket.SOCK_STREAM):
  s=socket.socket(socket.AF_INET,typ);s.bind((a.bind,port));sockets.append((s,typ))
def udp(s):
 while True:
  b,peer=s.recvfrom(65535);s.sendto(json.dumps({'peer':list(peer),'payload':b.hex()}).encode(),peer)
def tcp(s):
 s.listen()
 def echo(c):
  with c:
   while True:
    b=c.recv(65536)
    if not b:return
    c.sendall(b)
 while True:
  c,_=s.accept();threading.Thread(target=echo,args=(c,),daemon=True).start()
for s,typ in sockets:threading.Thread(target=udp if typ==socket.SOCK_DGRAM else tcp,args=(s,),daemon=True).start()
print(json.dumps({'ready':True,'bind':a.bind,'ports':[9000,9001]}),flush=True)
threading.Event().wait()
```

[^exec-asset-scripts-observer-py]

[^exec-asset-scripts-observer-py]: EXEC_ASSETS/scripts/observer.py — lines 1-22.
