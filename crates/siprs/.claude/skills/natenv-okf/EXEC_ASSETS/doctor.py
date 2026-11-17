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
