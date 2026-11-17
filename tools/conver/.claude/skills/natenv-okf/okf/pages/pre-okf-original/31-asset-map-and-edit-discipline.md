---
type: "Page"
title: "31. Asset map and edit discipline"
description: "31. Asset map and edit discipline"
sources: 
  - resource: "sources/pre-okf-original.md"
    id: "pre-okf-original-33"
    title: "31. Asset map and edit discipline"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-content-sha256: "169689f85f587700a49d7ae56894bab33e1108d181035c656ff8f1d45e8e9c0f"
x-requires: 
  - "pages/pre-okf-original/30-template-sealing-and-automation-boundary"
x-source-alias: "sources/pre-okf-original.md"
x-source-span: "805-829"
x-topic: "pre-okf-original"
---
## 31. Asset map and edit discipline

|Asset|Responsibility|
|---|---|
|AGENTS.md|agent execution invariants|
|Dockerfile|Ubuntu service/router/ingress image|
|generate.py|complete single/double Compose + WG key/config + plan|
|lab|base topology CLI, captures, collection|
|bootstrap/*|host/infrastructure tools, verified download, provenance|
|vm/*|native VM creation/state collection|
|scripts/node.sh|namespace routes/WG/NAT startup|
|scripts/policy.sh,link.sh|bounded fault controls|
|scripts/probe.py,observer.py|real UDP/TCP echo/data integrity|
|scripts/nat-observe.py,inject.py,fixture.py|NAT observations/injection/finite mapping|
|scripts/outer-relay.py|Mac host encrypted underlay carrier|
|scripts/linux-endpoint.sh|host-binary namespace endpoint|
|scripts/tls.sh|throwaway CA/service certificates|
|config/*|PBX/TURN/finite-flow fixture|
|compose.tls.json,compose.timeout.json|explicit overlays|
|agent-run.py,inventory.example.json,jobs/*|OOB command execution contracts|
|doctor.py|infrastructure command access check|
|validate.py|Python/shell static checks|

Before edit: inspect config+plan+actual state. After edit: static validation; resolved Compose; affected path acceptance; required protocol checks. Change topology and assertions together. Source artifact names authoritative; snippets contextual examples, not a second implementation generation.

[^pre-okf-original-33]

[^pre-okf-original-33]: 31. Asset map and edit discipline — sources/pre-okf-original.md, lines 805-829.

