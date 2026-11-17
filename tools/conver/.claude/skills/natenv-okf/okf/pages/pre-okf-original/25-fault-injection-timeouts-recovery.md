---
type: "Page"
title: "25. Fault injection, timeouts, recovery"
description: "25. Fault injection, timeouts, recovery"
sources: 
  - resource: "sources/pre-okf-original.md"
    id: "pre-okf-original-27"
    title: "25. Fault injection, timeouts, recovery"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-content-sha256: "994bcdb5be2a9f40bde0d6b581ca856c0d4eaa046acdbe5e839e8631654d1a3d"
x-requires: 
  - "pages/pre-okf-original/24-nat-qualification-and-finite-fixtures"
x-source-alias: "sources/pre-okf-original.md"
x-source-span: "680-699"
x-topic: "pre-okf-original"
---
## 25. Fault injection, timeouts, recovery

```sh
./lab exec ra /lab/link.sh wan delay 100ms 20ms loss 2% rate 5mbit limit 1000
./lab exec ra /lab/link.sh lan delay 60ms 10ms loss 1%
./lab exec ra /lab/link.sh wan clear
./lab exec ra /lab/link.sh lan clear
```
wan egress=outbound; lan egress=inbound toward endpoints. Multi-stage delays add. netem seed optional only when actual kernel/tc supports it; unsupported seed reported, not silently removed. CPU/offload/timer/queue behavior affects distributions. Receiver-ingress/IFB may be required for rigorous TCP benchmarking; router-egress fixture is functional impairment, not universal throughput fidelity.

UDP expiration overlay:
```sh
docker compose -f compose.json -f compose.timeout.json up -d --force-recreate ra
```
Stop SUT/capture as needed, verify kernel values, clear old flows; preserve same project/base. Recreated network owner/attached namespace requires dependent namespace consumers restart. Current WireGuard ingress separate from ra but check routes/listeners after recreation.

`conntrack -F` changes state, not necessarily mapped port. To test actual rebinding change explicit SNAT allocation or endpoint source port, verify tuple changed, then measure product recovery. Keepalive and timeout case expectations fixed before run.

Fault cleanup serial and exception-safe. After interrupted mutation: preserve state, restore policy/qdisc, clear only intended fixtures/state or recreate deployment; rerun baseline. No assumption that panic left normal profile.

[^pre-okf-original-27]

[^pre-okf-original-27]: 25. Fault injection, timeouts, recovery — sources/pre-okf-original.md, lines 680-699.

