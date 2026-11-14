---
type: "Page"
title: "8. Packet-level observation; bounded collection; failure triage"
description: "Always start capture BEFORE DNS/auth/ICE/handshake; observer namespaces + every router + endpoints. Shared"
sources: 
  - resource: "sources/implementation-handbook.md"
    id: "implementation-handbook-10"
    title: "8. Packet-level observation; bounded collection; failure triage"
generated: 
  by: "build-okf-skill"
  at: "2026-11-14"
verified: 
  - by: "machine"
    at: "2026-11-14"
status: "stable"
stale_after: "2027-11-14"
x-content-sha256: "745637c1fcddc4f795a9f50537232d3509e68435457c56c79a6a1ad44aea78c0"
x-source-alias: "sources/implementation-handbook.md"
x-source-span: "439-493"
x-topic: "implementation-handbook"
x-requires: 
  - "pages/implementation-handbook/3-infrastructure-acceptance-fault-injection-nat-qualification"
---
## 8. Packet-level observation; bounded collection; failure triage

Always start capture BEFORE DNS/auth/ICE/handshake; observer namespaces + every router + endpoints. Shared
namespace `tcpdump -i any` observes both interfaces; duplicate forwarding views are expected. Preserve ingress/
egress identity; for exact per-link analysis capture individual interface PCAP separately. any uses cooked
link-layer format; no assertion of actual Ethernet wire preamble/checksum/offload behavior. Full snaplen;
32MBx8 ring per namespace; old traffic overwritten deliberately. Long tests rotate/export before overwriting
required evidence; capture drops/rotation invalidate missing-packet conclusions.

```sh
./lab capture-start
./lab exec ra ip -j address
./lab exec ra conntrack -L -o extended
./lab exec ra nft -a list ruleset
./lab exec ra tc -s qdisc show
./lab exec a ss -tunap
./lab exec pbx asterisk -rx 'pjsip set logger on'
./lab exec pbx asterisk -rx 'rtp set debug on'
# Execute Rust tests; then:
./lab collect
./lab capture-stop
./lab exec pbx asterisk -rx 'pjsip show contacts'
./lab exec pbx asterisk -rx 'pjsip show channelstats'
./lab exec pbx asterisk -rx 'core show channels concise'
```

RTP debug/high-level tracing perturb timings; use diagnostic run distinct from performance run; quantify
CPU/disk impact. Secrets present in SIP authorization/PCAP; artifact access controlled. Do not upload raw captures
without explicit approval/redaction. Trace toggles OFF after diagnostics. Check bundled CLI help if command
absent in chosen packaged Asterisk; absence = missing evidence, not empty successful assertion.

Offline decode inside a trusted helper/namespace (choose actual ring filename, e.g. single-ra.pcap0):
```sh
./lab exec a ls -l /out
./lab exec a tshark -r /out/single-ra.pcap0 -n -Y sip -T json >artifacts/sip.json
./lab exec a tshark -r /out/single-ra.pcap0 -n -Y 'stun || turnchannel' -T json >artifacts/turn-packets.json
./lab exec a tshark -r /out/single-ra.pcap0 -n -q -z conv,udp >artifacts/udp-conversations.txt
./lab exec a tshark -r /out/single-ra.pcap0 -n -q -z rtp,streams >artifacts/rtp-streams.txt
```

Tshark field/dissector names version-dependent: `tshark -G protocols`, `-G fields`; unknown filter is failure,
not permission to substitute empty results. RTP heuristic/SDP context required; encrypted SRTP/QUIC not
plaintext RTP proof; force-decode only declared port ranges and preserve the assumption. Use mergecap for
full ring ordering; retain originals and timestamps. tcpdump stderr: received/dropped stats, kernel/ring errors.
Multiple namespace clocks on one kernel aid correlation, but monotonic vs wall timestamps still distinguish;
clock adjustments invalidate naive one-way latency. Containers cannot independently test hardware drift
without application-clock abstraction. Never alter host clock for a lab case.

Failure order: topology/routes -> bypass-cut -> nft counters -> per-hop PCAP/translated tuples -> conntrack
state/lifetimes -> server listener/auth -> signaling/ICE/relay path -> encrypted transport -> decoded payload
-> quality/resource budgets. Each verdict references exact artifact offsets/event IDs/flow5tuple/run_id.
No packets at source = app/config; source present/NAT absent = local route/filter; NAT outbound/no WAN =
bridge/host policy; server receives/no reply = server; reply/NAT present/no LAN = conntrack/filter; LAN data/
no decoded media = client/codec/crypto. These are investigation branches, not automatic diagnoses.

[^implementation-handbook-10]

[^implementation-handbook-10]: 8. Packet-level observation; bounded collection; failure triage — sources/implementation-handbook.md, lines 439-493.

