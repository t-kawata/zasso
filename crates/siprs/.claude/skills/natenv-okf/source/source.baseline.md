# Native-OS WAN/NAT/VoIP/P2P Laboratory — Agent Execution Specification

Edition: 2026-11-17. Language: English. Delivery: this single specification; separate current-assets ZIP. Scope: architecture, rationale, prerequisites, provisioning, native endpoints, virtual topology, CLI control, observation, protocol testing, acceptance, diagnosis, recovery. No historical-document dependency. Shell snippets denote execution context explicitly; angle-bracket values require environment-specific resolution, never literal execution.

## 0. Execution contract

Mission: run actual Windows/macOS/Linux application binaries against real IP packets traversing a closed, configurable WAN/NAT dataplane inside one development PC. Include native clients, native application servers, native bootstrap/discovery servers, native relay servers. Keep Asterisk, coturn, routers, observers, tunnel ingress on Ubuntu containers. No substitution of Linux builds for Windows/macOS product validation; no GUI/audio-device/manual-listening oracle.

Separation:
- Product implementation: real target OS, target ABI, native socket/TLS/media implementation.
- Node isolation: Linux network namespace; Windows/macOS same-OS VM when independent network endpoints are required.
- Network semantics: Ubuntu kernel routing, nftables, conntrack, tc/netem.
- Connection carrier: WireGuard between native endpoints and Ubuntu ingress; encrypted underlay distinct from inner experimental traffic.
- Control: host agent, hypervisor CLI, guest command RPC, infrastructure SSH/Docker CLI; independent of experimental WAN availability.
- Evidence: application events, decoded payload, namespace packets/counters, node state, build/configuration provenance.

Initial success criterion: A and B behind independent NATs; S in routed WAN server segment; real UDP/TCP exchange; selective A-router cut stops A only; OOB remains usable; restoration recovers. Advanced NAT profiles/media quality/soak follow, not prerequisites for starting construction.

Status vocabulary: IMPLEMENTED, STATIC_CHECKED, RUN_PASS, RUN_FAIL, NOT_RUN, UNSUPPORTED, INPUT_REQUIRED, HUMAN_ACTION_REQUIRED, REBOOT_REQUIRED. Scope every verdict. A supplied script is not an executed result. Missing optional coverage does not erase valid infrastructure evidence; missing required product coverage cannot become release PASS.

Safety: dedicated lab directories/VMs; rootful Docker access treated as host-administrator authority; privileged setup limited to network construction. Run product binaries unprivileged. No privileged containers, host-network containers, Docker-socket mounts into SUTs, host-wide firewall flush, indiscriminate route deletion, global prune, public fallback, production credentials, secret-key collection. Trust assumptions explicit: cooperative SUT with configurable bind/bootstrap/relay/candidate policy; hostile arbitrary-binary containment is a separate hardening scope.

## 1. Terms, layers, fidelity

Node: independent IP stack/routing/socket context. Role: process function; client/bootstrap/relay may share a node only when intended. Process count is not node count. WAN/public: locally simulated public reachability, not ownership of Internet-routable space. Inner: application packets after WireGuard decapsulation. Outer/underlay: WireGuard UDP carrier over VM/host networking. OOB: management path outside experimental inner routing. SUT: actual product implementation. Oracle: programmatic expected-result evaluator.

Layer order: hypervisor -> underlay -> WireGuard ingress -> experimental routers -> services/peers -> application protocol -> decoded payload/quality. Diagnose in that order. Underlay NAT does not count as an experimental NAT stage: routers classify decapsulated inner tuples. Outer PersistentKeepalive does not refresh inner SIP/RTP/P2P conntrack entries.

Fidelity supplied: native target OS sockets, actual TCP/UDP/QUIC/RTP, Linux packet forwarding/NAT state, actual server implementations, real encode/decode where product supports file media. Fidelity not implied: every consumer-router/ALG behavior, cellular radio, BGP/geography, independent physical oscillators, Ethernet wire preambles/offload checksum behavior, Internet-scale capacity. Add only required fixtures; do not turn limitations into unrelated construction blockers.

## 2. Architecture and placement

```text
Native A: 10.78.1.10 -- WG-A --> ingress-a -- LAN-A -- ra -- [cga] --+
Native B: 10.78.2.10 -- WG-B --> ingress-b -- LAN-B -- rb ----------+-- virtual WAN
Native S: 10.79.0.10 -- WG-S --> ingress-s ------------------------+
                                                                  +-- Asterisk .10
                                                                  +-- observer .20/.21
                                                                  +-- coturn .30
```

Placement profiles:
- Linux: A/B/S host binaries in distinct network namespaces; Docker Engine on host or dedicated Ubuntu VM. No product container required.
- Windows: host=A, Windows VM=B, Windows VM=S, Ubuntu VM=infrastructure. Alternative: management-only host, all native nodes in Windows VMs.
- Apple Silicon Mac: host=A, macOS VM=B, macOS VM=S, Ubuntu Linux VM=infrastructure, subject to actual virtualization/license/resource limits. Resolve capacity before expensive provisioning; see Section 9. Same-OS VM runs native binaries, not an OS compatibility layer.

Separate bootstrap and relay processes may share S with distinct ports, configuration, events and lifecycle. Separate nodes only when independently impaired/addressed/isolated behavior is under test. Never create multiple tunnels in one native stack and call them independent nodes: local-address delivery may bypass routers.

Infrastructure containers use Ubuntu 24.04 LTS baseline. Dockerfile supports UBUNTU_IMAGE override. Ubuntu 26.04 LTS adoption requires package/kernel/CLI readiness checks then version pinning; not a silent migration during a run. Build final immutable images before isolated tests. Windows/macOS GUI applications require a CLI/test-control surface and synthetic input/decoded-output path; headless network tests do not certify UI rendering or device-specific behavior.

## 3. Address plan: single source of truth

|Domain|Prefix|Assignments|
|---|---|---|
|WAN|10.77.0.0/24|ra .2 single; rb .3; cga .4 double; PBX .10; obs .20; obs2 .21; TURN .30; ingress-s .50|
|LAN-A|10.77.1.0/24|ra .1; ingress-a .2|
|LAN-B|10.77.2.0/24|rb .1; ingress-b .2|
|Transit-A|10.77.10.0/24|cga .1; ra .2; double only|
|A tunnel|10.78.1.0/24|ingress WG .1; native A .10|
|B tunnel|10.78.2.0/24|ingress WG .1; native B .10|
|S tunnel/routed WAN|10.79.0.0/24|ingress WG .1; native S .10|
|Docker underlay|172.30.250.0/24|gateway .254; ingress a/b/s .11/.12/.13|
|Hyper-V underlay example|192.168.240.0/24|host .1; Ubuntu .2; Windows B .11; S .12|

Experimental Docker bridge IPAM gateways .254 remain unassigned using inhibit_ipv4. Internal bridges; Docker masquerading disabled. Only transport bridge has normal Docker gateway/NAT. WAN services have no default route; explicit S-prefix route via ingress-s. Ingress is dual-homed underlay/LAN or underlay/WAN, never masquerades inner packets.

Preflight: enumerate host/guest/VPN/Docker routes and interfaces. Reject conflicting prefixes before install. If remapping required, update generator, ingress guards, peer AllowedIPs, endpoint scripts, fixture, acceptance and service advertisements together. No partial textual replacement during a live run.

Published outer UDP: A 51821 -> ingress-a:51820; B 51822 -> ingress-b:51820; S 51823 -> ingress-s:51820. Host/guest WireGuard Endpoint must reach the published address, not an inaccessible Docker bridge address. Private keys unique per node/ingress; /32 peer source authorization server-side.

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

## 6. Ubuntu infrastructure bootstrap

Run inside Ubuntu host/VM:
```sh
cd ~/wan-lab
bash bootstrap/ubuntu.sh
```
Installs Docker official repository when Docker absent, Compose plugin, WireGuard tools, Python, SSH; checks kernel modules wireguard/nf_conntrack/sch_netem and interface creation. Existing incompatible Docker installation is not forcibly removed: inspect `docker version`, `docker compose version`, package ownership. Rootless Docker is not reference target. No `--privileged` workaround for missing host/backend kernel features.

Subsequent infrastructure commands require Docker-authorized user. Use an approved root shell or explicit sudo consistently. Docker group grants administrator-equivalent control; not automatically assigned. Root-created private files remain 0600; transfer through privileged OOB, never chmod world-readable.

Kernel checks:
```sh
uname -a
ip -br addr
sudo modprobe wireguard
sudo modprobe nf_conntrack
sudo modprobe sch_netem
sudo ip link add wg-check type wireguard
sudo ip link del wg-check
sudo docker version
sudo docker compose version
```
Missing module may be built-in; interface/runtime check is decisive. Missing module availability in Docker Desktop backend cannot be fixed merely by installing tools in containers.

Ubuntu transport static example; actual NIC name from `ip -br link`:
```yaml
network:
  version: 2
  ethernets:
    eth0:
      dhcp4: false
      dhcp6: false
      addresses: [192.168.240.2/24]
```
Dedicated transport only; no default gateway needed for offline Hyper-V lab. Keep separate Internet preparation NIC until images/dependencies cached, then detach/restrict. Avoid competing cloud-init/netplan owners. Validate `netplan generate`; apply through console/OOB or `netplan try`, not blind SSH self-disconnection. On Tart DHCP use actual NIC with `dhcp4: true`, `dhcp-identifier: mac` if `tart ip` cannot resolve DUID-based leases.

## 7. Windows host and native guests

### 7.1 Host preparation

Elevated PowerShell:
```powershell
Set-Location C:\WanLab
.\bootstrap\windows.ps1
```
Checks/enables Hyper-V, creates WanTransport Internal switch, host 192.168.240.1/24. Exit 10: reboot with approval, rerun. Unsupported edition/firmware: explicit prerequisite resolution. Do not silently upgrade OS edition. Reserve subnet after overlap check.

Hyper-V Internal switch connects host and VMs, not physical LAN by itself. Ubuntu VM .2; Windows B .11; S .12. IP management is separate from inner 10.77/78/79 ranges. External connectivity used only during preparation or by explicitly restricted management.

### 7.2 Native guest template

Fast path: approved powered-off prepared Gen2 Windows VHDX. Template includes supported guest OS, lab administrator, updates, Python, WireGuard, product native runtime, optional compiler, event logging. For independent identities/general distribution use Sysprep/generalize under OS requirements. Do not copy an active writable VHDX.

From ISO: create dedicated empty Gen2 VM, attach owner-provided ISO, choose correct edition/image index, unattended answer file when available. Answer file controls locale, dedicated-disk GPT/EFI/MSR/OS layout, InstallFrom, accepted license, lab account, first configuration. Never reuse destructive disk-selection automation against a physical PC. Windows Setup `autounattend.xml` is media/edition-specific; resolve image index using installation media rather than inventing one. First enrollment may be interactive; freeze template afterward. PowerShell Direct supplies repeatable post-install configuration even when setup hooks differ.

Creation from prepared disk:
```powershell
.\vm\windows-create.ps1 -Name wan-b -BaseVhdx C:\Images\windows-lab-base.vhdx
.\vm\windows-create.ps1 -Name wan-s -BaseVhdx C:\Images\windows-lab-base.vhdx
Start-VM wan-b
Start-VM wan-s
$cred=Import-Clixml C:\WanSecrets\guest.xml
Invoke-Command -VMName wan-b -Credential $cred -ScriptBlock { Get-NetAdapter; $PSVersionTable }
```
Ubuntu infrastructure is separate VM, no nested Hyper-V inside Windows guests. Ubuntu secure boot template when appropriate:
```powershell
Set-VMFirmware -VMName wan-infra -SecureBootTemplate MicrosoftUEFICertificateAuthority
```
Only apply to compatible actual image. VM disk copy script does not install guest OS or invent credentials.

### 7.3 Guest addressing and transfer

Via Direct, on dedicated fresh B guest:
```powershell
$nic=Get-NetAdapter | Where-Object Status -eq 'Up'
if(@($nic).Count -ne 1){throw 'Resolve NIC by MAC/name explicitly'}
Set-NetIPInterface -InterfaceIndex $nic.ifIndex -AddressFamily IPv4 -Dhcp Disabled
New-NetIPAddress -InterfaceIndex $nic.ifIndex -IPAddress 192.168.240.11 -PrefixLength 24
```
S uses .12. Inspect/remove only previously created lab address if rerunning. Never clear all host addresses. Direct remains available without IP connectivity.

```powershell
$s=New-PSSession -VMName wan-b -Credential $cred
Invoke-Command -Session $s -ScriptBlock { New-Item -ItemType Directory -Force C:\WanLab | Out-Null }
Copy-Item C:\WanLab\b.conf C:\WanLab\b.conf -ToSession $s
Invoke-Command -Session $s -ScriptBlock { Get-NetIPAddress; Get-NetRoute }
Copy-Item C:\WanLab\artifacts C:\WanLab\results\b -FromSession $s -Recurse
Remove-PSSession $s
```
Resolve local/remote path direction before transfer. Capture binary file SHA256 after copy. Host artifacts must not accidentally overwrite base templates.

### 7.4 Dependency installation

Use official signed WireGuard MSI and Python package matching architecture. `bootstrap/verified-download.ps1` requires resolved approved URL and expected SHA256; inspect Authenticode signer/status. Hash from same compromised channel is not independent authenticity. Record source/hash/version.

```powershell
$p=Start-Process msiexec.exe -ArgumentList '/i','C:\Install\wireguard.msi','/qn','DO_NOT_LAUNCH=1','/norestart' -Wait -PassThru
if($p.ExitCode -notin 0,3010){throw "MSI failure $($p.ExitCode)"}
```
Python installer unattended options depend on chosen distribution; official CPython example `/quiet InstallAllUsers=1 PrependPath=1 Include_test=0`; verify `python --version` and executable path afterward. SUT runtime dependencies installed from actual build manifest; do not install unrelated SDKs on every guest.

## 8. Mac host, native guests, OOB readiness

### 8.1 Tools and templates

Baseline: Apple Silicon. Host:
```sh
cd ~/wan-lab
bash bootstrap/macos.sh
tart --version
tart run --help
tart exec --help
```
Homebrew absence reports required initial approval. Inspect installer source; no unreviewed remote shell piped into root. `brew install openai/tools/tart` follows current upstream distribution; record actual version/source, not an assumed historical vendor.

Prepared image path:
```sh
tart clone ghcr.io/cirruslabs/macos-tahoe-base:latest wan-base
# Capture actual OS/image revision; pin before reproducible reruns.
tart clone wan-base wan-b
tart clone wan-base wan-s
tart set wan-b --cpu 2 --memory 4096
tart set wan-s --cpu 2 --memory 4096
mkdir -p artifacts/vm
tart run --no-graphics wan-b >artifacts/vm/b.log 2>&1 &
echo $! >artifacts/vm/b.pid
tart exec wan-b /usr/bin/sw_vers
```
Use image compatible with actual host/license; latest is acquisition convenience only. Prepared non-vanilla images normally include Guest Agent; confirm, do not infer from filename. User-session RPC agent and privileged resize daemon are distinct. Guest login/agent readiness belongs to template sealing.

OOB checks: `tart exec wan-b /usr/bin/id`; command printing stdout/stderr then exit 7 must preserve status; experimental tunnel down must not disable exec. For large binary transfer use verified shared files, not terminal streams.

```sh
# Start a stopped VM with explicit shares; never run same VM twice.
tart run --no-graphics --dir=lab:$HOME/wan-share:ro --dir=results:$HOME/wan-results wan-b
```
Confirm flags with pinned `tart run --help`. Guest share path commonly `/Volumes/My Shared Files/lab`; enumerate actual mounted shares. Use per-node key share; read-only product inputs, separate writable results. B must not read A/S private keys.

### 8.2 Keychain/privacy prerequisites

Headless VM startup on recent macOS may require existing unlocked login keychain. Diagnose `SecKeyCreateRandomKey_ios`, `Failed to generate keypair`, `Interaction is not allowed with the Security Server` before changing network configuration. Use existing approved keychain/session; `security unlock-keychain login.keychain` supports automation with protected secret input. Do not replace personal keychain or create empty-password keychains as a default. First permission/credential enrollment is preparation; repeated tests remain CLI-driven.

Local Network privacy may block host tools reaching private guest IPs. Grant appropriate approved permission once; broad global privacy preference changes are not default bootstrap actions. Guest Agent OOB avoids depending on experimental IP but does not remove every host OS authorization requirement.

Diagnostic host log:
```sh
log stream --predicate='process=="tart" OR process CONTAINS "Virtualization"' >artifacts/vm/virtualization.log
```
Bound duration externally; stop collector after incident. Guest IP discovery:
```sh
tart list
tart ip wan-b
tart exec wan-b /bin/sh -lc 'ifconfig -a; netstat -rn'
```
Ubuntu DHCP DUID issue: configure `dhcp-identifier: mac`; do not delete global host DHCP lease databases as routine repair. Shared-network guest access to host uses guest default-router IP; Softnet isolation changes that assumption.

## 9. Mac infrastructure and capacity selection

Preferred infrastructure: independent Ubuntu Linux VM under Tart; native macOS guests remain native. No Docker-in-macOS-VM nested virtualization assumption. Prepared Ubuntu image example:
```sh
tart clone ghcr.io/cirruslabs/ubuntu:latest wan-infra
tart set wan-infra --cpu 2 --memory 4096
tart run --no-graphics wan-infra
```
Run in managed background session for unattended operation. Inspect `/etc/os-release`, image identity, SSH user/key and disk size. If image is not selected Ubuntu release, choose compatible pinned image or install approved Ubuntu Server ISO once. Template contract: SSH readiness, approved user, sudo mode, network, cloud-init completion. A Linux image is not guaranteed to include Tart Guest Agent; use SSH for infrastructure.

Capacity decision, executed before full deployment:
1. Determine actual simultaneously runnable guest count, OS licensing terms, available RAM/disk, backend restrictions.
2. If host A + macOS B + macOS S + Ubuntu infrastructure runs, use complete simultaneous topology.
3. If guest limit blocks extra Ubuntu VM, evaluate host Docker Desktop Linux backend for infrastructure; require WireGuard interface, conntrack, netem, bridge options and published UDP checks. Tools installed in a container do not supply missing backend kernel modules.
4. If that backend fails, run smallest valid host A + macOS B + Ubuntu infrastructure profile. Co-located bootstrap/relay on B is explicitly NAT-B placement, not independent WAN S. Split scenarios or use additional host/remote infrastructure when independent S simultaneous coverage is required.
5. Mark `single_pc:false` whenever infrastructure or endpoint leaves the PC. Do not advertise full simultaneous single-PC coverage from a reduced profile.

VM limits are environment constraints, not hidden success assumptions. This selection preserves a practical construction path without claiming unavailable capacity. Intel Mac is outside baseline; requires separately qualified backend, not an Apple Silicon recipe copied verbatim.

## 10. Mac underlay: host ciphertext relay

Default Tart NAT: guests can reach host service at their default-router address; host services should bind 0.0.0.0 per upstream FAQ. Guest-to-guest direct reachability is not required by this carrier design. Host Python relay forwards encrypted WireGuard datagrams only; inner packets remain untouched until Ubuntu ingress.

```text
B WireGuard -> host:51822 -> outer-relay -> Ubuntu:51822
 -> Docker publish -> ingress-b:51820 -> decrypt -> LAN-B -> rb
```

Resolve addresses:
- INFRA_IP: `tart ip wan-infra`; if unresolved, inspect Ubuntu console/SSH/netplan DHCP identity.
- HOST_ROUTER_IP: in native guest, `netstat -nr | awk '/default/{print $2; exit}'`; verify IPv4 result and route context.
- GUEST_CIDR: actual guest underlay subnet, not hard-coded assumption.

Host example; substitute actual values:
```sh
mkdir -p artifacts/transport
python3 scripts/outer-relay.py --bind 0.0.0.0 --infra 192.168.64.3 \
  --allow 192.168.64.0/24 --allow 127.0.0.0/8 \
  >artifacts/transport/relay.log 2>&1 &
echo $! >artifacts/transport/relay.pid
```
Bind0 accepts all host IPv4 interfaces; restrict host firewall and `--allow` to actual lab sources. No Internet port forwarding. Each front port belongs to exactly one endpoint node. Script remembers latest permitted source per port; WireGuard authenticates ciphertext; do not share port across nodes.

Generate native configs with Endpoint=HOST_ROUTER_IP, not INFRA_IP. Docker `--bind` remains infrastructure-local published binding. Host A may also reach its own host-router IP; ensure --allow includes its actual source. Alternative host A Endpoint127.0.0.1 is safe after editing A config only, leaving B/S router IP. Underlay relay stop must stop test traffic while Tart exec and infrastructure SSH remain usable.

Relay is a carrier, not performance-neutral magic: record CPU, socket errors, throughput ceiling. Native packet MTU1280 initially. Outer relay overhead must not be mistaken for experimental-router capacity.

## 11. Generate, build, start infrastructure

Inside Ubuntu, current assets extracted to ~/wan-lab, Docker authorization established:
```sh
cd ~/wan-lab
python3 generate.py --endpoint 192.168.240.2 --variant single
# Mac relay profile: replace endpoint with actual HOST_ROUTER_IP.
./lab config > /tmp/wan-resolved.yml
./lab build
./lab up
./lab ps
python3 doctor.py
```
Generated: compose.json; generated/plan.json; private/a.conf,b.conf,s.conf; private/{a,b,s}/server.conf; artifacts/<service> directories. Server configs belong only to ingress; endpoint configs distributed only to corresponding native node. Keys generated locally using wg; 0700 private directory/0600 files. No keys shipped in ZIP.

Generator emits complete alternative topology; no cross-file network merge dependency. JSON is YAML-compatible Compose input. Single project name wan-experiment; only one generated topology active per infrastructure instance. Regenerate only after down/archive; existing compose.json refusal prevents accidental live rekey.

Logical ready versus service ready:
```sh
./lab exec obs ss -lntup
./lab exec obs2 ss -lntup
./lab exec pbx asterisk -rx 'core waitfullybooted'
./lab exec pbx asterisk -rx 'pjsip show transports'
./lab exec turn ss -lntup
```
Container healthfile means network startup script finished; not SIP/TURN protocol acceptance. `doctor.py` proves infrastructure command access only. Inspect its scope field.

Image reproducibility:
```sh
bash bootstrap/freeze.sh
```
Pin base digest, apt repository/package versions or snapshot, compiler/toolchain, source SHA and lockfiles for repeatable rebuilds. Image ID identifies an existing local build; manifest alone does not make future apt repositories immutable. After baseline freeze, export/cache approved images; no silent upgrade mid-comparison.

## 12. Native tunnels

### 12.1 Windows service

Elevated native host/guest, correct node config already securely copied:
```powershell
$w="$env:ProgramFiles\WireGuard\wireguard.exe"
& $w /installtunnelservice C:\WanLab\b.conf
if($LASTEXITCODE -ne 0){throw 'Tunnel install failed'}
Get-Service 'WireGuardTunnel$b'
& "$env:ProgramFiles\WireGuard\wg.exe" show b
Get-NetIPAddress -InterfaceAlias b
Get-NetRoute -AddressFamily IPv4
```
Filename determines service name; use single quotes around `$` service names. Host A uses a.conf; S uses s.conf. No UI manager needed. Generate traffic before treating an absent initial handshake as fault. Inspect latest handshake, received/sent bytes, assigned inner address, route.

```powershell
& $w /dumplog >C:\WanLab\artifacts\wireguard.log
& $w /uninstalltunnelservice b
```
Stop before replacing config; reinstall afterward. Administrator permission/ACL required. No `wg showconf` in ordinary artifacts: private keys would leak. Keep normal `wg show` hidden-key output.

### 12.2 macOS interface

Run inside each relevant host/guest, not only outer host. Install tools beforehand. Absolute configuration path avoids Homebrew prefix ambiguity:
```sh
sudo mkdir -p /usr/local/etc/wireguard
sudo install -m 600 b.conf /usr/local/etc/wireguard/wan.conf
sudo wg-quick up /usr/local/etc/wireguard/wan.conf
sudo wg show
ifconfig -a
route -n get 10.77.0.20
```
Discover actual utun interface by assigned10.78.2.10; never assume utun0. WireGuard userspace helper availability/PATH must work under sudo. Shutdown with same absolute config:
```sh
sudo wg-quick down /usr/local/etc/wireguard/wan.conf
```
A/B/S have separate OS stacks. `AllowedIPs` installs lab-specific routes only; no0.0.0.0/0, no management default-route takeover. A retained physical NIC is not a valid public-fallback escape hatch for the SUT.

### 12.3 Linux network namespaces

Root constructs topology; products run unprivileged. WireGuard interface created in host namespace retains outer UDP socket there; interface moved into endpoint namespace. No experimental default route to physical NIC.
```sh
sudo bash scripts/linux-endpoint.sh up a /absolute/private/a.conf
sudo bash scripts/linux-endpoint.sh up b /absolute/private/b.conf
sudo bash scripts/linux-endpoint.sh up s /absolute/private/s.conf
sudo ip netns exec wan-a runuser -u <actual-user> -- python3 /absolute/scripts/probe.py udp --bind 10.78.1.10 --target 10.77.0.20:9000
```
The script strips wg-quick-only Address/MTU directives, configures interface explicitly, preserves private-file permissions. Namespace has loopback+tunnel, only lab routes. Resolve actual executable/runtime paths, not container paths. If product requires DNS, `/etc/netns/wan-a/resolv.conf` and lab DNS fixture; numeric baseline needs none.

Cleanup refuses namespace deletion while processes remain:
```sh
sudo ip netns pids wan-a
sudo bash scripts/linux-endpoint.sh down a
```
Stop products first. Do not delete namespaces merely to conceal leaked processes.

## 13. Native firewall and cooperative routing contract

Every SUT binds assigned inner IP. All product bootstrap/relay/candidate configuration references lab services. Disable public discovery/PKARR/mDNS/public relays unless specifically under test. Test mode must expose this configuration; if absent, implement small adapter rather than invent a CLI flag.

Windows listener rules example on S:
```powershell
New-NetFirewallRule -Name WanProbeUDP -DisplayName WanProbeUDP -Direction Inbound -Action Allow -Protocol UDP -LocalAddress 10.79.0.10 -LocalPort 9000 -RemoteAddress 10.77.0.0/16,10.78.0.0/16,10.79.0.0/24
New-NetFirewallRule -Name WanProbeTCP -DisplayName WanProbeTCP -Direction Inbound -Action Allow -Protocol TCP -LocalAddress 10.79.0.10 -LocalPort 9000 -RemoteAddress 10.77.0.0/16,10.78.0.0/16,10.79.0.0/24
```
Add actual product/RTP ports and executable constraints as needed. Remove rules by exact Name afterward. Do not disable Windows firewall globally. Windows explicit-block precedence means a blanket program deny plus narrower allow may not implement intended policy; test targeted policy on dedicated guest.

Mac Application Firewall/TCC may affect server/device access. Prepare signed binary permissions/test-media mode; do not flush all pf rules or change personal-host security globally. Stronger confinement: dedicated guest, remove IP management NIC after preparation, retain OOB guest agent, single test tunnel interface. Cooperative host-node routing is not hostile-process sandboxing; state scope honestly.

Loopback IPC between agent and local product may be valid control, but peer payload must not use localhost/host management IP. Candidate enumeration must not publish another node's management subnet as a permitted shortcut. Record rejected candidates and unexpected egress attempts.

## 14. Packet path and NAT semantics

A -> observer, single:
```text
A 10.78.1.10:42000 -> WG encryption -> published UDP51821
 -> ingress-a wg0 decapsulation, same inner source
 -> LAN-A -> ra SNAT10.77.0.2:mapped -> observer10.77.0.20:9000
 -> conntrack reverse -> ra route10.78.1/24 via10.77.1.2 -> WG -> A
```
Double: ra source10.77.10.2 then cga source10.77.0.4. Observer sees .4 only; capture ra and cga to prove two translations. B remains .77.0.3. S source10.79.0.10 preserved to WAN observers; WAN nodes route10.79/24 via .77.0.50. S sees client NAT sources, not original private addresses.

Router baseline: invalid drop; established/related accept; declared LAN->WAN sources accept; remaining forward drop; fixed egress-IP SNAT. Does not automatically certify full-cone/symmetric/EIM/EIF. Mapping and filtering are independent measurable properties.

Ingress forward: wg0->LAN only declared lab destinations; LAN->wg0 only its endpoint /32. Underlay output/default route only carries WG/control. NAT routers are not connected to Docker underlay. WAN services cannot default-route to Internet. Container output guard blocks embedded resolver127.0.0.11 and non-lab output; only WireGuard ciphertext carrying fwmark0x77 may use underlay destinations. Numeric-IP baseline; unserved lab DNS10.77.0.53 intentional. No unintended IPv6 inside infrastructure; native IPv6 disabled/restricted or separately scoped to prevent shortcut.

Probe RTT is request/echo duration; not RTP jitter, one-way delay, MOS or calibrated throughput. Tunnel MTU1280 is initial reference, not universal optimum. Fragmentation/PMTUD and carrier bottlenecks are separate measurements.

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

## 16. Topology switching, extra nodes, DNAT

Switch single->double: stop SUTs; stop captures; collect/archive; endpoint tunnels down; `./lab down`; move compose.json/private/generated into protected run archive; rerun generator `--variant double`; distribute fresh node configs; up/tunnels/P01-P05. Do not reuse stale handshake/keys/results.

Third+ stage: new transit prefix and router; explicit upstream next-hop; source allow/SNAT based on packets actually received after preceding SNAT; expected outermost IP; per-stage capture and qualification. Adding a second endpoint NIC is not another NAT stage.

Additional WAN node S2: endpoint10.79.1.10/24; ingress WG10.79.1.1; ingress WAN10.77.0.51; published UDP51824; unique key pair. Add WAN routes10.79.1/24 via.51, extend native AllowedIPs/ingress guard to required10.79 range, inventory and assertions. Outer relay requires matching extra front port. Do not merely copy secret files.

NAT-side server: add dedicated LAN-S/router rs, move ingress-s from WAN to LAN-S, remove old WAN route directly to ingress-s. Public façade=rs WAN IP; DNAT listening/relay ports; product advertisement=public façade. Retaining direct10.79 route defeats NAT placement.

V2 router chain names: `ip labnat pre`, `ip labnat post`, `inet lab forward`. Dedicated-router DNAT pattern:
```sh
nft add rule ip labnat pre iifname "$WANIF" ip daddr "$PUBLIC" udp dport "$PORT" dnat to "$PRIVATE:$PORT"
nft insert rule inet lab forward iifname "$WANIF" ip daddr "$PRIVATE" udp dport "$PORT" counter accept
```
Variables resolved in dedicated router before execution; add TCP separately; use range-preserving DNAT for allocated relay/RTP ports. Addresses/ports in SIP/relay advertisement do not install router rules. Hairpin not automatically implemented; separate case/fixture.

## 17. Product build, native dependencies, adapter contract

Build on actual target-compatible toolchain; record source SHA, lock hash, compiler, target triple, architecture, native library/codec flags, shared-library dependencies. Rust/PJSIP specifics: exact PJPROJECT revision, binding ABI, thread registration, callback ownership/lifetime, static/shared linkage, feature flags, TLS/SRTP/codec availability. Avoid invented universal Rust crate/API.

Online prepare: resolve Cargo/native dependencies, build, populate caches or install binaries. Offline test: no dependency fetch through inner network. Linux source mount can remain readonly with separate target/cache; Windows/macOS guests use actual product paths. Build scripts writing source require disposable worktree, not chmod of production repository.

Native executable launch manifest:
```json
{"node":"b","executable":"C:\\WanLab\\bin\\actual-client.exe","args":["--config","C:\\WanLab\\runs\\case01\\b.json"],"cwd":"C:\\WanLab","ready_event":"ready","startup_timeout_s":30,"stop_timeout_s":10}
```
Example contract, not a shipped executable/guaranteed flag. Replace with actual CLI or implement adapter. Config must allow bind IP, server/relay endpoints, no-public-fallback policy, deterministic stimulus, event sink, finite shutdown.

Events: schema_version, run_id,node,monotonic_ns,wall_time,event,operation_id,peer/session/call ID, local/remote tuples, outcome,error_category. Product-specific fields below. Unknown required schema/version -> parser failure, not empty success. Command acknowledgment differs from completed operation.

Control: start/ready, connect/listen/register, call/answer/hangup, transfer, disconnect, reconnect/restart, shutdown; applicable capabilities declared. No required video/text/data PASS if feature absent. Unsupported optional mode explicitly scoped out.

Lifecycle: PID+starttime+executable, stdout/stderr, ready deadline, operation deadline, graceful stop deadline, forced termination, cleanup evidence. Windows Start-Process -PassThru with redirected outputs; Mac/Linux PID/job control; always terminate guest children, not merely host `tart exec` process.

## 18. Native bootstrap/discovery server

Default S10.79.0.10, real product port/protocol. A/B register and lookup via S. Ticket/address distribution by host files allowed only for transport isolation fixtures; never discovery acceptance.

Observe: authenticated peer ID, registrations, observed source, advertised candidates/relay, TTL/refresh, lookup hit/miss, expiry, authorization/error, request/byte counts, process resources. Distinguish bootstrap availability from established connection viability.

Cases: normal A/B discovery; unknown peer; bad auth; refresh; expiry; stale candidates; server stop/restart; reconnect after state reset. Product design defines whether existing peer sessions survive bootstrap loss. Record expected behavior before run.

NAT-side bootstrap: use Section16, explicit published façade/DNAT/advertisement. Closed inbound with no traversal mechanism is expected reachability failure, not an infrastructure bug. Distinct discovery backend/local DNS may be added when product requires it; public defaults invalidate closed-lab assumptions.

## 19. Native relay server and path transition

Default S, separate process/port/log from bootstrap. Actual product relay, not coturn unless product implements TURN. Authentication/identity/ALPN, session lifecycle, per-direction bytes, queue/backpressure, reconnect reason. Co-location does not imply protocol interchangeability.

Cases:
- R0 listener/auth/basic transfer oracle.
- R1 direct unavailable, relay available -> exact payload hash/sequence success, relay counters increase, no unexpected direct traffic.
- R2 direct+relay unavailable -> finite classified failure.
- R3 established direct then direct-only cut -> relay migration latency/data continuity where supported.
- R4 relay outage during direct -> documented behavior; relay-only fails; recovery after restart.
- R5 stale allocation/session expiry, reconnect, slow receiver, cancellation, half-close, overload.

Blocking all UDP also blocks UDP-based relay. For TCP relay fallback, all-UDP-cut may be valid; otherwise block peer direct destination tuples while allowing relay tuples. Implement filter at priority before established acceptance or existing direct flow survives. Application force-relay flag useful but requires packet/counter corroboration.

Native relay behind NAT: forward control AND data/allocation range; preserve port mapping expected by advertised address. A successful frontend connection does not prove returned relay candidates usable. Qualify traffic from independent NATed client nodes, not two utility sockets in one node.

## 20. Asterisk reference service and SIP

PBX10.77.0.10; UDP/TCP5060; 1001/lab-1001 and1002/lab-1002; ulaw/alaw; RTP10000-10199; direct_media=no; symmetric RTP, force_rport, rewrite_contact; ICE disabled baseline. Passwords intentionally fixture-only. No public deployment.

A registers1001, B1002, A dials1002. Extension600 echo checks one endpoint path, not bidirectional peer call. Expected sequence: challenge/authenticated REGISTER/200, contact refresh; INVITE/180-or183/200/ACK; media; BYE/200. Negative: wrong password, timeout, busy, no answer, CANCEL; retransmission and recovery budgets.

Infrastructure CLI:
```sh
./lab exec pbx asterisk -rx 'pjsip show transports'
./lab exec pbx asterisk -rx 'pjsip show endpoints'
./lab exec pbx asterisk -rx 'pjsip show contacts'
./lab exec pbx asterisk -rx 'core show channels concise'
./lab exec pbx asterisk -rx 'pjsip show channelstats'
./lab exec pbx asterisk -rx 'pjsip set logger on'
./lab exec pbx asterisk -rx 'rtp set debug on'
# Diagnostic run only; restore:
./lab exec pbx asterisk -rx 'pjsip set logger off'
./lab exec pbx asterisk -rx 'rtp set debug off'
```
Version-dependent command absent -> `core show help`, identify equivalent; missing evidence is not successful empty output. Heavy RTP debug perturbs timing; separate diagnostic/performance runs.

Private PBX recipe: move PBX to dedicated LAN IP, configure transports local_net plus external_signaling_address/external_media_address, install actual SIP/RTP DNAT and forwarding, give PBX appropriate gateway, qualify from outside node. Same-LAN client uses private registrar unless hairpin specifically implemented. Advertisements alone never open NAT. Keep dedicated config rather than mutating baseline shared file and forgetting to restore.

SIP TLS/video not baseline. Add certificates/transports/codecs/SDP fixtures and real decoded checks when required. Asterisk-anchored RTP can succeed without product ICE/TURN; never infer those features from PBX call success.

## 21. Headless VoIP, identity, quality, surrogate scope

No audio device requirement if product supplies deterministic PCM source and decoded sink. Null audio supplies timing, not meaningful signal. PJSUA/PJMEDIA wiring: player/source -> call conference slot; call slot -> recorder; active timing device; separate TX/RX paths. Distinct seed/stimulus per direction, temporal markers; sample rate/channels/codec fixed.

Stimulus: deterministic speech-like multitone/chirp or known WAV; receive decoded PCM/WAV. Assertions: sample count/duration, correct stimulus identity, lag, gaps, energy/clipping, codec/resampler baseline, direction distinction. RMS/non-silence does not prove correct remote signal; recorder loopback can create false success.

PJSUA surrogate optional: build audited PJPROJECT revision with software audio/files and null timing support. Inspect `pjsua --help`; use actual supported flags (`--null-audio`, `--play-file`, `--auto-play`, `--rec-file`, `--auto-rec`, auth/registrar). Drive CLI by pipe/FIFO, auto-answer; no terminal keystrokes. Linux surrogate validates reference service/dataplane, never native product acceptance. Do not assume identical optional flags across builds.

Native Rust/PJSIP adapter events: SIP status/auth retries, registration expiry, dialog tags/CSeq, SDP offer/answer, codec/ptime, ICE candidates/checklist/selected pair, DTLS/SRTP state when supported, SSRC/sequence/timestamp, RTCP SR/RR, loss/late/reorder/duplicate, jitter-buffer stats, PCM count/stimulus/hash/error. Redact secrets; key logs explicit opt-in and restricted artifact.

Audio quality: codec-aligned resampling, lag-search normalized correlation, drift estimation, packet-loss concealment effects. RTP jitter definition and decoded gap definition explicit. RTCP consistency separate from application loss. MOS/PESQ/POLQA require actual applicable algorithm/reference/license; never synthesize MOS from RTT/jitter.

Video optional: generated frame IDs/markers, software codec, decoded checksum or PSNR/SSIM as applicable, timestamps, freeze/gap counters. No camera/display needed for codec/network test; no claim of real camera/GPU/display certification.

### 21.1 Executable stimulus/decoded-audio oracle

Prepare observer tools in an online stage, not isolated product network:
```sh
python3 -m venv .media-venv
.media-venv/bin/pip install -r requirements-media.txt
.media-venv/bin/pip freeze > artifacts/media-tools-lock.txt
.media-venv/bin/python scripts/media.py generate --out a-tx.wav --seed 101
.media-venv/bin/python scripts/media.py generate --out b-tx.wav --seed 202
```
Windows virtualenv interpreter: `.media-venv\Scripts\python.exe`. Feed a-tx into A, b-tx into B, record a-rx/b-rx separately. Then reference a-tx against b-rx, b-tx against a-rx:
```sh
.media-venv/bin/python scripts/media.py check --reference a-tx.wav --received b-rx.wav --max-lag-ms 2000 --min-correlation .9 --min-seconds 20
```
PCM16 mono and equal sample rates required. Explicitly resample actual output beforehand using approved media tooling or product adapter; preserve originals and resampling command. Checker measures bounded-lag identity/energy/clipping, not drift compensation/MOS/POLQA. Short overlap or large clock drift requires a more specific quality oracle; inspect overlap_seconds, not only pass bit. Tune codec-specific threshold using nominal reference. Freeze exact NumPy version after first successful preparation; requirements range is bootstrap compatibility, not reproducible lock.

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

## 23. QUIC/iroh/custom P2P specifics

Use actual locked library version and source; relay/discovery builder names/schema change. For iroh, relay is not coturn. Local relay URL, authenticated endpoint identity, ALPN and candidate policy explicit; disable production relays/address lookups/PKARR/DNS/mDNS when excluded. Static ticket transfer bypasses discovery and must be scoped accordingly.

Reference relay on Ubuntu: choose compatible full source commit, inspect repository workspace/package/features/binary/config schema, build `--locked --release` with those actual names; freeze artifact. Do not guess an obsolete monorepo package path. Reference HTTP/dev mode may omit QUIC address discovery/TLS; health endpoint success is not NAT-traversal certification. For TLS/address-discovery production mode inspect listeners and actual protocol response, import local trust correctly.

If relay itself is custom native SUT, run on native S instead of substituting Ubuntu reference service. Distinguish these roles in inventory.

Cases: WAN-direct baseline; A/B NAT; double; direct unavailable; relay-only; both unavailable; direct->relay fallback; relay outage during direct; endpoint restart; NAT reset/rebind; address churn; many streams/datagrams; half-close/cancel/backpressure/slow receiver; ALPN/identity mismatch; duplicate-delivery exclusion; bounded memory. Direct success is conditional on measured NAT behavior, not universal expectation.

Events: node/peer IDs, local/remote tuples, path enum/history, relay URL, transition timestamps, direct/relay bytes, handshake/RTT/loss/congestion data where API exposes it, stream error, app sequence/hash, reconnect cause. If no path counters, instrument crate or corroborate qualified packet/server counters. Low latency and successful connect are not direct-path proof. Encrypted PCAP does not reveal plaintext integrity.

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

## 26. Packet capture, state, observation

Start capture before discovery/auth/handshake. Stop/flush before final archive. Per-service 32MB x8 ring, full snaplen; long run exports before overwrite. Capture loss/rotation invalidates missing-packet conclusions for affected interval. `any` duplicates forwarded views and uses cooked link-layer format; retain interface/direction metadata.

```sh
./lab capture-start
./lab exec ra ip -j address
./lab exec ra ip -j -4 route show table all
./lab exec ra nft -a list ruleset
./lab exec ra conntrack -L -o extended
./lab exec ra tc -s qdisc show
./lab exec ingress-a wg show wg0
./lab exec ingress-a ss -lunp
# Execute scenario.
./lab capture-stop
./lab collect
```
Every service artifact directory separate; `/out` equals artifacts/<service>, not artifact root. `state.sh` records command status; unsupported/permission failure remains visible. `collect` nonzero reflects missing collection components, not necessarily whole product failure; scope assertions appropriately.

Exact link capture:
```sh
./lab exec ra sh -c 'tcpdump -i "$(cat /run/wan.if)" -nn -s0 -c 1000 -w /out/wan.pcap'
```
Count may not be reached; external deadline or background PID required. For tunnel ingress, distinguish encrypted underlay packets and decrypted wg0 packets; inner NAT tests inspect latter.

Decode actual existing filename, not assumed ring suffix:
```sh
./lab exec ra ls -lh /out
./lab exec ra tshark -n -r /out/packets.pcap0 -Y sip -T json
./lab exec ra tshark -n -r /out/packets.pcap0 -Y 'stun || turnchannel' -T json
./lab exec ra tshark -n -r /out/packets.pcap0 -q -z conv,udp
./lab exec ra tshark -n -r /out/packets.pcap0 -q -z rtp,streams
```
Use `tshark -G protocols/fields` to resolve versioned dissectors; invalid filter is failure. RTP depends on SDP/heuristics/explicit decode. SRTP/QUIC encrypted capture alone cannot prove decoded media. Force-decode only documented range and record assumption. Merge rings with mergecap when needed, preserve originals.

Native observation: Windows vm/windows-collect.ps1 -OutDir; Mac bash vm/macos-collect.sh <dir>; Linux `ip netns exec ... ss/ip`. Host process listings do not include guest PIDs; namespace companion process views do not automatically include other container PID namespaces. Collect within actual SUT node/process context.

Correlate wallclock and monotonic timestamps, run/call/session IDs, tuples, sequence. Different VM clocks not identical; naive one-way latency across PCAP timestamps invalid without synchronization/error budget. Same-node RTT or corrected clock model preferred. Never change host clock to simulate guest/application drift.

## 27. Diagnostic decision tree

|Observed boundary|Next investigation|
|---|---|
|VM stopped|hypervisor state/start; resources/image|
|guest exec fails|credential/agent/user-session/keychain, not NAT|
|WG no handshake|Endpoint reachability/publish/firewall/key pairing/clock|
|handshake but no inner send|SUT bind/routes/AllowedIPs/native firewall|
|ingress wg inner present, LAN absent|ingress routes/forward/counters|
|RA LAN present, WAN absent|router policy/route/rp_filter/current fault|
|WAN present, server absent|server route/listener/firewall/advertisement|
|server reply, RA WAN reply, LAN absent|conntrack/NAT reverse/filter|
|ingress WG TX, native no data|peer selector/native route/firewall|
|SIP success, no RTP|SDP/RTP range/slot/codec|
|RTP present, PCM wrong|decode/crypto/stimulus/loopback/recording|
|P2P success, path unknown|product telemetry + relay/router byte evidence|

Capture facts before mutation. One configuration change per hypothesis. Collect stdout/stderr/exit at every boundary. Repair narrowest failing layer, not automatic full reinstall. If state uncertain after fault, bounded recreation is valid; preserve failed-run evidence first.

Mac startup errors: inspect keychain and Virtualization log. `tart ip` failure: DHCP identifier/lease resolver before assigning random addresses. Carrier relay error: front allowlist, host reachability, infra IP changed, UDP publish; inner NAT not yet implicated. Windows Direct failure: host privilege/guest credential/guest OS compatibility/running state; guest IP firewall irrelevant to Direct.

## 28. Result schemas, quality gates, repetitions

Per-run fields:
```text
run_id,scenario,seed,host_os,guest_os,arch,vm/image_ids,source_shas,lock_hash,
topology,nat_profile_id,qualification_hash,link_profile,resources,
expected_path,observed_path,setup_ms,media_start_ms,rtt_percentiles,
loss_definition,jitter_definition,decoded_hash,correlation,lag_ms,drift_ppm,
gaps,clipping,bytes_direct,bytes_relay,reconnect_ms,rss_fd_task_deltas,
assertions[{name,status,expected,observed,threshold,evidence}],status,exit_code
```
Thresholds version-controlled before run. Initial engineering-policy examples, not external standards: zero corruption; zero unexpected direct traffic in relay-only case; negative completion<=15s; nominal call setup<=5s; bidirectional media>=20s; nominal RTP loss<=0.1%; PCM RMS>=100/32768; clipping<1%; correlation>=0.9 after codec/lag alignment. Calibrate codec baseline before using correlation threshold. Lossy profiles derive budgets from impairment and repeated baseline, not copied nominal targets.

Repeat baseline>=30 as initial policy, more when reliability claim requires. Report success/total and confidence interval. Zero failures in n independent comparable trials gives one-sided95% upper failure bound `1-0.05^(1/n)`, approximately3/n; no observed failure is not zero probability. Scheduling remains nondeterministic despite seed.

Soak policy example>=1h plus1000 call/connect cycles; warmup then resource slopes; RSS/fd/task/handle/channel/allocation leaks; expiry cleanup; no stale service sessions. Fix capacity budgets from measured baseline. Underlay relay/VM CPU saturation identified separately from network profile. ARM emulation/Rosetta results separate from native architecture performance.

Release scopes: topology/path; required NAT properties; actual native SIP/decoded media; actual TURN; actual custom P2P bootstrap/relay/direct/recovery; required media/data modes; quality/soak; complete provenance. Infrastructure PASS is useful independently; full release requires only declared mandatory scopes, no silent skip.

## 29. Security, provenance, cleanup

Artifacts may contain SIP auth, identities, plaintext media, private addresses, tokens, optional TLS keys. Restrict access; explicit approval/redaction before upload. Do not collect private WG configs or key-bearing command dumps. `docker inspect` may reveal env secrets; prefer protected config/secret mechanisms for product credentials.

Run directory unique UTC timestamp+random suffix. Save resolved config, source/lock hashes, image IDs/digests, host/guest/kernel/tool versions, public-key fingerprints only, seed, resource limits, mutation sequence, command/exit/events, PCAP/drop stats, result schema. Static validation and observed execution separate.

Cleanup order:
1. Stop products gracefully; deadline then process-tree termination.
2. Stop/flush captures; collect guest and infrastructure state.
3. Hash/archive complete run, verify copied artifacts.
4. Disable native tunnels; uninstall Windows tunnel services.
5. `./lab down` using actual overlay sequence if applicable.
6. Stop run VMs; keep immutable templates; delete clones only by explicit identity.
7. Remove exact created firewall/route rules; stop host outer relay.
8. Confirm no residual processes/listeners/interfaces/routes.

Never global prune, host nft/pf flush, blanket firewall disable, delete arbitrary host routes/VM disks, or silently destroy existing templates. Generated config/key archive protected; ordinary evidence archive excludes secrets. Failed runs retained.

## 30. Template sealing and automation boundary

Template seal checklist: OS/arch/version; approved accounts; agent OOB ready after restart; stdout/stderr/exit7 check; file SHA round-trip; WG interface create/delete; tools/runtime version; automatic service readiness; guest shutdown; immutable image hash/export. Clone for experiments.

Cold machine may need firmware setting, admin approval, OS license/media, initial image setup, credential/TCC/keychain enrollment. Automation reports precise boundary once, then resumes; does not bypass security dialogs or claim GUI-free firmware interaction. Standard repeated build/test/observe/recover cycle remains CLI-only.

Current assets include implementation starting points, not proprietary images or unknown product adapters. Fully specified command contracts and diagnostics replace hidden assumptions; supported platform branches documented. Runtime checks on target machine supply confidence progressively, not a binary demand for universal prior certification.

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

## 32. Source-grounded platform facts and verification scope

PowerShell Direct: Hyper-V host execution inside supported Windows guest without guest networking. Tart Guest Agent: `exec` I/O/exit, user-agent RPC readiness, independent of guest IP. Tart FAQ: keychain/headless caveats, default-NAT host access versus Softnet, DHCP identifier issue. WireGuard Windows: signed MSI deployment, tunnel service CLI, hidden-key state/logging. Linux WireGuard: namespace socket-origin mechanism. NAT RFC: mapping/filtering/hairpin distinctions.

Relevant live-source identifiers: [web:124], [web:170], [web:168], [web:183], [web:33], [web:47]. Source locator metadata included in ZIP for offline resolution. No historical source documents packaged. Release verification report identifies exactly executed local static/loopback tests; excludes Hyper-V/macOS/Docker dataplane execution not performed during document generation.

## 33. Wiki decomposition

Split by numbered section: contract; architecture/address plan; OS provisioning; underlay; native tunnels; path acceptance; product adapters; bootstrap; relay; SIP/media; TURN/TLS; P2P; NAT; fault injection; observation; diagnosis; result/provenance; cleanup. Preserve central address plan and asset map as single authoritative pages. Do not duplicate mutable IP/port tables across independently edited pages. Each operation page specifies context, prerequisites, command, ready criterion, expected evidence, failure branch, rollback.
