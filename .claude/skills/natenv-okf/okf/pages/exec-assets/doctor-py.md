---
type: "Procedure"
title: "EXEC_ASSETS/doctor.py"
description: "Check infrastructure command access for Docker, Compose, and ingress."
sources: 
  - resource: "EXEC_ASSETS/doctor.py"
    id: "exec-asset-doctor-py"
    title: "EXEC_ASSETS/doctor.py"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/doctor.py"
x-asset-sha256: "b2afe4a784d1600333d07f275baaef301d3050bda19e61ddbec7dacebd36b511"
x-content-sha256: "f138c2d1ba1f5bd1a27f1d8c849a1f33b1c07693285007334b3d1d990a4565f6"
x-requires: 
  - "pages/pre-okf-original/11-generate-build-start-infrastructure"
x-source-span: "1-10"
x-topic: "exec-assets"
---
## EXEC_ASSETS/doctor.py

Check infrastructure command access for Docker, Compose, and ingress.

- role: Procedure
- interface: `python3 doctor.py`
- governing section: [11. Generate, build, start infrastructure](../pre-okf-original/11-generate-build-start-infrastructure.md)
- asset hash: `b2afe4a784d1600333d07f275baaef301d3050bda19e61ddbec7dacebd36b511`
- source span: lines 1-10

```python
#!/usr/bin/env python3
import subprocess,json,pathlib,sys,platform
checks=[]
def check(name,args):
 try:
  r=subprocess.run(args,text=True,capture_output=True,timeout=30);checks.append({'name':name,'status':'PASS' if r.returncode==0 else 'FAIL','exit':r.returncode,'stdout':r.stdout[-6000:],'stderr':r.stderr[-6000:]})
 except Exception as e:checks.append({'name':name,'status':'FAIL','error':str(e)})
check('docker',['docker','version']);check('compose',['docker','compose','version']);check('resolved',['docker','compose','-f','compose.json','config','--quiet']);check('services',['docker','compose','-f','compose.json','ps','--all','--format','json'])
for n in ['ingress-a','ingress-b','ingress-s']:check(n,['docker','compose','-f','compose.json','exec','-T',n,'wg','show','wg0'])
status='PASS' if all(c['status']=='PASS' for c in checks) else 'FAIL';r={'scope':'infrastructure-command-access','status':status,'host':platform.platform(),'checks':checks,'not_tested':['native path','NAT semantics','product acceptance']};p=pathlib.Path('artifacts/doctor.json');p.parent.mkdir(exist_ok=True);p.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r));sys.exit(0 if status=='PASS' else 1)
```

[^exec-asset-doctor-py]

[^exec-asset-doctor-py]: EXEC_ASSETS/doctor.py — lines 1-10.
