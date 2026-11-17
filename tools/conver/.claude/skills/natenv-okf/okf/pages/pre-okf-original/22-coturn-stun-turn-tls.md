---
type: "Page"
title: "22. coturn, STUN, TURN, TLS"
description: "Baseline TURN10.77.0.30:3478 UDP/TCP; realm lab; lab/lab-secret; relay50000-50199; no TLS/DTLS. Closed private peer destinations intentional; not production security policy. Native clients must"
sources: 
  - resource: "sources/pre-okf-original.md"
    id: "pre-okf-original-24"
    title: "22. coturn, STUN, TURN, TLS"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-content-sha256: "f2b48366e19d0922275e6c3cda44bd4f7b2f33e4f340b482dde4ea398eae4be6"
x-requires: 
  - "pages/pre-okf-original/21-headless-voip-identity-quality-surrogate-scope"
x-source-alias: "sources/pre-okf-original.md"
x-source-span: "608-635"
x-topic: "pre-okf-original"
---
## 22. coturn, STUN, TURN, TLS

Baseline TURN10.77.0.30:3478 UDP/TCP; realm lab; lab/lab-secret; relay50000-50199; no TLS/DTLS. Closed private peer destinations intentional; not production security policy. Native clients must implement allocation/permission/channel/data; TURN is neither SIP registrar nor generic relay for arbitrary protocols.

```sh
./lab exec turn ss -lntup
./lab exec turn turnutils_uclient -h
./lab logs
```
Utility options are packaged-version specific: `-t` usually client-to-TURN TCP; `-T` TCP relaying/RFC6062; `-y` utility's paired relay endpoints. Verify local help. Utility two endpoints are not two independent native NATed product clients. Completion marker alone is transport smoke; qualify exact sent/received/bytes for loss assertions.

Native acceptance: auth Allocate/Refresh/Permission/ChannelBind or SendIndication, actual peer payload, expiry/deallocation; wrong credential/realm/nonce; UDP/TCP/TLS client transports; UDP relay versus TCP relay separately. Force-direct-negative, assert direct fails/relay succeeds, advertised relay address, server bytes, peer hash. TLS handshake alone does not establish allocation or media.

TLS fixture:
```sh
bash scripts/tls.sh
docker compose -f compose.json -f compose.tls.json config
docker compose -f compose.json -f compose.tls.json up -d --wait
./lab exec obs openssl s_client -connect 10.77.0.30:5349 -CAfile /lab-config/tls/ca.crt -verify_ip 10.77.0.30 -verify_return_error </dev/null
```
CA private key under private/ca, only public CA/certs mounted as configuration alongside service key. Service key0600; if daemon drops UID before key access, assign restricted owner/group/read permission for actual service account, not world-readable default. TLS fixture short-lived, not production CA operations.

Overlay-aware lifecycle: `lab` wrapper knows base file only. When overlays active, use full Compose `-f` sequence for up/config/logs/inspect/down; collect resolved overlay config separately. Base service names remain same here, but command/config provenance must match actual merged deployment. No silent overlay omission.

Native clients explicitly trust local CA in actual TLS stack. Rustls/QUIC may not automatically use OS trust. Negative CA/name/expired-cert cases; do not disable verification globally. DTLS separately enabled/tested if supported.

NAT-side TURN: private listening-ip/relay-ip; external-ip=PUBLIC/PRIVATE; DNAT3478 and enabled5349 plus relay50000-50199, same numerical ports; forwarding exact; clients target public façade. Port-rewriting NAT may violate advertised mapping. Place outside peers on different segment; do not leave WAN shortcut route.

[^pre-okf-original-24]

[^pre-okf-original-24]: 22. coturn, STUN, TURN, TLS — sources/pre-okf-original.md, lines 608-635.

