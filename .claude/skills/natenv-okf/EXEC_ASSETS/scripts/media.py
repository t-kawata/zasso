#!/usr/bin/env python3
import argparse,wave,json,hashlib
import numpy as np
p=argparse.ArgumentParser();sp=p.add_subparsers(dest='mode',required=True)
g=sp.add_parser('generate');g.add_argument('--out',required=True);g.add_argument('--seed',type=int,required=True);g.add_argument('--seconds',type=float,default=25);g.add_argument('--rate',type=int,default=8000)
c=sp.add_parser('check');c.add_argument('--reference',required=True);c.add_argument('--received',required=True);c.add_argument('--max-lag-ms',type=float,default=2000);c.add_argument('--min-correlation',type=float,default=.9);c.add_argument('--min-seconds',type=float,default=10)
a=p.parse_args()
def read(path):
 with wave.open(path,'rb') as w:
  assert w.getnchannels()==1 and w.getsampwidth()==2,'PCM16 mono required; normalize explicitly first';return w.getframerate(),np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').astype(np.float64)
if a.mode=='generate':
 rng=np.random.default_rng(a.seed);n=int(a.seconds*a.rate);t=np.arange(n)/a.rate;env=np.repeat(rng.uniform(.25,1,size=int(a.seconds*10)+2),int(a.rate/10))[:n]
 sig=sum(np.sin(2*np.pi*(f*t+k*t*t)+rng.uniform(0,6.28)) for f,k in [(197,3.1),(431,2.3),(811,1.7),(1237,.9)])*env
 sig*=np.minimum(1,t*20)*np.minimum(1,(a.seconds-t)*20);b=np.clip(sig/max(1,np.max(np.abs(sig)))*14000,-32768,32767).astype('<i2').tobytes()
 with wave.open(a.out,'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(a.rate);w.writeframes(b)
 print(json.dumps({'seed':a.seed,'seconds':a.seconds,'rate':a.rate,'pcm_sha256':hashlib.sha256(b).hexdigest()}))
else:
 rate,x=read(a.reference);rr,y=read(a.received);assert rr==rate,'Resample to equal rates first';assert len(x) and len(y)
 n=len(x)+len(y)-1;size=1<<(n-1).bit_length();corr=np.fft.irfft(np.fft.rfft(y,size)*np.fft.rfft(x[::-1],size),size)[:n]
 lags=np.arange(-len(x)+1,len(y));limit=int(a.max_lag_ms*rate/1000);mask=(np.abs(lags)<=limit);idx=np.where(mask)[0];best=idx[np.argmax(corr[idx])];lag=int(lags[best]);xs=max(0,-lag);ys=max(0,lag);length=min(len(x)-xs,len(y)-ys);xx=x[xs:xs+length];yy=y[ys:ys+length];xx=xx-xx.mean();yy=yy-yy.mean();den=float(np.linalg.norm(xx)*np.linalg.norm(yy));rho=float(xx@yy/den) if den else 0.;rms=float(np.sqrt(np.mean(y*y)));clip=float(np.mean(np.abs(y)>=32760));duration=len(y)/rate
 ok=duration>=a.min_seconds and length/rate>=a.min_seconds and rho>=a.min_correlation and rms>=100 and clip<.01
 print(json.dumps({'seconds':duration,'rms':rms,'clipping_fraction':clip,'correlation':rho,'lag_ms':lag*1000/rate,'overlap_seconds':length/rate,'identity_method':'bounded-lag FFT peak then centered normalized correlation; no drift correction','pass':ok}));raise SystemExit(0 if ok else 1)
