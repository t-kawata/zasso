---
type: "Procedure"
title: "EXEC_ASSETS/agent-run.py"
description: "OOB command runner for infrastructure and guest jobs."
sources: 
  - resource: "EXEC_ASSETS/agent-run.py"
    id: "exec-asset-agent-run-py"
    title: "EXEC_ASSETS/agent-run.py"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/agent-run.py"
x-asset-sha256: "caa830597ae8049cdcbfa7e6e69769a826378bedbb70ee3f28e504c4836ab036"
x-content-sha256: "197725b1874b9f632c1fb233c288b2d55dc0bf14844a47b1b59b8fd41543286f"
x-requires: 
  - "pages/pre-okf-original/5-control-plane-and-agent-execution"
x-source-span: "1-17"
x-topic: "exec-assets"
---
## EXEC_ASSETS/agent-run.py

OOB command runner for infrastructure and guest jobs.

- role: Procedure
- interface: `--node --script --timeout`
- governing section: [5. Control plane and agent execution](../pre-okf-original/5-control-plane-and-agent-execution.md)
- asset hash: `caa830597ae8049cdcbfa7e6e69769a826378bedbb70ee3f28e504c4836ab036`
- source span: lines 1-17

```python
#!/usr/bin/env python3
import argparse,subprocess,pathlib,datetime,uuid,json,sys,base64
p=argparse.ArgumentParser();p.add_argument('--inventory',default='inventory.json');p.add_argument('--node',required=True);p.add_argument('--timeout',type=int,default=120);p.add_argument('--script',required=True);a=p.parse_args();n=json.loads(pathlib.Path(a.inventory).read_text())['nodes'][a.node];script=pathlib.Path(a.script).read_text();backend=n['backend']
if backend=='local':cmd=n['shell'];stdin=script
elif backend=='tart':cmd=['tart','exec',n['vm'],'/bin/sh','-s'];stdin=script
elif backend=='ssh':cmd=['ssh','-o','BatchMode=yes','-o','ConnectTimeout=10',n['target'],'/bin/sh','-s'];stdin=script
elif backend=='direct':
 vm=n['vm'].replace("'","''");cred=n['credential_clixml'].replace("'","''");payload=base64.b64encode(script.encode()).decode()
 ps=f"$ErrorActionPreference='Stop'; $c=Import-Clixml -LiteralPath '{cred}'; $code=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('{payload}')); Invoke-Command -VMName '{vm}' -Credential $c -ScriptBlock {{param($s);$ErrorActionPreference='Stop';& ([scriptblock]::Create($s))}} -ArgumentList $code; if (-not $?) {{exit 1}}"
 cmd=['powershell.exe','-NoProfile','-NonInteractive','-EncodedCommand',base64.b64encode(ps.encode('utf-16-le')).decode()];stdin=None
else:raise SystemExit('Unknown backend')
run=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:8];d=pathlib.Path('artifacts/agent')/run;d.mkdir(parents=True);(d/'script.txt').write_text(script);start=datetime.datetime.now(datetime.timezone.utc).isoformat();timed=False
with (d/'stdout.bin').open('wb') as out,(d/'stderr.bin').open('wb') as err:
 proc=subprocess.Popen(cmd,stdin=subprocess.PIPE if stdin is not None else subprocess.DEVNULL,stdout=out,stderr=err)
 try:proc.communicate(None if stdin is None else stdin.encode(),timeout=a.timeout)
 except subprocess.TimeoutExpired:timed=True;proc.kill();proc.communicate()
r={'run_id':run,'node':a.node,'backend':backend,'started':start,'ended':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exit':proc.returncode,'timeout':timed,'status':'TIMEOUT' if timed else ('PASS' if proc.returncode==0 else 'FAIL'),'note':'Transport timeout does not kill remote child processes; stop through OOB control'};(d/'result.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r));sys.exit(124 if timed else (0 if proc.returncode==0 else 1))
```

[^exec-asset-agent-run-py]

[^exec-asset-agent-run-py]: EXEC_ASSETS/agent-run.py — lines 1-17.
