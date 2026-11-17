---
type: "Page"
title: "17. Product build, native dependencies, adapter contract"
description: "Build on actual target-compatible toolchain; record source SHA, lock hash, compiler, target triple, architecture, native library/codec flags, shared-library dependencies. Rust/PJSIP specifics: exact"
sources: 
  - resource: "sources/pre-okf-original.md"
    id: "pre-okf-original-19"
    title: "17. Product build, native dependencies, adapter contract"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-content-sha256: "e017a23fb9402e8347156baa42a62056902146db84a634605348fe4c37f88fdb"
x-requires: 
  - "pages/pre-okf-original/16-topology-switching-extra-nodes-dnat"
x-source-alias: "sources/pre-okf-original.md"
x-source-span: "509-526"
x-topic: "pre-okf-original"
---
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

[^pre-okf-original-19]

[^pre-okf-original-19]: 17. Product build, native dependencies, adapter contract — sources/pre-okf-original.md, lines 509-526.

