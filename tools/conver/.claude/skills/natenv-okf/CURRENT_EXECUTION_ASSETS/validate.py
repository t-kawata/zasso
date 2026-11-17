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
