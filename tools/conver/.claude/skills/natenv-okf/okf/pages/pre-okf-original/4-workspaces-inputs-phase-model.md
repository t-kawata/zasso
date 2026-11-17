---
type: "Page"
title: "4. Workspaces, inputs, phase model"
description: "Recommended roots: Windows C:\\WanLab; Mac/Linux ~/wan-lab; infrastructure ~/wan-lab. Extract current-assets ZIP there. `lab` wrapper executes only on Linux infrastructure. Native Windows commands use"
sources: 
  - resource: "sources/pre-okf-original.md"
    id: "pre-okf-original-6"
    title: "4. Workspaces, inputs, phase model"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-content-sha256: "9726cff08a8b470754cbd0b77a24e8b1ebd752245b3d3d00df24efad197047a5"
x-requires: 
  - "pages/pre-okf-original/3-address-plan-single-source-of-truth"
x-source-alias: "sources/pre-okf-original.md"
x-source-span: "71-95"
x-topic: "pre-okf-original"
---
## 4. Workspaces, inputs, phase model

Recommended roots: Windows C:\WanLab; Mac/Linux ~/wan-lab; infrastructure ~/wan-lab. Extract current-assets ZIP there. `lab` wrapper executes only on Linux infrastructure. Native Windows commands use PowerShell; native Mac/Linux commands use shell. File paths are local to stated execution context.

Required environment inputs:
|Input|Resolution|
|---|---|
|OS/edition/arch/resources|CLI inventory, no user question unless ambiguous|
|Windows media/base VHDX/license|owner-approved image; never unauthorized download|
|macOS image/template/license|approved prepared image or one-time IPSW preparation|
|Guest credential|secret store; initial enrollment may require approval|
|Infrastructure endpoint|actual reachable underlay IP or host outer-relay IP|
|Product source/build/config/CLI|actual repository; implement adapter contract if missing|
|Required scenarios|initial path tests then applicable product scopes|

Phases: INVENTORY -> HOST_TOOLS -> VM_TEMPLATES -> INFRA_TOOLS -> GENERATE -> BUILD -> UP -> ENDPOINTS -> PATH_ACCEPTANCE -> PRODUCT_TESTS -> EVIDENCE -> CLEANUP. Prepare Internet access allowed for downloads/builds; isolated test phase must not fetch dependencies via experiment routers. Preserve online cache/build manifests.

Bootstrap idempotency: inspect existing state; install absent dependencies; never overwrite existing VMs/configuration silently. Generator intentionally refuses existing compose.json. Reboot resumes same bootstrap command. VM/media/license/auth boundaries report exact action and resume command, not a vague request.

```json
{"status":"HUMAN_ACTION_REQUIRED","code":"FIRMWARE_VIRTUALIZATION_DISABLED","action":"Enable hardware virtualization under approved firmware policy","resume":"bootstrap/windows.ps1"}
```

Record shell/OS/tool versions, architecture, available disk/RAM, hypervisor, VM limits. Allocate a few GiB RAM per guest initially, then measure; no universal capacity guarantee. VM count/resource rejection is a topology choice, not permission to claim unexecuted simultaneous coverage.

[^pre-okf-original-6]

[^pre-okf-original-6]: 4. Workspaces, inputs, phase model — sources/pre-okf-original.md, lines 71-95.

