---
type: "Page"
title: "5. Rust SUT overlay; build isolation; external-agent control"
description: "Provide actual SUT_ROOT; prepare host-writable UID1000 cache/target directories. For another host UID adjust"
sources: 
  - resource: "sources/implementation-handbook.md"
    id: "implementation-handbook-7"
    title: "5. Rust SUT overlay; build isolation; external-agent control"
generated: 
  by: "build-okf-skill"
  at: "2026-11-14"
verified: 
  - by: "machine"
    at: "2026-11-14"
status: "stable"
stale_after: "2027-11-14"
x-content-sha256: "38743a3132b2b88a2de0c23dac153cc10c3b7481b8d0eed508813bd1c4b6a1e8"
x-source-alias: "sources/implementation-handbook.md"
x-source-span: "285-328"
x-topic: "implementation-handbook"
x-requires: 
  - "pages/implementation-handbook/3-infrastructure-acceptance-fault-injection-nat-qualification"
---
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

[^implementation-handbook-7]

[^implementation-handbook-7]: 5. Rust SUT overlay; build isolation; external-agent control — sources/implementation-handbook.md, lines 285-328.

