---
type: "Page"
title: "3. Infrastructure acceptance; fault injection; NAT qualification"
description: "Rust `accept/tests/lab.rs` runs via HOST cargo; issues Docker CLI; host never participates in dataplane."
sources: 
  - resource: "sources/implementation-handbook.md"
    id: "implementation-handbook-5"
    title: "3. Infrastructure acceptance; fault injection; NAT qualification"
generated: 
  by: "build-okf-skill"
  at: "2026-11-14"
verified: 
  - by: "machine"
    at: "2026-11-14"
status: "stable"
stale_after: "2027-11-14"
x-content-sha256: "9cfa3361026a55930e7c69e02e0f2cad5cd50fa27c9a6bd39cb76a17138c4525"
x-source-alias: "sources/implementation-handbook.md"
x-source-span: "143-219"
x-topic: "implementation-handbook"
x-requires: 
  - "pages/implementation-handbook/2-files-exact-topologies-placement"
---
## 3. Infrastructure acceptance; fault injection; NAT qualification

Rust `accept/tests/lab.rs` runs via HOST cargo; issues Docker CLI; host never participates in dataplane.
Rust `probe/` serves/sends actual UDP/TCP inside namespaces; no Cargo dependencies; offline build/test.
Checks: a/b UDP sequence integrity; TCP262144-byte exact echo; expected WAN source IP; alternate observations;
ra cut blocks UDP AND TCP (bypass rejection); UDP-block rejects UDP while TCP succeeds; recovery. All mutations
serial. Failure before cleanup? Recreate lab before rerun; do not assume normal state. Rust panic != classified
network failure in product tests; emit explicit timeout/protocol/assertion categories in adapters.

```sh
./lab exec a ip -4 route
./lab exec a ip route get 10.77.0.20
./lab exec ra nft -a list ruleset
./lab exec ra conntrack -L -o extended
./lab exec a netprobe udp 10.77.0.20:9000 42000 100 20
./lab exec a netprobe tcp 10.77.0.20:9000 1048576
python3 scripts/qualify-nat.py >artifacts/mapping-observations.json
```

Probe RTT is request/echo/receive measurement with timeout; NOT RTP jitter, one-way latency, perceptual MOS,
or throughput calibration. CLI udp exits1 on ANY loss; don't use it as a loss-tolerant performance oracle.
Sequential source-port reuse is an observational sample, not full RFC5780 filtering certification.

Fault scripts execute INSIDE router only:
```sh
./lab exec ra /lab/policy.sh udp-block
./lab exec ra /lab/policy.sh normal
./lab exec ra /lab/policy.sh cut
./lab exec ra /lab/policy.sh normal
./lab exec ra /lab/policy.sh clear
./lab exec ra /lab/link.sh wan delay 100ms 20ms loss 2% rate 5mbit limit 1000
./lab exec ra /lab/link.sh lan delay 60ms 10ms loss 1%
./lab exec ra /lab/link.sh wan clear
./lab exec ra /lab/link.sh lan clear
```

ra.wan egress = outbound; ra.lan egress = inbound to LAN. Double: apply stage-specific effects to ra/cga;
sum delays explicitly; avoid accidental double impairment. netem seed support version-dependent: inspect
`tc qdisc ... help`; unsupported seed is FAIL, not silently omitted. Host scheduler/timers, queue sizing,
CPU contention and offloads affect results. TCP TSQ may require receiver-ingress placement (IFB, extra caps/
setup) for rigorous performance work; router-egress fixture alone is not universal TCP benchmark fidelity.
No live /proc/sys writes: Docker commonly mounts it read-only. `compose.timeout.example.yml` configures
namespace conntrack timeouts on router creation; inspect /proc values and conntrack countdown; clear old
flows; client binding lifetime separately measured. Compose-only timeout override must use same project/base.
Conntrack UDP/stream expiration differs; keepalive tests must cover both. [web:20]

Finite strict NAT fixture, useful to regression-test mapping algorithms WITHOUT counterfeit NAT labels:
```sh
python3 scripts/fixture-nat.py apdm config/fixture.json >artifacts/fixture.nft
./lab exec ra conntrack -F
./lab exec ra nft -f /out/fixture.nft
python3 scripts/qualify-nat.py >artifacts/apdm-observations.json
```
Single/private ra only: fixture WAN=.2, source a:42000, exact three observer destinations. APDM assigns distinct
ports per (src,sport,dst,dport); EIM assigns same port per (src,sport). Base conntrack return matching retains
APDF-like inbound policy. Finite whitelist rejects other client UDP instead of falling back to baseline NAT.
Assert all3 observed tuples vs allocation table; repeat after state reset; test return arrival. Delete BOTH
`fixture_nat` and `fixture_allow`, then conntrack-F, or recreate before app tests. In double fixture.json WAN
must be10.77.10.2 and cga's behavior separately qualified; composite public mapping may hide inner properties.
These profiles are NOT general APDM for arbitrary dynamic application source/destination ports. Generalize
allocator/state engine or enumerate ALL actual test flows; otherwise report unsupported. Port reuse under
load, rebinding, EIF/ADF filtering, hairpin require separate explicit implementation+measurement. No one
`masquerade`, `random`, `persistent` flag certifies all combinations. [web:3][web:18]

Required full NAT-profile qualifier (implement in Rust beside actual SUT):
- Same open socket -> (IP-A,P), (IP-A,Q), (IP-B,P); compare externally observed mappings.
- Fresh state -> send to(A,P); same(A,P), sameIP/differentPort(A,Q), differentIP(B,P) inject toward observed
  endpoint WITHOUT preceding client sends to those alternate endpoints. Control injection OOB via Docker
  exec or control files, not client dataplane. Expect filtering per declared profile. Avoid state poisoning.
- Hairpin: second LAN peer targets first peer's public mapping; no alternate LAN shortcut.
- Lifetime: idle/active bidirectional/replied vs unreplied; keepalive interval before/after threshold.
- Port preservation/conflict/exhaustion: concurrent sources, fixed source ports, allocation table uniqueness.
- Multistage: qualify each stage, then composition; capture both sides of every stage.
- TCP: independent state-machine tests; UDP RFC4787 classifications do not prove TCP behavior.
RFC5780 alternative-IP/port server support must be verified for selected coturn build, not merely enabled
by a guessed flag; coturn behavior-discovery server and TURN utility smoke are separate test roles. [web:19]

[^implementation-handbook-5]

[^implementation-handbook-5]: 3. Infrastructure acceptance; fault injection; NAT qualification — sources/implementation-handbook.md, lines 143-219.

