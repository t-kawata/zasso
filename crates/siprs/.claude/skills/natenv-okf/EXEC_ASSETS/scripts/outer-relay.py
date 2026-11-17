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
