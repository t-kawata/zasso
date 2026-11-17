---
type: "Page"
title: "26. Packet capture, state, observation"
description: "Start capture before discovery/auth/handshake. Stop/flush before final archive. Per-service 32MB x8 ring, full snaplen; long run exports before overwrite. Capture loss/rotation invalidates"
sources: 
  - resource: "sources/pre-okf-original.md"
    id: "pre-okf-original-28"
    title: "26. Packet capture, state, observation"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-content-sha256: "09d1ac34b3cc1a2f933036d349cea4a2af9318db1ebaeb36e8af4a8617d2e5b7"
x-requires: 
  - "pages/pre-okf-original/25-fault-injection-timeouts-recovery"
x-source-alias: "sources/pre-okf-original.md"
x-source-span: "700-738"
x-topic: "pre-okf-original"
---
## 26. Packet capture, state, observation

Start capture before discovery/auth/handshake. Stop/flush before final archive. Per-service 32MB x8 ring, full snaplen; long run exports before overwrite. Capture loss/rotation invalidates missing-packet conclusions for affected interval. `any` duplicates forwarded views and uses cooked link-layer format; retain interface/direction metadata.

```sh
./lab capture-start
./lab exec ra ip -j address
./lab exec ra ip -j -4 route show table all
./lab exec ra nft -a list ruleset
./lab exec ra conntrack -L -o extended
./lab exec ra tc -s qdisc show
./lab exec ingress-a wg show wg0
./lab exec ingress-a ss -lunp
# Execute scenario.
./lab capture-stop
./lab collect
```
Every service artifact directory separate; `/out` equals artifacts/<service>, not artifact root. `state.sh` records command status; unsupported/permission failure remains visible. `collect` nonzero reflects missing collection components, not necessarily whole product failure; scope assertions appropriately.

Exact link capture:
```sh
./lab exec ra sh -c 'tcpdump -i "$(cat /run/wan.if)" -nn -s0 -c 1000 -w /out/wan.pcap'
```
Count may not be reached; external deadline or background PID required. For tunnel ingress, distinguish encrypted underlay packets and decrypted wg0 packets; inner NAT tests inspect latter.

Decode actual existing filename, not assumed ring suffix:
```sh
./lab exec ra ls -lh /out
./lab exec ra tshark -n -r /out/packets.pcap0 -Y sip -T json
./lab exec ra tshark -n -r /out/packets.pcap0 -Y 'stun || turnchannel' -T json
./lab exec ra tshark -n -r /out/packets.pcap0 -q -z conv,udp
./lab exec ra tshark -n -r /out/packets.pcap0 -q -z rtp,streams
```
Use `tshark -G protocols/fields` to resolve versioned dissectors; invalid filter is failure. RTP depends on SDP/heuristics/explicit decode. SRTP/QUIC encrypted capture alone cannot prove decoded media. Force-decode only documented range and record assumption. Merge rings with mergecap when needed, preserve originals.

Native observation: Windows vm/windows-collect.ps1 -OutDir; Mac bash vm/macos-collect.sh <dir>; Linux `ip netns exec ... ss/ip`. Host process listings do not include guest PIDs; namespace companion process views do not automatically include other container PID namespaces. Collect within actual SUT node/process context.

Correlate wallclock and monotonic timestamps, run/call/session IDs, tuples, sequence. Different VM clocks not identical; naive one-way latency across PCAP timestamps invalid without synchronization/error budget. Same-node RTT or corrected clock model preferred. Never change host clock to simulate guest/application drift.

[^pre-okf-original-28]

[^pre-okf-original-28]: 26. Packet capture, state, observation — sources/pre-okf-original.md, lines 700-738.

