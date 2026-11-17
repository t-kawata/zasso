#!/usr/bin/env python3
import argparse,socket,threading,json,time,hashlib
p=argparse.ArgumentParser();p.add_argument('mode',choices=['serve','udp','tcp']);p.add_argument('--bind',required=True);p.add_argument('--port',type=int,default=9000);p.add_argument('--target');p.add_argument('--source-port',type=int,default=42000);p.add_argument('--timeout',type=float,default=3);p.add_argument('--bytes',type=int,default=262144);a=p.parse_args()
def listener(typ):
 s=socket.socket(socket.AF_INET,typ);s.bind((a.bind,a.port))
 if typ==socket.SOCK_DGRAM:
  while True:
   b,peer=s.recvfrom(65535);s.sendto(json.dumps({'peer':list(peer),'payload':b.hex()}).encode(),peer)
 else:
  s.listen()
  def echo(c):
   with c:
    while True:
     b=c.recv(65536)
     if not b:break
     c.sendall(b)
  while True:
   c,_=s.accept();threading.Thread(target=echo,args=(c,),daemon=True).start()
if a.mode=='serve':
 threading.Thread(target=listener,args=(socket.SOCK_DGRAM,),daemon=True).start();listener(socket.SOCK_STREAM)
else:
 if not a.target:p.error('--target required')
 host,port=a.target.rsplit(':',1);s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM if a.mode=='udp' else socket.SOCK_STREAM);s.settimeout(a.timeout);s.bind((a.bind,a.source_port));t=time.monotonic()
 if a.mode=='udp':
  payload=b'wire-path-probe';s.sendto(payload,(host,int(port)));raw,peer=s.recvfrom(65535);r=json.loads(raw);assert bytes.fromhex(r['payload'])==payload;result={'observed':r['peer'],'reply_from':peer,'integrity':True}
 else:
  s.connect((host,int(port)));payload=bytes(i%251 for i in range(a.bytes));errors=[]
  def tx():
   try:s.sendall(payload)
   except Exception as e:errors.append(str(e))
  th=threading.Thread(target=tx);th.start();got=bytearray()
  while len(got)<len(payload):
   b=s.recv(min(65536,len(payload)-len(got)))
   if not b:raise RuntimeError('early EOF')
   got.extend(b)
  th.join(a.timeout);assert not th.is_alive() and not errors;assert got==payload;result={'bytes':len(got),'sha256':hashlib.sha256(got).hexdigest(),'integrity':True}
 result.update(protocol=a.mode,elapsed_ms=(time.monotonic()-t)*1000);print(json.dumps(result));s.close()
