#!/bin/sh
set -eu
case "${1:-}" in
 start)
  test ! -e /run/capture.pid; mkdir -p /out
  tcpdump -i any -n -s 0 -U -C 32 -W 8 -w /out/packets.pcap >/out/tcpdump.log 2>&1 &
  p=$!; echo "$p" >/run/capture.pid; sleep 1; kill -0 "$p";;
 stop)
  if [ -f /run/capture.pid ]; then
   p=$(cat /run/capture.pid); kill -INT "$p" 2>/dev/null || :
   i=0; while kill -0 "$p" 2>/dev/null && [ "$i" -lt 15 ]; do sleep 1; i=$((i+1)); done
   if kill -0 "$p" 2>/dev/null; then echo 'capture still running; inspect before reusing PID file' >&2; exit 1; fi
   rm /run/capture.pid
  fi;;
 *) exit 2;;
esac
