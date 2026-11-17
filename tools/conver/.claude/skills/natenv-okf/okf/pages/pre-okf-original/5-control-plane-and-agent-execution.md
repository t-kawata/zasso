---
type: "Page"
title: "5. Control plane and agent execution"
description: "Windows OOB: PowerShell Direct, host-to-guest, no guest IP network requirement. Mac OOB: Tart Guest Agent `exec`, command I/O and exit status over VM communication, not experimental IP. Ubuntu"
sources: 
  - resource: "sources/pre-okf-original.md"
    id: "pre-okf-original-7"
    title: "5. Control plane and agent execution"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-content-sha256: "193796631f340ba9a323ce8f19a8344e5978b6bfb6967d456306f5625a8f802b"
x-requires: 
  - "pages/pre-okf-original/4-workspaces-inputs-phase-model"
x-source-alias: "sources/pre-okf-original.md"
x-source-span: "96-123"
x-topic: "pre-okf-original"
---
## 5. Control plane and agent execution

Windows OOB: PowerShell Direct, host-to-guest, no guest IP network requirement. Mac OOB: Tart Guest Agent `exec`, command I/O and exit status over VM communication, not experimental IP. Ubuntu management: host SSH over underlay or hypervisor console; Docker CLI inside infrastructure. Linux namespace management: host `ip netns exec` plus ordinary process control.

Management invariants: experimental cut cannot remove execution/log retrieval; guest OS must remain responsive; final recovery may stop/start VM from host. OOB transport outage and application dataplane failure are distinct. Never rely solely on SSH through a NAT-under-test.

Common runner:
```sh
cp inventory.example.json inventory.json
# Resolve actual VM names, SSH target and credential path.
python3 agent-run.py --node infra --script jobs/infra-state.sh --timeout 180
python3 agent-run.py --node mac-b --script jobs/mac-state.sh --timeout 120
```
Windows host:
```powershell
python agent-run.py --node win-b --script jobs/windows-state.ps1 --timeout 120
```
Runner writes artifacts/agent/<run-id>/{script.txt,stdout.bin,stderr.bin,result.json}; secrets must not appear in job source. Command execution may succeed while a nested native executable fails: PowerShell jobs must check `$LASTEXITCODE` and throw/exit explicitly.

Runner timeout kills local transport, not guaranteed remote children. Long-lived SUTs: guest-managed process/service with PID, start time, executable identity, ready event, stop command. On timeout collect OOB, terminate guest process tree, preserve output, then reset only affected fixture.

Windows credential enrollment once:
```powershell
New-Item -ItemType Directory -Force C:\WanSecrets | Out-Null
Get-Credential | Export-Clixml C:\WanSecrets\guest.xml
```
DPAPI CLIXML bound to creating host/user; restrict ACL; do not commit or transfer as portable credentials. Unattended controller uses same authorized principal. Mac guest `sudo -n` requires prepared limited privileges; interactive password prompts inside jobs are failures, not acceptable waiting states.

[^pre-okf-original-7]

[^pre-okf-original-7]: 5. Control plane and agent execution — sources/pre-okf-original.md, lines 96-123.

