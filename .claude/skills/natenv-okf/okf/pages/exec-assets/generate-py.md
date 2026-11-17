---
type: "Procedure"
title: "EXEC_ASSETS/generate.py"
description: "Generate a complete single/double Compose topology, WireGuard keys and configs, and plan."
sources: 
  - resource: "EXEC_ASSETS/generate.py"
    id: "exec-asset-generate-py"
    title: "EXEC_ASSETS/generate.py"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/generate.py"
x-asset-sha256: "96e6dbc280eed6093aee405f535fad974bbed07f177af1681fa5bd5f3299090d"
x-content-sha256: "35f06056b485856fc4dd907d60e586cd5a4647a16a6b62812e373297f2e208b9"
x-requires: 
  - "pages/pre-okf-original/11-generate-build-start-infrastructure"
x-source-span: "1-39"
x-topic: "exec-assets"
---
## EXEC_ASSETS/generate.py

Generate a complete single/double Compose topology, WireGuard keys and configs, and plan.

- role: Procedure
- interface: `--endpoint --variant single|double`
- governing section: [11. Generate, build, start infrastructure](../pre-okf-original/11-generate-build-start-infrastructure.md)
- asset hash: `96e6dbc280eed6093aee405f535fad974bbed07f177af1681fa5bd5f3299090d`
- source span: lines 1-39

```python
#!/usr/bin/env python3
import argparse,pathlib,subprocess,json,os,ipaddress
p=argparse.ArgumentParser();p.add_argument('--endpoint',required=True);p.add_argument('--variant',choices=['single','double'],default='single');p.add_argument('--bind',default='0.0.0.0');a=p.parse_args();ipaddress.IPv4Address(a.endpoint);ipaddress.IPv4Address(a.bind)
base=pathlib.Path(__file__).resolve().parent;os.chdir(base)
if pathlib.Path('compose.json').exists():raise SystemExit('Existing compose.json: stop deployment and archive generated configuration before regeneration')
private=base/'private';private.mkdir(mode=0o700,exist_ok=True);os.chmod(private,0o700)
def secret(path,value):
 path.parent.mkdir(mode=0o700,parents=True,exist_ok=True);path.write_text(value);path.chmod(0o600)
def key():
 k=subprocess.check_output(['wg','genkey'],text=True).strip();return k,subprocess.check_output(['wg','pubkey'],input=k+'\n',text=True).strip()
services={};networks={}
def network(name,cidr,internal=True):
 x={'driver':'bridge','internal':internal,'enable_ipv6':False,'ipam':{'config':[{'subnet':cidr,'gateway':str(ipaddress.IPv4Network(cidr).network_address+254)}]}}
 if internal:x['driver_opts']={'com.docker.network.bridge.enable_ip_masquerade':'false','com.docker.network.bridge.inhibit_ipv4':'true'}
 networks[name]=x
for n,c in [('wan','10.77.0.0/24'),('lana','10.77.1.0/24'),('lanb','10.77.2.0/24')]:network(n,c)
network('transport','172.30.250.0/24',False)
if a.variant=='double':network('transit','10.77.10.0/24')
def node(name,role,ips,env=None,command=None):
 x={'image':'wan-node:local','build':{'context':'.'},'init':True,'cap_drop':['ALL'],'cap_add':['NET_ADMIN','NET_RAW','SETUID','SETGID','CHOWN','DAC_OVERRIDE','FOWNER'],'security_opt':['no-new-privileges:true'],'sysctls':{'net.ipv4.ip_forward':'0' if role=='service' else '1','net.ipv4.conf.all.rp_filter':'0','net.ipv4.conf.default.rp_filter':'0','net.ipv6.conf.all.disable_ipv6':'1','net.ipv6.conf.default.disable_ipv6':'1'},'networks':{n:{'ipv4_address':ip} for n,ip in ips.items()},'environment':{'ROLE':role,**(env or {})},'volumes':[f'./artifacts/{name}:/out','./config:/lab-config:ro'],'command':command or ['sleep','infinity'],'healthcheck':{'test':['CMD','test','-f','/run/lab.ready'],'interval':'1s','timeout':'1s','retries':60},'stop_grace_period':'15s'}
 pathlib.Path('artifacts',name).mkdir(parents=True,exist_ok=True);services[name]=x;return x
for i,label in enumerate(['a','b','s'],1):
 sk,sp=key();ck,cp=key();peer=f'10.78.{i}.10' if label!='s' else '10.79.0.10';wgaddr=f'10.78.{i}.1/24' if label!='s' else '10.79.0.1/24';lanip=f'10.77.{i}.2' if label!='s' else '10.77.0.50';lan='lan'+label if label!='s' else 'wan'
 routes=f'10.77.0.0/16 via 10.77.{i}.1\n10.78.0.0/16 via 10.77.{i}.1\n10.79.0.0/24 via 10.77.{i}.1' if label!='s' else f'10.78.1.0/24 via 10.77.0.{4 if a.variant=="double" else 2}\n10.78.2.0/24 via 10.77.0.3'
 x=node('ingress-'+label,'ingress',{lan:lanip,'transport':f'172.30.250.{10+i}'},{'LAN_IP':lanip,'WG_ADDR':wgaddr,'PEER_IP':peer,'DEFAULT_GW':'172.30.250.254','ROUTES':routes})
 x['ports']=[f'{a.bind}:{51820+i}:51820/udp'];x['volumes'].append(f'./private/{label}:/lab-private:ro')
 secret(private/label/'server.conf',f'[Interface]\nPrivateKey = {sk}\nListenPort = 51820\n[Peer]\nPublicKey = {cp}\nAllowedIPs = {peer}/32\n')
 secret(private/f'{label}.conf',f'[Interface]\nPrivateKey = {ck}\nAddress = {peer}/24\nMTU = 1280\n[Peer]\nPublicKey = {sp}\nEndpoint = {a.endpoint}:{51820+i}\nAllowedIPs = 10.77.0.0/16, 10.78.0.0/16, 10.79.0.0/24\nPersistentKeepalive = 25\n')
double=a.variant=='double';ra_wan='10.77.10.2' if double else '10.77.0.2';ra_net='transit' if double else 'wan'
node('ra','router',{'lana':'10.77.1.1',ra_net:ra_wan},{'LAN_IP':'10.77.1.1','WAN_IP':ra_wan,'SOURCES':'10.77.1.0/24,10.78.1.0/24','DEFAULT_GW':'10.77.10.1' if double else '10.77.0.50','ROUTES':'10.78.1.0/24 via 10.77.1.2'+('' if double else '\n10.79.0.0/24 via 10.77.0.50')})
node('rb','router',{'lanb':'10.77.2.1','wan':'10.77.0.3'},{'LAN_IP':'10.77.2.1','WAN_IP':'10.77.0.3','SOURCES':'10.77.2.0/24,10.78.2.0/24','ROUTES':'10.78.2.0/24 via 10.77.2.2\n10.79.0.0/24 via 10.77.0.50'})
if double:node('cga','router',{'transit':'10.77.10.1','wan':'10.77.0.4'},{'LAN_IP':'10.77.10.1','WAN_IP':'10.77.0.4','SOURCES':'10.77.10.0/24','ROUTES':'10.79.0.0/24 via 10.77.0.50'})
for name,ip,cmd in [('obs','10.77.0.20',['python3','/lab/observer.py','--bind','10.77.0.20']),('obs2','10.77.0.21',['python3','/lab/observer.py','--bind','10.77.0.21']),('pbx','10.77.0.10',['asterisk','-f','-vvv']),('turn','10.77.0.30',['turnserver','-c','/lab-config/coturn.conf'])]:
 x=node(name,'service',{'wan':ip},{'ROUTES':'10.79.0.0/24 via 10.77.0.50'},cmd)
 if name=='pbx':
  for f in ['pjsip.conf','extensions.conf','rtp.conf']:x['volumes'].append(f'./config/asterisk/{f}:/etc/asterisk/{f}:ro')
pathlib.Path('compose.json').write_text(json.dumps({'name':'wan-experiment','services':services,'networks':networks},indent=2)+'\n')
pathlib.Path('generated').mkdir(exist_ok=True);pathlib.Path('generated/plan.json').write_text(json.dumps({'variant':a.variant,'endpoint':a.endpoint,'nodes':{'a':'10.78.1.10','b':'10.78.2.10','s':'10.79.0.10'},'expected_wan_a':'10.77.0.4' if double else '10.77.0.2','expected_wan_b':'10.77.0.3'},indent=2)+'\n')
print('Generated compose.json, generated/plan.json, private/{a,b,s}.conf; distribute keys only to their designated nodes')
```

[^exec-asset-generate-py]

[^exec-asset-generate-py]: EXEC_ASSETS/generate.py — lines 1-39.
