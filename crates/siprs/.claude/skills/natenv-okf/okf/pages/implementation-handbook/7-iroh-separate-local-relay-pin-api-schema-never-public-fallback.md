---
type: "Page"
title: "7. iroh: separate local relay; pin API/schema; never public fallback"
description: "iroh uses QUIC + its own relay, not coturn. Version changes renamed discovery APIs; do not copy guessed"
sources: 
  - resource: "sources/implementation-handbook.md"
    id: "implementation-handbook-9"
    title: "7. iroh: separate local relay; pin API/schema; never public fallback"
generated: 
  by: "build-okf-skill"
  at: "2026-11-14"
verified: 
  - by: "machine"
    at: "2026-11-14"
status: "stable"
stale_after: "2027-11-14"
x-content-sha256: "ac9dfb25e677f18a3d7e8bf6067ca7f2e3effc1b5e4797aecebdc1965c7ebe32"
x-source-alias: "sources/implementation-handbook.md"
x-source-span: "373-438"
x-topic: "implementation-handbook"
x-requires: 
  - "pages/implementation-handbook/3-infrastructure-acceptance-fault-injection-nat-qualification"
---
## 7. iroh: separate local relay; pin API/schema; never public fallback

iroh uses QUIC + its own relay, not coturn. Version changes renamed discovery APIs; do not copy guessed
builder methods across releases. Inspect actual Cargo.lock/docs/source. Home relay + explicit EndpointAddr
(or pinned-version equivalent), authenticated EndpointId + ALPN. Default production relay/address lookup
would invalidate closed-lab assumptions. Disable public relay/discovery/PKARR/DNS/mDNS explicitly in adapter;
permit ONLY declared local services; audit attempted forbidden egress counters. [web:64][web:71][web:73]

Build relay from compatible pinned full upstream commit (not latest):
```sh
export IROH_REF=<40-hex-commit-compatible-with-your-lockfile>
docker build -f Dockerfile.iroh --build-arg IROH_REF="$IROH_REF" -t natlab-iroh:local .
docker compose -p natlab-single -f compose.single.yml -f compose.iroh.yml up -d --wait
./lab exec a curl --noproxy '*' --fail http://10.77.0.40:3340/healthz
```

Replace angle-bracket value with real commit. Server feature/bin names are verified by actual build;
compile failure means wrong pinned release/build contract, not permission to silently upgrade SUT.
Dev config intentionally HTTP relay only, no QAD: suitable relay-fallback baseline, NOT full NAT traversal
qualification. Upstream dev-mode TLS/QAD behavior has changed; pinned source is authority. [web:70][web:72]
For QAD/TLS use generated local CA and config/iroh-tls.example.toml as version-checked schema starting point;
run WITHOUT --dev; validate supported fields against pinned relay source; verify443/TCP and7842/UDP listeners,
CA/hostname, endpoint QUIC discovery responses. Add `relay.lab:10.77.0.40` to SUT's extra_hosts, install CA in
actual TLS/QUIC trust config; never assume OS trust automatically applies to rustls/QUIC. HTTP health alone
cannot establish QAD. Configuration parser may ignore unknown fields: listener/protocol probes mandatory.
Community self-hosting guide itself warns of schema drift; upstream pinned implementation wins. [web:56]

Implement Rust product fixture accepting config rather than public defaults:
```
iroh-node {serve|connect} --relay-url http://10.77.0.40:3340
          --bind 0.0.0.0:<fixed-port> --alpn lab/<protocol-version>
          --ticket-in /out/b.ticket --ticket-out /out/a.ticket
          --events /out/a.iroh.jsonl --seed N
```
CONTRACT, not fictional shipped binary. Ticket: peer ID + configured local relay + actual reachable candidate
addresses; create only after relay ready. Never inject other LAN's private10.77.2.10 as magically reachable
candidate; candidate ignored/failed is expected. Host-file ticket transfer removes discovery from scope.
Add distinct discovery fixture to validate actual address publication/lookup. Disable local mDNS shortcuts.

Required cases, actual Rust library adapters:
1. WAN-direct endpoints: no NAT; ALPN/identity/auth/data oracle.
2. LAN-a/b SNAT: connect, transfer, observe relay start and any direct upgrade; no requirement direct always
   succeeds unless qualified NAT profile explicitly makes it expected.
3. DoubleNAT: same, capture each stage, no direct-path assumption.
4. UDP blocked on ra BEFORE endpoint startup: relay-only; TCP remains allowed; exact payload success and
   sustained relay bytes; prove no direct peer UDP escapes. Coturn success irrelevant.
5. Relay blocked + UDP blocked: finite classified failure; no public fallback.
6. Direct established -> block direct UDP: migration/fallback latency + no content corruption; then restore
   and observe upgrade if implementation supports. Block at priority before established acceptance.
7. Relay outage while direct established; then relay recovery, endpoint restart, NAT-state reset/rebind;
   expected recovery documented per product, not assumed.
8. Many streams, half-close, backpressure, cancellation, slow receiver, datagrams if used; ALPN mismatch,
   wrong ID/authorization; exact content hash, no duplicate application delivery, bounded memory.
9. Churn/network address change: restart fixture with changed IP/port/config; authenticated reconnection;
   stale addresses/cache invalidation. No claim conntrack-F changes mapped port: use explicit new SNAT
   address/port fixture or endpoint rebind and verify observed tuple actually changed.
10. Local multi-peer scaling: latency/throughput distributions, fd/RSS/task growth, fairness, relay overload,
    simultaneous connect/reconnect; this is local load emulation, not proof planet-scale deployment behavior.

iroh telemetry contract: endpoint/peer IDs, local/remote socket tuples, current path enum/history, relay URL,
path-change monotonic timestamps, direct/relay bytes separately, handshake/RTT/loss/congestion state where
actual version exposes it, QUIC stream errors, application-sequence/hash, reconnect reason. If API lacks path
byte counters instrument actual crate or use qualified packet/counter evidence; never infer direct from low
latency or successful connect. Encrypted QUIC captures don't reveal plaintext integrity. Instrument app;
TLS key logs optional/version-dependent and sensitive; not assumed universal SSLKEYLOGFILE support.

[^implementation-handbook-9]

[^implementation-handbook-9]: 7. iroh: separate local relay; pin API/schema; never public fallback — sources/implementation-handbook.md, lines 373-438.

