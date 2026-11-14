---
type: "Page"
title: "6. TURN coverage; TLS; NAT-side relays"
description: "Utility transport smoke (single/double, original image enough):"
sources: 
  - resource: "sources/implementation-handbook.md"
    id: "implementation-handbook-8"
    title: "6. TURN coverage; TLS; NAT-side relays"
generated: 
  by: "build-okf-skill"
  at: "2026-11-14"
verified: 
  - by: "machine"
    at: "2026-11-14"
status: "stable"
stale_after: "2027-11-14"
x-content-sha256: "90c409759048976174c0a74709c86a3d52616712bfc06f2bb9532f598356d4b6"
x-source-alias: "sources/implementation-handbook.md"
x-source-span: "329-372"
x-topic: "implementation-handbook"
x-requires: 
  - "pages/implementation-handbook/3-infrastructure-acceptance-fault-injection-nat-qualification"
---
## 6. TURN coverage; TLS; NAT-side relays

Utility transport smoke (single/double, original image enough):
```sh
cargo test --manifest-path accept/Cargo.toml --offline --test turn -- --ignored --nocapture
./lab exec a turnutils_uclient -y -u lab -w lab-secret -p 3478 -n 100 -z 10 10.77.0.30
./lab exec a turnutils_uclient -t -y -u lab -w lab-secret -p 3478 -n 100 -z 10 10.77.0.30
./lab exec a turnutils_uclient -T -u lab -w lab-secret -p 3478 -n 100 10.77.0.30
```

-y constructs paired relay endpoints inside utility, not two independently NATed product clients.
-t=TCP client-to-TURN; -T=RFC6062 TCP relay; inspect local `turnutils_uclient -h` for packaged-version options.
Rust utility smoke gates process completion/statistics marker only; it DOES NOT qualify packet-loss SLO or
cross-NAT product interoperability. Parse exact packaged statistics fields and assert sent/received/bytes
for a certified oracle; version drift must fail parser rather than assume zero loss. [web:92]

Product Rust TURN tests must place clients in a AND b; authenticated allocate, refresh, permission,
ChannelBind/SendIndication, peer traffic, expiry/deallocation; wrong credentials/nonce/realm; UDP/TCP/TLS
client transports; UDP relay and RFC6062 TCP relay separately. Force-direct-negative profile, assert direct
failure, relay success, correct relay address and coturn byte counters + packet evidence. TCP utility success
cannot establish PJSIP/iroh compatibility. coturn not interchangeable with iroh-relay.

TLS fixture (throwaway local CA; no ACME/Internet):
```sh
./scripts/tls.sh
# Tear down prior lab; merge with selected base:
docker compose -p natlab-single -f compose.single.yml -f compose.turn-tls.yml up -d --wait
./lab exec a openssl s_client -connect 10.77.0.30:5349 -CAfile /lab-config/tls/ca.crt \
  -verify_ip 10.77.0.30 -verify_return_error </dev/null
```
CA signing key outside mounted config/artifacts under private/. Service keys deliberately readable ONLY
because isolated throwaway fixture; never copy this policy into production. Private cert SANs identify DNS
and fixed IP. Actual Rust clients import CA explicitly; test untrusted CA/wrong name/expired cert failure;
never disable verification globally. TURN TLS/DTLS application payload tests require actual supported client
flags/APIs; successful TLS handshake alone does not validate allocation or media relay.

NAT-side TURN variant: create dedicated LAN/service namespace, router WAN alias/public facade; set coturn
listening-ip/relay-ip to private address; external-ip=PUBLIC/PRIVATE; DNAT UDP/TCP3478 and any enabled5349;
DNAT UDP/TCP50000:50199 to SAME numeric relay ports; exact forward allow; coturn clients target PUBLIC.
`external-ip` advertises address; does not configure router. Do not place NATed TURN on same bridge as outside
peers. Copy private-PBX routing pattern but update addresses/ports/config; qualify with actual packets. Such
custom variant requires its own acceptance before PASS; not one of supplied three standalone documents.
Port-rewriting NAT ahead of TURN may violate advertised mapping expectations. [web:40][web:41]

[^implementation-handbook-8]

[^implementation-handbook-8]: 6. TURN coverage; TLS; NAT-side relays — sources/implementation-handbook.md, lines 329-372.

