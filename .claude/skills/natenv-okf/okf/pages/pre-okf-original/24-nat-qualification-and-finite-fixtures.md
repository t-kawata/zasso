---
type: "Page"
title: "24. NAT qualification and finite fixtures"
description: "Mapping: same open socket -> (IP-A,P),(IP-A,Q),(IP-B,P); compare external mappings. Filtering: fresh state -> contact only(A,P), then out-of-band inject from permitted tuple/sameIP otherPort/otherIP"
sources: 
  - resource: "sources/pre-okf-original.md"
    id: "pre-okf-original-26"
    title: "24. NAT qualification and finite fixtures"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-content-sha256: "3b6a57be17dd827f84916bdabcf947d354fe9a595a0e872e7e9af8bb533714b6"
x-requires: 
  - "pages/pre-okf-original/23-quic-iroh-custom-p2p-specifics"
x-source-alias: "sources/pre-okf-original.md"
x-source-span: "648-679"
x-topic: "pre-okf-original"
---
## 24. NAT qualification and finite fixtures

Mapping: same open socket -> (IP-A,P),(IP-A,Q),(IP-B,P); compare external mappings. Filtering: fresh state -> contact only(A,P), then out-of-band inject from permitted tuple/sameIP otherPort/otherIP without client first contacting them. These are separate axes; port preservation, hairpin and lifetime are additional axes.

Current observers listen UDP/TCP9000/9001 on .20/.21. Native A same-socket mapping:
```sh
python3 scripts/nat-observe.py --bind 10.78.1.10 --source-port 42000 \
 --destination 10.77.0.20:9000 --destination 10.77.0.20:9001 --destination 10.77.0.21:9000
```
Output explicitly leaves filtering NOT_QUALIFIED. Multiple runs of probe.py do not preserve one open socket; use this tool for mapping.

Filtering fixture: fresh router conntrack, native listener with only initial .20:9000 contact plus `--listen-seconds 20`; capture printed mapped tuple. Through infrastructure OOB inject from obs/obs2:
```sh
./lab exec obs2 python3 /lab/inject.py --bind 10.77.0.21 --source-port 9100 --target <observed-ip:port> --tag different-ip
```
Use unused source port or stop conflicting observer listener for exact-source tests; cannot bind9000 while observer owns it. Configure observer ports or temporary controlled injector namespace when same source port needed. Tag/time all injections; compare received events and captures; no preconditioning sends to alternate tuples.

Finite mapping fixture:
```sh
python3 scripts/fixture.py apdm config/fixture.json >artifacts/fixture.nft
./lab exec ra /lab/policy.sh reset
cp artifacts/fixture.nft artifacts/ra/fixture.nft
./lab exec ra nft -f /out/fixture.nft
```
Each service mounts artifacts/<service> as /out. Fixture installs SNAT priority90 before baseline100, finite source/destination whitelist, explicit unmatched UDP drop. EIM assigns same port per source tuple; APDM per full source/destination tuple. Baseline return filtering remains conntrack/APDF-like, not generalized EIF. Verify observed allocations and return traffic.

Fixture applies to single RA WAN10.77.0.2; double change cfg WAN10.77.10.2 and qualify cga independently. Dynamic application ports outside enumerated set unsupported; never apply fixed42000 fixture to arbitrary PJSIP/QUIC sockets and call it general symmetric NAT.

Reset: delete both `ip fixture_nat` and `inet fixture_allow`, flush relevant state, restore profile or recreate. Repeated `nft -f` table creation is not idempotent. Fixtures are scoped tests, not baseline permanent rules.

Additional qualification when required: idle/active/replied/unreplied lifetime; keepalive above/below threshold; source-port collision/exhaustion; hairpin; rebind; TCP state machine. UDP RFC classification does not prove TCP behavior. STUN behavior-discovery requires actual alternate-address/port server support, not an assumed coturn flag.

[^pre-okf-original-26]

[^pre-okf-original-26]: 24. NAT qualification and finite fixtures — sources/pre-okf-original.md, lines 648-679.

