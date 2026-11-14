---
type: "Page"
title: "9. Machine-verifiable quality; repetitions; final gate"
description: "Implement actual product tests primarily in Rust; external tools are evidence-producing subprocesses,"
sources: 
  - resource: "sources/implementation-handbook.md"
    id: "implementation-handbook-11"
    title: "9. Machine-verifiable quality; repetitions; final gate"
generated: 
  by: "build-okf-skill"
  at: "2026-11-14"
verified: 
  - by: "machine"
    at: "2026-11-14"
status: "stable"
stale_after: "2027-11-14"
x-content-sha256: "deefcf68cd723ccb9a6c43433c54f3ff64f4fa1ad3432cbe97e638a117cb4429"
x-source-alias: "sources/implementation-handbook.md"
x-source-span: "494-534"
x-topic: "implementation-handbook"
x-requires: 
  - "pages/implementation-handbook/3-infrastructure-acceptance-fault-injection-nat-qualification"
  - "pages/implementation-handbook/4-pjsua-surrogate-real-rust-pjsip-client-integration"
  - "pages/implementation-handbook/7-iroh-separate-local-relay-pin-api-schema-never-public-fallback"
---
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

[^implementation-handbook-11]

[^implementation-handbook-11]: 9. Machine-verifiable quality; repetitions; final gate — sources/implementation-handbook.md, lines 494-534.

