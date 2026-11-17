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
