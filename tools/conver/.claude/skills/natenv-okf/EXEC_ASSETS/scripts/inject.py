#!/usr/bin/env python3
import argparse,socket,json
p=argparse.ArgumentParser();p.add_argument('--bind',required=True);p.add_argument('--source-port',type=int,required=True);p.add_argument('--target',required=True);p.add_argument('--tag',required=True);a=p.parse_args();host,port=a.target.rsplit(':',1)
s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM);s.bind((a.bind,a.source_port));s.sendto(a.tag.encode(),(host,int(port)));print(json.dumps({'sent':a.tag,'source':[a.bind,a.source_port],'target':[host,int(port)]}));s.close()
