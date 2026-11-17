---
type: "Page"
title: "28. Result schemas, quality gates, repetitions"
description: "Per-run fields: ```text run_id,scenario,seed,host_os,guest_os,arch,vm/image_ids,source_shas,lock_hash, topology,nat_profile_id,qualification_hash,link_profile,resources"
sources: 
  - resource: "sources/pre-okf-original.md"
    id: "pre-okf-original-30"
    title: "28. Result schemas, quality gates, repetitions"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-content-sha256: "a5b20582cce9e5cb2ab42926dcd5018499ccd8d63ff8a7df25610d6071b798da"
x-requires: 
  - "pages/pre-okf-original/27-diagnostic-decision-tree"
x-source-alias: "sources/pre-okf-original.md"
x-source-span: "760-778"
x-topic: "pre-okf-original"
---
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

[^pre-okf-original-30]

[^pre-okf-original-30]: 28. Result schemas, quality gates, repetitions — sources/pre-okf-original.md, lines 760-778.

