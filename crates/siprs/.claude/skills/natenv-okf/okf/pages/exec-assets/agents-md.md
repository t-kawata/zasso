---
type: "Reference"
title: "EXEC_ASSETS/AGENTS.md"
description: "Agent execution invariants for the laboratory."
sources: 
  - resource: "EXEC_ASSETS/AGENTS.md"
    id: "exec-asset-agents-md"
    title: "EXEC_ASSETS/AGENTS.md"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/AGENTS.md"
x-asset-sha256: "ae54286acb93bdb1bd96e16da6c938ebdf6f0da522097584bf3c92c9f860a639"
x-content-sha256: "b8055615625e077344bdd723a5cf72f4a370b82b47eee3a557795d8052868703"
x-requires: 
  - "pages/pre-okf-original/0-execution-contract"
x-source-span: "1-14"
x-topic: "exec-assets"
---
## EXEC_ASSETS/AGENTS.md

Agent execution invariants for the laboratory.

- role: Reference
- interface: none
- governing section: [0. Execution contract](../pre-okf-original/0-execution-contract.md)
- asset hash: `ae54286acb93bdb1bd96e16da6c938ebdf6f0da522097584bf3c92c9f860a639`
- source span: lines 1-14

```markdown
# Execution contract

Read the separately delivered COMPLETE_GUIDE.md. One current implementation only.
Prepare dependencies online; run experiment traffic through the isolated inner network.
Resolve actual OS image, credentials, interface, underlay IP and product CLI before execution.
Never fabricate product APIs, source revisions, successful tests or NAT classifications.
Use OOB management; prove path/cut/recovery before product acceptance.
One independent native network stack per endpoint node.
Host process and same-OS VMs are intentional; Ubuntu services do not replace native product binaries.
No production secrets, host-wide firewall flush, global route deletion, privileged containers or public fallback.
Run mutations serially. Preserve failed-run evidence. Timeout transport is not remote process cleanup.
Generated private keys remain secret; never include private/ in ordinary artifact uploads.
Scope results: static, infrastructure CLI, native path, NAT behavior, product, media quality, soak.
Treat exact bootstrap status as next-action instruction; resume after approved initial preparation.
```

[^exec-asset-agents-md]

[^exec-asset-agents-md]: EXEC_ASSETS/AGENTS.md — lines 1-14.
