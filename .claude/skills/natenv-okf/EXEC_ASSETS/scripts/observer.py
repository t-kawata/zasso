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
