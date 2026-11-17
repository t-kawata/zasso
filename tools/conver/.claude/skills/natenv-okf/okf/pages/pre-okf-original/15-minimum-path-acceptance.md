---
type: "Page"
title: "15. Minimum path acceptance"
description: "Copy scripts/probe.py to each native node. Start infrastructure captures before traffic. A: ```sh python3 scripts/probe.py udp --bind 10.78.1.10 --target 10.77.0.20:9000 python3 scripts/probe.py tcp"
sources: 
  - resource: "sources/pre-okf-original.md"
    id: "pre-okf-original-17"
    title: "15. Minimum path acceptance"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-content-sha256: "341923d4915c3c1fb0b51ff2d3de80326116190b3455a544d5d1aa42f8538513"
x-requires: 
  - "pages/pre-okf-original/14-packet-path-and-nat-semantics"
x-source-alias: "sources/pre-okf-original.md"
x-source-span: "450-491"
x-topic: "pre-okf-original"
---
## 15. Minimum path acceptance

Copy scripts/probe.py to each native node. Start infrastructure captures before traffic. A:
```sh
python3 scripts/probe.py udp --bind 10.78.1.10 --target 10.77.0.20:9000
python3 scripts/probe.py tcp --bind 10.78.1.10 --target 10.77.0.20:9000
```
Windows uses `python` if that is registered interpreter. B bind10.78.2.10. Expected UDP observed: A .77.0.2 single/.77.0.4 double; B .77.0.3. Port may vary. TCP compares262144 bytes exactly; output hash/length retained. `--source-port 0` allows OS-selected port when repeated TCP TIME_WAIT interferes; fixed-port NAT tests remain separate.

S native listener:
```sh
python3 scripts/probe.py serve --bind 10.79.0.10
```
A/B send UDP/TCP to10.79.0.10:9000. S sends UDP to10.77.0.20:9000; observed source must remain10.79.0.10. A source becoming ingress IP indicates unintended ingress NAT. A/B success to observer alone does not prove native S listener path.

Selective fault, infrastructure context:
```sh
./lab capture-start
./lab exec ra /lab/policy.sh cut
# Native A UDP/TCP must fail; B UDP/TCP must continue; OOB must work.
./lab exec ra /lab/policy.sh normal
# Native A must recover.
./lab exec ra /lab/policy.sh udp-block
# Native A UDP fails; TCP succeeds.
./lab exec ra /lab/policy.sh normal
./lab capture-stop
./lab collect
```
Baseline-success -> deliberate-failure -> restored-success forms one assertion. A stopped server, missing binary or startup failure is not successful NAT-cut proof. Record exact process/tuple/exit/event/counter.

Acceptance cases:
|ID|Stimulus|Expected evidence|
|---|---|---|
|P00|doctor|Docker/Compose/ingress CLI access|
|P01|A/B/S UDP/TCP|expected sources, exact TCP data, native S receipt|
|P02|ra cut|A stopped, B alive, OOB alive|
|P03|restore|A recovered|
|P04|UDP block|UDP failed/TCP survived|
|P05|double|A .4; both translations captured|

Result schema: run_id, scope, OS, binary revision, variant, assertion array{name,status,expected,observed,evidence}, exit, started/ended. Generate from actual results; never save an example PASS as evidence.

[^pre-okf-original-17]

[^pre-okf-original-17]: 15. Minimum path acceptance — sources/pre-okf-original.md, lines 450-491.

