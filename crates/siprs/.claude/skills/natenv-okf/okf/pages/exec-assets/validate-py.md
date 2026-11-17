---
type: "Procedure"
title: "EXEC_ASSETS/validate.py"
description: "Static validation for the Python and shell assets."
sources: 
  - resource: "EXEC_ASSETS/validate.py"
    id: "exec-asset-validate-py"
    title: "EXEC_ASSETS/validate.py"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/validate.py"
x-asset-sha256: "50daf04150d21c30483c4cbd187509b45a7bf3b3e329b8be62ea211018b7ff88"
x-content-sha256: "d2a671a3c754691ddffb8f33b43a830b559e6fbaea2f663fb15477e15467b67f"
x-requires: 
  - "pages/pre-okf-original/30-template-sealing-and-automation-boundary"
x-source-span: "1-11"
x-topic: "exec-assets"
---
## EXEC_ASSETS/validate.py

Static validation for the Python and shell assets.

- role: Procedure
- interface: `python3 validate.py`
- governing section: [30. Template sealing and automation boundary](../pre-okf-original/30-template-sealing-and-automation-boundary.md)
- asset hash: `50daf04150d21c30483c4cbd187509b45a7bf3b3e329b8be62ea211018b7ff88`
- source span: lines 1-11

```python
#!/usr/bin/env python3
import pathlib,ast,subprocess,json,sys
root=pathlib.Path(__file__).resolve().parent;checks=[]
for p in root.rglob('*.py'):
 if any(n in p.parts for n in ['artifacts','private']):continue
 try:ast.parse(p.read_text());checks.append({'file':str(p.relative_to(root)),'check':'python_ast','status':'PASS'})
 except SyntaxError as e:checks.append({'file':str(p),'check':'python_ast','status':'FAIL','error':str(e)})
for p in list(root.rglob('*.sh'))+[root/'lab']:
 if any(n in p.parts for n in ['artifacts','private']):continue
 r=subprocess.run(['bash','-n',str(p)],capture_output=True,text=True);checks.append({'file':str(p.relative_to(root)),'check':'shell_syntax','status':'PASS' if r.returncode==0 else 'FAIL','error':r.stderr})
r={'scope':'static-only','checks':checks};dest=root/'artifacts/static.json';dest.parent.mkdir(exist_ok=True);dest.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r));sys.exit(0 if all(c['status']=='PASS' for c in checks) else 1)
```

[^exec-asset-validate-py]

[^exec-asset-validate-py]: EXEC_ASSETS/validate.py — lines 1-11.
