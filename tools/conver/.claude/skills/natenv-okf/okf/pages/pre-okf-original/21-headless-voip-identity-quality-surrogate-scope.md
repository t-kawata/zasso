---
type: "Page"
title: "21. Headless VoIP, identity, quality, surrogate scope"
description: "No audio device requirement if product supplies deterministic PCM source and decoded sink. Null audio supplies timing, not meaningful signal. PJSUA/PJMEDIA wiring: player/source -> call conference"
sources: 
  - resource: "sources/pre-okf-original.md"
    id: "pre-okf-original-23"
    title: "21. Headless VoIP, identity, quality, surrogate scope"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-content-sha256: "270d6046636e33d01617b58738b730f638e7ebda5b9d7fa46ea9562e492f2b70"
x-requires: 
  - "pages/pre-okf-original/20-asterisk-reference-service-and-sip"
x-source-alias: "sources/pre-okf-original.md"
x-source-span: "578-607"
x-topic: "pre-okf-original"
---
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

[^pre-okf-original-23]

[^pre-okf-original-23]: 21. Headless VoIP, identity, quality, surrogate scope — sources/pre-okf-original.md, lines 578-607.

