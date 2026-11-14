# Simulated NAT environment — CLI-only, single-host, real-packet WAN/NAT/VoIP/P2P laboratory

## 0. Status; scope; non-negotiable truth

Reference implementation + operator/build/test specification. Three standalone Compose documents;
common Dockerfile; namespace routing/NAT; bounded fault injection/capture; dependency-free Rust TCP/UDP
probes and host-side integration tests; Asterisk/coturn configurations (Ubuntu24.04 packages available [web:95][web:101]); optional PJSUA surrogate;
Rust-SUT namespace overlay; pinned-source iroh-relay build/overlay. No GUI/audio hardware required.

Execution status: generated/static-reviewed here; Docker daemon/runtime unavailable here. NOT runtime-certified.
`./lab config`, image build, daemon health, `./lab smoke`, surrogate tests and YOUR Rust-SUT acceptance
are mandatory target-machine gates. Never translate this document into a claim of already-tested binaries.
Existing Rust/PJSIP/iroh application sources, binding ABI, Cargo.lock, peer protocol and quality SLOs were
not supplied: no honest guide can provide their already-working integration adapters. Concrete integration
contracts below; unsupported or unimplemented checks MUST report NOT_RUN/FAIL, never implicit PASS.

Closed IPv4 baseline, Linux kernel dataplane. All runtime bridges internal; no bridge gateway IP assigned;
Docker masquerading disabled. Containers retain their directly-connected routes; defaults replaced by
explicit experimental routers. WAN servers have NO default route. Source/content restrictions implemented
inside namespaces. Agent controls Docker from host; no Docker socket inside containers. No real public
IPs needed. Same-WAN connectivity represents public reachability. Linux conntrack SNAT+APDF-like forwarding
is NOT automatically certified full-cone/symmetric/endpoint-independent behavior. Classify by measurement.

Mechanisms: Compose namespace sharing [web:5]; bridge isolation/options [web:48]; first-packet NAT/conntrack
[web:3]; mapping vs filtering [web:18]; behavior discovery [web:19]; netem constraints [web:20].

## 1. Host contract; safety; preparation

Preferred: dedicated Linux Docker Engine, rootful daemon, Compose v2 with `up --wait`; current supported
kernel, nftables/conntrack/netem enabled. Docker Desktop: Linux-container backend; actual networking lives
in backend kernel. Run same gates there; no claim of native macOS/Windows network-stack equivalence.
Rootless networking not a supported reference target. Kernel modules missing? Arrange backend/host module
availability OUTSIDE lab under administrator control; do not solve by `--privileged` or global firewall flush.
No access to global Internet required during execution; image/source/Cargo acquisition requires preparatory
Internet access. ARM64: native images/builds preferred; record architecture; emulated CPU invalidates absolute
performance comparison. Single host cannot independently reproduce Internet scale or independent host clocks.

Host commands: Docker CLI/Compose, Rust cargo/rustc, Python3, tar/unzip, shell. Optional host tshark; included
in node image. Enough RAM/CPU/disk for Asterisk, builds, ring captures. Restrict Docker access to trusted agent:
Docker daemon access is effectively host-admin authority. No untrusted source execution on production host.
Trusted infra namespaces have NET_ADMIN/NET_RAW; SUT namespaces joined through unprivileged sidecars.
Do not run arbitrary SUT code via root `./lab exec a`; use `sut-a`/`sut-b` overlay.

Inspect all files, particularly Dockerfiles; then from repository root:

```sh
docker version
docker compose version
rustc -Vv; cargo -V
./lab config > /tmp/natlab-resolved.yml
./lab build
./lab up
./lab ps
./lab smoke
cat artifacts/acceptance.log artifacts/acceptance.json
./lab collect
```

`./lab smoke` starts captures, runs serial Rust infrastructure tests, collects state/logs, stops captures,
returns test exit status. Guard entire host invocation with an external job timeout (e.g. CI timeout 15 min;
Linux `timeout 900 ./lab smoke`). On timeout, explicitly collect/stop before teardown; no missing-evidence PASS.
`./lab up` chmods local artifacts directory 1777 for trusted lab writers; do not place secrets there.
Only one topology concurrently: fixed overlapping subnets intentional. `./lab down` BEFORE variant switch;
archive artifacts between runs; same artifacts filename is not a run database. Do not reuse stale PASS JSON.
Stop active probes/SUT before changing policy. Teardown: `./lab capture-stop`; `./lab collect`; `./lab down`.
Never `docker system prune`, `nft flush ruleset` on host, or arbitrary host-route deletion.

Bootstrap image tags float intentionally until first build. For reproducibility pin base-image digests,
apt repository snapshot/package versions, Rust toolchain, PJPROJECT commit, iroh commit; commit Cargo.lock.
Capture `docker image inspect`, package manifest (`dpkg-query -W`), `rustc -Vv`, source SHA and build arguments.
Image ID pins one local build; tag alone does not. Rebuild detection invalidates prior performance baselines.

## 2. Files; exact topologies; placement

`compose.single.yml`, `compose.double.yml`, `compose.private.yml`: complete standalone files; no cross-file
network merge assumptions. Use exactly one as base. `lab` chooses via LAB_VARIANT=single|double|private;
project name natlab-${LAB_VARIANT}. Every interface determined by assigned IP, never guessed eth0/eth1.

Address plan:

| Domain | Subnet | Roles |
|---|---|---|
| WAN | 10.77.0.0/24 | ra=.2 (single/private); rb=.3; cga=.4 (double); pbx=.10 (single/double); obs1=.20; obs2=.21; turn=.30; optional iroh=.40 |
| LAN-A | 10.77.1.0/24 | ra=.1; a=.10; pbx=.20 (private only) |
| LAN-B | 10.77.2.0/24 | rb=.1; b=.10 |
| Transit-A | 10.77.10.0/24 | cga=.1; ra=.2 (double only) |

All Docker IPAM gateways .254 deliberately UNASSIGNED using inhibit_ipv4=true; node.sh deletes Docker's
default and installs GW. Internal bridge + no bridge gateway + no masquerade prevent normal host egress;
independent bypass test still mandatory. Namespaces drop outbound non-lab IPv4 and all non-loopback IPv6;
Compose disables IPv6. Docker embedded resolver 127.0.0.11 blocked explicitly; no accidental Internet DNS
proxy. /etc/resolv.conf points to unserved 10.77.0.53; use numeric IPs or explicit /etc/hosts. Tests requiring
DNS must add lab DNS, not host/public resolver. SUT sidecars have separate /etc/hosts/resolv.conf: supply
`extra_hosts`/DNS explicitly; do not assume helper container files are inherited.

Patterns:

```
single:  a--ra--WAN--rb--b; WAN:pbx,turn,obs1,obs2,[iroh]
double:  a--ra--transit--cga--WAN--rb--b; WAN services unchanged
private: a,pbx--ra--WAN--rb--b; WAN:turn,obs1,obs2,[iroh]
```

Single baseline:
```sh
LAB_VARIANT=single ./lab up
LAB_VARIANT=single ./lab smoke
```
Double: first tear down single; archive artifacts; then:
```sh
LAB_VARIANT=double ./lab up
LAB_VARIANT=double ./lab smoke
```
Double expectation: observer sees a as 10.77.0.4, not 10.77.10.2/10.77.1.10. Capture ra AND cga to establish
two translations; observer alone sees only composite behavior. Third+ NAT: clone transit/router pattern,
unique subnet, explicit next-hop, nested source CIDR, exact egress-IP assertions; not extra endpoint interfaces.
Overlapping private LAN addresses may be tested in separate bridges; adapt hardcoded plan/expectations first.

Private PBX: separate generated pjsip.private.conf, no shared-file mutation:
```sh
LAB_VARIANT=private ./lab up
LAB_VARIANT=private ./lab exec ra /lab/private-pbx.sh
LAB_VARIANT=private ./lab smoke
```
PBX=10.77.1.20, public facade=10.77.0.2. a uses registrar 10.77.1.20; b uses 10.77.0.2. Helper installs
UDP/TCP5060 and UDP10000:10199 DNAT + exact inbound forwarding; public address advertisements set in both
PBX transports. Port-preserving RTP mapping. Run helper ONCE after recreation; duplicate invocations append
rules. NAT-state-reset/capture required when changing. Hairpin deliberately NOT implemented: a using public
facade is a negative hairpin case, not equivalent to b's outside-in case. Infrastructure smoke does NOT
certify private-PBX signaling/media. Product-specific Rust test must assert registration/call/media here.

Asterisk config: password-auth endpoints1001/1002, ulaw/alaw, media anchored (`direct_media=no`), symmetric
RTP, force_rport, rewrite_contact; RTP10000:10199; dial1001/1002; Echo600. No unsolicited Internet access.
PBX public operation requires no external_* rewrite; private transport has explicit local_net/external_*
plus actual DNAT. Address advertising never opens NAT. Reference lacks SIP TLS/video negotiation: add
transport/codec fixtures and assertions; do not count audio-only success as video coverage. [web:24]

TURN: WAN10.77.0.30:3478 UDP/TCP, realm lab, lab/lab-secret, relay UDP/TCP50000:50199, explicit auth.
No TLS/DTLS in baseline. Deliberately closed-lab private peer addresses; never publish this configuration.
TURN is not SIP signaling, not an iroh relay, not a generic transparent proxy. Every protocol must actually
implement the relevant allocation/relay client. TCP-to-TURN is not TCP relaying to peer. [web:44][web:92]

## 3. Infrastructure acceptance; fault injection; NAT qualification

Rust `accept/tests/lab.rs` runs via HOST cargo; issues Docker CLI; host never participates in dataplane.
Rust `probe/` serves/sends actual UDP/TCP inside namespaces; no Cargo dependencies; offline build/test.
Checks: a/b UDP sequence integrity; TCP262144-byte exact echo; expected WAN source IP; alternate observations;
ra cut blocks UDP AND TCP (bypass rejection); UDP-block rejects UDP while TCP succeeds; recovery. All mutations
serial. Failure before cleanup? Recreate lab before rerun; do not assume normal state. Rust panic != classified
network failure in product tests; emit explicit timeout/protocol/assertion categories in adapters.

```sh
./lab exec a ip -4 route
./lab exec a ip route get 10.77.0.20
./lab exec ra nft -a list ruleset
./lab exec ra conntrack -L -o extended
./lab exec a netprobe udp 10.77.0.20:9000 42000 100 20
./lab exec a netprobe tcp 10.77.0.20:9000 1048576
python3 scripts/qualify-nat.py >artifacts/mapping-observations.json
```

Probe RTT is request/echo/receive measurement with timeout; NOT RTP jitter, one-way latency, perceptual MOS,
or throughput calibration. CLI udp exits1 on ANY loss; don't use it as a loss-tolerant performance oracle.
Sequential source-port reuse is an observational sample, not full RFC5780 filtering certification.

Fault scripts execute INSIDE router only:
```sh
./lab exec ra /lab/policy.sh udp-block
./lab exec ra /lab/policy.sh normal
./lab exec ra /lab/policy.sh cut
./lab exec ra /lab/policy.sh normal
./lab exec ra /lab/policy.sh clear
./lab exec ra /lab/link.sh wan delay 100ms 20ms loss 2% rate 5mbit limit 1000
./lab exec ra /lab/link.sh lan delay 60ms 10ms loss 1%
./lab exec ra /lab/link.sh wan clear
./lab exec ra /lab/link.sh lan clear
```

ra.wan egress = outbound; ra.lan egress = inbound to LAN. Double: apply stage-specific effects to ra/cga;
sum delays explicitly; avoid accidental double impairment. netem seed support version-dependent: inspect
`tc qdisc ... help`; unsupported seed is FAIL, not silently omitted. Host scheduler/timers, queue sizing,
CPU contention and offloads affect results. TCP TSQ may require receiver-ingress placement (IFB, extra caps/
setup) for rigorous performance work; router-egress fixture alone is not universal TCP benchmark fidelity.
No live /proc/sys writes: Docker commonly mounts it read-only. `compose.timeout.example.yml` configures
namespace conntrack timeouts on router creation; inspect /proc values and conntrack countdown; clear old
flows; client binding lifetime separately measured. Compose-only timeout override must use same project/base.
Conntrack UDP/stream expiration differs; keepalive tests must cover both. [web:20]

Finite strict NAT fixture, useful to regression-test mapping algorithms WITHOUT counterfeit NAT labels:
```sh
python3 scripts/fixture-nat.py apdm config/fixture.json >artifacts/fixture.nft
./lab exec ra conntrack -F
./lab exec ra nft -f /out/fixture.nft
python3 scripts/qualify-nat.py >artifacts/apdm-observations.json
```
Single/private ra only: fixture WAN=.2, source a:42000, exact three observer destinations. APDM assigns distinct
ports per (src,sport,dst,dport); EIM assigns same port per (src,sport). Base conntrack return matching retains
APDF-like inbound policy. Finite whitelist rejects other client UDP instead of falling back to baseline NAT.
Assert all3 observed tuples vs allocation table; repeat after state reset; test return arrival. Delete BOTH
`fixture_nat` and `fixture_allow`, then conntrack-F, or recreate before app tests. In double fixture.json WAN
must be10.77.10.2 and cga's behavior separately qualified; composite public mapping may hide inner properties.
These profiles are NOT general APDM for arbitrary dynamic application source/destination ports. Generalize
allocator/state engine or enumerate ALL actual test flows; otherwise report unsupported. Port reuse under
load, rebinding, EIF/ADF filtering, hairpin require separate explicit implementation+measurement. No one
`masquerade`, `random`, `persistent` flag certifies all combinations. [web:3][web:18]

Required full NAT-profile qualifier (implement in Rust beside actual SUT):
- Same open socket -> (IP-A,P), (IP-A,Q), (IP-B,P); compare externally observed mappings.
- Fresh state -> send to(A,P); same(A,P), sameIP/differentPort(A,Q), differentIP(B,P) inject toward observed
  endpoint WITHOUT preceding client sends to those alternate endpoints. Control injection OOB via Docker
  exec or control files, not client dataplane. Expect filtering per declared profile. Avoid state poisoning.
- Hairpin: second LAN peer targets first peer's public mapping; no alternate LAN shortcut.
- Lifetime: idle/active bidirectional/replied vs unreplied; keepalive interval before/after threshold.
- Port preservation/conflict/exhaustion: concurrent sources, fixed source ports, allocation table uniqueness.
- Multistage: qualify each stage, then composition; capture both sides of every stage.
- TCP: independent state-machine tests; UDP RFC4787 classifications do not prove TCP behavior.
RFC5780 alternative-IP/port server support must be verified for selected coturn build, not merely enabled
by a guessed flag; coturn behavior-discovery server and TURN utility smoke are separate test roles. [web:19]

## 4. PJSUA surrogate; real Rust/PJSIP client integration

Optional reference oracle, not substitute for actual Rust SIP client:
```sh
./lab pjsua-build
# Recreate the entire chosen single/double topology with oracle image:
./lab down
LAB_IMAGE=natlab-pjsua:local ./lab up
LAB_IMAGE=natlab-pjsua:local ./lab capture-start
LAB_IMAGE=natlab-pjsua:local cargo test --manifest-path accept/Cargo.toml --offline \
  --test voip -- --ignored --nocapture --test-threads=1
LAB_IMAGE=natlab-pjsua:local ./lab collect
LAB_IMAGE=natlab-pjsua:local ./lab capture-stop
```

Dockerfile.pjsua builds PJPROJECT2.15.1; pin audited full commit for your binding/toolchain. Exact command-line
availability checked with `pjsua --help` before test. Legacy stdin CLI driven through named FIFO by Python
wrapper; no terminal interaction. Callee1002/caller1001 auto-answer; null audio; looped WAV player -> call;
call -> WAV recorder; separate output per node. Rust host test waits REGISTER contacts and 2 Up channels,
holds20s, quits both, validates PCM duration/RMS/clipping and writes scoped JSON. Channels+energy cannot
prove audio identity or fine quality; .json says identity/MOS NOT_MEASURED. Wrapper errors/logs remain artifacts.
On test panic, collect, stop wrappers (`kill -TERM $(cat /out/a.pid)` inside a; analogous b), then recreate.
No phantom success on stale recordings. Python check-audio.py auxiliary diagnostics only; Rust test is gate.
PJSIP conference bridge supports null-device timing, file players/recorders; absent sound HW does not prevent
real encoded RTP. Proper slot wiring required; null audio by itself emits no meaningful stimulus. [web:51][web:52]

Actual Rust/PJSIP application: build adapter INTO your repository, using its real binding and Cargo.lock;
no imaginary universal Rust PJSIP crate/API. Small C ABI shim acceptable; pin PJPROJECT compile flags/features,
thread registration, callback lifetime/ownership, static/shared library ABI; export build manifest. Rust
integration tests drive real adapter binary/library; startup/termination finite; no microphone/speaker APIs.

Required adapter CLI (implement, not supplied product binaries):
```
voip-node --config /work/tests/lab/a.json --events /out/a.events.jsonl
          --control /out/a.control.jsonl --rx-pcm /out/a.rx.wav --seed N
```
Required event payload: run_id,node,monotonic_ns,event,call_id,dialog_tag,CSeq,transport,local/remote tuple,
SIP status/auth retries,registration expiry,SDP offer/answer,codec,ptime,ICE candidates/checklist/selected pair
(if enabled),DTLS/SRTP state (if enabled),SSRC,seq/timestamp,RTCP SR/RR,loss/late/reorder/dup,jitter buffer stats,
PCM sample count,hash/stimulus ID,error category. Redact credentials/keys from normal logs. Separate key-log
artifact only when supported, explicit opt-in and restricted permissions.
Required control: register/unregister; call/answer/hangup; hold/resume/reINVITE; send DTMF/text/data if product
supports; force ICE restart/reconnect; shutdown. A command acknowledged is not an operation-completed event.
No invented support for text/video modes not implemented in product. Test unsupported required feature = FAIL.

Headless stimulus: distinct deterministic signal per direction (e.g. seeded speech-like multitone/chirp +
embedded temporal markers); send PCM via PJMEDIA port/player; receive decoded PCM via recorder/custom port.
PJSUA conference slot wiring: tx source->call slot; call slot->rx recorder; null timing device active.
Separate tx/rx codec rates and resampler effects. For video use generated frame sequences with visible machine
markers/frame IDs, software codec, decoded-frame checksum/PSNR/SSIM when applicable, timestamps/freeze/gap
counters; no camera/display; encrypted packet capture alone cannot validate decoded media quality.

Objective Rust assertions:
- REGISTER challenged/authenticated then accepted; refresh and expiry; negative wrong-password/timeout.
- INVITE/180-or183/200/ACK/BYE correct; CANCEL/busy/no-answer; retransmit budgets; transport loss/recovery.
- Bidirectional actual RTP, not merely SIP200; expected SSRC/payload/codec; no unexpected peer path.
- Per-direction stimulus identity by normalized cross-correlation with lag search; independent-clock drift,
  resampling and packet-loss concealment considered. RMS/clipping alone insufficient.
- Setup latency distribution; media-start latency; duration/gap p95/p99; jitter/loss/late/discard; sequence
  wrap/reorder/dup; RTCP interval/consistency; negotiated codec/ptime; sustained sample count.
- Hold/resume/reINVITE preserves/renegotiates media; direct_media=no then explicit direct_media variant;
  NAT timeout below/above keepalive; SRTP/DTLS/ICE/TURN only when actual implementation supports them.
- Long call + repeated register/call/hangup; RSS/fd/task/socket/conntrack growth; clean shutdown; no residual call.
Asterisk may anchor RTP while client ICE/turn unused: never infer TURN usage from a successful Asterisk call.

## 5. Rust SUT overlay; build isolation; external-agent control

Provide actual SUT_ROOT; prepare host-writable UID1000 cache/target directories. For another host UID adjust
`user:` and ownership explicitly; Docker Desktop bind-mount semantics differ. Source mounted read-only;
Cargo outputs/caches separate. Build scripts which write source tree require prebuilt binary or disposable
workspace copy, NOT chmodding production source. Cache-a/cache-b independent to avoid cargo lock contention.

```sh
export SUT_ROOT=/absolute/path/to/actual/project
mkdir -p cache/cargo-a cache/cargo-b cache/target-a cache/target-b
# Set ownership to container UID1000 if needed; only these new lab cache directories.
docker compose -p natlab-single -f compose.single.yml -f compose.sut.example.yml build sut-a
```

Resolve Cargo/native deps ONLINE in controlled build stage or a temporary ordinary build container BEFORE
joining isolated namespaces; overlay has no Internet. Populate correct per-node CARGO_HOME/target caches,
or bake executable/deps into final SUT image. `cargo --offline` missing-dependency error is build-preparation
FAIL, not reason to grant lab Internet. Existing project may need native PJSIP libs, TLS CA paths, runtime
shared libraries; Dockerfile.sut is a dependency-template, not promise arbitrary Rust/PJSIP builds work unchanged.

```sh
docker compose -p natlab-single -f compose.single.yml -f compose.sut.example.yml up -d --wait
# Host agent starts test fixture server; then runs matching client Rust integration tests:
docker compose -p natlab-single -f compose.single.yml -f compose.sut.example.yml \
  exec -T -d sut-b /work-or-image-path/lab-node --config /work/tests/lab/b.json
docker compose -p natlab-single -f compose.single.yml -f compose.sut.example.yml \
  exec -T sut-a cargo test --offline --locked --test lab_voip -- --nocapture --test-threads=1
```

`/work-or-image-path/lab-node` is CONTRACT PLACEHOLDER: replace with ACTUAL compiled binary path; command is
not a supplied executable. Prefer image-owned /usr/local/bin/<sut> and explicit cargo test package/features.
Host `./lab` wrapper knows BASE file only: use full Compose arguments for SUT/relay overlays; do not expect
`./lab collect` to capture overlay service stdout automatically. Add equivalent `logs/inspect` collection for
all added services. Shared netns captures in a/b include sidecar dataplane; a/b's /proc files/process listings
do not include sidecar PIDs. Collect `ss`/fds/proc/RSS INSIDE SUT container and `docker stats` separately.
Destroy/recreate SUT sidecars after network-owner a/b recreation; old attached namespace must never survive
as accidental second dataplane. No extra `networks:` alongside network_mode:service:a/b.

Agent OOB observation/control: Docker exec + logs + inspect + bind-mounted artifact/control files. Agent host
network NEVER carries test payload. Registry/ticket distribution via host files is acceptable for transport
isolation tests but NOT proof product discovery works. Discovery has own local service/test. Synchronize
fixtures with explicit ready events/barriers, not arbitrary sleeps. Every operation has deadline; externally
kill hung child trees; preserve stdout/stderr/status. Endpoint IDs/ports/log paths unique per run.

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

## 7. iroh: separate local relay; pin API/schema; never public fallback

iroh uses QUIC + its own relay, not coturn. Version changes renamed discovery APIs; do not copy guessed
builder methods across releases. Inspect actual Cargo.lock/docs/source. Home relay + explicit EndpointAddr
(or pinned-version equivalent), authenticated EndpointId + ALPN. Default production relay/address lookup
would invalidate closed-lab assumptions. Disable public relay/discovery/PKARR/DNS/mDNS explicitly in adapter;
permit ONLY declared local services; audit attempted forbidden egress counters. [web:64][web:71][web:73]

Build relay from compatible pinned full upstream commit (not latest):
```sh
export IROH_REF=<40-hex-commit-compatible-with-your-lockfile>
docker build -f Dockerfile.iroh --build-arg IROH_REF="$IROH_REF" -t natlab-iroh:local .
docker compose -p natlab-single -f compose.single.yml -f compose.iroh.yml up -d --wait
./lab exec a curl --noproxy '*' --fail http://10.77.0.40:3340/healthz
```

Replace angle-bracket value with real commit. Server feature/bin names are verified by actual build;
compile failure means wrong pinned release/build contract, not permission to silently upgrade SUT.
Dev config intentionally HTTP relay only, no QAD: suitable relay-fallback baseline, NOT full NAT traversal
qualification. Upstream dev-mode TLS/QAD behavior has changed; pinned source is authority. [web:70][web:72]
For QAD/TLS use generated local CA and config/iroh-tls.example.toml as version-checked schema starting point;
run WITHOUT --dev; validate supported fields against pinned relay source; verify443/TCP and7842/UDP listeners,
CA/hostname, endpoint QUIC discovery responses. Add `relay.lab:10.77.0.40` to SUT's extra_hosts, install CA in
actual TLS/QUIC trust config; never assume OS trust automatically applies to rustls/QUIC. HTTP health alone
cannot establish QAD. Configuration parser may ignore unknown fields: listener/protocol probes mandatory.
Community self-hosting guide itself warns of schema drift; upstream pinned implementation wins. [web:56]

Implement Rust product fixture accepting config rather than public defaults:
```
iroh-node {serve|connect} --relay-url http://10.77.0.40:3340
          --bind 0.0.0.0:<fixed-port> --alpn lab/<protocol-version>
          --ticket-in /out/b.ticket --ticket-out /out/a.ticket
          --events /out/a.iroh.jsonl --seed N
```
CONTRACT, not fictional shipped binary. Ticket: peer ID + configured local relay + actual reachable candidate
addresses; create only after relay ready. Never inject other LAN's private10.77.2.10 as magically reachable
candidate; candidate ignored/failed is expected. Host-file ticket transfer removes discovery from scope.
Add distinct discovery fixture to validate actual address publication/lookup. Disable local mDNS shortcuts.

Required cases, actual Rust library adapters:
1. WAN-direct endpoints: no NAT; ALPN/identity/auth/data oracle.
2. LAN-a/b SNAT: connect, transfer, observe relay start and any direct upgrade; no requirement direct always
   succeeds unless qualified NAT profile explicitly makes it expected.
3. DoubleNAT: same, capture each stage, no direct-path assumption.
4. UDP blocked on ra BEFORE endpoint startup: relay-only; TCP remains allowed; exact payload success and
   sustained relay bytes; prove no direct peer UDP escapes. Coturn success irrelevant.
5. Relay blocked + UDP blocked: finite classified failure; no public fallback.
6. Direct established -> block direct UDP: migration/fallback latency + no content corruption; then restore
   and observe upgrade if implementation supports. Block at priority before established acceptance.
7. Relay outage while direct established; then relay recovery, endpoint restart, NAT-state reset/rebind;
   expected recovery documented per product, not assumed.
8. Many streams, half-close, backpressure, cancellation, slow receiver, datagrams if used; ALPN mismatch,
   wrong ID/authorization; exact content hash, no duplicate application delivery, bounded memory.
9. Churn/network address change: restart fixture with changed IP/port/config; authenticated reconnection;
   stale addresses/cache invalidation. No claim conntrack-F changes mapped port: use explicit new SNAT
   address/port fixture or endpoint rebind and verify observed tuple actually changed.
10. Local multi-peer scaling: latency/throughput distributions, fd/RSS/task growth, fairness, relay overload,
    simultaneous connect/reconnect; this is local load emulation, not proof planet-scale deployment behavior.

iroh telemetry contract: endpoint/peer IDs, local/remote socket tuples, current path enum/history, relay URL,
path-change monotonic timestamps, direct/relay bytes separately, handshake/RTT/loss/congestion state where
actual version exposes it, QUIC stream errors, application-sequence/hash, reconnect reason. If API lacks path
byte counters instrument actual crate or use qualified packet/counter evidence; never infer direct from low
latency or successful connect. Encrypted QUIC captures don't reveal plaintext integrity. Instrument app;
TLS key logs optional/version-dependent and sensitive; not assumed universal SSLKEYLOGFILE support.

## 8. Packet-level observation; bounded collection; failure triage

Always start capture BEFORE DNS/auth/ICE/handshake; observer namespaces + every router + endpoints. Shared
namespace `tcpdump -i any` observes both interfaces; duplicate forwarding views are expected. Preserve ingress/
egress identity; for exact per-link analysis capture individual interface PCAP separately. any uses cooked
link-layer format; no assertion of actual Ethernet wire preamble/checksum/offload behavior. Full snaplen;
32MBx8 ring per namespace; old traffic overwritten deliberately. Long tests rotate/export before overwriting
required evidence; capture drops/rotation invalidate missing-packet conclusions.

```sh
./lab capture-start
./lab exec ra ip -j address
./lab exec ra conntrack -L -o extended
./lab exec ra nft -a list ruleset
./lab exec ra tc -s qdisc show
./lab exec a ss -tunap
./lab exec pbx asterisk -rx 'pjsip set logger on'
./lab exec pbx asterisk -rx 'rtp set debug on'
# Execute Rust tests; then:
./lab collect
./lab capture-stop
./lab exec pbx asterisk -rx 'pjsip show contacts'
./lab exec pbx asterisk -rx 'pjsip show channelstats'
./lab exec pbx asterisk -rx 'core show channels concise'
```

RTP debug/high-level tracing perturb timings; use diagnostic run distinct from performance run; quantify
CPU/disk impact. Secrets present in SIP authorization/PCAP; artifact access controlled. Do not upload raw captures
without explicit approval/redaction. Trace toggles OFF after diagnostics. Check bundled CLI help if command
absent in chosen packaged Asterisk; absence = missing evidence, not empty successful assertion.

Offline decode inside a trusted helper/namespace (choose actual ring filename, e.g. single-ra.pcap0):
```sh
./lab exec a ls -l /out
./lab exec a tshark -r /out/single-ra.pcap0 -n -Y sip -T json >artifacts/sip.json
./lab exec a tshark -r /out/single-ra.pcap0 -n -Y 'stun || turnchannel' -T json >artifacts/turn-packets.json
./lab exec a tshark -r /out/single-ra.pcap0 -n -q -z conv,udp >artifacts/udp-conversations.txt
./lab exec a tshark -r /out/single-ra.pcap0 -n -q -z rtp,streams >artifacts/rtp-streams.txt
```

Tshark field/dissector names version-dependent: `tshark -G protocols`, `-G fields`; unknown filter is failure,
not permission to substitute empty results. RTP heuristic/SDP context required; encrypted SRTP/QUIC not
plaintext RTP proof; force-decode only declared port ranges and preserve the assumption. Use mergecap for
full ring ordering; retain originals and timestamps. tcpdump stderr: received/dropped stats, kernel/ring errors.
Multiple namespace clocks on one kernel aid correlation, but monotonic vs wall timestamps still distinguish;
clock adjustments invalidate naive one-way latency. Containers cannot independently test hardware drift
without application-clock abstraction. Never alter host clock for a lab case.

Failure order: topology/routes -> bypass-cut -> nft counters -> per-hop PCAP/translated tuples -> conntrack
state/lifetimes -> server listener/auth -> signaling/ICE/relay path -> encrypted transport -> decoded payload
-> quality/resource budgets. Each verdict references exact artifact offsets/event IDs/flow5tuple/run_id.
No packets at source = app/config; source present/NAT absent = local route/filter; NAT outbound/no WAN =
bridge/host policy; server receives/no reply = server; reply/NAT present/no LAN = conntrack/filter; LAN data/
no decoded media = client/codec/crypto. These are investigation branches, not automatic diagnoses.

## 9. Machine-verifiable quality; repetitions; final gate

Implement actual product tests primarily in Rust; external tools are evidence-producing subprocesses,
not human oracles. Tests own child-process lifecycle/timeouts/control sockets/JSONL parsing. Use typed
serde schemas in actual project, validate run_id and event version, fail closed on unknown/missing required
fields. No fragile success-by-grep for product release gate; bundled utility smoke intentionally lower scope.

Result per case:
```
run_id,scenario,seed,topology,nat_profile_id,nat_qualification_hash,link_profile,
source_shas,lock_hash,image_ids,kernel,arch,resources,expected_path,observed_path,
setup_ms,media_start_ms,rtt_percentiles,jitter_definition,loss_definition,
decoded_payload_hash,correlation,lag_ms,drift_ppm,gaps,clipping,
bytes_direct,bytes_relay,reconnect_ms,rss/fd/task_deltas,
assertions:[{name,status,observed,threshold,evidence}],status,exit_code
```

Thresholds version-controlled BEFORE run; product/use-case-dependent, not universal telecom claims.
Suggested initial engineering gates (explicit lab policy, not external standard): zero payload corruption;
zero unexpected direct traffic in relay-only scenario; negative case finite failure<=15s; nominal call
setup<=5s; bidirectional media>=20s; sustained no-loss baseline RTP loss<=0.1%; RMS>=100/32768; clipping<1%;
stimulus correlation>=0.9 after codec-aligned resampling/lag compensation (tune codec baseline first).
Lossy-profile tolerances derived from injected impairment + repeated baseline, not arbitrary copy of nominal
SLO. MOS/PESQ/POLQA require actual applicable algorithm/license/reference and measurement; never synthesize
MOS from ping/jitter alone. Video objective metrics similarly need decoded reference frames.

Baseline repeat>=30 runs; many failures require more. Report successes/total + confidence bound; no observed
failures != zero failure probability. Example 0/n failure one-sided95% upper bound = 1-0.05^(1/n), approx3/n.
Keep reproducible seeds/config; wall-clock scheduling still nondeterministic; compare distributions, not
single lucky run. Soak policy e.g. >=1h plus 1000 call/connect cycles; resource slopes after warmup; define
fd/RSS budgets from measured baseline; no process leaks, no lingering channels, no stale allocations beyond
configured expiry. Externally resource-limit competing loads and record Docker CPU/memory constraints.

Final release gate ALL required scopes must pass:
A topology health/routes/isolation/bypass; B per-profile mapping/filtering/lifetime qualification;
C actual Rust/PJSIP SIP+decoded bidirectional media incl negative/recovery; D actual client TURN transports;
E actual Rust iroh custom local relay/direct/fallback/negative/recovery; F required video/text/data modes;
G long-run quality/resource SLOs; H complete packet/log/config provenance. Bundled `acceptance.json` only
asserts A subset; optional voip/turn tests are surrogates. No full PASS until B-H implemented and executed
against your actual sources. Missing feature = UNSUPPORTED/FAIL per requirements, never silently skipped.

## 10. Deliberate boundaries

Not emulated by this baseline: every vendor NAT/ALG; arbitrary general EIF/ADF/APDM allocator; automatic
hairpin; PCP/UPnP; IPv6 firewall/NAT64/464XLAT; actual browser/WebRTC stack; cellular handover/radio/link layer;
real BGP/geographical routing; independent hardware clocks; Internet-scale capacity; production certificate
operations. Add explicit backends/fixtures/qualifiers when product needs them. TCP/UDP real packets and
media payloads work without claiming those extra behaviors. Specifying a feature is not implementing it.

Compose is orchestration, not the NAT specification. Routing/NAT/netem implement network semantics;
qualified probes prove network semantics; real Rust app tests prove product behavior; decoded-reference
oracles and distributions prove declared quality budgets. Preserve these four levels separately.


## Appendix A — Exact source files

Repository paths below are reconstruction targets. Copy contents verbatim; chmod +x lab scripts/*.sh; run python3 scripts/make-tone.py to reconstruct binary WAV fixture. Three base Compose files are alternatives, NOT simultaneous deployments.

### .gitignore

```text
artifacts/
cache/
private/
config/tls/
config/coturn.tls.conf
probe/target/
accept/target/
```

### AGENTS.md

```text
# Execution contract
Read README.md before modification. Agent stays OUTSIDE containers. Docker API access HOST ONLY.
No host firewall edits, privileged containers, host network, Docker-socket mounts, public relay fallback,
GUI, microphone, speaker, manual listening, unverified NAT labels, synthetic MOS, or swallowed failures.
Run one topology at a time. Resolve dependencies ONLINE before isolated tests. Preserve every failed run.
PASS scopes distinct: infrastructure; NAT-profile; utility-surrogate; actual Rust SUT; quality; long-haul.
NOT_RUN != PASS. No full-environment certification until all required scopes pass for pinned revisions.
For actual applications implement contracts in README; do not claim surrogate coverage as product coverage.
Record changed config + seed + commit + lockfile + image IDs + kernel + packets + machine-readable results.
Inspect all packet-drop counters. Failure to collect evidence invalidates relevant assertions.
```

### Dockerfile

```text
FROM rust:1-bookworm AS probes
WORKDIR /build
COPY probe/ .
RUN cargo build --release --offline

FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN printf 'wireshark-common wireshark-common/install-setuid boolean false\n' | debconf-set-selections \
    && apt-get update && apt-get install -y --no-install-recommends \
    iproute2 nftables conntrack tcpdump tshark iputils-ping iputils-tracepath \
    ethtool python3 curl ca-certificates openssl jq procps coreutils \
    asterisk coturn socat && rm -rf /var/lib/apt/lists/*
COPY --from=probes /build/target/release/netprobe /usr/local/bin/netprobe
COPY scripts/ /lab/
RUN chmod +x /lab/*.sh
ENTRYPOINT ["/lab/node.sh"]
CMD ["sleep","infinity"]
```

### Dockerfile.iroh

```text
FROM rust:1-bookworm AS build
RUN apt-get update && apt-get install -y --no-install-recommends git pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*
ARG IROH_REF
RUN test -n "$IROH_REF" && echo "$IROH_REF" | grep -Eq '^[0-9a-f]{40}$' \
    && git clone https://github.com/n0-computer/iroh.git /src \
    && cd /src && git checkout --detach "$IROH_REF"
WORKDIR /src
RUN cargo build --locked --release --package iroh-relay --features server --bin iroh-relay
FROM natlab-node:local
COPY --from=build /src/target/release/iroh-relay /usr/local/bin/iroh-relay
```

### Dockerfile.pjsua

```text
FROM natlab-node:local AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential pkg-config git libssl-dev uuid-dev && rm -rf /var/lib/apt/lists/*
ARG PJPROJECT_REF=2.15.1
RUN git clone --depth 1 --branch "$PJPROJECT_REF" https://github.com/pjsip/pjproject.git /pj
WORKDIR /pj
RUN ./configure --disable-video --disable-sound --disable-libyuv --disable-ffmpeg --disable-v4l2 \
    && make dep && make -j2 \
    && find pjsip-apps/bin -maxdepth 1 -type f -name 'pjsua-*' -executable -exec cp '{}' /usr/local/bin/pjsua \;
FROM natlab-node:local
COPY --from=build /usr/local/bin/pjsua /usr/local/bin/pjsua
```

### Dockerfile.sut

```text
# Build dependencies ONLINE; execute SUT/tests only inside isolated runtime namespaces.
FROM rust:1-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential pkg-config libssl-dev clang libclang-dev cmake \
    iproute2 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /work
# Adapt native dependencies to the ACTUAL PJSIP binding; commit Cargo.lock/toolchain.
# COPY Cargo.toml Cargo.lock ... ; RUN cargo fetch --locked ...
CMD ["sleep","infinity"]
```

### accept/Cargo.toml

```toml
[package]
name = "natlab-accept"
version = "0.1.0"
edition = "2021"
```

### accept/tests/lab.rs

```rust
use std::{process::{Command,Output},env,fs};
fn run(args:&[&str])->Output{
    let o=Command::new("./lab").args(args).output().unwrap();
    eprintln!("./lab {:?}\n{}{}",args,String::from_utf8_lossy(&o.stdout),String::from_utf8_lossy(&o.stderr));o
}
fn ok(args:&[&str])->String{let o=run(args);assert!(o.status.success(),"command failed: {args:?}");String::from_utf8(o.stdout).unwrap()}
#[test]
fn topology_nat_faults(){
    // Mutates network policy: serialize this test; fresh lab required.
    ok(&["exec","a","test","-f","/run/lab.ready"]);
    for peer in ["a","b"] {
        let out=ok(&["exec",peer,"netprobe","udp","10.77.0.20:9000","42000","10","20"]);
        let wan=if peer=="b"{"10.77.0.3"}else if env::var("LAB_VARIANT").unwrap_or_default()=="double"{"10.77.0.4"}else{"10.77.0.2"};
        assert!(out.contains(&format!("\"observed\":\"{wan}:")),"unexpected NAT egress");
        ok(&["exec",peer,"netprobe","tcp","10.77.0.20:9000","262144"]);
    }
    // Mixed-port and alternate-address probes: observations, NOT an EIM/APDM assertion.
    for dst in ["10.77.0.20:9000","10.77.0.20:9001","10.77.0.21:9000"] {
        ok(&["exec","a","netprobe","udp",dst,"42000","1","0"]);
    }
    ok(&["exec","ra","/lab/policy.sh","cut"]);
    let u=run(&["exec","a","netprobe","udp","10.77.0.20:9000","42000","1","0"]);
    let t=run(&["exec","a","netprobe","tcp","10.77.0.20:9000","16"]);
    ok(&["exec","ra","/lab/policy.sh","normal"]);
    assert!(!u.status.success()&&!t.status.success(),"NAT bypass detected");
    ok(&["exec","ra","/lab/policy.sh","udp-block"]);
    let u=run(&["exec","a","netprobe","udp","10.77.0.20:9000","42000","1","0"]);
    let t=run(&["exec","a","netprobe","tcp","10.77.0.20:9000","16"]);
    ok(&["exec","ra","/lab/policy.sh","normal"]);
    assert!(!u.status.success()&&t.status.success(),"UDP block not selective");
    ok(&["exec","a","netprobe","udp","10.77.0.20:9000","42000","3","20"]);
    fs::write("artifacts/acceptance.json","{\"infrastructure\":\"pass\",\"sip\":\"not_run\",\"turn\":\"not_run\",\"iroh\":\"not_run\",\"nat_behavior_qualification\":\"not_run\"}\n").unwrap();
}
```

### accept/tests/turn.rs

```rust
use std::{process::Command,fs};
#[test]
#[ignore="coturn utility smoke; not a two-host Rust SUT interoperability test"]
fn turn_udp_and_tcp_transport(){
 for tcp in [false,true]{
  let mut args=vec!["exec","a","timeout","45","turnutils_uclient","-y","-u","lab","-w","lab-secret","-p","3478","-n","100","-z","10"];
  if tcp{args.push("-t");}args.push("10.77.0.30");
  let o=Command::new("./lab").args(&args).output().unwrap();
  let s=format!("{}{}",String::from_utf8_lossy(&o.stdout),String::from_utf8_lossy(&o.stderr));
  fs::write(format!("artifacts/turn-{}.log",if tcp{"tcp"}else{"udp"}),&s).unwrap();
  assert!(o.status.success(),"{s}");
  // Utility output format is version-specific. No fabricated packet-loss pass.
  assert!(s.contains("Total transmit time"),"missing utility completion statistics: {s}");
 }
}
```

### accept/tests/voip.rs

```rust
use std::{process::Command,time::{Duration,Instant},thread,fs};
fn cmd(args:&[&str])->String{
 let o=Command::new("./lab").args(args).output().unwrap();
 assert!(o.status.success(),"{args:?}: {}",String::from_utf8_lossy(&o.stderr));
 String::from_utf8_lossy(&o.stdout).into_owned()
}
fn wait(mut f:impl FnMut()->bool){let t=Instant::now();while !f(){assert!(t.elapsed()<Duration::from_secs(60),"readiness timeout");thread::sleep(Duration::from_millis(500));}}
fn wav(path:&str){
 let b=fs::read(path).unwrap();assert!(&b[..4]==b"RIFF"&&&b[8..12]==b"WAVE");
 let mut pos=12;let mut rate=0u32;let mut data=vec![];
 while pos+8<=b.len(){let n=u32::from_le_bytes(b[pos+4..pos+8].try_into().unwrap())as usize;
  let end=pos+8+n;assert!(end<=b.len());let q=&b[pos+8..end];
  if &b[pos..pos+4]==b"fmt "{assert!(q.len()>=16);assert_eq!(u16::from_le_bytes(q[..2].try_into().unwrap()),1);assert_eq!(u16::from_le_bytes(q[2..4].try_into().unwrap()),1);rate=u32::from_le_bytes(q[4..8].try_into().unwrap());assert_eq!(u16::from_le_bytes(q[14..16].try_into().unwrap()),16);}
  if &b[pos..pos+4]==b"data"{data.extend_from_slice(q);}pos=end+(n&1);
 }
 assert!(rate>0);let samples:Vec<i16>=data.chunks_exact(2).map(|x|i16::from_le_bytes([x[0],x[1]])).collect();
 let secs=samples.len()as f64/rate as f64;let rms=(samples.iter().map(|x|(*x as f64).powi(2)).sum::<f64>()/samples.len().max(1)as f64).sqrt();
 let clip=samples.iter().filter(|x|(**x as i32).abs()>=32760).count()as f64/samples.len().max(1)as f64;
 eprintln!("{path}: seconds={secs:.3} rms={rms:.3} clipped={clip:.6}");assert!(secs>=10.&&rms>=100.&&clip<0.01);
}
#[test]
#[ignore="requires LAB_IMAGE=natlab-pjsua:local and fresh single/double topology; surrogate, not Rust SUT"]
fn headless_pjsua_bidirectional_audio(){
 assert!(std::env::var("LAB_VARIANT").unwrap_or_default()!="private");
 cmd(&["exec","pbx","asterisk","-rx","pjsip set logger on"]);
 cmd(&["exec-bg","b","python3","/lab/pjsua.py","b","1002","10.77.0.10"]);
 cmd(&["exec-bg","a","python3","/lab/pjsua.py","a","1001","10.77.0.10"]);
 wait(||{let s=cmd(&["exec","pbx","asterisk","-rx","pjsip show contacts"]);s.contains("1001/sip:")&&s.contains("1002/sip:")});
 cmd(&["exec","a","timeout","5","sh","-c","printf 'm\\nsip:1002@10.77.0.10\\n' > /out/a.fifo"]);
 wait(||cmd(&["exec","pbx","asterisk","-rx","core show channels concise"]).matches("!Up!").count()>=2);
 thread::sleep(Duration::from_secs(20));
 for n in ["a","b"]{let c=format!("printf 'q\\n' > /out/{n}.fifo");cmd(&["exec",n,"timeout","5","sh","-c",&c]);}
 wait(||fs::metadata("artifacts/a.wav").is_ok()&&fs::metadata("artifacts/b.wav").is_ok());
 thread::sleep(Duration::from_secs(3));wav("artifacts/a.wav");wav("artifacts/b.wav");
 fs::write("artifacts/voip-surrogate.json","{\"pjsua_baseline\":\"pass\",\"rust_sut\":\"not_run\",\"identity_correlation\":\"not_measured\",\"mos\":\"not_measured\"}\n").unwrap();
}
```

### compose.double.yml

```yaml
services:
  ra:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '1'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      lana:
        ipv4_address: 10.77.1.1
      transit:
        ipv4_address: 10.77.10.2
    environment:
      ROLE: router
      LAN_IP: 10.77.1.1
      WAN_IP: 10.77.10.2
      LAN_CIDR: 10.77.1.0/24
      GW: 10.77.10.1
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD
      - test
      - -f
      - /run/lab.ready
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
  cga:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '1'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      transit:
        ipv4_address: 10.77.10.1
      wan:
        ipv4_address: 10.77.0.4
    environment:
      ROLE: router
      LAN_IP: 10.77.10.1
      WAN_IP: 10.77.0.4
      LAN_CIDR: 10.77.10.0/24
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD
      - test
      - -f
      - /run/lab.ready
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
  rb:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '1'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      lanb:
        ipv4_address: 10.77.2.1
      wan:
        ipv4_address: 10.77.0.3
    environment:
      ROLE: router
      LAN_IP: 10.77.2.1
      WAN_IP: 10.77.0.3
      LAN_CIDR: 10.77.2.0/24
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD
      - test
      - -f
      - /run/lab.ready
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
  a:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      lana:
        ipv4_address: 10.77.1.10
    environment:
      ROLE: endpoint
      GW: 10.77.1.1
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD
      - test
      - -f
      - /run/lab.ready
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
  b:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      lanb:
        ipv4_address: 10.77.2.10
    environment:
      ROLE: endpoint
      GW: 10.77.2.1
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD
      - test
      - -f
      - /run/lab.ready
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
  obs1:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      wan:
        ipv4_address: 10.77.0.20
    environment:
      ROLE: endpoint
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD-SHELL
      - test -f /run/lab.ready && ss -H -lun | grep -q ':9000 '
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
    command:
    - netprobe
    - serve
  obs2:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      wan:
        ipv4_address: 10.77.0.21
    environment:
      ROLE: endpoint
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD-SHELL
      - test -f /run/lab.ready && ss -H -lun | grep -q ':9000 '
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
    command:
    - netprobe
    - serve
  turn:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      wan:
        ipv4_address: 10.77.0.30
    environment:
      ROLE: endpoint
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD-SHELL
      - test -f /run/lab.ready && ss -H -lun | grep -q ':3478 '
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
    command:
    - turnserver
    - -c
    - /lab-config/coturn.conf
  pbx:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      wan:
        ipv4_address: 10.77.0.10
    environment:
      ROLE: endpoint
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    - ./config/asterisk/pjsip.conf:/etc/asterisk/pjsip.conf:ro
    - ./config/asterisk/extensions.conf:/etc/asterisk/extensions.conf:ro
    - ./config/asterisk/rtp.conf:/etc/asterisk/rtp.conf:ro
    healthcheck:
      test:
      - CMD-SHELL
      - test -f /run/lab.ready && asterisk -rx "core waitfullybooted"
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
    command:
    - asterisk
    - -f
    - -vvv
networks:
  wan:
    driver: bridge
    internal: true
    enable_ipv6: false
    driver_opts:
      com.docker.network.bridge.enable_ip_masquerade: 'false'
      com.docker.network.bridge.inhibit_ipv4: 'true'
      com.docker.network.bridge.enable_icc: 'true'
    ipam:
      config:
      - subnet: 10.77.0.0/24
        gateway: 10.77.0.254
  lana:
    driver: bridge
    internal: true
    enable_ipv6: false
    driver_opts:
      com.docker.network.bridge.enable_ip_masquerade: 'false'
      com.docker.network.bridge.inhibit_ipv4: 'true'
      com.docker.network.bridge.enable_icc: 'true'
    ipam:
      config:
      - subnet: 10.77.1.0/24
        gateway: 10.77.1.254
  lanb:
    driver: bridge
    internal: true
    enable_ipv6: false
    driver_opts:
      com.docker.network.bridge.enable_ip_masquerade: 'false'
      com.docker.network.bridge.inhibit_ipv4: 'true'
      com.docker.network.bridge.enable_icc: 'true'
    ipam:
      config:
      - subnet: 10.77.2.0/24
        gateway: 10.77.2.254
  transit:
    driver: bridge
    internal: true
    enable_ipv6: false
    driver_opts:
      com.docker.network.bridge.enable_ip_masquerade: 'false'
      com.docker.network.bridge.inhibit_ipv4: 'true'
      com.docker.network.bridge.enable_icc: 'true'
    ipam:
      config:
      - subnet: 10.77.10.0/24
        gateway: 10.77.10.254
```

### compose.iroh.yml

```yaml
services:
  iroh-relay:
    image: natlab-iroh:local
    init: true
    cap_drop: [ALL]
    cap_add: [NET_ADMIN, NET_RAW, DAC_OVERRIDE]
    security_opt: [no-new-privileges:true]
    environment: {ROLE: endpoint}
    networks:
      wan: {ipv4_address: 10.77.0.40}
    sysctls:
      net.ipv4.ip_forward: "0"
      net.ipv4.conf.all.rp_filter: "0"
      net.ipv4.conf.default.rp_filter: "0"
      net.ipv6.conf.all.disable_ipv6: "1"
      net.ipv6.conf.default.disable_ipv6: "1"
    volumes:
      - ./artifacts:/out
      - ./config:/lab-config:ro
    command: [iroh-relay, --dev, --config-path, /lab-config/iroh-dev.toml]
    healthcheck:
      test: [CMD, curl, --noproxy, '*', --fail, --silent, http://10.77.0.40:3340/healthz]
      interval: 2s
      timeout: 2s
      retries: 60
```

### compose.private.yml

```yaml
services:
  ra:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '1'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      lana:
        ipv4_address: 10.77.1.1
      wan:
        ipv4_address: 10.77.0.2
    environment:
      ROLE: router
      LAN_IP: 10.77.1.1
      WAN_IP: 10.77.0.2
      LAN_CIDR: 10.77.1.0/24
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD
      - test
      - -f
      - /run/lab.ready
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
  rb:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '1'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      lanb:
        ipv4_address: 10.77.2.1
      wan:
        ipv4_address: 10.77.0.3
    environment:
      ROLE: router
      LAN_IP: 10.77.2.1
      WAN_IP: 10.77.0.3
      LAN_CIDR: 10.77.2.0/24
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD
      - test
      - -f
      - /run/lab.ready
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
  a:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      lana:
        ipv4_address: 10.77.1.10
    environment:
      ROLE: endpoint
      GW: 10.77.1.1
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD
      - test
      - -f
      - /run/lab.ready
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
  b:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      lanb:
        ipv4_address: 10.77.2.10
    environment:
      ROLE: endpoint
      GW: 10.77.2.1
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD
      - test
      - -f
      - /run/lab.ready
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
  obs1:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      wan:
        ipv4_address: 10.77.0.20
    environment:
      ROLE: endpoint
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD-SHELL
      - test -f /run/lab.ready && ss -H -lun | grep -q ':9000 '
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
    command:
    - netprobe
    - serve
  obs2:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      wan:
        ipv4_address: 10.77.0.21
    environment:
      ROLE: endpoint
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD-SHELL
      - test -f /run/lab.ready && ss -H -lun | grep -q ':9000 '
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
    command:
    - netprobe
    - serve
  turn:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      wan:
        ipv4_address: 10.77.0.30
    environment:
      ROLE: endpoint
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD-SHELL
      - test -f /run/lab.ready && ss -H -lun | grep -q ':3478 '
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
    command:
    - turnserver
    - -c
    - /lab-config/coturn.conf
  pbx:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      lana:
        ipv4_address: 10.77.1.20
    environment:
      ROLE: endpoint
      GW: 10.77.1.1
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    - ./config/asterisk/pjsip.private.conf:/etc/asterisk/pjsip.conf:ro
    - ./config/asterisk/extensions.conf:/etc/asterisk/extensions.conf:ro
    - ./config/asterisk/rtp.conf:/etc/asterisk/rtp.conf:ro
    healthcheck:
      test:
      - CMD-SHELL
      - test -f /run/lab.ready && asterisk -rx "core waitfullybooted"
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
    command:
    - asterisk
    - -f
    - -vvv
networks:
  wan:
    driver: bridge
    internal: true
    enable_ipv6: false
    driver_opts:
      com.docker.network.bridge.enable_ip_masquerade: 'false'
      com.docker.network.bridge.inhibit_ipv4: 'true'
      com.docker.network.bridge.enable_icc: 'true'
    ipam:
      config:
      - subnet: 10.77.0.0/24
        gateway: 10.77.0.254
  lana:
    driver: bridge
    internal: true
    enable_ipv6: false
    driver_opts:
      com.docker.network.bridge.enable_ip_masquerade: 'false'
      com.docker.network.bridge.inhibit_ipv4: 'true'
      com.docker.network.bridge.enable_icc: 'true'
    ipam:
      config:
      - subnet: 10.77.1.0/24
        gateway: 10.77.1.254
  lanb:
    driver: bridge
    internal: true
    enable_ipv6: false
    driver_opts:
      com.docker.network.bridge.enable_ip_masquerade: 'false'
      com.docker.network.bridge.inhibit_ipv4: 'true'
      com.docker.network.bridge.enable_icc: 'true'
    ipam:
      config:
      - subnet: 10.77.2.0/24
        gateway: 10.77.2.254
```

### compose.single.yml

```yaml
services:
  ra:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '1'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      lana:
        ipv4_address: 10.77.1.1
      wan:
        ipv4_address: 10.77.0.2
    environment:
      ROLE: router
      LAN_IP: 10.77.1.1
      WAN_IP: 10.77.0.2
      LAN_CIDR: 10.77.1.0/24
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD
      - test
      - -f
      - /run/lab.ready
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
  rb:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '1'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      lanb:
        ipv4_address: 10.77.2.1
      wan:
        ipv4_address: 10.77.0.3
    environment:
      ROLE: router
      LAN_IP: 10.77.2.1
      WAN_IP: 10.77.0.3
      LAN_CIDR: 10.77.2.0/24
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD
      - test
      - -f
      - /run/lab.ready
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
  a:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      lana:
        ipv4_address: 10.77.1.10
    environment:
      ROLE: endpoint
      GW: 10.77.1.1
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD
      - test
      - -f
      - /run/lab.ready
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
  b:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      lanb:
        ipv4_address: 10.77.2.10
    environment:
      ROLE: endpoint
      GW: 10.77.2.1
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD
      - test
      - -f
      - /run/lab.ready
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
  obs1:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      wan:
        ipv4_address: 10.77.0.20
    environment:
      ROLE: endpoint
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD-SHELL
      - test -f /run/lab.ready && ss -H -lun | grep -q ':9000 '
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
    command:
    - netprobe
    - serve
  obs2:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      wan:
        ipv4_address: 10.77.0.21
    environment:
      ROLE: endpoint
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD-SHELL
      - test -f /run/lab.ready && ss -H -lun | grep -q ':9000 '
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
    command:
    - netprobe
    - serve
  turn:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      wan:
        ipv4_address: 10.77.0.30
    environment:
      ROLE: endpoint
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD-SHELL
      - test -f /run/lab.ready && ss -H -lun | grep -q ':3478 '
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
    command:
    - turnserver
    - -c
    - /lab-config/coturn.conf
  pbx:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      wan:
        ipv4_address: 10.77.0.10
    environment:
      ROLE: endpoint
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    - ./config/asterisk/pjsip.conf:/etc/asterisk/pjsip.conf:ro
    - ./config/asterisk/extensions.conf:/etc/asterisk/extensions.conf:ro
    - ./config/asterisk/rtp.conf:/etc/asterisk/rtp.conf:ro
    healthcheck:
      test:
      - CMD-SHELL
      - test -f /run/lab.ready && asterisk -rx "core waitfullybooted"
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
    command:
    - asterisk
    - -f
    - -vvv
networks:
  wan:
    driver: bridge
    internal: true
    enable_ipv6: false
    driver_opts:
      com.docker.network.bridge.enable_ip_masquerade: 'false'
      com.docker.network.bridge.inhibit_ipv4: 'true'
      com.docker.network.bridge.enable_icc: 'true'
    ipam:
      config:
      - subnet: 10.77.0.0/24
        gateway: 10.77.0.254
  lana:
    driver: bridge
    internal: true
    enable_ipv6: false
    driver_opts:
      com.docker.network.bridge.enable_ip_masquerade: 'false'
      com.docker.network.bridge.inhibit_ipv4: 'true'
      com.docker.network.bridge.enable_icc: 'true'
    ipam:
      config:
      - subnet: 10.77.1.0/24
        gateway: 10.77.1.254
  lanb:
    driver: bridge
    internal: true
    enable_ipv6: false
    driver_opts:
      com.docker.network.bridge.enable_ip_masquerade: 'false'
      com.docker.network.bridge.inhibit_ipv4: 'true'
      com.docker.network.bridge.enable_icc: 'true'
    ipam:
      config:
      - subnet: 10.77.2.0/24
        gateway: 10.77.2.254
```

### compose.sut.example.yml

```yaml
# Merge with ONE topology. Run: docker compose -p natlab-single -f compose.single.yml -f compose.sut.example.yml ...
services:
  sut-a:
    build:
      context: .
      dockerfile: Dockerfile.sut
    image: natlab-sut:local
    init: true
    network_mode: service:a
    depends_on:
      a: {condition: service_healthy}
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    user: "1000:1000"
    working_dir: /work
    environment:
      CARGO_HOME: /cargo
      CARGO_TARGET_DIR: /target
      RUST_LOG: info
      LAB_NODE: a
      LAB_ARTIFACTS: /out
    volumes:
      - ${SUT_ROOT:?Set SUT_ROOT to actual project root}:/work:ro
      - ./artifacts:/out
      - ./cache/cargo-a:/cargo
      - ./cache/target-a:/target
    command: [sleep, infinity]
  sut-b:
    image: natlab-sut:local
    init: true
    network_mode: service:b
    depends_on:
      b: {condition: service_healthy}
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    user: "1000:1000"
    working_dir: /work
    environment:
      CARGO_HOME: /cargo
      CARGO_TARGET_DIR: /target
      RUST_LOG: info
      LAB_NODE: b
      LAB_ARTIFACTS: /out
    volumes:
      - ${SUT_ROOT:?Set SUT_ROOT}:/work:ro
      - ./artifacts:/out
      - ./cache/cargo-b:/cargo
      - ./cache/target-b:/target
    command: [sleep, infinity]
```

### compose.timeout.example.yml

```yaml
# Merge with a topology; recreate ra before the scenario; current flows must be absent.
services:
  ra:
    sysctls:
      net.netfilter.nf_conntrack_udp_timeout: "10"
      net.netfilter.nf_conntrack_udp_timeout_stream: "10"
```

### compose.turn-tls.yml

```yaml
services:
  turn:
    command: [turnserver, -c, /lab-config/coturn.tls.conf]
```

### config/asterisk/extensions.conf

```text
[general]
static=yes
writeprotect=yes
[lab]
exten => _100[12],1,Dial(PJSIP/${EXTEN},45)
 same => n,Hangup()
exten => 600,1,Answer()
 same => n,Echo()
 same => n,Hangup()
```

### config/asterisk/pjsip.conf

```text
[global]
type=global
user_agent=natlab

[transport-udp]
type=transport
protocol=udp
bind=0.0.0.0:5060

[transport-tcp]
type=transport
protocol=tcp
bind=0.0.0.0:5060

[endpoint-common](!)
type=endpoint
context=lab
disallow=all
allow=ulaw
allow=alaw
direct_media=no
rtp_symmetric=yes
force_rport=yes
rewrite_contact=yes

[1001](endpoint-common)
auth=auth1001
aors=1001
[auth1001]
type=auth
auth_type=userpass
username=1001
password=lab-1001
[1001]
type=aor
max_contacts=1
remove_existing=yes
qualify_frequency=10

[1002](endpoint-common)
auth=auth1002
aors=1002
[auth1002]
type=auth
auth_type=userpass
username=1002
password=lab-1002
[1002]
type=aor
max_contacts=1
remove_existing=yes
qualify_frequency=10
```

### config/asterisk/pjsip.private.conf

```text
[global]
type=global
user_agent=natlab

[transport-udp]
type=transport
protocol=udp
bind=0.0.0.0:5060
local_net=10.77.1.0/24
external_signaling_address=10.77.0.2
external_media_address=10.77.0.2

[transport-tcp]
type=transport
protocol=tcp
bind=0.0.0.0:5060
local_net=10.77.1.0/24
external_signaling_address=10.77.0.2
external_media_address=10.77.0.2

[endpoint-common](!)
type=endpoint
context=lab
disallow=all
allow=ulaw
allow=alaw
direct_media=no
rtp_symmetric=yes
force_rport=yes
rewrite_contact=yes

[1001](endpoint-common)
auth=auth1001
aors=1001
[auth1001]
type=auth
auth_type=userpass
username=1001
password=lab-1001
[1001]
type=aor
max_contacts=1
remove_existing=yes
qualify_frequency=10

[1002](endpoint-common)
auth=auth1002
aors=1002
[auth1002]
type=auth
auth_type=userpass
username=1002
password=lab-1002
[1002]
type=aor
max_contacts=1
remove_existing=yes
qualify_frequency=10
```

### config/asterisk/rtp.conf

```text
[general]
rtpstart=10000
rtpend=10199
icesupport=no
```

### config/coturn.conf

```text
listening-ip=10.77.0.30
relay-ip=10.77.0.30
listening-port=3478
min-port=50000
max-port=50199
fingerprint
lt-cred-mech
realm=lab
user=lab:lab-secret
no-cli
no-tls
no-dtls
# Deliberate closed-lab private peer destinations; not a production security template.
log-file=stdout
simple-log
verbose
```

### config/fixture.json

```json
{
  "wan": "10.77.0.2",
  "client_cidr": "10.77.1.0/24",
  "flows": [
    {
      "src": "10.77.1.10",
      "sport": 42000,
      "dst": "10.77.0.20",
      "dport": 9000
    },
    {
      "src": "10.77.1.10",
      "sport": 42000,
      "dst": "10.77.0.20",
      "dport": 9001
    },
    {
      "src": "10.77.1.10",
      "sport": 42000,
      "dst": "10.77.0.21",
      "dport": 9000
    }
  ]
}
```

### config/iroh-dev.toml

```toml
# --dev, relay-only baseline; deliberately no QUIC address discovery / no HTTPS.
http_bind_addr = "0.0.0.0:3340"
enable_relay = true
enable_metrics = true
metrics_bind_addr = "0.0.0.0:9090"
enable_quic_addr_discovery = false
```

### config/iroh-tls.example.toml

```toml
# Validate against the PINNED iroh-relay source/CLI before qualification.
# Run WITHOUT --dev. Use explicit client trust + hostname relay.lab -> 10.77.0.40.
http_bind_addr = "0.0.0.0:80"
enable_relay = true
enable_metrics = true
metrics_bind_addr = "0.0.0.0:9090"
enable_quic_addr_discovery = true
quic_bind_addr = "0.0.0.0:7842"
[tls]
https_bind_addr = "0.0.0.0:443"
hostname = "relay.lab"
cert_mode = "Manual"
manual_cert_path = "/lab-config/tls/relay.crt"
manual_key_path = "/lab-config/tls/relay.key"
```

### config/private-pbx-transport.txt

```text
# In config/asterisk/pjsip.conf add the following lines to EACH [transport-*] section,
# BEFORE the next section header; remove again before using single/double.
local_net=10.77.1.0/24
external_signaling_address=10.77.0.2
external_media_address=10.77.0.2
```

### lab

```text
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
variant=${LAB_VARIANT:-single}
case "$variant" in single|double|private) ;; *) echo 'Invalid LAB_VARIANT' >&2; exit 2;; esac
export LAB_VARIANT="$variant"
project="natlab-${variant}"
dc=(docker compose -p "$project" -f "compose.${variant}.yml")
case "${1:-help}" in
 build) docker build -t natlab-node:local .;;
 pjsua-build) docker build -f Dockerfile.pjsua -t natlab-pjsua:local .;;
 up) mkdir -p artifacts; chmod 1777 artifacts; "${dc[@]}" up -d --wait --wait-timeout 180;;
 down) "${dc[@]}" down --remove-orphans;;
 config) "${dc[@]}" config;;
 ps) "${dc[@]}" ps;;
 exec) shift; "${dc[@]}" exec -T "$@";;
 exec-bg) shift; "${dc[@]}" exec -T -d "$@";;
 logs) "${dc[@]}" logs --no-color --timestamps;;
 test) cargo test --manifest-path accept/Cargo.toml --offline -- --nocapture --test-threads=1;;
 capture-start|capture-stop)
  action=${1#capture-}
  for s in $("${dc[@]}" config --services); do
   "${dc[@]}" exec -T "$s" /lab/capture.sh "$action" "$variant-$s"
  done;;
 collect)
  mkdir -p artifacts/state
  docker version >artifacts/state/docker-version.txt
  docker info >artifacts/state/docker-info.txt
  docker compose version >artifacts/state/compose-version.txt
  "${dc[@]}" config >artifacts/state/resolved-compose.yml
  "${dc[@]}" logs --no-color --timestamps >artifacts/state/compose.log 2>&1
  for s in $("${dc[@]}" config --services); do
   "${dc[@]}" exec -T "$s" /lab/state.sh >"artifacts/state/$s.txt" 2>&1 || true
   id=$("${dc[@]}" ps -q "$s"); docker inspect "$id" >"artifacts/state/$s.inspect.json"
  done
  docker image inspect natlab-node:local >artifacts/state/image.json
  ;;
 smoke)
  "$0" capture-start
  set +e
  "$0" test >artifacts/acceptance.log 2>&1; rc=$?
  "$0" collect; "$0" capture-stop
  exit "$rc";;
 *) echo './lab {build|pjsua-build|up|down|config|ps|exec SERVICE CMD...|exec-bg SERVICE CMD...|logs|test|capture-start|capture-stop|collect|smoke}' >&2; exit 2;;
esac
```

### probe/Cargo.toml

```toml
[package]
name = "netprobe"
version = "0.1.0"
edition = "2021"
```

### probe/src/main.rs

```rust
use std::{env,io::{Read,Write},net::{TcpListener,TcpStream,UdpSocket},thread,time::{Duration,Instant}};
fn server(){
    for port in [9000,9001] {
        let u=UdpSocket::bind(("0.0.0.0",port)).unwrap();
        thread::spawn(move|| {let mut b=[0u8;65535]; loop {
            let (n,peer)=u.recv_from(&mut b).unwrap();
            let mut v=format!("{}|",peer).into_bytes();v.extend_from_slice(&b[..n]);
            u.send_to(&v,peer).unwrap();
        }});
        let l=TcpListener::bind(("0.0.0.0",port)).unwrap();
        thread::spawn(move||for c in l.incoming(){thread::spawn(move|| {
            let mut c=c.unwrap(); let mut b=[0u8;65536];
            loop{match c.read(&mut b){Ok(0)|Err(_)=>break,Ok(n)=>{if c.write_all(&b[..n]).is_err(){break}}}}
        });});
    }
    loop {thread::park();}
}
fn udp(a:&[String]){
    let dst=&a[2];let source:u16=a[3].parse().unwrap();
    let count:u64=a[4].parse().unwrap();let gap:u64=a[5].parse().unwrap();
    let u=UdpSocket::bind(("0.0.0.0",source)).unwrap();
    u.set_read_timeout(Some(Duration::from_millis(700))).unwrap();
    let mut good=0;let mut rtts=vec![];let mut observed=String::new();let mut b=[0u8;65535];
    for seq in 0..count{
        let msg=format!("natlab-{seq:08}");let start=Instant::now();
        u.send_to(msg.as_bytes(),dst).unwrap();
        let deadline=start+Duration::from_millis(700);
        while Instant::now()<deadline {
            match u.recv_from(&mut b){Ok((n,_))=>{
                let x=String::from_utf8_lossy(&b[..n]);
                if let Some((p,body))=x.split_once('|') {if body==msg {
                    observed=p.to_string();good+=1;rtts.push(start.elapsed().as_secs_f64()*1000.0);break;
                }}
            },Err(_)=>break}
        }
        thread::sleep(Duration::from_millis(gap));
    }
    rtts.sort_by(|a,b|a.total_cmp(b));
    let p95=if rtts.is_empty(){0.0}else{rtts[((rtts.len()-1) as f64*0.95).ceil() as usize]};
    println!("{{\"protocol\":\"udp\",\"sent\":{count},\"received\":{good},\"observed\":\"{observed}\",\"rtt_p95_ms\":{p95:.3}}}");
    if good!=count{std::process::exit(1)}
}
fn tcp(a:&[String]){
    let dst=a[2].parse().unwrap();let len:usize=a[3].parse().unwrap();
    let mut c=TcpStream::connect_timeout(&dst,Duration::from_secs(3)).unwrap();
    c.set_read_timeout(Some(Duration::from_secs(10))).unwrap();
    c.set_write_timeout(Some(Duration::from_secs(10))).unwrap();
    let p:Vec<u8>=(0..len).map(|i|(i%251)as u8).collect();let expected=p.clone();
    let mut writer=c.try_clone().unwrap(); let start=Instant::now();
    let t=thread::spawn(move||writer.write_all(&p).unwrap());
    let mut got=vec![0;len];c.read_exact(&mut got).unwrap();t.join().unwrap();assert_eq!(got,expected);
    println!("{{\"protocol\":\"tcp\",\"bytes\":{len},\"integrity\":true,\"elapsed_ms\":{:.3}}}",start.elapsed().as_secs_f64()*1000.0);
}
fn main(){let a:Vec<_>=env::args().collect();match a.get(1).map(String::as_str){
    Some("serve")=>server(),Some("udp")=>udp(&a),Some("tcp")=>tcp(&a),
    _=>{eprintln!("netprobe serve | udp DEST_IP:PORT SOURCE_PORT COUNT GAP_MS | tcp DEST_IP:PORT BYTES");std::process::exit(2)}
}}
```

### requirements.txt

```text
PyYAML>=6,<7
```

### scripts/capture.sh

```sh
#!/bin/sh
set -eu
cmd=${1:?start|stop}; name=${2:-capture}
case "$name" in *[!a-zA-Z0-9_-]*|'') exit 2;; esac
case "$cmd" in
 start)
  test ! -e /run/capture.pid
  # No payload truncation; bounded capture ring; namespace-local visibility.
  tcpdump -i any -s 0 -U -B 8192 -C 32 -W 8 -w "/out/$name.pcap" \
    >/out/"$name".tcpdump.stdout 2>/out/"$name".tcpdump.stderr &
  pid=$!; echo "$pid" >/run/capture.pid
  sleep 1; kill -0 "$pid"
  ;;
 stop)
  if [ -f /run/capture.pid ]; then
   pid=$(cat /run/capture.pid); kill -INT "$pid" 2>/dev/null || true
   for i in $(seq 1 50); do kill -0 "$pid" 2>/dev/null || break; sleep .1; done
   rm -f /run/capture.pid
  fi
  ;;
 *) exit 2;;
esac
```

### scripts/check-audio.py

```python
#!/usr/bin/env python3
# Baseline only: non-silence / duration / clipping, not MOS/POLQA or identity verification.
import wave,array,json,math,sys
out=[]
for path in sys.argv[1:]:
    with wave.open(path,'rb') as w:
        assert w.getsampwidth()==2 and w.getnchannels()==1
        rate=w.getframerate();v=array.array('h',w.readframes(w.getnframes()))
    if sys.byteorder!='little': v.byteswap()
    rms=math.sqrt(sum(x*x for x in v)/max(1,len(v)))
    result={'file':path,'duration_s':len(v)/rate,'rms':rms,'clipped_fraction':sum(abs(x)>=32760 for x in v)/max(1,len(v))}
    result['pass']=result['duration_s']>=10 and rms>=100 and result['clipped_fraction']<0.01
    out.append(result)
print(json.dumps(out,indent=2))
if not all(x['pass'] for x in out):sys.exit(1)
```

### scripts/fixture-nat.py

```python
#!/usr/bin/env python3
# Generate finite-universe UDP EIM or APDM + APDF fixture. Apply ONLY inside a router.
# Required: fixed client source ports; no collisions; no unlisted traffic. Not general NAT.
import sys,json,ipaddress
mode=sys.argv[1]; cfg=json.load(open(sys.argv[2]))
assert mode in ['eim','apdm']
wan=str(ipaddress.ip_address(cfg['wan']))
flows=cfg['flows'];seen=set();slots={};rules=[];nextport=44000
for f in flows:
    src=str(ipaddress.ip_address(f['src']));sport=int(f['sport'])
    dst=str(ipaddress.ip_address(f['dst']));dport=int(f['dport'])
    assert 1<=sport<=65535 and 1<=dport<=65535
    key=(src,sport) if mode=='eim' else (src,sport,dst,dport)
    if key not in slots: slots[key]=nextport;nextport+=1
    assert nextport<65000
    flow=(src,sport,dst,dport);assert flow not in seen;seen.add(flow)
    rules.append(f'ip saddr {src} udp sport {sport} ip daddr {dst} udp dport {dport} counter snat to {wan}:{slots[key]}')
# Separate priority earlier than baseline NAT. Explicit unmatched UDP drop prevents fallback.
print('table ip fixture_nat {')
print(' chain post { type nat hook postrouting priority 90; policy accept;')
for r in rules: print('  '+r)
print(' }\n}')
print('table inet fixture_allow {')
print(' chain forward { type filter hook forward priority -10; policy accept;')
print('  ct state established,related accept')
for f in flows:
    print(f"  ip saddr {f['src']} udp sport {int(f['sport'])} ip daddr {f['dst']} udp dport {int(f['dport'])} accept")
# ACCEPT here cannot bypass later baseline APDF DROP. Reverse unsolicited packets stay blocked.
print(f'  ip saddr {cfg["client_cidr"]} meta l4proto udp counter drop')
print(' }\n}')
```

### scripts/link.sh

```sh
#!/bin/sh
set -eu
direction=${1:?lan|wan}; shift
case "$direction" in lan) dev=$(cat /run/lan.if);; wan) dev=$(cat /run/wan.if);; *) exit 2;; esac
if [ "${1:-}" = clear ]; then tc qdisc del dev "$dev" root 2>/dev/null || true
else tc qdisc replace dev "$dev" root netem "$@"; fi
tc -s qdisc show dev "$dev"
```

### scripts/make-tone.py

```python
#!/usr/bin/env python3
import wave,struct,math
from pathlib import Path
p=Path(__file__).resolve().parent.parent/'config'/'tone.wav'
with wave.open(str(p),'wb') as w:
    w.setnchannels(1);w.setsampwidth(2);w.setframerate(8000)
    w.writeframes(b''.join(struct.pack('<h',int(6000*(math.sin(2*math.pi*440*i/8000)+0.4*math.sin(2*math.pi*701*i/8000)))) for i in range(8000*3)))
```

### scripts/node.sh

```sh
#!/bin/sh
set -eu
umask 022
rm -f /run/lab.ready
mkdir -p /out
# No host networking, no host sysctl/firewall manipulation. Discover interfaces by IP.
iface() { ip -o -4 addr show | awk -v a="$1" '{split($4,b,"/");if(b[1]==a){print $2;exit}}'; }
# Never let Docker's gateway select the experimental path.
while ip -4 route del default 2>/dev/null; do :; done
if [ -n "${GW:-}" ]; then ip -4 route add default via "$GW"; fi
printf 'nameserver 10.77.0.53\noptions attempts:1 timeout:1\n' >/etc/resolv.conf
# Disable NIC offloads where supported. Record failures; never silently claim wire fidelity.
for dev in $(ip -o link show | awk -F': ' '{split($2,a,"@");if(a[1]!="lo") print a[1]}'); do
  ethtool -K "$dev" gro off gso off tso off lro off 2>>/out/offload-errors.log || true
done
nft -f - <<'EOF'
flush ruleset
table inet labguard {
 chain output {
  type filter hook output priority 0; policy drop;
  ip daddr 127.0.0.11 counter drop
  oifname "lo" accept
  ip daddr 10.77.0.0/16 accept
 }
}
EOF
if [ "${ROLE:-endpoint}" = router ]; then
  : "${LAN_IP:?}" "${WAN_IP:?}" "${LAN_CIDR:?}"
  LAN_IF=$(iface "$LAN_IP"); WAN_IF=$(iface "$WAN_IP")
  test -n "$LAN_IF"; test -n "$WAN_IF"
  printf '%s\n' "$LAN_IF" >/run/lan.if
  printf '%s\n' "$WAN_IF" >/run/wan.if
  nft -f - <<EOF
 table inet labfilter {
  chain forward {
   type filter hook forward priority 0; policy drop;
   ct state invalid counter drop
   ct state established,related counter accept
   iifname "$LAN_IF" oifname "$WAN_IF" ip saddr $LAN_CIDR counter accept
  }
 }
 table ip labnat {
  chain prerouting { type nat hook prerouting priority dstnat; policy accept; }
  chain postrouting {
   type nat hook postrouting priority srcnat; policy accept;
   ip saddr $LAN_CIDR oifname "$WAN_IF" counter snat to $WAN_IP
  }
 }
EOF
fi
# IPv4 reference lab: IPv6 disabled via Compose sysctls, not left as a bypass.
touch /run/lab.ready
exec "$@"
```

### scripts/pjsua.py

```python
#!/usr/bin/env python3
import os, sys, subprocess, signal, time, threading
node, user, server = sys.argv[1:4]
base='/out/'+node
fifo=base+'.fifo'
try: os.unlink(fifo)
except FileNotFoundError: pass
os.mkfifo(fifo,0o666)
args=['pjsua','--null-audio','--local-port=5060','--rtp-port=4000',
      '--id=sip:'+user+'@'+server,'--registrar=sip:'+server,
      '--realm=lab','--username='+user,'--password=lab-'+user,
      '--auto-answer=200','--max-calls=1', '--log-level=5',
      '--play-file=/lab-config/tone.wav','--auto-play',
      '--rec-file='+base+'.wav','--auto-rec']
log=open(base+'.pjsua.log','wb',buffering=0)
p=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=log,stderr=subprocess.STDOUT)
open(base+'.pid','w').write(str(os.getpid()))
def pump():
    # Open RDWR: no EOF between command writers; commands use legacy pjsua CLI.
    fd=os.open(fifo,os.O_RDWR)
    while p.poll() is None:
        data=os.read(fd,4096)
        if data:
            try: p.stdin.write(data); p.stdin.flush()
            except BrokenPipeError: return
threading.Thread(target=pump,daemon=True).start()
def stop(*_):
    if p.poll() is None:
        try: p.stdin.write(b'q\n'); p.stdin.flush(); p.wait(timeout=10)
        except (BrokenPipeError,subprocess.TimeoutExpired): p.terminate()
signal.signal(signal.SIGTERM,stop); signal.signal(signal.SIGINT,stop)
try: sys.exit(p.wait())
finally:
    log.close()
    try: os.unlink(fifo)
    except FileNotFoundError: pass
```

### scripts/policy.sh

```sh
#!/bin/sh
set -eu
: "${ROLE:?}"
test "$ROLE" = router
case "${1:?normal|cut|udp-block|udp-timeout|clear}" in
 normal)
  nft delete table inet fault 2>/dev/null || true
  ;;
 cut)
  nft delete table inet fault 2>/dev/null || true
  nft -f - <<'EOF'
table inet fault {
 chain forward { type filter hook forward priority -50; policy drop; counter drop; }
}
EOF
  ;;
 udp-block)
  nft delete table inet fault 2>/dev/null || true
  nft -f - <<'EOF'
table inet fault {
 chain forward { type filter hook forward priority -50; policy accept; meta l4proto udp counter drop; }
}
EOF
  ;;
 udp-timeout)
  echo 'Recreate router with namespace sysctls net.netfilter.nf_conntrack_udp_timeout and net.netfilter.nf_conntrack_udp_timeout_stream; no /proc/sys write bypass.' >&2
  exit 2
  ;;
 clear) conntrack -F;;
 *) exit 2;;
esac
```

### scripts/private-pbx.sh

```sh
#!/bin/sh
set -eu
# Execute inside ra, private topology only; maps SIP UDP/TCP and RTP port-preservingly.
wan=$(cat /run/wan.if)
nft add rule ip labnat prerouting iifname "$wan" ip daddr 10.77.0.2 udp dport 5060 dnat to 10.77.1.20
nft add rule ip labnat prerouting iifname "$wan" ip daddr 10.77.0.2 tcp dport 5060 dnat to 10.77.1.20
nft add rule ip labnat prerouting iifname "$wan" ip daddr 10.77.0.2 udp dport 10000-10199 dnat to 10.77.1.20
nft insert rule inet labfilter forward iifname "$wan" ip daddr 10.77.1.20 udp dport '{ 5060, 10000-10199 }' counter accept
nft insert rule inet labfilter forward iifname "$wan" ip daddr 10.77.1.20 tcp dport 5060 counter accept
```

### scripts/qualify-nat.py

```python
#!/usr/bin/env python3
# Host-side orchestrator, sequential port probes; observations only, not full RFC5780.
import subprocess,json,os
out=[]
for dst in ['10.77.0.20:9000','10.77.0.20:9001','10.77.0.21:9000']:
    p=subprocess.run(['./lab','exec','a','netprobe','udp',dst,'42000','1','0'],text=True,capture_output=True)
    if p.returncode: raise SystemExit(p.stderr or p.stdout)
    out.append({'destination':dst,**json.loads(p.stdout)})
print(json.dumps({'mapping_observations':out,'filtering':'NOT_QUALIFIED','classification':'DO_NOT_INFER'},indent=2))
```

### scripts/state.sh

```sh
#!/bin/sh
set -u
printf '\n=== CLOCK ===\n'; date -Ins
printf '\n=== ADDR ===\n'; ip -j address
printf '\n=== ROUTES ===\n'; ip -j -4 route show table all; ip rule
printf '\n=== LINK ===\n'; ip -s link
printf '\n=== SOCKETS ===\n'; ss -tunap
printf '\n=== NFT ===\n'; nft -a list ruleset
printf '\n=== TC ===\n'; tc -s qdisc show
printf '\n=== CONNTRACK ===\n'; conntrack -L -o extended 2>&1
printf '\n=== COUNTERS ===\n'; cat /proc/net/snmp; cat /proc/net/netstat
printf '\n=== OFFLOAD ===\n'
for x in /sys/class/net/*; do ethtool -k "${x##*/}" 2>&1; done
exit 0
```

### scripts/tls.sh

```sh
#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
umask 077
mkdir -p config/tls private
openssl req -x509 -newkey rsa:3072 -nodes -days 30 \
  -keyout config/tls/ca.key -out config/tls/ca.crt \
  -subj /CN=NATENV-TEST-ONLY-CA -addext 'basicConstraints=critical,CA:TRUE' \
  -addext 'keyUsage=critical,keyCertSign,cRLSign'
for pair in 'turn:10.77.0.30' 'relay:10.77.0.40' 'pbx:10.77.0.10'; do
  n=${pair%%:*}; ip=${pair#*:}
  openssl req -newkey rsa:2048 -nodes -keyout config/tls/$n.key \
    -out config/tls/$n.csr -subj "/CN=$n.lab"
  printf 'subjectAltName=DNS:%s.lab,IP:%s\nextendedKeyUsage=serverAuth\n' "$n" "$ip" >config/tls/$n.ext
  openssl x509 -req -in config/tls/$n.csr -CA config/tls/ca.crt \
    -CAkey config/tls/ca.key -CAcreateserial -days 14 \
    -extfile config/tls/$n.ext -out config/tls/$n.crt
  # Only throwaway isolated-lab service keys; CA key remains host-only below.
  chmod 644 config/tls/$n.key config/tls/$n.crt
done
# Never mount CA signing key into a container.
mv config/tls/ca.key private/ca-signing-key.DO-NOT-MOUNT
chmod 600 private/ca-signing-key.DO-NOT-MOUNT
sed '/^no-tls$/d; /^no-dtls$/d' config/coturn.conf >config/coturn.tls.conf
cat >>config/coturn.tls.conf <<'EOF'
tls-listening-port=5349
cert=/lab-config/tls/turn.crt
pkey=/lab-config/tls/turn.key
EOF

chmod 755 config/tls
chmod 644 config/tls/ca.crt
```

## Appendix B — Validation record

```json
{
  "status": "static_checks_only",
  "checks": [
    {
      "check": "shell_syntax",
      "file": "scripts/node.sh",
      "status": "pass"
    },
    {
      "check": "shell_syntax",
      "file": "scripts/capture.sh",
      "status": "pass"
    },
    {
      "check": "shell_syntax",
      "file": "scripts/state.sh",
      "status": "pass"
    },
    {
      "check": "shell_syntax",
      "file": "scripts/policy.sh",
      "status": "pass"
    },
    {
      "check": "shell_syntax",
      "file": "scripts/link.sh",
      "status": "pass"
    },
    {
      "check": "python_syntax",
      "file": "scripts/pjsua.py",
      "status": "pass"
    },
    {
      "check": "shell_syntax",
      "file": "lab",
      "status": "pass"
    },
    {
      "check": "yaml_parse",
      "file": "compose.single.yml",
      "status": "pass"
    },
    {
      "check": "yaml_parse",
      "file": "compose.double.yml",
      "status": "pass"
    },
    {
      "check": "yaml_parse",
      "file": "compose.private.yml",
      "status": "pass"
    },
    {
      "check": "yaml_parse",
      "file": "compose.sut.example.yml",
      "status": "pass"
    },
    {
      "check": "shell_syntax",
      "file": "scripts/private-pbx.sh",
      "status": "pass"
    },
    {
      "check": "python_syntax",
      "file": "scripts/qualify-nat.py",
      "status": "pass"
    },
    {
      "check": "python_syntax",
      "file": "scripts/fixture-nat.py",
      "status": "pass"
    },
    {
      "check": "python_syntax",
      "file": "scripts/check-audio.py",
      "status": "pass"
    },
    {
      "check": "yaml_parse",
      "file": "compose.timeout.example.yml",
      "status": "pass"
    },
    {
      "check": "yaml_parse",
      "file": "compose.iroh.yml",
      "status": "pass"
    },
    {
      "check": "shell_syntax",
      "file": "scripts/tls.sh",
      "status": "pass"
    },
    {
      "check": "yaml_parse",
      "file": "compose.turn-tls.yml",
      "status": "pass"
    },
    {
      "check": "topology_static_invariants",
      "variant": "single",
      "status": "pass"
    },
    {
      "check": "topology_static_invariants",
      "variant": "double",
      "status": "pass"
    },
    {
      "check": "topology_static_invariants",
      "variant": "private",
      "status": "pass"
    },
    {
      "check": "fixture_generator_apdm",
      "status": "pass"
    },
    {
      "check": "fixture_generator_eim",
      "status": "pass"
    },
    {
      "check": "rust_compile",
      "manifest": "probe/Cargo.toml",
      "status": "not_run",
      "reason": "cargo unavailable"
    },
    {
      "check": "rust_compile",
      "manifest": "accept/Cargo.toml",
      "status": "not_run",
      "reason": "cargo unavailable"
    },
    {
      "check": "docker_runtime",
      "status": "not_run",
      "reason": "No usable Docker daemon was available to this execution environment; no runtime tests claimed."
    },
    {
      "check": "python_syntax",
      "file": "scripts/make-tone.py",
      "status": "pass"
    }
  ],
  "not_certified": [
    "Docker build/runtime",
    "nft rules execution",
    "Asterisk/PJSUA calls",
    "coturn relay transfer",
    "iroh relay/client interoperation",
    "actual user Rust SUT",
    "full NAT filtering/lifetime qualification",
    "media quality SLOs"
  ]
}
```
