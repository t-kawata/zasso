---
type: "Page"
title: "4. PJSUA surrogate; real Rust/PJSIP client integration"
description: "Optional reference oracle, not substitute for actual Rust SIP client:"
sources: 
  - resource: "sources/implementation-handbook.md"
    id: "implementation-handbook-6"
    title: "4. PJSUA surrogate; real Rust/PJSIP client integration"
generated: 
  by: "build-okf-skill"
  at: "2026-11-14"
verified: 
  - by: "machine"
    at: "2026-11-14"
status: "stable"
stale_after: "2027-11-14"
x-content-sha256: "7e96a4eb51212f48a25dacce8dee6ede21a552032527cddd86b59b73b79168eb"
x-source-alias: "sources/implementation-handbook.md"
x-source-span: "220-284"
x-topic: "implementation-handbook"
x-requires: 
  - "pages/implementation-handbook/3-infrastructure-acceptance-fault-injection-nat-qualification"
---
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

[^implementation-handbook-6]

[^implementation-handbook-6]: 4. PJSUA surrogate; real Rust/PJSIP client integration — sources/implementation-handbook.md, lines 220-284.

