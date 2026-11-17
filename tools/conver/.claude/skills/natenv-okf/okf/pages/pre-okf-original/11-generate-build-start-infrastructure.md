---
type: "Page"
title: "11. Generate, build, start infrastructure"
description: "Inside Ubuntu, current assets extracted to ~/wan-lab, Docker authorization established: ```sh cd ~/wan-lab python3 generate.py --endpoint 192.168.240.2 --variant single # Mac relay profile: replace"
sources: 
  - resource: "sources/pre-okf-original.md"
    id: "pre-okf-original-13"
    title: "11. Generate, build, start infrastructure"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-content-sha256: "e04f85f036089f67e03a8e75213a65d9804e9d1af222a11bb5aa9022b0dc08a6"
x-requires: 
  - "pages/pre-okf-original/10-mac-underlay-host-ciphertext-relay"
x-source-alias: "sources/pre-okf-original.md"
x-source-span: "328-360"
x-topic: "pre-okf-original"
---
## 11. Generate, build, start infrastructure

Inside Ubuntu, current assets extracted to ~/wan-lab, Docker authorization established:
```sh
cd ~/wan-lab
python3 generate.py --endpoint 192.168.240.2 --variant single
# Mac relay profile: replace endpoint with actual HOST_ROUTER_IP.
./lab config > /tmp/wan-resolved.yml
./lab build
./lab up
./lab ps
python3 doctor.py
```
Generated: compose.json; generated/plan.json; private/a.conf,b.conf,s.conf; private/{a,b,s}/server.conf; artifacts/<service> directories. Server configs belong only to ingress; endpoint configs distributed only to corresponding native node. Keys generated locally using wg; 0700 private directory/0600 files. No keys shipped in ZIP.

Generator emits complete alternative topology; no cross-file network merge dependency. JSON is YAML-compatible Compose input. Single project name wan-experiment; only one generated topology active per infrastructure instance. Regenerate only after down/archive; existing compose.json refusal prevents accidental live rekey.

Logical ready versus service ready:
```sh
./lab exec obs ss -lntup
./lab exec obs2 ss -lntup
./lab exec pbx asterisk -rx 'core waitfullybooted'
./lab exec pbx asterisk -rx 'pjsip show transports'
./lab exec turn ss -lntup
```
Container healthfile means network startup script finished; not SIP/TURN protocol acceptance. `doctor.py` proves infrastructure command access only. Inspect its scope field.

Image reproducibility:
```sh
bash bootstrap/freeze.sh
```
Pin base digest, apt repository/package versions or snapshot, compiler/toolchain, source SHA and lockfiles for repeatable rebuilds. Image ID identifies an existing local build; manifest alone does not make future apt repositories immutable. After baseline freeze, export/cache approved images; no silent upgrade mid-comparison.

[^pre-okf-original-13]

[^pre-okf-original-13]: 11. Generate, build, start infrastructure — sources/pre-okf-original.md, lines 328-360.

