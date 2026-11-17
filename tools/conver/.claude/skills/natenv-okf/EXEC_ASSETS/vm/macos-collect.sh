#!/bin/bash
set -u
out=${1:?output directory};mkdir -p "$out"
sw_vers >"$out/os.txt" 2>&1
ifconfig -a >"$out/interfaces.txt" 2>&1
netstat -rn >"$out/routes.txt" 2>&1
netstat -anv >"$out/sockets.txt" 2>&1
lsof -nP -i >"$out/socket-processes.txt" 2>&1
ps -axo pid,ppid,user,%cpu,rss,etime,command >"$out/processes.txt" 2>&1
sudo -n pfctl -sr >"$out/pf-rules.txt" 2>&1
sudo -n wg show >"$out/wg.txt" 2>&1
